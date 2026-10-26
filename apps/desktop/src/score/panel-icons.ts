import type { DrawCommand } from './draw';

/** Icons of the tracks panel's switches, drawn by the native canvas in a PANEL_ICON_SIZE square (origin top-left); the tracks' own icons are track-icons.ts'. */
export const PANEL_ICON_SIZE = 16;

/** An open eye: the track shown in the score. */
export function engraveEyeIcon(color: string): DrawCommand[] {
  return [
    { kind: 'curve', x1: 1, y1: 8, cx: 8, cy: 1, x2: 15, y2: 8, width: 1.3, color },
    { kind: 'curve', x1: 1, y1: 8, cx: 8, cy: 15, x2: 15, y2: 8, width: 1.3, color },
    { kind: 'circle', x: 8, y: 8, radius: 2.6, color },
  ];
}

/** A speaker with sound waves, or crossed out when muted. */
export function engraveSpeakerIcon(color: string, isMuted: boolean): DrawCommand[] {
  const speaker: DrawCommand = { kind: 'polygon', points: [2, 6, 5, 6, 9, 2.5, 9, 13.5, 5, 10, 2, 10], color };
  if (isMuted) {
    return [
      speaker,
      { kind: 'line', x1: 11, y1: 5.5, x2: 15, y2: 10.5, width: 1.3, color },
      { kind: 'line', x1: 15, y1: 5.5, x2: 11, y2: 10.5, width: 1.3, color },
    ];
  }
  return [
    speaker,
    { kind: 'curve', x1: 11, y1: 5.5, cx: 13, cy: 8, x2: 11, y2: 10.5, width: 1.2, color },
    { kind: 'curve', x1: 12.5, y1: 3.5, cx: 16, cy: 8, x2: 12.5, y2: 12.5, width: 1.2, color },
  ];
}

/** Headphones: solo. */
export function engraveHeadphonesIcon(color: string): DrawCommand[] {
  return [
    { kind: 'curve', x1: 3, y1: 10.5, cx: 8, cy: -3, x2: 13, y2: 10.5, width: 1.5, color },
    { kind: 'rect', x: 1.5, y: 9, width: 3.5, height: 5.5, color, radius: 1 },
    { kind: 'rect', x: 11, y: 9, width: 3.5, height: 5.5, color, radius: 1 },
  ];
}
