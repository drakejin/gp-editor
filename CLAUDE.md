# gp-editor — agent rules

Guitar Pro editor desktop app. TypeScript + React + React Native (react-native-macos).
Goal: read every Guitar Pro file — GP1/GP2 (.gtp), GP3 (.gp3), GP4 (.gp4), GP5 (.gp5), GP6 (.gpx), GP7/GP8 (.gp).

## Layout

| path | what |
| --- | --- |
| `packages/gp-core/` | Pure TypeScript, no React. Format detection, readers, song model. Runs in Node (tests) and Hermes (app) — no Node APIs, no global TextDecoder in `src/`. |
| `packages/gp-core/src/model/` | `song.ts` = the format-independent model every reader returns. `defaults.ts` = constants and tick helpers. |
| `packages/gp-core/src/io/` | `ByteReader` (little-endian cursor, GTPInputStream-style string helpers), text decoding. |
| `packages/gp-core/src/formats/gtp/` | GP1–GP5 binary readers. |
| `packages/gp-core/src/formats/gpif/` | GP6 (.gpx, BCFZ/BCFS container) and GP7/8 (.gp, zip) — both hold a GPIF XML document. |
| `packages/gp-core/test/` | Vitest. `fixtures/guitarproN/` real files (see its README). `helpers/invariants.ts` = checks every reader output must pass. |
| `apps/desktop/` | React Native app with the macOS target (`macos/`, Xcode + CocoaPods). |

## Commands

Use Node 24 (`mise.toml`); Homebrew's Node 25 is not supported by some tools.

```bash
npm run test        # gp-core unit tests
npm run coverage    # gp-core coverage (80% lines gate)
npm run typecheck   # gp-core + desktop tsc
npm run build:mac   # Release build of the macOS app (xcodebuild)
```

## Conventions

- Reference implementation: TuxGuitar (`../tuxguitar`, LGPL-2.1). Readers are ports of its
  `common/TuxGuitar-gtp` and `common/TuxGuitar-gpx` modules; each ported file starts with a
  one-line comment naming the TuxGuitar class it follows. gp-core is therefore LGPL-2.1-or-later.
- Model objects are `readonly`. Readers build fresh objects; never mutate a model object after creating it.
- Strict TS (`noUncheckedIndexedAccess`). No `any`, no `console.log`. Functions < 50 lines, files < 800 lines.
- Bend / tremolo-bar values are in quarter tones, positions 0–12 (TuxGuitar's TGEffectBend units).
- Strings are numbered from 1 = highest string. Ticks: `QUARTER_TIME` (960) per quarter note.
- Tests: Vitest, AAA, descriptive names. Every reader has a fixture sweep (all files in its folder parse
  and pass `assertSongInvariants`) plus value checks for specific files.
