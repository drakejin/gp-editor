import type { Charset } from '../io/text';

export interface ReadOptions {
  /**
   * Encoding of Guitar Pro 1–5 strings (the format does not record it).
   * Default 'auto': UTF-8 if the bytes are valid UTF-8, else windows-1252.
   * Labels such as 'euc-kr' or 'shift_jis' need a runtime TextDecoder.
   */
  readonly charset?: Charset;
}

export interface ResolvedReadOptions {
  readonly charset: Charset;
}

export function resolveReadOptions(options: ReadOptions = {}): ResolvedReadOptions {
  return { charset: options.charset ?? 'auto' };
}
