// A blank song after TuxGuitar's TGSongManager.newSong (one guitar track, 4/4 at 120 bpm), LGPL-2.1.
import { DEFAULT_CHANNEL, EMPTY_SONG_INFO, RED, STANDARD_TUNING, measureTicks } from '../model/defaults';
import { type Measure, type MeasureHeader, QUARTER_TIME, type Song, type Track } from '../model/song';
import { GP5_VERSION } from '../write/gp5-writer';
import { restEvents, toBeats } from './timeline';

/** Bars a new song starts with, so there is room to write before adding bars. */
export const NEW_SONG_MEASURES = 4;
const NEW_SONG_TEMPO = 120;
const NEW_SONG_CHANNEL_ID = 1;
/** Voices per beat, as Guitar Pro 5 files have. */
const VOICE_COUNT = 2;

function newHeader(index: number): MeasureHeader {
  const timeSignature = { numerator: 4, denominator: 4 };
  return {
    number: index + 1,
    start: QUARTER_TIME + index * measureTicks(timeSignature.numerator, timeSignature.denominator),
    timeSignature,
    tempo: NEW_SONG_TEMPO,
    repeatOpen: false,
    repeatClose: 0,
    repeatAlternative: 0,
    tripletFeel: 'none',
  };
}

/** A measure of rests in the first voice. */
function restMeasure(header: MeasureHeader, headerIndex: number): Measure {
  const rests = restEvents(measureTicks(header.timeSignature.numerator, header.timeSignature.denominator)) ?? [];
  const voices = Array.from({ length: VOICE_COUNT }, (_, voiceIndex) => (voiceIndex === 0 ? rests : []));
  return { headerIndex, clef: 'treble', keySignature: 0, beats: toBeats(header.start, { voiceCount: VOICE_COUNT, voices }, []) };
}

/** A blank sheet: one 6-string guitar track in standard tuning and NEW_SONG_MEASURES empty 4/4 bars. Saved as GP5. */
export function buildNewSong(): Song {
  const measureHeaders = Array.from({ length: NEW_SONG_MEASURES }, (_, index) => newHeader(index));
  const track: Track = {
    number: 1,
    name: 'Track 1',
    channelId: NEW_SONG_CHANNEL_ID,
    strings: STANDARD_TUNING.map((tuning, index) => ({ number: index + 1, tuning })),
    color: RED,
    offset: 0,
    isPercussion: false,
    solo: false,
    mute: false,
    measures: measureHeaders.map(restMeasure),
  };
  return {
    source: { format: 'gp5', version: GP5_VERSION },
    info: EMPTY_SONG_INFO,
    channels: [{ ...DEFAULT_CHANNEL, id: NEW_SONG_CHANNEL_ID }],
    measureHeaders,
    tracks: [track],
  };
}
