"""Does the humanize guidance actually reach the model, or does it sit in a constant?

Owner: *"just add humanization as a tool to the agents system prompt, and guide them into
using the tool, rules nk make it better, things to watch out for"*.

★ THIS DRIVES THE REAL PROMPT BUILDER. Grepping for HUMANIZE_TOOL_GUIDE would only prove the
string exists in the file. The claim is that the MODEL receives it, so `call_llm` is patched
at the point the resolver hands it over and the captured prompt is inspected.
"""

import asyncio
import sys
import types

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server import llm as LLM  # noqa: E402
from server import routes_overlord as R  # noqa: E402

CAPTURED = {}


class FakeUser:
    id = 1
    public_id = "prompt_probe"
    plan = "pro"
    role = "member"
    settings = {}
    is_active = True


CALLS = []


async def fake_call_llm(**kwargs):
    CALLS.append(kwargs)
    CAPTURED["system_prompt"] = kwargs.get("system_prompt", "")
    # The resolver expects a JSON object reply.
    return '{"action": "chat", "payload": {"reply": "hi"}, "response": "hi"}'


def main() -> int:
    ok = True
    # ★ `_resolve_agent_intent` does `from .llm import call_llm` INSIDE the function body, so
    # patching the route module is a no-op — the local import rebinds it. Patch the SOURCE.
    #
    # ★ AND RESTORE IT. The first version assigned `LLM.call_llm = fake_call_llm` and left it
    # there for the rest of the process — so every later test that calls `call_llm` got this
    # canned JSON reply instead of a model. Measured: the four llm test files pass 10/10 alone
    # and 6 FAIL once this file has run before them. A test that permanently rewrites a
    # production module is not testing, it is vandalising the session it runs in.
    _original_call_llm = LLM.call_llm
    LLM.call_llm = fake_call_llm

    try:
        result = asyncio.run(R._resolve_agent_intent(
            user=FakeUser(),
            settings={},
            text="what should i focus on for the midterm next week",
            is_admin=False,
            db=None,
            node="my_agent",
        ))
    except Exception as e:
        # A failure AFTER call_llm still leaves the prompt captured; only a failure before
        # it means the probe never ran.
        if "system_prompt" not in CAPTURED:
            print(f"  FAIL — resolver died before handing the prompt over: "
                  f"{type(e).__name__}: {e}")
            return 1
        print(f"  note: resolver raised after the call ({type(e).__name__}); prompt captured")
    finally:
        LLM.call_llm = _original_call_llm
        result = None

    print(f"  resolver returned: {str(result)[:200]}")

    prompt = CAPTURED.get("system_prompt", "")
    print(f"\n  call_llm invoked {len(CALLS)}x")
    for i, c in enumerate(CALLS):
        print(f"    call {i}: system_prompt={len(c.get('system_prompt',''))} chars")
    print(f"  assembled system prompt: {len(prompt)} chars")

    checks = [
        ("the humanize guide is present", "HUMANIZING TEXT" in prompt),
        ("names the action to call", "humanize_text" in prompt),
        ("says when to use it", "WHEN TO USE IT" in prompt),
        ("says when NOT to", "WHEN NOT TO USE IT" in prompt),
        ("warns that facts must not change", "NEVER CHANGE THE FACTS" in prompt),
        ("says quotations are repaired for it", "QUOTATIONS ARE REPAIRED FOR YOU" in prompt),
        ("tells it to verify quotes first", "web_search" in prompt),
        ("tells it the guard enforces the rule", "preservation guard" in prompt),
        ("names the field it must hand-fix", "facts_to_check" in prompt),
        ("forbids the regeneration loop", "lottery" in prompt),
        ("the action is still advertised", "AVAILABLE ACTIONS" in prompt),
    ]
    for name, present in checks:
        print(f"    {'PASS' if present else 'FAIL'} — {name}")
        if not present:
            ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_humanize_guide_reaches_the_prompt():
    """The guide must be in the prompt the model is handed, not just in the module."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
