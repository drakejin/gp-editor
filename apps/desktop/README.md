# gp-editor desktop

React Native 0.83 app with the macOS target from react-native-macos 0.83 (`macos/`). Opens Guitar Pro files through
`@gp-editor/core` (linked from `../../packages/gp-core`, bundled from source by Metro).

## Source

| path | what |
| --- | --- |
| `src/App.tsx` | the window in Guitar Pro 8's layout (`DocumentLayout`): `TopBar` (+ `TopBarMenus`, `Lcd`), `DocumentTab`, `HintBar`, the edition palette, `ScoreView`, the inspector, `InstrumentView` (fretboard) and `TracksPanel`; panels, zoom, menus and the instrument picker in `hooks/use-window-chrome.ts`; the only caller of `usePalette()` (`src/theme.ts`: the score follows the system appearance, the chrome is dark in both) |
| `src/state/editor.ts` + `song-edits.ts` | reducer: open document, cursor (on voice 1 or 2), score mode, edits with undo/redo (200 steps), track and song information edits; `song-edits.ts` = the edits at the cursor (durations, tuplets, beats), `note-edits.ts` the note at the cursor, `bar-edits.ts` the cursor's bar. `practice.ts` = practice playback settings |
| `src/hooks/use-editor-commands.ts` + `src/lib/key-commands.ts` | toolbar buttons, keys (Guitar Pro style, `HANDLED_KEYS`), score clicks and file drops → editor actions and playback |
| `src/hooks/use-document.ts` | new sheets, open and save (⌘S overwrites a `.gp5`, anything else becomes a new `.gp5`), the window title; a PDF dropped on the window goes to the import |
| `src/lib/` | `layout.ts` (measure widths, line breaking, `squeezeRow`), `navigation.ts` + `fret-input.ts` (cursor moves, typed frets), `beams.ts` + `notation.ts`, `live-channels.ts`, `practice-tempo.ts` + `practice-plan.ts`, `tuning-hint.ts`, `instruments.ts`, `pitch.ts`, `song-credits.ts`, `wording.ts` (`plural`), `errors.ts` (`errorMessage`), `base64.ts`, `file-name.ts` |
| `src/score/` | engravers → `DrawCommand`s (`draw.ts`): `tab.ts`, `notation/`, `heading.ts` (+ `triplet-feel.ts`, the swing mark), `dynamics.ts` (a mark where the track's dynamic changes, kept clear of the notes with `ink.ts`), `fretboard.ts`, `row.ts`, `hit-test.ts`, `geometry.ts` (view modes, row heights — mark lanes and the dynamics band for the whole track —, `showsFretboard`: when the tab is shown, not for drums), `symbols/` (slurs, bends, slides, effect marks, pick strokes), `bar-map.ts` (the tracks panel's bar map and its hit-testing), `panel-icons.ts` (the tracks panel's small icons) |
| `src/components/` | `TopBar` (panel toggles, zoom, undo, transport, `Lcd`, loop, speed, shortcuts) with `TopBarMenus` (zoom, speed: percentages, BPM, loop bars, speed trainer) on `chrome/` (`ChromeButton`, `ChromeMenu`, `PanelIcon`); `palette/` — `EditionPalette` (groups in `palette-groups.ts`, tool types and the cursor context in `palette-tools.ts`, option strips and text fields in `PaletteStrips.tsx`, Bravura icons drawn by the canvas in `MusicIcon.tsx`); `inspector/` — `Inspector` with `SongInspector` (song information, sound bank) and `TrackInspector` (name, notation, capo, `NeckSettings` tuning, instrument); `TracksPanel` (`TrackMixerRow`, `MixerSlider`, the bar map drawn by `src/score/bar-map.ts`); `ScoreView` (a page of virtualised `ScoreRow` canvases, zoomed) with `SongHeader` as the page title; `InstrumentView` (`Fretboard`); `InstrumentPicker`; `ExportPanel`; `EmptyState` + `ProjectList`, `ImportPanel`, `ImportBanner`, `HintBar`, `ShortcutSheet` (⌘H, from `src/lib/shortcuts.ts`) |
| `src/hooks/use-playback.ts` | plays `renderMidi` output and follows the playing beat (player lifecycle and loop passes in `player-session.ts`). A new instrument, volume or pan while playing is sent live (`src/lib/live-channels.ts`); playback restarts only when the MIDI channels changed or a track was muted or soloed, once, 300 ms after the last change; adding or deleting bars stops it. Practice tempo, loop and speed trainer: `src/state/practice.ts`, `src/lib/practice-tempo.ts`, `src/lib/practice-plan.ts` |
| `src/native/score-canvas.tsx` + `macos/…/GPScoreCanvasComponentView.mm` | Fabric component (codegen spec in `src/native/specs/`): takes a row's command list and draws it with `GPCommandPainter` (`macos/…/GPCommandPainter.h/.m`, CoreGraphics — the PDF export draws with it too). Bravura (SIL OFL) in `macos/GPEditor-macOS/Fonts/`, registered by `GPCommandPainter` |
| `src/native/player.ts` + `macos/…/GPPlayer.m` | plays on `GPMidiEngine` (`GPMidiEngine.h/.m`): one AVAudioEngine with a multitimbral MIDISynth that loads the selected bank once (again only when another bank is chosen) → peak limiter → main mixer at 0.8, and an AVAudioSequencer per song. The song's programs are loaded before the first note; `setProgram` changes a channel's instrument live; the engine (about 220 MB with GeneralUser GS) is released 60 s after playback stops. `GPPlayer` runs on a serial queue of its own, so a bank load never blocks the window |
| `macos/…/GPSoundBanks.m` + `src/hooks/use-sound-banks.ts` | sound banks: the bundled GeneralUser GS, the macOS GS bank, SoundFonts / DLS banks the user added (copied to Application Support/GPEditor/SoundFonts); the choice is kept in user defaults |
| `src/pdf-import/` + `src/hooks/use-pdf-import.ts` | PDF → tab: `request.ts` (prompt, tool, models: Claude Opus 5.5 by default, Claude Sonnet 5), `response.ts` (the answer; retry or stop), `transcribe-page.ts` (one page, 3 attempts, 2 s / 4 s apart), `run-import.ts` (page 1, then 3 at a time; resume; builds the `.gp5`), `project-file.ts` (`project.json`), `status.ts` (status lines for the banner and the start screen). One import runs at a time |
| `src/native/projects.ts` + `macos/…/GPProjects.m` | project folders in `~/Documents/GP Editor Projects` (the sandbox's one writable place in Documents), PDF pages via PDFKit, files inside a project only (no symbolic links); refuses PDFs over 60 pages or 100 MB and password-protected ones |
| `src/native/anthropic.ts` + `macos/…/GPAnthropic.m` | the API key (owner-only file in the app's Application Support; never sent to JS), the model (user defaults), the Messages API call (10 min timeout) |
| `src/export/` + `src/hooks/use-pdf-export.ts` + `src/components/ExportPanel.tsx` | PDF export: `paper.ts` (A4 / US Letter, margins, `PRINT_SCALE`, `PRINT_PALETTE` — black and grey on white), `title-block.ts` (first-page title, credits, track and tuning), `pdf-document.ts` (`buildPdfDocument`: rows engraved by `engraveRow` as on screen, scaled to print size and packed onto pages, a footer per page; `pdfPageCount`) |
| `src/native/pdf-export.ts` + `macos/…/GPPdfExport.m` | `savePdf(document, name)`: save panel for a `.pdf`, then the pages (JSON of `PdfDocument`) drawn into a PDF context with `GPCommandPainter` |
| `src/native/gp-files.ts` + `macos/…/GPFiles.m` | open and save panels, reading and writing files, files from Finder, File-menu events (New, Import PDF…, Export PDF…, Open…, Save, Save As… — posted by `AppDelegate.swift`, names in `GPEditorNotifications.h`), window title |
| `src/native/focus-view.ts` | makes a view first responder (key events) through the View's native commands |
| `macos/…/GPSandbox.m` | `GPIsSandboxed()`: QA-only environment overrides are honoured only outside the App Sandbox |
| `__tests__/` + `test-support/` | Jest tests; song builders, fixture loading and a test palette |

## Scripts

| script | what |
| --- | --- |
| `scripts/soundfont/fetch.sh` | downloads GeneralUser GS at a pinned commit, checks its SHA-256, into `macos/GPEditor-macOS/SoundFonts/` (git-ignored; `npm run build:macos` runs it) |
| `scripts/hermes-smoke/run.sh` | reads every gp-core fixture inside the Hermes VM shipped in the pods, saves each as GP5 the way ⌘S does and reads it back |
| `scripts/e2e-open.sh` | opens one file per format in the Release app (`open -a`) and checks it loaded (skips GP1/GP2 when they are not fetched); `GPEDITOR_APP=…` tests another copy |
| `scripts/release/package.sh` | arm64 and universal release zips + `SHA256SUMS.txt` in `macos/build/release/` |
| `scripts/qa/run.sh <script.json>` | QA driver run (below) |

```bash
npm install && npm run pods
npm run build:macos      # Release .app in macos/build/DerivedData/Build/Products/Release/
npm test                 # Jest
npm run typecheck
npm run lint             # ESLint
npm start                # Metro, for npm run macos
npm run macos            # Debug build + launch
npm run soundfont        # GeneralUser GS only (build:macos runs it)
npm run package:macos    # release zips (after build:macos)
scripts/hermes-smoke/run.sh
scripts/e2e-open.sh
```

## QA driver

`scripts/qa/run.sh <script.json>` copies the Release app to `macos/build/qa/GPEditor-QA.app` (again when the build is
newer), re-signs it with `GPEditor-QA.entitlements` (no App Sandbox), runs it with `GPEDITOR_QA_SCRIPT=<script.json>`,
waits up to 180 s for it to quit and prints `<script.json>.log`. `GPQADriver.m` starts 3 s after launch and runs the
steps in order; points are in the window's content view, origin top-left:

- `{"open": "/abs/file"}` hands a file over as Finder does
- `{"notify": "GPEditorExportCommand"}` posts a menu notification (`GPEditorNotifications.h`); `"object"` is passed
  along (e.g. the score mode of `GPEditorNewCommand`)
- `{"wait": 1500}` · `{"click": {"x": 300, "y": 200}}` · `{"scroll": {"x": 600, "y": 400, "dy": -300}}`
- `{"key": "z", "modifiers": ["cmd", "shift", "alt"]}` — ArrowUp/Down/Left/Right, Backspace, Delete, Escape, Enter,
  else the character
- `{"resize": {"width": 1100, "height": 760}}` · `{"appearance": "dark"}` (anything else is light)
- `{"focusRoot": true}` makes the largest focusable view first responder · `{"inspect": true}` logs the responders
- `{"snapshot": "/abs/out.png"}` · `{"quit": true}`

Only the unsandboxed QA copy honours `GPEDITOR_ANTHROPIC_URL` (PDF-import requests to a mock on `http://127.0.0.1` or
`http://localhost`) and `GPEDITOR_QA_PDF_PATH` (the PDF export saves there without the save panel).

## Notes

- `macos/.xcode.env.local` (git-ignored) pins `NODE_BINARY` for the Xcode bundle phase; point it at Node 24.
- The app is sandboxed (`GPEditor.entitlements`: App Sandbox, user-selected read-write files, network client — Metro
  in Debug, `api.anthropic.com` for the PDF import — and read-write `~/Documents/GP Editor Projects/` as a
  home-relative temporary exception). Files reach it through the open and save panels, drag and drop, Finder, or that
  projects folder. Release builds do not get `get-task-allow`.
