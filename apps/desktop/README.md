# gp-editor desktop

React Native 0.83 app with the macOS target from react-native-macos 0.83 (`macos/`). Opens Guitar Pro files through
`@gp-editor/core` (linked from `../../packages/gp-core`, bundled from source by Metro).

| path | what |
| --- | --- |
| `src/App.tsx` | window layout, keyboard shortcuts, file loading |
| `src/state/editor.ts` | reducer: open document, selection, edits with undo/redo |
| `src/lib/layout.ts` | tab staff geometry and line breaking (pure, unit tested) |
| `src/components/` | toolbar, track list, song header, tab score (`TabScore` → rows → `TabMeasure`) |
| `src/native/gpFiles.ts` | JS side of `macos/GPEditor-macOS/GPFiles.m`: open panel, file reading, Finder/⌘O events, window title |
| `scripts/hermes-smoke/run.sh` | reads every gp-core fixture inside the Hermes VM shipped in the pods |
| `scripts/e2e-open.sh` | opens one file per format in the Release app (`open -a`) and checks it loaded |

```bash
npm install && npm run pods
npm run build:macos      # Release .app in macos/build/DerivedData/Build/Products/Release/
npm test                 # Jest
npm run typecheck
scripts/hermes-smoke/run.sh
scripts/e2e-open.sh
```

Notes
- `macos/.xcode.env.local` (git-ignored) pins `NODE_BINARY` for the Xcode bundle phase; point it at Node 24.
- The app is sandboxed with user-selected file access; files reach it through the open panel, drag and drop, or Finder.
