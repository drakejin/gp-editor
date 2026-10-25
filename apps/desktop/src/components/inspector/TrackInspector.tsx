import { StyleSheet, Text, View } from 'react-native';
import type { Effect, Song } from '@gp-editor/core';
import type { DrumKey } from '../../hooks/use-drum-key';
import { useT } from '../../hooks/use-i18n';
import type { MessageKey } from '../../lib/i18n/i18n';
import { trackInstrument } from '../../lib/instruments';
import type { MixPreview } from '../../lib/mix';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../../score/chords';
import { type ScoreMode, type Staff, showsStaff, toggleStaff } from '../../score/geometry';
import { type Palette, onChrome } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { NeckSettings } from '../NeckSettings';
import { EffectChainEditor } from '../effects/EffectChainEditor';
import { InspectorField, InspectorSection, InspectorTextField } from './InspectorParts';

/** Highest capo fret the inspector offers. */
const MAX_CAPO = 24;

export interface TrackInspectorProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  /** What the score shows of its chords. */
  readonly chordDisplay?: ChordDisplay;
  /** What the last retune could not keep. */
  readonly notice?: string;
  readonly onChangeMode: (mode: ScoreMode) => void;
  readonly onChangeChordDisplay?: (display: ChordDisplay) => void;
  readonly onSetTrackName: (trackIndex: number, name: string) => void;
  readonly onSetTrackCapo: (trackIndex: number, capo: number) => void;
  readonly onSetTrackTuning: (trackIndex: number, tuning: readonly number[]) => void;
  readonly onDismissNotice: () => void;
  readonly onEditInstrument: (trackIndex: number) => void;
  /** The track's effect chain changed (one undo step). */
  readonly onSetTrackEffects?: (trackIndex: number, effects: readonly Effect[]) => void;
  /** While an effect's slider is dragged: what to hear now; undefined when the drag ended unchanged. */
  readonly onPreviewMix?: (preview: MixPreview | undefined) => void;
  /** The track written in rhythm slashes, or as notes again (an edit of the song, undoable). */
  readonly onSetTrackSlashNotation?: (trackIndex: number, hasSlashNotation: boolean) => void;
  /** View ▸ Drum Key, shown or hidden by a button for drum tracks. */
  readonly drumKey?: Pick<DrumKey, 'isOpen' | 'toggle'>;
}

/** The effects editor's width inside the inspector's sections. */
const EFFECTS_WIDTH = 244;

const STAVES: readonly { readonly staff: Staff; readonly label: MessageKey; readonly tooltip: MessageKey }[] = [
  { staff: 'standard', label: 'tools.inspector.staff.standard', tooltip: 'tools.inspector.staff.standardTooltip' },
  { staff: 'tab', label: 'tools.inspector.staff.tab', tooltip: 'tools.inspector.staff.tabTooltip' },
];

const CHORD_PARTS: readonly { readonly part: keyof ChordDisplay; readonly label: MessageKey; readonly tooltip: MessageKey }[] = [
  { part: 'showsNames', label: 'tools.inspector.chordNames', tooltip: 'tools.inspector.chordNamesTooltip' },
  { part: 'showsDiagrams', label: 'tools.inspector.chordDiagrams', tooltip: 'tools.inspector.chordDiagramsTooltip' },
];

/** The TRACK tab: the shown track's name, notation, tuning and capo, its instrument and its effects. */
export function TrackInspector(props: TrackInspectorProps) {
  const { palette, song, trackIndex, mode, chordDisplay = DEFAULT_CHORD_DISPLAY } = props;
  const t = useT();
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return null;
  }
  const instrument = trackInstrument(song, trackIndex);
  return (
    <>
      <InspectorSection palette={palette} title={t('tools.inspector.information')}>
        <InspectorTextField palette={palette} label={t('common.name')} value={track.name} onCommit={(name) => props.onSetTrackName(trackIndex, name)} />
        <InspectorField palette={palette} label={t('common.track')}>
          <View style={[styles.swatch, { backgroundColor: `rgb(${track.color.r},${track.color.g},${track.color.b})` }]} />
          <Text style={[styles.value, { color: palette.chromeText }]}>{t('tools.inspector.trackPosition', { number: track.number, total: song.tracks.length, strings: t('common.strings', { count: track.strings.length }) })}</Text>
        </InspectorField>
      </InspectorSection>
      <InspectorSection palette={palette} title={t('tools.inspector.musicalNotation')}>
        <InspectorField palette={palette} label={t('tools.inspector.notation')}>
          {STAVES.map(({ staff, label, tooltip }) => (
            <ChromeButton key={staff} palette={palette} label={t(label)} tooltip={t(tooltip)} isActive={showsStaff(mode, staff)} onPress={() => props.onChangeMode(toggleStaff(mode, staff))} />
          ))}
          <ChromeButton
            palette={palette}
            label={t('tools.inspector.slash')}
            tooltip={t('tools.inspector.slashTooltip')}
            isActive={track.hasSlashNotation === true}
            onPress={() => props.onSetTrackSlashNotation?.(trackIndex, track.hasSlashNotation !== true)}
          />
        </InspectorField>
        <InspectorField palette={palette} label={t('tools.inspector.chords')}>
          {CHORD_PARTS.map(({ part, label, tooltip }) => (
            <ChromeButton key={part} palette={palette} label={t(label)} tooltip={t(tooltip)} isActive={chordDisplay[part]} onPress={() => props.onChangeChordDisplay?.({ ...chordDisplay, [part]: !chordDisplay[part] })} />
          ))}
        </InspectorField>
        {track.isPercussion && props.drumKey !== undefined ? (
          <InspectorField palette={palette} label={t('drums.key.field')}>
            <ChromeButton palette={palette} label={t('drums.key.title')} tooltip={t('drums.key.openTooltip')} isActive={props.drumKey.isOpen} onPress={props.drumKey.toggle} />
          </InspectorField>
        ) : null}
        {track.isPercussion ? null : (
          <>
            <InspectorField palette={palette} label={t('common.capo')}>
              <ChromeButton palette={palette} label="−" tooltip={t('tools.inspector.capoLower')} isEnabled={track.offset > 0} onPress={() => props.onSetTrackCapo(trackIndex, track.offset - 1)} />
              <Text style={[styles.capo, { color: palette.chromeText }]}>{track.offset === 0 ? t('common.none') : t('tools.inspector.capoFret', { fret: track.offset })}</Text>
              <ChromeButton palette={palette} label="+" tooltip={t('tools.inspector.capoHigher')} isEnabled={track.offset < MAX_CAPO} onPress={() => props.onSetTrackCapo(trackIndex, track.offset + 1)} />
            </InspectorField>
            <NeckSettings
              song={song}
              trackIndex={trackIndex}
              notice={props.notice}
              palette={onChrome(palette)}
              onSetTuning={(tuning) => props.onSetTrackTuning(trackIndex, tuning)}
              onDismissNotice={props.onDismissNotice}
              style={styles.tuning}
            />
          </>
        )}
      </InspectorSection>
      <InspectorSection palette={palette} title={t('tools.inspector.sounds')}>
        <InspectorField palette={palette} label={t('common.instrument')}>
          <ChromeButton
            palette={palette}
            label={track.isPercussion ? t('tools.inspector.drums') : `♪ ${instrument?.name ?? t('common.instrument')} ▾`}
            tooltip={track.isPercussion ? t('tools.inspector.drumsTooltip') : t('tools.inspector.instrumentTooltip')}
            isEnabled={!track.isPercussion}
            onPress={() => props.onEditInstrument(trackIndex)}
          />
        </InspectorField>
      </InspectorSection>
      {props.onSetTrackEffects === undefined ? null : (
        <InspectorSection palette={palette} title={t('tools.inspector.effects')}>
          <EffectChainEditor
            key={trackIndex}
            palette={palette}
            effects={track.effects ?? []}
            width={EFFECTS_WIDTH}
            onChange={(effects) => props.onSetTrackEffects?.(trackIndex, effects)}
            onPreview={(effects) => props.onPreviewMix?.(effects === undefined ? undefined : { trackIndex, effects })}
          />
        </InspectorSection>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 12, height: 12, borderRadius: 3, marginRight: 6 },
  value: { fontSize: 11 },
  capo: { minWidth: 52, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  tuning: { paddingHorizontal: 0, paddingTop: 4, backgroundColor: 'transparent' },
});
