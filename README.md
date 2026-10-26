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
| MIDI (Standard MIDI File 0, 1) | `.mid`, `.midi` | MThd / MTrk chunks | `midi/midi-song-reader.ts` |
| MusicXML | `.musicxml`, `.xml`, `.mxl` | XML (`.mxl`: zip) | `musicxml/musicxml-reader.ts` (written by `write/musicxml/`) |

It also imports two other tablature programs' files (saved as `.gp5`):

| program | extension | reader |
| --- | --- | --- |
| Power Tab Editor 1.7 | `.ptb` | `ptb/ptb.ts` (repeats and jumps played out, as TuxGuitar does) |
| TablEdit 3 and later | `.tef` | `tef/tef.ts` (not TablEdit 2, which has no header to detect) |

The format is detected from the file content, not the extension.

`gp-core` also writes Guitar Pro files (`writeSong`): GP3, GP4, GP5 and Guitar Pro 7 `.gp` (zip → GPIF XML, which Guitar
Pro 7 and 8 open). What each format cannot hold is listed in `packages/gp-core/test/helpers/write-expected.ts` (GP3–GP5)
and `write-expected-gpif.ts` (`.gp`).
Guitar Pro itself has not opened these files in our tests; alphaTab is the independent check (see Test).

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
packages/gp-core   pure TypeScript: format detection, readers, GP3/GP4/GP5, GP7 (.gp) and ASCII tab writers, song model, immutable edit operations
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
It then builds the audio export's MP3 and Ogg Vorbis encoders — LAME, libogg and libvorbis from their official source
releases (pinned and checksummed), universal static libraries, once (`npm --prefix apps/desktop run audio-codecs`);
this needs the network the first time and only Xcode's command line tools.

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

Compatibility of the files we write: Guitar Pro itself is not run by the tests, so nothing has proven that Guitar Pro
opens them. `npm test` (and `npm run coverage`, so every release) runs an independent check instead,
`packages/gp-core/test/cross-check-alphatab.test.ts`: every fixture (GP1–GP8, Power Tab, TablEdit, MIDI, MusicXML) is
written as `.gp`, GP5, GP4 and GP3 and read by [alphaTab](https://github.com/CoderLine/alphaTab) (a widely used reader of
Guitar Pro files; MPL-2.0, a test-only devDependency, not bundled into the app), which must read it as gp-core does —
tracks, tunings, bars, signatures, repeats, beats, durations, notes and effects. The few places where alphaTab reads
Guitar Pro's own files differently are listed, with that evidence, in
`packages/gp-core/test/helpers/alphatab-known-differences.ts`.

## Using the app

- **Window** (Guitar Pro 8's layout): the **top bar** — the panel toggles (palette, tracks, inspector); zoom (50–200%, ⌘- / ⌘=); undo and redo; the transport (first, previous, play/stop,
  next, last bar — also Home, ⌥←, Space, ⌥→, End) and the **LCD** (the track's colour, icon and name, bar *n*/*N*, time signature, time and
  length, tempo at the playback speed, the loop pass, and what the cursor is on; while playing, a dot per beat);
  ⟲ Loop, Metronome, Count-in, the practice menu ▾ and − ♩ speed menu +; the
  piano keyboard and fretboard toggles and **?** (the keyboard shortcut sheet). File commands — New, Open, Close Tab, Save, Import PDF, Export PDF,
  Export MIDI, Export Audio, Export ASCII Tab, Print — are in the macOS menu bar's **File** menu. Under it the **tab strip** (one tab per open document), then: the **edition palette** on the left, the **score** as a page on a
  grey desk in the middle, the **inspector** (SONG / TRACK / NOTE) on the right, and at the bottom the **piano keyboard**, the
  **fretboard** and the
  **tracks panel** — each track's colour strip, icon, name, show, mute, solo, volume and pan, and the **bar map**: a cell
  per bar and track, in the track's colour where it has notes, grey where it only rests, a dark square on the cursor's
  bar, lettered sections underneath. Clicking a cell shows that track at that bar.
- **New**: File ▸ New Score + Tab (⌘N) / New Score / New Tab or the start screen —
  a blank sheet with one guitar track in standard tuning and four empty 4/4 bars at ♩ = 120, saved as `.gp5`.
- **Open**: File ▸ Open… (⌘O), dropping a file on the window, or Finder ▸ Open With ▸ GP Editor
  (Guitar Pro, Power Tab, TablEdit and MIDI files). A PDF dropped on the window (or handed over with `open -a`) is imported as below instead.
- **MIDI files** (`.mid`, `.midi`) open like Guitar Pro files, as TuxGuitar imports them: one track per MIDI track (a
  format 0 file's channels each get one), drums on channel 10 as a drum track, tempo, time and key signature changes as
  bars, note lengths rounded to sixteenths (no tuplets) and tied across bar lines, notes on a standard guitar — or a
  4-string bass for a bass program — when they fit it, else on TuxGuitar's next tuning. Save asks where to save it
  as a Guitar Pro file.
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
- **Banjo**: a track playing the General MIDI banjo (or tuned like a 5-string banjo) gets banjo presets — Open G
  (g D G B D), Double C, Open D, G modal, and the 4-string Tenor, Irish tenor and Plectrum banjos. On a 5-string banjo
  the short 5th string starts at the 5th fret: the fretboard draws it from its peg there, and the tab numbers it as
  Guitar Pro does — 0 is the open drone, then 6, 7, 8 … (the file stores 0, 1, 2 …, as Guitar Pro's files do). Type
  the tab's numbers on that string; 1–5 are refused with a hint.
- **Drum kit**: for a drum track the instrument view (either toggle) shows a drum kit from above — kick, snare and
  rim, hi-hat (closed, open, pedal), three toms and a floor tom, crash, crash 2, ride and its bell, china, splash,
  cowbell — with the drums of the current beat lit (the playing beat while playing); drums the kit has no piece for are
  named underneath. Clicking a piece enters that drum (its General MIDI key) into the cursor's beat, a second click
  takes it out (one undo step each).
- **Drum notation**: drum tracks are written as Guitar Pro writes them, from its factory drum kit: each drum on its own
  line with its own notehead — closed hi-hat ×, open hi-hat circled ×, half-open circled slash, pedal hi-hat × under the
  staff, crash heavy ×, china heavy × with its hat, ride ×, ride bell diamond, rim shot diamond, side stick ×, cowbell
  triangle, the toms from the floor tom up — and its symbol: the cymbal's edge above the staff, a choke's dot, a mute in
  parentheses, tambourine and shaker strokes. Guitar Pro 7/8's articulations (half-open hi-hat, ride edge, chokes …)
  keep their own places. Percussion the kit writes far off the staff (guiro, shaker …) and keys it lacks sit on the
  middle line.
- **Drum Key**: View ▸ Drum Key, the command palette, or the *Drum Key* button on the drum kit or in the Track
  inspector shows a card over the score — like a "DRUMSET" legend — naming how the cursor's drum track writes each drum it
  uses (*Used drums*) or the whole kit (*Whole kit*): a column per drum (kick, snare, hi-hat, toms, crash, ride …) with
  its variants (closed, open, pedal; hit, side stick, rim shot; bell, choke …), each on a short staff drawn as the
  score draws it. Pointing at a drum shows its full name, its key and the General MIDI sound it plays. It follows the
  cursor's track (multitrack too) and says so on a track that is not a drum track; × or Esc closes it.
- **MIDI input**: the SONG inspector's *MIDI INPUT* turns it on and picks the source (every source, or one keyboard or
  MIDI guitar; CoreMIDI, devices plugged in later are found). Notes struck within 50 ms make one beat at the cursor
  — replacing what the beat held, keeping its duration — and the cursor moves to the next beat, adding a bar after the
  last one (step entry, one undo step per beat). Guitar and bass notes go on the strings nearest the hand position of the last fretted beat, in pitch
  order across the strings; *MIDI guitar* puts channel *n* on string *n* (one channel per string); on a drum track the
  key is the drum. *Velocity* gives the notes the velocity they were played with. A note the track cannot play is left
  out with a hint. The settings are kept on this Mac.
- **Multitrack** (Guitar Pro 8's View ▸ Multitrack, F3, or *Multitrack* over the tracks table): the score shows every
  track in one score — each system a staff group per track in track order, joined by a bracket, the bars as wide as the
  widest track needs and beats played together under one another, bar lines through the system, the full names on the
  first system and short names after. The tracks panel's eyes choose the tracks shown (the selected track always is; an
  eye clicked without Multitrack turns it on with that track). In Multitrack the Track inspector's *Notation* sets the
  selected track's own staves (kept in the single-track view too). Click a staff to work on its track; ↑ / ↓ past the first or last string go on into the
  track above / below, ⌘↑ / ⌘↓ (View ▸ Previous / Next Track) go to the previous / next track; playback lights every
  shown track's beat; a drag selects on the track it began on. Export PDF / PNG and Print follow the shown tracks (*As
  Shown*, or all in one mode); a system taller than a page is printed smaller.
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
  - voices (as in Guitar Pro 8): the palette's 1–4 or ⌘1–⌘4; typing a fret in an empty voice starts it there (rests to
    the bar lines). ⌥1–⌥4 (the palette's ⇄) move the note at the cursor — the beat's notes on an empty string, every
    note of the selected beats — to another voice; *1–4* (Multivoice) edits every voice at once, a click on a note
    taking the cursor to its voice. Voices 1 and 3 are stemmed up and 2 and 4 down, their rests above and below; the
    voice being edited is drawn in ink and the others faded, the cursor in its voice's colour (2 green, 3 pink, 4
    purple — the tab's frets of voices 2–4 too), and a bar where it has nothing shows its faint whole rest. The LCD
    names the voice; Guitar Pro 5 files hold two voices (a GP5 save says when voices 3 and 4 are left out)
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
    pop, fade in, fade out and volume swell
  - `B` (or the palette's *Vib.*) opens the **vibrato** panel (none / slight / wide, with how it is drawn; a choice
    applies at once); `C` (or *Bend*) the **bend (choking)** panel: the shape (bend, bend & release, bend-release-bend,
    pre-bend, pre-bend & release, release) and the amount (¼ to 3 tones) load a curve into Guitar Pro 8's curve grid.
    *Done*, Esc or a click outside closes a panel, and it closes by itself when the cursor moves onto an empty string.
  - the palette's *W.bar* (Guitar Pro has no key for it) opens the **tremolo bar (whammy bar)** panel: the presets
    (dip, dive, release up, inverted dip, return, release down) and the curve on a grid, positions 0–12 across the note
    and quarter tones up and down (±3 tones, an octave when the curve goes further). In both curve panels a click adds a
    point, a drag moves it, a right click or ⌃-click removes it (or *Delete* the selected one), and ◀ ▶ ▼ ▲ step the
    selected point; the score previews the curve, *Apply* puts it on the note (one undo step), *Remove* takes it off.
    A .gp5 file keeps every point; a .gp file (Guitar Pro 7/8) keeps a start, one middle value and an end, and the
    panel says when a curve is more than that.
  - the palette also sets: dynamics ppp–fff, heavy accent, staccato; the slide kinds (shift, legato, in from below /
    above, out down / up); harmonics (natural, artificial, tapped, pinch, semi);
    trill and tremolo picking speeds; a grace note before or on the beat; tapping, slap, pop, fade in; brush and pick
    strokes up / down; text above the beat. Options open under their group.
  - bars (the palette's Bar group): add/delete bar, time signature, tempo, key signature, repeat start/end and the
    number of plays, alternate endings 1–8, triplet feel, a section name
  - musical directions (the Bar group's 𝄋): segno, segno segno, coda, double coda, fine and the jumps — D.C., D.S.,
    D.S.S., each plain or al Coda / al Double Coda / al Fine, and Da Coda / Da Double Coda (drawn "To Coda") — each on
    or off for the bar; the signs show at the start of the bar, the words at its end, in a band under the bar numbers
  - crescendo / decrescendo (the Dynamics group): a wedge under the staff over the selected beats (or the cursor's
    beat); playback goes from the dynamic where it starts to the dynamic after it (one dynamic further when that one
    does not go its way)
  - rasgueado (the Beat group, Guitar Pro's 18 finger patterns, shown as "rasg. mii" over the tab) and the sustain
    pedal: Ped. where the beat starts, ✱ where it ends, a line while it is held, in a band under the staff
  - notation marks, as Guitar Pro 8 writes them (each a lit palette button, one undo step, also in the command palette):
    fingering — the Note group's *L.H.* (T 1 2 3 4, written left of the notehead), *R.H.* (p i m a c, over or under the
    note) and *Piano* (1–5 over or under the notes; a piano or organ track writes every finger that way); *Accidental*
    — cautionary (in parentheses) or forced (always written); the Beat group's */* (slash: the beat as a rhythm slash
    on the middle line, its frets left out of the tab) and *Break* / *Join* / *2nd* (the beam to the next beat broken,
    joined across the beat, or with only its eighth beam: the secondary beams break); the Bar group's *Beams* (by beat, by two beats, the whole
    bar — from this bar on while the time signature lasts). The Track inspector's *Slash* writes the whole track in
    slashes. GPIF (`.gp`, `.gpx`) and GP5 files keep fingering and beaming (GP5: four groups of eighths), GP3/GP4
    fingering only; slashes stay in `.gp` files; no Guitar Pro file holds a cautionary or forced accidental
  - **Expression Text** (Guitar Pro 8's, a part of its command palette): Tools ▸ Expression Text… (⌥⌘E — Guitar Pro's
    ⇧⌘E is Export PDF here), the Beat group's *>* or `>` typed in the command palette, then a name: a chord (`G maj`,
    `Cm7`, `Bb/D`), a dynamic (`ff`, `mezzo piano`), a key signature (`E minor`, `3 flats`), an octave sign (`8va`,
    `15mb`, `loco`), a clef (`bass clef`, `c clef`) or a direction (`D.S. al Coda`, `to coda`). ↩ puts the chosen one
    at the cursor, one undo step: the chord with its first diagram on the track's strings, the dynamic on the note, the
    key and clef from the bar on, the octave sign over the selected beats, the direction on or off. Words such as
    *dolce* are the beat's *Text* (Guitar Pro's free text), kept in every format and in MusicXML as `<words>`
  - octave signs (the Beat group's *8va*: 8va, 8vb, 15ma, 15mb or none, over the selected beats): the notation writes
    their notes an octave or two away under one mark, across bar lines; the tab and playback stay. `.gp`, `.gp5` and
    MusicXML keep them, GP3/GP4 do not. Clefs (the Bar group's *Clef*: treble, bass, alto, tenor) from the bar to the
    next clef change, drawn small where they change inside a row; `.gp` and MusicXML keep them, GP3–GP5 one per track
  - ⌘Z / ⇧⌘Z undo and redo
  - copy and paste: drag across the score — into other rows too — or ⇧← / ⇧→ or ⇧-click select beats from the
    cursor (tinted on both staves; any other move clears the selection); ⌘C copies them — or the cursor's beat when nothing is selected — to the clipboard, ⌘X cuts them, rests
    too, and the beats after them move up; ⌘V inserts the copied beats at the cursor and pushes what follows on, across
    bar lines: a note that runs over a bar line becomes tied notes, and bars are added at the end when needed. Cut and
    paste are one undo step each; drum beats paste only into drum tracks.
- **Keys everywhere**: Space play / stop; `]` / `[` the playback tempo 5 BPM up / down (the speed menu follows; the
  song is not edited); ⌥= / ⌥- the speed 5% up / down; ⌥M metronome, ⌥C count-in, ⌥L tempo lock; ⇧⌘F Focus / Unfocus;
  Esc closes the open panel, sheet or menu, else stops playback; ⌘S save; ⌘W close the tab; ⌃⇥ / ⌃⇧⇥ next / previous
  tab; ⌘P print; ⇧⌘P the command palette; ⌘H (Help ▸
  Keyboard Shortcuts, or the top bar's **?**) shows every shortcut on one sheet.
- **Save**: ⌘S saves the shown tab in place, in its own format, when the app writes that format (`.gp5`, `.gp`,
  `.gp4`, `.gp3`); other files — and ⇧⌘S (Save As…) — ask where to save, with a *Format* popup under the save panel:
  Guitar Pro 5 (`.gp5`, chosen first unless the file is one of the others), Guitar Pro 7/8 (`.gp`), Guitar Pro 4
  (`.gp4`) or Guitar Pro 3 (`.gp3`); the extension follows the choice. A `.gp` keeps everything the editor edits
  (voices 1–4, nested tuplets …) and the audio track, but not Guitar Pro's own sound settings (RSE) or stylesheet. GP4 and GP3
  keep one voice per bar (voices 2–4 join voice 1) and one triplet feel, and GP3 holds no lyrics and fewer effects: the
  save panel and the hint strip say what is left out when one is written. Saved as GP5, GP6–GP8 files lose what GP5
  cannot hold (voices 3–4, strings past the 7th, double dots, RSE settings, hairpins, fade outs, volume swells, the
  sustain pedal, a rasgueado's pattern, the audio track; a direction stays on its first bar only).
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
- **Lyrics editor** (Edit ▸ Lyrics…): a panel above the score — pick the track and the bar the lyrics start at, and type
  them; the score follows once the typing pauses (each pause is one undo step). Guitar Pro's syntax: a space or a
  hyphen ends a syllable (*Beau-ti-ful*), two spaces skip a note, `+` sings words on one note (*a+lot*), `[text in brackets]` is a comment; Korean,
  Japanese and Chinese get one character per note. The panel counts the syllables against the notes. Saved as `.gp5`,
  a song keeps one track's lyrics (the first track's with some).
- **Scales** (Tools ▸ Scales…): TuxGuitar's 275 scales and arpeggios on any of 17 roots, in a searchable list, or
  *From selection* (the cursor's bar without one) / *From track* lists the scales and keys that hold those notes, best
  first (common scales, modes and arpeggios before exotic ones; then the root played most, the fewest notes unused). The chosen scale is marked on the fretboard (all 24 frets, 3–10 strings, the root in orange) and on the piano
  keyboard, stays marked after the panel closes until *Clear*, and the panel spells its notes and draws its five-fret
  boxes on the track's neck, one position at a time.
- **Tuner** (Tools ▸ Tuner…): play one string at a time into the Mac's microphone; the panel shows the nearest note
  and octave in large letters, how many cents it is off (green within ±5) on a -50 … +50 cent strip, its frequency,
  the shown track's open strings with the one being tuned lit (the nearest, within 1.5 semitones; standard guitar
  tuning without a score), and the input level. The reference A4 steps from 415 to 466 Hz (440 by default). Single
  notes only, from a low bass B (31 Hz) to B6 (1976 Hz); a quiet room or noise reads nothing. macOS asks for microphone access the first time; if it was
  refused, the panel says where to allow it (System Settings ▸ Privacy & Security ▸ Microphone). The microphone runs
  only while the panel is open (Esc closes it) and nothing is recorded.
- **Transpose** (Tools ▸ Transpose…): a panel under the top bar moves notes by *Semitones* or by *Scale steps* (along
  each bar's key signature: a raised or lowered note stays raised or lowered — the key signature names no mode, so A
  minor walks C major's notes and its G♯ is a raised 7th), plus whole *Octaves*, on the *Selection* (the selected beats
  in the cursor's voice), the shown *Track* or the *Whole song*. A note keeps its string while the new fret is on the
  24-fret neck above the capo, else it moves to the nearest free string; a note no string can hold stays as it was, and
  the hint strip counts them. Tied notes follow the note they continue (past the selection too); drum tracks never move;
  transposing a track or the song by semitones moves its key signatures too (spelled with fewer accidentals: D♭, not C♯).
  Chord names (root and bass, e.g. *Am7/G* → *Bm7/A*) and diagrams move with the notes — a diagram keeps its strings, an
  octave the other way when the shift would leave the neck —, or alone with *Chords only*. One undo step; the selection
  stays. (Guitar Pro's *keep the frets* has no counterpart: here a note's pitch is its string and fret — the capo does
  that.)
- **Command palette** (Tools ▸ Command Palette…, ⇧⌘P): type parts of a command's name or keywords (*exp pdf*,
  *transpose*, *let ring*) to find it among every menu command, panel, editor key and edition-palette tool; each row
  shows its group and key. ↑ / ↓ choose, ↩ runs, Esc closes; the commands run this session come first, and the ones that
  cannot run now (no document, no note at the cursor) are dimmed at the end.
- **Chords**: a beat's chord shows over the staves — its name, and its diagram (the strings, the nut or the first fret's
  number, a dot per fretted string, a barre, o / x over open and unplayed strings). The Track inspector's *Chords*
  toggles show names, diagrams or both (per score; Export PDF and Print follow). `K` (or the palette's *Chord*, in the
  Beat group) opens the **chord diagram** panel for the beat at the cursor: click the grid to put a finger on a fret
  or take it off (above the nut: open / not played), *Fret − / +* moves the shape along the neck, and the chord is
  named as you go (the name can be typed); *Notes of the beat* fills the grid from the beat; *Apply* puts the chord on
  the beat — and, with *Write the notes into the beat* (on for a rest), its notes too — and *Remove* takes it off, one
  undo step each. Beside the grid, the **chord library**: *By name* (type Am7, C/G, F#m7b5, G13 … → the best voicings on
  the track's tuning, plain, inversions, close or open; click one to load it), *By position* (every name the grid's
  frets can have, with how complete each is) and *In this track* (the chords the track already uses). Chords are saved
  in GP3, GP4 and GP5 files.
- **Export**: File ▸ Export PDF… (⇧⌘E) opens the export panel: the shown track as a PDF in
  *Score + Tab*, *Score* or *Tab* (the view's mode is selected first) on the stylesheet's page (*Stylesheet…* beside
  it changes it); the panel says how many pages it makes, and *Save PDF…* asks where to save it. The PDF is engraved like the screen, at print size (a 7.3 mm
  staff), in black and grey on white even in dark mode: the title, subtitle, artist, album and credits with the
  track's instrument and tuning on the first page, then the rows packed top to bottom (a row is never split across
  pages), and "*title* — *page* / *pages*" at the foot of every page. A bar too long for a line has its beats moved
  closer (and an extremely dense one is printed smaller) so nothing runs off the page. The PDF is vector graphics (lines,
  curves and the fonts' glyphs), sharp at any zoom or printer resolution, so it has no resolution setting.
- **Export PNG**: File ▸ Export PNG… opens the same panel for images: the same pages (mode and page as for the PDF) at
  *72*, *150* or *300 dpi* (an A4 page is 595 × 842, 1240 × 1754 or 2479 × 3508 pixels, the dpi recorded in the file),
  on a *White* or *Transparent* background (no paper: only the notation is drawn, and the tab lines still stop around
  the fret numbers). One page is saved through a save panel as *name*.png; several pages go into a folder you choose as
  *name*-1.png … *name*-N.png (numbers padded so they sort in order — the app may write only where you point it), and
  the hint strip says what was saved where.
- **Export MIDI**: File ▸ Export MIDI… saves the song as playback plays it as a Standard MIDI File (`.mid`): repeats
  unfolded, at the written tempo (not the practice speed), muted tracks left out and, when a track is solo, only the
  solo tracks.
- **Export audio**: File ▸ Export Audio… (or the command palette) renders the song as playback sounds — the sound bank,
  each track's instrument, volume, pan, mute and solo, its effects, the audio track (in the whole mix, the score at its
  pace) and the master mix — faster than real time, repeats unfolded, at the written tempo (never the practice speed, a
  metronome or a count-in), with a tail until reverbs and delays have died away (at most 10 s). Formats: *WAV*, *AIFF*
  or *FLAC* (16 or 24-bit), *MP3* (128, 192, 256 or 320 kbps, or VBR V2, by LAME) or *Ogg Vorbis* (quality 4, 6, 8 or
  10, by libvorbis), at 44.1 or 48 kHz. *Whole song* or the *Loop bars* (as written), *One file* (a save panel) or *One
  file per track* (each playing track alone at the written tempo, into a folder you choose). The panel's first line says
  at whose pace the song plays (its own tempo, or the audio track's); it shows the progress with *Cancel*; the hint
  strip says what was saved where.
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
- **Print**: File ▸ Print… (⌘P) prints the shown track in the view's mode, engraved as for the PDF export (the
  stylesheet's page, scaled to the printer's paper), through the macOS print panel.
- **Stylesheet** (File ▸ Stylesheet…, F7, as in Guitar Pro 8): a panel over the score with Guitar Pro 8's tabs —
  *Page & Score Format* (A4, US Letter, A3, A5, B4, B5, Legal, Tabloid, Executive, Statement or a custom size, portrait or
  landscape, the four margins; the score's scale and rhythm spacing), *Systems & Staves* (room between systems, tracks
  and notation / tab, at most *n* bars per system, the multitrack names full / short / none on the first and the other
  systems, bar lines across the system), *Header & Footer* (which song information the first page shows — the copyright
  too — and the page numbers), *Texts & Styles* (a font — any family installed on the Mac, size, bold, italic — for the
  title, subtitle, artist, album, words, music, tabber, copyright, tempo, track names, chords, lyrics, bar numbers and
  the beats' free texts; lyrics below, above or hidden; bar numbers on every bar, the first of each system or none;
  the tempo's decimals) and *Notation* (rename Let Ring, Palm Mute, H / P, sl., T, S, P, rasg. and w/bar; let ring and
  palm mute lines over rests, H / P and sl. labels, voices 2–4 coloured in the tab, dynamics, C for 4/4). Every change
  is one undo step and the score, the PDF, PNG and Print follow it at once; the default stylesheet draws exactly what
  the app always drew. A `.gp` file keeps it (our own JSON entry, which Guitar Pro ignores); saving as GP5 / GP4 / GP3
  or exporting MusicXML says it is left out. Beats' free texts (the palette's *Text above the beat*) now show above the
  staves.
- **Design Mode** (View ▸ Design Mode, or the palette's ↔ right of the voices): dots over the beats and triangles over
  the bar lines to drag — a beat moves within its bar, a bar line widens its bar (the others share the rest), and a
  yellow guideline snaps them to a beat or bar line of the system above or below; grips in the space under a system,
  between tracks and between notation and tab drag it taller or shorter; + / − beside a system take a bar in or give one
  away, × puts the system back; *New system at bar n* and *Reset Positions* (also View ▸ Reset Positions) on the strip
  over the score. The score shows a drag as it moves; letting go is one undo step. A `.gp` file keeps the layout.
  Handles that can be dragged are blue, moved ones red, the guideline yellow — apart on every score paper and contrast.
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
- **Effects** (basic built-in effects — macOS's own audio units and a few of ours, not Guitar Pro's RSE sound): each
  track can play through a chain of up to 8 effects — EQ, compressor, drive (overdrive / distortion / fuzz), chorus,
  delay, reverb and a speaker cabinet (convolution with impulse responses the app generates: 1x12 open back, 2x12
  combo, 4x12 closed back, 4x10 bass) —, each on or off, with a few parameters and presets, and whole-chain presets
  (Clean, Crunch, Lead, Metal, Bass DI, Bass amp, Acoustic, Ambient). Edit them in the Track inspector's *EFFECTS* or in
  View ▸ Mixer (a strip per track and a *Master* strip — EQ, compressor, reverb, limiter and output gain — at the
  bottom; the track strips scroll sideways, the audio track's strip and the master stay in view); values are heard while a slider is dragged, and one release is one undo step. A track's first effect (or
  its last removed) restarts playback at the bar being played. Effects are saved in Guitar Pro 7/8 (`.gp`) files
  (our own entry in the zip, which Guitar Pro ignores); GP5, GP4 and GP3 cannot keep them, and saving one says so.
  Tracks without effects sound exactly as before.
- **Line in** (Tools ▸ Line In…): play a real guitar (an audio interface or the Mac's microphone) through a track's
  effects — the selected track's, or, with *Lock*, the same track while you select others ("sound lock") — with an input
  gain, a level meter and *Monitor* on/off. With the Mac's own microphone and speakers monitoring starts off and the
  card warns about feedback (use headphones). macOS asks for microphone access the first time; closing the card turns
  the line in off.
- **Tracks**: Track ▸ Add Track… (⌥⌘N, or *+ Track* under the tracks) opens the Add Track panel — the instrument
  (guitar of 6, 7 or 8 strings, bass of 4, 5 or 6, banjo, ukulele, drums, piano, or any other General MIDI instrument),
  its sound, tuning (TuxGuitar's presets for each string count), capo and name; the track comes after the last one, on
  a channel of its own (drums on MIDI channel 10, shown in standard notation only, as Guitar Pro adds them), with a bar
  of rests under every bar. Track ▸ Duplicate Track puts a
  copy (notes, lyrics, effects, its own channel) right after the track; Delete Track (⌥⌘R) removes it — asking first
  when it has notes, never the last track; Move Track Up / Down, the ⧉ − ▲ ▼ buttons beside *+ Track*, or dragging a
  track's name up or down reorder the tracks. Each is one undo step, also in the command palette; the shown track, the
  cursor, the lyrics panel and the line in's sound lock follow the tracks. Saved in every format the app writes.
- **Track information** (Guitar Pro 8's name, short name, colour and icon): a click on a track's colour strip or icon
  in the tracks panel, or on the colour or icon in the Track inspector's INFORMATION, opens a small panel beside it —
  the name and short name, Guitar Pro 8's nine track colours and any colour typed as `#RRGGBB`, Guitar Pro's track
  icons (steel, nylon, electric and distortion guitar, bass, ukulele, banjo, keyboard, synthesizer, strings, brass,
  reeds, flute, voice, mallets, percussion, timpani, drums, other), *Instrument's icon* (the icon follows the instrument
  again) and *Instrument…*; Esc, ✕ or a click outside closes it. A double-click on a track's name — or ✎ on the
  selected row — renames it in place (Return sets it, Esc keeps the old name). The Track inspector has the name and
  short name fields too. Each change is one undo step. The colour shows in the tracks panel's strip and bar map, the
  LCD, the inspector, the mixer's strips and the Drum Key; the icon in the tracks panel, the LCD, the inspector, the
  mixer and the Drum Key; the short name labels the later systems of the multitrack view (the stylesheet's track
  names). `.gp` files keep all four (GPIF `Name`, `ShortName`, `Color`, `IconId`; an icon equal to the instrument's,
  and a short name equal to the name or its abbreviation, read as none); GP5, GP4 and GP3 keep the name and colour —
  the save says what is left out —; MusicXML keeps the name and the short name (`part-abbreviation`).
- **Audio track** (Guitar Pro 8's backing track): Track ▸ Add Audio Track… (or *+ Audio Track* under the tracks) picks a
  recording — WAV, AIFF, MP3, AAC / M4A, FLAC, Ogg, CAF (whatever macOS reads) — that plays with the score; a second one
  replaces it after asking. Its lane under the tracks shows the waveform with the bars placed over it, the cursor's bar
  and the playing moment; mute, solo, volume and detune (±24 semitones, in cents; also a strip in View ▸ Mixer). Sync
  points tie a bar to a moment of the recording: while it plays, *Sync bar n* (Y) marks the cursor's bar at the moment
  heard and moves on to the next bar; drag a marker to adjust it, *Delete point* removes the selected one, *Tempo* sets
  the song's tempo from the first two. Between points the score follows the recording, so playback from any bar, loops
  and the practice speed stay in sync — at 50% the recording plays at half speed without changing pitch. Kept in
  Guitar Pro 7/8 (`.gp`) files as Guitar Pro 8 keeps it (a GP8 file's audio track survives a save); GP5, GP4 and GP3
  cannot hold one, and saving one says so.
- **Play**: Space or ▶ plays all tracks (honouring each track's mute and solo) from the cursor's bar — or, with beats
  selected, from the selection's first beat, wherever the drag ended — with the selected
  sound bank; the score, the piano keyboard, the fretboard and the bar map follow the playing beat. Space or Esc stops. The top bar's ♩
  speed menu and ⟲ Loop set up practice playback for the session — none of it is saved in the file:
  - *Speed*: 25%–200% of the written tempo (also − / + beside the menu and ⌥- / ⌥=, 5% a step), a tempo in BPM (60, 90, 120, 150 and the written one), or *Custom* −/+ in
    5 BPM steps — also `]` / `[` on the keyboard — (25%–300% of the written tempo, never under 20 BPM). Every tempo of the song is scaled alike, so tempo
    changes keep their proportions; to change the written tempo use the palette's Tempo instead. The LCD shows the
    playing tempo and the percentage.
  - *Loop*: as in Guitar Pro 8, ⟲ Loop loops the selected bars (drag across the score first), or the whole song with
    nothing selected; beats selected and played while it is on become the loop. The speed menu's *Loop bars* pick the
    first and last bar with −/+, or *From cursor* / *To cursor* (the other end moves along so From ≤ To); turning the
    loop off forgets them. While looping, Space / ▶ plays those bars until stopped — from the selection's first beat or
    the cursor's bar when inside the loop, else from its first bar — straight through as written: repeat signs inside
    the loop are not followed.
  - *Speed trainer* (in the speed menu, while looping): `+n BPM` each pass (0 = off, up to 20), *Up to* ♩ M (default:
    the written tempo or 20 BPM above the playback tempo, whichever is higher). The LCD shows the pass and its tempo.
  - *Metronome* (top bar, ⌥M): a click on every beat — the first of the bar on the high wood block, the others on the
    low one (General MIDI keys 76 / 77 on the drum channel); 6/8, 9/8, 12/8 click the dotted beats. It follows tempo
    changes, the speed, repeats and loops, and turns on and off at once while playing; its volume is in the practice
    menu (▾). The LCD's beat dots show the beat whether it clicks or not.
  - *Count-in* (top bar, ⌥C): one bar of clicks in the meter and tempo of the bar playback starts in, then playback
    from that bar's beginning (a loop from its first bar); as in Guitar Pro, only when playback starts — not before
    every loop pass. The LCD's dots count it in orange.
  - *Tempo lock* (practice menu, ⌥L): the whole song at one tempo (its tempo changes ignored), the speed still applied;
    the LCD shows a padlock (🔒) after the tempo. Click the LCD's tempo to type a tempo (decimals allowed): the locked tempo, or else the
    playback tempo.
  - *Preview notes on hover* (practice menu): a piano key or fret the mouse enters plays with the track's sound.
  - Changing any of these while playing restarts playback at the bar being played, with the new settings (a loop
    keeps its pass count) — but the metronome and count-in toggles and the hover preview, which need none. Adding or
    deleting a bar while playing stops playback.
  - Playback follows the musical directions as Guitar Pro does: a D.C. / D.S. / D.S.S. goes back once, then the bars
    play one after the other without repeats (the last ending) — to the end, to the fine, or to the Da Coda and on at
    the coda. A loop plays its bars as written. Fade out and volume swell play as volume envelopes, a rasgueado as a
    quick strum per finger, the sustain pedal as the MIDI damper pedal.
- **Tempos with decimals** (92.5): read from Guitar Pro 7/8 files and saved in `.gp` files; GP5/GP4/GP3 files hold whole
  numbers, so saving one rounds them. A click on the palette's tempo value types one.
- **Note audio settings** (inspector, NOTE tab): how the note at the cursor plays back — its duration (1–200% of its
  length), a start offset (a share of its beat) and a velocity change. Playback only; GP5 files keep the duration,
  `.gp`, GP4 and GP3 files leave them out.
- **View ▸ Focus / Unfocus** (⇧⌘F): only the score and the top bar; Unfocus brings back the panels that were shown.
- **Settings** (GP Editor ▸ Settings…, ⌘,): *Language* — the system's, English or 한국어 (Korean): the window, panels,
  palette, inspector, Stylesheet and Design Mode, shortcut sheet, command palette, hints and errors change at once, and
  so do the menus and the save panels; macOS's own menu items (Services, Window, Quit …) follow at the next start. In
  Korean the command palette finds Korean titles, their initial consonants (ㅌㄴ → 튜너) and still the English names.
  Notation on the score (P.M., let ring, 8va, dynamics, chords) stays as notation writes it. *Interface contrast* —
  Standard or High (darker panels, brighter text and borders) — and *Score paper* — light, dark or following the
  system; every text colour reads at WCAG AA. The settings are kept for the next start.

## License

GNU Lesser General Public License v2.1 or later (`LGPL-2.1-or-later`) for the whole repository — see `LICENSE`.
`packages/gp-core` follows TuxGuitar's readers (also LGPL-2.1) and carries its own copy in `packages/gp-core/LICENSE`.
GP3–GP8 test fixtures come from the alphaTab test suite (MPL-2.0); the GP1/GP2 files are not committed (fetched by
`fetch-gtp.sh`) — see `packages/gp-core/test/fixtures/README.md`. The Power Tab and TablEdit fixtures come from the
powertabeditor and MuseScore test suites (GPL-3.0, test input only, not part of the library).
The MIDI test file is in the public domain (Mutopia Project).
The tests also read the written files with alphaTab itself (`@coderline/alphatab`, MPL-2.0), a devDependency of
`packages/gp-core` used only by its tests; it is not part of the library or the app.
The app bundles the Bravura music font (SIL Open Font License 1.1, `apps/desktop/macos/GPEditor-macOS/Fonts/`) and
the GeneralUser GS SoundFont by S. Christian Collins (free to use and redistribute in software; its license is in
`apps/desktop/macos/GPEditor-macOS/SoundFonts/GeneralUser-GS-LICENSE.txt` and ships inside the app).
The audio export links, statically and unmodified, LAME 3.100 (MP3; GNU Library General Public License v2 — the app
is open source under LGPL-2.1-or-later, so it can be rebuilt against a modified LAME) and libogg 1.3.6 / libvorbis
1.3.7 (Ogg Vorbis; BSD 3-clause, Xiph.Org Foundation). They are built from their official sources by
`apps/desktop/scripts/audio-codecs/fetch.sh`; their license texts are in `apps/desktop/macos/GPEditor-macOS/Licenses/`
and ship inside the app (`Contents/Resources/Licenses`).
