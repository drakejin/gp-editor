import { memo } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';
import type { LcdInfo } from '../lib/lcd';
import type { AppCommand } from '../state/app-command';
import type { PanelId, PanelVisibility } from '../state/panels';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';
import { PanelIcon } from './chrome/PanelIcon';
import { Lcd } from './Lcd';

/** Menus that open under a top-bar button. */
export type ChromeMenuId = 'new' | 'zoom' | 'speed';

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
  readonly panels: PanelVisibility;
  readonly onTogglePanel: (panel: PanelId) => void;
  /** Opens a menu under the pointer (`x` in window points). */
  readonly onOpenMenu: (menu: ChromeMenuId, x: number) => void;
  readonly onToggleLoop: () => void;
  readonly onCommand: (command: AppCommand) => void;
}

/**
 * Guitar Pro 8's top bar: files, panel toggles, zoom and undo on the left; the transport and the LCD in the middle;
 * loop, playback speed and the fretboard toggle on the right.
 */
function TopBarView(props: TopBarProps) {
  const { palette, panels } = props;
  return (
    <View style={[styles.bar, { backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}>
      <View style={styles.side}>
        <FileButtons {...props} />
        <Divider palette={palette} />
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
        <ChromeButton
          palette={palette}
          label="⟲ Loop"
          tooltip="Loop the bars set in the speed menu"
          isActive={props.isLooping}
          isEnabled={props.hasDocument}
          onPress={props.onToggleLoop}
        />
        <ChromeButton
          palette={palette}
          label={`♩ ${props.speedLabel} ▾`}
          tooltip="Playback speed, loop bars and speed trainer"
          isEnabled={props.hasDocument}
          isActive={props.speedLabel !== '100%'}
          onPress={(event) => props.onOpenMenu('speed', event.nativeEvent.pageX)}
          minWidth={72}
        />
        <Divider palette={palette} />
        <ChromeButton
          palette={palette}
          label=""
          icon={<PanelIcon side="neck" color={panels.neck ? palette.chromeAccent : palette.chromeMuted} />}
          tooltip="Show or hide the fretboard"
          onPress={() => props.onTogglePanel('neck')}
        />
      </View>
    </View>
  );
}

function FileButtons({ palette, hasDocument, isEdited, onCommand, onOpenMenu }: TopBarProps) {
  return (
    <>
      <ChromeButton palette={palette} label="New ▾" tooltip="New sheet (⌘N)" onPress={(event: GestureResponderEvent) => onOpenMenu('new', event.nativeEvent.pageX)} />
      <ChromeButton palette={palette} label="Open" tooltip="Open a Guitar Pro file (⌘O)" onPress={() => onCommand({ type: 'openFile' })} />
      <ChromeButton
        palette={palette}
        label={isEdited ? 'Save •' : 'Save'}
        tooltip="Save as Guitar Pro 5 (⌘S)"
        isEnabled={hasDocument}
        onPress={() => onCommand({ type: 'saveFile' })}
      />
      <ChromeButton palette={palette} label="Import PDF" tooltip="Import a PDF as tab, with Claude (⇧⌘I)" onPress={() => onCommand({ type: 'importPdf' })} />
      <ChromeButton palette={palette} label="Export" tooltip="Export a PDF (⌘P)" isEnabled={hasDocument} onPress={() => onCommand({ type: 'exportPdf' })} />
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
      <Lcd palette={palette} info={props.lcd} trackColor={props.trackColor} />
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
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', flexBasis: 0 },
  right: { justifyContent: 'flex-end' },
  transport: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 20, marginHorizontal: 6 },
});
