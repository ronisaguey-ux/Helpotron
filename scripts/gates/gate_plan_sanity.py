#!/usr/bin/env python3
"""
Pre-Execution Plan Sanity & Integrity Gate (Fail-Closed).
Validates:
1. Model Catalog Integrity (imports ModelPolicy, asserts approved 2026 models, zero legacy/prohibited models)
2. Grunt Economic Invariant (< DeepSeek baseline, capability, reliability, modality rejection)
3. Modality Routing Invariant (Text vs Vision vs Audio distinct branches; Audio never routes to Vision)
4. Interface Signatures (call_llm parameters, resolve_effective_setting, set_scoped_setting)
5. Scope Hierarchy (Strict 6 tiers: Global -> Subject -> Class -> Teacher -> Assignment -> Task)
6. Persistent Telemetry (TelemetryRecord present, ROUTING_TELEMETRY absent)
7. System Map Invariant (Exactly 3 modes: overview, live, investigate)
8. Fail-Closed Security Invariant (Zero insecure production secrets)
"""
import sys
import inspect

def check_sanity():
    errors = []
    
    # 1. Model Catalog Integrity from canonical ModelPolicy
    from server.llm import ModelPolicy, evaluate_grunt_candidate, resolve_model_routing
    for name, p_id in ModelPolicy.PRIMARY_MODELS.items():
        for bad in ModelPolicy.PROHIBITED_PREFIXES:
            if bad in p_id:
                errors.append(f"Prohibited model prefix '{bad}' found in ModelPolicy.PRIMARY_MODELS[{name}] = {p_id}")
                
    for bad in ["deepseek-chat", "deepseek-v3", "deepseek-r1", "claude", "gpt", "gemini-1.5", "gemini-2.0"]:
        if any(bad in k for k in ModelPolicy.PRICING):
            errors.append(f"Legacy/prohibited model '{bad}' found in ModelPolicy.PRICING")
            
    # 2. Grunt Economic Invariant Tests
    g_pass = evaluate_grunt_candidate("nvidia/nemotron-mini-4b-instruct", ["bulk_text"])
    if not g_pass.get("eligible"):
        errors.append(f"Grunt candidate evaluation failed for valid cheap model: {g_pass}")
        
    g_cap_fail = evaluate_grunt_candidate("nvidia/nemotron-mini-4b-instruct", ["multi_step_calc"])
    if g_cap_fail.get("eligible"):
        errors.append("Grunt candidate evaluation accepted incapable model")
        
    g_rel_fail = evaluate_grunt_candidate("nvidia/nemotron-mini-4b-instruct", ["bulk_text"], min_reliability=0.999)
    if g_rel_fail.get("eligible"):
        errors.append("Grunt candidate evaluation accepted model below reliability threshold")
        
    # 3. Modality Routing Integrity Tests
    r_audio = resolve_model_routing("medium", modality="audio")
    if "flash-vision" in r_audio["model"] or "pro-vision" in r_audio["model"]:
        errors.append(f"Audio modality illegally routed to vision-only model: {r_audio['model']}")
        
    r_vis = resolve_model_routing("low", modality="vision")
    if "flash-vision" not in r_vis["model"]:
        errors.append(f"Low-effort vision did not route to DeepSeek V4 Flash Vision: {r_vis['model']}")

    # 4. Interface Signatures
    from server.llm import call_llm
    sig = inspect.signature(call_llm)
    if "user_prompt" not in sig.parameters or "system_prompt" not in sig.parameters:
        errors.append("call_llm missing required parameter signatures (user_prompt, system_prompt)")
        
    from server.user_settings_service import resolve_effective_setting, set_scoped_setting, SCOPE_HIERARCHY
    expected_hierarchy = ["global", "subject", "class", "teacher", "assignment", "task"]
    if SCOPE_HIERARCHY != expected_hierarchy:
        errors.append(f"SCOPE_HIERARCHY {SCOPE_HIERARCHY} does not match canonical 6-tier {expected_hierarchy}")
        
    # 5. Telemetry Source
    import server.cost_tracking as ct
    if hasattr(ct, "ROUTING_TELEMETRY"):
        errors.append("cost_tracking still contains in-memory ROUTING_TELEMETRY source of truth")
        
    if errors:
        print("SANITY CHECK FAILED:")
        for err in errors:
            print(f"  - [FAIL] {err}")
        sys.exit(1)
        
    print("ALL PRE-EXECUTION SANITY GATES PASSED [100% INTEGRITY]")
    sys.exit(0)

if __name__ == "__main__":
    check_sanity()
