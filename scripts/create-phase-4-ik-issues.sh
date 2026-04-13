#!/usr/bin/env bash
# Erzeugt 4 GitHub-Issues für Phase 4 — Inverse Kinematics (benötigt: gh, gh auth login).
# Nutzung: ./scripts/create-phase-4-ik-issues.sh
# Trockenlauf: DRY_RUN=1 ./scripts/create-phase-4-ik-issues.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/.github/issues/phase-4-ik"
LABEL="phase-4-ik"

if [[ "${DRY_RUN:-0}" != "1" ]] && ! command -v gh >/dev/null 2>&1; then
  echo "Fehler: gh (GitHub CLI) nicht gefunden. Siehe .github/issues/phase-4-ik/README.md" >&2
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
  run gh label create "${LABEL}" --description "Phase 4 — Inverse Kinematics (ADR-0010)" --color "B60205"
}

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN]" "$@"
  else
    "$@"
  fi
}

declare -a TITLES=(
  "[P4 IK] Datenmodell & UI: IK-Ketten und Ziele"
  "[P4 IK] Solver MVP (2-Bone / FABRIK oder CCD)"
  "[P4 IK] Export: Bake vs Runtime-IK-Metadaten"
  "[P4 IK] Godot + Doku: unterstützter Pfad"
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

echo "Fertig. Issues prüfen (Label: ${LABEL}); Milestone in GitHub-UI zuordnen."
