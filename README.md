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
| MusicXML | `.musicxml`, `.xml`, `.mxl` | XML (`.mxl`: zip) | `musicxml/musicxml-reader.ts` (written by `write/musicxml/`) |

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
packages/gp-core   pure TypeScript: format detection, readers, GP3/GP4/GP5 and ASCII tab writers, song model, immutable edit operations
                   (incl. tunings), MIDI rendering, PDF transcription → song
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

Release zips (arm64 and universal, with `SHA256SUMS.txt`) from the Release build:

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
npm run coverage                            # gp-core coverage; gate 80% lines/functions/statements, 70% branches
npm --prefix apps/desktop test              # app (Jest)
npm --prefix apps/desktop run lint          # ESLint (app)
npm run typecheck                           # tsc for both packages
```

The Hermes smoke test, the `open -a` E2E check and the QA driver are described in `apps/desktop/README.md`.

## Using the app

- **Window** (Guitar Pro 8's layout): the **top bar** — the panel toggles (palette, tracks, inspector); zoom (50–200%, ⌘- / ⌘=); undo and redo; the transport (first, previous, play/stop,
  next, last bar — also Home, ⌥←, Space, ⌥→, End) and the **LCD** (the track, bar *n*/*N*, time signature, time and
  length, tempo at the playback speed, the loop pass, and what the cursor is on); ⟲ Loop and the ♩ speed menu; the
  piano keyboard and fretboard toggles and **?** (the keyboard shortcut sheet). File commands — New, Open, Close Tab, Save, Import PDF, Export PDF,
  Export MIDI, Export ASCII Tab, Print — are in the macOS menu bar's **File** menu. Under it the **tab strip** (one tab per open document), then: the **edition palette** on the left, the **score** as a page on a
  grey desk in the middle, the **inspector** (SONG / TRACK) on the right, and at the bottom the **piano keyboard**, the
  **fretboard** and the
  **tracks panel** — each track's instrument icon, name, show, mute, solo, volume and pan, and the **bar map**: a cell
  per bar and track, in the track's colour where it has notes, grey where it only rests, a dark square on the cursor's
  bar, lettered sections underneath. Clicking a cell shows that track at that bar.
- **New**: File ▸ New Score + Tab (⌘N) / New Score / New Tab or the start screen —
  a blank sheet with one guitar track in standard tuning and four empty 4/4 bars at ♩ = 120, saved as `.gp5`.
- **Open**: File ▸ Open… (⌘O), dropping a file on the window, or Finder ▸ Open With ▸ GP Editor
  (Guitar Pro files). A PDF dropped on the window (or handed over with `open -a`) is imported as below instead.
- **Recent files**: File ▸ Open Recent lists the last 20 files opened or saved, newest first, and *Clear Menu* empties it;
  File ▸ Recent Files… (and the start screen, for the first five) shows the same list with *Open*, *Pin* / *Unpin* and
  *Remove* for each file. Pinned files stay on top, in the order they were pinned, and new files never push them out
  (*Clear Menu* keeps them too). A file opens as File ▸ Open does — in a new tab, or its tab is shown when it is already
  open —, also after a relaunch: the sandboxed app keeps a security-scoped bookmark of each file, which follows a file
  that was moved or renamed; a file that is gone shows as *missing* until it is removed or found again.
- **Tabs**: as in Guitar Pro 8, every document opens in a tab of its own — New, Open, a file from Finder or dropped on
  the window, a finished PDF import; opening a file that is already open shows its tab instead. A tab shows the song's
  title (else the file name), a • while edited and a × to close it; the shown tab is lit, and many tabs scroll
  sideways. Click a tab, or File ▸ Next Tab (⌃⇥) / Previous Tab (⌃⇧⇥), to switch: each tab keeps its own song, undo
  history, cursor, selection, view and track, and switching stops playback. Save, Export PDF, Print, the clipboard, the
  palette, the inspector and the tracks panel act on the shown tab; zoom and the panels are the same for every tab.
  File ▸ Close Tab (⌘W) or the × closes a tab; an edited one asks first — *Save changes to “…”?* *Save* saves and
  then closes it (cancelling the save panel keeps it open), *Don't Save* closes it, *Cancel* (or Esc) keeps it.
  Closing the last tab shows the start screen again.
- **Import PDF → tab**: File ▸ Import PDF… (⇧⌘I) or the start screen. Claude (Anthropic API,
  your own key) reads the sheet music page by page — tab staves as string/fret, standard notation as pitches placed on
  the tuning's strings — and the app builds a Guitar Pro 5 song from it and opens it. Every import is a project folder
  in `~/Documents/GP Editor Projects/<name>/`: the original PDF, `project.json` (status, model, pages done, warnings,
  tokens used), `pages/page-NNN.json` (each page's transcription) and `<name>.gp5`. A project whose pages did not all
  come through (network, an unreadable page, a cancelled run) can be resumed from the banner or the start screen; only
  the missing pages are sent again. The key is stored by the app on this Mac (owner-only file in its own Application
  Support folder) and never leaves the native side except in the request to `api.anthropic.com`; the model is Claude
  Opus 5.5 by default, Sonnet 5 for faster, cheaper runs. The first import (no key saved yet) opens the import settings:
  paste the key, pick the model, *Choose PDF…*; after that *Import PDF…* goes straight to the PDF, and the banner's
  *Import settings…* changes the key or the model. Page 1 is sent first (it names the song and its tracks), then up to
  three pages at a time; a busy or failing page is tried three times, a refused key or an empty credit balance stops
  the import. One import runs at a time. A PDF may have at most 60 pages and 100 MB; password-protected PDFs are
  refused. Results depend on how clear the PDF is: read the warnings and check the song against the PDF.
- **View**: the Track inspector's *Notation* toggles show standard notation, tab or both (at least one stays on). The
  24-fret fretboard at the bottom (not for drum tracks) shows every position's note name and the notes of the current
  beat; right above it an 88-key **piano keyboard** (A0–C8, every C named) lights the keys those notes sound, capo
  included, named (e.g. *A#4*) — the playing beat while playing. Each has its own toggle at the right of the top bar
  (piano and neck icons). Pick a track in the tracks panel (or its bar map).
- **Neck & tuning**: the neck shows the track's own strings and capo. Its tuning presets come from its instrument:
  4-string bass presets for basses (a General MIDI bass program — so picking a bass instrument switches them — or
  strings tuned like a bass), 6-string guitar presets for every other pitched track (guitars, strings, choirs, keys…). The Track
  inspector names the instrument and tuning (e.g. *Guitar · 6 strings · Drop D (D A D G B E)*); **Tunings ▾** opens
  the instrument's presets — guitar: Standard, Drop D, E♭/D/C/B standard, Drop C♯/C/B, Open G, Open D, DADGAD; bass:
  Standard, Drop D, E♭/D standard, Drop C, B E A D. A ✓ marks the presets that play every note of the track within 24
  frets. Clicking a preset retunes the track and re-frets the tab so every note sounds the same (one undo step): notes
  stay on their string when they can, else move to the nearest free string; a note no string can reach within the 24
  frets moves by an octave, and a note whose beat has more notes than the new tuning has strings is left out; a notice
  says how many of each (⌘Z restores the old tuning). When a track is not on a preset that plays it — a 7-string part, a custom tuning,
  a part below low E — the row says why (e.g. *Standard guitar tuning can't play this track (lowest note D2)*) and
  offers the best tunings as one-click buttons. Opening a file never changes its tuning by itself.
- **Cursor** (Guitar Pro style): click the score, ←/→ previous/next beat (across bars), ↑/↓ neighbouring string —
  also empty strings. Keys reach the score only from the score: what is typed in a text field (the Song Writer, the
  inspector, the palette's texts) stays in it, and while a panel, sheet or menu is open over the score every key but
  Esc leaves the score alone (Esc closes it, the topmost first).
- **Edit** at the cursor (keys, or the edition palette — each button's tooltip names its key; a lit button is what
  the cursor's note, beat or bar has; an edit that cannot apply says why in a strip under the tab strip):
  - frets: 0–9 (two quick digits make 10–29; on an empty string this adds a note), `-`/`=` fret down/up,
    ⌥↑/⌥↓ move the note to the neighbouring string
  - erase: ⌫ or ⌦ turns the note into a rest; on a rest it removes the rest (the beats after it move up and the bar
    ends with a rest again)
  - voices: the palette's 1 / 2 (Guitar Pro 5 files hold two); typing a fret on voice 2 starts that voice there
  - duration: ⌥`[` longer, ⌥`]` shorter, `.` dot, `/` triplet, or the palette's Rhythm: whole to 64th, dot, tuplets
    (3, 5, 6, 7, 9, 10, 11, 12), rest, tie
  - a tuplet inside a tuplet (as Guitar Pro 7 and 8 write them): ⌥`/` puts a triplet inside the beat's tuplet, or the
    palette's *Inner* sets any size. Every tuplet is exact: a bar of 7, 9, 11 or 13-tuplets fills exactly. Notation
    draws the inner bracket and number next to the notes and the outer one beyond it; the tab rhythm shows `5(3)`.
    GP3–GP5 files cannot hold one: Save writes a same-length tuplet when there is one (a triplet in a triplet = 9:8),
    else only the outer tuplet
  - beats: `I` insert a rest after the cursor, ⇧⌫ delete the beat. As in Guitar Pro, inserting or lengthening never
    drops notes: when the bar runs out of rests it becomes over-full and its bar number turns red.
  - techniques: `R` let ring, `S` slide, `H` / `P` hammer-on / pull-off (one Guitar Pro effect: the tab shows H or P
    by the next note's pitch), `M` palm mute, `X` dead (muted) note, `G` ghost note, `A` accent, `N` natural
    harmonic, `T` tie. The palette's **Techniques** group, right under Rhythm (visible without scrolling), has every
    one of them as a button with its key in the corner — Bend C, Slide S, H/P H, Harm. N, P.M. M, L.R. R, Dead X,
    Vib. B, ( ) G — lit while the note has it, then the whammy bar, trill, tremolo picking, grace note, tap, slap,
    pop and fade in
  - `B` (or the palette's *Vib.*) opens the **vibrato** panel (none / slight / wide, with how it is drawn); `C` (or *Bend*) the **bend (choking)** panel:
    the shape (bend, bend & release, bend-release-bend, pre-bend, pre-bend & release, release) and the amount (¼ to 3
    tones), with its curve. A choice applies at once (one undo step each); *Done*, Esc or a click outside closes the
    panel, and it closes by itself when the cursor moves onto an empty string.
  - the palette also sets: dynamics ppp–fff, heavy accent, staccato; the slide kinds (shift, legato, in from below /
    above, out down / up); the whammy bar (dip, dive, release up / down, inverted dip, return); harmonics (natural, artificial, tapped, pinch, semi);
    trill and tremolo picking speeds; a grace note before or on the beat; tapping, slap, pop, fade in; brush and pick
    strokes up / down; text above the beat. Options open under their group.
  - bars (the palette's Bar group): add/delete bar, time signature, tempo, key signature, repeat start/end and the
    number of plays, alternate endings 1–8, triplet feel, a section name
  - ⌘Z / ⇧⌘Z undo and redo
  - copy and paste: drag across the score — into other rows too — or ⇧← / ⇧→ or ⇧-click select beats from the
    cursor (tinted on both staves; any other move clears the selection); ⌘C copies them — or the cursor's beat when nothing is selected — to the clipboard, ⌘X cuts them, rests
    too, and the beats after them move up; ⌘V inserts the copied beats at the cursor and pushes what follows on, across
    bar lines: a note that runs over a bar line becomes tied notes, and bars are added at the end when needed. Cut and
    paste are one undo step each; drum beats paste only into drum tracks.
- **Keys everywhere**: Space play / stop; `]` / `[` the playback tempo 5 BPM up / down (the speed menu follows; the
  song is not edited); Esc closes the open panel, sheet or menu, else stops playback; ⌘S save; ⌘W close the tab; ⌃⇥ / ⌃⇧⇥ next / previous
  tab; ⌘P print; ⌘H (Help ▸
  Keyboard Shortcuts, or the top bar's **?**) shows every shortcut on one sheet.
- **Save**: ⌘S saves the shown tab in place, in its own format, when the app writes that format (`.gp5`, `.gp4`,
  `.gp3`); other files — and ⇧⌘S (Save As…) — ask where to save, with a *Format* popup under the save panel: Guitar
  Pro 5 (`.gp5`, chosen first unless the file is a `.gp4` or `.gp3`), Guitar Pro 4 (`.gp4`) or Guitar Pro 3 (`.gp3`);
  the extension follows the choice. GP4 and GP3 keep one voice per bar (voice 2 joins voice 1) and one triplet feel,
  and GP3 holds no lyrics and fewer effects: the save panel and the hint strip say what is left out when one is written.
  GP6–GP8 files lose what GP5 cannot hold (voices 3–4, strings past the 7th, double dots, RSE settings).
- **Song Writer** (Edit ▸ AI Wizard ▸ Song Writer…): Claude writes a new song for guitar and bass. Give it a title,
  a genre (type one or pick Pop, Rock, Ballad, Blues, Folk, Metal, Jazz, Funk), a length (0:20–5:00 in 15-second
  steps), the lyrics (sung as written, in order; left empty, Claude writes them), what the song is about — and, with
  *Build on the open score*, the shown track's first bars with notes, whose melody, rhythm and feel it develops.
  *Write song* plans the song first (tempo, meter, key, a lead guitar that plays the sung melody, usually a rhythm
  guitar and a bass, and the sections with their chords and lyrics), then writes the sections three at a time; the
  panel shows each step and *Stop* ends the run. The song opens in a new tab, unsaved: each section's name is a
  marker on its first bar, the lyrics are under the lead guitar's staff, the genre and description are in the song
  information, and the hint strip sums it up (with anything that went wrong — a section that could not be written
  becomes rests). It uses the PDF import's Anthropic key and model (Claude Opus 5.5 by default, Sonnet 5 for
  faster, cheaper songs); the panel can save a key too. The draft is kept when the panel closes.
- **Lyrics**: a track's lyrics (from a Guitar Pro file or the Song Writer) show under its notation staff, else under
  the tab — one syllable under each beat that has notes, as Guitar Pro places them.
- **Export**: File ▸ Export PDF… (⇧⌘E) opens the export panel: the shown track as a PDF in
  *Score + Tab*, *Score* or *Tab* (the view's mode is selected first) on *A4* or *US Letter*; the panel says how many
  pages it makes, and *Save PDF…* asks where to save it. The PDF is engraved like the screen, at print size (a 7.3 mm
  staff), in black and grey on white even in dark mode: the title, subtitle, artist, album and credits with the
  track's instrument and tuning on the first page, then the rows packed top to bottom (a row is never split across
  pages), and "*title* — *page* / *pages*" at the foot of every page. A bar too long for a line has its beats moved
  closer (and an extremely dense one is printed smaller) so nothing runs off the page. The PDF is vector graphics (lines,
  curves and the fonts' glyphs), sharp at any zoom or printer resolution, so it has no resolution setting.
- **Export PNG**: File ▸ Export PNG… opens the same panel for images: the same pages (mode and paper as for the PDF) at
  *72*, *150* or *300 dpi* (an A4 page is 595 × 842, 1240 × 1754 or 2479 × 3508 pixels, the dpi recorded in the file),
  on a *White* or *Transparent* background (no paper: only the notation is drawn, and the tab lines still stop around
  the fret numbers). One page is saved through a save panel as *name*.png; several pages go into a folder you choose as
  *name*-1.png … *name*-N.png (numbers padded so they sort in order — the app may write only where you point it), and
  the hint strip says what was saved where.
- **Export MIDI**: File ▸ Export MIDI… saves the song as playback plays it as a Standard MIDI File (`.mid`): repeats
  unfolded, at the written tempo (not the practice speed), muted tracks left out and, when a track is solo, only the
  solo tracks.
- **Export ASCII tab**: File ▸ Export ASCII Tab… saves the fretted tracks (drum tracks are left out) as plain-text tab
  (`.txt`, TuxGuitar's layout): each string named by its open note, bars spaced by the length of their beats, h / p,
  slides (/ \\), bends (b, r, H), dead notes (X) and chord names above, in lines of at most 80 columns.
- **MusicXML**: Open, Finder and drag and drop also read MusicXML — `.musicxml` / `.xml` and compressed `.mxl`,
  score-partwise or score-timewise (converted). Each part becomes a track: a tab staff gives its tuning, capo, strings
  and frets; without one, the written pitches go on a guitar's (or bass's) strings. Bars, meters, tempos, repeats,
  endings, rehearsal marks, voices, ties, tuplets (nested ones too), grace notes, dynamics, lyrics and the guitar
  effects MusicXML has (hammer-ons, slides, bends, harmonics, vibrato, palm mute, let ring …) are read. File ▸ Export
  MusicXML… / Export Compressed MusicXML… saves the song as `.musicxml` / `.mxl` (MusicXML 4.0 as TuxGuitar writes it:
  a notation staff and a tab staff per track) for other notation programs. MusicXML has no place for chord diagrams,
  slapping, popping, fade-in, a stroke's speed, pinch / tapped / semi-harmonics (written as artificial or plain ones)
  or when in the note a bend moves (it reads back in even steps).
- **Print**: File ▸ Print… (⌘P) prints the shown track in the view's mode, engraved as for the PDF export (A4, scaled to
  the printer's paper), through the macOS print panel.
- **Sound**: the Track inspector's *Instrument* (or the track's icon in the tracks panel) opens the instrument panel
  over the score — step 1 on the left picks one of the 16 General MIDI families (Piano, Guitar, Bass, Strings, Brass,
  Synth Lead…), step 2 on the right one of its 8 instruments, which the track plays at once. The panel stays open to
  try sounds one after another; *Done* or a click outside closes it. The instrument is saved with the song (a track
  that shared its channel with another gets a channel of its own). Drum tracks keep the standard kit: Guitar Pro 3–5
  files hold no drum-kit setting. The tracks panel's volume and pan (saved with the song) are heard at once while
  playing; mute and solo restart playback at the bar being played. The Song inspector's *Sound bank* picks the bank
  every track plays with: **GeneralUser GS** (bundled, the default), **macOS (Roland GS)**, the bank that ships with
  macOS, or your own SoundFont (`.sf2`) or DLS bank via *Add SoundFont…* (copied into the app; *Remove* deletes the
  copy). The bank is a playback setting, kept by the app, not saved in the file; a new bank restarts playback at the
  bar being played, once, shortly after the last click.
- **Play**: Space or ▶ plays all tracks (honouring each track's mute and solo) from the cursor's bar — or, with beats
  selected, from the selection's first beat, wherever the drag ended — with the selected
  sound bank; the score, the piano keyboard, the fretboard and the bar map follow the playing beat. Space or Esc stops. The top bar's ♩
  speed menu and ⟲ Loop set up practice playback for the session — none of it is saved in the file:
  - *Speed*: 25%–100% of the written tempo, a tempo in BPM (60, 90, 120, 150 and the written one), or *Custom* −/+ in
    5 BPM steps — also `]` / `[` on the keyboard — (25%–300% of the written tempo, never under 20 BPM). Every tempo of the song is scaled alike, so tempo
    changes keep their proportions; to change the written tempo use the palette's Tempo instead. The LCD shows the
    playing tempo and the percentage.
  - *Loop*: ⟲ Loop turns it on (the first time, for the cursor's bar); the speed menu's *Loop bars* pick the first and
    last bar with −/+, or *From cursor* / *To cursor* (the other end moves along so From ≤ To). While looping, Space / ▶
    plays those bars until stopped, straight through as written — repeat signs inside the loop are not followed.
  - *Speed trainer* (in the speed menu, while looping): `+n BPM` each pass (0 = off, up to 20), *Up to* ♩ M (default:
    the written tempo or 20 BPM above the playback tempo, whichever is higher). The LCD shows the pass and its tempo.
  - Changing any of these while playing restarts playback at the bar being played, with the new settings (a loop
    keeps its pass count). Adding or deleting a bar while playing stops playback.

## License

GNU Lesser General Public License v2.1 or later (`LGPL-2.1-or-later`) for the whole repository — see `LICENSE`.
`packages/gp-core` follows TuxGuitar's readers (also LGPL-2.1) and carries its own copy in `packages/gp-core/LICENSE`.
GP3–GP8 test fixtures come from the alphaTab test suite (MPL-2.0); the GP1/GP2 files are not committed (fetched by
`fetch-gtp.sh`) — see `packages/gp-core/test/fixtures/README.md`.
The app bundles the Bravura music font (SIL Open Font License 1.1, `apps/desktop/macos/GPEditor-macOS/Fonts/`) and
the GeneralUser GS SoundFont by S. Christian Collins (free to use and redistribute in software; its license is in
`apps/desktop/macos/GPEditor-macOS/SoundFonts/GeneralUser-GS-LICENSE.txt` and ships inside the app).
