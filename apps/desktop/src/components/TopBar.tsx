import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PracticeToggle } from '../lib/key-commands';
import type { LcdInfo } from '../lib/lcd';
import type { MetronomeBeat } from '../lib/metronome-beat';
import { SPEED_STEP_PERCENT } from '../lib/practice-tempo';
import type { AppCommand } from '../state/app-command';
import type { PanelId, PanelVisibility } from '../state/panels';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';
import { PanelIcon } from './chrome/PanelIcon';
import { Lcd } from './Lcd';

/** Menus that open under a top-bar button. */
export type ChromeMenuId = 'zoom' | 'speed' | 'practice';

export const TOP_BAR_HEIGHT = 46;

export interface TopBarProps {
  readonly palette: Palette;
  readonly hasDocument: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isPlaying: boolean;
  readonly isEdited: boolean;
  readonly isLooping: boolean;
  readonly zoom: number;
  /** "100%" or "80%": the playback speed. */
  readonly speedLabel: string;
  readonly lcd?: LcdInfo;
  readonly trackColor?: string;
  /** The metronome's beat while playing (the LCD's beat dots). */
  readonly beat?: MetronomeBeat;
  /** A tempo typed in the LCD: the playback tempo, or the locked tempo with the tempo lock on. */
  readonly onSetTempo?: (tempo: number) => void;
  readonly isMetronomeOn: boolean;
  readonly isCountInOn: boolean;
  /** Guitar Pro's metronome and count-in buttons. */
  readonly onTogglePractice: (practice: PracticeToggle) => void;
  /** Relative speed −/+ (percent of the written tempo). */
  readonly onShiftSpeed: (delta: number) => void;
  readonly panels: PanelVisibility;
  readonly onTogglePanel: (panel: PanelId) => void;
  /** Opens a menu under the pointer (`x` in window points). */
  readonly onOpenMenu: (menu: ChromeMenuId, x: number) => void;
  readonly onToggleLoop: () => void;
  /** Help ▸ Keyboard Shortcuts (⌘H). */
  readonly onShowShortcuts: () => void;
  readonly onCommand: (command: AppCommand) => void;
}

/**
 * Guitar Pro 8's top bar: panel toggles, zoom and undo on the left; the transport and the LCD in the middle; loop,
 * metronome, count-in, playback speed (−, menu, +), the piano keyboard and fretboard toggles and the shortcut sheet on
 * the right. Files (New, Open, Save, Import PDF, Export PDF, Print) live in the macOS menu bar's File menu.
 */
function TopBarView(props: TopBarProps) {
  const { palette, panels } = props;
  return (
    <View style={[styles.bar, { backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}>
      <View style={styles.side}>
        {(['palette', 'tracks', 'inspector'] as const).map((panel) => (
          <ChromeButton
            key={panel}
            palette={palette}
            label=""
            icon={<PanelIcon side={PANEL_SIDES[panel]} color={panels[panel] ? palette.chromeAccent : palette.chromeMuted} />}
            tooltip={PANEL_TOOLTIPS[panel]}
            onPress={() => props.onTogglePanel(panel)}
          />
        ))}
        <Divider palette={palette} />
        <ChromeButton
          palette={palette}
          label={`${Math.round(props.zoom * 100)}% ▾`}
          tooltip="Zoom (⌘- / ⌘=)"
          isEnabled={props.hasDocument}
          onPress={(event) => props.onOpenMenu('zoom', event.nativeEvent.pageX)}
          minWidth={58}
        />
        <ChromeButton palette={palette} label="↶" fontSize={15} tooltip="Undo (⌘Z)" isEnabled={props.canUndo} onPress={() => props.onCommand({ type: 'undo' })} />
        <ChromeButton palette={palette} label="↷" fontSize={15} tooltip="Redo (⇧⌘Z)" isEnabled={props.canRedo} onPress={() => props.onCommand({ type: 'redo' })} />
      </View>
      <Transport {...props} />
      <View style={[styles.side, styles.right]}>
        <PracticeButtons {...props} />
        <Divider palette={palette} />
        <ChromeButton
          palette={palette}
          label=""
          icon={<PanelIcon side="keyboard" color={panels.keyboard ? palette.chromeAccent : palette.chromeMuted} />}
          tooltip="Show or hide the piano keyboard"
          onPress={() => props.onTogglePanel('keyboard')}
        />
        <ChromeButton
          palette={palette}
          label=""
          icon={<PanelIcon side="neck" color={panels.neck ? palette.chromeAccent : palette.chromeMuted} />}
          tooltip="Show or hide the fretboard"
          onPress={() => props.onTogglePanel('neck')}
        />
        <ChromeButton palette={palette} label="?" fontSize={14} tooltip="Keyboard shortcuts (⌘H)" onPress={props.onShowShortcuts} />
      </View>
    </View>
  );
}

/** Loop, metronome, count-in and the playback speed: −, the speed menu, +. */
function PracticeButtons(props: TopBarProps) {
  const { palette } = props;
  return (
    <>
      <ChromeButton
        palette={palette}
        label="⟲ Loop"
        tooltip="Loop the bars set in the speed menu"
        isActive={props.isLooping}
        isEnabled={props.hasDocument}
        onPress={props.onToggleLoop}
      />
      <ChromeButton palette={palette} label="Metronome" fontSize={11} tooltip="Metronome: a click on every beat (⌥M)" isActive={props.isMetronomeOn} isEnabled={props.hasDocument} onPress={() => props.onTogglePractice('metronome')} />
      <ChromeButton palette={palette} label="Count-in" fontSize={11} tooltip="Count-in: a bar of clicks before playback (⌥C)" isActive={props.isCountInOn} isEnabled={props.hasDocument} onPress={() => props.onTogglePractice('countIn')} />
      <ChromeButton
        palette={palette}
        label="▾"
        fontSize={11}
        minWidth={18}
        tooltip="Metronome volume, count-in, tempo lock and note preview on hover"
        isEnabled={props.hasDocument}
        onPress={(event) => props.onOpenMenu('practice', event.nativeEvent.pageX)}
      />
      <ChromeButton palette={palette} label="−" fontSize={14} tooltip="Slower: playback speed −5% (⌥-)" isEnabled={props.hasDocument} onPress={() => props.onShiftSpeed(-SPEED_STEP_PERCENT)} />
      <ChromeButton
        palette={palette}
        label={`♩ ${props.speedLabel} ▾`}
        tooltip="Playback speed, loop bars, speed trainer, metronome volume and tempo lock"
        isEnabled={props.hasDocument}
        isActive={props.speedLabel !== '100%'}
        onPress={(event) => props.onOpenMenu('speed', event.nativeEvent.pageX)}
        minWidth={72}
      />
      <ChromeButton palette={palette} label="+" fontSize={14} tooltip="Faster: playback speed +5% (⌥=)" isEnabled={props.hasDocument} onPress={() => props.onShiftSpeed(SPEED_STEP_PERCENT)} />
    </>
  );
}

function Transport(props: TopBarProps) {
  const { palette, hasDocument, isPlaying, onCommand } = props;
  const jump = (jumpTo: 'first' | 'previous' | 'next' | 'last') => () => onCommand({ type: 'goToBar', jump: jumpTo });
  return (
    <View style={styles.transport}>
      <ChromeButton palette={palette} label="⏮︎" fontSize={14} tooltip="First bar (Home)" isEnabled={hasDocument} onPress={jump('first')} />
      <ChromeButton palette={palette} label="⏪︎" fontSize={14} tooltip="Previous bar (⌥←)" isEnabled={hasDocument} onPress={jump('previous')} />
      <ChromeButton
        palette={palette}
        label={isPlaying ? '⏸︎' : '▶︎'}
        fontSize={16}
        tooltip={isPlaying ? 'Stop (Space)' : 'Play from the cursor’s bar (Space)'}
        isActive={isPlaying}
        isEnabled={hasDocument}
        minWidth={34}
        onPress={() => onCommand({ type: 'togglePlayback' })}
      />
      <ChromeButton palette={palette} label="⏩︎" fontSize={14} tooltip="Next bar (⌥→)" isEnabled={hasDocument} onPress={jump('next')} />
      <ChromeButton palette={palette} label="⏭︎" fontSize={14} tooltip="Last bar (End)" isEnabled={hasDocument} onPress={jump('last')} />
      <Lcd palette={palette} info={props.lcd} trackColor={props.trackColor} beat={props.beat} onSetTempo={props.onSetTempo} />
    </View>
  );
}

function Divider({ palette }: { readonly palette: Palette }) {
  return <View style={[styles.divider, { backgroundColor: palette.chromeRaised }]} />;
}

const PANEL_SIDES = { palette: 'left', tracks: 'bottom', inspector: 'right' } as const;

const PANEL_TOOLTIPS: Readonly<Record<'palette' | 'tracks' | 'inspector', string>> = {
  palette: 'Show or hide the edition palette',
  tracks: 'Show or hide the tracks and bar map',
  inspector: 'Show or hide the Song / Track inspector',
};

export const TopBar = memo(TopBarView);

const styles = StyleSheet.create({
  bar: { height: TOP_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1 },
  // Each side as wide as its buttons at least, the space left shared: the transport stays between them, centred when
  // the window is wide enough.
  side: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  transport: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  divider: { width: 1, height: 20, marginHorizontal: 6 },
});
