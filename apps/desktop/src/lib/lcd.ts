import { type Song, type StringAddress, findNote } from '@gp-editor/core';
import type { PlayingBeat } from '../score/row';
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
  /** "♩ = 104" or "♩ = 92.5", with the playback speed when it is not 100% and "· locked" with the tempo lock on. */
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
}

function positionText(song: Song, cursor: StringAddress | undefined): string {
  if (cursor === undefined) {
    return '';
  }
  const note = findNote(song, cursor);
  const track = song.tracks[cursor.trackIndex];
  const what = note === undefined || track === undefined ? 'empty' : `Fret ${tabFretOf(track, note)}`;
  return `Voice ${cursor.voiceIndex + 1} · Beat ${cursor.beatIndex + 1} · String ${cursor.string} · ${what}`;
}

function tempoText(tempo: number, percent: number, loopPass: LoopPass | undefined, isLocked: boolean): string {
  const lock = isLocked ? ' · locked' : '';
  if (loopPass !== undefined) {
    return `♩ = ${loopPass.tempo} · pass ${loopPass.passIndex + 1}${lock}`;
  }
  return percent === 100 ? `♩ = ${tempo}${lock}` : `♩ = ${tempo} (${percent}%)${lock}`;
}

export function lcdInfo({ song, trackIndex, cursor, playing, practice, loopPass }: LcdSource): LcdInfo {
  const track = song.tracks[trackIndex];
  const measureIndex = playing?.measureIndex ?? cursor?.measureIndex ?? 0;
  const measureHeader = song.measureHeaders[measureIndex];
  const scale = practice.tempoScale;
  const { lockedTempo } = practice;
  const start = measureStartSeconds(song, scale, lockedTempo)[measureIndex] ?? 0;
  const tempo = playbackTempo(lockedTempo ?? measureHeader?.tempo ?? 0, scale);
  const percent = tempoPercent(scale);
  return {
    track: track === undefined ? '' : `${track.number}. ${track.name || 'Untitled'}`,
    bar: `${measureIndex + 1}/${song.measureHeaders.length}`,
    timeSignature: measureHeader === undefined ? '' : `${measureHeader.timeSignature.numerator}/${measureHeader.timeSignature.denominator}`,
    clock: `${formatClock(start)} / ${formatClock(songSeconds(song, scale, lockedTempo))}`,
    tempo: tempoText(tempo, percent, playing === undefined ? undefined : loopPass, lockedTempo !== undefined),
    tempoBpm: lockedTempo ?? tempo,
    position: positionText(song, cursor),
  };
}
