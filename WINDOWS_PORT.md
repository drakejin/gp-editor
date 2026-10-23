# Windows port — handoff notes

Branch `windows`. Goal: a Windows build of GP Editor. Chosen approach: **Tauri v2 + react-native-web**
(not react-native-windows): the React app runs unchanged in WebView2; the macOS native modules
(`apps/desktop/src/native/*.ts` → Objective-C/Swift in `macos/`) get Windows twins `*.web.ts(x)` built on web APIs
plus a small Rust side. The macOS build is untouched (Metro never resolves `.web.ts`). How to build: README, "Windows".

## Done

- Frontend: `vite.config.ts`, `web/` (entry, react-native shim, Mac key labels → Ctrl+), `src/native/*.web.ts(x)`
  and `src/native/web/` (menu and shortcuts, canvas painter, pdf-lib PDF, spessasynth_lib playback, Web MIDI,
  microphone, settings, files, window events). See CLAUDE.md's layout table.
- Rust (`src-tauri/src/lib.rs`, `src/commands/`): files, settings, Anthropic key + requests, sound banks, PDF import
  projects (GPProjects.m's path checks), system fonts; single-instance and dialog plugins. `tauri.conf.json`
  (GeneralUser GS bundled, file associations, NSIS + MSI), `capabilities/default.json`.
- `package.json` scripts (`web:dev`, `web:build`, `tauri:dev`, `build:windows`, `soundfont:win` →
  `scripts/soundfont/fetch.mjs`), root `build:win`. `tsconfig.web.json` (checked by `npm run typecheck`), ESLint
  ignores. `.github/workflows/windows.yml`.
- Checked on Windows 11 (Node 24, Rust 1.97): both typechecks, lint, Jest (1201), Vitest (4529, with the GP1/GP2
  fixtures), `cargo check`, `vite build`, `tauri build`; in a browser (`web:dev`): new sheet, score drawing,
  fret entry by keys, cursor moves.

## Still to check by hand in the app window (`npm run tauri:dev`)

Open / Save As in each format, Open Recent, drag and drop, a second launch with a file, playback with GeneralUser GS and
an added .sf2, MIDI input, the tuner (microphone permission), PDF import (API key, projects folder, Show in
Explorer), PDF / PNG export and Print, copy / paste between tabs, the window menu's shortcuts.

Known gaps: closing the window with edited documents does not ask to save yet (the Mac app's quit check);
the installer is not code-signed (SmartScreen warns on first run).
