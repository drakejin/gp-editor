import { WindowView } from './components/window/WindowView';
import { useMcpServer } from './hooks/use-mcp-server';
import { useWindow } from './hooks/use-window';

/** The app's window (WindowView), every part of it composed by useWindow; the MCP server drives the same window. */
export default function App() {
  const model = useWindow();
  useMcpServer(model);
  return <WindowView model={model} />;
}
