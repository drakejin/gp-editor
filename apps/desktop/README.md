# gp-editor desktop

React Native 0.83 app with the macOS target from react-native-macos 0.83 (`macos/`). Opens Guitar Pro files through
`@gp-editor/core` (linked from `../../packages/gp-core`, bundled from source by Metro).

| path | what |
| --- | --- |
| `src/App.tsx` | window layout, keyboard shortcuts, file loading |
| `src/state/editor.ts` | reducer: open document, selection, edits with undo/redo |
| `src/lib/layout.ts` | measure widths (beat columns, key/time signature slots) and line breaking |
| `src/score/` | engravers → `DrawCommand`s: `tab.ts`, `notation/`, `heading.ts`, `fretboard.ts`, `row.ts`, `hit-test.ts` |
| `src/components/` | toolbar, edit bar, transport bar (practice playback), track list, song header, `ScoreView` (virtualised rows of `ScoreRow` canvases), `Fretboard` |
| `src/hooks/use-playback.ts` | plays `renderMidi` output and follows the playing beat (player lifecycle in `player-session.ts`); practice tempo, loop and speed trainer: `src/state/practice.ts`, `src/lib/practice-tempo.ts`, `src/lib/practice-plan.ts` |
| `src/native/score-canvas.tsx` + `macos/…/GPScoreCanvasComponentView.mm` | Fabric component (codegen spec in `src/native/specs/`) that draws a command list with CoreGraphics; Bravura (SIL OFL) in `macos/GPEditor-macOS/Fonts/` |
| `src/native/player.ts` + `macos/…/GPPlayer.m` | AVMIDIPlayer with the macOS GS sound bank |
| `src/native/gp-files.ts` | JS side of `macos/GPEditor-macOS/GPFiles.m`: open panel, file reading, Finder/⌘O events, window title |
| `scripts/hermes-smoke/run.sh` | reads every gp-core fixture inside the Hermes VM shipped in the pods |
| `scripts/e2e-open.sh` | opens one file per format in the Release app (`open -a`) and checks it loaded; `GPEDITOR_APP=…` tests another copy |
| `scripts/release/package.sh` | arm64 and universal release zips + SHA256SUMS in `macos/build/release/` |
| `scripts/qa/run.sh` | runs a QA script (`macos/GPEditor-macOS/GPQADriver.m`) on an unsandboxed copy: scripted clicks/keys + PNG snapshots |

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
- The app is sandboxed (`GPEditor.entitlements`: App Sandbox, user-selected read-write files, network client for Metro);
  files reach it through the open panel, drag and drop, or Finder. Release builds do not get `get-task-allow`.
