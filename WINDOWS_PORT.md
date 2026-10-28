# Windows port — handoff notes

Branch `windows`. Goal: a Windows build of GP Editor. Chosen approach: **Tauri v2 + react-native-web**
(not react-native-windows): the React app runs unchanged in WebView2; the macOS native modules
(`apps/desktop/src/native/*.ts` → Objective-C/Swift in `macos/`) get Windows twins `*.web.ts(x)` built on web APIs
plus a small Rust side. The macOS build is untouched (Metro never resolves `.web.ts`). How to build: README, "Windows".

## Done

- Frontend: `vite.config.ts`, `web/` (entry → `AppRoot`, react-native shim, Mac key labels → Ctrl+),
  `src/native/*.web.ts(x)` and `src/native/web/` (menu and shortcuts, canvas painter, pdf-lib PDF, spessasynth_lib
  playback, Web MIDI, microphone, settings, files, window events). See CLAUDE.md's layout table.
- `native-events.web.ts`: every module's `subscribeNativeEvents(NativeModules.X, …)` listens on the window menu's
  event bus (`src/native/web/app-events.ts`), so a module written for the Mac hears the Windows menu without a twin.
- Window menu (`app-menu.ts`): File, Edit, View, Tools, Track, Help as on the Mac (Settings… and Exit in File), titled
  from the command palette's catalogue, so it follows the language setting; Edit ▸ Undo / Redo enabled from the
  editor.
- Settings (`app-settings.web.ts`) in the app's data folder; the system language from WebView2.
- Player: the metronome's track silenced in the file (`web/smf-tracks.ts`: the clicks share the drums' channel),
  hover preview of notes.
- Shim: TextInput calls `onKeyDown` and lets unkept keys bubble (react-native-web stops them: the command palette's
  ↑ ↓ ↩ and Esc in a panel's field depend on it); a pressable's role stays an attribute (no nested `<button>`).
- Rust (`src-tauri/src/lib.rs`, `src/commands/`): files, settings, Anthropic key + streamed requests (600 s idle,
  1 h in all, the answer's media type), sound banks, PDF import projects (GPProjects.m's path checks), system fonts;
  single-instance and dialog plugins. `tauri.conf.json` (GeneralUser GS bundled, file associations incl. MusicXML,
  NSIS + MSI), `capabilities/default.json`.
- Texts of the Windows side in the catalogues (`window.menu.*`, `window.windows.*`, English and Korean).
- `package.json` scripts, `tsconfig.web.json` (checked by `npm run typecheck`), ESLint ignores,
  `.github/workflows/windows.yml`. `test-support/untranslated-strings.ts` compares folders with "/" on Windows too.
- Merged with main at 0.19.0. Checked on Windows 11 (Node 24, Rust 1.97): both typechecks, lint, Jest, Vitest (with the
  GP1/GP2 fixtures), `cargo check`, `tauri build`; in a browser (`web:dev`): new sheet, fret entry, the command
  palette (↓, ↩, Esc), Settings (Ctrl+,), the language kept after a reload.

## Not on Windows yet

The parts whose native side is macOS only: track effects and the master strip (the Mixer's volume / pan / mute / solo
work, the effects are not heard), Line In, File ▸ Export Audio…, the audio track's playback, the MCP server. Closing
the window with edited documents does not ask to save yet. The installer is not code-signed (SmartScreen warns on
first run).

## Still to check by hand in the app window (`npm run tauri:dev`)

Open / Save As in each format, Open Recent, drag and drop, a second launch with a file, playback with GeneralUser GS and
an added .sf2, the metronome during playback, MIDI input, the tuner (microphone permission), PDF import and the Song
Writer (API key, streamed answers, projects folder, Show in Explorer), PDF / PNG export and Print, copy / paste between
tabs, the window menu in English and Korean.

## macOS and Linux with the same code

Tauri is cross-platform: `src-tauri` + `web/` also build a macOS `.app` / `.dmg` (`npx tauri build --bundles app,dmg`
on a Mac with Xcode's command line tools and Rust) and Linux packages. Not built or tried yet. Before it is usable
there: on macOS Tauri makes the first submenu the app menu (`app-menu.ts` puts File first), `commands/fonts.rs` looks
only in Windows' font folders (the PDF export would fall back), WKWebView has no Web MIDI (MIDI input), the microphone
needs `NSMicrophoneUsageDescription` in the bundle's Info.plist, and the shortcuts are labelled Ctrl+. The
react-native-macos app stays the complete Mac build (effects, audio export, the MCP server …).
