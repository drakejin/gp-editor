import { useTunerListening } from '../../hooks/use-tuner';
import type { TunerStrings } from '../../lib/tuner-display';
import type { Palette } from '../../theme';
import { TunerView } from './TunerView';

export interface TunerPanelProps {
  readonly palette: Palette;
  readonly strings: TunerStrings;
  readonly referenceA4: number;
  readonly onShiftReferenceA4: (delta: number) => void;
  readonly onClose: () => void;
}

/** Tools ▸ Tuner…: the microphone runs while this panel is shown (useTunerListening), and TunerView shows what it hears. */
export function TunerPanel(props: TunerPanelProps) {
  const listening = useTunerListening();
  return <TunerView {...props} {...listening} />;
}
