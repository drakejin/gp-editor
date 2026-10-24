import { GM_INSTRUMENT_FAMILIES, GM_INSTRUMENT_NAMES, type Song, type TrackKind, gmPercussionName } from '@gp-editor/core';
import { type MessageKey, isMessageKey, t } from './i18n/i18n';

export interface TrackInstrument {
  /** General MIDI program 0–127 of the track's channel. */
  readonly program: number;
  readonly name: string;
  readonly isPercussion: boolean;
}

/**
 * The names the app shows for gp-core's tables (General MIDI programs, families and percussion keys, track kinds,
 * tunings), in the shown language: gp-core keeps its English names as data, the catalogues hold the words shown.
 */

/** A General MIDI program's name ("Distortion Electric Guitar"); "Program 129" for a number outside 0–127. */
export function gmProgramName(program: number): string {
  const key = `instruments.gm.${program}`;
  return Number.isInteger(program) && program >= 0 && program < GM_INSTRUMENT_NAMES.length && isMessageKey(key) ? t(key) : t('instruments.program', { number: program + 1 });
}

/** One of the 16 General MIDI families ("Guitar"), by its index in GM_INSTRUMENT_FAMILIES. */
export function gmFamilyName(familyIndex: number): string {
  const key = `instruments.family.${familyIndex}`;
  return familyIndex >= 0 && familyIndex < GM_INSTRUMENT_FAMILIES.length && isMessageKey(key) ? t(key) : '';
}

/** A General MIDI percussion key's name ("Hi Bongo"); undefined for a key without one (as gmPercussionName). */
export function gmPercussionLabel(key: number): string | undefined {
  const messageKey = `instruments.drum.${key}`;
  return gmPercussionName(key) !== undefined && isMessageKey(messageKey) ? t(messageKey) : undefined;
}

const TRACK_KIND_NAMES: Readonly<Record<TrackKind, MessageKey>> = {
  guitar: 'instruments.kind.guitar',
  bass: 'instruments.kind.bass',
  banjo: 'instruments.kind.banjo',
  ukulele: 'instruments.kind.ukulele',
  drums: 'instruments.kind.drums',
  keys: 'instruments.kind.keys',
  other: 'instruments.kind.other',
};

/** A kind of new track as the Add Track panel names it ("Guitar", "Other"). */
export function trackKindName(kind: TrackKind): string {
  return t(TRACK_KIND_NAMES[kind]);
}

/** A tuning preset's or tuning choice's name ("Standard", "Drop D"), by its id; its own name when the id is unknown. */
export function tuningName(tuning: { readonly id: string; readonly name: string }): string {
  const key = `instruments.tuning.${tuning.id}`;
  return isMessageKey(key) ? t(key) : tuning.name;
}

/** The label of a piece of the drum kit view ("Kick", "Hi-hat"), by its id (score/drum-kit.ts' DRUM_PIECES). */
export function drumPieceLabel(id: string): string {
  const key = `instruments.kit.${id}`;
  return isMessageKey(key) ? t(key) : id;
}

/** What a track sounds like: its channel's General MIDI instrument, or drums. Undefined without track or channel. */
export function trackInstrument(song: Song, trackIndex: number): TrackInstrument | undefined {
  const track = song.tracks[trackIndex];
  const channel = song.channels.find((candidate) => candidate.id === track?.channelId);
  if (track === undefined || channel === undefined) {
    return undefined;
  }
  const isPercussion = track.isPercussion || channel.isPercussion;
  const name = isPercussion ? t('instruments.drums') : gmProgramName(channel.program);
  return { program: channel.program, name, isPercussion };
}
