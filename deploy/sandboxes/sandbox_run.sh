#!/usr/bin/env bash
# sandbox_run.sh — one isolated workdir per subagent run (08-26 directive).
# Usage:
#   ./deploy/sandboxes/sandbox_run.sh --kind <kind> [--timeout N] -- <cmd...>
set -euo pipefail
# Run metadata, logs and produced files can contain the text of what an agent
# was asked to do; keep them owner-only (0600 files / 0700 dirs) instead of the
# default 0664/0775, which left every run readable by any local account.
umask 077
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
  env -i PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}" \
         HOME="${RUN_DIR}/work" \
         TMPDIR="${RUN_DIR}/work" \
         SANDBOX_RUN_ID="${RUN_ID}" \
         SANDBOX_KIND="${KIND}" \
         timeout "${TIMEOUT}" "${ARGS[@]}"
) > "${RUN_DIR}/logs/run.log" 2>&1
RC=$?

# ★ THE SANDBOX IS KILLED THE SECOND THE TASK IS OVER (owner 2026-09-28: *"every time an
# assignment or task is processed, a new sandbox for that assignment/task is auto generated
# then killed the second the task is over"*). The work directory is the sandbox — every file
# and every byte of scratch the task produced — so it is destroyed here, on the exit path,
# rather than left for a cleanup that never ran. Measured before this: 3,655 run directories
# had accumulated because nothing ever removed them.
#
# `logs/` and `state.json` deliberately SURVIVE: the caller reads the run log after this
# script exits (`_read_sandbox_output` in overlord_agent.py), so deleting the evidence would
# break the feature that produced it. Those are a few hundred bytes; the work dir is not.
if [ -d "${RUN_DIR}/work" ]; then
  # rm -rf on the exact directory; -f so a permission oddity cannot fail the run's rc.
  rm -rf "${RUN_DIR}/work" 2>/dev/null || true
  mkdir -p "${RUN_DIR}/work" 2>/dev/null || true
fi

echo "{\"run_id\":\"${RUN_ID}\",\"kind\":\"${KIND}\",\"started\":\"$(date +%Y-%m-%dT%H:%M:%S)\",\"finished\":\"$(date +%Y-%m-%dT%H:%M:%S)\",\"rc\":${RC},\"timeout\":${TIMEOUT}}" \
  > "${RUN_DIR}/state.json"
echo "[sandbox] ${RUN_ID} rc=${RC} log=${RUN_DIR}/logs/run.log"
exit "${RC}"
