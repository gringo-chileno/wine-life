#!/bin/bash
# Publish Wine Life to Spacefast: https://wine-life.view.fast/
#
# Do NOT run `spacefast publish .` in this folder. scripts/_staging* and
# scripts/_selected* hold 2.1 GB of original HEICs with GPS and faces,
# including shots rejected for privacy. This script publishes only the
# git-tracked website files.
set -euo pipefail
cd "$(dirname "$0")"
SPACE=spc_4591e5ec84d64d3e998fbb8a09564357
MSG="${1:-Update}"
DEST=$(mktemp -d)
trap 'rm -rf "$DEST"' EXIT
git ls-files | grep -v '^scripts/' | grep -v '^publish.sh$' | grep -v '^\.gitignore$' | while read -r f; do
  mkdir -p "$DEST/$(dirname "$f")"
  cp "$f" "$DEST/$f"
done
if find "$DEST" \( -iname '*.heic' -o -path '*_staging*' -o -path '*_selected*' \) | grep -q .; then
  echo "ABORT: private photo files made it into the publish set" >&2
  exit 1
fi
spacefast publish "$DEST" --space "$SPACE" -m "$MSG" -y --wait
