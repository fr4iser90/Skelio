#!/usr/bin/env bash
# Erzeugt 5 GitHub-Issues für Phase 3 — Mesh & Skinning (benötigt: gh, gh auth login).
# Nutzung: ./scripts/create-phase-3-mesh-issues.sh
# Trockenlauf: DRY_RUN=1 ./scripts/create-phase-3-mesh-issues.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/.github/issues/phase-3-mesh"
LABEL="phase-3-mesh"

if [[ "${DRY_RUN:-0}" != "1" ]] && ! command -v gh >/dev/null 2>&1; then
  echo "Fehler: gh (GitHub CLI) nicht gefunden. Siehe .github/issues/phase-3-mesh/README.md" >&2
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
  run gh label create "${LABEL}" --description "Phase 3 — Mesh & Skinning (ADR-0009)" --color "1D76DB"
}

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN]" "$@"
  else
    "$@"
  fi
}

declare -a TITLES=(
  "[P3 Mesh] Runtime-Schema & CI: Skinning-Felder (Minor)"
  "[P3 Mesh] Editor: Mesh-Asset, Bind-Pose, Ordnerprojekt"
  "[P3 Mesh] Weight Paint MVP + Domain-Validierung"
  "[P3 Mesh] Viewport: Deformation oder Renderer-Spike (ADR-0003)"
  "[P3 Mesh] Godot: Referenzpfad Mesh/Skeleton"
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
