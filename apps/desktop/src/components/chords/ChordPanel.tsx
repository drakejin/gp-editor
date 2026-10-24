import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Chord, type NoteSpelling, type Song, type StringAddress, chordLabel } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { type ChordDraft, MAX_FIRST_FRET, draftChord, draftFromChord, draftFromNotes, renameDraft, shiftDraftWindow, toggleDraftString } from '../../lib/chord-grid';
import { cursorVoice } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';
import { ChordGrid } from './ChordDiagramView';
import { ChordLibrary } from './ChordLibrary';

export interface ChordPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The cursor: its beat gets the chord. */
  readonly cursor: StringAddress;
  /** Apply: the beat's chord, and (`withNotes`) its notes written into the cursor's voice. */
  readonly onApply: (chord: Chord, withNotes: boolean) => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/** Longest name the field takes (GP5 holds 21 characters; GP7 more). */
const MAX_NAME_LENGTH = 40;

/**
 * Guitar Pro's chord diagram tool (K, or the palette's Chord button) for the beat at the cursor: a grid to set the
 * fingers, named as you go (the name can be typed), the beat's notes as a start, and the chord library beside it.
 * Apply puts the chord on the beat, and its notes too when asked.
 */
export function ChordPanel({ palette, song, cursor, onApply, onRemove, onClose }: ChordPanelProps) {
  const t = useT();
  const track = song.tracks[cursor.trackIndex];
  const tuning = useMemo(() => (track?.strings ?? []).map((string) => string.tuning), [track?.strings]);
  const spelling: NoteSpelling = (track?.measures[cursor.measureIndex]?.keySignature ?? 0) < 0 ? 'flat' : 'sharp';
  const beat = track?.measures[cursor.measureIndex]?.beats[cursor.beatIndex];
  const notes = cursorVoice(song, cursor)?.notes ?? [];
  const [draft, setDraft] = useState<ChordDraft>(() => (beat?.chord === undefined && notes.length > 0 ? draftFromNotes(notes, tuning, spelling) : draftFromChord(beat?.chord, tuning)));
  const [withNotes, setWithNotes] = useState(notes.length === 0);
  const chord = draftChord(draft);
  const canApply = chord.name !== '' || chord.frets.some((fret) => fret >= 0);
  return (
    <View style={styles.overlay}>
      <Pressable testID="chord-panel-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('tools.chords.title')}>
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>{t('tools.chords.title')}</Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>{t('tools.chords.subtitle', { bar: cursor.measureIndex + 1, beat: cursor.beatIndex + 1, track: track?.name ?? '' })}</Text>
          </View>
          <ChromeButton palette={palette} label={t('common.done')} tooltip={t('tools.chords.doneTooltip')} onPress={onClose} />
        </View>
        <View style={styles.body}>
          <ChordEditor palette={palette} draft={draft} tuning={tuning} spelling={spelling} notesCount={notes.length} withNotes={withNotes} onChange={setDraft} onUseNotes={() => setDraft(draftFromNotes(notes, tuning, spelling))} onWithNotes={setWithNotes} />
          <View style={[styles.divider, { backgroundColor: palette.chromeBorder }]} />
          <ChordLibrary
            palette={palette}
            song={song}
            trackIndex={cursor.trackIndex}
            tuning={tuning}
            spelling={spelling}
            frets={draft.frets}
            onLoad={(loaded) => setDraft(draftFromChord(loaded, tuning))}
            onName={(name) => setDraft(renameDraft(draft, name))}
          />
        </View>
        <View style={[styles.footer, { borderColor: palette.chromeBorder }]}>
          <Text style={[styles.status, { color: palette.chromeMuted }]}>{beat?.chord === undefined ? t('tools.chords.noChordYet') : t('tools.chords.beatChord', { name: chordLabel(beat.chord) || t('tools.chords.noName') })}</Text>
          <ChromeButton testID="chord-remove" palette={palette} label={t('common.remove')} tooltip={t('tools.chords.removeTooltip')} isEnabled={beat?.chord !== undefined} onPress={onRemove} />
          <ChromeButton testID="chord-apply" palette={palette} label={t('common.apply')} tooltip={t('tools.chords.applyTooltip')} isActive isEnabled={canApply} onPress={() => onApply(chord, withNotes)} />
        </View>
      </View>
    </View>
  );
}

interface ChordEditorProps {
  readonly palette: Palette;
  readonly draft: ChordDraft;
  readonly tuning: readonly number[];
  readonly spelling: NoteSpelling;
  /** Notes in the cursor's voice. */
  readonly notesCount: number;
  readonly withNotes: boolean;
  readonly onChange: (draft: ChordDraft) => void;
  readonly onUseNotes: () => void;
  readonly onWithNotes: (withNotes: boolean) => void;
}

function ChordEditor({ palette, draft, tuning, spelling, notesCount, withNotes, onChange, onUseNotes, onWithNotes }: ChordEditorProps) {
  const shift = (delta: number) => onChange(shiftDraftWindow(draft, delta, tuning, spelling));
  const t = useT();
  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.chords.name')}</Text>
        <TextField
          testID="chord-name"
          accessibilityLabel={t('tools.chords.nameLabel')}
          value={draft.name}
          maxLength={MAX_NAME_LENGTH}
          onChangeText={(name) => onChange(renameDraft(draft, name))}
          placeholder={t('tools.chords.namedFromGrid')}
          placeholderTextColor={palette.chromeMuted}
          autoCorrect={false}
          style={[styles.field, { color: palette.chromeText, backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}
        />
      </View>
      <ChordGrid palette={palette} draft={draft} onToggle={(string, fret) => onChange(toggleDraftString(draft, string, fret, tuning, spelling))} />
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.chords.fret')}</Text>
        <ChromeButton palette={palette} label="−" tooltip={t('tools.chords.fretDown')} isEnabled={draft.firstFret > 1} onPress={() => shift(-1)} />
        <Text style={[styles.fret, { color: palette.chromeText }]}>{draft.firstFret}</Text>
        <ChromeButton palette={palette} label="+" tooltip={t('tools.chords.fretUp')} isEnabled={draft.firstFret < MAX_FIRST_FRET} onPress={() => shift(1)} />
      </View>
      <View style={styles.row}>
        <ChromeButton testID="chord-use-notes" palette={palette} label={t('tools.chords.notesOfBeat')} tooltip={t('tools.chords.notesOfBeatTooltip')} fontSize={11} isEnabled={notesCount > 0} onPress={onUseNotes} />
        <ChromeButton palette={palette} label={t('common.clear')} tooltip={t('tools.chords.clearTooltip')} fontSize={11} onPress={() => onChange(draftFromChord(undefined, tuning))} />
      </View>
      <ChromeButton
        testID="chord-with-notes"
        palette={palette}
        label={`${withNotes ? '☑' : '☐'} ${t('tools.chords.writeNotes')}`}
        tooltip={t('tools.chords.writeNotesTooltip')}
        fontSize={11}
        isActive={withNotes}
        onPress={() => onWithNotes(!withNotes)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  panel: { width: 780, height: 560, maxHeight: '94%', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  titles: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { flex: 1, flexDirection: 'row', padding: 14, minHeight: 0 },
  editor: { width: 236, alignItems: 'flex-start', rowGap: 6 },
  divider: { width: 1, marginHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { width: 42, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  field: { width: 186, height: 24, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, fontSize: 14, fontWeight: '700' },
  fret: { minWidth: 30, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, columnGap: 6 },
  status: { flex: 1, fontSize: 12 },
});
