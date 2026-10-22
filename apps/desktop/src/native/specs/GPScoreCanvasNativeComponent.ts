// Codegen spec of the native score canvas (macos/GPEditor-macOS/GPScoreCanvasComponentView.mm).
// The file name must end in NativeComponent for React Native codegen.
import type { HostComponent, ViewProps } from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface NativeProps extends ViewProps {
  /** JSON array of DrawCommand (src/score/draw.ts). */
  commands: string;
}

export default codegenNativeComponent<NativeProps>('GPScoreCanvas') as HostComponent<NativeProps>;
