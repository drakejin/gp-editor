#!/usr/bin/env bash
# Downloads the real Guitar Pro 1/2 (.gtp) test files into guitarpro1/ and guitarpro2/.
# They are fan transcriptions without a license that allows redistribution, so they are not committed;
# the tests that need them are skipped until this script has run. Sources are pinned to commits and
# every file is checked against its MD5.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MORTY="https://raw.githubusercontent.com/YetAnotherMorty/Guitar-Pro-Tabs/ed11c074613f4c1bbb98f3b2bc07bd831d3619d6/Guitar%20Pro%20Tabs"
GUITARMONICS="https://raw.githubusercontent.com/FabricioMatos/guitarmonics/edb21ac14bffa764f0f07d514be35a70cb41177c"

# target<TAB>md5<TAB>url
FILES="guitarpro1/carulli-allegro.gtp	42a6627f937ae9647ea1fd1b0f7a4234	${MORTY}/C/Carulli%2C%20Ferdinando/Carulli%20-%20Allegro.gtp
guitarpro1/layla-acoustic.gtp	b429aaf4fa1cd65000cc5e334bf78d6c	${MORTY}/C/Clapton%2C%20Eric/Clapton%2C%20Eric%20-%20Layla%20(Acoustic).gtp
guitarpro1/sweet-child-o-mine.gtp	b3e897e28a6b79b3eba85be9532a1aa5	${GUITARMONICS}/source/SongEditor/SongFilesForTest/Sweet%20Child%20O%20Mine.gtp
guitarpro2/pretty-woman.gtp	ebe701c48f1797b513447567d7a3b299	${GUITARMONICS}/DataFolder/_WorkInProgressSongs/VanHalen.DiverDown.OhPrettyWoman/Pretty%20Woman.gtp
guitarpro2/so-fine.gtp	42fdd1cd4a54f111dba8f3f7f93c088b	${MORTY}/G/Guns%20N%27%20Roses/Guns%20N%27%20Roses%20-%20So%20Fine.gtp
guitarpro2/the-final-waltz.gtp	7be18555b098c088545abe15814ed43b	${MORTY}/R/Running%20Wild/Running%20Wild%20-%20The%20Final%20Waltz.gtp"

failed=0
while IFS=$'\t' read -r target md5 url; do
    dest="${HERE}/${target}"
    mkdir -p "$(dirname "$dest")"
    if [[ -f "$dest" ]] && [[ "$(md5 -q "$dest" 2>/dev/null || md5sum "$dest" | cut -d' ' -f1)" == "$md5" ]]; then
        echo "[fetch-gtp] skip ${target}: already present"
        continue
    fi
    curl -sSfL "$url" -o "${dest}.part"
    actual="$(md5 -q "${dest}.part" 2>/dev/null || md5sum "${dest}.part" | cut -d' ' -f1)"
    if [[ "$actual" != "$md5" ]]; then
        echo "[fetch-gtp] fail ${target}: md5 ${actual} != ${md5}" >&2
        rm -f "${dest}.part"
        failed=$((failed + 1))
        continue
    fi
    mv "${dest}.part" "$dest"
    echo "[fetch-gtp] fetched ${target}"
done <<< "$FILES"
[[ $failed -eq 0 ]]
