/** Base class for every error raised while reading a Guitar Pro file. */
export class GpFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GpFormatError';
  }
}

/** The bytes are not a Guitar Pro file this library recognises. */
export class UnsupportedFormatError extends GpFormatError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}

/** The file ended before the structure being read was complete. */
export class UnexpectedEndOfFileError extends GpFormatError {
  constructor(position: number, wanted: number, length: number) {
    super(`Unexpected end of file at byte ${position}: wanted ${wanted} byte(s), file has ${length}`);
    this.name = 'UnexpectedEndOfFileError';
  }
}

/** A transcription (a model's answer for one page of sheet music) that cannot be turned into a song. */
export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/** A song writer's plan (a model's answer to plan_song) that cannot be written into a song. */
export class CompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositionError';
  }
}
