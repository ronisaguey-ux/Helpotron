#!/usr/bin/env python3
"""Round loop: turn one round's verdicts into the next round's baseline.

The method, stated once so it does not drift:

  1. Generate 20 variations from the CURRENT baseline, one knob moved per row.
  2. Type them, one doc each, recording engine telemetry as we go.
  3. The owner scores them on the grader's free tier (flat numbers, keyed by marker).
  4. Read the deltas against the control row.
  5. Fold the knobs that helped into the baseline; revert the ones that hurt.
  6. Re-run. Repeat until the deltas stop moving more than the noise floor.

State lives in baseline.json beside this file so a round can resume and so the
provenance of every value is recorded. Nothing is hardcoded in the engine: the
baseline is a config the extension already knows how to accept.

Commands
  python3 rounds.py status                 show the current baseline + history
  python3 rounds.py gen                    write next round's variations.json
  python3 rounds.py fold <round>           apply a scored round to the baseline
  python3 rounds.py noise <a> <b> ...      estimate the noise floor from repeats

The noise floor matters: two identical configs will not score identically, and
without a floor every round looks like progress. Repeats are marked in the
variation table as control duplicates for exactly this.
"""
import json, os, pathlib, sys, glob, statistics

_HERE = pathlib.Path(__file__).resolve().parent
BASE = os.environ.get("TYPING_BASELINE", str(_HERE / "baseline.json"))
ROUNDS = os.environ.get("TYPING_ROUNDS", str(_HERE / "rounds"))

# The engine's fitted defaults, as of the two-session measurement. A round's
# baseline starts here and is only ever moved by evidence.
DEFAULT_BASELINE = {
    # Every value here is one the engine actually reads, and it is the value the
    # engine will use if the knob is never varied — so the control row is a true
    # control, and a row can only differ by the one knob it names.
    # These MUST match direct_type.HUMAN_PARAMS. They did not, and the first
    # batch run measured the wrong engine: the control carried typo_rate 0.091
    # and backspace_runs {"single": 1.0} — the pre-refit values — while the 8
    # real runs that scored 100 used typo_rate 0.028 and the measured run
    # distribution. The control scored 0.82 (flagged) against 100 for the
    # current engine, so the whole batch was testing a superseded model.
    # _assert_matches_engine() below fails loudly if this drifts again.
    "typing": {
        "typo_rate": 0.028,
        "jitter": True,
        "typosEnabled": True,
        "punctuationPauses": True,
        "think_gap_prob": 0.01,
        "think_gap_median": 4700,
        "gap_base_median": 151,
        "log_sigma": 1.05,
        "burst_gap_ms": 73,
        "pace_drift": 0.05,
        "backspace_runs": {"1": 0.324, "2": 0.284, "3": 0.161, "4": 0.066,
                           "5": 0.060, "6": 0.042, "long": 0.063},
        "cursor": {"enabled": True, "per_100_chars": 0.25},
    },
    "cfg": {},
}
# Candidate values per knob. A round moves one knob one step along its own list,
# so the effect is measured against a single control rather than a gradient.
STEPS = {
    # ONLY knobs the engine actually reads. The previous table varied nine
    # parameters `type_text` never consulted (`speed`, `false_start_rate`,
    # `trusted_keys`, `falseStarts`, `microEdits`, `burstScale`, `thinkingBreaks`,
    # `natural_pauses`, `mouseActivity`), so that round measured mostly noise.
    # `trusted_keys` is impossible by construction regardless: CDP key events
    # always carry isTrusted:false.
    "typo_rate":        [0, 0.05, 0.091, 0.16, 0.25],
    # The lull: rare-and-long versus frequent-and-short is a shape, not a rate.
    "think_gap_prob":   [0.004, 0.008, 0.02, 0.05],
    "think_gap_median": [2500, 4700, 7000],
    # Cadence anchor (the fitted letter gap is 151ms).
    "gap_base_median":  [110, 151, 200],
    # Spread. Lower is machine-regular, which is the thing being detected.
    "log_sigma":        [0.45, 0.761, 1.05],
    # Burst shape: consecutive keys inside Docs' merge window.
    "burst_gap_ms":     [55, 73, 110],
    # Slow pace wander (the recorded arc is near-flat, so small amplitudes).
    "pace_drift":       [0.0, 0.05, 0.12],
    # Correction shape: one backspace (what the owner does) versus a held key.
    # Run-length weights, in the engine's CURRENT key format (numeric keys plus
    # "long"). The previous entries used the retired single/double/triple names,
    # which _draw_run cannot parse — it would have silently treated every row as
    # "always one backspace", which is a valid condition but not the one the row
    # claimed to test.
    "backspace_runs":   [{"1": 1.0},                                   # every correction is one keypress
                         {"1": 0.15, "2": 0.18, "3": 0.19, "4": 0.15,
                          "5": 0.12, "6": 0.09, "long": 0.12}],        # longer, heavier runs
    "jitter":           [True, False],
    "typosEnabled":     [True, False],
    "punctuationPauses":[True, False],
    # Pointer presence: a session with no mouse events is its own signature.
    "cursor":           [{"enabled": False},
                         {"enabled": True, "per_100_chars": 0.25},
                         {"enabled": True, "per_100_chars": 1.0}],
}
KNOBS = list(STEPS.keys())


def load():
    if os.path.exists(BASE):
        return json.load(open(BASE))
    d = json.loads(json.dumps(DEFAULT_BASELINE))
    d["round"] = 0
    d["history"] = []
    return d


def save(b):
    json.dump(b, open(BASE, "w"), indent=1)


def current(b, knob):
    if knob in b["typing"]:
        return b["typing"][knob]
    return b["cfg"].get(knob)


def set_knob(b, knob, val):
    if knob in b["typing"]:
        b["typing"][knob] = val
    else:
        b["cfg"][knob] = val


def next_values(knob, cur):
    """Where this knob goes next, given where it is now. Returns up to two
    candidate moves (finer around the current value) so a round can split a
    knob that looks promising instead of jumping past the optimum."""
    ladder = STEPS[knob]
    if cur not in ladder:
        return [ladder[len(ladder) // 2]]
    i = ladder.index(cur)
    out = []
    if i + 1 < len(ladder):
        out.append(ladder[i + 1])
    if i - 1 >= 0:
        out.append(ladder[i - 1])
    return out


def _assert_matches_engine(b):
    """Fail loudly if the round baseline has drifted from the engine's defaults."""
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import direct_type as dt
    drift = []
    for k, v in b["typing"].items():
        e = dt.HUMAN_PARAMS.get(k)
        if e is None:
            continue
        if isinstance(v, dict) and isinstance(e, dict):
            if set(v) != set(e):
                drift.append(f"{k}: keys differ {sorted(set(v) ^ set(e))}")
        elif isinstance(v, (int, float)) and isinstance(e, (int, float)):
            if abs(float(v) - float(e)) > 1e-9:
                drift.append(f"{k}: round={v} engine={e}")
        elif v != e:
            drift.append(f"{k}: round={v!r} engine={e!r}")
    if drift:
        raise SystemExit("BASELINE DRIFT - round table != engine:\n  "
                         + "\n  ".join(drift))
    print(f"  baseline matches engine ({len(b['typing'])} knobs checked)")


def gen(round_no=None, per_knob=2):
    """Build the next round's variation table from the current baseline."""
    b = load()
    _assert_matches_engine(b)
    r = (b.get("round", 0) + 1) if round_no is None else round_no
    base_t = dict(b["typing"])
    base_c = dict(b["cfg"])

    variants = []
    # Row 1 is always the control — it is the reference every delta is measured
    # against, and a second identical control is added later in the table so the
    # noise floor can be estimated from the same run.
    variants.append({
        "id": f"r{r}_control", "marker": MARKERS[0],
        "typing": dict(base_t), "cfg": dict(base_c),
        "note": "control — the current baseline, unchanged",
        "knob": None,
    })

    # Slots: one control at the front, one control-repeat at the back, and the
    # rest are single-knob rows. The repeat must be reserved BEFORE filling the
    # middle — appending it last and slicing to 20 silently dropped it, which
    # costs the run its own noise estimate.
    LIMIT = 20
    budget = LIMIT - 2

    # Build every candidate row, ordered so each knob gets its primary step
    # before any knob gets a second one. With 12 knobs and 18 slots that means
    # all 12 are tested once, and 6 get a second value.
    per_knob_rows = []
    for step in range(per_knob):
        for knob in KNOBS:
            vals = next_values(knob, current(b, knob))
            if step >= len(vals):
                continue
            per_knob_rows.append((knob, current(b, knob), vals[step], step))

    mk = 1
    for knob, cur, val, step in per_knob_rows[:budget]:
        t, c = dict(base_t), dict(base_c)
        if knob in t:
            t[knob] = val
        else:
            c[knob] = val
        variants.append({
            "id": f"r{r}_{knob}_{str(val).replace('.', 'p')}",
            "marker": MARKERS[mk % len(MARKERS)],
            "typing": t, "cfg": c,
            "note": f"{knob}: {cur} -> {val}",
            "knob": knob, "step": step,
        })
        mk += 1

    # A SECOND control, placed so that it lands at the head of the second batch.
    #
    # With 20 rows split into two batches of 10, a single control at position 1
    # leaves batch 2 with NO control of its own — every row in it would be scored
    # against a document the owner had already closed, from a different session.
    # Putting a control at the head of each batch makes each batch self-contained,
    # and because it is the same configuration as the first control, the pair
    # doubles as the noise floor: whatever difference they show is pure noise.
    control_repeat = {
        "id": f"r{r}_control_repeat", "marker": MARKERS[mk % len(MARKERS)],
        "typing": dict(base_t), "cfg": dict(base_c),
        "note": "control again — batch 2's baseline AND the noise floor",
        "knob": None, "is_control_repeat": True,
    }

    # The eight rows are printed above, so truncating them here is deliberate.
    # Layout: control, 9 knob rows, control, 9 knob rows = 20 rows / 2 batches.
    knob_rows = variants[1:]
    per_batch = (LIMIT - 2) // 2          # 9 knob rows each side of the controls
    ordered = ([variants[0]] + knob_rows[:per_batch]
               + [control_repeat] + knob_rows[per_batch:per_batch * 2])
    variants = ordered

    # The essay must be carried INTO the new table. Reading it back out of
    # variations.json after writing would always find an empty body, because
    # this write is what replaces the file.
    global ESSAY_BODY
    if not ESSAY_BODY:
        try:
            ESSAY_BODY = json.load(open(str(_HERE / "variations.json"))).get("essay", "")
        except Exception:
            ESSAY_BODY = ""
    table = {"round": r, "baseline": b, "essay": ESSAY_BODY, "variations": variants[:20]}
    json.dump(table, open(str(_HERE / "variations.json"), "w"), indent=1)
    write_py(table)
    os.makedirs(f"{ROUNDS}/r{r}", exist_ok=True)
    print(f"  round {r}: {len(table['variations'])} variations written")
    for v in table["variations"]:
        print(f"    {v['marker']:<9} {v['id']:<34} {v['note']}")
    return table


# Markers are the leading word of each doc, so a screenshot identifies a row.
MARKERS = ["Zebra", "Yacht", "Xenon", "Wheat", "Vault", "Umber", "Tidal", "Sable",
           "Ridge", "Quill", "Pearl", "Onyx", "Nadir", "Mango", "Lumen", "Kite",
           "Juniper", "Ivory", "Harbor", "Glacier", "Amber", "Basalt"]

ESSAY_BODY = None


def write_py(table):
    """The runner and the correlator both read the Python table; keep them in
    step by generating it from the JSON."""
    body = table.get("essay") or ESSAY_BODY or ""
    py = ("# generated by rounds.py — do not edit by hand\n"
          "import json, os\n"
          "_H = os.path.dirname(os.path.abspath(__file__))\n"
          "_D = json.load(open(os.path.join(_H, 'variations.json')))\n"
          "ESSAY_BODY = _D.get('essay', '')\n"
          "VARIATIONS = _D['variations']\n\n"
          "def textFor(v):\n"
          "    return (v.get('marker') or '') + ' ' + ESSAY_BODY\n")
    open(str(_HERE / "variations.py"), "w").write(py)


def noise(scores):
    """Rough noise floor: half the spread of repeated identical configs."""
    if len(scores) < 2:
        return None
    return (max(scores) - min(scores)) / 2.0


def fold(round_no):
    """Apply a scored round: keep the knobs that beat the control by more than
    the noise floor, revert the rest."""
    rdir = f"{ROUNDS}/r{round_no}"
    vfile = str(_HERE / "verdicts.json")
    if not os.path.exists(vfile):
        print(f"  no {vfile} — score the round first")
        return 1
    table = json.load(open(str(_HERE / "variations.json")))
    verdicts = json.load(open(vfile))
    by_marker = {v["marker"]: v for v in table["variations"]}
    b = load()

    ctrl = next((v for v in table["variations"] if v.get("knob") is None
                 and not v.get("is_control_repeat")), None)
    repeat = next((v for v in table["variations"] if v.get("is_control_repeat")), None)
    if not ctrl:
        print("  no control row in the table")
        return 1
    c_score = (verdicts.get(ctrl["marker"]) or {}).get("natural")
    r_score = (verdicts.get(repeat["marker"]) or {}).get("natural") if repeat else None
    if c_score is None:
        print(f"  control '{ctrl['marker']}' has no score — cannot measure deltas")
        return 1
    floor = noise([c_score, r_score]) if r_score is not None else None
    print(f"  control {ctrl['marker']} = {c_score}%"
          + (f"   repeat {repeat['marker']} = {r_score}%   noise floor ±{floor:.1f}" if floor is not None else ""))

    applied, skipped = [], []
    for v in table["variations"]:
        if v.get("knob") is None:
            continue
        sc = (verdicts.get(v["marker"]) or {}).get("natural")
        if sc is None:
            skipped.append((v["id"], "no score"))
            continue
        delta = sc - c_score
        if floor is not None and abs(delta) <= floor:
            skipped.append((v["id"], f"within noise ({delta:+})"))
            continue
        if delta > 0:
            val = v["typing"].get(v["knob"], v["cfg"].get(v["knob"]))
            set_knob(b, v["knob"], val)
            applied.append((v["knob"], val, delta))
        else:
            skipped.append((v["id"], f"hurt ({delta:+})"))

    b["round"] = round_no
    b.setdefault("history", []).append({
        "round": round_no, "control": c_score, "repeat": r_score,
        "floor": floor, "applied": applied, "skipped": skipped,
    })
    save(b)
    print(f"\n  applied {len(applied)} change(s):")
    for k, val, d in applied:
        print(f"    {k} = {val}   ({d:+}% natural)")
    if skipped:
        print(f"  reverted/skipped {len(skipped)}:")
        for i, why in skipped:
            print(f"    {i} — {why}")
    return 0


def status():
    b = load()
    print(f"  round: {b.get('round')}")
    print("  current baseline:")
    for k, v in b["typing"].items():
        print(f"    {k:<18} {v}")
    for k, v in b["cfg"].items():
        print(f"    {k:<18} {v}")
    h = b.get("history") or []
    if h:
        print("\n  history:")
        for e in h:
            print(f"    r{e['round']}: control {e['control']}%"
                  + (f", noise ±{e['floor']:.1f}" if e.get("floor") else "")
                  + f", applied {len(e['applied'])}")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        sys.exit(status())
    elif cmd == "gen":
        gen(int(sys.argv[2]) if len(sys.argv) > 2 else None)
    elif cmd == "fold":
        sys.exit(fold(int(sys.argv[2]) if len(sys.argv) > 2 else load().get("round", 1)))
    elif cmd == "noise":
        vals = [float(x) for x in sys.argv[2:]]
        print(f"  noise floor ±{noise(vals)}" if noise(vals) is not None else "  need 2+ values")
    else:
        print(__doc__)
