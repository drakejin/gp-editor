import { Fragment } from 'react';
import { useT } from '../hooks/use-i18n';
import type { PanelAnchor } from '../hooks/use-track-info';
import { BAR_MENU_ITEMS, type BarMenuItem, type BarMenuTarget, barMenuHeading, barMenuLabel } from '../lib/bar-map-menu';
import type { Palette } from '../theme';
import { CHROME_MENU, ChromeMenu, MenuHeading, MenuItem, MenuSeparator } from './chrome/ChromeMenu';

/** The menu's height as ChromeMenu lays it out, in points (to open it above the click): its heading, items and separators. */
export const BAR_MENU_HEIGHT =
  2 * (CHROME_MENU.border + CHROME_MENU.padding) +
  CHROME_MENU.headingHeight +
  BAR_MENU_ITEMS.flat().length * CHROME_MENU.itemHeight +
  (BAR_MENU_ITEMS.length - 1) * CHROME_MENU.separatorHeight;

/** Where the menu's top goes: above the click (the bar map is at the window's bottom), else under it. */
export function barMenuTop(anchor: PanelAnchor): number {
  const above = anchor.y - BAR_MENU_HEIGHT;
  return above >= CHROME_MENU.edge ? above : anchor.y;
}

export interface BarMapMenuProps {
  readonly palette: Palette;
  readonly target: BarMenuTarget;
  /** The target track's name, as the window names it. */
  readonly trackName: string;
  /** The right-click, in the window's layout points. */
  readonly anchor: PanelAnchor;
  readonly windowWidth: number;
  readonly onChoose: (item: BarMenuItem) => void;
  /** Esc, a click outside. */
  readonly onClose: () => void;
}

/**
 * The bar map's menu at a right-clicked bar: insert a bar before or after it, or delete it (the selected bars), in its
 * track only; or insert or delete in every track, as the palette's +Bar and −Bar do.
 */
export function BarMapMenu({ palette, target, trackName, anchor, windowWidth, onChoose, onClose }: BarMapMenuProps) {
  useT();
  return (
    <ChromeMenu palette={palette} x={anchor.x + CHROME_MENU.inset} top={barMenuTop(anchor)} windowWidth={windowWidth} onClose={onClose}>
      <MenuHeading palette={palette} label={barMenuHeading(target, trackName)} />
      {BAR_MENU_ITEMS.map((items, groupIndex) => (
        <Fragment key={items.join()}>
          {groupIndex > 0 ? <MenuSeparator palette={palette} /> : null}
          {items.map((item) => (
            <MenuItem key={item} palette={palette} label={barMenuLabel(item, target)} onPress={() => onChoose(item)} />
          ))}
        </Fragment>
      ))}
    </ChromeMenu>
  );
}
