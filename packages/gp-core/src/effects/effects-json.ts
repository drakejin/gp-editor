// Effects from untrusted JSON (a saved file's effects entry, not in TuxGuitar): anything that is not an effect of a known
// type is dropped, missing parameters take their defaults, the others are clamped into range.
import type { Effect, EffectType, MasterMix } from '../model/song';
import { DEFAULT_MASTER, MASTER_GAIN, setMasterGain } from './effect-chain';
import { EFFECT_PARAMS, MASTER_EFFECT_TYPES, MAX_TRACK_EFFECTS, TRACK_EFFECT_TYPES, clampEffectParam } from './effect-params';

type JsonObject = Readonly<Record<string, unknown>>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON text parsed; undefined for text that is not JSON (a file's entry read as one that is not there). */
export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** An own property of a JSON object (never one from its prototype). */
export function ownValue(object: JsonObject, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function parseParams(type: EffectType, raw: unknown): Readonly<Record<string, number>> {
  const object = isJsonObject(raw) ? raw : {};
  return Object.fromEntries(
    EFFECT_PARAMS[type].map((spec) => {
      const value = ownValue(object, spec.id);
      return [spec.id, typeof value === 'number' ? clampEffectParam(spec, value) : spec.defaultValue];
    }),
  );
}

/** One effect of one of `types`; undefined for anything else. A missing `isEnabled` reads as on. */
export function parseEffect(raw: unknown, types: readonly EffectType[] = TRACK_EFFECT_TYPES): Effect | undefined {
  if (!isJsonObject(raw)) {
    return undefined;
  }
  const type = types.find((candidate) => candidate === ownValue(raw, 'type'));
  if (type === undefined) {
    return undefined;
  }
  return { type, isEnabled: ownValue(raw, 'isEnabled') !== false, params: parseParams(type, ownValue(raw, 'params')) };
}

/** A track's chain: its effects in order, at most MAX_TRACK_EFFECTS; anything but a list reads as no effects. */
export function parseEffectChain(raw: unknown): readonly Effect[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item: unknown) => parseEffect(item) ?? []).slice(0, MAX_TRACK_EFFECTS);
}

/** The master strip in its fixed order: each effect read from the first entry of its type, else the default's. */
export function parseMasterMix(raw: unknown): MasterMix {
  if (!isJsonObject(raw)) {
    return DEFAULT_MASTER;
  }
  const listed = ownValue(raw, 'effects');
  const items: readonly unknown[] = Array.isArray(listed) ? listed : [];
  const effects = MASTER_EFFECT_TYPES.map((type, index) => {
    const found = items.map((item) => parseEffect(item, [type])).find((effect) => effect !== undefined);
    return found ?? DEFAULT_MASTER.effects[index] ?? { type, isEnabled: false, params: parseParams(type, {}) };
  });
  const gainDb = ownValue(raw, 'gainDb');
  const gain = typeof gainDb === 'number' && Number.isFinite(gainDb) ? Math.min(MASTER_GAIN.max, Math.max(MASTER_GAIN.min, gainDb)) : 0;
  return setMasterGain({ effects, gainDb: DEFAULT_MASTER.gainDb }, gain);
}
