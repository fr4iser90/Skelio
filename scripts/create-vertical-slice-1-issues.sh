#!/usr/bin/env bash
# Erzeugt 8 GitHub-Issues für Vertical Slice 1 (benötigt: gh, gh auth login).
# Nutzung: ./scripts/create-vertical-slice-1-issues.sh
# Trockenlauf: DRY_RUN=1 ./scripts/create-vertical-slice-1-issues.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/.github/issues/vertical-slice-1"
LABEL="vertical-slice-1"

if [[ "${DRY_RUN:-0}" != "1" ]] && ! command -v gh >/dev/null 2>&1; then
  echo "Fehler: gh (GitHub CLI) nicht gefunden. Siehe .github/issues/vertical-slice-1/README.md" >&2
  exit 1
fi

ensure_label() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] gh label create \"${LABEL}\" … (falls noch nicht vorhanden)"
    return 0
  fi
  if gh label list --json name --jq '.[].name' 2>/dev/null | grep -qx "${LABEL}"; then
    return 0
  fi
  run gh label create "${LABEL}" --description "Vertical Slice 1 — MVP-End-to-End" --color "0E8A16"
}

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN]" "$@"
  else
    "$@"
  fi
}

declare -a TITLES=(
  "[VS1] Task 1: Domänenmodell & Validierung (@skelio/domain)"
  "[VS1] Task 2: Commands & Undo/Redo (@skelio/application)"
  "[VS1] Task 3: Ordnerprojekt I/O (@skelio/infrastructure)"
  "[VS1] Task 4: Runtime-Export & JSON-Schema-Check"
  "[VS1] Task 5: Desktop — Store & minimale Hierarchy/Inspector"
  "[VS1] Task 6: Timeline & Playback (Editor)"
  "[VS1] Task 7: Godot — SkelioPlayer (GDScript)"
  "[VS1] Task 8: Slice-Abschluss & manuelle Checkliste"
)

ensure_label

for i in "${!TITLES[@]}"; do
  num=$((i + 1))
  pf="$(printf "%02d" "${num}")"
  body="${DIR}/body-${pf}.md"
  if [[ ! -f "${body}" ]]; then
    echo "Fehlt: ${body}" >&2
    exit 1
  fi
  title="${TITLES[$i]}"
  run gh issue create --title "${title}" --body-file "${body}" --label "${LABEL}"
done

echo "Fertig. Issues im GitHub-Repo prüfen (Label: ${LABEL})."
