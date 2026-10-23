import { PALETTE_GROUPS } from '../components/palette/palette-groups';
import type { PaletteGroup, PaletteOption, PaletteStepper, PaletteTool } from '../components/palette/palette-tools';
import type { AppCommand } from '../state/app-command';
import type { SongEdit } from '../state/song-edits';
import { type Command, editorRow, isRequirementMet } from './command-types';
import type { KeyCommand } from './key-commands';

/** A tooltip without the key it names at the end: "Tie to the previous note (T)" → "Tie to the previous note". */
export function withoutKeyNote(tooltip: string): string {
  return tooltip.replace(/\s*\([^()]*\)$/, '');
}

/** A tool's short name, the start of its tooltip: "Slides: shift, legato …" → "Slides", "Trill (with …)" → "Trill". */
export function toolName(tooltip: string): string {
  return tooltip.split(/:|\s\(|\s—/)[0]?.trim() ?? tooltip;
}

function firstWord(text: string): string {
  return text.split(' ')[0]?.toLowerCase() ?? '';
}

/** An option's title: its tooltip, after the tool's name when the tooltip does not start with it ("Tuplet: 3-tuplet"). */
export function optionTitle(tool: PaletteTool, option: PaletteOption): string {
  const name = toolName(tool.tooltip);
  return firstWord(option.tooltip) === firstWord(name) ? option.tooltip : `${name}: ${option.tooltip}`;
}

/** The tool's face as a word to search by, unless it is a music symbol (a private-use code point). */
function faceKeywords(tool: PaletteTool): readonly string[] {
  return tool.glyph === undefined ? [tool.face] : [];
}

const edit = (songEdit: SongEdit): AppCommand => ({ type: 'edit', edit: songEdit });

/** A palette command: it needs what its tool needs (a note, a beat, a bar). */
function paletteRow(id: string, group: PaletteGroup, title: string, command: AppCommand | KeyCommand, scope: PaletteTool['scope'], keywords: readonly string[]): Command {
  return editorRow(id, group.title, title, command, { when: scope, keywords: [...keywords, 'palette'] });
}

function toolCommands(group: PaletteGroup, tool: PaletteTool): readonly Command[] {
  const { run } = tool;
  const id = `palette.${tool.id}`;
  const title = withoutKeyNote(tool.tooltip);
  switch (run.kind) {
    case 'edit':
      return [paletteRow(id, group, title, edit(run.edit), tool.scope, faceKeywords(tool))];
    case 'action':
      return [paletteRow(id, group, title, run.action, tool.scope, faceKeywords(tool))];
    case 'panel':
      return [paletteRow(id, group, title, { type: 'openNotePanel', panel: run.panel }, tool.scope, faceKeywords(tool))];
    case 'chordPanel':
      return [paletteRow(id, group, title, { type: 'openChordPanel' }, tool.scope, faceKeywords(tool))];
    case 'options':
      return run.options.map((option, index) => paletteRow(`${id}.${index}`, group, optionTitle(tool, option), edit(option.edit), tool.scope, [option.label, toolName(tool.tooltip)]));
    case 'text':
      // A text tool needs the field under its group; the palette has none.
      return [];
  }
}

function stepperCommands(group: PaletteGroup, stepper: PaletteStepper): readonly Command[] {
  const name = withoutKeyNote(stepper.tooltip);
  const step = (direction: 'minus' | 'plus'): Command => {
    const base = paletteRow(`palette.${stepper.id}.${direction}`, group, `${name} (${direction === 'minus' ? '−' : '+'})`, edit(stepper[direction]), 'bar', [
      stepper.label,
      ...(direction === 'minus' ? ['down', 'less', 'fewer'] : ['up', 'more']),
    ]);
    return { ...base, isEnabled: (state) => isRequirementMet('bar', state) && (stepper.isEnabled?.(state.palette) ?? true) };
  };
  return [step('minus'), step('plus')];
}

/** The edition palette's tools as commands: each tool, each option of an option strip, each stepper's − and +. */
export function paletteCommands(groups: readonly PaletteGroup[]): readonly Command[] {
  return groups.flatMap((group) => [...group.tools.flatMap((tool) => toolCommands(group, tool)), ...(group.steppers ?? []).flatMap((stepper) => stepperCommands(group, stepper))]);
}

export const PALETTE_COMMANDS: readonly Command[] = paletteCommands(PALETTE_GROUPS);
