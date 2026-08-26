#!/usr/bin/env bash
# sandbox_run.sh — one isolated workdir per subagent run (08-26 directive).
# Usage:
#   ./deploy/sandboxes/sandbox_run.sh --kind <kind> [--timeout N] -- <cmd...>
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SB_DIR="${DATA_DIR:-${REPO}/data}/sandboxes"

KIND="subagent"; TIMEOUT=900; ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --kind) KIND="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --) shift; ARGS=("$@"); break;;
    *) ARGS+=("$1"); shift;;
  esac
done
[ ${#ARGS[@]} -gt 0 ] || { echo "usage: sandbox_run.sh --kind <k> -- <cmd...>"; exit 2; }

RUN_ID="$(date +%Y%m%d%H%M%S)_${KIND}_$$"
RUN_DIR="${SB_DIR}/${RUN_ID}"
mkdir -p "${RUN_DIR}/work" "${RUN_DIR}/logs"
echo "{\"run_id\":\"${RUN_ID}\",\"kind\":\"${KIND}\",\"started\":\"$(date +%Y-%m-%dT%H:%M:%S)\",\"timeout\":${TIMEOUT}}" \
  > "${RUN_DIR}/state.json"

echo "[sandbox] ${RUN_ID} work=${RUN_DIR}/work"
(
  cd "${RUN_DIR}/work"
  timeout "${TIMEOUT}" "${ARGS[@]}"
) > "${RUN_DIR}/logs/run.log" 2>&1
RC=$?
echo "{\"run_id\":\"${RUN_ID}\",\"kind\":\"${KIND}\",\"started\":\"$(date +%Y-%m-%dT%H:%M:%S)\",\"finished\":\"$(date +%Y-%m-%dT%H:%M:%S)\",\"rc\":${RC},\"timeout\":${TIMEOUT}}" \
  > "${RUN_DIR}/state.json"
echo "[sandbox] ${RUN_ID} rc=${RC} log=${RUN_DIR}/logs/run.log"
exit "${RC}"
