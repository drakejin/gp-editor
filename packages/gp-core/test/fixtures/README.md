# Test fixtures

`guitarpro3` … `guitarpro8` are copied unchanged from the alphaTab test suite
(https://github.com/CoderLine/alphaTab, `packages/alphatab/test-data/`, commit in `ALPHATAB_COMMIT`).
alphaTab is licensed under the Mozilla Public License 2.0; these files are used here only as test input.

| folder | Guitar Pro version | extension |
| --- | --- | --- |
| guitarpro3 | 3 | .gp3 |
| guitarpro4 | 4 | .gp4 |
| guitarpro5 | 5 | .gp5 |
| guitarpro6 | 6 | .gpx |
| guitarpro7 | 7 | .gp |
| guitarpro8 | 8 | .gp |

`guitarpro1` and `guitarpro2` (.gtp, Guitar Pro 1/2) are **not committed**: they are fan transcriptions from
repositories without a license that allows redistribution. `./fetch-gtp.sh` downloads them, pinned to a commit
and checked by MD5, from https://github.com/FabricioMatos/guitarmonics (GPL-2.0, `sweet-child-o-mine.gtp`,
`pretty-woman.gtp`) and https://github.com/YetAnotherMorty/Guitar-Pro-Tabs (no license stated, the other four).
Without them the GP1/GP2 real-file tests are skipped; the synthetic files from `test/helpers/gtp-legacy-builder.ts`
still cover every reader branch.

`musicxml` (.xml, one .mxl) holds 32 files of the (unofficial) MusicXML test suite by Reinhold Kainhofer, as LilyPond
ships it (https://gitlab.com/lilypond/lilypond, `input/regression/musicxml/`, commit
`7a3188dd7b4886083f3d88d4fbcd1f5c048eee45`), copied unchanged. The suite is licensed under the MIT license; its
notice is kept in `MUSICXML_TEST_SUITE_LICENSE` (outside the folder, so the fixture sweeps do not read it as a score).
