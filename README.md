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

## Download

[Releases](https://github.com/drakejin/gp-editor/releases) carry two macOS builds:

| file | Macs |
| --- | --- |
| `GPEditor-<version>-macos-arm64.zip` | Apple silicon (M1 and later) |
| `GPEditor-<version>-macos-universal.zip` | Apple silicon and Intel |

Unzip, move `GPEditor.app` to Applications and open it. The app is ad-hoc signed (no Apple Developer ID, not notarized),
so the first launch is blocked: open **System Settings ▸ Privacy & Security** and click **Open Anyway**, or run
`xattr -dr com.apple.quarantine /Applications/GPEditor.app` once. Requires macOS 14 or later.

## Layout

```
packages/gp-core   pure TypeScript: format detection, readers, song model, immutable edit operations, MIDI rendering
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

Release zips (arm64 and universal, with SHA256SUMS) from the Release build:

```bash
npm --prefix apps/desktop run package:macos   # → apps/desktop/macos/build/release/
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
- **View**: *Score + Tab* (default), *Score* (standard notation only) or *Tab* (tab only, with a 24-fret neck above the score
  showing every position's note name and the notes of the current beat). Pick a track on the left.
- **Cursor** (Guitar Pro style): click the score, ←/→ previous/next beat (across bars), ↑/↓ neighbouring string —
  also empty strings.
- **Edit**: type 0–9 at the cursor (two quick digits make 10–29; on an empty string this adds a note), `-`/`=` fret
  down/up, ⌥↑/⌥↓ move the note to the neighbouring string, ⌫ deletes it, ⌘Z / ⇧⌘Z undo and redo.
- **Play**: Space or ▶ Play plays all tracks (honouring mute/solo) from the cursor's bar with the macOS General MIDI
  sounds; the score and the neck follow the playing beat. Space or Esc stops.

Saving back to a Guitar Pro file is not implemented yet.

## License

GNU Lesser General Public License v2.1 or later (`LGPL-2.1-or-later`) for the whole repository — see `LICENSE`.
`packages/gp-core` follows TuxGuitar's readers (also LGPL-2.1) and carries its own copy in `packages/gp-core/LICENSE`.
Test fixtures come from the alphaTab test suite (MPL-2.0); see `packages/gp-core/test/fixtures/README.md`.
The app bundles the Bravura music font (SIL Open Font License 1.1, `apps/desktop/macos/GPEditor-macOS/Fonts/`).
