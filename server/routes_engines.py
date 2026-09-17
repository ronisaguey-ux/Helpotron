"""Engine surface — the stylometry and typing engines, reachable from helpotron.

Owner (2026-09-17): *"ensure the humanizer and typing engine are inside helpotron now"*.

The engines were developed in a separate repository and reached helpotron only
through imports that pointed outside it. They now live in `server/stylometry/`
and `server/typing_engine/`, and this router is what makes them part of the
product rather than files that happen to sit in the tree: a caller inside
helpotron can measure text, and can read what the typing engine will do, without
knowing where the code came from.

Deliberately NOT exposed here:
  * `direct_type.py`'s browser driving. It owns a CDP connection and types into a
    real editor; that belongs to the extension's launch flow, which already asks
    `launch_to_doc.build_launch_plan` for policy. An HTTP route that drives a
    browser would be a second, unreviewed path to the same side effect.
  * anything that loads a model. `mlm_veto` and the ONNX detector tier allocate
    hundreds of MB; they are imported lazily by the callers that need them.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engines", tags=["engines"])


def _auth(request: Request):
    """get_current_user takes the request (or a websocket), never the db — it
    opens its own session. Passing db was a guess and raised TypeError."""
    from .security import get_current_user
    return get_current_user(request=request)


class MeasureIn(BaseModel):
    text: str = Field(..., max_length=200_000)


class RewriteIn(BaseModel):
    text: str = Field(..., max_length=200_000)
    strength: float = 1.0
    transforms: Optional[List[str]] = None


@router.get("/health")
async def engines_health() -> Dict[str, Any]:
    """Which engines are importable right now.

    Cheap and unauthenticated on purpose: this is a wiring check, and both
    engines are pure-python. It reports importability, not correctness — a
    caller wanting a real answer should measure something.
    """
    out: Dict[str, Any] = {"stylometry": {}, "typing": {}}
    try:
        from .stylometry import engine as _se
        out["stylometry"] = {
            "ok": True,
            "measure": callable(getattr(_se, "measure", None)),
            "distance": callable(getattr(_se, "distance", None)),
            "transforms": True,
        }
    except Exception as e:                                   # pragma: no cover
        out["stylometry"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    try:
        from .typing_engine import direct_type as _dt
        # The engine's real surface: `Browser` owns the CDP connection, `Tab`
        # drives one page, `Capture` records the edit trace. There is no class
        # called TypingEngine — report what exists rather than what was assumed.
        out["typing"] = {
            "ok": True,
            "has_browser": hasattr(_dt, "Browser"),
            "has_tab": hasattr(_dt, "Tab"),
            "has_capture": hasattr(_dt, "Capture"),
        }
    except Exception as e:                                   # pragma: no cover
        out["typing"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    out["status"] = "success"
    return out


@router.post("/stylometry/measure")
async def stylometry_measure(body: MeasureIn, request: Request,
                             db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Measure a text against the reference model across the engine's parameters.

    `load_targets()` is read once per call rather than cached at import: the
    reference profiles are data, and the engine is expected to pick up an edited
    corpus without a process restart.
    """
    await _auth(request)
    try:
        from .stylometry import engine as se
        from .stylometry.refmodel import load_ref_model
    except Exception as e:
        raise HTTPException(503, f"stylometry engine unavailable: {e}")
    try:
        # measure() takes the reference MODEL (word frequencies etc.), not the
        # target-profile dict — passing the latter raised
        # "'dict' object has no attribute 'fw_rate'". load_ref_model() is
        # disk-cached inside the engine, so this is not a rebuild per request.
        vals = se.measure(body.text, load_ref_model())
    except Exception as e:
        logger.exception("stylometry measure failed")
        raise HTTPException(500, f"measure failed: {type(e).__name__}: {e}")
    return {"status": "success", "parameters": vals}


@router.post("/stylometry/rewrite")
async def stylometry_rewrite(body: RewriteIn, request: Request,
                             db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Apply the engine's inspectable transforms to a text.

    Every transform is a regex, a table lookup or a frequency-ranked
    substitution — the return value says which ones ran so a caller can see what
    changed rather than trusting a black box.
    """
    await _auth(request)
    try:
        from .stylometry import engine as se
    except Exception as e:
        raise HTTPException(503, f"stylometry engine unavailable: {e}")

    available = {
        name: fn for name, fn in vars(se).items()
        if name.startswith("t_") and callable(fn)
    }
    wanted = body.transforms or sorted(available)
    unknown = [n for n in wanted if n not in available]
    if unknown:
        raise HTTPException(400, f"unknown transform(s): {', '.join(unknown)}")

    text = body.text
    applied: List[Dict[str, Any]] = []
    for name in wanted:
        before = text
        try:
            text = available[name](text, body.strength)
        except TypeError:
            text = available[name](text)
        except Exception as e:
            applied.append({"transform": name, "error": f"{type(e).__name__}: {e}"})
            continue
        applied.append({"transform": name, "changed": text != before})

    return {"status": "success", "text": text, "applied": applied,
            "available_transforms": sorted(available)}
