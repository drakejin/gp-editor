import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import App from './App';
import { loadSettings } from './state/settings-store';
import { CHROME } from './theme';

/**
 * The registered root: reads GP Editor ▸ Settings… from user defaults first (a few milliseconds), so the window opens
 * in its language and colours instead of switching after its first frame; the chrome's grey meanwhile.
 */
export default function AppRoot() {
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    // loadSettings shows its own failure in the settings panel; the window opens either way.
    void loadSettings().finally(() => setIsReady(true));
  }, []);
  return isReady ? <App /> : <View style={[styles.root, { backgroundColor: CHROME.chrome }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
