import { memo, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { DrawCommand } from '../score/draw';
import NativeScoreCanvas from './specs/GPScoreCanvasNativeComponent';

interface ScoreCanvasProps {
  readonly commands: readonly DrawCommand[];
  readonly style?: StyleProp<ViewStyle>;
}

/** One native view that draws a whole command list (see src/score/draw.ts). */
function ScoreCanvasView({ commands, style }: ScoreCanvasProps) {
  const json = useMemo(() => JSON.stringify(commands), [commands]);
  return <NativeScoreCanvas commands={json} style={style} />;
}

export const ScoreCanvas = memo(ScoreCanvasView);
