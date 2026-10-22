module.exports = {
  root: true,
  extends: '@react-native',
  // Build outputs (the bundled app, coverage reports) are not source.
  ignorePatterns: ['coverage/', 'macos/build/'],
  rules: {
    // `void promise;` marks a promise deliberately not awaited (an event handler starting async work that catches its
    // own errors); the rule still flags `void` used as a value.
    'no-void': ['warn', { allowAsStatement: true }],
  },
};
