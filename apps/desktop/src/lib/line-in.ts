/** An audio input the line in can use (GPLineIn.m's devicesState). */
export interface LineInDevice {
  /** The device's UID. */
  readonly id: string;
  readonly name: string;
  /** The Mac's own microphone. */
  readonly isBuiltIn: boolean;
}

export interface LineInDevices {
  readonly devices: readonly LineInDevice[];
  /** The system's default input; empty when there is none. */
  readonly defaultId: string;
  /** The default output is the Mac's own speakers or headphone jack. */
  readonly isOutputBuiltIn: boolean;
}

/** The input gain's range in dB (GPLineIn.m clamps to the same). */
export const LINE_IN_GAIN = { min: -24, max: 24 } as const;
/** The level meter's floor in dBFS. */
const METER_FLOOR_DB = -60;

export const NO_LINE_IN_DEVICES: LineInDevices = { devices: [], defaultId: '', isOutputBuiltIn: false };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDevice(raw: unknown): LineInDevice | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    return undefined;
  }
  return { id: raw.id, name: raw.name, isBuiltIn: raw.isBuiltIn === true };
}

/** The native module's answer, checked: devices that are not well-formed are dropped. */
export function parseLineInDevices(raw: unknown): LineInDevices {
  if (!isRecord(raw)) {
    return NO_LINE_IN_DEVICES;
  }
  const devices = Array.isArray(raw.devices) ? raw.devices.flatMap((item: unknown) => parseDevice(item) ?? []) : [];
  return { devices, defaultId: typeof raw.defaultId === 'string' ? raw.defaultId : '', isOutputBuiltIn: raw.isOutputBuiltIn === true };
}

/** True when the chosen input (empty: the default) is the Mac's microphone and the sound comes out of its speakers. */
export function hasFeedbackRisk(devices: LineInDevices, deviceId: string): boolean {
  const id = deviceId === '' ? devices.defaultId : deviceId;
  return devices.isOutputBuiltIn && devices.devices.some((device) => device.id === id && device.isBuiltIn);
}

/** The track whose sound the line in plays through: the locked one, else the selected one. */
export function lineInTrackIndex(lock: { readonly lockedTrackIndex?: number }, selectedTrackIndex: number): number {
  return lock.lockedTrackIndex ?? selectedTrackIndex;
}

/** A peak in dBFS as the meter's fill, 0…1 over −60…0 dB. */
export function levelFraction(db: number): number {
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}
