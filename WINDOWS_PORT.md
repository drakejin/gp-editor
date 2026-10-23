# Windows port — handoff notes

Branch `windows`. Goal: a Windows build of GP Editor. Chosen approach: **Tauri v2 + react-native-web**
(not react-native-windows): the React app runs unchanged in WebView2; the macOS native modules
(`apps/desktop/src/native/*.ts` → Objective-C/Swift in `macos/`) get Windows twins `*.web.ts(x)` built on web APIs
plus a small Rust side. The macOS build is untouched (Metro never resolves `.web.ts`).

## Done (not yet built or run — the previous environment had no npm/crates access)

- `apps/desktop/vite.config.ts`: root `web/`, `.web.ts(x)` resolved first, `react-native` → `web/react-native.tsx`,
  `@gp-editor/core` → `packages/gp-core/src`, output `web-dist/`, dev port 1420.
- `web/`: `index.html`, `main.tsx` (entry: fonts, menu, shortcuts, window), `app.css`,
  `react-native.tsx` (react-native-web + pointer-event Pressable with locationX/Y, onPressMove, innermost press wins;
  `tooltip` → `title`; Text through `platformText`), `platform-text.ts` (⌘/⇧/⌥/⌫ labels → Ctrl+/Shift+/Alt+/Backspace).
- `src/native/*.web.ts(x)`: gp-files, score-canvas (canvas), player (spessasynth_lib 4.3.14), audio-input (getUserMedia),
  midi-input (Web MIDI), recent-files, anthropic, projects (pdf-lib), pdf-export (pdf-lib vector PDF; print via iframe
  SVG), png-export, clipboard, focus-view, key-event (Ctrl acts as ⌘, keys typed into fields ignored).
- `src/native/key-event.ts` (+ `.web.ts`) used by `hooks/use-editor-commands.ts`.
- `src/native/web/`: `tauri.ts` (invoke wrapper; Rust errors are `"code: message"`), `app-events.ts` (menu/event bus),
  `app-menu.ts` (window menu via `@tauri-apps/api/menu`, shortcuts shown with `\t`, handled in the page),
  `files.ts`, `fonts.ts` (Bravura from `macos/GPEditor-macOS/Fonts`), `painter.ts` (GPCommandPainter port),
  `pdf-writer.ts`, `svg-pages.ts`, `synth.ts`, `settings.ts`, `window.ts` (argv files, single instance, drag-drop).
- `src/lib/file-name.ts` (`baseName`, `folderName`, `isAbsolutePath`); `recent-files.ts`, `file-formats.ts` accept
  `C:\…` paths.
- `src-tauri/`: `Cargo.toml`, `build.rs`, `src/main.rs`, `icons/`.

## To do

1. **Rust commands** (`src-tauri/src/lib.rs` + `src/commands/`), names/args as the JS calls them:
   - files: `read_file{path}` → raw bytes (`tauri::ipc::Response`; NotFound → `"missing: …"`),
     `write_file{path, base64}`, `files_exist{paths}` → `bool[]`, `initial_files` → file paths from argv.
   - settings: `app_data_read{name}` → `string|null`, `app_data_write{name, text}` (app data dir; plain file names only).
   - anthropic (key stays in Rust, `anthropic-key.txt` in app data; refuse it in app_data_*): `anthropic_has_key`,
     `anthropic_set_key{key}`, `anthropic_clear_key`, `anthropic_send{body}` → `{status, body}`
     (POST https://api.anthropic.com/v1/messages, `x-api-key`, `anthropic-version: 2023-06-01`, timeout 600 s).
   - sound banks: `sound_banks_list` → `[{id, name, isRemovable}]` (bundled resource
     `SoundFonts/GeneralUser-GS.sf2` id `generaluser` + copies in app data `SoundFonts/`), `sound_bank_add{path}` → id,
     `sound_bank_remove{id}`, `sound_bank_read{id}` → bytes.
   - projects (root `Documents\GP Editor Projects`, refuse paths outside a project / `..` / symlinks, like
     `GPProjects.m`): `project_create{pdfPath}` → `{path, name, sourceFile}`, `project_read_bytes{project, file}`,
     `project_write{project, file, base64}` → path, `project_read_text{project, file}` → `string|null`,
     `project_list` → `[{path, name, modified, project}]` newest first, `project_reveal{project}` (explorer /select,).
   - fonts: `system_font{candidates}` → bytes of the first found in `%WINDIR%\Fonts` or
     `%LOCALAPPDATA%\Microsoft\Windows\Fonts` (plain file names only).
   - plugins: `tauri-plugin-single-instance` first (emit `open-files` with argv files, focus the window),
     `tauri-plugin-dialog`.
2. `src-tauri/tauri.conf.json`: identifier `com.gpeditor.app`, window 1280×800, `dragDropEnabled: true`,
   `zoomHotkeysEnabled: false`, build hooks `npm run web:dev` / `npm run web:build`, `frontendDist: ../web-dist`,
   resource `../macos/GPEditor-macOS/SoundFonts/GeneralUser-GS.sf2` → `SoundFonts/GeneralUser-GS.sf2`,
   file associations gp/gpx/gp5/gp4/gp3/gtp/ptb/tef, NSIS + MSI. `capabilities/default.json`: `core:default`,
   `core:window:allow-set-title`, `core:menu:default`, `dialog:default`.
3. `apps/desktop/package.json`: deps `react-dom 19.2.0`, `react-native-web 0.21.2`, `@tauri-apps/api ^2`,
   `@tauri-apps/plugin-dialog ^2`, `pdf-lib 1.17.1`, `@pdf-lib/fontkit 1.1.1`, `spessasynth_lib 4.3.14`; dev
   `vite`, `@vitejs/plugin-react`, `@tauri-apps/cli ^2`, `@types/react-dom`, `@types/react-native-web`, `@types/node`.
   Scripts `web:dev`, `web:build`, `tauri:dev`, `tauri:build`, `soundfont:win` (Node version of
   `scripts/soundfont/fetch.sh`). Root `build:win`.
4. TypeScript: exclude `web/`, `src/**/*.web.ts(x)`, `src/native/web/`, `vite.config.ts`, `src-tauri` from
   `tsconfig.json`; add `tsconfig.web.json` (DOM lib, `vite/client` types) and run both in `typecheck`.
   ESLint ignore `web-dist/`, `src-tauri/target/`.
5. CI: `.github/workflows/windows.yml` on `windows-latest` (npm install in both packages, soundfont, typecheck,
   tests, `tauri build`, upload the installer).
6. Run it, fix, then docs (README/CLAUDE.md: Windows section).
