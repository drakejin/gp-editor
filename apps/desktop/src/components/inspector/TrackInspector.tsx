import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { type Effect, type Lyrics, type Song, type Track, type TrackIconName, abbreviateTrackName, lyricsSyllables } from '@gp-editor/core';
import type { DrumKey } from '../../hooks/use-drum-key';
import { useT } from '../../hooks/use-i18n';
import { type PanelAnchor, useAnchoredPress } from '../../hooks/use-track-info';
import type { MessageKey } from '../../lib/i18n/i18n';
import { trackInstrument } from '../../lib/instruments';
import type { MixPreview } from '../../lib/mix';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../../score/chords';
import { type ScoreMode, type Staff, showsStaff, toggleStaff } from '../../score/geometry';
import { shownTrackIcon } from '../../score/track-icons';
import { type Palette, onChrome } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { NeckSettings } from '../NeckSettings';
import { TrackIcon } from '../TrackIcon';
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
  /** Guitar Pro's abbreviated name (blank: the name abbreviated). */
  readonly onSetTrackShortName?: (trackIndex: number, shortName: string) => void;
  /** The colour or icon was clicked: the track's information opens beside it (colours, icons). */
  readonly onOpenTrackInfo?: (trackIndex: number, anchor: PanelAnchor) => void;
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
  /** Edit ▸ Lyrics…: the lyrics panel, opened from the track's LYRICS field. */
  readonly onOpenLyrics?: () => void;
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
  const { onSetTrackEffects } = props;
  return (
    <>
      <TrackInformation
        // Another track: fresh fields, nothing typed for one track left in the other's.
        key={`information-${trackIndex}`}
        palette={palette}
        trackIndex={trackIndex}
        name={track.name}
        shortName={track.shortName}
        color={track.color}
        icon={shownTrackIcon(song, trackIndex)}
        number={track.number}
        trackCount={song.tracks.length}
        stringCount={track.strings.length}
        onSetTrackName={props.onSetTrackName}
        onSetTrackShortName={props.onSetTrackShortName}
        onOpenTrackInfo={props.onOpenTrackInfo}
      />
      <InspectorSection palette={palette} title={t('tools.inspector.musicalNotation')}>
        <NotationFields
          palette={palette}
          trackIndex={trackIndex}
          mode={mode}
          hasSlashNotation={track.hasSlashNotation === true}
          chordDisplay={chordDisplay}
          onChangeMode={props.onChangeMode}
          onChangeChordDisplay={props.onChangeChordDisplay}
          onSetTrackSlashNotation={props.onSetTrackSlashNotation}
        />
        {track.isPercussion && props.drumKey !== undefined ? (
          <InspectorField palette={palette} label={t('drums.key.field')}>
            <ChromeButton palette={palette} label={t('drums.key.title')} tooltip={t('drums.key.openTooltip')} isActive={props.drumKey.isOpen} onPress={props.drumKey.toggle} />
          </InspectorField>
        ) : null}
        {track.isPercussion ? null : <TuningFields {...props} capo={track.offset} />}
        {props.onOpenLyrics === undefined ? null : <LyricsField palette={palette} lyrics={track.lyrics} onOpenLyrics={props.onOpenLyrics} />}
      </InspectorSection>
      <TrackSound palette={palette} trackIndex={trackIndex} isPercussion={track.isPercussion} instrumentName={trackInstrument(song, trackIndex)?.name} onEditInstrument={props.onEditInstrument} />
      {onSetTrackEffects === undefined ? null : (
        <TrackEffects key={trackIndex} palette={palette} trackIndex={trackIndex} effects={track.effects} onSetTrackEffects={onSetTrackEffects} onPreviewMix={props.onPreviewMix} />
      )}
    </>
  );
}

interface LyricsFieldProps {
  readonly palette: Palette;
  readonly lyrics?: Lyrics;
  readonly onOpenLyrics: () => void;
}

/** LYRICS: how many syllables the track sings from which bar (Guitar Pro's syllables), and Edit… for the lyrics panel. */
const LyricsField = memo(function LyricsFieldView({ palette, lyrics, onOpenLyrics }: LyricsFieldProps) {
  const t = useT();
  const count = lyrics === undefined ? 0 : lyricsSyllables(lyrics.text).filter((syllable) => syllable.trim() !== '').length;
  const summary = lyrics === undefined || count === 0 ? t('tools.lyrics.none') : t('tools.inspector.lyricsSummary', { syllables: t('tools.lyrics.syllables', { count }), bar: lyrics.from });
  return (
    <InspectorField palette={palette} label={t('tools.inspector.lyrics')}>
      <Text style={[styles.lyricsSummary, { color: palette.chromeText }]}>{summary}</Text>
      <ChromeButton palette={palette} label={t('tools.inspector.editLyrics')} tooltip={t('tools.inspector.editLyricsTooltip')} fontSize={11} onPress={onOpenLyrics} />
    </InspectorField>
  );
});

// The sections below are memoised on what they show: an edit of the track's notes (a new track object, the same
// name, strings, effects …) redraws only the tuning, whose suggestions read the notes.

interface TrackInformationProps extends Pick<TrackInspectorProps, 'palette' | 'trackIndex' | 'onSetTrackName' | 'onSetTrackShortName' | 'onOpenTrackInfo'> {
  readonly name: string;
  readonly shortName?: string;
  readonly color: Track['color'];
  readonly icon: TrackIconName;
  readonly number: number;
  readonly trackCount: number;
  readonly stringCount: number;
}

/** Guitar Pro 8's INFORMATION: name and short name, the colour and icon (they open the track's information), the track's place. */
function TrackInformationView(props: TrackInformationProps) {
  const { palette, trackIndex, name, shortName, color, number, trackCount, stringCount, onSetTrackShortName, onOpenTrackInfo } = props;
  const t = useT();
  const open = onOpenTrackInfo === undefined ? undefined : (anchor: PanelAnchor) => onOpenTrackInfo(trackIndex, anchor);
  const swatch = useAnchoredPress(open);
  const icon = useAnchoredPress(open);
  return (
    <InspectorSection palette={palette} title={t('tools.inspector.information')}>
      <InspectorTextField palette={palette} label={t('common.name')} value={name} onCommit={(next) => props.onSetTrackName(trackIndex, next)} />
      {onSetTrackShortName === undefined ? null : (
        <InspectorTextField
          palette={palette}
          label={t('window.trackInfo.shortName')}
          value={shortName ?? ''}
          placeholder={abbreviateTrackName(name)}
          onCommit={(next) => onSetTrackShortName(trackIndex, next)}
        />
      )}
      <InspectorField palette={palette} label={t('common.track')}>
        <Pressable
          ref={swatch.ref}
          disabled={swatch.onPress === undefined}
          onPress={swatch.onPress}
          tooltip={t('window.tracks.colorTooltip')}
          accessibilityRole="button"
          accessibilityLabel={t('window.tracks.colorOf', { number })}
          style={[styles.swatch, { backgroundColor: `rgb(${color.r},${color.g},${color.b})`, borderColor: palette.chromeBorder }]}
        />
        <Pressable
          ref={icon.ref}
          disabled={icon.onPress === undefined}
          onPress={icon.onPress}
          tooltip={t('window.tracks.iconTooltip', { icon: t(`window.trackIcon.${props.icon}`) })}
          accessibilityRole="button"
          accessibilityLabel={t('window.tracks.iconOf', { number })}
          style={styles.iconButton}
        >
          <TrackIcon icon={props.icon} color={palette.chromeText} />
        </Pressable>
        <Text style={[styles.value, { color: palette.chromeText }]}>{t('tools.inspector.trackPosition', { number, total: trackCount, strings: t('common.strings', { count: stringCount }) })}</Text>
      </InspectorField>
    </InspectorSection>
  );
}

const TrackInformation = memo(TrackInformationView);

interface NotationFieldsProps extends Pick<TrackInspectorProps, 'palette' | 'trackIndex' | 'mode' | 'onChangeMode' | 'onChangeChordDisplay' | 'onSetTrackSlashNotation'> {
  readonly hasSlashNotation: boolean;
  readonly chordDisplay: ChordDisplay;
}

/** The staves shown (standard, tab, slashes) and the chords' names and diagrams. */
function NotationFieldsView({ palette, trackIndex, mode, hasSlashNotation, chordDisplay, onChangeMode, onChangeChordDisplay, onSetTrackSlashNotation }: NotationFieldsProps) {
  const t = useT();
  return (
    <>
      <InspectorField palette={palette} label={t('tools.inspector.notation')}>
        {STAVES.map(({ staff, label, tooltip }) => (
          <ChromeButton key={staff} palette={palette} label={t(label)} tooltip={t(tooltip)} isActive={showsStaff(mode, staff)} onPress={() => onChangeMode(toggleStaff(mode, staff))} />
        ))}
        <ChromeButton palette={palette} label={t('tools.inspector.slash')} tooltip={t('tools.inspector.slashTooltip')} isActive={hasSlashNotation} onPress={() => onSetTrackSlashNotation?.(trackIndex, !hasSlashNotation)} />
      </InspectorField>
      <InspectorField palette={palette} label={t('tools.inspector.chords')}>
        {CHORD_PARTS.map(({ part, label, tooltip }) => (
          <ChromeButton key={part} palette={palette} label={t(label)} tooltip={t(tooltip)} isActive={chordDisplay[part]} onPress={() => onChangeChordDisplay?.({ ...chordDisplay, [part]: !chordDisplay[part] })} />
        ))}
      </InspectorField>
    </>
  );
}

const NotationFields = memo(NotationFieldsView);

/** The capo and the neck's tuning (with the tunings the track's notes fit). */
function TuningFields({ palette, song, trackIndex, capo, notice, onSetTrackCapo, onSetTrackTuning, onDismissNotice }: TrackInspectorProps & { readonly capo: number }) {
  const t = useT();
  return (
    <>
      <InspectorField palette={palette} label={t('common.capo')}>
        <ChromeButton palette={palette} label="−" tooltip={t('tools.inspector.capoLower')} isEnabled={capo > 0} onPress={() => onSetTrackCapo(trackIndex, capo - 1)} />
        <Text style={[styles.capo, { color: palette.chromeText }]}>{capo === 0 ? t('common.none') : t('tools.inspector.capoFret', { fret: capo })}</Text>
        <ChromeButton palette={palette} label="+" tooltip={t('tools.inspector.capoHigher')} isEnabled={capo < MAX_CAPO} onPress={() => onSetTrackCapo(trackIndex, capo + 1)} />
      </InspectorField>
      <NeckSettings
        song={song}
        trackIndex={trackIndex}
        notice={notice}
        palette={onChrome(palette)}
        onSetTuning={(tuning) => onSetTrackTuning(trackIndex, tuning)}
        onDismissNotice={onDismissNotice}
        style={styles.tuning}
      />
    </>
  );
}

interface TrackSoundProps extends Pick<TrackInspectorProps, 'palette' | 'trackIndex' | 'onEditInstrument'> {
  readonly isPercussion: boolean;
  readonly instrumentName?: string;
}

/** The track's instrument (the picker), or the drum kit. */
function TrackSoundView({ palette, trackIndex, isPercussion, instrumentName, onEditInstrument }: TrackSoundProps) {
  const t = useT();
  return (
    <InspectorSection palette={palette} title={t('tools.inspector.sounds')}>
      <InspectorField palette={palette} label={t('common.instrument')}>
        <ChromeButton
          palette={palette}
          label={isPercussion ? t('tools.inspector.drums') : `♪ ${instrumentName ?? t('common.instrument')} ▾`}
          tooltip={isPercussion ? t('tools.inspector.drumsTooltip') : t('tools.inspector.instrumentTooltip')}
          isEnabled={!isPercussion}
          onPress={() => onEditInstrument(trackIndex)}
        />
      </InspectorField>
    </InspectorSection>
  );
}

const TrackSound = memo(TrackSoundView);

interface TrackEffectsProps extends Pick<TrackInspectorProps, 'palette' | 'trackIndex' | 'onPreviewMix'> {
  readonly effects?: readonly Effect[];
  readonly onSetTrackEffects: (trackIndex: number, effects: readonly Effect[]) => void;
}

/** The track's effect chain. */
function TrackEffectsView({ palette, trackIndex, effects, onSetTrackEffects, onPreviewMix }: TrackEffectsProps) {
  const t = useT();
  return (
    <InspectorSection palette={palette} title={t('tools.inspector.effects')}>
      <EffectChainEditor
        palette={palette}
        effects={effects ?? []}
        width={EFFECTS_WIDTH}
        onChange={(chain) => onSetTrackEffects(trackIndex, chain)}
        onPreview={(chain) => onPreviewMix?.(chain === undefined ? undefined : { trackIndex, effects: chain })}
      />
    </InspectorSection>
  );
}

const TrackEffects = memo(TrackEffectsView);

const styles = StyleSheet.create({
  swatch: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, marginRight: 4 },
  iconButton: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  value: { fontSize: 11 },
  capo: { minWidth: 52, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  tuning: { paddingHorizontal: 0, paddingTop: 4, backgroundColor: 'transparent' },
  lyricsSummary: { flexShrink: 1, fontSize: 11, marginRight: 6 },
});
