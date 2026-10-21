# gp-editor

Guitar Pro tablature editor for the desktop, written in TypeScript with React Native (macOS target via
[react-native-macos](https://github.com/microsoft/react-native-macos)).

The goal is to open every Guitar Pro file:

| Guitar Pro | extension | container | reader |
| --- | --- | --- | --- |
| 1, 2 | `.gtp` | binary | `packages/gp-core/src/formats/gtp/gp1.ts`, `gp2.ts` |
| 3 | `.gp3` | binary | `gtp/gp3.ts` |
| 4 | `.gp4` | binary | `gtp/gp4.ts` |
| 5 | `.gp5` | binary | `gtp/gp5.ts` |
| 6 | `.gpx` | BCFZ / BCFS → GPIF XML | `gpif/gpx.ts` |
| 7, 8 | `.gp` | zip → GPIF XML | `gpif/gp7.ts` |

The format is detected from the file content, not the extension.

## Layout

```
packages/gp-core   pure TypeScript: format detection, readers, song model, immutable edit operations
apps/desktop       React Native app; macOS project in apps/desktop/macos
```

`gp-core` has no React or Node dependencies at runtime (only `fflate` and `fast-xml-parser`, both pure JS),
so the same code runs in the tests (Node) and in the app (Hermes).

## Requirements

- Node 24 (`mise.toml`; `mise install`)
- Xcode 26 and CocoaPods (`brew install cocoapods`)

## Build

```bash
npm --prefix packages/gp-core install
npm --prefix apps/desktop install
npm --prefix apps/desktop run pods          # pod install for macos/
npm run build:mac                           # Release .app → apps/desktop/macos/build/DerivedData/Build/Products/Release/GPEditor.app
```

Development with Metro and fast refresh:

```bash
npm start                                   # Metro
npm --prefix apps/desktop run macos         # Debug build + launch
```

## Test

```bash
npm test                                    # gp-core (Vitest) — fixtures in packages/gp-core/test/fixtures
npm run coverage                            # gp-core coverage, 80% line gate
npm --prefix apps/desktop test              # app logic (Jest)
npm run typecheck                           # tsc for both packages
```

## Using the app

- **Open**: File ▸ Open… (⌘O), the Open button, dropping a file on the window, or Finder ▸ Open With ▸ GP Editor.
- **Navigate**: pick a track on the left; click a fret number to select it; ←/→ move to the previous/next note.
- **Edit**: type 0–9 (two quick digits make 10–29), `-`/`=` lower/raise the fret, ↑/↓ move the note to the
  neighbouring string, ⌫ deletes it, ⌘Z / ⇧⌘Z undo and redo.

Saving back to a Guitar Pro file is not implemented yet.

## License

`packages/gp-core` follows TuxGuitar's readers (LGPL-2.1) and is licensed LGPL-2.1-or-later.
Test fixtures come from the alphaTab test suite (MPL-2.0); see `packages/gp-core/test/fixtures/README.md`.
