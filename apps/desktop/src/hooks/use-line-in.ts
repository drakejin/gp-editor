import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type TrackIndexMap, remapTrackIndex } from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import { LINE_IN_GAIN, type LineInDevices, NO_LINE_IN_DEVICES, hasFeedbackRisk, lineInTrackIndex, parseLineInDevices } from '../lib/line-in';
import { type LineInSettings, lineInLevel, loadLineInDevices, startLineIn, stopLineIn, updateLineIn } from '../native/audio-effects';

/** How often the input level is read while the line in is on. */
const LEVEL_INTERVAL_MS = 100;
const SILENCE_DB = -120;

/** Tools ▸ Line In: a real instrument through a track's effects, its panel and settings (kept for the session). */
export interface LineIn {
  readonly isOpen: boolean;
  readonly open: () => void;
  /** Closes the panel; the line in goes off with it. */
  readonly close: () => void;
  readonly devices: LineInDevices;
  /** The chosen input; empty: the system's default. */
  readonly deviceId: string;
  readonly chooseDevice: (deviceId: string) => void;
  readonly gainDb: number;
  readonly setGainDb: (gainDb: number) => void;
  readonly isMonitoring: boolean;
  readonly toggleMonitoring: () => void;
  /** The track the sound is locked to ("sound lock"); undefined: it follows the selected track. */
  readonly lockedTrackIndex?: number;
  readonly toggleLock: () => void;
  /** The shown song's tracks were added, deleted or moved: the lock follows its track (and goes with a deleted one). */
  readonly remapTrack: (map: TrackIndexMap) => void;
  /** The track whose effects the input plays through. */
  readonly trackIndex: number;
  readonly isOn: boolean;
  readonly turnOn: () => void;
  readonly turnOff: () => void;
  /** The input's peak in dBFS (after the gain). */
  readonly levelDb: number;
  readonly error?: string;
}

interface Settings {
  readonly deviceId: string;
  readonly gainDb: number;
  readonly isMonitoring: boolean;
  readonly lockedTrackIndex?: number;
}

const INITIAL_SETTINGS: Settings = { deviceId: '', gainDb: 0, isMonitoring: true };

/** The input's peak, read while the line in is on. */
function useLevel(isOn: boolean): number {
  const [levelDb, setLevelDb] = useState(SILENCE_DB);
  useEffect(() => {
    if (!isOn) {
      setLevelDb(SILENCE_DB);
      return undefined;
    }
    const timer = setInterval(() => {
      lineInLevel()
        .then(setLevelDb)
        .catch(() => setLevelDb(SILENCE_DB));
    }, LEVEL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOn]);
  return levelDb;
}

/** On and off: starting asks for the input (and microphone access); a failure leaves it off with the reason. */
function usePower(current: MutableRefObject<LineInSettings>) {
  const [isOn, setIsOn] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const isOnNow = useRef(isOn);
  isOnNow.current = isOn;
  const start = useCallback(
    (overrides: Partial<LineInSettings> = {}) => {
      setError(undefined);
      startLineIn({ ...current.current, ...overrides })
        .then(() => setIsOn(true))
        .catch((reason: unknown) => {
          setIsOn(false);
          setError(errorMessage(reason, 'The line in could not start'));
        });
    },
    [current],
  );
  const turnOff = useCallback(() => {
    setIsOn(false);
    stopLineIn().catch(() => undefined);
  }, []);
  useEffect(
    () => () => {
      if (isOnNow.current) {
        stopLineIn().catch(() => undefined);
      }
    },
    [],
  );
  return { isOn, isOnNow, error, setError, start, turnOff };
}

/** The settings, and the panel's opening (which lists the inputs). */
function useSettings(current: MutableRefObject<LineInSettings>, onError: (message: string) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [devices, setDevices] = useState<LineInDevices>(NO_LINE_IN_DEVICES);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const open = useCallback(() => {
    setIsOpen(true);
    loadLineInDevices()
      .then((raw) => {
        const found = parseLineInDevices(raw);
        setDevices(found);
        // With the Mac's own microphone and speakers, monitoring starts off: the speakers would feed back into it.
        if (hasFeedbackRisk(found, current.current.deviceId)) {
          setSettings((previous) => ({ ...previous, isMonitoring: false }));
        }
      })
      .catch((reason: unknown) => onError(errorMessage(reason, 'The audio inputs could not be listed')));
  }, [current, onError]);
  const change = useCallback((patch: Partial<Settings>) => setSettings((previous) => ({ ...previous, ...patch })), []);
  return { isOpen, setIsOpen, devices, settings, setSettings, change, open };
}

export function useLineIn(selectedTrackIndex: number): LineIn {
  const current = useRef<LineInSettings>({ deviceId: '', gainDb: 0, isMonitoring: true, trackIndex: selectedTrackIndex });
  const power = usePower(current);
  const { isOn, isOnNow, start, turnOff, setError } = power;
  const panel = useSettings(current, setError);
  const { settings, setSettings, change, setIsOpen } = panel;
  const trackIndex = lineInTrackIndex(settings, selectedTrackIndex);
  current.current = { deviceId: settings.deviceId, gainDb: settings.gainDb, isMonitoring: settings.isMonitoring, trackIndex };
  // A new track, gain or monitoring reaches the running line in at once.
  const { gainDb, isMonitoring, deviceId, lockedTrackIndex } = settings;
  useEffect(() => {
    if (isOn) {
      updateLineIn(current.current).catch(() => undefined);
    }
  }, [isOn, trackIndex, gainDb, isMonitoring]);
  const close = useCallback(() => {
    if (isOnNow.current) {
      turnOff();
    }
    setIsOpen(false);
  }, [isOnNow, turnOff, setIsOpen]);
  const chooseDevice = useCallback(
    (next: string) => {
      change({ deviceId: next });
      if (isOnNow.current) {
        start({ deviceId: next });
      }
    },
    [change, isOnNow, start],
  );
  const setGainDb = useCallback((next: number) => change({ gainDb: Math.min(LINE_IN_GAIN.max, Math.max(LINE_IN_GAIN.min, next)) }), [change]);
  const toggleMonitoring = useCallback(() => setSettings((previous) => ({ ...previous, isMonitoring: !previous.isMonitoring })), [setSettings]);
  const toggleLock = useCallback(
    () => setSettings((previous) => ({ ...previous, lockedTrackIndex: previous.lockedTrackIndex === undefined ? current.current.trackIndex : undefined })),
    [setSettings],
  );
  const remapTrack = useCallback(
    (map: TrackIndexMap) =>
      setSettings((previous) => (previous.lockedTrackIndex === undefined ? previous : { ...previous, lockedTrackIndex: remapTrackIndex(map, previous.lockedTrackIndex) })),
    [setSettings],
  );
  const turnOn = useCallback(() => start(), [start]);
  const levelDb = useLevel(isOn);
  return { isOpen: panel.isOpen, open: panel.open, close, devices: panel.devices, deviceId, chooseDevice, gainDb, setGainDb, isMonitoring, toggleMonitoring, lockedTrackIndex, toggleLock, remapTrack, trackIndex, isOn, turnOn, turnOff, levelDb, error: power.error };
}
