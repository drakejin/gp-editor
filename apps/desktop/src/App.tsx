import { WindowView } from './components/window/WindowView';
import { useWindow } from './hooks/use-window';

/** The app's window (WindowView), every part of it composed by useWindow. */
export default function App() {
  const model = useWindow();
  return <WindowView model={model} />;
}
