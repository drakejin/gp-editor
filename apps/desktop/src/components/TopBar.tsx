import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Translate, useT } from '../hooks/use-i18n';
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
  const t = useT();
  return (
    <View style={[styles.bar, { backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}>
      <View style={styles.side}>
        {(['palette', 'tracks', 'inspector'] as const).map((panel) => (
          <ChromeButton
            key={panel}
            palette={palette}
            label=""
            icon={<PanelIcon side={PANEL_SIDES[panel]} color={panels[panel] ? palette.chromeAccent : palette.chromeMuted} />}
            tooltip={panelTooltip(panel, t)}
            onPress={() => props.onTogglePanel(panel)}
          />
        ))}
        <Divider palette={palette} />
        <ChromeButton
          palette={palette}
          label={`${Math.round(props.zoom * 100)}% ▾`}
          tooltip={t('window.topBar.zoom')}
          isEnabled={props.hasDocument}
          onPress={(event) => props.onOpenMenu('zoom', event.nativeEvent.pageX)}
          minWidth={58}
        />
        <ChromeButton palette={palette} label="↶" fontSize={15} tooltip={t('window.topBar.undo')} isEnabled={props.canUndo} onPress={() => props.onCommand({ type: 'undo' })} />
        <ChromeButton palette={palette} label="↷" fontSize={15} tooltip={t('window.topBar.redo')} isEnabled={props.canRedo} onPress={() => props.onCommand({ type: 'redo' })} />
      </View>
      <Transport {...props} />
      <View style={[styles.side, styles.right]}>
        <PracticeButtons {...props} />
        <Divider palette={palette} />
        <ChromeButton
          palette={palette}
          label=""
          icon={<PanelIcon side="keyboard" color={panels.keyboard ? palette.chromeAccent : palette.chromeMuted} />}
          tooltip={t('window.topBar.keyboard')}
          onPress={() => props.onTogglePanel('keyboard')}
        />
        <ChromeButton
          palette={palette}
          label=""
          icon={<PanelIcon side="neck" color={panels.neck ? palette.chromeAccent : palette.chromeMuted} />}
          tooltip={t('window.topBar.fretboard')}
          onPress={() => props.onTogglePanel('neck')}
        />
        <ChromeButton palette={palette} label="?" fontSize={14} tooltip={t('window.topBar.shortcuts')} onPress={props.onShowShortcuts} />
      </View>
    </View>
  );
}

/** Loop, metronome, count-in and the playback speed: −, the speed menu, +. */
function PracticeButtons(props: TopBarProps) {
  const { palette } = props;
  const t = useT();
  return (
    <>
      <ChromeButton
        palette={palette}
        label={t('window.topBar.loop')}
        tooltip={t('window.topBar.loopTooltip')}
        isActive={props.isLooping}
        isEnabled={props.hasDocument}
        onPress={props.onToggleLoop}
      />
      <ChromeButton palette={palette} label={t('common.metronome')} fontSize={11} tooltip={t('window.topBar.metronomeTooltip')} isActive={props.isMetronomeOn} isEnabled={props.hasDocument} onPress={() => props.onTogglePractice('metronome')} />
      <ChromeButton palette={palette} label={t('window.countIn')} fontSize={11} tooltip={t('window.topBar.countInTooltip')} isActive={props.isCountInOn} isEnabled={props.hasDocument} onPress={() => props.onTogglePractice('countIn')} />
      <ChromeButton
        palette={palette}
        label="▾"
        fontSize={11}
        minWidth={18}
        tooltip={t('window.topBar.practiceMenu')}
        isEnabled={props.hasDocument}
        onPress={(event) => props.onOpenMenu('practice', event.nativeEvent.pageX)}
      />
      <ChromeButton palette={palette} label="−" fontSize={14} tooltip={t('window.topBar.slower')} isEnabled={props.hasDocument} onPress={() => props.onShiftSpeed(-SPEED_STEP_PERCENT)} />
      <ChromeButton
        palette={palette}
        label={`♩ ${props.speedLabel} ▾`}
        tooltip={t('window.topBar.speedMenu')}
        isEnabled={props.hasDocument}
        isActive={props.speedLabel !== '100%'}
        onPress={(event) => props.onOpenMenu('speed', event.nativeEvent.pageX)}
        minWidth={72}
      />
      <ChromeButton palette={palette} label="+" fontSize={14} tooltip={t('window.topBar.faster')} isEnabled={props.hasDocument} onPress={() => props.onShiftSpeed(SPEED_STEP_PERCENT)} />
    </>
  );
}

function Transport(props: TopBarProps) {
  const { palette, hasDocument, isPlaying, onCommand } = props;
  const t = useT();
  const jump = (jumpTo: 'first' | 'previous' | 'next' | 'last') => () => onCommand({ type: 'goToBar', jump: jumpTo });
  return (
    <View style={styles.transport}>
      <ChromeButton palette={palette} label="⏮︎" fontSize={14} tooltip={t('window.topBar.firstBar')} isEnabled={hasDocument} onPress={jump('first')} />
      <ChromeButton palette={palette} label="⏪︎" fontSize={14} tooltip={t('window.topBar.previousBar')} isEnabled={hasDocument} onPress={jump('previous')} />
      <ChromeButton
        palette={palette}
        label={isPlaying ? '⏸︎' : '▶︎'}
        fontSize={16}
        tooltip={isPlaying ? t('window.topBar.stop') : t('window.topBar.play')}
        isActive={isPlaying}
        isEnabled={hasDocument}
        minWidth={34}
        onPress={() => onCommand({ type: 'togglePlayback' })}
      />
      <ChromeButton palette={palette} label="⏩︎" fontSize={14} tooltip={t('window.topBar.nextBar')} isEnabled={hasDocument} onPress={jump('next')} />
      <ChromeButton palette={palette} label="⏭︎" fontSize={14} tooltip={t('window.topBar.lastBar')} isEnabled={hasDocument} onPress={jump('last')} />
      <Lcd palette={palette} info={props.lcd} trackColor={props.trackColor} beat={props.beat} onSetTempo={props.onSetTempo} />
    </View>
  );
}

function Divider({ palette }: { readonly palette: Palette }) {
  return <View style={[styles.divider, { backgroundColor: palette.chromeRaised }]} />;
}

const PANEL_SIDES = { palette: 'left', tracks: 'bottom', inspector: 'right' } as const;

function panelTooltip(panel: 'palette' | 'tracks' | 'inspector', t: Translate): string {
  switch (panel) {
    case 'palette':
      return t('window.topBar.palettePanel');
    case 'tracks':
      return t('window.topBar.tracksPanel');
    case 'inspector':
      return t('window.topBar.inspectorPanel');
  }
}

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
