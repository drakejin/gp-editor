import { EN_COMMANDS } from './commands';
import { EN_COMMON } from './common';
import { EN_DRUMS } from './drums';
import { EN_INSTRUMENTS } from './instruments';
import { EN_PALETTE } from './palette';
import { EN_SETTINGS } from './settings';
import { EN_STYLESHEET } from './stylesheet';
import { EN_TOOLS } from './tools';
import { EN_WINDOW } from './window';

/**
 * The English catalogue, the app's source language: one file per part of the app, each key starting with its file's
 * name ("window.topBar.play"). Its keys are the only message keys (`MessageKey`); every other catalogue has the same.
 */
export const EN = {
  ...EN_COMMON,
  ...EN_SETTINGS,
  ...EN_COMMANDS,
  ...EN_PALETTE,
  ...EN_WINDOW,
  ...EN_TOOLS,
  ...EN_INSTRUMENTS,
  ...EN_STYLESHEET,
  ...EN_DRUMS,
} as const;

export type MessageKey = keyof typeof EN;

/** Each catalogue file's name and its messages, for the test that keeps keys in their file. */
export const EN_FILES = {
  common: EN_COMMON,
  settings: EN_SETTINGS,
  commands: EN_COMMANDS,
  palette: EN_PALETTE,
  window: EN_WINDOW,
  tools: EN_TOOLS,
  instruments: EN_INSTRUMENTS,
  stylesheet: EN_STYLESHEET,
  drums: EN_DRUMS,
} as const;
