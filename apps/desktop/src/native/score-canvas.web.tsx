// Windows twin of score-canvas.tsx: one <canvas> per score row, drawn by web/painter.ts (GPCommandPainter.m's port),
// in place of the native GPScoreCanvas view.
import { memo, useEffect, useRef, useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { DrawCommand } from '../score/draw';
import { loadFonts } from './web/fonts';
import { paintCommands } from './web/painter';

interface ScoreCanvasProps {
  readonly commands: readonly DrawCommand[];
  readonly style?: StyleProp<ViewStyle>;
}

/** Bumps once the fonts are in, so canvases drawn before then draw again with Bravura. */
function useFontsReady(): boolean {
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let isMounted = true;
    void loadFonts().then(() => isMounted && setIsReady(true));
    return () => {
      isMounted = false;
    };
  }, []);
  return isReady;
}

function size(style: StyleProp<ViewStyle>): { width: number; height: number } {
  const flat = StyleSheet.flatten(style) ?? {};
  return { width: typeof flat.width === 'number' ? flat.width : 0, height: typeof flat.height === 'number' ? flat.height : 0 };
}

/** The view's size: its style's width and height, else (a flexible style) what layout gave it. */
function useCanvasSize(style: StyleProp<ViewStyle>, container: { current: HTMLElement | null }): { width: number; height: number } {
  const given = size(style);
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const isGiven = given.width > 0 && given.height > 0;
  useEffect(() => {
    const element = container.current;
    if (isGiven || element === null) {
      return undefined;
    }
    const observer = new ResizeObserver(() => setMeasured({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, isGiven]);
  return isGiven ? given : measured;
}

function ScoreCanvasView({ commands, style }: ScoreCanvasProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const isFontReady = useFontsReady();
  const { width, height } = useCanvasSize(style, container);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (element == null || context == null) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    paintCommands(context, commands);
  }, [commands, width, height, isFontReady]);
  return (
    <View ref={container as never} style={style} pointerEvents="none">
      <canvas ref={canvas} style={{ width, height, display: 'block' }} />
    </View>
  );
}

export const ScoreCanvas = memo(ScoreCanvasView);
