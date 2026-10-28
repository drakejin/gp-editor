const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// gp-core is consumed from source (packages/gp-core/src) through the file: dependency.
const coreRoot = path.resolve(__dirname, '../../packages/gp-core');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [coreRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules'), path.resolve(coreRoot, 'node_modules')],
    // Keep gp-core's tests and fixtures out of the bundle graph.
    blockList: [new RegExp(`${coreRoot.replace(/[/\\]/g, '[/\\\\]')}[/\\\\](test|coverage)[/\\\\].*`)],
  },
  // Modules run at startup, not at their first use: Hermes then calls them directly in the hot loops (renderMidi,
  // the engravers) — 14–19% faster there in the Hermes VM, for about 35 ms more CPU at launch (2026-10-26).
  transformer: {
    getTransformOptions: async () => ({ transform: { experimentalImportSupport: false, inlineRequires: false } }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
