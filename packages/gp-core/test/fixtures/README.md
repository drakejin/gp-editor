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

`powertab` (Power Tab Editor 1.7, `.ptb`) and `tabledit` (TablEdit 3.04, `.tef`) are small test files made by two
GPL-3.0 projects for their own importers, copied unchanged and used here only as test input (they are not part of the
library); the license text is in `GPL-3.0.txt`:

| folder | source | commit |
| --- | --- | --- |
| powertab | https://github.com/powertab/powertabeditor, `test/formats/powertab_old/data/` (GPL-3.0) | `8b23e9de96acdb19740bf9d7946e172760c78010` |
| tabledit | https://github.com/musescore/MuseScore, `src/importexport/tabledit/tests/data/` (GPL-3.0) | `4676f83f368f1afc9cad6815eb5401a2ec8aca2b` |

The `invalid_*.tef` files are broken on purpose (MuseScore's error tests); the sweep leaves them out and
`tef.test.ts` checks how each is handled. `test/helpers/ptb-builder.ts` and `tef-builder.ts` write synthetic files that
cover the reader branches these files do not reach.
