// Design Mode's edits (Guitar Pro 8's beat positions, bar widths and bars per system; no TuxGuitar counterpart). A bar's
// layout lives on its measure header, so inserting or deleting bars keeps it on its bar. Every edit returns the same
// song when nothing changes, and a bar back at its natural layout has no design at all.
import type { BarDesign, BeatOffset, MeasureHeader, Song } from '../model/song';
import { isSameJson, parseBarDesign } from '../stylesheet/stylesheet-json';

function withHeaderDesign(header: MeasureHeader, design: BarDesign | undefined): MeasureHeader {
  const { design: _previous, ...plain } = header;
  return design === undefined ? plain : { ...plain, design };
}

/** The bar's design changed by `change`, checked and clamped; the same song when it comes out unchanged. */
function changeDesign(song: Song, measureIndex: number, change: (design: BarDesign) => BarDesign): Song {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined) {
    return song;
  }
  const design = parseBarDesign(change(header.design ?? {}));
  if (isSameJson(design, header.design)) {
    return song;
  }
  const measureHeaders = song.measureHeaders.map((current, index) => (index === measureIndex ? withHeaderDesign(current, design) : current));
  return { ...song, measureHeaders };
}

/** The beats starting `at` ticks after the bar's start drawn `offset` points away from where the layout puts them (0: back). */
export function setBeatOffset(song: Song, measureIndex: number, at: number, offset: number): Song {
  return changeDesign(song, measureIndex, (design) => {
    const others: readonly BeatOffset[] = (design.beatOffsets ?? []).filter((beat) => beat.at !== at);
    return { ...design, beatOffsets: [{ at, offset }, ...others] };
  });
}

/** The bar's width against its natural width (1: as laid out). */
export function setBarWidthScale(song: Song, measureIndex: number, widthScale: number): Song {
  return changeDesign(song, measureIndex, (design) => ({ ...design, widthScale }));
}

/** A system starts at the bar holding `bars` bars (0: as many as fit); undefined: the bar starts no system of its own. */
export function setSystemBars(song: Song, measureIndex: number, bars: number | undefined): Song {
  return changeDesign(song, measureIndex, (design) => {
    const { systemBars: _previous, ...rest } = design;
    return bars === undefined ? rest : { ...rest, systemBars: bars };
  });
}

/** Every bar (or the bars of `measureIndexes`) back to its natural layout: Guitar Pro 8's Reset (View ▸ Spacing Tools). */
export function clearBarDesign(song: Song, measureIndexes?: readonly number[]): Song {
  const isCleared = (index: number) => measureIndexes === undefined || measureIndexes.includes(index);
  if (!song.measureHeaders.some((header, index) => header.design !== undefined && isCleared(index))) {
    return song;
  }
  return { ...song, measureHeaders: song.measureHeaders.map((header, index) => (header.design !== undefined && isCleared(index) ? withHeaderDesign(header, undefined) : header)) };
}

/** Whether a bar of the song was laid out by hand in Design Mode. */
export function hasBarDesign(song: Song): boolean {
  return song.measureHeaders.some((header) => header.design !== undefined);
}
