#!/usr/bin/env node
// G7: both webchat executors (helpotron + oculus) enforce runtime-proof
// verification and ban graft-only implementation — the ANTI-GRAFT DISCIPLINE
// block must be present in each executor's system prompt, including the
// runtime-proof rule and the no-graft rule.
// Positive control: the checker greps itself first.
import { readFileSync, existsSync } from "node:fs";

const EXECUTORS = [
  "/home/roni/Roni_Workspace/webchat-api/executor/run_helpotron_batches.py",
  "/home/roni/Roni_Workspace/webchat-api/executor/execute_master_oculus_plan.py",
];

const failures = [];
const report = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}` + (detail && !cond ? ` — ${detail}` : ""));
  if (!cond) failures.push(name);
};

const self = readFileSync(new URL(import.meta.url).pathname, "utf8");
report("positive control: checker can read itself", self.includes("ANTI-GRAFT"));

// Tolerant patterns — the prompts are Python string-literal wrapped, so lines
// may be split across concatenated strings.
const RUNTIME_PROOF = /verification command that[\s\S]{0,80}FAILED VERIFICATION/;
const NO_GRAFT = /paste a verification-target string/;

for (const path of EXECUTORS) {
  const short = path.split("/").pop();
  if (!existsSync(path)) {
    report(`exists: ${short}`, false, "executor file missing");
    continue;
  }
  report(`exists: ${short}`, true);
  const src = readFileSync(path, "utf8");
  report(`anti-graft block: ${short}`, src.includes("ANTI-GRAFT DISCIPLINE"), "marker not found");
  report(`runtime-proof rule: ${short}`, RUNTIME_PROOF.test(src), "runtime-proof sentence missing");
  report(`no-graft rule: ${short}`, NO_GRAFT.test(src), "no-graft sentence missing");
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} checks failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("executor prompt gate passed");
