// Release bundles (Metro's production BABEL_ENV) take Hermes' transform profile: spreads, arrow functions, optional
// chaining … stay as written for Hermes to run natively instead of Babel's helpers — the engravers 25–30% and the PDF 25%
// faster in the Hermes VM (2026-10-26). Jest and the development server keep the default profile.
module.exports = (api) => ({
  presets: [['module:@react-native/babel-preset', api.env('production') ? { unstable_transformProfile: 'hermes-stable' } : {}]],
});
