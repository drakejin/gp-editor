# gp-editor — agent rules

Guitar Pro editor desktop app. TypeScript + React + React Native (react-native-macos).
Goal: read every Guitar Pro file — GP1/GP2 (.gtp), GP3 (.gp3), GP4 (.gp4), GP5 (.gp5), GP6 (.gpx), GP7/GP8 (.gp).

## Layout

| path | what |
| --- | --- |
| `packages/gp-core/` | Pure TypeScript, no React. Format detection, readers, writer, song model, edits, MIDI. Runs in Node (tests) and Hermes (app) — no Node APIs, no global TextDecoder in `src/`. |
| `packages/gp-core/src/model/` | `song.ts` = the format-independent model every reader returns. `defaults.ts` = constants and tick helpers. |
| `packages/gp-core/src/io/` | `ByteReader` (little-endian cursor, GTPInputStream-style string helpers), text decoding. |
| `packages/gp-core/src/formats/common/` | Guitar Pro facts shared by both reader families: GM channel names and bass programs, harmonic table, velocity scale, bend/whammy units. |
| `packages/gp-core/src/formats/gtp/` | GP1–GP5 binary readers. |
| `packages/gp-core/src/formats/gpif/` | GP6 (.gpx, BCFZ/BCFS container) and GP7/8 (.gp, zip) — both hold a GPIF XML document. |
| `packages/gp-core/src/edit/` | Immutable edit operations on a `Song`: notes (`setNoteFret`, effects, ties, bends), beats (`setBeatDuration`, `insertBeat`, `deleteBeat`), measures and measure headers (time signature, tempo, key, repeats), a track's instrument (`setTrackProgram`). Beat edits may leave a measure over-full (`isMeasureOverfull`), never drop notes. Tuning: `tuning-presets.ts` (guitar/bass presets, `resolveInstrument`), `string-placement.ts` (one beat's notes onto strings), `tuning-fit.ts` (`canPlayOnTuning`, `suggestTunings` for the `NECK_FRETS`-fret neck), `retune.ts` (`setTrackTuning` re-frets every note to keep its pitch, counting octave moves). |
| `packages/gp-core/src/write/` | `writeSong(song, 'gp5' \| 'gp4' \| 'gp3')` — ports of TuxGuitar's GP3/4/5 output streams; what a format cannot hold is listed in `test/helpers/write-expected.ts`. |
| `packages/gp-core/src/transcription/` | PDF import contract: `types.ts` (one page as a model returns it) and `tool.ts` (its JSON schema, sent as the tool), `parseTranscriptionPage` (checks the untrusted answer; numbers that size allocations are capped, e.g. `MAX_TRANSCRIBED_TRACKS`) and `buildSongFromTranscription`. |
| `packages/gp-core/test/` | Vitest. `fixtures/guitarproN/` real files (see its README). `helpers/invariants.ts` = checks every reader output must pass. |
| `packages/gp-core/src/midi/` | Song → Standard MIDI File + playback timeline (port of TuxGuitar's MidiSequenceParser). |
| `apps/desktop/` | React Native app with the macOS target (`macos/`, Xcode + CocoaPods). See its README for the QA driver, Hermes smoke and E2E scripts. |
| `apps/desktop/src/score/` | Engravers: pure functions from the song to `DrawCommand`s (`draw.ts`) — tab, notation, heading, fretboard, rows, hit-testing; `symbols/` holds the shapes notation and tab share (slurs, bends, slides, effect marks). |

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

## Naming (one vocabulary for the whole repo)

- **Model words come from `src/model/song.ts`**: song, track, measure + measure header (GPIF's raw `<MasterBar>`/`<Bar>` keep
  their names only inside `formats/gpif`), beat, voice, note, string, fret, tempo, `velocity` (MIDI value; the raw Guitar Pro
  value is a `dynamic`), `channelId` (model) vs `gmChannel` (raw MIDI channel in the file).
- **0-based positions end in `Index`** (`trackIndex`, `Measure.headerIndex`, `NoteAddress.measureIndex`);
  **1-based musical numbering is `number`** (`Track.number`, `MeasureHeader.number`, `GuitarString.number`, `trackNumber`).
- **Verbs**: `read*` consumes bytes/XML; `parse*` interprets one already-extracted raw value; `build*` assembles model
  objects; `to*` / `*From*` are pure conversions; `resolve*` picks among fallbacks; `set*` / `shift*` / `delete*` are edits
  that return a new `Song`. Editor actions are named after the gp-core function they run (`setNoteFret`, `shiftNoteFret`,
  `shiftNoteString`, `deleteNote`).
- **Booleans** `is*` / `has*` / `can*`. **Constants** `UPPER_SNAKE_CASE`, including grouped objects (`TAB`, `FRET_BOX`).
- **Files**: modules are kebab-case (`byte-reader.ts`, `fret-input.ts`); React components are PascalCase (`ScoreRow.tsx`);
  a test file is named after the module it tests (`fret-input.test.ts`). Exception: codegen specs must be named
  `*NativeComponent.ts` (`src/native/specs/`).
- **Score drawing**: the score is never built from one React view per glyph. Engravers return `DrawCommand`s and the
  native `GPScoreCanvas` draws a whole row; music symbols are SMuFL code points of the bundled Bravura font (`SMUFL` in
  `draw.ts`).
- **One home per fact**: shared Guitar Pro facts in `formats/common`, model helpers (`durationTicks`, `durationFromTicks`,
  `NOTE_VALUES`) in `model/defaults.ts`; never re-declare them in a reader. Tables keyed by text from a file are read with
  `lookupName` (own properties only).
- **App**: props interfaces are `XxxProps`; callbacks are `onXxx`; `palette` is passed as a prop below `App`
  (only `App` calls `usePalette()`); notification names shared by Swift and Objective-C live in `GPEditorNotifications.h`.

