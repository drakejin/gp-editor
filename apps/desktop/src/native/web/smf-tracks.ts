// Silent tracks for the Windows build's player: GPMidiEngine mutes a track of the sequence (the metronome's while the
// metronome is off); spessasynth's sequencer mutes only channels, and the clicks share the drums' channel 10, so the
// muted tracks' chunks are emptied in the file before it plays. Each track of a Standard MIDI File keeps its own delta
// times, so emptying one leaves the others' timing as it was.

/** An empty track: only End of Track. */
const EMPTY_TRACK = Uint8Array.of(0x00, 0xff, 0x2f, 0x00);
const CHUNK_HEADER_BYTES = 8;

function chunkLength(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset + 4);
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(CHUNK_HEADER_BYTES + data.length);
  out.set([...type].map((character) => character.charCodeAt(0)));
  new DataView(out.buffer).setUint32(4, data.length);
  out.set(data, CHUNK_HEADER_BYTES);
  return out;
}

/**
 * The file with the tracks at `trackIndexes` (0 = the first MTrk chunk, the conductor in renderMidi's files) emptied;
 * the file itself when there are none to empty, or when it is not a well-formed SMF.
 */
export function silenceTracks(bytes: Uint8Array, trackIndexes: readonly number[]): Uint8Array {
  if (trackIndexes.length === 0 || chunkType(bytes, 0) !== 'MThd') {
    return bytes;
  }
  const parts: Uint8Array[] = [];
  let offset = 0;
  let trackIndex = 0;
  while (offset + CHUNK_HEADER_BYTES <= bytes.length) {
    const end = offset + CHUNK_HEADER_BYTES + chunkLength(bytes, offset);
    if (end > bytes.length) {
      return bytes;
    }
    const type = chunkType(bytes, offset);
    const isSilenced = type === 'MTrk' && trackIndexes.includes(trackIndex);
    parts.push(isSilenced ? chunk(type, EMPTY_TRACK) : bytes.subarray(offset, end));
    trackIndex += type === 'MTrk' ? 1 : 0;
    offset = end;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => {
    out.set(part, at);
    return at + part.length;
  }, 0);
  return out;
}
