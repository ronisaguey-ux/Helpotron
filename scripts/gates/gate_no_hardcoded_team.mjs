#!/usr/bin/env node
// G5: AssignmentDetailView subagent team is wired to the real endpoint — a live
// fetch replaces the state on success, and the hardcoded roster is only the
// useState initializer (offline fallback).
// Positive control: assert against a string we KNOW is in the file, so a broken
// read cannot produce a false pass.
import { readFileSync } from "node:fs";

const file = new URL("../../web/src/components/AssignmentDetailView.jsx", import.meta.url).pathname;
const src = readFileSync(file, "utf8");

const failures = [];
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}` + (detail && !cond ? ` — ${detail}` : ""));
  if (!cond) failures.push(name);
};

// Positive control — proves the file was read and the grep pattern style works.
check("positive control: file contains 'api.getSubagentTeam'", src.includes("api.getSubagentTeam"));

// Live path exists.
check("live fetch: api.getSubagentTeam is called", src.includes("api.getSubagentTeam("));
check("live fetch: teamLive state flag exists", /\bteamLive\b/.test(src));
check("live fetch: TEAM_ICONS maps API roles", src.includes("TEAM_ICONS[r.role]"));

// On success the fetch REPLACES the roster — the region between the fetch call
// and its catch must contain the state replacement and the live flag.
const fetchIdx = src.indexOf("api.getSubagentTeam(");
const catchIdx = src.indexOf(".catch(", fetchIdx);
check("fetch has a .catch branch", catchIdx !== -1 && catchIdx > fetchIdx);
const thenRegion = src.slice(fetchIdx, catchIdx);
check("success path replaces teamMembers from API data", thenRegion.includes("setTeamMembers("), "no setTeamMembers in then-branch");
check("success path arms teamLive", thenRegion.includes("setTeamLive(true)"));

// The hardcoded roster is only the useState initializer — it must appear
// BEFORE the fetch (as initial state), never inside the success path.
const rosterIdx = src.indexOf("useState([");
check("fallback roster is a useState initializer", rosterIdx !== -1);
check("roster initializer precedes the live fetch", rosterIdx < fetchIdx);
check("roster is NOT inside the fetch success path", !thenRegion.includes("useState(["));

if (failures.length) {
  console.error(`FAILED: ${failures.length} checks failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("no hardcoded team gate passed");
