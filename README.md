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
packages/gp-core   pure TypeScript: format detection, readers, GP3/GP4/GP5 writer, song model, immutable edit operations, MIDI rendering
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

`build:mac` first fetches the GeneralUser GS SoundFont (32 MB, pinned and checksummed;
`npm --prefix apps/desktop run soundfont` does it alone). Without it the app plays with the macOS sounds.

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

- **New**: File ▸ New Score + Tab (⌘N) / New Score / New Tab, the New button (in the selected view) or the start screen —
  a blank sheet with one guitar track in standard tuning and four empty 4/4 bars at ♩ = 120, saved as `.gp5`.
- **Open**: File ▸ Open… (⌘O), the Open button, dropping a file on the window, or Finder ▸ Open With ▸ GP Editor.
- **Import PDF → tab**: File ▸ Import PDF… (⇧⌘I), the *Import PDF…* button or the start screen. Claude (Anthropic API,
  your own key) reads the sheet music page by page — tab staves as string/fret, standard notation as pitches placed on
  the tuning's strings — and the app builds a Guitar Pro 5 song from it and opens it. Every import is a project folder
  in `~/Documents/GP Editor Projects/<name>/`: the original PDF, `project.json` (status, model, pages done, warnings,
  tokens used), `pages/page-NNN.json` (each page's transcription) and `<name>.gp5`. A project whose pages did not all
  come through (network, an unreadable page, a cancelled run) can be resumed from the banner or the start screen; only
  the missing pages are sent again. The key is stored by the app on this Mac (owner-only file in its own Application
  Support folder) and never leaves the native side except in the request to `api.anthropic.com`; the model is Claude
  Opus 5.5 by default, Sonnet 5 for faster, cheaper runs. Results depend on how clear the PDF is: read the warnings
  and check the song against the PDF.
- **View**: *Score + Tab* (default), *Score* (standard notation only) or *Tab* (tab only). Whenever the tab is shown, a
  24-fret neck above the score (not for drum tracks) shows every position's note name and the notes of the current beat.
  Pick a track on the left.
- **Neck & tuning**: every pitched track is played on a guitar neck — a 4-string bass neck for basses (General MIDI bass
  programs, or strings tuned like a bass), a 6-string guitar neck for everything else (strings, choirs, keys…). The row
  above the neck names the instrument and tuning (e.g. *Guitar · 6 strings · Drop D (D A D G B E)*); **Tunings ▾** opens
  the instrument's presets — guitar: Standard, Drop D, E♭/D/C/B standard, Drop C♯/C/B, Open G, Open D, DADGAD; bass:
  Standard, Drop D, E♭/D standard, Drop C, B E A D. A ✓ marks the presets that play every note of the track within 24
  frets. Clicking a preset retunes the track and re-frets the tab so every note sounds the same (one undo step): notes
  stay on their string when they can, else move to the nearest free string; a note no string can reach within the 24
  frets moves by an octave, and a notice says how many. When a track is not on a preset that plays it — a 7-string part, a custom tuning,
  a part below low E — the row says why (e.g. *Standard guitar tuning can't play this track (lowest note D2)*) and
  offers the best tunings as one-click buttons. Opening a file never changes its tuning by itself.
- **Cursor** (Guitar Pro style): click the score, ←/→ previous/next beat (across bars), ↑/↓ neighbouring string —
  also empty strings.
- **Edit** at the cursor (keys, or the edit bar under the toolbar):
  - frets: 0–9 (two quick digits make 10–29; on an empty string this adds a note), `-`/`=` fret down/up,
    ⌥↑/⌥↓ move the note to the neighbouring string, ⌫ delete the note
  - duration: `[` longer, `]` shorter, `.` dot, `/` triplet, or the duration buttons
  - beats: `I` insert a rest after the cursor, ⇧⌫ delete the beat. As in Guitar Pro, inserting or lengthening never
    drops notes: when the bar runs out of rests it becomes over-full and its bar number turns red.
  - effects: `H` hammer-on/pull-off, `P` palm mute, `L` let ring, `V` vibrato, `X` dead note, `G` ghost note,
    `A` accent, `S` slide, `B` bend (½ → full → off), `N` natural harmonic, `T` tie
  - bars (edit bar): add/delete bar, time signature, tempo, key signature, repeat start/end
  - ⌘Z / ⇧⌘Z undo and redo
- **Save**: ⌘S saves a `.gp5` document in place; other formats — and ⇧⌘S — save a new Guitar Pro 5 file (`.gp5`).
  GP6–GP8 files lose what GP5 cannot hold (voices 3–4, strings past the 7th, double dots, RSE settings).
- **Sound**: under each track in the track list is its instrument (*♪ Distortion Electric Guitar ▾*); click it to
  pick any of the 128 General MIDI instruments, by family (Piano, Guitar, Bass, Strings, Brass, Synth Lead…). The
  instrument is saved with the song. Drum tracks keep the standard kit: Guitar Pro 3–5 files hold no drum-kit
  setting. *Sound* in the transport bar picks the sound bank every track plays with: **GeneralUser GS** (bundled,
  the default), the **macOS** GS bank, or your own SoundFont (`.sf2`) or DLS bank via *Add SoundFont…* (copied into
  the app; *Remove* deletes the copy). The bank is a playback setting, kept by the app, not saved in the file.
  Changing either while playing restarts at the bar being played, with the new sound.
- **Play**: Space or ▶ Play plays all tracks (honouring mute/solo) from the cursor's bar with the selected sound bank;
  the score and the neck follow the playing beat. Space or Esc stops. The transport bar (third row) sets up
  practice playback for the session — none of it is saved in the file:
  - *Playback tempo*: `♩ 95 · 95%` is the playing tempo of the bar playback starts from (the loop's first bar while
    looping, else the cursor's bar). −/+ change it by 5 BPM, between 25% and 300% of the written tempo and never under
    20 BPM; *100%* resets it. Every tempo of the song is scaled alike, so tempo changes keep their proportions; to
    change the written tempo use the edit bar's ♩ instead.
  - *Loop*: *Loop* turns it on (the first time, for the cursor's bar). *From* / *To* pick the first and last bar with
    −/+, or *From cursor* / *To cursor* set them to the cursor's bar (the other end moves along so From ≤ To). While
    looping, Space / ▶ Play plays those bars until stopped, straight through as written — repeat signs inside the
    loop are not followed.
  - *Speed trainer* (while looping): `+n BPM / pass` (0 = off, up to 20) makes each pass n BPM faster, `up to ♩ M`
    (default: the written tempo or 20 BPM above the playback tempo, whichever is higher) is where it stops rising.
    The pass being played and its tempo show at the end of the row.
  - Changing any of these while playing restarts playback at the bar being played, with the new settings (a loop
    keeps its pass count).

## License

GNU Lesser General Public License v2.1 or later (`LGPL-2.1-or-later`) for the whole repository — see `LICENSE`.
`packages/gp-core` follows TuxGuitar's readers (also LGPL-2.1) and carries its own copy in `packages/gp-core/LICENSE`.
Test fixtures come from the alphaTab test suite (MPL-2.0); see `packages/gp-core/test/fixtures/README.md`.
The app bundles the Bravura music font (SIL Open Font License 1.1, `apps/desktop/macos/GPEditor-macOS/Fonts/`) and
the GeneralUser GS SoundFont by S. Christian Collins (free to use and redistribute in software; its license is in
`apps/desktop/macos/GPEditor-macOS/SoundFonts/GeneralUser-GS-LICENSE.txt` and ships inside the app).
