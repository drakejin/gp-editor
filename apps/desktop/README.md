# gp-editor desktop

React Native 0.83 app with the macOS target from react-native-macos 0.83 (`macos/`). Opens Guitar Pro files through
`@gp-editor/core` (linked from `../../packages/gp-core`, bundled from source by Metro).

## Source

| path | what |
| --- | --- |
| `src/App.tsx` | the window in Guitar Pro 8's layout (`DocumentLayout`): `TopBar` (+ `TopBarMenus`, `Lcd`), `TabStrip`, `HintBar`, the edition palette, `ScoreView`, the inspector, `InstrumentView` (piano keyboard and fretboard) and `TracksPanel`; panels, zoom, menus and the instrument picker in `hooks/use-window-chrome.ts`; the only caller of `usePalette()` (`src/theme.ts`: the score follows the system appearance, the chrome is dark in both) |
| `src/state/workspace.ts` + `src/hooks/use-tabs.ts` | the open documents as tabs: `workspaceReducer` keeps each tab's `EditorState` and the shown tab; `loaded` / `created` / `openTab` open a new tab (or show the one already holding that path), `switchTab`, `closeTab` (the right neighbour is shown, else the left), `cycleTab`, `inTab` (an editor action for one tab); any other editor action goes to the shown tab. `useTabs`: tab clicks, File ▸ Close Tab / Next Tab / Previous Tab, and Save / Don't Save / Cancel (`SaveChangesPanel`) before an edited tab closes |
| `src/state/editor.ts` + `song-edits.ts` | reducer: open document, cursor (on voice 1 or 2), score mode, edits with undo/redo (200 steps), track and song information edits; `song-edits.ts` = the edits at the cursor (durations, tuplets and a tuplet inside a tuplet, beats), `note-edits.ts` the note at the cursor, `bar-edits.ts` the cursor's bar, `selection.ts` the selected beats (`selectionAnchor` to the cursor; any other cursor move or edit clears it) with cut and paste. `practice.ts` = practice playback settings |
| `src/hooks/use-clipboard.ts` + `src/native/clipboard.ts` + `macos/…/GPClipboard.m` | copy, cut and paste of beats through the system pasteboard: the beats as JSON under `com.drakejin.gpeditor.beats` (checked by `parseBeatFragment` before a paste) and a plain-text summary ("4 beats from bars 3–4"); the selection is tinted by `src/score/selection-tint.ts` |
| `src/hooks/use-editor-commands.ts` + `src/lib/key-commands.ts` | toolbar buttons, keys (Guitar Pro style, `HANDLED_KEYS`), score clicks and file drops → editor actions and playback; keys do nothing to the score while a panel, sheet or menu is open (`isOverlayOpen`), except Esc |
| `src/hooks/use-drag-selection.ts` + `src/score/hit-test.ts` (`hitTestDrag`) | selecting beats with the mouse: a press places the cursor (shift: grows the selection, `selectTo`), a drag selects to the beat under the pointer, into the rows above and below |
| `src/components/TextField.tsx` | the app's text field: a TextInput whose keys stop there (only Esc goes on), since react-native-macos bubbles a field's key events to the root view's score keys; ESLint forbids a bare TextInput in `src/` |
| `src/hooks/use-document.ts` | new sheets and opened files, each in a new tab (`openDocument` for a song no file holds yet, e.g. Song Writer's); save the shown tab or any tab (`saveTab`; ⌘S overwrites a file in its own format when it is one of `SAVE_FORMATS`, anything else and ⇧⌘S ask through the save panel's format popup; a GP4 / GP3 save puts what the format leaves out in the hint strip), the window title (the shown tab); a PDF dropped on the window goes to the import |
| `src/lib/recent-files.ts` + `src/hooks/use-recent-files.ts` + `src/native/recent-files.ts` + `macos/…/GPRecentFiles.m` + `macos/…/RecentFilesMenu.swift` | recent files: every file opened or saved, at most 20, pinned ones on top in pin order and never pushed out, the others newest first, one entry per path (`rememberRecentFile`, `pinRecentFile`, …). `GPRecentFiles.m` keeps the list in user defaults with a security-scoped bookmark per file (the sandbox's permission from when it was opened), follows moved files, marks gone ones missing and reads a listed file through its bookmark (`useDocument.openRecent`; ⌘S on it writes through the bookmark too, `GPWithRecentFileAccess`). `RecentFilesMenu.swift` builds File ▸ Open Recent (Clear Menu keeps the pinned files) from that list and File ▸ Recent Files… opens `RecentFilesPanel`; the start screen lists the first five (`RecentFileList`) |
| `src/lib/file-formats.ts` | `SAVE_FORMATS` — Save's formats (gp-core `WritableFormat`, popup label, extension, what it leaves out), GP5 first; a new gp-core writer is one more row — and the export files (`MIDI_FILE`, `ASCII_TAB_FILE`); `saveFormatOf(path)` (plain Save's rule), `defaultSaveFormat`, `fileNameIn` |
| `src/hooks/use-song-export.ts` | File ▸ Export MIDI… (`renderMidi` as playback plays it: repeats unfolded, the written tempo, mute and solo honoured) and Export ASCII Tab… (`writeAsciiTab` of the fretted tracks); save panel, then `writeFile` / `writeTextFile`; a failure goes to the error banner |
| `src/lib/` | `layout.ts` (measure widths, line breaking, `squeezeRow`), `navigation.ts` + `fret-input.ts` (cursor moves, typed frets), `beams.ts` + `notation.ts`, `live-channels.ts`, `practice-tempo.ts` + `practice-plan.ts`, `tuning-hint.ts`, `instruments.ts`, `pitch.ts`, `song-credits.ts`, `wording.ts` (`plural`), `errors.ts` (`errorMessage`), `base64.ts`, `file-name.ts`, `tab-strip.ts` (tab widths, keeping the shown tab in view), `score-scroll.ts` (whether a page just shown, at its top, already shows the cursor's row) |
| `src/score/` | engravers → `DrawCommand`s (`draw.ts`): `tab.ts`, `notation/`, `heading.ts` (+ `triplet-feel.ts`, the swing mark), `dynamics.ts` (a mark where the track's dynamic changes, kept clear of the notes with `ink.ts`), `fretboard.ts`, `keyboard.ts` (an 88-key piano with the sounding notes lit, `soundingPitches`), `lyrics.ts` (a track's syllables under their beats, `measureSyllables`), `row.ts`, `hit-test.ts`, `geometry.ts` (view modes, row heights — mark lanes and the dynamics, bend and lyrics bands for the whole track —, `showsFretboard`: when the tab is shown, not for drums), `symbols/` (slurs, bends, slides, effect marks, pick strokes), `bar-map.ts` (the tracks panel's bar map and its hit-testing), `panel-icons.ts` (the tracks panel's small icons) |
| `src/components/` | `TopBar` (panel toggles, zoom, undo, transport, `Lcd`, loop, speed, shortcuts) with `TopBarMenus` (zoom, speed: percentages, BPM, loop bars, speed trainer) on `chrome/` (`ChromeButton`, `ChromeMenu`, `PanelIcon`); `palette/` — `EditionPalette` (groups in `palette-groups.ts`, tool types and the cursor context in `palette-tools.ts`, option strips and text fields in `PaletteStrips.tsx`, Bravura icons drawn by the canvas in `MusicIcon.tsx`); `inspector/` — `Inspector` with `SongInspector` (song information, sound bank) and `TrackInspector` (name, notation, capo, `NeckSettings` tuning, instrument); `TracksPanel` (`TrackMixerRow`, `MixerSlider`, the bar map drawn by `src/score/bar-map.ts`); `ScoreView` (a page of virtualised `ScoreRow` canvases, zoomed) with `SongHeader` as the page title; `InstrumentView` (`Keyboard` above `Fretboard`, each with its top-bar toggle); `InstrumentPicker`; `ExportPanel`; `EmptyState` + `ProjectList`, `ImportPanel`, `ImportBanner`, `HintBar`, `ShortcutSheet` (⌘H, from `src/lib/shortcuts.ts`), `TabStrip` (the open documents), `SaveChangesPanel` (closing an edited tab) |
| `src/hooks/use-playback.ts` | plays `renderMidi` output and follows the playing beat (player lifecycle and loop passes in `player-session.ts`). A new instrument, volume or pan while playing is sent live (`src/lib/live-channels.ts`); playback restarts only when the MIDI channels changed or a track was muted or soloed, once, 300 ms after the last change; adding or deleting bars stops it. Practice tempo, loop and speed trainer: `src/state/practice.ts`, `src/lib/practice-tempo.ts`, `src/lib/practice-plan.ts` |
| `src/native/score-canvas.tsx` + `macos/…/GPScoreCanvasComponentView.mm` | Fabric component (codegen spec in `src/native/specs/`): takes a row's command list and draws it with `GPCommandPainter` (`macos/…/GPCommandPainter.h/.m`, CoreGraphics — the PDF export draws with it too). Bravura (SIL OFL) in `macos/GPEditor-macOS/Fonts/`, registered by `GPCommandPainter` |
| `src/native/player.ts` + `macos/…/GPPlayer.m` | plays on `GPMidiEngine` (`GPMidiEngine.h/.m`): one AVAudioEngine with a multitimbral MIDISynth that loads the selected bank once (again only when another bank is chosen) → peak limiter → main mixer at 0.8, and an AVAudioSequencer per song. The song's programs are loaded before the first note; `setProgram` changes a channel's instrument live; the engine (about 220 MB with GeneralUser GS) is released 60 s after playback stops. `GPPlayer` runs on a serial queue of its own, so a bank load never blocks the window |
| `macos/…/GPSoundBanks.m` + `src/hooks/use-sound-banks.ts` | sound banks: the bundled GeneralUser GS, the macOS GS bank, SoundFonts / DLS banks the user added (copied to Application Support/GPEditor/SoundFonts); the choice is kept in user defaults |
| `src/song-writer/` + `src/hooks/use-song-writer.ts` + `src/components/song-writer/` | Edit ▸ AI Wizard ▸ Song Writer…: `request.ts` (the system prompt, `plan_song` and `write_section` requests, song length), `reference.ts` (the open score's first bars with notes as text), `run-song-writer.ts` (plan, then the sections 3 at a time, 3 attempts each; a section that fails becomes rests; a refused key or cancelling stops; `buildComposedSong`); `useSongWriter` (the panel's draft, status, stop) and `SongWriterPanel` / `SongWriterFields`. Uses the PDF import's key and model; the song opens in a new tab, unsaved |
| `src/lib/tool-answer.ts` | a Messages API answer to a forced tool call: its input, or whether to retry or stop (a refused key, no credit); shared by the PDF import and the Song Writer |
| `src/pdf-import/` + `src/hooks/use-pdf-import.ts` | PDF → tab: `request.ts` (prompt, tool, models: Claude Opus 5.5 by default, Claude Sonnet 5), `response.ts` (the answer; retry or stop), `transcribe-page.ts` (one page, 3 attempts, 2 s / 4 s apart), `run-import.ts` (page 1, then 3 at a time; resume; builds the `.gp5`), `project-file.ts` (`project.json`), `status.ts` (status lines for the banner and the start screen). One import runs at a time |
| `src/native/projects.ts` + `macos/…/GPProjects.m` | project folders in `~/Documents/GP Editor Projects` (the sandbox's one writable place in Documents), PDF pages via PDFKit, files inside a project only (no symbolic links); refuses PDFs over 60 pages or 100 MB and password-protected ones |
| `src/native/anthropic.ts` + `macos/…/GPAnthropic.m` | the API key (owner-only file in the app's Application Support; never sent to JS), the model (user defaults), the Messages API call (10 min timeout) |
| `src/export/` + `src/hooks/use-pdf-export.ts` + `src/components/ExportPanel.tsx` | PDF export: `paper.ts` (A4 / US Letter, margins, `PRINT_SCALE`, `PRINT_PALETTE` — black and grey on white), `title-block.ts` (first-page title, credits, track and tuning), `pdf-document.ts` (`buildPdfDocument`: rows engraved by `engraveRow` as on screen, scaled to print size and packed onto pages, a footer per page; `pdfPageCount`) |
| `src/export/png-export.ts` + `src/native/png-export.ts` + `macos/…/GPPngExport.m` | PNG export (File ▸ Export PNG…, the export panel with a resolution — 72, 150 or 300 dpi — and a white or transparent background): the PDF export's pages, each drawn with `GPCommandPainter` into a bitmap (sRGB, the dpi recorded in the file) and saved as `<name>.png`, or `<name>-1.png` … `<name>-N.png` for several pages (padded to sort in page order) in a folder chosen in an open panel — the sandbox lets the app write only what the user chose, so not other files next to a saved one; existing files are replaced only after asking. On a transparent background the paper's colour erases (`eraseColor`), so the gaps in the tab lines behind fret numbers stay clear. The PDF itself is vector (Core Graphics into a PDF context, text as glyphs), so it has no resolution to choose |
| `src/native/pdf-export.ts` + `macos/…/GPPdfExport.m` | `savePdf(document, name)`: save panel for a `.pdf`, then the pages (JSON of `PdfDocument`) drawn into a PDF context with `GPCommandPainter`; `printPdf(document)` (File ▸ Print…, ⌘P): the same pages through the macOS print panel (PDFKit, scaled to the printer's paper) |
| `src/native/gp-files.ts` + `macos/…/GPFiles.m` | open and save panels (the open panel and `Info.plist`'s document types take `.gp` … `.gtp`, `.ptb` and `.tef`), reading and writing files, files from Finder, File-menu events (New, Import PDF…, Export PDF…, Export PNG…, Print…, Open…, Save, Save As…, Close Tab, Next Tab, Previous Tab) and Help ▸ Keyboard Shortcuts (⌘H) — posted by `AppDelegate.swift`, names in `GPEditorNotifications.h` —, window title. `showSavePanel({ suggestedName, formats, formatId })` only picks where (and, with several formats, a *Format* popup in the panel: the extension follows it, the panel's message is the format's note); `writeFile` (base64 bytes) and `writeTextFile` (UTF-8) write. Export MIDI… and Export ASCII Tab… come as `exportMidiRequested` / `exportAsciiTabRequested` |
| `src/native/focus-view.ts` | makes a view first responder (key events) through the View's native commands |
| `macos/…/GPSandbox.m` | `GPIsSandboxed()`: QA-only environment overrides are honoured only outside the App Sandbox |
| `__tests__/` + `test-support/` | Jest tests; song builders, fixture loading and a test palette |

## Scripts

| script | what |
| --- | --- |
| `scripts/soundfont/fetch.sh` | downloads GeneralUser GS at a pinned commit, checks its SHA-256, into `macos/GPEditor-macOS/SoundFonts/` (git-ignored; `npm run build:macos` runs it) |
| `scripts/hermes-smoke/run.sh` | reads every gp-core fixture (Guitar Pro, Power Tab, TablEdit) inside the Hermes VM shipped in the pods, saves each as GP5 the way ⌘S does and reads it back, and writes it as ASCII tab |
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
- `{"wait": 1500}` · `{"click": {"x": 300, "y": 200}}` (the mouse-up is queued first, so a click into a text field works) · `{"drag": {"from": {"x": 300, "y": 200}, "to": {"x": 500, "y": 420}, "steps": 8}}` (do not send Escape into a focused text field: AppKit rejects the synthetic event and the app aborts) · `{"scroll": {"x": 600, "y": 400, "dy": -300}}`
- `{"key": "z", "modifiers": ["cmd", "shift", "alt", "ctrl"]}` — ArrowUp/Down/Left/Right, Backspace, Delete, Escape,
  Enter, Tab, else the character
- `{"resize": {"width": 1100, "height": 760}}` · `{"appearance": "dark"}` (anything else is light)
- `{"menu": ["File", "Open Recent"]}` logs the items of a menu-bar menu; `{"menu": ["File", "Open Recent", "Song.gp5"]}`
  chooses the item, as a click in the menu does
- `{"focusRoot": true}` makes the largest focusable view first responder · `{"inspect": true}` logs the responders
- `{"snapshot": "/abs/out.png"}` · `{"quit": true}`

Only the unsandboxed QA copy honours `GPEDITOR_ANTHROPIC_URL` (PDF-import requests to a mock on `http://127.0.0.1` or
`http://localhost`), `GPEDITOR_QA_PDF_PATH` (the PDF export saves there without the save panel),
`GPEDITOR_QA_PRINT_PATH` (File ▸ Print… saves the print job there as a PDF, without the print panel),
`GPEDITOR_QA_SAVE_PATH` (Save As, Export MIDI… and Export ASCII Tab… save there without the save panel, in the offered
format with that path's extension) and `GPEDITOR_QA_PNG_DIR` (File ▸ Export PNG… writes its images into that folder,
without panels). The QA copy has no sandbox, so the security-scoped bookmarks of the recent files are made and
resolved but never needed there.

## Notes

- `macos/.xcode.env.local` (git-ignored) pins `NODE_BINARY` for the Xcode bundle phase; point it at Node 24.
- The app is sandboxed (`GPEditor.entitlements`: App Sandbox, user-selected read-write files, network client — Metro
  in Debug, `api.anthropic.com` for the PDF import —, read-write `~/Documents/GP Editor Projects/` as a
  home-relative temporary exception, and app-scoped security bookmarks for the recent files). Files reach it through
  the open and save panels, drag and drop, Finder, the recent files, or that projects folder. Release builds do not get `get-task-allow`.
