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
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
