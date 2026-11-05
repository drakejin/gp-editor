import { Fragment } from 'react';
import { useT } from '../hooks/use-i18n';
import type { PanelAnchor } from '../hooks/use-track-info';
import { BAR_MENU_ITEMS, type BarMenuItem, type BarMenuTarget, barMenuHeading, barMenuLabel } from '../lib/bar-map-menu';
import type { Palette } from '../theme';
import { ChromeMenu, MenuHeading, MenuItem, MenuSeparator } from './chrome/ChromeMenu';

/**
 * The menu's height as ChromeMenu lays it out, in points (to open it above the click): its padding and border (12), the
 * heading (17), five items (22 each) and a separator (11).
 */
export const BAR_MENU_HEIGHT = 12 + 17 + 5 * 22 + 11;
/** Its least distance from the window's top, and ChromeMenu's offset of its left edge from the click. */
const EDGE = 8;
const MENU_INSET = 16;

/** Where the menu's top goes: above the click (the bar map is at the window's bottom), else under it. */
export function barMenuTop(anchor: PanelAnchor): number {
  const above = anchor.y - BAR_MENU_HEIGHT;
  return above >= EDGE ? above : anchor.y;
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
    <ChromeMenu palette={palette} x={anchor.x + MENU_INSET} top={barMenuTop(anchor)} windowWidth={windowWidth} onClose={onClose}>
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
