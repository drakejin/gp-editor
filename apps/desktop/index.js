/**
 * @format
 */

import { AppRegistry } from 'react-native';
import AppRoot from './src/AppRoot';
import { keepHangulWordsTogether } from './src/lib/hangul-line-breaks';
import { name as appName } from './app.json';

// Korean wraps between words in every Text (the getter of react-native's own exports, read at each render).
keepHangulWordsTogether(require('react-native'));
AppRegistry.registerComponent(appName, () => AppRoot);
