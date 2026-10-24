import type { TextStyle } from '@gp-editor/core';
import type { TextCommand } from './draw';

/** Whether two text styles draw alike. */
export function isSameTextStyle(a: TextStyle, b: TextStyle): boolean {
  return a.family === b.family && a.size === b.size && a.isBold === b.isBold && a.isItalic === b.isItalic;
}

/** A size in the stylesheet's proportion: `size` is drawn for `base`, so `style` draws it `style.size / base.size` larger. */
export function styledSize(size: number, style: TextStyle, base: TextStyle): number {
  return style.size === base.size ? size : Math.round(((size * style.size) / base.size) * 100) / 100;
}

/**
 * `command` in the stylesheet's `style` for its text: the command itself while the style is `base` (the style the
 * engraver draws it in), so a default stylesheet draws exactly what the app always drew; else with the style's family,
 * its size in proportion, bold (a text bold for its own reason, an over-full bar's number, stays bold) and italic.
 */
export function styleText(command: TextCommand, style: TextStyle, base: TextStyle): TextCommand {
  if (isSameTextStyle(style, base)) {
    return command;
  }
  const isBoldAnyway = command.bold === true && !base.isBold;
  // Unset keys are left out of the canvas's JSON.
  return {
    ...command,
    size: styledSize(command.size, style, base),
    bold: style.isBold || isBoldAnyway,
    italic: style.isItalic ? true : undefined,
    family: style.family === '' ? undefined : style.family,
  };
}
