module.exports = {
  root: true,
  extends: '@react-native',
  // Build outputs (the bundled app, coverage reports) are not source.
  ignorePatterns: ['coverage/', 'macos/build/', 'web-dist/', 'src-tauri/target/', 'src-tauri/gen/'],
  rules: {
    // `void promise;` marks a promise deliberately not awaited (an event handler starting async work that catches its
    // own errors); the rule still flags `void` used as a value.
    'no-void': ['warn', { allowAsStatement: true }],
  },
  overrides: [
    {
      // A bare TextInput lets its keys bubble to the score's key handler: the app's fields are TextFields.
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      excludedFiles: ['src/components/TextField.tsx'],
      rules: {
        'no-restricted-imports': ['error', { paths: [{ name: 'react-native', importNames: ['TextInput'], message: 'Use TextField (src/components/TextField.tsx): its keys stay in the field.' }] }],
      },
    },
  ],
};
