import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { InstrumentChoice, Song } from '@gp-editor/core';
import { useT } from '../hooks/use-i18n';
import {
  PICKER_FAMILY_COUNT,
  canFamilyChangeStrings,
  choiceDetail,
  choiceLabel,
  familyChoices,
  familyLabel,
  familyOf,
  notesLostQuestion,
  trackChoice,
} from '../lib/instrument-picker';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';
import { ChromeButton } from './chrome/ChromeButton';

interface InstrumentPickerProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly palette: Palette;
  /** An instrument picked; `keepsTrack`: only its sound, the track's strings, tuning and clef staying. */
  readonly onChoose: (instrument: InstrumentChoice, keepsTrack: boolean) => void;
  readonly onClose: () => void;
}

/**
 * Picks a track's instrument in two clearly separate steps, in a panel over the score: on the left (step 1) one of the
 * 16 General MIDI families or the drums — browsing only; on the right (step 2) one of that family's instruments, which
 * the track plays at once (heard live while playing) and becomes: a line under an instrument says what it makes of the
 * track (another kind's strings, tuning and clef, unless the box asks for the sound alone; the notes a change between
 * drums and a pitched instrument takes out, asked first). The panel stays open to try sounds one after another; Done or
 * a click outside closes it.
 */
export function InstrumentPicker({ song, trackIndex, palette, onChoose, onClose }: InstrumentPickerProps) {
  const t = useT();
  const current = trackChoice(song, trackIndex);
  const [familyIndex, setFamilyIndex] = useState(current === undefined ? 0 : familyOf(current));
  const [setsTrack, setSetsTrack] = useState(true);
  const [asking, setAsking] = useState<InstrumentChoice | undefined>(undefined);
  const choose = (choice: InstrumentChoice) => (notesLostQuestion(song, trackIndex, choice) === undefined ? onChoose(choice, !setsTrack) : setAsking(choice));
  const question = asking === undefined ? undefined : notesLostQuestion(song, trackIndex, asking);
  const confirm = () => {
    setAsking(undefined);
    if (asking !== undefined) {
      onChoose(asking, false);
    }
  };
  return (
    <View style={styles.overlay}>
      <Pressable testID="instrument-picker-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: palette.paper, borderColor: palette.border }]}>
        <View style={[styles.header, { borderColor: palette.border }]}>
          <View style={styles.headerTexts}>
            <Text style={[styles.title, { color: palette.text }]}>{t('window.picker.title', { track: song.tracks[trackIndex]?.name ?? '' })}</Text>
            <Text style={[styles.now, { color: palette.muted }]}>{t('window.picker.now', { instrument: current === undefined ? '' : choiceLabel(current) })}</Text>
          </View>
          <BarButton label={t('common.done')} palette={palette} isAccent onPress={onClose} />
        </View>
        <View style={styles.panes}>
          <View style={[styles.familyPane, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
            <Text style={[styles.paneTitle, { color: palette.muted }]}>{t('window.picker.family')}</Text>
            <ScrollView>
              {Array.from({ length: PICKER_FAMILY_COUNT }, (_, index) => (
                <PickerRow key={index} pane="family" label={familyLabel(index)} isSelected={index === familyIndex} palette={palette} onPress={() => setFamilyIndex(index)} />
              ))}
            </ScrollView>
          </View>
          <InstrumentPane {...{ song, trackIndex, familyIndex, current, setsTrack, palette }} onChoose={choose} onToggleSetsTrack={() => setSetsTrack(!setsTrack)} />
        </View>
        {question === undefined ? null : <NotesQuestion palette={palette} question={question} onConfirm={confirm} onCancel={() => setAsking(undefined)} />}
        <Text style={[styles.footer, { color: palette.muted, borderColor: palette.border }]}>{t('window.picker.footer')}</Text>
      </View>
    </View>
  );
}

interface InstrumentPaneProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly familyIndex: number;
  /** What the track plays now (its row is marked). */
  readonly current?: InstrumentChoice;
  /** Another kind's strings, tuning and clef come with its instrument. */
  readonly setsTrack: boolean;
  readonly palette: Palette;
  readonly onChoose: (choice: InstrumentChoice) => void;
  readonly onToggleSetsTrack: () => void;
}

/** Step 2: the family's instruments, each with what it makes of the track, and the box to change only the sound. */
function InstrumentPane({ song, trackIndex, familyIndex, current, setsTrack, palette, onChoose, onToggleSetsTrack }: InstrumentPaneProps) {
  const t = useT();
  return (
    <View style={styles.instrumentPane}>
      <Text style={[styles.paneTitle, { color: palette.muted }]}>{t('window.picker.instrument')}</Text>
      {familyChoices(familyIndex).map((choice) => (
        <PickerRow
          key={String(choice)}
          pane="instrument"
          label={choiceLabel(choice)}
          detail={choiceDetail(song, trackIndex, choice, setsTrack)}
          isSelected={choice === current}
          palette={palette}
          onPress={() => onChoose(choice)}
        />
      ))}
      {canFamilyChangeStrings(song, trackIndex, familyIndex) ? (
        <ChromeButton
          palette={palette}
          label={`${setsTrack ? '☑' : '☐'} ${t('window.picker.setsTrack')}`}
          tooltip={t('window.picker.setsTrackTooltip')}
          fontSize={11}
          isActive={setsTrack}
          onPress={onToggleSetsTrack}
        />
      ) : null}
    </View>
  );
}

interface NotesQuestionProps {
  readonly palette: Palette;
  readonly question: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** "Drum Kit for “Lead”? … its 2 notes are taken out": the instrument changes only on Change Instrument. */
function NotesQuestion({ palette, question, onConfirm, onCancel }: NotesQuestionProps) {
  const t = useT();
  return (
    <View style={[styles.question, { borderColor: palette.border, backgroundColor: palette.sidebar }]}>
      <Text style={[styles.questionText, { color: palette.text }]}>{question}</Text>
      <View style={styles.questionButtons}>
        <ChromeButton palette={palette} label={t('common.cancel')} tooltip={t('common.cancel')} onPress={onCancel} />
        <ChromeButton palette={palette} label={t('window.picker.askConfirm')} tooltip={t('window.picker.askConfirm')} isActive onPress={onConfirm} />
      </View>
    </View>
  );
}

export interface PickerRowProps {
  /** Which step the row belongs to: a family (browse) or an instrument (pick). */
  readonly pane: 'family' | 'instrument';
  readonly label: string;
  /** Under an instrument: what picking it makes of the track ("Bass · 4 strings · E A D G"). */
  readonly detail?: string;
  readonly isSelected: boolean;
  readonly palette: Palette;
  readonly onPress: () => void;
}

/** A family row is marked by a bar and a tint (where you are); an instrument row by ● / ○ (what the track plays). */
export function PickerRow({ pane, label, detail, isSelected, palette, onPress }: PickerRowProps) {
  const isFamily = pane === 'family';
  return (
    <Pressable
      onPress={onPress}
      style={[
        isFamily ? styles.familyRow : styles.instrumentRow,
        isSelected ? { backgroundColor: palette.selection } : null,
        isSelected && isFamily ? { borderLeftColor: palette.accent } : null,
      ]}
    >
      {isFamily ? null : <Text style={[styles.marker, { color: isSelected ? palette.accent : palette.muted }]}>{isSelected ? '●' : '○'}</Text>}
      <View style={styles.rowTexts}>
        <Text numberOfLines={1} style={[styles.rowText, isSelected ? styles.selectedText : null, { color: palette.text }]}>
          {label}
        </Text>
        {detail === undefined ? null : (
          <Text numberOfLines={1} style={[styles.detail, { color: palette.muted }]}>
            {detail}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  panel: { width: 620, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTexts: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  now: { fontSize: 12, marginTop: 2 },
  panes: { flexDirection: 'row', height: 380 },
  familyPane: { width: 210, borderRightWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  instrumentPane: { flex: 1, paddingTop: 8, paddingHorizontal: 8 },
  paneTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 6 },
  familyRow: { flexDirection: 'row', alignItems: 'center', height: 20, paddingHorizontal: 9, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  instrumentRow: { flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 10, borderRadius: 6 },
  marker: { width: 18, fontSize: 13 },
  rowTexts: { flexShrink: 1 },
  rowText: { fontSize: 13, fontWeight: '500' },
  selectedText: { fontWeight: '700' },
  detail: { fontSize: 10, marginTop: 1 },
  question: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  questionText: { fontSize: 12, lineHeight: 17 },
  questionButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 },
  footer: { fontSize: 11, paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
});
