// Entry of the Windows (Tauri) build: the macOS app's App component on react-native-web, with the window menu,
// shortcuts and file handling of src/native/web/ in place of AppDelegate.swift.
import { AppRegistry } from 'react-native';
import App from '../src/App';
import { installMenu, installShortcuts } from '../src/native/web/app-menu';
import { loadFonts } from '../src/native/web/fonts';
import { installWindow } from '../src/native/web/window';

void loadFonts();
installShortcuts(import.meta.env.DEV);
void installMenu([]);

AppRegistry.registerComponent('GPEditor', () => App);
AppRegistry.runApplication('GPEditor', { rootTag: document.getElementById('root') });

// After the first render, so the app's file events have listeners (a file the app was opened with waits until then).
void installWindow();
