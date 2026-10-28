import { type Song, type StringAddress, findNote } from '@gp-editor/core';
import type { PlayingBeat } from '../score/row';
import type { Translate } from '../hooks/use-i18n';
import { t as translateNow } from './i18n/i18n';
import { tabFretOf } from './notation';
import type { LoopPass } from './practice-plan';
import type { PracticeSettings } from '../state/practice';
import { playbackTempo, tempoPercent } from './practice-tempo';
import { formatClock, measureStartSeconds, songSeconds } from './song-time';

/** The top bar's display (Guitar Pro's LCD): what is shown, where, and how fast. */
export interface LcdInfo {
  /** "2. E.Guitar I" */
  readonly track: string;
  /** "12/65": the playing bar, else the cursor's, of all bars. */
  readonly bar: string;
  readonly timeSignature: string;
  /** "00:22 / 02:00" at the playback speed, played straight through. */
  readonly clock: string;
  /** "♩ = 104" or "♩ = 92.5", with the playback speed when it is not 100% and a padlock with the tempo lock on. */
  readonly tempo: string;
  /** The tempo typing in the LCD starts from: the locked tempo with the tempo lock on, else the playback tempo. */
  readonly tempoBpm: number;
  /** What the cursor is on: "Voice 1 · Beat 3 · String 2 · Fret 5". */
  readonly position: string;
}

export interface LcdSource {
  readonly song: Song;
  readonly trackIndex: number;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  readonly practice: PracticeSettings;
  /** While a loop plays: the pass being played and its tempo (the speed trainer's). */
  readonly loopPass?: LoopPass;
  /** The words' language (`useT()`'s `t`); the language shown now when absent. */
  readonly t?: Translate;
}

function positionText(song: Song, cursor: StringAddress | undefined, t: Translate): string {
  if (cursor === undefined) {
    return '';
  }
  const note = findNote(song, cursor);
  const track = song.tracks[cursor.trackIndex];
  const what = note === undefined || track === undefined ? t('window.lcd.empty') : t('window.fret', { number: tabFretOf(track, note) });
  return t('window.lcd.position', { voice: cursor.voiceIndex + 1, beat: cursor.beatIndex + 1, string: cursor.string, what });
}

/** The tempo lock's mark after the tempo (the LCD tempo's tooltip names it). */
export const TEMPO_LOCK_MARK = '🔒';

function tempoText(tempo: number, percent: number, loopPass: LoopPass | undefined, isLocked: boolean, t: Translate): string {
  // A padlock, not a word: the tempo, speed, beat dots and count-in fit the LCD at a 1280 pt window.
  const lock = isLocked ? ` ${TEMPO_LOCK_MARK}` : '';
  if (loopPass !== undefined) {
    return `♩ = ${loopPass.tempo} · ${t('window.lcd.pass', { number: loopPass.passIndex + 1 })}${lock}`;
  }
  return percent === 100 ? `♩ = ${tempo}${lock}` : `♩ = ${tempo} (${percent}%)${lock}`;
}

export function lcdInfo({ song, trackIndex, cursor, playing, practice, loopPass, t = translateNow }: LcdSource): LcdInfo {
  const track = song.tracks[trackIndex];
  const measureIndex = playing?.measureIndex ?? cursor?.measureIndex ?? 0;
  const measureHeader = song.measureHeaders[measureIndex];
  const scale = practice.tempoScale;
  const { lockedTempo } = practice;
  const start = measureStartSeconds(song, scale, lockedTempo)[measureIndex] ?? 0;
  const tempo = playbackTempo(lockedTempo ?? measureHeader?.tempo ?? 0, scale);
  const percent = tempoPercent(scale);
  return {
    track: track === undefined ? '' : t('common.trackNumbered', { number: track.number, name: track.name || t('common.untitled') }),
    bar: `${measureIndex + 1}/${song.measureHeaders.length}`,
    timeSignature: measureHeader === undefined ? '' : `${measureHeader.timeSignature.numerator}/${measureHeader.timeSignature.denominator}`,
    clock: `${formatClock(start)} / ${formatClock(songSeconds(song, scale, lockedTempo))}`,
    tempo: tempoText(tempo, percent, playing === undefined ? undefined : loopPass, lockedTempo !== undefined, t),
    tempoBpm: lockedTempo ?? tempo,
    position: positionText(song, cursor, t),
  };
}
