#!/usr/bin/env bash
# Checks that the CLI golden fixtures copied into this repo are byte-identical
# to their source in a sigcomply-cli checkout, and that no golden was added or
# removed on either side. Exit 0: in sync. Exit 1: drift. Exit 2: bad setup.
#
#   CLI_REPO=../sigcomply-cli scripts/check-goldens.sh      # or: npm run check:goldens
#
# Refresh after a CLI golden change: regenerate in the CLI with -update, then
#   scripts/check-goldens.sh --copy
# and run the gate. Never edit a golden by hand.
set -euo pipefail

spa="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli="${CLI_REPO:-$spa/../sigcomply-cli}"
copy=false
case "${1:-}" in
  "") ;;
  --copy) copy=true ;;
  *) echo "usage: $0 [--copy]" >&2; exit 2 ;;
esac

if [[ ! -d "$cli/internal/sign" ]]; then
  echo "error: $cli is not a sigcomply-cli checkout (set CLI_REPO)" >&2
  exit 2
fi

# CLI source folder | SPA destination folder | file glob. The CLI READMEs
# describe their own folders and are not copied.
pairs=(
  "internal/sign/testdata/spa-golden|src/lib/verification/__fixtures__/golden|*.json *.canonical.txt *.pdf"
  "internal/planner/testdata/spa-golden|src/lib/__fixtures__/golden|periods.json"
  "internal/manualcatalog/testdata|src/lib/__fixtures__/golden|*_golden.json"
)

drift=0
for pair in "${pairs[@]}"; do
  IFS='|' read -r src dst globs <<<"$pair"
  for side in "$cli/$src" "$spa/$dst"; do
    if [[ ! -d "$side" ]]; then
      echo "error: missing folder $side" >&2
      exit 2
    fi
  done
  names=$(
    for side in "$cli/$src" "$spa/$dst"; do
      (cd "$side" && for g in $globs; do for f in $g; do [[ -f "$f" ]] && echo "$f"; done; done)
    done | sort -u
  )
  for name in $names; do
    from="$cli/$src/$name"
    to="$spa/$dst/$name"
    if $copy; then
      if [[ -f "$from" ]]; then
        cp "$from" "$to"
      else
        rm "$to"
        echo "removed $dst/$name (gone from the CLI)"
      fi
    elif [[ ! -f "$from" ]]; then
      echo "DRIFT $dst/$name: not in the CLI ($src)"
      drift=1
    elif [[ ! -f "$to" ]]; then
      echo "DRIFT $dst/$name: not copied from $src"
      drift=1
    elif ! cmp -s "$from" "$to"; then
      echo "DRIFT $dst/$name differs from $src/$name"
      drift=1
    fi
  done
done

if $copy; then
  echo "copied the CLI goldens from $cli; run the gate"
elif [[ $drift -ne 0 ]]; then
  echo "goldens drifted from $cli. Regenerate in the CLI with -update, then run $0 --copy" >&2
  exit 1
else
  echo "OK: goldens match $cli"
fi
