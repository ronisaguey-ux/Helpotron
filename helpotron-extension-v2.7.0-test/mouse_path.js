// mouse_path.js — humanlike mouse path generator (agent mode 09-01).
// PURE module: no chrome.*, no DOM — a plain ESM export so it can be
// unit-tested with node directly (and imported by the agent-mode page).
//
// Contract (operator spec, 09-01 — exact numbers):
//   * cubic bezier with TWO control points, offset PERPENDICULAR to the
//     travel line by 8–18% of the distance, alternating side per move,
//   * duration = clamp(260 + dist * 0.35, 300, 950) ms,
//   * ease-in-out progression, + optional ≤3px overshoot at the end,
//   * sampled every ~10–16 ms (no consecutive sample gap > max(40, dist/6)),
//   * at least 4 intermediate points,
//   * first sample AT the start, LAST sample EXACTLY at (toX, toY),
//   * 3% of moves get a micro-adjust settle of 2–6 px (pulled back again).
//
// Each move MUST be keyed from an absolute cursor position; callers that do
// multiple ops chain the endpoint of one path into the start of the next so
// the cursor NEVER teleports (humanlike rule).

/** Uniform random in [lo, hi) — injectable for deterministic tests. */
function _rand(lo, hi, rng) {
  return lo + rng() * (hi - lo);
}

/** Cubic bezier point at t∈[0,1] for p0..p3. */
function _bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Smooth ease-in-out. */
function _easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Build the full sampled path for one humanlike mouse move.
 *
 * @param {number} fromX  absolute cursor x (CSS px)
 * @param {number} fromY  absolute cursor y (CSS px)
 * @param {number} toX    target x (CSS px)
 * @param {number} toY    target y (CSS px)
 * @param {object} [opts] { rng, side } — rng: () => [0,1) for determinism;
 *                         side: +1/-1 to force the perpendicular side
 *                         (alternates automatically when omitted).
 * @returns {Array<{x:number, y:number, t:number}>} samples with strictly
 *          increasing t (ms); [0] == (fromX, fromY) at t=0 and the LAST
 *          sample is exactly (toX, toY) at t=duration.
 */
export function humanMovePoints(fromX, fromY, toX, toY, opts = {}) {
  const rng = opts.rng || Math.random;
  const fx = Number(fromX) || 0;
  const fy = Number(fromY) || 0;
  const tx = Number(toX) || 0;
  const ty = Number(toY) || 0;

  const dx = tx - fx;
  const dy = ty - fy;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.25) {
    // Already there — a single absolute step (exact endpoint, no jump).
    return [{ x: tx, y: ty, t: 0 }];
  }

  const duration = Math.min(950, Math.max(300, 260 + dist * 0.35));

  // Perpendicular unit vector; alternate the side per call (humanlike rule:
  // each move bows to a different side), unless the caller pinned one.
  const nX = (dist > 0 ? -dy / dist : 0);
  const nY = (dist > 0 ? dx / dist : 0);
  let side = opts.side;
  if (side === undefined || side === null) {
    side = rng() < 0.5 ? 1 : -1;
  } else {
    side = side > 0 ? 1 : -1;
  }

  // Control points: 8–18% of distance as perpendicular offset, at 25–40% and
  // 60–78% along the line. The two offsets are re-randomized independently so
  // the bow is never a symmetric arch.
  const off = dist * _rand(0.08, 0.18, rng) * side;
  const u1 = _rand(0.25, 0.40, rng);
  const u2 = _rand(0.60, 0.78, rng);
  const p0 = { x: fx, y: fy };
  const p3 = { x: tx, y: ty };
  const p1 = { x: fx + dx * u1 + nX * off, y: fy + dy * u1 + nY * off };
  const p2 = { x: fx + dx * u2 + nX * off * _rand(0.7, 1.3, rng),
               y: fy + dy * u2 + nY * off * _rand(0.7, 1.3, rng) };

  // Sample cadence: 10–16 ms between samples (each sample may jitter).
  let dt = _rand(10, 16, rng);
  const tGapCap = Math.max(40, dist / 6); // no consecutive gap beyond this
  if (dt > tGapCap) {
    dt = tGapCap; // tiny moves: cadence stays within the no-jump cap
  }

  const points = [{ x: fx, y: fy, t: 0 }]; // EXACT start sample at t=0
  // Force at least 4 intermediate points; step ≈ dur/(n+1) ∈ ~9–16ms.
  const count = Math.max(4, Math.round(duration / dt));
  for (let i = 1; i <= count; i++) {
    const tNorm = i / (count + 1);
    const tms = tNorm * duration;
    const eased = _easeInOut(tNorm);
    const p = _bez(p0, p1, p2, p3, eased);
    points.push({ x: p.x, y: p.y, t: tms });
  }
  // Exact endpoint: last sample is EXACTLY (tx, ty) at t=duration.
  points.push({ x: tx, y: ty, t: duration });

  // Optional ≤3px overshoot (+ micro pull-back) on ~3% of moves: a tiny
  // continuation beyond the target then a settle back to the exact target.
  // Both settle gaps are clamped to tGapCap so the no-jump rule holds even
  // on the tiny-move floor (cap = 40ms).
  if (rng() < 0.03) {
    const mag = _rand(2, 6, rng); // 2–6 px micro-adjust
    const ox = nX * mag * side;
    const oy = nY * mag * side;
    const k = _rand(0.25, 0.6, rng);
    const settleMs = Math.min(Math.min(140, duration * 0.18), tGapCap / Math.max(k, 1 - k));
    const pMid = { x: tx + ox * k, y: ty + oy * k };
    const tMid = duration + settleMs * k;
    points.push({ x: pMid.x, y: pMid.y, t: tMid });
    points.push({ x: tx, y: ty, t: duration + settleMs });
  }

  return points;
}

/** Convenience: alias to the humanlike chain helper (see below). */
export function humanMoveChain(stops, opts = {}) {
  // stops: array of {x, y} absolute targets; walks them in order starting
  // from opts.from ({x, y}) and ALTERNATES the bow side automatically so a
  // multi-op drive never repeats the same arch. Returns one flat sample list
  // with strictly increasing t (each segment's points are shifted by the
  // accumulated time).
  const rng = opts.rng || Math.random;
  let cx = opts.from && typeof opts.from.x === 'number' ? opts.from.x : 0;
  let cy = opts.from && typeof opts.from.y === 'number' ? opts.from.y : 0;
  let acc = 0;
  const out = [];
  let side = rng() < 0.5 ? 1 : -1; // deterministic-first side per chain
  for (const s of stops || []) {
    const pts = humanMovePoints(cx, cy, s.x, s.y, { rng, side });
    for (let i = 0; i < pts.length; i++) {
      // Skip each segment's very first sample after the first segment: it is
      // the point the cursor is already at (t=+0) — keeping it would make the
      // flat timeline non-strictly-increasing at every join.
      if (i === 0 && out.length > 0) continue;
      const p = pts[i];
      out.push({ x: p.x, y: p.y, t: acc + p.t });
    }
    acc += pts[pts.length - 1].t;
    cx = s.x;
    cy = s.y;
    side = -side; // humanlike: alternate the bow side per segment
  }
  return out;
}
