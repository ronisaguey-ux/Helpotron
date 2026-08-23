#!/usr/bin/env node
// G6: every BATCH-05..08 target file exists with real (non-graft) content.
// Graft surfaces: tiny stub files, TODO-markers, or files with no imports at all.
// Positive control: the checker itself must find a known string in a known file.
import { readFileSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;

// The 16 plan files, mapped from the v15 plan's after_snippet names.
const FILES = [
  "server/admin.py",
  "server/routes_admin_advanced.py",
  "server/agent_session.py",
  "server/cost_tracking.py",
  "server/subagents.py",
  "web/src/components/AIWorkspace.jsx",
  "web/src/components/AdminConsole.jsx",
  "web/src/components/AdminPanels.jsx",
  "web/src/components/AnalyticsDashboard.jsx",
  "web/src/components/AppShell.jsx",
  "web/src/components/AssignmentCardDashboard.jsx",
  "web/src/components/AssignmentDetailView.jsx",
  "web/src/components/CreditsPricingDashboard.jsx",
  "web/src/components/IntelligenceView.jsx",
  "web/src/components/Navbar.jsx",
  "web/src/components/StudyToolsHub.jsx",
];

const failures = [];
const report = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}` + (detail && !cond ? ` — ${detail}` : ""));
  if (!cond) failures.push(name);
};

// Positive control: the checker reads and greps correctly.
const self = readFileSync(join(ROOT, "scripts/gates/gate_16files.mjs"), "utf8");
report("positive control: checker can read+grep itself", self.includes("positive control"));

let missing = 0;
for (const rel of FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    report(`exists: ${rel}`, false, "file missing");
    missing++;
    continue;
  }
  report(`exists: ${rel}`, true);
  const { size } = statSync(abs);
  report(`size: ${rel} (${size} bytes)`, size > 500, "suspiciously small — likely a graft surface");
  const content = readFileSync(abs, "utf8");
  report(`no TODO-stub: ${rel}`, !/TODO:?\s*(implement|add|finish)/i.test(content), "TODO marker present");
  report(
    `has real imports: ${rel}`,
    /(^import |^from |^export |^import\s+\w+ from|require\(|import\()/m.test(content),
    "no imports/exports — likely a stub"
  );
}

if (missing > 0) {
  report(`all 16 files present`, false, `${missing} missing`);
} else {
  report("all 16 files present", true);
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} checks failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("16-file gate passed");
