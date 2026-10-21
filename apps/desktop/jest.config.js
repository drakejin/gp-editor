module.exports = {
  preset: 'react-native',
  // gp-core is linked from ../../packages/gp-core; Babel helpers it needs live in this app's node_modules.
  modulePaths: ['<rootDir>/node_modules'],
  testPathIgnorePatterns: ['/node_modules/', '/macos/', '/ios/', '/android/'],
};
