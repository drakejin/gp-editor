// Grace note, trill and tremolo picking edits after TuxGuitar's TGChangeGraceNoteAction, TGChangeTrillNoteAction and
// TGChangeTremoloPickingAction (LGPL-2.1).
import { clampVelocity } from '../formats/common/velocity';
import { isNoteValue, plainDuration } from '../model/defaults';
import type { Grace, GraceTransition, Song, TremoloPicking, Trill } from '../model/song';
import type { StringAddress } from './addresses';
import { isFret } from './edit-song';
import { setCheckedEffect } from './effects';
import { isSameDuration } from './timeline';

/** Grace note lengths: 1 = 64th, 2 = 32nd, 3 = 16th (TGEffectGrace). */
const MIN_GRACE_DURATION = 1;
const MAX_GRACE_DURATION = 3;
const GRACE_TRANSITIONS: readonly GraceTransition[] = ['none', 'slide', 'bend', 'hammer'];

function isGraceDuration(duration: number): boolean {
  return Number.isInteger(duration) && duration >= MIN_GRACE_DURATION && duration <= MAX_GRACE_DURATION;
}

function normalizeGrace(grace: Grace): Grace | undefined {
  const { fret, duration, velocity, transition } = grace;
  if (!isFret(fret) || !isGraceDuration(duration) || !Number.isFinite(velocity) || !GRACE_TRANSITIONS.includes(transition)) {
    return undefined;
  }
  return { fret, duration, velocity: clampVelocity(velocity), transition, onBeat: grace.onBeat === true, isDead: grace.isDead === true };
}

function isSameGrace(a: Grace, b: Grace): boolean {
  return (
    a.fret === b.fret &&
    a.duration === b.duration &&
    a.velocity === b.velocity &&
    a.transition === b.transition &&
    a.onBeat === b.onBeat &&
    a.isDead === b.isDead
  );
}

/**
 * New song with the note's grace note set or cleared; its velocity is rounded and kept between ppp and fff. Same song
 * when nothing changes, there is no note, or the grace note is invalid (a fret off 0…MAX_FRET, a duration off 1…3, an
 * unknown transition).
 */
export function setNoteGrace(song: Song, at: StringAddress, grace: Grace | undefined): Song {
  return setCheckedEffect(song, at, 'grace', grace, { normalize: normalizeGrace, isSame: isSameGrace });
}

/** The trill at a plain note value; undefined for a fret off the neck or a value that is no note value. */
function normalizeTrill(trill: Trill): Trill | undefined {
  return isFret(trill.fret) && isNoteValue(trill.duration.value) ? { fret: trill.fret, duration: plainDuration(trill.duration.value) } : undefined;
}

/**
 * New song with the note's trill set (the fret it alternates with, at a plain note value: dots and tuplets are
 * dropped) or cleared. Same song when nothing changes, there is no note, or the fret or note value is invalid.
 */
export function setNoteTrill(song: Song, at: StringAddress, trill: Trill | undefined): Song {
  return setCheckedEffect(song, at, 'trill', trill, {
    normalize: normalizeTrill,
    isSame: (a, b) => a.fret === b.fret && isSameDuration(a.duration, b.duration),
  });
}

function normalizeTremoloPicking(tremoloPicking: TremoloPicking): TremoloPicking | undefined {
  const { value } = tremoloPicking.duration;
  return isNoteValue(value) ? { duration: plainDuration(value) } : undefined;
}

/**
 * New song with the note's tremolo picking set (its speed as a plain note value) or cleared. Same song when nothing
 * changes, there is no note, or the speed is no note value.
 */
export function setNoteTremoloPicking(song: Song, at: StringAddress, tremoloPicking: TremoloPicking | undefined): Song {
  return setCheckedEffect(song, at, 'tremoloPicking', tremoloPicking, {
    normalize: normalizeTremoloPicking,
    isSame: (a, b) => isSameDuration(a.duration, b.duration),
  });
}
