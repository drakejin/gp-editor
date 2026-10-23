import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayedNote } from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import {
  CHORD_WINDOW_MS,
  DEFAULT_MIDI_INPUT,
  type MidiInputSettings,
  type MidiNoteMessage,
  type MidiSource,
  type PendingChord,
  addNoteOn,
  listenedSourceIds,
  parseMidiInputSettings,
  serializeMidiInputSettings,
  toPlayedNotes,
} from '../lib/midi-input';
import { listMidiSources, listenToMidiSources, loadMidiInputSettings, saveMidiInputSettings, subscribeMidiInput } from '../native/midi-input';

export interface MidiInput {
  readonly settings: MidiInputSettings;
  readonly sources: readonly MidiSource[];
  /** How many sources are listened to now. */
  readonly listening: number;
  /** What could not be done (no MIDI server, a source that would not connect). */
  readonly error?: string;
  /** Changes the settings and keeps them in user defaults. */
  readonly changeSettings: (change: Partial<MidiInputSettings>) => void;
}

const MIDI_FAILED = 'MIDI input is not available';

/**
 * MIDI input (step entry): the settings, kept in user defaults; the Mac's MIDI sources, listed again when a device comes
 * or goes; and the notes struck — those within CHORD_WINDOW_MS of each other reach `onPlayed` together, as one chord.
 * Nothing is listened to while input is off.
 */
export function useMidiInput(onPlayed: (notes: readonly PlayedNote[]) => void): MidiInput {
  const [settings, setSettings] = useState<MidiInputSettings>(DEFAULT_MIDI_INPUT);
  const [sources, setSources] = useState<readonly MidiSource[]>([]);
  const [listening, setListening] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const latest = useRef({ settings, onPlayed });
  latest.current = { settings, onPlayed };
  const chord = useStruckChords(latest);

  const refreshSources = useCallback(() => {
    listMidiSources()
      .then(setSources)
      .catch((reason: unknown) => setError(errorMessage(reason, MIDI_FAILED)));
  }, []);

  useEffect(() => {
    loadMidiInputSettings()
      .then((json) => setSettings(parseMidiInputSettings(json)))
      .catch((reason: unknown) => setError(errorMessage(reason, MIDI_FAILED)));
    refreshSources();
  }, [refreshSources]);

  useEffect(() => subscribeMidiInput({ onNote: chord.strike, onSourcesChanged: refreshSources }), [chord, refreshSources]);

  const { isEnabled, sourceId } = settings;
  const listened = useMemo(() => listenedSourceIds({ isEnabled, sourceId }, sources), [isEnabled, sourceId, sources]);
  useEffect(() => {
    listenToMidiSources(listened)
      .then(setListening)
      .catch((reason: unknown) => setError(errorMessage(reason, MIDI_FAILED)));
  }, [listened]);
  useEffect(
    () => () => {
      // The window is closing: nothing is left to tell.
      listenToMidiSources([]).catch(() => undefined);
    },
    [],
  );

  const changeSettings = useCallback(
    (change: Partial<MidiInputSettings>) => {
      const next = { ...settings, ...change };
      setSettings(next);
      saveMidiInputSettings(serializeMidiInputSettings(next)).catch((reason: unknown) => setError(errorMessage(reason, MIDI_FAILED)));
    },
    [settings],
  );
  // The same object while nothing changed, so the memoized inspector is not redrawn on every cursor move.
  return useMemo(() => ({ settings, sources, listening, error, changeSettings }), [settings, sources, listening, error, changeSettings]);
}

interface Latest {
  readonly settings: MidiInputSettings;
  readonly onPlayed: (notes: readonly PlayedNote[]) => void;
}

/** Gathers note-ons into chords (addNoteOn) and hands each over CHORD_WINDOW_MS after its first note. */
function useStruckChords(latest: { readonly current: Latest }): { readonly strike: (note: MidiNoteMessage) => void } {
  const pending = useRef<PendingChord | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deliver = useCallback(
    (notes: readonly MidiNoteMessage[]) => {
      const { settings, onPlayed } = latest.current;
      if (settings.isEnabled && notes.length > 0) {
        onPlayed(toPlayedNotes(notes, settings));
      }
    },
    [latest],
  );
  const flush = useCallback(() => {
    timer.current = undefined;
    const struck = pending.current;
    pending.current = undefined;
    deliver(struck?.notes ?? []);
  }, [deliver]);
  const strike = useCallback(
    (note: MidiNoteMessage) => {
      if (!note.isOn || !latest.current.settings.isEnabled) {
        return;
      }
      const next = addNoteOn(pending.current, note, Date.now());
      pending.current = next.pending;
      if (next.ready !== undefined) {
        deliver(next.ready);
      }
      if (timer.current !== undefined && next.ready !== undefined) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
      if (timer.current === undefined) {
        timer.current = setTimeout(flush, CHORD_WINDOW_MS);
      }
    },
    [latest, deliver, flush],
  );
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
    },
    [],
  );
  return useMemo(() => ({ strike }), [strike]);
}
