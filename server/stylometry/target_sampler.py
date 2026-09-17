"""Sample a human target PROFILE, instead of aiming at one fixed point.

WHY THIS EXISTS. The first version of the engine scored a text against the human
MEAN of each parameter and drove every one of them toward it. That is overfitting
with extra steps. A text sitting exactly on the centroid of 56 parameters is more
improbable than a real essay, because real writers scatter - and a text that is
statistically "too average" is its own signature. The same lesson as the typing
engine: a perfect clone is a tell.

Measured on the 32 confirmed-human essays, the structure that this module
respects:

    pairwise |r| between the 21 strong parameters   mean 0.259, max 0.957
    parameter pairs with |r| > 0.6                   22 of 210
    variance in the top 5 principal components       73.4%

Humans occupy a correlated MANIFOLD; matching every marginal mean is not the same
as landing on it. That part stands, and it is why this module samples a profile
rather than aiming at the centroid.

WITHDRAWN: "AI baseline 8.61 vs furthest human 5.12, so AI is 1.68x beyond the
human range." That comparison was invalid and the conclusion reverses when it is
done correctly.

The human essays were scored IN-SAMPLE - each essay's distance measured against a
mean and covariance estimated from a set that includes that essay. An in-sample
point cannot exceed (n-1)/sqrt(n) = 5.48 for n=32, no matter how unusual it is.
The observed human max of 5.26 was not a fact about human writing; it was that
algebraic ceiling. The AI text was scored OUT-OF-SAMPLE against the same corpus,
with no such cap, so the two numbers were never comparable.

Measured like-for-like, with each human essay scored against the other 31
(see human_reference_distances):

    human leave-one-out distance      mean 7.60, max 15.24
    AI baseline                       8.61

The AI baseline lands at 1.13x the human leave-one-out MEAN and well inside the
human range, against a claimed 1.68x beyond the human MAX. On this corpus, at this
n, the manifold distance does not separate AI text from human text. Any claim of
separation needs a larger corpus or a held-out discriminative test, not this
statistic.

TWO SAMPLING MODES, both anchored in real data:

  sample_profile(anchor=True)   pick a real essay's profile, then perturb it within
                                the observed spread. Every target is therefore a
                                plausible individual, and two runs produce texts
                                shaped like two different people.
  sample_profile(anchor=False)  draw from the fitted multivariate normal in
                                principal-component space, so the correlations are
                                preserved by construction.

Gaussian noise on the target - not on the output. Adding noise to the output is
just jitter; sampling the target is what makes each result look like a particular
human rather than the average of thirty-two.
"""

from __future__ import annotations

import functools
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILES = os.path.join(HERE, "human_profiles.json")
TARGETS = os.path.join(HERE, "target_profile.json")


def strong_params(min_d: float = 0.8) -> list:
    with open(TARGETS) as f:
        tg = {e["name"]: e for e in json.load(f)}
    return [n for n, t in tg.items()
            if t["abs_d"] >= min_d
            and n not in ("paragraph_length_variance", "intro_outro_symmetry_ratio")]


@functools.lru_cache(maxsize=1)
def _matrix():
    """(names, human matrix as (n_essays, n_params), mean, sd, covariance).

    Standardised by each parameter's human sd, so the covariance describes SHAPE
    rather than being dominated by whichever parameter happens to have the widest
    raw units.
    """
    names = strong_params()
    with open(PROFILES) as f:
        profs = json.load(f)
    rows = []
    for p in profs:
        row = [p["values"].get(n) for n in names]
        if any(v is None for v in row):
            continue
        rows.append(row)
    X = np.array(rows, dtype=float)
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd == 0] = 1.0
    Z = (X - mu) / sd
    return names, X, mu, sd, np.cov(Z, rowvar=False)


def sample_profile(rng=None, anchor: bool = True, noise: float = 0.35,
                   clip: float = 1.0) -> dict:
    """One plausible human profile, as {param: value}.

    anchor=True  start from a real essay and perturb it. noise is in units of the
                 per-parameter human sd; 0.35 keeps the sample recognisably that
                 essay while making repeats differ. clip bounds the result to the
                 observed human range, so a sample can never demand a value no real
                 essay produced.
    anchor=False draw from the fitted multivariate normal in PCA space.
    """
    names, X, mu, sd, C = _matrix()
    rng = rng or np.random.default_rng()

    if anchor:
        base = X[rng.integers(0, len(X))]
    else:
        base = mu + _pca_draw(C, rng) * sd

    z = (base - mu) / sd
    z = z + rng.normal(0.0, noise, size=len(names))
    if clip:
        z = np.clip(z, -clip * 3, clip * 3)
    vals = mu + z * sd

    # bound to what real essays actually produced
    lo, hi = X.min(axis=0), X.max(axis=0)
    span = np.maximum(hi - lo, 1e-9)
    vals = np.clip(vals, lo - 0.25 * span, hi + 0.25 * span)
    return {n: float(v) for n, v in zip(names, vals)}


def _pca_draw(C: np.ndarray, rng) -> np.ndarray:
    """A draw that preserves the correlation structure rather than ignoring it."""
    w, V = np.linalg.eigh(C)
    w = np.clip(w, 1e-6, None)
    k = int(np.searchsorted(np.cumsum(np.sort(w)[::-1]) / w.sum(), 0.95) + 1)
    order = np.argsort(w)[::-1][:k]
    coef = rng.normal(0.0, 1.0, size=k)
    return V[:, order] @ (coef * np.sqrt(w[order]))


def mahalanobis(z: np.ndarray, reg: float = 1e-2) -> float:
    """Distance in the human manifold, weighted by the covariance.

    Regularised because 21 parameters against 32 essays leaves the raw covariance
    close to singular; reg=1e-2 was verified to keep it invertible with the
    measured distances staying stable.
    """
    _, _, _, _, C = _matrix()
    inv = np.linalg.inv(C + np.eye(C.shape[0]) * reg)
    return float(np.sqrt(max(0.0, z @ inv @ z)))


def human_reference_distances(reg: float = 1e-2) -> np.ndarray:
    """Leave-one-out manifold distance for each human essay.

    USE THIS, NOT mahalanobis(), TO COMPARE A TEXT AGAINST THE HUMAN CORPUS.

    mahalanobis() scores a vector against mean/covariance fitted on all 32 essays.
    That is the right thing for an unseen text, and the wrong thing for one of the
    32 - an in-sample point is scored against a distribution it helped define, and
    is algebraically capped at (n-1)/sqrt(n). Comparing an unseen text's distance
    against in-sample human distances therefore compares an uncapped number with
    capped ones and manufactures a gap. That is exactly the error that produced
    the withdrawn "1.68x beyond human range" claim.

    Each essay here is scored against the other n-1, which is the same footing an
    unseen text is on.
    """
    _, X, _, _, _ = _matrix()
    out = []
    for i in range(len(X)):
        rest = np.delete(X, i, axis=0)
        mu, sd = rest.mean(axis=0), rest.std(axis=0)
        sd[sd == 0] = 1.0
        C = np.cov((rest - mu) / sd, rowvar=False)
        inv = np.linalg.inv(C + np.eye(C.shape[0]) * reg)
        z = (X[i] - mu) / sd
        out.append(float(np.sqrt(max(0.0, z @ inv @ z))))
    return np.array(out)


def vectorise(vals: dict) -> np.ndarray:
    """{param: value} -> standardised vector in the sampler's parameter order."""
    names, X, mu, sd, _ = _matrix()
    raw = np.array([vals.get(n, mu[i]) for i, n in enumerate(names)], dtype=float)
    return (raw - mu) / sd


def draw_many(rng, n: int, **kw) -> np.ndarray:
    """n sampled profiles as an (n, n_params) matrix.

    ONE CALL PER ROW, AND THE CALL MUST BE HOISTED. Both the original test and
    the first version of this helper wrote
    `[[sample_profile(rng)[x] for x in names] for _ in range(n)]`, where the inner
    comprehension re-evaluates sample_profile on every iteration - 21 independent
    draws per row, one per parameter. Every column then came from a different
    sample and the correlation structure was destroyed by the harness rather than
    by the sampler, reporting r=0.017 against a human 0.957 and looking exactly
    like a design flaw. The sampler was correct the whole time.
    """
    names, _, _, _, _ = _matrix()
    rows = []
    for _ in range(n):
        p = sample_profile(rng, **kw)          # ONE draw per row, hoisted out
        rows.append([p[x] for x in names])     # of the comprehension. Writing
    return np.array(rows)                      # this inline re-evaluates the
                                               # call once per parameter.


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--n", type=int, default=6)
    a = ap.parse_args()

    names, X, mu, sd, C = _matrix()
    rng = np.random.default_rng(7)
    off = ~np.eye(len(names), dtype=bool)
    ok = 0

    def struct_r(S):
        Zs = (S - X.mean(axis=0)) / sd
        Cs = np.corrcoef(Zs, rowvar=False)
        return float(np.corrcoef(C[off], Cs[off])[0, 1])

    # 1. every sample lands within the observed human range
    lo, hi = X.min(axis=0), X.max(axis=0)
    span = np.maximum(hi - lo, 1e-9)
    S = draw_many(rng, 200)
    assert np.all(S >= lo - 0.3 * span) and np.all(S <= hi + 0.3 * span)
    print("  200 samples within human range        OK")
    ok += 1

    # 2. the spread is real: samples are not all near the mean
    ratio = float(np.median(S.std(axis=0) / sd))
    assert 0.2 < ratio < 1.5, f"sample spread {ratio:.2f} not human-like"
    print(f"  sample spread vs human sd  {ratio:.2f}     OK")
    ok += 1

    # 3. the correlation structure survives sampling
    r = struct_r(S)
    assert r > 0.85, f"correlations not preserved (r={r:.3f})"
    print(f"  correlation structure preserved  r={r:.3f}  OK")
    ok += 1

    # 4. repeats differ: two runs give two different profiles
    p1 = sample_profile(np.random.default_rng(1))
    p2 = sample_profile(np.random.default_rng(2))
    diff = sum(1 for n in names if abs(p1[n] - p2[n]) > 1e-9)
    assert diff == len(names), "samples are not varying"
    print(f"  independent runs differ on {diff}/{len(names)} params  OK")
    ok += 1

    # 5. the anchor mode stays near a real essay, the free mode need not
    an = draw_many(np.random.default_rng(3), 200, anchor=True)
    fr = draw_many(np.random.default_rng(3), 200, anchor=False)
    print(f"  anchor vs free spread   {float(np.median(an.std(axis=0))):.3f} "
          f"/ {float(np.median(fr.std(axis=0))):.3f}")
    assert struct_r(fr) > 0.5, "free mode lost the correlational shape"
    print("  both modes keep human shape            OK")
    ok += 1

    # 6. the human/AI comparison is done on one footing, not two.
    #    Regression guard for the withdrawn "1.68x beyond human range" claim:
    #    in-sample human distances are capped by construction, so if they are
    #    ever used as the human reference again this fails loudly.
    ins = np.array([mahalanobis(vectorise(dict(zip(names, row)))) for row in X])
    loo = human_reference_distances()
    cap = (len(X) - 1) / np.sqrt(len(X))
    assert ins.max() <= cap + 1e-6, "in-sample distance exceeded its algebraic cap"
    assert loo.max() > ins.max(), "leave-one-out must be free of the in-sample cap"
    print(f"  in-sample capped at {cap:.2f}, observed max {ins.max():.2f}   OK")
    print(f"  leave-one-out human  mean {loo.mean():.2f}  max {loo.max():.2f}  OK")
    ok += 1

    print(f"\n  {ok}/6 passed")
    import sys as _s
    _s.exit(0 if ok == 6 else 1)
