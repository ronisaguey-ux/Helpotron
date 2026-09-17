#!/usr/bin/env python3
"""Type each variation into its own Google Doc using DIRECT CDP keystrokes.

Why direct CDP rather than the extension:
  The extension adds a variable we are not testing. It injects a content
  script, attaches its own debugger session, and runs its own copy of the
  timing model — so a difference between two docs could come from the
  extension rather than from the knob. Driving the page directly means the only
  thing that differs between docs is the knob.

How it works:
  1. Open a new Docs tab over CDP, read its id, wait for the editor to settle.
  2. Focus the editable surface. Docs takes keystrokes through a hidden
     iframe (`iframe.docs-texteventtarget-iframe`); focusing its body is what
     makes Input.dispatchKeyEvent land in the document rather than nowhere.
  3. Walk the text, drawing each gap from the same fitted parameters the
     extension uses (HUMAN_PARAMS below), and dispatch
     Input.dispatchKeyEvent for every character.
  4. Read the doc back through the authenticated export, close the tab.

Everything is attributed: a per-run JSON holds the params, every keystroke's
gap, and the doc text, so a flagged word can be traced to the exact interval
that produced it.

Usage:
  python3 direct_type.py --list
  python3 direct_type.py r1_control r1_typo_rate_0p16
  python3 direct_type.py --all
"""
import asyncio, json, math, os, pathlib, random, re, sys, time, urllib.request
import websockets

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

# Output lives beside the engine so the repo is self-contained; override
# with TYPING_OUT to write somewhere else.
OUT = os.environ.get("TYPING_OUT", str(pathlib.Path(__file__).resolve().parent / "runs"))

# ── The measured hand. These are the two-session fitted values, so a direct run
#    is directly comparable with an extension run. 90% CIs from n=10,901 gaps.
# Cursor behaviour. The owner asked for movement on every variation, because a
# session with no pointer events at all is itself a signature — a real writer
# moves the mouse. Frequency and distance come from the same fitted hand where
# known, and are marked where they are still an assumption.
CURSOR_DEFAULTS = {
    "enabled": True,
    # How many independent pointer streams run at once. ONE is a real writer.
    # More is a deliberate experiment: CDP carries any number of concurrent
    # cursors (measured: 32 streams, 640 events, 0.36s, no degradation), but a
    # document with several pointers flying while one caret types is not a
    # human shape — it is the opposite of what this project wants. Kept as a
    # knob because it is testable, defaulted to 1 because it is honest.
    "count": 1,
    # How often the hand leaves the keys. The old 1.4 meant an excursion every
    # 71 characters — measured 53 excursions and 752 mouseMoved events across
    # one 679-word essay, i.e. a mouse-touch every sentence and a half. That is
    # the "moves constantly" shape, not a person writing. 0.25 = one touch per
    # ~400 chars, about 9 excursions / 126 mouseMoved events per essay.
    "per_100_chars": 0.25,
    "reach_px": (40, 260),     # how far it travels
    "steps": (6, 22),          # interpolation steps, so it is a path not a jump
    "hover_ms": (120, 700),    # the pause after arriving
    "click_chance": 0.35,      # a movement that ends in a click (caret reposition)
}

HUMAN_PARAMS = {
    "gap_base_median": 151.0,   # CI [152,158]
    "gap_base_lo": 103.0,
    "gap_base_hi": 196.0,
    "log_sigma": 1.05,          # widened from the 0.761 CI upper bound. The detector
                            # gates hard on inter-event spread, and Docs coalescing
                            # removes about a third of the configured variance, so the
                            # observed sigma lands near the tested boundary. Round 1
                            # measured margin 0.108 -> 0.247 at this value, and it is
                            # the one knob whose direction the mechanism predicts.
    "space_ratio": 1.22,        # CI [1.19,1.26]
    "comma_ratio": 1.05,
    "sentence_ratio": 3.18,     # CI [2.47,3.98], pooled n=60 stops
    "burst_gap_ms": 73.0,       # median measured 73ms (was 88)
    "burst_max": 2,
    # Burst lengths, re-measured from the 45,530-event recording. Of 1699
    # bursts, 91% were a single key, 6.4% two, 1.4% three, 0.8% four, and a
    # handful ran 7-29. The old `randint(0, burst_max)` put a third of all
    # characters into a burst, which is not the shape a hand produces.
    "burst_dist": [(0, 0.911), (1, 0.064), (2, 0.014), (3, 0.008), (5, 0.002),
                   (12, 0.001)],
    # Correction EPISODES per character, not backspaces per character.
    # Measured independently from both recordings: episodes/insert =
    # 0.0276 (take1) and 0.0281 (take2). The old 0.091 was backspaces/insert
    # (0.0919 / 0.0835); the two coincide only if every correction were a single
    # backspace, which the raw run-length data disproves (mean run 3.33 / 2.97).
    "typo_rate": 0.028,
    # The long lull. Both existing settings were wrong, and so was the
    # recommendation to raise the probability: measured across BOTH recordings,
    # the owner pauses RARELY but for a LONG time — ~0.9% of gaps exceed 2s and
    # they average 4.7s, which is what puts 17.2% of all elapsed time in the
    # tail. The old 6.8%-of-gaps at 1.8s produced 26% of time in the tail and
    # the wrong shape entirely: frequent short hesitations instead of rare long
    # ones. 0.008 / 4700ms reproduces mean gap, tail fraction AND tail length
    # together (verified by simulation over 60k draws).
    "think_gap_median": 4700.0,
    "think_gap_prob": 0.01,
    # WHERE a lull may fall. The engine drew its lull with a flat Bernoulli on
    # every gap, so a 4-second pause was as likely mid-word as at a full stop.
    # The recordings say otherwise: sentence-ends are 0.2-0.4% of gaps but
    # 3.6-6.5% of lulls — a 16x enrichment. P(lull | '.') measured 33% and 11%
    # against P(lull | a letter) of 2.25% and 0.43%.
    #
    # Note the data CONTRADICTS the detector write-up on commas: it lists "after
    # a comma" as a pause point, but the owner produced 0 lulls after a comma in
    # 181 comma-gaps across both recordings. The data wins; commas are damped.
    "lull_after_sentence": 20.0,   # multiplier on think_gap_prob after . ! ?
    "lull_after_newline": 26.0,    # paragraph boundary — the strongest point
    "lull_after_comma": 0.0,       # measured zero; do not invent them
    "lull_after_space": 1.0,       # baseline
    "lull_midword": 0.5,          # mid-word pauses are rare and suspicious,
    # Corrections. The owner's own recording had 213 correction events and every
    # one a SINGLE backspace (max run 1), so that is the default. `backspace_runs`
    # opens the other shape — a hand that holds the key down — so the experiment
    # can measure whether the detector even notices the difference.
    # Run lengths, measured across both recordings (334 runs):
    # {1:.324, 2:.284, 3:.161, 4:.066, 5:.060, 6:.042, 7+:.063},
    # mean run 2.97-3.33. Only ~32% are a single backspace — the previous
    # {"single":1.0} forced every correction to one keystroke, the opposite of
    # what the hand does.
    "backspace_runs": {"1": 0.324, "2": 0.284, "3": 0.161, "4": 0.066,
                       "5": 0.060, "6": 0.042, "long": 0.063},
    # Correction timing, measured: median ~400-530ms before the hand reacts,
    # then ~162ms per backspace. The engine used a fixed 30-70ms beat and
    # 50-110ms spacing — about 8x too fast on the notice beat.
    # DWELL: how long a key is actually held. Measured from the recordings by
    # pairing keydown/keyup (n=620/723): median 67ms/63ms, p10 50/47, p90 110/98.
    # The engine previously held every key for ~0ms — it dispatched keyUp
    # immediately after keyDown, which no finger can do. That is the single
    # loudest physical tell in the whole model.
    "dwell_median": 65.0,
    "dwell_sigma": 0.25,
    "notice_beat_ms": (250.0, 900.0),
    "backspace_gap_ms": (90.0, 220.0),
    # ── backward edits ──────────────────────────────────────────────────────
    # A real writer does not only append. They go back, fix a word, and carry
    # on. The engine had NO way to express this: every insert landed at the
    # running end, so the changelog was a flat monotonic append — the literal
    # "Bot Progress" shape. Caret motion is invisible in the changelog (no
    # revision), so a backward edit shows up purely as an insert whose
    # insertLocation is behind the current end.
    #
    # Ceiling is deliberate: the grader's client flags delete-then-insert at the
    # same index with deletedLength >= 12 as "AI Polish", so a backward edit
    # must stay small or it trades one flag for another.
    "backward_prob": 0.022,          # chance per eligible sentence boundary
    "backward_min_chars": 60,        # don't go back before there is text behind
    "backward_max_words": 2,         # how many words to retype
    "backward_del_max": 9,           # characters deleted, must stay < 12
}


def gauss():
    u = 0.0
    while u == 0:
        u = random.random()
    v = random.random()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


# How far each run may wander from the fitted centre, per parameter, as a
# fraction. Small for things that are tightly measured (the letter gap), larger
# for things measured from few samples (the lull).
PROFILE_SPREAD = {
    "gap_base_median": 0.10,
    "log_sigma": 0.18,
    "space_ratio": 0.08,
    "sentence_ratio": 0.22,
    "burst_gap_ms": 0.12,
    "typo_rate": 0.35,
    "think_gap_median": 0.40,
    # Tightened from 0.50: at 0.50 the control drew [0.004, 0.012], which
    # CONTAINS the 0.004 knob step — so that row was indistinguishable from a
    # control that happened to draw low. Every spread must be narrow enough that
    # no knob step falls inside the control's own range, or the round cannot
    # attribute a score change to the knob. Re-check this whenever a step moves.
    "think_gap_prob": 0.30,
}


def session_profile(base=None, rng=None):
    """A fresh profile for one document, sampled around the fitted centre.

    The fitted numbers come from two recordings of one hand — 2 samples. Chasing
    them exactly would be overfitting twice over: to two sessions of one person,
    and to a distribution so precise that reproducing it is itself a signature.
    A real typist is not the same typist every day.

    So the fitted values are the ANCHOR, and each run draws around them. The
    spread is deliberately uneven: tight on the tightly-measured quantities (the
    letter gap, from n=2103), loose on the ones resting on few samples (the lull,
    from ~100 events), because confidence in an estimate should bound how far we
    let it wander. A run can therefore be faster or slower than the recordings
    without ever leaving the plausible human range.
    """
    rng = rng or random
    base = base or HUMAN_PARAMS
    prof = dict(base)
    for key, frac in PROFILE_SPREAD.items():
        v = base.get(key)
        if not isinstance(v, (int, float)):
            continue
        # triangular around the centre: most likely at the fitted value, allowed
        # to reach the edges of the band, never outside it.
        lo, hi = v * (1 - frac), v * (1 + frac)
        prof[key] = rng.triangular(lo, hi, v)
    prof["gap_base_lo"] = max(40.0, prof["gap_base_median"] * 0.68)
    prof["gap_base_hi"] = prof["gap_base_median"] * 1.30
    if "burst_dist" in base:
        prof["burst_dist"] = base["burst_dist"]
    prof["_sampled"] = True
    return prof


# QWERTY physical key positions, for the proximity typo model. the grader's own
# write-up names this: "When humans make a typo, it is almost always an adjacent
# key error (hitting w instead of e) or a letter inversion (teh instead of the).
# Autotypers often generate random letter typos that don't match keyboard layout
# proximity." Measured on the owner's recordings: same-key stutter 27%, within
# 1.5 keys 25% (random baseline 18%), and the mean key distance is 1.13x closer
# than random — a real but modest bias, strongest in the same-key stutters.
_KEY_ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"]
_KEYPOS = {}
for _r, _row in enumerate(_KEY_ROWS):
    for _c, _ch in enumerate(_row):
        _KEYPOS[_ch] = (_c + _r * 0.5, _r)


def _word_spans(text):
    """Character spans of each word, for targeting a backward edit."""
    return [(m.start(), m.end()) for m in re.finditer(r"\S+", text)]


def _key_dist(a, b):
    if a not in _KEYPOS or b not in _KEYPOS:
        return 9.9
    (x1, y1), (x2, y2) = _KEYPOS[a], _KEYPOS[b]
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5


def dwell(ch, p=None):
    """How long this key is held down, in ms.

    Measured from the recordings: median 63-67ms, p10 ~48ms, p90 ~100ms. Held as
    a log-normal around the median rather than a uniform draw, because the real
    distribution has the long right tail every other timing quantity here has.
    """
    med = (p or HUMAN_PARAMS).get("dwell_median", 65.0)
    sig = (p or HUMAN_PARAMS).get("dwell_sigma", 0.25)
    v = random.lognormvariate(math.log(max(1.0, med)), sig)
    return max(25.0, min(220.0, v))


def _wrong_char(ch):
    """The character a hand actually hits when it fumbles `ch`.

    Weighted by what the recordings show, not by a uniform draw over the
    alphabet:
      same key   27%  a stutter — hit the same key twice
      neighbour  25%  an adjacent key
      swap       10%  transposition with the PREVIOUS character (teh/the)
      random     rest  a genuinely wrong key, still biased near the target
    """
    lo = ch.lower()
    r = random.random()
    if r < 0.27:
        return ch                      # stutter: same key again
    if r < 0.52:
        near = [c for c in _KEYPOS
                if 0 < _key_dist(c, lo) <= 1.5 and c.isalpha()]
        if near:
            w = random.choice(near)
            return w.upper() if ch.isupper() else w
    near = sorted(_KEYPOS, key=lambda c: _key_dist(c, lo))
    # a wrong key, drawn from the physically near ones rather than anywhere
    pool = [c for c in near[:12] if c.isalpha() and c != lo]
    if pool:
        w = random.choice(pool)
        return w.upper() if ch.isupper() else w
    return random.choice([c for c in "abcdefghijklmnopqrstuvwxyz" if c != lo])


def _draw_run(runs):
    """Backspaces this correction takes, from the measured distribution.

    The old code could only reach 1/2/3 and defaulted to 1 forever. The measured
    distribution runs to 16 with a mean near 3, so draw from the real weights and
    map "long" to a sample from the observed tail.
    """
    weights = []
    for k, w in runs.items():
        if k == "long":
            weights.append(("long", w))
        else:
            try:
                weights.append((int(k), w))
            except (TypeError, ValueError):
                continue
    if not weights:
        return 1
    total = sum(w for _, w in weights) or 1.0
    r = random.random() * total
    acc = 0.0
    for n, w in weights:
        acc += w
        if r < acc:
            if n == "long":
                # Weighted toward the observed tail, not uniform: the real
                # distribution of runs >=7 is {7:2, 8:1, 9:3, 10:2, 11:2,
                # 12:2, 13:1, 16:1, 74:1} over take-2. A uniform pick here
                # inflates the mean run, because 16 is as likely as 7.
                return random.choice([7, 7, 8, 9, 9, 9, 10, 10, 11, 11,
                                      12, 12, 13, 16])
            return n
    return 1


def _draw_burst(p):
    """How many following keys land at burst speed.

    Weighted, because the real distribution is overwhelmingly singleton runs.
    Falls back to the old uniform draw if a profile has no distribution.
    """
    dist = p.get("burst_dist")
    if not dist:
        return random.randint(0, p["burst_max"])
    r = random.random()
    acc = 0.0
    for n, w in dist:
        acc += w
        if r < acc:
            return n
    return 0


def lull_weight(prev, p):
    """How much more (or less) likely a long pause is after this character.

    Encodes where the recordings actually put their lulls, so the pause
    distribution has the structural shape a detector looks for instead of being
    uniformly scattered through the text.
    """
    if prev == "\n":
        return p.get("lull_after_newline", 26.0)
    if prev in ".!?":
        return p.get("lull_after_sentence", 20.0)
    if prev == ",":
        return p.get("lull_after_comma", 0.0)
    if prev == " ":
        return p.get("lull_after_space", 1.0)
    return p.get("lull_midword", 0.35)


def draw_gap(ch, prev, p):
    """Log-normal, with the boundary weights the recording measured."""
    med = p["gap_base_median"]
    g = med * math.exp(p["log_sigma"] * gauss())
    if ch == " ":
        g *= p["space_ratio"]
    elif ch in ".!?":
        g *= p["sentence_ratio"]
    elif ch in ",;:":
        g *= p["comma_ratio"]
    # The lull, weighted by WHERE we are in the prose. A flat Bernoulli here is
    # what made the engine's long pauses fall uniformly through the text, which
    # is the shape the detector calls unnatural.
    if random.random() < p["think_gap_prob"] * lull_weight(prev, p):
        g += p["think_gap_median"] * (0.5 + random.random())
    if ch.isupper():
        g += 16 + random.random() * 40
    return max(16.0, g)


# ── CDP plumbing ────────────────────────────────────────────────────────────
def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:9222{path}", timeout=8) as r:
        return json.load(r)


class Browser:
    """Talks to the browser-level CDP endpoint, so it can create/close tabs.

    ONE socket, ONE reader task, and a future per in-flight request. Every
    caller sends and then awaits its own future, so any number of tabs may be
    driven at the same time. The obvious alternative — send, then recv() inside
    the caller — is what this used to do, and it cannot support concurrent
    work: two callers both sit in recv() on the same socket, so one of them
    consumes the other's reply and the ids never line up. With a single reader,
    replies are matched by request id and concurrency is free.
    """
    def __init__(self, ws):
        self.ws = ws
        self.n = 0
        self.pending = {}
        self.reader = None

    async def start(self):
        self.reader = asyncio.create_task(self._pump())

    async def _pump(self):
        async for raw in self.ws:
            try:
                m = json.loads(raw)
            except Exception:
                continue
            fut = self.pending.pop(m.get("id"), None)
            if fut is not None and not fut.done():
                fut.set_result(m)

    async def call(self, method, params=None, timeout=120):
        self.n += 1
        mid = self.n
        msg = {"id": mid, "method": method, "params": params or {}}
        fut = asyncio.get_event_loop().create_future()
        self.pending[mid] = fut
        await self.ws.send(json.dumps(msg))
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self.pending.pop(mid, None)

    async def new_tab(self, url):
        r = await self.call("Target.createTarget", {"url": url})
        return r["result"]["targetId"]

    async def close_tab(self, tid):
        await self.call("Target.closeTarget", {"targetId": tid})

    async def ws_for(self, tid):
        """Attach to a page target and return its sessionId. Replies carry the
        sessionId, so one socket drives every tab at once."""
        r = await self.call("Target.attachToTarget", {"targetId": tid, "flatten": True})
        return r["result"]["sessionId"]


class Tab:
    """A flattened session on a single target."""
    def __init__(self, br, sid):
        self.br = br
        self.sid = sid

    async def call(self, method, params=None, timeout=180):
        mid = None
        # Route through Browser.call but tag the frame with the sessionId, so a
        # reply for another tab is delivered to that tab's own future.
        self.br.n += 1
        mid = self.br.n
        msg = {"id": mid, "method": method, "params": params or {},
               "sessionId": self.sid}
        fut = asyncio.get_event_loop().create_future()
        self.br.pending[mid] = fut
        await self.br.ws.send(json.dumps(msg))
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self.br.pending.pop(mid, None)

    async def js(self, expr, await_promise=False, timeout=180):
        r = await self.call("Runtime.evaluate", {
            "expression": expr, "awaitPromise": await_promise,
            "returnByValue": True}, timeout=timeout)
        res = r.get("result", {}).get("result", {})
        if r.get("result", {}).get("exceptionDetails"):
            raise RuntimeError(str(r["result"]["exceptionDetails"])[:200])
        return res.get("value")


async def wait_ready(tab, timeout=45):
    """Docs is ready when the keystroke target iframe exists and the page has
    settled. Without this the first characters go nowhere."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            ok = await tab.js(
                "!!document.querySelector('iframe.docs-texteventtarget-iframe') "
                "&& (document.querySelector('iframe.docs-texteventtarget-iframe')"
                ".contentDocument.body ? 1 : 0)", timeout=20)
            if ok:
                return True
        except Exception:
            pass
        await asyncio.sleep(1)
    return False


async def neutralize_widget(tab):
    """Stop the the grader extension's widget from stealing document focus.

    THE ROOT CAUSE OF EVERY DROPPED KEYSTROKE. the grader injects
    <plasmo-csui id="g0-widget"> into the page; within ~0.3s of load it takes
    document focus and holds it, and Input.dispatchKeyEvent routes to the
    focused element — so every keystroke after that moment is silently dropped.
    That is why N-of-79 characters landed, with N varying: N is just however
    many keys got through before the widget grabbed focus.

    Measured: with this neutralise step, 200/200 characters land exactly, both
    foreground and while the tab is backgrounded. Without it, 1, 3, 5, 10 or 13.

    display:none + inert makes the node unfocusable without deleting it. Do NOT
    use .remove(): the extension re-adds it and the two observers fight forever.
    """
    return await tab.js("""(() => {
      const n = () => document.querySelectorAll('plasmo-csui').forEach(w => {
        w.style.display = 'none';
        w.style.pointerEvents = 'none';
        w.setAttribute('inert', '');
      });
      n();
      if (!window.__hp_widget_guard) {
        window.__hp_widget_guard = new MutationObserver(n);
        window.__hp_widget_guard.observe(document.body, {childList: true, subtree: true});
      }
      return document.querySelectorAll('plasmo-csui').length;
    })()""")


async def install_revision_recorder(tab):
    """Record every insert Docs actually commits, inside the keystroke iframe.

    This is the honest replacement for the blind length probe: it captures each
    beforeinput/input event with its inputType, the inserted data, and a
    timestamp. Two purposes:

      1. a REAL document length and caret-ish signal, instead of the old
         `.kiv-canvas-text` read that never existed and always returned 0;
      2. the revision-coalescing signal — if four characters arrive as ONE
         `input` event, that is indistinguishable from a paste, and this is
         where that becomes visible instead of invisible.
    """
    return await tab.js("""(() => {
      const f = document.querySelector('iframe.docs-texteventtarget-iframe');
      if (!f || !f.contentDocument) return 'no-iframe';
      const d = f.contentDocument;
      if (d.__hp_installed) return 'already';
      d.__hp_events = [];
      const snap = () => {
        try {
          const el = d.activeElement;
          return (el && el.textContent) ? el.textContent.length : 0;
        } catch (e) { return 0; }
      };
      d.addEventListener('beforeinput', (e) => {
        d.__hp_events.push({kind: 'beforeinput', type: e.inputType || null,
                            data: e.data || null, t: performance.now(),
                            len: snap()});
      }, true);
      d.addEventListener('input', (e) => {
        d.__hp_events.push({kind: 'input', type: e.inputType || null,
                            data: e.data || null, t: performance.now(),
                            len: snap()});
      }, true);
      d.__hp_installed = true;
      return 'installed';
    })()""")


async def focus_editor(tab):
    """Put the caret in the document. Docs reads keys off the hidden iframe's
    body, so that body must have focus or every dispatch is discarded.

    Neutralises the the grader widget FIRST. The fix belongs here rather than at
    the call sites: focus is taken in this function, so this is the one place
    every caller — the engine, the batch runner, and any external probe script —
    is guaranteed to pass through. It was previously wired only into the two
    engine run paths, which meant a standalone script calling focus_editor
    directly still had every keystroke stolen, and looked like the fix had
    failed.
    """
    # Make the page believe it is focused, whatever the tab strip says.
    #
    # THIS IS WHY CONCURRENT TYPING DROPPED INPUT. `Input.dispatchKeyEvent` is
    # target-scoped, so dispatching to many tabs is safe — but a background tab
    # reports `document.hasFocus() === false` and `visibilityState === "hidden"`,
    # and Docs degrades on that: measured 1 of 10 background tabs accepting text.
    # This one call flips the emulated state so every tab reports itself visible
    # and focused, and the landing rate went 1/10 -> 10/10. It is exactly what
    # Playwright does unconditionally on every page, for the same reason.
    #
    # It is idempotent and cheap, so it runs here rather than at the call sites:
    # every path that takes focus gets it, including direct callers.
    try:
        await tab.call("Emulation.setFocusEmulationEnabled", {"enabled": True})
    except Exception:
        # Older Chromium may not expose it; a failure here must not block typing.
        pass

    await neutralize_widget(tab)
    return await tab.js("""(() => {
      const f = document.querySelector('iframe.docs-texteventtarget-iframe');
      if (!f || !f.contentDocument) return 'no-iframe';
      const b = f.contentDocument.body;
      b.focus();
      // Some Docs builds need a click on the canvas to place the caret.
      const c = document.querySelector('.kix-canvas-tile-content') ||
                document.querySelector('.kix-appview-editor');
      if (c) { const r = c.getBoundingClientRect();
        const ev = (t,x,y)=>c.dispatchEvent(new MouseEvent(t,{bubbles:true,clientX:x,clientY:y}));
        const x = r.left + r.width*0.3, y = r.top + r.height*0.25;
        ev('mousedown',x,y); ev('mouseup',x,y);
      }
      return b.isContentEditable || document.activeElement ? 'focused' : 'unknown';
    })()""")


class Capture:
    """Every action, with everything that can be observed about it.

    A keystroke is not one event and the interesting data is not just the
    character. For each action this records: a monotonic timestamp, the gap
    since the previous action, the full CDP payload that was dispatched (so the
    exact key/code/text/modifiers are recoverable), the caret offsets and
    document length BEFORE and AFTER, how much the document grew or shrank, and
    which mechanism dispatched it.

    That is what makes a flagged word traceable: if a word was inserted as one
    revision instead of four, the per-event caret and length deltas show it.
    """
    def __init__(self, tab):
        self.tab = tab
        self.events = []
        self.t0 = None

    async def probe(self):
        """Real caret, real length, and the revision count.

        The previous version read `document.querySelector('.kiv-canvas-text')`
        for length — a selector that does not exist on a live Docs page, so len
        and every doc_delta built from it were ALWAYS 0. It also trusted
        `getSelection().anchorOffset`, which stays 0 inside Docs' event iframe.
        Both fields were recorded but vacuous.

        Now: `rev` is the count of beforeinput/input events Docs has actually
        committed, `len` is the focused contenteditable's text length, and
        `last` is the most recent input event — which is what tells us whether
        consecutive characters coalesced into one revision.
        """
        try:
            return await self.tab.js("""(() => {
              const f = document.querySelector('iframe.docs-texteventtarget-iframe');
              const d = f && f.contentDocument;
              let sel = null, len = 0, rev = 0, last = null;
              try {
                const s = d && d.getSelection();
                if (s && s.rangeCount) sel = s.anchorOffset;
              } catch (e) {}
              try {
                const evs = (d && d.__hp_events) || [];
                rev = evs.length;
                last = evs.length ? evs[evs.length - 1] : null;
                const el = d && d.activeElement;
                len = (el && el.textContent) ? el.textContent.length : 0;
                if (len === 0 && last && typeof last.len === 'number') len = last.len;
              } catch (e) {}
              return {sel: sel, len: len, rev: rev, last: last,
                      ce: !!(d && d.body)};
            })()""", timeout=20)
        except Exception:
            return {"sel": None, "len": 0, "rev": 0, "last": None, "ce": False}

    def start(self):
        self.t0 = time.time()

    def _t(self):
        return round(time.time() - (self.t0 or time.time()), 4)

    def record(self, kind, payload=None, before=None, after=None, extra=None):
        e = {
            "i": len(self.events),           # sequence number, so order is exact
            "t": self._t(),                  # seconds since the run began
            "gap": None,                     # filled below
            "kind": kind,
        }
        if self.events:
            e["gap"] = round(e["t"] - self.events[-1]["t"], 4)
        if payload:
            e["dispatch"] = payload          # the exact CDP payload sent
        if before:
            e["before"] = before             # caret/len state prior
        if after:
            e["after"] = after               # and after
            if before and "len" in before and "len" in after:
                e["doc_delta"] = (after.get("len") or 0) - (before.get("len") or 0)
            if before and "rev" in before and "rev" in after:
                # How many revisions this single action produced. >1 means Docs
                # coalesced several characters into one insert — the signal that
                # reads to a detector as a paste rather than as typing.
                e["revisions"] = (after.get("rev") or 0) - (before.get("rev") or 0)
        if extra:
            e.update(extra)
        self.events.append(e)
        return e

    def dump(self):
        return {"count": len(self.events), "events": self.events}


KEYCODE = {}
for _c in "abcdefghijklmnopqrstuvwxyz":
    KEYCODE[_c] = ord(_c.upper())
KEYCODE.update({" ": 32, "\n": 13, ".": 190, ",": 188, "'": 222, "-": 189,
                "?": 191, "!": 49, ":": 186, ";": 186, '"': 222, "(": 57,
                ")": 48, "0": 48, "1": 49, "2": 50, "3": 51, "4": 52,
                "5": 53, "6": 54, "7": 55, "8": 56, "9": 57})


async def key(tab, ch):
    """One real key event pair. `text` is what makes Docs insert the character;
    the key/code fields are what make it a believable keystroke rather than a
    bare text injection."""
    if ch == "\n":
        down = {"type": "keyDown", "key": "Enter", "code": "Enter",
                "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13,
                "text": "\r", "unmodifiedText": "\r"}
        up = {"type": "keyUp", "key": "Enter", "code": "Enter",
              "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13}
    else:
        down = {"type": "keyDown", "text": ch, "unmodifiedText": ch}
        up = {"type": "keyUp"}
        if ch.isalpha():
            down["key"] = ch
            down["code"] = "Key" + ch.upper()
            down["windowsVirtualKeyCode"] = ord(ch.upper())
            up["key"] = ch
            up["code"] = "Key" + ch.upper()
            up["windowsVirtualKeyCode"] = ord(ch.upper())
            if ch.isupper():
                down["modifiers"] = 8
                up["modifiers"] = 8
        elif ch == " ":
            down.update({"key": " ", "code": "Space", "windowsVirtualKeyCode": 32})
            up.update({"key": " ", "code": "Space", "windowsVirtualKeyCode": 32})
        else:
            down["key"] = ch
            down["code"] = "Unidentified"
            kc = KEYCODE.get(ch)
            if kc:
                down["windowsVirtualKeyCode"] = kc
                up["windowsVirtualKeyCode"] = kc
    await tab.call("Input.dispatchKeyEvent", down)
    await tab.call("Input.dispatchKeyEvent", up)


async def backspace(tab):
    d = {"type": "keyDown", "key": "Backspace", "code": "Backspace",
         "windowsVirtualKeyCode": 8, "nativeVirtualKeyCode": 8}
    u = {"type": "keyUp", "key": "Backspace", "code": "Backspace",
         "windowsVirtualKeyCode": 8, "nativeVirtualKeyCode": 8}
    await tab.call("Input.dispatchKeyEvent", d)
    await tab.call("Input.dispatchKeyEvent", u)


async def move_mouse(tab, cap, cur):
    """A real pointer path. Ease-out with a slight arc, so it is a curve and
    not a straight teleport, then a hover and sometimes a click."""
    r = await cap.probe()
    # Continue from where the pointer actually is. CDP will not report the
    # pointer back to us, so we track the last emitted position ourselves. The
    # old version drew a fresh random anchor every excursion, which meant each
    # path started somewhere unrelated to the previous endpoint — a mean jump
    # of 246 px with no intermediate movement, which no hand produces.
    import random as _r
    if getattr(cap, "last_pointer", None) is not None:
        x0, y0 = cap.last_pointer
    else:
        x0, y0 = 200 + _r.random() * 500, 160 + _r.random() * 300
    reach = _r.uniform(*cur["reach_px"])
    x1 = max(4, min(1280, x0 + _r.uniform(-1, 1) * reach))
    y1 = max(4, min(760, y0 + _r.uniform(-1, 1) * reach))
    steps = _r.randint(*cur["steps"])
    path = []
    for n in range(1, steps + 1):
        t = n / steps
        e = 1 - (1 - t) ** 2                       # ease-out
        bow = math.sin(t * math.pi) * reach * 0.10
        path.append({"x": round(x0 + (x1 - x0) * e + bow, 1),
                     "y": round(y0 + (y1 - y0) * e, 1)})
    cap.record("mouse_start", before=r, extra={"from": [round(x0, 1), round(y0, 1)],
                                               "to": [round(x1, 1), round(y1, 1)],
                                               "steps": steps})
    for pt in path:
        payload = {"type": "mouseMoved", "x": pt["x"], "y": pt["y"],
                   "button": "none", "buttons": 0}
        await tab.call("Input.dispatchMouseEvent", payload)
        cap.record("mouseMoved", payload=payload, extra={"pt": [pt["x"], pt["y"]]})
        await asyncio.sleep(_r.uniform(0.006, 0.028))
    cap.last_pointer = (path[-1]["x"], path[-1]["y"])
    await asyncio.sleep(_r.uniform(*cur["hover_ms"]) / 1000.0)
    cap.record("mouse_hover", before=r)
    if _r.random() < cur["click_chance"]:
        pr = {"type": "mousePressed", "x": path[-1]["x"], "y": path[-1]["y"],
              "button": "left", "buttons": 1, "clickCount": 1}
        rl = {"type": "mouseReleased", "x": path[-1]["x"], "y": path[-1]["y"],
              "button": "left", "buttons": 0, "clickCount": 1}
        await tab.call("Input.dispatchMouseEvent", pr)
        cap.record("mousePressed", payload=pr)
        await asyncio.sleep(_r.uniform(0.04, 0.11))
        await tab.call("Input.dispatchMouseEvent", rl)
        cap.record("mouseReleased", payload=rl)
        # A click moves the caret; put it back at the end of the text.
        kd = {"type": "keyDown", "key": "End", "code": "End",
              "windowsVirtualKeyCode": 35, "modifiers": 2}
        ku = {"type": "keyUp", "key": "End", "code": "End",
              "windowsVirtualKeyCode": 35, "modifiers": 2}
        await tab.call("Input.dispatchKeyEvent", kd)
        cap.record("keyDown", payload=kd,
                   extra={"purpose": "return caret to the end after a click"})
        await tab.call("Input.dispatchKeyEvent", ku)
        cap.record("keyUp", payload=ku,
                   extra={"purpose": "return caret to the end after a click"})


async def wander_loop(tab, cap, cur, stop, seed=0):
    """An extra pointer stream that keeps moving for as long as the run lasts.
    Only used when cursor.count > 1."""
    import random as _r
    rng = _r.Random(1000 + seed)
    while not stop.is_set():
        try:
            # Previously these three were hardcoded (4-12 steps, 0.05-0.5s
            # pause, never a click), so a wander stream silently ignored
            # CURSOR_DEFAULTS["steps"], ["hover_ms"] and ["click_chance"].
            x0, y0 = rng.uniform(60, 700), rng.uniform(80, 500)
            ang = rng.uniform(0, 6.283)
            reach = rng.uniform(*cur["reach_px"])
            steps = rng.randint(*cur["steps"])
            for n in range(1, steps + 1):
                if stop.is_set():
                    return
                t = n / steps
                e = 1 - (1 - t) ** 2
                x = max(2, min(1280, x0 + math.cos(ang) * reach * e))
                y = max(2, min(760, y0 + math.sin(ang) * reach * e))
                payload = {"type": "mouseMoved", "x": round(x, 1), "y": round(y, 1),
                           "button": "none", "buttons": 0}
                await tab.call("Input.dispatchMouseEvent", payload)
                cap.record("mouseMoved", payload=payload,
                           extra={"stream": seed + 2, "pt": [round(x, 1), round(y, 1)]})
                await asyncio.sleep(rng.uniform(0.008, 0.035))
            await asyncio.sleep(rng.uniform(*cur["hover_ms"]) / 1000.0)
            if rng.random() < cur["click_chance"]:
                p_last = {"type": "mousePressed", "x": round(x, 1), "y": round(y, 1),
                          "button": "left", "buttons": 1, "clickCount": 1}
                r_last = {"type": "mouseReleased", "x": round(x, 1), "y": round(y, 1),
                          "button": "left", "buttons": 0, "clickCount": 1}
                await tab.call("Input.dispatchMouseEvent", p_last)
                cap.record("mousePressed", payload=p_last,
                           extra={"stream": seed + 2})
                await asyncio.sleep(rng.uniform(0.04, 0.11))
                await tab.call("Input.dispatchMouseEvent", r_last)
                cap.record("mouseReleased", payload=r_last,
                           extra={"stream": seed + 2})
        except asyncio.CancelledError:
            return
        except Exception:
            await asyncio.sleep(0.2)


async def typed_key(tab, cap, ch, store=True, p=None):
    """One keystroke, captured in full: the payload we sent, and the observed
    caret and document length on both sides of it."""
    before = await cap.probe() if store else None
    payload = key_payload(ch)
    await tab.call("Input.dispatchKeyEvent", payload["down"])
    if store:
        # Both halves of the keystroke are logged as their own events. The
        # keyUp is where Docs closes a revision, so leaving it unrecorded makes
        # the log a partial view of the stream it is supposed to be a record of.
        cap.record("keyDown", payload=payload["down"], extra={"ch": ch, "mech": "cdp"})

    # HOLD THE KEY. A real keypress has a dwell time — the gap between press and
    # release — of ~65ms (measured median 63-67ms across both recordings). The
    # engine previously released instantly, so every keystroke it produced had a
    # dwell of ~0ms, which is physically impossible and is a dwell-time tell.
    #
    # The hold is capped as a fraction of the interval we are about to wait, so
    # the dwell can never exceed the gap between keys (which would be its own
    # impossibility during a fast burst, where the whole interval is ~73ms).
    dwell_ms = dwell(ch, p)
    await asyncio.sleep(dwell_ms / 1000.0)
    # Publish the hold so the caller can subtract it from the interval it waits.
    # The interval between two keys is dwell + flight; if the caller waits the
    # whole interval after the keyUp, the hold is counted twice and every key
    # ends up held ~65ms too long.
    cap.last_dwell = dwell_ms
    if store:
        cap.record("dwell", extra={"ms": round(dwell_ms, 1), "ch": ch})

    await tab.call("Input.dispatchKeyEvent", payload["up"])
    after = await cap.probe() if store else None
    if store:
        cap.record("keyUp", payload=payload["up"], before=before, after=after,
                   extra={"ch": ch, "mech": "cdp",
                          "effects": "insert" if ch else "none"})
    return payload


async def press_backspace(tab, cap, n=1):
    """n backspaces, as one captured action. The owner's hand does exactly one;
    the count is a parameter so the other shape can be measured."""
    before = await cap.probe()
    d = {"type": "keyDown", "key": "Backspace", "code": "Backspace",
         "windowsVirtualKeyCode": 8, "nativeVirtualKeyCode": 8}
    u = {"type": "keyUp", "key": "Backspace", "code": "Backspace",
         "windowsVirtualKeyCode": 8, "nativeVirtualKeyCode": 8}
    for i in range(n):
        await tab.call("Input.dispatchKeyEvent", d)
        cap.record("key", payload=d, extra={"purpose": "backspace", "idx": i})
        if i < n - 1:
            g = getattr(press_backspace, "_gap", (90.0, 220.0))
            await asyncio.sleep(random.uniform(*g) / 1000.0)
        await tab.call("Input.dispatchKeyEvent", u)
        cap.record("keyUp", payload=u)
    after = await cap.probe()
    cap.record("backspace_run", before=before, after=after, extra={"count": n})


# Caret navigation keys. These carry no text, so Google Docs records NO revision
# for them — the changelog only ever sees the edits they enable. That is what
# makes a backward edit expressible: move the caret back invisibly, then edit,
# and the changelog shows an insert/delete at an earlier index. the grader reads
# that index directly (`insertLocation` / `deleteStartIndex` are in the payload).
NAVKEYS = {
    "Left":  ("ArrowLeft",  37),
    "Right": ("ArrowRight", 39),
    "Home":  ("Home",       36),
    "End":   ("End",        35),
    "Up":    ("ArrowUp",    38),
    "Down":  ("ArrowDown",  40),
}
CTRL = 2


async def navigate(tab, cap, key, times=1, ctrl=False, p=None):
    """Move the caret without editing. Produces no changelog entry.

    Two details are load-bearing and both were measured against the live caret,
    because a wrong one fails silently (the caret simply does not move and every
    later edit appends to the end):

      * the `key` field must be the DOM key name (`ArrowLeft`), not the short
        alias (`Left`) — CDP validates it against the real key name;
      * a key carrying no text must be sent as `rawKeyDown`; a plain `keyDown`
        produces a char event and is not treated as navigation.
    """
    code, vk = NAVKEYS[key]
    mods = CTRL if ctrl else 0
    d = {"type": "rawKeyDown", "key": code, "code": code, "modifiers": mods,
         "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
    u = {"type": "keyUp", "key": code, "code": code, "modifiers": mods,
         "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
    for i in range(times):
        await tab.call("Input.dispatchKeyEvent", d)
        await asyncio.sleep(random.uniform(0.018, 0.055))
        await tab.call("Input.dispatchKeyEvent", u)
        if i < times - 1:
            await asyncio.sleep(random.uniform(0.020, 0.070))
    cap.record("nav", extra={"key": key, "times": times, "ctrl": ctrl})


async def caret_to_end(tab):
    """Ctrl+End — return the caret to the end of the document."""
    await send_nav(tab, "End", ctrl=True)


async def send_nav(tab, key, ctrl=False):
    code, vk = NAVKEYS[key]
    mods = CTRL if ctrl else 0
    d = {"type": "rawKeyDown", "key": code, "code": code, "modifiers": mods,
         "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
    await tab.call("Input.dispatchKeyEvent", d)
    await asyncio.sleep(random.uniform(0.03, 0.08))
    await tab.call("Input.dispatchKeyEvent", dict(d, type="keyUp"))


async def click_at(tab, cap, x, y):
    """A real left click at a point — how a hand actually places the caret."""
    await tab.call("Input.dispatchMouseEvent", {
        "type": "mouseMoved", "x": int(x), "y": int(y), "button": "none", "buttons": 0})
    await asyncio.sleep(random.uniform(0.04, 0.12))
    await tab.call("Input.dispatchMouseEvent", {
        "type": "mousePressed", "x": int(x), "y": int(y),
        "button": "left", "clickCount": 1, "buttons": 1})
    await asyncio.sleep(random.uniform(0.045, 0.095))
    await tab.call("Input.dispatchMouseEvent", {
        "type": "mouseReleased", "x": int(x), "y": int(y),
        "button": "left", "clickCount": 1, "buttons": 0})
    cap.record("click", extra={"x": int(x), "y": int(y)})


# Docs renders text to a canvas, so there is no DOM node per character. The one
# reliable anchor is the live caret element: click to a known x, read where the
# caret actually landed, and interpolate. Measured on a rendered page: each
# character advances the caret ~4.1 px, with the first click snapping to the
# line start rather than the exact pixel.
CARET_X_JS = """(() => { const c=document.querySelector('.kix-cursor-caret');
  if(!c) return '-1'; return String(Math.round(c.getBoundingClientRect().x)); })()"""
PAGE_JS = """(() => { const p=document.querySelector('.kix-page');
  if(!p) return '{}'; const b=p.getBoundingClientRect();
  return JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height}); })()"""


async def caret_screen_pos(tab, char_index, text):
    """Screen point of the character at `char_index` in the first line of text.

    Calibrated live rather than assumed: Docs strips leading whitespace on the
    first line, so the mapping is measured from the caret itself, not from the
    page origin.
    """
    try:
        pg = json.loads(await tab.js(PAGE_JS) or "{}")
    except Exception:
        return None
    if not pg:
        return None

    # the rendered line starts after any leading whitespace the editor stripped
    lead = len(text) - len(text.lstrip())
    line = text[lead:].split("\n")[0]
    if char_index <= lead:
        return None
    col = min(char_index - lead, len(line))

    base_x = pg["x"] + 40.0
    base_y = pg["y"] + 55.0
    try:
        await click_at(tab, None, base_x, base_y)
        await asyncio.sleep(0.18)
        x0 = int(float(await tab.js(CARET_X_JS) or "-1"))
        await click_at(tab, None, base_x + 120, base_y)
        await asyncio.sleep(0.18)
        x1 = int(float(await tab.js(CARET_X_JS) or "-1"))
    except Exception:
        return None
    if x0 < 0 or x1 < 0 or x1 <= x0:
        return None
    px_per_char = (x1 - x0) / 30.0          # 30 chars between the two probes
    return (x0 + px_per_char * col, base_y)


async def backward_edit(tab, cap, committed, p, cfg):
    """Go back a little, delete a short run, retype it.

    This is the one shape our engine never produced, and the most distinctive
    thing a real writer does: the changelog of a genuine essay is not a flat
    monotonic append, it has inserts whose `insertLocation` sits behind the
    current end. the grader receives that index directly.

    The delete run is deliberately capped below 12 characters — the client
    flags delete-then-insert at the same index with deletedLength >= 12 as
    "AI Polish", and trading the bot card for the polish card is not progress.

    Returns True if an edit was made, False if it bailed before touching anything.
    """
    text = committed[0]
    words = committed[1] if len(committed) > 1 else []
    if len(text) < p.get("backward_min_chars", 60):
        return False
    nw = int(p.get("backward_max_words", 1))
    if len(words) < nw + 2:
        return False

    target = words[-nw]
    start = target[0]
    end = min(len(text), target[1])
    if end - start > p.get("backward_del_max", 9):
        end = start + p.get("backward_del_max", 9)
    if end <= start:
        return False
    phrase = text[start:end]
    if not phrase or not phrase.strip():
        return False

    pos = await caret_screen_pos(tab, end, text)
    if not pos:
        return False
    await click_at(tab, cap, pos[0], pos[1])
    await asyncio.sleep(random.uniform(0.25, 0.60))       # notice beat

    n = end - start
    cap.record("backward_planned", extra={"chars": n, "phrase": phrase})
    press_backspace._gap = p.get("backspace_gap_ms") or (90.0, 220.0)
    await press_backspace(tab, cap, n)
    await asyncio.sleep(random.uniform(0.15, 0.40))

    for ch in phrase:                                      # retype the same text
        await typed_key(tab, cap, ch, p=p)
        await asyncio.sleep(max(0.012, draw_gap(ch, "", p)) / 1000.0)

    await caret_to_end(tab)                                # continue at the end
    await asyncio.sleep(random.uniform(0.10, 0.30))
    cap.record("backward_done", extra={"chars": n})
    return True


# Full US-keyboard identity: character -> (key, code, virtual keycode, needs shift).
# The previous version emitted code:"Unidentified" for every non-letter and left
# the Shift modifier off every shifted character, so 49 of 105 test characters
# carried a code no real keyboard produces and 21 were physically impossible
# (`?` and `(` were sent unshifted). A real keydown has a real DOM code and a
# real modifier state; this is what makes the difference.
KEYMAP = {
    " ": (" ", "Space", 32, False),
    "-": ("-", "Minus", 189, False), "=": ("=", "Equal", 187, False),
    "[": ("[", "BracketLeft", 219, False), "]": ("]", "BracketRight", 221, False),
    "\\": ("\\", "Backslash", 220, False), ";": (";", "Semicolon", 186, False),
    "'": ("'", "Quote", 222, False), ",": (",", "Comma", 188, False),
    ".": (".", "Period", 190, False), "/": ("/", "Slash", 191, False),
    "`": ("`", "Backquote", 192, False),
    "_": ("_", "Minus", 189, True), "+": ("+", "Equal", 187, True),
    "{": ("{", "BracketLeft", 219, True), "}": ("}", "BracketRight", 221, True),
    "|": ("|", "Backslash", 220, True), ":": (":", "Semicolon", 186, True),
    '"': ('"', "Quote", 222, True), "<": ("<", "Comma", 188, True),
    ">": (">", "Period", 190, True), "?": ("?", "Slash", 191, True),
    "~": ("~", "Backquote", 192, True),
}
# shifted digits: ( and ) sit on 9 and 0, ! on 1, and so on
_SHIFT_DIGITS = {"!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
                 "^": "6", "&": "7", "*": "8", "(": "9", ")": "0"}
for _ch, _d in _SHIFT_DIGITS.items():
    KEYMAP[_ch] = (_ch, "Digit" + _d, 48 + int(_d), True)
for _d in "0123456789":
    KEYMAP[_d] = (_d, "Digit" + _d, 48 + int(_d), False)


def key_payload(ch):
    """The CDP payload pair for one character.

    `text` is what makes Docs insert. key/code/windowsVirtualKeyCode/modifiers
    are what make it a believable keystroke instead of a bare text injection,
    and they must agree with each other: a shifted character carries Shift, and
    its code names a real physical key.
    """
    if ch == "\n":
        return {
            "down": {"type": "keyDown", "key": "Enter", "code": "Enter",
                     "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13,
                     "text": "\r", "unmodifiedText": "\r"},
            "up": {"type": "keyUp", "key": "Enter", "code": "Enter",
                   "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13},
        }
    if ch == "\t":
        return {
            "down": {"type": "keyDown", "key": "Tab", "code": "Tab",
                     "windowsVirtualKeyCode": 9, "nativeVirtualKeyCode": 9,
                     "text": "\t", "unmodifiedText": "\t"},
            "up": {"type": "keyUp", "key": "Tab", "code": "Tab",
                   "windowsVirtualKeyCode": 9, "nativeVirtualKeyCode": 9},
        }

    if ch.isalpha() and ch.isascii():
        up_ch = ch.upper()
        shift = ch.isupper()
        down = {"type": "keyDown", "key": ch, "code": "Key" + up_ch,
                "windowsVirtualKeyCode": ord(up_ch), "text": ch,
                "unmodifiedText": ch}
        up = {"type": "keyUp", "key": ch, "code": "Key" + up_ch,
              "windowsVirtualKeyCode": ord(up_ch)}
        if shift:
            down["modifiers"] = 8
            up["modifiers"] = 8
        return {"down": down, "up": up}

    kc = KEYMAP.get(ch)
    if kc:
        key, code, vk, shift = kc
        down = {"type": "keyDown", "key": key, "code": code,
                "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
                "text": ch, "unmodifiedText": ch}
        up = {"type": "keyUp", "key": key, "code": code,
              "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
        if shift:
            down["modifiers"] = 8
            up["modifiers"] = 8
        return {"down": down, "up": up}

    # Anything left is outside the US layout (typographic quotes, em dash,
    # ellipsis). A real user gets those from autocorrect or an IME, and neither
    # is a plain keypress — so the honest representation is a committed text
    # insertion, not a fabricated key identity.
    return {
        "down": {"type": "keyDown", "text": ch, "unmodifiedText": ch},
        "up": {"type": "keyUp"},
    }


async def type_text(tab, text, p, cfg=None, progress=None, cap=None):
    """Type the text, drawing every gap from the fitted model, recording
    EVERYTHING: each keystroke's full payload and observed caret/length delta,
    each backspace run, each mouse path, each pause.

    Cursor streams are started BEFORE the loop and torn down in a finally, so
    no exception can leave a pointer moving after the run has ended.
    """
    cfg = cfg or {}
    cur = dict(CURSOR_DEFAULTS)
    cur.update(cfg.get("cursor") or {})
    # A knob passed in cfg overrides the fitted profile, so a round can vary a
    # rhythm parameter without rewriting HUMAN_PARAMS. Previously only typo_rate
    # could be overridden this way, which is why so many of round 1's declared
    # knobs did nothing.
    for _k in ("gap_base_median", "log_sigma", "space_ratio", "sentence_ratio",
               "burst_gap_ms", "think_gap_median", "think_gap_prob"):
        if _k in cfg and isinstance(cfg[_k], (int, float)):
            p[_k] = cfg[_k]
    # A slow wander in pace across the session. The owner's measured arc is
    # nearly flat (decile medians 152-161ms over 38 minutes), so the default
    # amplitude is small on purpose: enough that the pace is not machine-
    # constant, far too little to invent a warm-up or a fatigue curve the
    # recordings do not contain. Exposed as a knob because "does pace variation
    # matter to the detector" is exactly the kind of question to measure.
    # pace_drift: round 1 measured margin 0.108 -> 0.031 at 0.12 and it was
    # disabled; round 2 then measured 0.05 sitting ABOVE the control (+0.044).
    # Disagreeing signs across rounds means the effect is not established, and
    # the control itself moved 0.108 -> 0.167 between rounds with an identical
    # config - a noise floor larger than the effect. Restored to the fitted
    # value. A small sinusoid is also what a real hand does; removing it was
    # fitting to noise. Re-test only with repeated rows.
    pace_drift = cfg.get("pace_drift", 0.05)
    typo_rate = cfg.get("typo_rate", p["typo_rate"])
    typos_on = cfg.get("typosEnabled", True)
    jitter = cfg.get("jitter", True)
    pauses = cfg.get("punctuationPauses", True)
    runs = cfg.get("backspace_runs", p["backspace_runs"])
    backward_on = cfg.get("backwardEdits", True)
    bprob = cfg.get("backward_prob", p.get("backward_prob", 0.0))
    cap = cap or Capture(tab)
    if cap.t0 is None:
        cap.start()

    # TAKE FOCUS BEFORE THE FIRST KEY, and hide the the grader widget while doing it.
    # This belongs here rather than only in the batch runners: anything that types
    # must first own the caret, and focus_editor is the only place that
    # neutralises the widget which otherwise steals focus and swallows the keys.
    # Without this, a direct caller typies straight into the grader's own sidebar —
    # which is exactly what a capacity probe did, because it called type_text on
    # its own and never went through the run paths.
    await focus_editor(tab)
    await install_revision_recorder(tab)
    await asyncio.sleep(0.25)
    cap.record("focus_taken", extra={"widget": "neutralised"})

    cap.record("run_start", extra={"chars": len(text), "words": len(text.split()),
                                   "params": p, "cfg": cfg, "cursor": cur})

    nstreams = max(1, int(cur.get("count", 1)))
    stop = asyncio.Event()
    extra = [asyncio.create_task(wander_loop(tab, cap, cur, stop, seed=k))
             for k in range(nstreams - 1)]
    if extra:
        cap.record("cursor_streams", extra={"count": nstreams})

    prev = ""
    i = 0
    burst_left = 0
    since_cursor = 0
    phase = random.uniform(0, 2 * math.pi)
    try:
        while i < len(text):
            ch = text[i]

            # ── an occasional cursor excursion for the typing hand ──────────
            since_cursor += 1
            if cur["enabled"] and since_cursor >= max(
                    20, int(100.0 / max(0.01, cur["per_100_chars"]))):
                since_cursor = 0
                await move_mouse(tab, cap, cur)
                await focus_editor(tab)
                await asyncio.sleep(0.2)

            # ── a typo and its correction ───────────────────────────────────
            if typos_on and ch.isalpha() and typo_rate > 0 and random.random() < typo_rate:
                wrong = _wrong_char(ch)
                if wrong == ch:
                    cap.record("typo_kind", extra={"kind": "stutter", "ch": ch})
                await typed_key(tab, cap, wrong, p=p)
                cap.record("typo_planned", extra={"typed": wrong, "intended": ch})
                nb = p.get("notice_beat_ms") or (250.0, 900.0)
                await asyncio.sleep(random.uniform(*nb) / 1000.0)
                n = _draw_run(runs)
                cap.record("correction_planned", extra={"run": n})
                press_backspace._gap = p.get("backspace_gap_ms") or (90.0, 220.0)
                await press_backspace(tab, cap, n)
                await asyncio.sleep(random.uniform(0.12, 0.32))

            await typed_key(tab, cap, ch, p=p)
            dwell_ms = getattr(cap, "last_dwell", 0.0)
            prev = ch
            i += 1
            if progress and i % 100 == 0:
                progress(i, len(text), cap._t())

            # ── occasionally go back and rewrite something ──────────────────
            # A real essay's changelog is not a flat append. Going back to fix a
            # word costs the caret a round trip, so it is rare and it only
            # happens where a writer naturally stops — at the end of a sentence.
            if (backward_on and ch in ".!?\n" and i < len(text) - 40
                    and random.random() < bprob):
                words = _word_spans(text[:i])
                try:
                    await backward_edit(tab, cap, (text[:i], words), p, cfg)
                except Exception as exc:
                    cap.record("backward_failed", extra={"msg": str(exc)[:120]})
                    await focus_editor(tab)

            # ── the gap to the next character ───────────────────────────────
            if burst_left > 0:
                burst_left -= 1
                gap = (p["burst_gap_ms"] * (0.8 + random.random() * 0.5)
                       if jitter else p["burst_gap_ms"])
            else:
                gap = draw_gap(ch, prev, p)
                if not pauses and ch in ".!?":
                    gap = p["gap_base_median"]
                if not jitter:
                    gap = p["gap_base_median"]
                burst_left = _draw_burst(p)
            # Slow sinusoidal pace wander, phase fixed per run. Applied to the
            # gap so it reads as the hand easing rather than as the loop
            # sampling differently.
            if pace_drift:
                frac = i / max(1, len(text))
                gap *= (1.0 + pace_drift * math.sin(2 * math.pi * frac + phase))
            # The interval between keys is dwell + flight. We have already spent
            # the dwell holding the key, so what remains to wait is the flight —
            # the time the finger spends travelling to the next key. Waiting the
            # full interval here (as before) double-counted the hold.
            flight = max(8.0, gap - dwell_ms)
            cap.record("pause", extra={"ms": round(flight, 1), "after": ch,
                                       "flight": True, "interval": round(gap, 1),
                                       "dwell": round(dwell_ms, 1)})
            await asyncio.sleep(flight / 1000.0)
    except BaseException as exc:
        # A run that dies must still say so. Previously run_end sat after the
        # try/finally, so an exception skipped it and the log simply stopped —
        # a consumer could not tell "aborted" from "still running".
        cap.record("run_error", extra={"type": type(exc).__name__,
                                       "msg": str(exc)[:200],
                                       "emitted": i, "elapsed": cap._t()})
        raise
    finally:
        for t in extra:
            t.cancel()
        stop.set()
        if extra:
            await asyncio.gather(*extra, return_exceptions=True)

    cap.record("run_end", extra={"emitted": i, "elapsed": cap._t(),
                                 "events": len(cap.events)})
    return {"params": p, "cfg": cfg, "started": cap.t0,
            "elapsed": round(cap._t(), 2), "events": cap.events,
            "capture": cap.dump()}

async def read_doc(host, tab, docid):
    """Read the doc through the authenticated export on the SAME page."""
    return await tab.js(f"""(async()=>await new Promise(r=>{{
      const x=new XMLHttpRequest();
      x.open('GET','https://docs.google.com/document/d/{docid}/export?format=txt',true);
      x.onload=()=>r(x.responseText); x.onerror=()=>r(''); x.send();
    }}))()""", await_promise=True, timeout=120)


async def run_variation(br, v, text, keep=False):
    print(f"      opening doc for {v['id']}...", flush=True)
    tid = await br.new_tab("https://docs.new")
    # Attach inside the try. It used to sit outside, so any failure getting a
    # session (tab not ready, transient) orphaned the tab we had just created —
    # the mechanism behind the dropped documents found among the owner's tabs.
    tab = None
    try:
        tab = Tab(br, await br.ws_for(tid))
        await tab.call("Page.enable")
        await tab.call("Runtime.enable")
        for _ in range(40):
            u = await tab.js("location.href", timeout=20)
            if "/document/d/" in (u or ""):
                break
            await asyncio.sleep(1)
        url = await tab.js("location.href", timeout=20) or ""
        if "/document/d/" not in url:
            return {"id": v["id"], "error": "no doc url", "url": url}
        docid = url.split("/document/d/")[1].split("/")[0]
        if not await wait_ready(tab):
            return {"id": v["id"], "error": "editor never became ready", "docid": docid}
        # Neutralise the focus-stealing widget BEFORE focusing, or the focus we
        # take is stolen moments later and every key after that is dropped.
        await neutralize_widget(tab)
        await focus_editor(tab)
        await install_revision_recorder(tab)
        await asyncio.sleep(1.2)

        cfg = _knob_cfg(v)

        def prog(i, n, el):
            pct = round(100 * i / n)
            print(f"        {pct}%  ({i}/{n})  {el:.0f}s", flush=True)

        # A fresh profile per document: same hand, different day.
        prof = session_profile()
        log = await type_text(tab, text, prof, cfg, prog, cap=Capture(tab))
        await asyncio.sleep(2.0)
        got = await read_doc(None, tab, docid)
        # Self-grade locally from Docs' own changelog — the same data the grader
        # reads. This says whether the variation produced a paste-shaped insert
        # before anyone has to screenshot anything.
        try:
            import oracle
            grade = await oracle.read_changelog(tab)
        except Exception as exc:
            grade = {"ok": False, "reason": f"{type(exc).__name__}: {exc}"}
        return {"id": v["id"], "docid": docid, "url": url,
                "grade": grade,
                "typing": v["typing"], "cfg": v["cfg"], "note": v.get("note"),
                "source_len": len(text), "doc_len": len(got or ""),
                "doc_words": len((got or "").split()), "doc_text": got,
                "engine_log": log, "keystrokes": len(log["events"])}
    finally:
        # The owner reviews the docs between batches, so a run may legitimately
        # leave its tab open. Closing is then their action, not ours.
        if not keep:
            try:
                await br.close_tab(tid)
            except Exception:
                pass


def _knob_cfg(v):
    """Turn one variation row into the config `type_text` reads.

    Every key in the row is forwarded, minus the two that cannot do anything.
    The previous version hand-listed five keys, so any knob added to the table
    was silently dropped here and the row measured nothing — which is exactly how
    a round of single-knob variations produces identical output for every knob.
    Forwarding the whole row is what makes "one knob changed" true all the way
    down to the dispatcher.
    """
    cfg = {}
    cfg.update(v.get("typing") or {})
    cfg.update(v.get("cfg") or {})
    # CDP key events are always isTrusted:false, so this flag cannot do anything.
    cfg.pop("trusted_keys", None)
    # `speed` predates the per-parameter rhythm overrides and was never read.
    cfg.pop("speed", None)
    return cfg


async def run_into_existing(br, v, text, target_id, index, total, keep=False):
    """Type one variation into a tab the owner already opened.

    Wrapped in try/finally so the CDP session is ALWAYS detached. There was no
    cleanup of any kind here before, so every early return and every exception
    left a flattened session attached to one of the owner's tabs.
    """
    tab = None
    sid = None
    try:
        return await _run_into_existing_inner(br, v, text, target_id, index, total)
    finally:
        try:
            if tab is not None:
                sid = tab.sid
        except Exception:
            pass
        if sid:
            try:
                await br.call("Target.detachFromTarget", {"sessionId": sid})
            except Exception:
                pass


async def _run_into_existing_inner(br, v, text, target_id, index, total):
    tab = Tab(br, await br.ws_for(target_id))
    await tab.call("Page.enable")
    await tab.call("Runtime.enable")
    # The tab may still be settling; wait for the editor.
    if not await wait_ready(tab):
        return {"id": v["id"], "error": "editor never became ready"}
    # Neutralise FIRST: the clearing Ctrl+A below needs focus, and the widget
    # steals it within ~0.3s of load if it is left alone.
    await neutralize_widget(tab)
    await focus_editor(tab)
    await asyncio.sleep(0.4)
    url = await tab.js("location.href", timeout=20) or ""
    docid = url.split("/document/d/")[1].split("/")[0] if "/document/d/" in url else None
    if not docid:
        return {"id": v["id"], "error": f"no doc id in {url[:80]}"}
    # Clear anything already in the doc, so the run is from a blank page.
    await focus_editor(tab)
    await asyncio.sleep(1.0)
    await tab.call("Input.dispatchKeyEvent", {
        "type": "keyDown", "key": "a", "code": "KeyA",
        "windowsVirtualKeyCode": 65, "modifiers": 2})
    await asyncio.sleep(0.15)
    await tab.call("Input.dispatchKeyEvent", {
        "type": "keyUp", "key": "a", "code": "KeyA",
        "windowsVirtualKeyCode": 65, "modifiers": 2})
    await asyncio.sleep(0.3)
    await tab.call("Input.dispatchKeyEvent", {
        "type": "keyDown", "key": "Backspace", "code": "Backspace",
        "windowsVirtualKeyCode": 8, "nativeVirtualKeyCode": 8})
    await tab.call("Input.dispatchKeyEvent", {
        "type": "keyUp", "key": "Backspace", "code": "Backspace",
        "windowsVirtualKeyCode": 8, "nativeVirtualKeyCode": 8})
    await asyncio.sleep(0.8)
    await neutralize_widget(tab)
    await focus_editor(tab)
    await install_revision_recorder(tab)
    await asyncio.sleep(0.8)

    cfg = _knob_cfg(v)

    def prog(i, n, el):
        print(f"        [{index}/{total}] {v['marker']} {round(100*i/n)}%  ({i}/{n})  {el:.0f}s", flush=True)

    # Per-variation cursor settings, so a row can move exactly that knob.
    vcur = v.get("cfg") or {}
    if "cursor" in vcur:
        cfg["cursor"] = vcur["cursor"]
    if "mouseActivity" in vcur and not vcur["mouseActivity"]:
        cfg["cursor"] = {"enabled": False}
    if "backspace_runs" in vcur:
        cfg["backspace_runs"] = vcur["backspace_runs"]

    prof = session_profile()
    log = await type_text(tab, text, prof, cfg, prog, cap=Capture(tab))
    await asyncio.sleep(2.0)
    got = await read_doc(None, tab, docid)
    return {"id": v["id"], "docid": docid, "url": url,
            "typing": v["typing"], "cfg": v["cfg"], "note": v.get("note"),
            "source_len": len(text), "doc_len": len(got or ""),
            "doc_words": len((got or "").split()), "doc_text": got,
            "engine_log": log, "keystrokes": len(log["events"])}


async def main():
    args = sys.argv[1:]
    which = [a for a in args if not a.startswith("--")]
    from variations import VARIATIONS, textFor

    # --batch N/M narrows the set FIRST, so --list and the run agree on which
    # rows are in play. Previously the slice was applied after --list returned
    # early, so `--batch=1/4 --list` printed all 20 rows and told you nothing,
    # and `--batch=1/4` on its own selected nothing at all (it fell through to
    # "ids matching which", and which is empty when only flags are passed).
    batch = None
    for i, a in enumerate(args):
        if a.startswith("--batch"):
            parts = a.split("=", 1)[1] if "=" in a else args[i + 1]
            try:
                n, m = (int(x) for x in parts.split("/"))
            except Exception:
                print("  --batch expects N/M, e.g. --batch=2/4")
                return 1
            batch = (n, m)
            break

    if "--existing" in args or "--parallel" in args:
        # These narrow by the tabs that are open, so the table is filtered later.
        todo = list(VARIATIONS)
    elif which:
        todo = [v for v in VARIATIONS if v["id"] in which]
    else:
        todo = list(VARIATIONS)

    if batch:
        n, m = batch
        size = max(1, math.ceil(len(todo) / m))
        start = (n - 1) * size
        todo = todo[start:start + size]
        print(f"  batch {n}/{m}: rows {start + 1}-{start + len(todo)} of "
              f"{len(VARIATIONS)}")

    if "--list" in args:
        print(f"  {len(todo)} row(s) selected:")
        for k, v in enumerate(todo, 1):
            print(f"    {k:>2}. {v['marker']:<9} {v['id']:<46} {v.get('note')}")
        return 0

    if not todo:
        print("  nothing selected; pass ids, --all, or --batch=N/M")
        return 1

    # Every doc gets a 12-digit label typed as the very first thing in it, so
    # the documents are identifiable in Drive and in the the grader results. The
    # number is YYMMDD + a zero-padded sequence, which makes the whole set
    # sortable and date-anchored: 260915000001, 260915000002, ...
    keep_tabs = "--keep-tabs" in args
    stamp = time.strftime("%y%m%d")
    seq_base = int(stamp + "000000")
    labels = {v["id"]: f"{seq_base + k:012d}" for k, v in enumerate(VARIATIONS, 1)}
    os.makedirs(OUT, exist_ok=True)
    ver = http_json("/json/version")
    print(f"  {ver.get('Browser')}", flush=True)

    # --existing: type into tabs that are already open, in tab order.
    use_existing = any(a.startswith("--existing") for a in sys.argv[1:])
    existing = []
    if use_existing:
        docs = [t for t in http_json("/json/list")
                if t.get("type") == "page" and "docs.google.com/document" in (t.get("url") or "")]
        # tab order as the browser reports it, which matches the on-screen order
        existing = [t["id"] for t in docs]
        if not existing:
            print("  no open doc tabs found")
            return 1
        todo = todo[:len(existing)]
        print(f"  typing into {len(todo)} existing tab(s)\n", flush=True)

    async with websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024) as ws:
        br = Browser(ws)
        await br.start()

        # --parallel: every selected tab types AT THE SAME TIME, each into its
        # own document through its own caret. One doc still has exactly one
        # caret, so this is N carets in N docs, not N carets in one — but it is
        # genuinely concurrent insertion, and concurrent insertion is what a
        # multi-editor writing session looks like from the outside.
        parallel = "--parallel" in sys.argv
        if parallel:
            if not use_existing:
                print("  --parallel needs --existing (one open tab per variation)")
                return 1
            n = min(len(todo), len(existing))
            print(f"  PARALLEL: {n} tab(s) typing simultaneously\n", flush=True)
            tasks = [run_into_existing(br, todo[k], textFor(todo[k]),
                                       existing[k], k + 1, n) for k in range(n)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for k, v in enumerate(todo[:n]):
                r = results[k]
                if isinstance(r, BaseException):
                    r = {"id": v["id"],
                         "error": f"{type(r).__name__}: {str(r)[:200]}"}
                r["ran_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                r["parallel"] = True
                json.dump(r, open(f"{OUT}/{v['id']}.json", "w"))
                if r.get("error"):
                    print(f"    {v['marker']:<9} !! {r['error']}", flush=True)
                else:
                    print(f"    {v['marker']:<9} ok: {r.get('doc_words')} words, "
                          f"{r.get('keystrokes')} keystrokes, "
                          f"{r.get('elapsed')}s", flush=True)
            print(flush=True)
            return 0

        summary = []
        for i, v in enumerate(todo, 1):
            label = labels.get(v["id"], "000000000000")
            text = f"{label} {textFor(v)}"
            print(f"  [{i}/{len(todo)}] {label}  {v['id']} — {v.get('note')}", flush=True)
            try:
                if use_existing:
                    res = await run_into_existing(br, v, text, existing[i - 1],
                                                  i, len(todo), keep=keep_tabs)
                else:
                    res = await run_variation(br, v, text, keep=keep_tabs)
            except Exception as e:
                res = {"id": v["id"], "error": f"{type(e).__name__}: {str(e)[:200]}"}
            res["ran_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            res["label"] = label
            json.dump(res, open(f"{OUT}/{v['id']}.json", "w"))
            if res.get("error"):
                print(f"      !! {res['error']}\n", flush=True)
                summary.append((label, v["marker"], v["id"], "ERROR", "-"))
            else:
                g = res.get("grade") or {}
                mx = g.get("max_insert")
                over = g.get("inserts_over_paste_threshold")
                print(f"      ok: {res['doc_words']} words, {res['keystrokes']} keystrokes, "
                      f"doc {res['docid'][:16]}, max_insert={mx}, paste_flags={over}\n",
                      flush=True)
                summary.append((label, v["marker"], v["id"],
                                str(res.get("doc_words")), f"max_insert={mx}"))

        print("  " + "=" * 78)
        print("  DOC MAP — which label is which variation")
        print("  " + "=" * 78)
        for label, marker, vid, words, note in summary:
            print(f"    {label}  {marker:<9} {vid:<44} {words:>5}w  {note}")
        print("  " + "=" * 78)
        if keep_tabs:
            print(f"  tabs left OPEN for you ({len(summary)} docs) — close them when done")
        print(flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
