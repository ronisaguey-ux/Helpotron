#!/usr/bin/env python3
"""Helpotron self-improvement pipeline — audit → cross-eval → execution.

Sized small on purpose: 3 agents × 2 passes (vs oculus's 7×5) so it never
contends with the oculus audit on the same box. State lives in
pipeline/state/*.json (gitignored).

Usage:
  .venv/bin/python pipeline/run.py audit        # find issues
  .venv/bin/python pipeline/run.py cross-eval   # validate findings
  .venv/bin/python pipeline/run.py execute      # turn validated findings into an execution checklist
  .venv/bin/python pipeline/run.py status       # show progress
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.config import config  # noqa: E402
from server.llm import call_llm  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("helpotron.pipeline")

ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = ROOT / "pipeline" / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)

SCAN_TARGETS = [
    ("server", sorted((ROOT / "server").glob("*.py"))),
    ("extension", sorted((ROOT / "extension").glob("*.js"))),
    ("web", sorted((ROOT / "web" / "src").glob("*.jsx"))),
]

NUM_AGENTS = 3
NUM_PASSES = 2
FILE_TRUNCATE = 8000
SEMAPHORE_LIMIT = 2  # stay light while the oculus audit runs
REQUEST_DELAY = 1.5

FINDINGS_FILE = STATE_DIR / "findings.json"
PLAN_FILE = STATE_DIR / "master_plan.md"
EXEC_FILE = STATE_DIR / "execution_plan.md"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_state() -> dict:
    if FINDINGS_FILE.exists():
        return json.loads(FINDINGS_FILE.read_text())
    return {"agents": [{"id": i, "done": False} for i in range(NUM_AGENTS * NUM_PASSES)], "findings": []}


def save_state(state: dict) -> None:
    state["updated_at"] = utcnow()
    FINDINGS_FILE.write_text(json.dumps(state, indent=2))


def _render_file_list() -> str:
    lines = []
    for area, files in SCAN_TARGETS:
        for f in files:
            rel = f.relative_to(ROOT)
            lines.append(f"- {area}: {rel} ({f.stat().st_size} bytes)")
    return "\n".join(lines)


def _file_payloads(pass_num: int) -> str:
    """Pass 0 = even file index, pass 1 = odd — rotation across passes."""
    out = []
    for area, files in SCAN_TARGETS:
        for i, f in enumerate(files):
            if i % NUM_PASSES != pass_num:
                continue
            content = f.read_text(errors="replace")
            if len(content) > FILE_TRUNCATE:
                content = content[:FILE_TRUNCATE] + "\n...[truncated]"
            out.append(f"### {f.relative_to(ROOT)}\n{content}")
    return "\n\n".join(out)


async def audit_agent(session_id: int, pass_num: int, sem: asyncio.Semaphore) -> None:
    state = load_state()
    agent_state = next((a for a in state["agents"] if a["id"] == session_id), None)
    if agent_state is None:
        agent_state = {"id": session_id, "done": False}
        state["agents"].append(agent_state)

    async with sem:
        await asyncio.sleep(REQUEST_DELAY * (session_id % 3))
        user_prompt = (
            "Audit this codebase for REAL issues only. Report:\n"
            "- bugs (crash paths, wrong logic, race conditions)\n"
            "- security problems (credential leaks, injection, missing auth)\n"
            "- API contract breaks (endpoint/DB mismatches)\n"
            "- dead code or obvious maintenance hazards\n\n"
            "Return ONLY a JSON array, each item: "
            '{"severity": "high|medium|low", "file": "<rel path>", '
            '"issue": "<one-line description>", "fix": "<what to change>"}.\n'
            "Max 6 findings. Skip style nits. If a file looks fine, leave it out.\n\n"
            f"FILES TO REVIEW (pass {pass_num + 1} of {NUM_PASSES}):\n{_file_payloads(pass_num)}"
        )
        try:
            content, model = await call_llm(
                "You are a rigorous code reviewer. Never invent issues; only report what the code shows.",
                user_prompt,
            )
            parsed = json.loads(content) if content.strip().startswith("[") else None
        except Exception as e:
            logger.error("agent %d pass %d failed: %s", session_id, pass_num, e)
            agent_state["done"] = True
            save_state(load_state())
            return

        if parsed is None:
            from server.llm import extract_json

            parsed = extract_json(content)
        if not isinstance(parsed, list):
            logger.warning("agent %d pass %d: unparseable output, skipping", session_id, pass_num)
            parsed = []

        state = load_state()
        for f in parsed:
            if not isinstance(f, dict) or not f.get("file"):
                continue
            state["findings"].append({
                "severity": f.get("severity", "low") if f.get("severity") in ("high", "medium", "low") else "low",
                "file": str(f["file"]),
                "issue": str(f.get("issue", "")),
                "fix": str(f.get("fix", "")),
                "agent": session_id,
                "pass": pass_num,
                "status": "pending",  # pending -> confirmed | rejected (cross-eval)
            })
        agent_state["done"] = True
        save_state(state)
        logger.info("agent %d pass %d done: +%d findings (model %s)", session_id, pass_num, len(parsed), model)


async def run_audit() -> None:
    if not FINDINGS_FILE.exists():
        save_state({"agents": [], "findings": []})
    sem = asyncio.Semaphore(SEMAPHORE_LIMIT)
    tasks = [audit_agent(i, i % NUM_PASSES, sem) for i in range(NUM_AGENTS * NUM_PASSES)]
    await asyncio.gather(*tasks)
    state = load_state()
    print(f"\nAudit complete: {len(state['findings'])} findings across {NUM_AGENTS} agents × {NUM_PASSES} passes.")
    print(f"Report: {FINDINGS_FILE}")


# ─── cross-eval ────────────────────────────────────────────────────────────

async def cross_eval() -> None:
    state = load_state()
    pending = [f for f in state["findings"] if f["status"] == "pending"]
    if not pending:
        print("No pending findings to validate.")
        return

    sem = asyncio.Semaphore(SEMAPHORE_LIMIT)
    results = await asyncio.gather(*[validate_one(f, sem) for f in pending])
    confirmed = 0
    for finding, verdict in zip(pending, results):
        finding["status"] = "confirmed" if verdict else "rejected"
        confirmed += 1 if verdict else 0
    save_state(state)

    lines = ["# Helpotron Master Plan", "", f"Validated {confirmed}/{len(pending)} findings.", ""]
    for i, f in enumerate(state["findings"], 1):
        if f["status"] != "confirmed":
            continue
        lines.append(f"{i}. [{f['severity']}] {f['file']}: {f['issue']}")
        if f["fix"]:
            lines.append(f"   Fix: {f['fix']}")
    PLAN_FILE.write_text("\n".join(lines))
    print(f"Cross-eval complete: {confirmed} confirmed -> {PLAN_FILE}")


async def validate_one(finding: dict, sem: asyncio.Semaphore) -> bool:
    async with sem:
        path = ROOT / finding["file"]
        if not path.exists():
            return False
        content = path.read_text(errors="replace")[:FILE_TRUNCATE]
        prompt = (
            "Verify this claimed bug against the actual source. Reply with a single "
            f"word: CONFIRMED or REJECTED.\n\nCLAIM: {finding['issue']}\n"
            f"SUGGESTED FIX: {finding['fix']}\n\nSOURCE ({finding['file']}):\n{content}"
        )
        try:
            content, _ = await call_llm(
                "You are an adversarial verifier. Only CONFIRMED if the source "
                "clearly shows the bug; when in doubt, REJECTED.",
                prompt,
                max_tokens=64,
            )
            # tiny max_tokens can return empty content — treat empty as REJECTED
            return "CONFIRMED" in content.upper()
        except Exception:
            return False


# ─── execution ─────────────────────────────────────────────────────────────

def execute() -> None:
    state = load_state()
    confirmed = [f for f in state["findings"] if f["status"] == "confirmed"]
    if not confirmed:
        print("Nothing confirmed yet — run cross-eval first.")
        return
    lines = ["# Helpotron Execution Plan", "", f"Generated {utcnow()}", "", f"{len(confirmed)} steps.", ""]
    for i, f in enumerate(confirmed, 1):
        lines.append(f"## STEP {i} — {f['file']} ({f['severity']})")
        lines.append(f"Issue: {f['issue']}")
        lines.append(f"Fix:   {f['fix']}")
        lines.append("Status: [ ]")
        lines.append("")
    EXEC_FILE.write_text("\n".join(lines))
    print(f"Execution checklist written: {EXEC_FILE}")
    print("Hand to the orchestrator: fix each step, verify with pytest, commit.")


def status() -> None:
    state = load_state()
    done = sum(1 for a in state["agents"] if a.get("done"))
    total = len(state["agents"])
    findings = len(state["findings"])
    confirmed = sum(1 for f in state["findings"] if f["status"] == "confirmed")
    print(f"audit agents: {done}/{total} done | findings: {findings} | confirmed: {confirmed}")
    print(f"state: {FINDINGS_FILE}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Helpotron self-improvement pipeline")
    parser.add_argument("command", choices=["audit", "cross-eval", "execute", "status"])
    args = parser.parse_args()
    if args.command == "audit":
        asyncio.run(run_audit())
    elif args.command == "cross-eval":
        asyncio.run(cross_eval())
    elif args.command == "execute":
        execute()
    else:
        status()
