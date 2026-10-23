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

`midi/anna-magdalena-04-guitar.mid` (Standard MIDI File) is J. S. Bach's Menuet in G, BWV Anh. 114, for guitar, from
the Mutopia Project (Mutopia-2013/01/06-102, maintainer Emre Akbas, typeset with LilyPond 2.16.1), copied unchanged
from https://www.mutopiaproject.org/ftp/BachJS/BWVAnh114/anna-magdalena-04-guitar/anna-magdalena-04-guitar.mid
(MD5 `a8e3d67c24348fb35c8a03ed02a354aa`). Its licence is **Public Domain**
(https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=102). Synthetic MIDI files are built in the tests by
`test/helpers/smf-builder.ts`.
