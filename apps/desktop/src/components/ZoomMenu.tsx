import type { Stylesheet } from '@gp-editor/core';
import { useT } from '../hooks/use-i18n';
import type { ScoreZoom } from '../lib/score-zoom';
import { percentText, spacingText, stepScale, stepSystemSpacing } from '../lib/stylesheet-draft';
import { ZOOM_LEVELS } from '../state/panels';
import type { Palette } from '../theme';
import { MenuButton, MenuHeading, MenuItem, MenuSeparator, MenuStepper } from './chrome/ChromeMenu';

export interface ZoomMenuProps {
  readonly palette: Palette;
  readonly zoom: ScoreZoom;
  readonly onZoom: (zoom: ScoreZoom) => void;
  /** The shown document's stylesheet (its scale and the room between systems); none without a document. */
  readonly stylesheet?: Stylesheet;
  /** The stylesheet with a value changed: one undo step, on the screen and the printed page at once. */
  readonly onChangeStylesheet: (sheet: Stylesheet) => void;
  /** File ▸ Stylesheet… (F7). */
  readonly onOpenStylesheet: () => void;
  readonly onClose: () => void;
}

/** How dense the score is: the stylesheet's scale and the room between systems (the song's, saved with it). */
function DensitySteppers({ palette, stylesheet, onChangeStylesheet, onOpenStylesheet, onClose }: Omit<ZoomMenuProps, 'zoom' | 'onZoom'> & { readonly stylesheet: Stylesheet }) {
  const t = useT();
  // A step that changes nothing (at the end of the range) is no edit.
  const change = (next: Stylesheet) =>
    next.scale === stylesheet.scale && next.systems.systemSpacing === stylesheet.systems.systemSpacing ? undefined : onChangeStylesheet(next);
  return (
    <>
      <MenuSeparator palette={palette} />
      <MenuHeading palette={palette} label={t('window.zoomMenu.stylesheet')} />
      <MenuStepper
        palette={palette}
        label={t('stylesheet.page.scale')}
        value={percentText(stylesheet.scale)}
        tooltip={t('window.zoomMenu.scaleTooltip')}
        onDecrease={() => change(stepScale(stylesheet, -1))}
        onIncrease={() => change(stepScale(stylesheet, 1))}
      />
      <MenuStepper
        palette={palette}
        label={t('stylesheet.systems.betweenSystems')}
        value={spacingText(stylesheet.systems.systemSpacing)}
        tooltip={t('window.zoomMenu.systemSpacingTooltip')}
        onDecrease={() => change(stepSystemSpacing(stylesheet, -1))}
        onIncrease={() => change(stepSystemSpacing(stylesheet, 1))}
      />
      <MenuButton
        palette={palette}
        label={t('commands.title.file.stylesheet')}
        tooltip={t('window.zoomMenu.stylesheetTooltip')}
        onPress={() => {
          onClose();
          onOpenStylesheet();
        }}
      />
    </>
  );
}

/**
 * The top bar's zoom menu (Guitar Pro 8's zoom, 25 %–400 %): a fit to the printed page's width or the whole page, the
 * levels, and the stylesheet's scale and room between systems, which the printed page follows too.
 */
export function ZoomMenu(props: ZoomMenuProps) {
  const { palette, zoom, onZoom, onClose, stylesheet } = props;
  const t = useT();
  const choose = (next: ScoreZoom) => () => {
    onZoom(next);
    onClose();
  };
  return (
    <>
      <MenuItem palette={palette} label={t('window.zoomMenu.fitWidth')} isChecked={zoom === 'fitWidth'} onPress={choose('fitWidth')} />
      <MenuItem palette={palette} label={t('window.zoomMenu.fitPage')} isChecked={zoom === 'fitPage'} onPress={choose('fitPage')} />
      <MenuSeparator palette={palette} />
      {ZOOM_LEVELS.map((level) => (
        <MenuItem key={level} palette={palette} label={`${Math.round(level * 100)}%`} isChecked={zoom === level} onPress={choose(level)} />
      ))}
      {stylesheet === undefined ? null : <DensitySteppers {...props} stylesheet={stylesheet} />}
    </>
  );
}
