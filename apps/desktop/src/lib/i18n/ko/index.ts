import type { EN } from '../en';
import type { Catalog } from '../messages';
import { KO_COMMANDS } from './commands';
import { KO_COMMON } from './common';
import { KO_INSTRUMENTS } from './instruments';
import { KO_PALETTE } from './palette';
import { KO_SETTINGS } from './settings';
import { KO_STYLESHEET } from './stylesheet';
import { KO_TOOLS } from './tools';
import { KO_WINDOW } from './window';

/** The Korean catalogue: exactly the English keys (each file is typed against its English file). */
export const KO: Catalog<typeof EN> = {
  ...KO_COMMON,
  ...KO_SETTINGS,
  ...KO_COMMANDS,
  ...KO_PALETTE,
  ...KO_WINDOW,
  ...KO_TOOLS,
  ...KO_INSTRUMENTS,
  ...KO_STYLESHEET,
};
