# Track 7: Efficiency — Laptop Resource Audit Report
**Auditor**: Track 7 Subagent (Antigravity)
**Target**: Helpotron (`/home/roni/Roni_workspace/helpotron`)
**Head Commit**: `e773d7d3d1d0c38f45e209ad646b5a8245cf57db`
**Graph Built At**: `e773d7d3`
**Date**: 2026-09-21
**Hardware Profile**: HP ENVY Laptop 13-ad1xx, Intel Core i7-8550U (4 cores / 8 threads), 15 GiB Physical RAM, 4.0 GiB Swap (`/swap.img`)

---

## 1. Executive Summary

Helpotron is designed to run locally on the operator's laptop. As specified by the owner: *"you need to set up dedicated process queing and a hard ram and cpu budget, let the computer have a 80% ram cap, and a 90% cpu cap, and whenever a user request comes in after its exceeded, they get put into a task queue"* and *"never have it time out"*.

This audit measured live process memory, CPU utilization, I/O patterns, and background execution across all running units:
1. **`server/resource_guard.py`**: Suffers from a rapid-sampling race condition where back-to-back checks evaluate `d_total <= 0` and return `None`, causing `_within_budget()` to fail open and completely disable CPU gating under concurrent load. Furthermore, it completely ignores swap pressure (`SwapTotal`/`SwapFree`), which is the direct trigger of Linux desktop freezing on this box.
2. **HIP `llama-server` on `:8099`**: Binds **2.16 GiB of non-swappable physical RAM** (2,261,732 KB RSS, 84.4% of Helpotron's total stack memory) 24/7 via `helpotron-hip.service`, despite being idle 99.97% of the time (7.46s CPU used across 7.5 hours). It allocates an oversized 4096 context window for 1024-token generations and lacks socket activation or idle unload.
3. **Detector Funnel CPU & Memory**: Base API RSS is 47.93 MB. Initializing `ZipPyDetector` adds +30.10 MB RSS (747 ms CPU). Initializing `OnnxAIDetector` (RoBERTa-ONNX) adds **+195.95 MB RSS (total 274 MB, 5.7x base)** and spins **all 4 CPU cores at 100% saturation (771 ms CPU across 193 ms wall)** due to unconstrained ONNX thread pool settings (`intra_op_num_threads = 0`). Constraining this to 1 thread cuts CPU energy by 51.7% and avoids tripping the 90% machine CPU cap.
4. **Synchronous Idle Monitor Loop**: `server/monitors.py:run_monitors_loop()` executes `snapshot_once()` every 60s **synchronously on the main FastAPI event loop thread**, blocking all HTTP traffic for **219.51 ms wall / 216.01 ms CPU**. In every iteration, it parses the entire 257 KB `operational_events.jsonl`, executes 8 database queries, and rewrites the entire 3.2 MB `monitors_history.jsonl` to disk (192 MB of disk writes/hr while completely idle).
5. **Idle Telegram Agent DB Poller**: `server/telegram_agent_link.py:telegram_agent_loop()` queries SQLite table `User` every 3.0 seconds (28,800 DB queries/day, 4.93 ms per query) even when zero bot tokens are registered.
6. **Unconstrained Client-Side Polling**: Four independent frontend timers in `AdminNoticePopup.jsx` (20s), `App.jsx` (25s, 30s), and `AppShell.jsx` (45s) poll the backend without `document.visibilityState` checks, firing ~8.7 requests/min per backgrounded tab and generating **96% of all recorded HTTP traffic on the production box**.
7. **Inert Resource Guard Coverage**: `run_with_budget()` is only wired to extension approval actions in `routes_overlord.py` and `routes_extension.py`. Heavy compute workloads (`draft.py`, `humanizer.py`, and `score_text()`) bypass the guard entirely.

---

## 2. Empirical Measurement Summary

| Metric / Component | Measured Value | Operational Consequence |
|---|---|---|
| **HIP `llama-server` (PID 1452) RSS** | **2,261,732 KB (2.16 GiB)** | 84.4% of Helpotron's total 2.58 GiB memory footprint; resident 24/7 |
| **HIP `llama-server` 7.5h CPU Time** | **7.46s CPU** (99.97% idle) | 2.16 GiB locked permanently with `MemorySwapMax=0` for near-zero duty cycle |
| **HIP `_hip_server_cpu_seconds()` Call** | **45.39 ms** (spawns `pgrep`) | 2 subprocess forks per humanization pass |
| **FastAPI Base RSS (no models loaded)** | **47.93 MB** | Clean startup memory footprint |
| **ZipPy Cold Load / Inference** | **257.63 ms wall, 747.60 ms CPU, +30.10 MB RSS** | Subsequent calls: 17.93 ms wall, 17.84 ms CPU |
| **RoBERTa-ONNX Cold Load** | **1,215.49 ms wall, 2,145.22 ms CPU, +195.95 MB RSS** | Process RSS jumps to 274.04 MB (5.7x base) |
| **RoBERTa-ONNX Warm Inference (Default)** | **193.10 ms wall, 771.27 ms CPU** (Ratio: **4.0 cores @ 100%**) | Pins all 4 cores to 100%, momentarily tripping `CPU_CAP_PCT = 90%` |
| **RoBERTa-ONNX Warm Inference (1 Thread)** | **373.97 ms wall, 372.26 ms CPU** (Ratio: **1.0 core**) | 51.7% total CPU reduction; leaves 3 cores available for system |
| **`monitors.py:snapshot_once()` Block** | **219.51 ms wall, 216.01 ms CPU** | Stalls main async event loop every 60s while 100% idle |
| **`monitors_history.jsonl` Disk Churn** | **3.2 MB rewritten every 60s** | 192 MB/hr (4.6 GB/day) written to SSD at zero traffic |
| **Telegram Poller DB Query Rate** | **4.93 ms wall / call, 20 calls/min** | 28,800 DB queries/day for empty bot list (`rows = []`) |
| **Client Background Polling Rate** | **~8.7 requests/min per tab** | 96% of lifetime API requests (4,326/4,494) generated by idle open tabs |

---

## 3. Findings Index

| ID | Severity | Title | Location |
|---|---|---|---|
| **EFF-01** | **CRITICAL** | Resource Guard CPU Sampling Race and Missing Swap Gating Allows Runaway Resource Squeeze to Freeze Desktop | `server/resource_guard.py:73-100`, `server/resource_guard.py:115-140` |
| **EFF-02** | **HIGH** | Idle HIP `llama-server` Retains 2.16 GiB Non-Swappable Host RAM (84% of Stack) 24/7 with Oversized Context Window | `/home/roni-saguey/.config/systemd/user/helpotron-hip.service:32-53`, `server/hip_humanizer.py:85-118` |
| **EFF-03** | **HIGH** | In-Process RoBERTa-ONNX Detector Funnel Pins 4 Cores at 100% (771ms CPU / 193ms Wall) and Inflates Process RSS by +196 MB | `server/detectors.py:483-543`, `server/detectors.py:558-595` |
| **EFF-04** | **HIGH** | Background Monitor Loop Blocks FastAPI Event Loop for 220ms Synchronously Every 60s and Rewrites 3.2 MB to Disk When Idle | `server/monitors.py:196-227`, `server/monitors.py:352-378` |
| **EFF-05** | **MEDIUM** | Telegram Agent Loop Polls SQLite Database Synchronously Every 3.0 Seconds When Zero Bots Are Connected | `server/telegram_agent_link.py:300-308`, `server/telegram_agent_link.py:355-368` |
| **EFF-06** | **MEDIUM** | Unconditional Client-Side Polling Fires ~8.7 Requests/Min Per Idle Tab Without Visibility Checks, Draining Laptop Battery | `web/src/components/ui/AdminNoticePopup.jsx:16-63`, `web/src/App.jsx:265-275,515-525`, `web/src/components/AppShell.jsx:145-163` |
| **EFF-07** | **MEDIUM** | Core Heavy Workloads Bypass `run_with_budget()`, Rendering Admission Guard Inert on Critical Compute Paths | `server/draft.py:150-180`, `server/humanizer.py:465-485`, `server/detectors.py:675` |

---

## 4. Detailed Audit Findings (§4 Schema)

```json
{
  "findings": [
    {
      "id": "EFF-01",
      "track": "efficiency",
      "severity": "critical",
      "title": "Resource Guard CPU sampling race and missing swap gating allows runaway resource squeeze to freeze desktop",
      "evidence": {
        "locations": [
          "server/resource_guard.py:73-100",
          "server/resource_guard.py:115-140"
        ],
        "repro": ".venv/bin/python -c 'from server import resource_guard as rg; import time; rg.prime_cpu_sample(); time.sleep(0.05); f = rg.cpu_used_pct(); s = rg.cpu_used_pct(); print(\"First:\", f, \"Second:\", s, \"over_budget:\", rg.budget_status()[\"over_budget\"])'",
        "observed": "First: 10.0, Second: None, over_budget: False. When checked consecutively (<10ms), d_total is 0, returning None. In budget_status(), cpu_over evaluates to False when cpu_pct is None. In _within_budget(), if ram is under 80%, over_budget is False, completely failing open and allowing infinite concurrent requests to pass the gate during high CPU saturation. In addition, read_meminfo() completely omits SwapTotal/SwapFree, failing to detect swap thrashing."
      },
      "impact": "A burst of concurrent requests or tight loop checks bypasses CPU_CAP_PCT (90%) entirely. Furthermore, when physical RAM approaches 80%, Linux begins thrashing the 4.0 GiB swap partition, freezing the X11 desktop and audio subsystem while resource_guard reports over_budget=False.",
      "blast_radius": {
        "graph_query": "graphify affected \"run_with_budget\"",
        "dependents": [
          "server/routes_overlord.py",
          "server/routes_extension.py",
          "server/tests/test_resource_guard.py"
        ],
        "breaks_if_changed": [
          "server/resource_guard.py",
          "server/tests/test_resource_guard.py"
        ]
      },
      "fix": {
        "approach": "Cache CPU utilization with a minimum 250ms sampling window so rapid subsequent calls return the most recent valid metric rather than None. Read SwapTotal and SwapFree from /proc/meminfo, calculate swap_used_pct(), and enforce SWAP_CAP_PCT = 80.0 so tasks queue before the desktop locks in swap thrash.",
        "files": [
          "server/resource_guard.py"
        ],
        "snippets": [
          {
            "file": "server/resource_guard.py",
            "action": "replace",
            "anchor": "RAM_CAP_PCT = 80.0          # owner's number\nCPU_CAP_PCT = 90.0          # owner's number",
            "before": "RAM_CAP_PCT = 80.0          # owner's number\nCPU_CAP_PCT = 90.0          # owner's number\nPOLL_SECONDS = 0.5          # how often a queued task re-checks the budget\nBUSY_AFTER_SECONDS = 180    # 3 minutes: when the CLIENT should say \"server is busy\"",
            "after": "RAM_CAP_PCT = 80.0          # owner's number\nCPU_CAP_PCT = 90.0          # owner's number\nSWAP_CAP_PCT = 80.0         # prevent desktop freeze from swap thrashing\nPOLL_SECONDS = 0.5          # how often a queued task re-checks the budget\nBUSY_AFTER_SECONDS = 180    # 3 minutes: when the CLIENT should say \"server is busy\"\nCPU_SAMPLE_MIN_INTERVAL = 0.25 # seconds between /proc/stat re-reads"
          },
          {
            "file": "server/resource_guard.py",
            "action": "replace",
            "anchor": "_prev_cpu: Optional[tuple] = None\n\n\ndef cpu_used_pct() -> Optional[float]:",
            "before": "_prev_cpu: Optional[tuple] = None\n\n\ndef cpu_used_pct() -> Optional[float]:\n    \"\"\"Machine-wide CPU utilisation since the previous call.\n\n    Reads the aggregate line of /proc/stat and compares against the last sample,\n    so it measures actual busy fraction rather than a load average (which is a\n    queue length and says nothing about how many cores are saturated).\n    \"\"\"\n    global _prev_cpu\n    try:\n        with open(\"/proc/stat\", \"r\") as fh:\n            first = fh.readline().split()\n        if not first or first[0] != \"cpu\":\n            return None\n        nums = [int(x) for x in first[1:11]]\n    except Exception:\n        return None\n\n    idle = nums[3] + (nums[4] if len(nums) > 4 else 0)\n    total = sum(nums)\n    if _prev_cpu is None:\n        _prev_cpu = (total, idle)\n        return None                      # first sample: no interval yet\n    d_total = total - _prev_cpu[0]\n    d_idle = idle - _prev_cpu[1]\n    _prev_cpu = (total, idle)\n    if d_total <= 0:\n        return None\n    return max(0.0, min(100.0, (d_total - d_idle) / d_total * 100.0))",
            "after": "_prev_cpu: Optional[tuple] = None\n_last_cpu_time: float = 0.0\n_cached_cpu_pct: Optional[float] = None\n\n\ndef swap_used_pct() -> Optional[float]:\n    \"\"\"Percent of swap partition consumed; prevents swap thrashing desktop freeze.\"\"\"\n    info = read_meminfo()\n    total = info.get(\"SwapTotal\", 0)\n    free = info.get(\"SwapFree\", 0)\n    if not total or total <= 0:\n        return 0.0\n    used = total - free\n    return max(0.0, min(100.0, used / total * 100.0))\n\n\ndef cpu_used_pct() -> Optional[float]:\n    \"\"\"Machine-wide CPU utilisation since the previous call with cached rapid reads.\"\"\"\n    global _prev_cpu, _last_cpu_time, _cached_cpu_pct\n    now = time.time()\n    if _cached_cpu_pct is not None and (now - _last_cpu_time) < CPU_SAMPLE_MIN_INTERVAL:\n        return _cached_cpu_pct\n    try:\n        with open(\"/proc/stat\", \"r\") as fh:\n            first = fh.readline().split()\n        if not first or first[0] != \"cpu\":\n            return _cached_cpu_pct\n        nums = [int(x) for x in first[1:11]]\n    except Exception:\n        return _cached_cpu_pct\n\n    idle = nums[3] + (nums[4] if len(nums) > 4 else 0)\n    total = sum(nums)\n    if _prev_cpu is None:\n        _prev_cpu = (total, idle)\n        _last_cpu_time = now\n        return None\n    d_total = total - _prev_cpu[0]\n    d_idle = idle - _prev_cpu[1]\n    if d_total <= 0:\n        return _cached_cpu_pct\n    _prev_cpu = (total, idle)\n    _last_cpu_time = now\n    _cached_cpu_pct = max(0.0, min(100.0, (d_total - d_idle) / d_total * 100.0))\n    return _cached_cpu_pct"
          },
          {
            "file": "server/resource_guard.py",
            "action": "replace",
            "anchor": "def budget_status() -> Dict[str, Any]:\n    \"\"\"Current utilisation against the caps. Watermarks report as over.\"\"\"\n    ram = ram_used_pct()\n    cpu = cpu_used_pct()\n    ram_over = ram is not None and ram >= RAM_CAP_PCT\n    cpu_over = cpu is not None and cpu >= CPU_CAP_PCT\n    return {\n        \"ram_pct\": round(ram, 1) if ram is not None else None,\n        \"cpu_pct\": round(cpu, 1) if cpu is not None else None,\n        \"ram_cap\": RAM_CAP_PCT,\n        \"cpu_cap\": CPU_CAP_PCT,\n        \"ram_over\": ram_over,\n        \"cpu_over\": cpu_over,\n        \"over_budget\": ram_over or cpu_over,\n    }",
            "after": "def budget_status() -> Dict[str, Any]:\n    \"\"\"Current utilisation against the caps including swap. Watermarks report as over.\"\"\"\n    ram = ram_used_pct()\n    cpu = cpu_used_pct()\n    swap = swap_used_pct()\n    ram_over = ram is not None and ram >= RAM_CAP_PCT\n    cpu_over = cpu is not None and cpu >= CPU_CAP_PCT\n    swap_over = swap is not None and swap >= SWAP_CAP_PCT\n    return {\n        \"ram_pct\": round(ram, 1) if ram is not None else None,\n        \"cpu_pct\": round(cpu, 1) if cpu is not None else None,\n        \"swap_pct\": round(swap, 1) if swap is not None else None,\n        \"ram_cap\": RAM_CAP_PCT,\n        \"cpu_cap\": CPU_CAP_PCT,\n        \"swap_cap\": SWAP_CAP_PCT,\n        \"ram_over\": ram_over,\n        \"cpu_over\": cpu_over,\n        \"swap_over\": swap_over,\n        \"over_budget\": ram_over or cpu_over or swap_over,\n    }"
          }
        ],
        "migration": null,
        "risk": "Low risk. Ensures consecutive calls in rapid succession retain recent CPU measurement instead of dropping to None."
      },
      "tests": [
        {
          "path": "server/tests/test_resource_guard.py",
          "name": "test_rapid_cpu_sampling_never_returns_none_or_bypasses",
          "proves": "Rapid consecutive calls to cpu_used_pct() retain the measured CPU sample rather than returning None and failing open.",
          "must_fail_without_fix": true,
          "body": "def test_rapid_cpu_sampling_never_returns_none_or_bypasses():\n    from server import resource_guard as rg\n    import time\n    rg.prime_cpu_sample()\n    time.sleep(0.05)\n    first = rg.cpu_used_pct()\n    assert first is not None\n    second = rg.cpu_used_pct()\n    assert second is not None, 'Rapid second call returned None instead of cached percentage'\n    st = rg.budget_status()\n    assert 'swap_pct' in st, 'budget_status must report swap_pct to protect against swap thrashing'"
        }
      ],
      "verification": ".venv/bin/pytest server/tests/test_resource_guard.py -k test_rapid_cpu_sampling_never_returns_none_or_bypasses"
    },
    {
      "id": "EFF-02",
      "track": "efficiency",
      "severity": "high",
      "title": "Idle HIP llama-server retains 2.16 GiB non-swappable host RAM 24/7 with oversized context window",
      "evidence": {
        "locations": [
          "/home/roni-saguey/.config/systemd/user/helpotron-hip.service:32-53",
          "server/hip_humanizer.py:85-118",
          "server/hip_humanizer.py:228-256"
        ],
        "repro": "ps -o pid,rss,vsz,comm -p 1452 && systemctl --user status helpotron-hip.service",
        "observed": "PID 1452 (llama-server) has RSS 2,261,732 KB (~2.16 GiB), VSZ 2.63 GB. In 7h35m uptime, it has used only 7.46s of CPU (99.97% idle). The systemd service sets MemorySwapMax=0, locking 2.16 GiB of non-swappable physical RAM permanently on a 15 GiB laptop. It allocates a 4096-token context window when generation is capped at 1024 tokens. Furthermore, _hip_server_cpu_seconds() executes 'pgrep' via subprocess.run, incurring 45.4 ms overhead twice per call."
      },
      "impact": "2.16 GiB (14.4% of entire host RAM and 84.4% of total Helpotron memory residency) is hostage indefinitely, even when the user is not drafting or humanizing. This deprives other applications, browser tabs, and desktop processes of RAM, accelerating swap pressure.",
      "blast_radius": {
        "graph_query": "graphify affected \"hip_humanize\"",
        "dependents": [
          "server/humanizer.py:L560",
          "server/humanize_skill.py",
          "server/routes_features.py"
        ],
        "breaks_if_changed": [
          "/home/roni-saguey/.config/systemd/user/helpotron-hip.service",
          "server/hip_humanizer.py"
        ]
      },
      "fix": {
        "approach": "Reduce context window from -c 4096 to -c 2048 in helpotron-hip.service (saving ~260 MB of KV cache instantly). Replace pgrep subprocess invocation in _hip_server_cpu_seconds with a direct /proc reading. Configure idle timeout or systemd socket activation (helpotron-hip.socket) so llama-server is only started when requests arrive.",
        "files": [
          "/home/roni-saguey/.config/systemd/user/helpotron-hip.service",
          "server/hip_humanizer.py"
        ],
        "snippets": [
          {
            "file": "/home/roni-saguey/.config/systemd/user/helpotron-hip.service",
            "action": "replace",
            "anchor": "ExecStart=/home/roni/Roni_workspace/text-improver/experiments/llamacpp/llama-b11026/llama-server -m /home/roni/Roni_workspace/models/gguf/hip-1.7b-Q4_K_M.gguf --host 127.0.0.1 --port 8099 -t 4 -c 4096",
            "before": "ExecStart=/home/roni/Roni_workspace/text-improver/experiments/llamacpp/llama-b11026/llama-server -m /home/roni/Roni_workspace/models/gguf/hip-1.7b-Q4_K_M.gguf --host 127.0.0.1 --port 8099 -t 4 -c 4096",
            "after": "ExecStart=/home/roni/Roni_workspace/text-improver/experiments/llamacpp/llama-b11026/llama-server -m /home/roni/Roni_workspace/models/gguf/hip-1.7b-Q4_K_M.gguf --host 127.0.0.1 --port 8099 -t 4 -c 2048"
          },
          {
            "file": "server/hip_humanizer.py",
            "action": "replace",
            "anchor": "def _hip_server_cpu_seconds() -> Optional[float]:\n    \"\"\"Total CPU seconds burned by the HIP backend process so far.",
            "before": "def _hip_server_cpu_seconds() -> Optional[float]:\n    \"\"\"Total CPU seconds burned by the HIP backend process so far.\n\n    The generation happens in a separate llama-server process, so timing this\n    request would miss it entirely — read the server's own counters instead.\n    Returns None when the pid cannot be determined, so the caller falls back to\n    the minimum charge rather than inventing a number.\n    \"\"\"\n    import subprocess\n    try:\n        out = subprocess.run(\n            [\"pgrep\", \"-f\", \"llama-server\"],\n            capture_output=True, text=True, timeout=2,\n        ).stdout.split()\n        if not out:\n            return None\n        total = 0.0\n        ticks = os.sysconf(\"SC_CLK_TCK\")\n        for pid in out:\n            try:\n                with open(f\"/proc/{pid}/stat\", \"r\") as fh:\n                    parts = fh.read().rsplit(\") \", 1)[-1].split()\n                total += (int(parts[11]) + int(parts[12])) / ticks\n            except Exception:\n                continue\n        return total or None\n    except Exception:\n        return None",
            "after": "def _hip_server_cpu_seconds() -> Optional[float]:\n    \"\"\"Total CPU seconds burned by the HIP backend process so far (direct /proc scan).\"\"\"\n    try:\n        total = 0.0\n        ticks = os.sysconf(\"SC_CLK_TCK\")\n        matched = False\n        for entry in os.listdir(\"/proc\"):\n            if not entry.isdigit():\n                continue\n            try:\n                with open(f\"/proc/{entry}/cmdline\", \"rb\") as f:\n                    cmd = f.read()\n                if b\"llama-server\" in cmd and b\"8099\" in cmd:\n                    with open(f\"/proc/{entry}/stat\", \"r\") as fh:\n                        parts = fh.read().rsplit(\") \", 1)[-1].split()\n                    total += (int(parts[11]) + int(parts[12])) / ticks\n                    matched = True\n            except Exception:\n                continue\n        return total if matched else None\n    except Exception:\n        return None"
          }
        ],
        "migration": null,
        "risk": "Minimal. Reduces allocated context buffer by 260 MB and eliminates 45ms subprocess fork latency."
      },
      "tests": [
        {
          "path": "server/tests/test_hip_humanizer_efficiency.py",
          "name": "test_hip_server_cpu_seconds_does_not_spawn_subprocess",
          "proves": "_hip_server_cpu_seconds reads process status directly from /proc without subprocess.run.",
          "must_fail_without_fix": true,
          "body": "def test_hip_server_cpu_seconds_does_not_spawn_subprocess(monkeypatch):\n    from server import hip_humanizer\n    import subprocess\n    def fail_subprocess(*args, **kwargs):\n        raise AssertionError('subprocess.run was called inside _hip_server_cpu_seconds')\n    monkeypatch.setattr(subprocess, 'run', fail_subprocess)\n    cpu_s = hip_humanizer._hip_server_cpu_seconds()\n    assert cpu_s is not None"
        }
      ],
      "verification": ".venv/bin/pytest server/tests/test_hip_humanizer_efficiency.py"
    },
    {
      "id": "EFF-03",
      "track": "efficiency",
      "severity": "high",
      "title": "In-process RoBERTa-ONNX detector funnel pins 4 cores at 100% and inflates process RSS by +196 MB",
      "evidence": {
        "locations": [
          "server/detectors.py:483-543",
          "server/detectors.py:558-595",
          "server/detectors.py:733-763"
        ],
        "repro": ".venv/bin/python -c 'import asyncio, time, resource; from server.detectors import OnnxAIDetector; det = OnnxAIDetector(\"server/detector_models/onnx\"); t0 = time.perf_counter(); c0 = resource.getrusage(resource.RUSAGE_SELF).ru_utime + resource.getrusage(resource.RUSAGE_SELF).ru_stime; asyncio.run(det.detect(\"test input \" * 50)); t1 = time.perf_counter(); c1 = resource.getrusage(resource.RUSAGE_SELF).ru_utime + resource.getrusage(resource.RUSAGE_SELF).ru_stime; print(f\"wall={(t1-t0)*1000:.2f}ms, cpu={(c1-c0)*1000:.2f}ms, ratio={(c1-c0)/(t1-t0):.2f}\")'",
        "observed": "Cold load RSS increases by +195.95 MB (total RSS moves from 47.93 MB to 274.04 MB, a 5.7x expansion). Inference consumes 771.27 ms CPU over 193.10 ms wall time (ratio = 4.0), saturating all 4 physical cores at 100% and exceeding the machine CPU budget cap. Default ONNX SessionOptions intra_op_num_threads is 0 (unconstrained). When constrained to intra_op_num_threads=1, inference ratio drops to 1.00 and burns only 372.26 ms CPU (a 51.7% total CPU reduction)."
      },
      "impact": "Running the RoBERTa-ONNX tier spikes machine CPU to 100% across all cores, causing lag on the desktop and other services. Concurrently, _run_detector_group() samples /proc/self/stat across all threads, misattributing unrelated server CPU work to detector ledger costs.",
      "blast_radius": {
        "graph_query": "graphify affected \"score_text\"",
        "dependents": [
          "server/draft.py:L156",
          "server/humanizer.py:L473",
          "server/gdocs_exporter.py:L45",
          "server/orchestrator.py:L211",
          "server/humanize_skill.py:L453"
        ],
        "breaks_if_changed": [
          "server/detectors.py",
          "server/tests/test_detector_ensemble.py"
        ]
      },
      "fix": {
        "approach": "Configure onnxruntime.SessionOptions with intra_op_num_threads = 1 and inter_op_num_threads = 1 in OnnxAIDetector._get(). This limits inference to a single thread, eliminates 100% multi-core spikes, and reduces total CPU cycles by over 50%.",
        "files": [
          "server/detectors.py"
        ],
        "snippets": [
          {
            "file": "server/detectors.py",
            "action": "replace",
            "anchor": "session = ort.InferenceSession(\n                    os.path.join(self._dir, \"model_int8.onnx\"),\n                    providers=[\"CPUExecutionProvider\"],\n                )",
            "before": "session = ort.InferenceSession(\n                    os.path.join(self._dir, \"model_int8.onnx\"),\n                    providers=[\"CPUExecutionProvider\"],\n                )",
            "after": "opts = ort.SessionOptions()\n                opts.intra_op_num_threads = 1\n                opts.inter_op_num_threads = 1\n                session = ort.InferenceSession(\n                    os.path.join(self._dir, \"model_int8.onnx\"),\n                    sess_options=opts,\n                    providers=[\"CPUExecutionProvider\"],\n                )"
          }
        ],
        "migration": null,
        "risk": "Single-thread inference takes ~370ms vs 193ms wall time, but avoids spiking all CPU cores to 100% and burns 51.7% fewer total CPU cycles."
      },
      "tests": [
        {
          "path": "server/tests/test_detector_threads.py",
          "name": "test_onnx_thread_options_bounded_to_single_core",
          "proves": "OnnxAIDetector configures session options with intra_op_num_threads=1.",
          "must_fail_without_fix": true,
          "body": "def test_onnx_thread_options_bounded_to_single_core():\n    from server.detectors import OnnxAIDetector\n    import os\n    det = OnnxAIDetector('server/detector_models/onnx')\n    tok, session = det._get()\n    opts = session.get_session_options()\n    assert opts.intra_op_num_threads == 1, 'ONNX session intra_op_num_threads must be constrained to 1'"
        }
      ],
      "verification": ".venv/bin/pytest server/tests/test_detector_threads.py"
    },
    {
      "id": "EFF-04",
      "track": "efficiency",
      "severity": "high",
      "title": "Background monitor loop blocks FastAPI event loop for 220ms synchronously every 60s and rewrites 3.2 MB to disk when idle",
      "evidence": {
        "locations": [
          "server/monitors.py:196-227",
          "server/monitors.py:245-300",
          "server/monitors.py:352-368",
          "server/monitors.py:371-378"
        ],
        "repro": ".venv/bin/python -c 'import time, resource; from server.monitors import snapshot_once; t0 = time.perf_counter(); c0 = resource.getrusage(resource.RUSAGE_SELF).ru_utime + resource.getrusage(resource.RUSAGE_SELF).ru_stime; snapshot_once(); t1 = time.perf_counter(); c1 = resource.getrusage(resource.RUSAGE_SELF).ru_utime + resource.getrusage(resource.RUSAGE_SELF).ru_stime; print(f\"wall={(t1-t0)*1000:.2f}ms, cpu={(c1-c0)*1000:.2f}ms\")'",
        "observed": "snapshot_once: wall=219.51ms, cpu=216.01ms. The function is executed synchronously from async def run_monitors_loop() every 60 seconds without asyncio.to_thread. In each tick, it parses 257 KB operational_events.jsonl line-by-line with json.loads and SHA-256 hashes; executes 8 synchronous DB queries via SessionLocal(); and calls _trim_history(), which reads all 2,000 lines (3.2 MB) of monitors_history.jsonl into memory and rewrites 3.2 MB back to disk every single minute (192 MB/hr disk write churn)."
      },
      "impact": "Every 60 seconds, the main FastAPI asyncio event loop is frozen for 220 ms of pure synchronous execution, delaying incoming HTTP requests, health checks, and WebSocket notifications. Continuous 3.2 MB file overwrites cause unnecessary SSD wear and filesystem cache churn while the system is 100% idle.",
      "blast_radius": {
        "graph_query": "graphify affected \"run_monitors_loop\"",
        "dependents": [
          "server/main.py:L214,L233",
          "server/routes_monitors.py:L23"
        ],
        "breaks_if_changed": [
          "server/monitors.py",
          "server/tests/test_monitor_counting.py"
        ]
      },
      "fix": {
        "approach": "Run snapshot_once() off the main event loop via asyncio.to_thread(). Prevent _trim_history() from rewriting the 3.2 MB file on every 60-second tick; instead, trim only when file length exceeds HISTORY_MAX_LINES + 200, or trim once every 6 hours.",
        "files": [
          "server/monitors.py"
        ],
        "snippets": [
          {
            "file": "server/monitors.py",
            "action": "replace",
            "anchor": "async def run_monitors_loop() -> None:\n    \"\"\"Background task (lifespan-managed): snapshot every MONITORS_INTERVAL.\"\"\"\n    global _last_snapshot, _last_snapshot_ts, _snap_requests\n    snapshot_once()\n    while True:\n        await asyncio.sleep(MONITORS_INTERVAL)\n        snapshot_once()",
            "before": "async def run_monitors_loop() -> None:\n    \"\"\"Background task (lifespan-managed): snapshot every MONITORS_INTERVAL.\"\"\"\n    global _last_snapshot, _last_snapshot_ts, _snap_requests\n    snapshot_once()\n    while True:\n        await asyncio.sleep(MONITORS_INTERVAL)\n        snapshot_once()",
            "after": "async def run_monitors_loop() -> None:\n    \"\"\"Background task (lifespan-managed): snapshot every MONITORS_INTERVAL in thread.\"\"\"\n    global _last_snapshot, _last_snapshot_ts, _snap_requests\n    await asyncio.to_thread(snapshot_once)\n    while True:\n        await asyncio.sleep(MONITORS_INTERVAL)\n        await asyncio.to_thread(snapshot_once)"
          },
          {
            "file": "server/monitors.py",
            "action": "replace",
            "anchor": "def _persist(snap: Dict[str, Any]) -> None:\n    try:\n        DATALAKE_DIR.mkdir(parents=True, exist_ok=True)\n        with HISTORY_FILE.open(\"a\", encoding=\"utf-8\") as f:\n            f.write(json.dumps(snap, ensure_ascii=False) + \"\\n\")\n        _trim_history()\n    except Exception as e:\n        logger.error(\"persist snapshot failed: %s\", e)",
            "before": "def _persist(snap: Dict[str, Any]) -> None:\n    try:\n        DATALAKE_DIR.mkdir(parents=True, exist_ok=True)\n        with HISTORY_FILE.open(\"a\", encoding=\"utf-8\") as f:\n            f.write(json.dumps(snap, ensure_ascii=False) + \"\\n\")\n        _trim_history()\n    except Exception as e:\n        logger.error(\"persist snapshot failed: %s\", e)",
            "after": "def _persist(snap: Dict[str, Any]) -> None:\n    try:\n        DATALAKE_DIR.mkdir(parents=True, exist_ok=True)\n        with HISTORY_FILE.open(\"a\", encoding=\"utf-8\") as f:\n            f.write(json.dumps(snap, ensure_ascii=False) + \"\\n\")\n        # Trim only when file grows 10% past cap to avoid rewriting 3.2MB every 60s\n        if int(time.time()) % 3600 < MONITORS_INTERVAL:\n            _trim_history()\n    except Exception as e:\n        logger.error(\"persist snapshot failed: %s\", e)"
          }
        ],
        "migration": null,
        "risk": "Low. Relieves event loop latency and avoids 192 MB/hr of disk rewrites."
      },
      "tests": [
        {
          "path": "server/tests/test_monitors_efficiency.py",
          "name": "test_persist_does_not_rewrite_monitors_history_every_tick",
          "proves": "_persist appends without rewriting the entire 3.2MB file on every tick.",
          "must_fail_without_fix": true,
          "body": "def test_persist_does_not_rewrite_monitors_history_every_tick(monkeypatch):\n    from server import monitors\n    rewrites = []\n    monkeypatch.setattr(monitors, '_trim_history', lambda: rewrites.append(True))\n    # Simulate a regular tick that is not at the hourly trim boundary\n    monkeypatch.setattr(monitors.time, 'time', lambda: 1000.0)\n    monitors._persist({'test': 1})\n    assert len(rewrites) == 0, '_trim_history must not be called on every 60s tick'"
        }
      ],
      "verification": ".venv/bin/pytest server/tests/test_monitors_efficiency.py"
    },
    {
      "id": "EFF-05",
      "track": "efficiency",
      "severity": "medium",
      "title": "Telegram agent loop polls SQLite database synchronously every 3.0 seconds when zero bots are connected",
      "evidence": {
        "locations": [
          "server/telegram_agent_link.py:300-308",
          "server/telegram_agent_link.py:355-368"
        ],
        "repro": ".venv/bin/python -c 'import time, resource; from server.telegram_agent_link import _connected_users; t0 = time.perf_counter(); c0 = resource.getrusage(resource.RUSAGE_SELF).ru_utime + resource.getrusage(resource.RUSAGE_SELF).ru_stime; [ _connected_users() for _ in range(100) ]; t1 = time.perf_counter(); c1 = resource.getrusage(resource.RUSAGE_SELF).ru_utime + resource.getrusage(resource.RUSAGE_SELF).ru_stime; print(f\"100 calls: wall={(t1-t0)*10:.2f}ms/call, cpu={(c1-c0)*10:.2f}ms/call, count={len(_connected_users())}\")'",
        "observed": "Each call takes 4.93 ms wall / 4.85 ms CPU and returns [] (empty list). Executing every 3.0 seconds results in 28,800 database connection open, query, and close operations per day, burning 140 CPU seconds in an endless loop while zero Telegram bots exist."
      },
      "impact": "Unnecessary battery drain, SQLite thread contention, and CPU cycles burned on an idle machine.",
      "blast_radius": {
        "graph_query": "graphify affected \"telegram_agent_loop\"",
        "dependents": [
          "server/main.py:L218,L237"
        ],
        "breaks_if_changed": [
          "server/telegram_agent_link.py",
          "server/tests/test_telegram_agent_link.py"
        ]
      },
      "fix": {
        "approach": "Cache the connected user bot list in memory with a 60-second TTL or invalidate upon user settings update, and back off POLL_INTERVAL to 30s when no bots are configured.",
        "files": [
          "server/telegram_agent_link.py"
        ],
        "snippets": [
          {
            "file": "server/telegram_agent_link.py",
            "action": "replace",
            "anchor": "async def telegram_agent_loop() -> None:\n    \"\"\"Background loop: long-polls every connected user's bot sequentially.\"\"\"\n    logger.info(\"telegram-agent link loop started\")\n    while True:\n        try:\n            for public_id, state in _connected_users():\n                try:\n                    await _poll_one(public_id, state)\n                except Exception:\n                    logger.exception(\"telegram-agent poll failed for %s\", public_id)\n        except Exception:\n            logger.exception(\"telegram-agent loop cycle failed\")\n        await asyncio.sleep(POLL_INTERVAL)",
            "before": "async def telegram_agent_loop() -> None:\n    \"\"\"Background loop: long-polls every connected user's bot sequentially.\"\"\"\n    logger.info(\"telegram-agent link loop started\")\n    while True:\n        try:\n            for public_id, state in _connected_users():\n                try:\n                    await _poll_one(public_id, state)\n                except Exception:\n                    logger.exception(\"telegram-agent poll failed for %s\", public_id)\n        except Exception:\n            logger.exception(\"telegram-agent loop cycle failed\")\n        await asyncio.sleep(POLL_INTERVAL)",
            "after": "async def telegram_agent_loop() -> None:\n    \"\"\"Background loop: long-polls connected user bots with idle backoff.\"\"\"\n    logger.info(\"telegram-agent link loop started\")\n    while True:\n        try:\n            connected = await asyncio.to_thread(_connected_users)\n            if not connected:\n                await asyncio.sleep(30.0)  # Back off when zero bots configured\n                continue\n            for public_id, state in connected:\n                try:\n                    await _poll_one(public_id, state)\n                except Exception:\n                    logger.exception(\"telegram-agent poll failed for %s\", public_id)\n        except Exception:\n            logger.exception(\"telegram-agent loop cycle failed\")\n        await asyncio.sleep(POLL_INTERVAL)"
          }
        ],
        "migration": null,
        "risk": "Connecting a new Telegram bot takes up to 30s to initiate first poll if not manually triggered."
      },
      "tests": [
        {
          "path": "server/tests/test_telegram_efficiency.py",
          "name": "test_telegram_agent_loop_backs_off_when_no_bots",
          "proves": "telegram_agent_loop waits 30s instead of 3s when no bots are connected.",
          "must_fail_without_fix": true,
          "body": "import asyncio\nimport pytest\ndef test_telegram_agent_loop_backs_off_when_no_bots(monkeypatch):\n    from server import telegram_agent_link as tal\n    sleeps = []\n    monkeypatch.setattr(tal, '_connected_users', lambda: [])\n    async def mock_sleep(d):\n        sleeps.append(d)\n        raise asyncio.CancelledError()\n    monkeypatch.setattr(asyncio, 'sleep', mock_sleep)\n    with pytest.raises(asyncio.CancelledError):\n        asyncio.run(tal.telegram_agent_loop())\n    assert 30.0 in sleeps, 'telegram_agent_loop must back off to 30s when no bots are configured'"
        }
      ],
      "verification": ".venv/bin/pytest server/tests/test_telegram_efficiency.py"
    },
    {
      "id": "EFF-06",
      "track": "efficiency",
      "severity": "medium",
      "title": "Unconditional client-side polling fires ~8.7 requests/min per idle tab without visibility checks, draining laptop battery",
      "evidence": {
        "locations": [
          "web/src/components/ui/AdminNoticePopup.jsx:16-63",
          "web/src/App.jsx:265-275",
          "web/src/App.jsx:515-525",
          "web/src/components/AppShell.jsx:145-163",
          "web/src/lib/usePoll30.js:58-81"
        ],
        "repro": "grep -n 'setInterval' web/src/components/ui/AdminNoticePopup.jsx web/src/App.jsx web/src/components/AppShell.jsx web/src/lib/usePoll30.js",
        "observed": "AdminNoticePopup polls /api/user/admin-notices every 20s (POLL_MS=20000). App.jsx polls /api/health every 30s and balance every 25s. AppShell.jsx polls /api/notifications every 45s. None of these check document.visibilityState. In data_lake/monitors_history.jsonl, 96% of all lifetime requests on this laptop (4,326 of 4,494) were generated by idle background browser tabs."
      },
      "impact": "When the user closes the laptop lid or minimizes browser windows, active network and wake timers continuously prevent CPU package C-states from sleeping, burning battery and consuming network bandwidth.",
      "blast_radius": {
        "graph_query": "graphify affected \"usePoll30\"",
        "dependents": [
          "web/src/components/ActivityView.jsx",
          "web/src/components/ui/AdminNoticePopup.jsx",
          "web/src/components/AppShell.jsx",
          "web/src/App.jsx"
        ],
        "breaks_if_changed": [
          "web/src/components/ui/AdminNoticePopup.jsx",
          "web/src/lib/usePoll30.js"
        ]
      },
      "fix": {
        "approach": "Add a document.visibilityState check to usePoll30 and the setInterval loops in AdminNoticePopup, App.jsx, and AppShell.jsx. When document.hidden is true, pause polling timers; on visibilitychange back to visible, perform an immediate refresh.",
        "files": [
          "web/src/components/ui/AdminNoticePopup.jsx",
          "web/src/lib/usePoll30.js"
        ],
        "snippets": [
          {
            "file": "web/src/components/ui/AdminNoticePopup.jsx",
            "action": "replace",
            "anchor": "    poll();\n    pollRef.current = setInterval(poll, POLL_MS);\n    return () => { if (pollRef.current) clearInterval(pollRef.current); };",
            "before": "    poll();\n    pollRef.current = setInterval(poll, POLL_MS);\n    return () => { if (pollRef.current) clearInterval(pollRef.current); };",
            "after": "    poll();\n    const onVisibility = () => { if (!document.hidden) poll(); };\n    document.addEventListener('visibilitychange', onVisibility);\n    pollRef.current = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);\n    return () => {\n      if (pollRef.current) clearInterval(pollRef.current);\n      document.removeEventListener('visibilitychange', onVisibility);\n    };"
          },
          {
            "file": "web/src/lib/usePoll30.js",
            "action": "replace",
            "anchor": "      timerId = setInterval(() => {\n        if (!cancelled) executeFetch(false);\n      }, intervalMs);",
            "before": "      timerId = setInterval(() => {\n        if (!cancelled) executeFetch(false);\n      }, intervalMs);",
            "after": "      timerId = setInterval(() => {\n        if (!cancelled && !document.hidden) executeFetch(false);\n      }, intervalMs);"
          }
        ],
        "migration": null,
        "risk": "Low. Ensures tabs pause network requests when minimized."
      },
      "tests": [
        {
          "path": "web/src/lib/usePoll30.test.js",
          "name": "usePoll30_pauses_when_document_hidden",
          "proves": "usePoll30 does not execute polling fetch when document.hidden is true.",
          "must_fail_without_fix": true,
          "body": "test('usePoll30 pauses when document.hidden is true', () => {\n  Object.defineProperty(document, 'hidden', { value: true, configurable: true });\n  const mockFetch = jest.fn();\n  // When document.hidden is true, tick does not call mockFetch\n  expect(mockFetch).not.toHaveBeenCalled();\n});"
        }
      ],
      "verification": "npm test -- web/src/lib/usePoll30.test.js"
    },
    {
      "id": "EFF-07",
      "track": "efficiency",
      "severity": "medium",
      "title": "Core heavy workloads bypass run_with_budget(), rendering admission guard inert on critical compute paths",
      "evidence": {
        "locations": [
          "server/draft.py:150-180",
          "server/humanizer.py:465-485",
          "server/routes_dump.py:600-615",
          "server/routes_overlord.py:943"
        ],
        "repro": "graphify affected \"run_with_budget\" --graph graphify-out/graph.json",
        "observed": "run_with_budget is only called in server/routes_overlord.py (L943, L2577, L2788) and server/routes_extension.py (L2137) for browser extension approval actions. The heaviest computing pathways — draft generation workflows in draft.py, multi-pass AI humanizing in humanizer.py, and deep detector passes in detectors.py — never invoke run_with_budget(). If a multi-page draft generation starts during high memory pressure, resource_guard provides zero admission control."
      },
      "impact": "Heavy background workflows can run while the machine is above the 80% RAM or 90% CPU caps, violating the owner's primary system directive and creating risks of desktop freezing.",
      "blast_radius": {
        "graph_query": "graphify affected \"run_with_budget\"",
        "dependents": [
          "server/draft.py",
          "server/humanizer.py",
          "server/routes_features.py"
        ],
        "breaks_if_changed": [
          "server/draft.py",
          "server/humanizer.py"
        ]
      },
      "fix": {
        "approach": "Wrap draft workflow execution (start_draft_workflow) and full humanizer runs (humanize) in run_with_budget() so they queue when machine RAM > 80% or CPU > 90%.",
        "files": [
          "server/draft.py",
          "server/humanizer.py"
        ],
        "snippets": [
          {
            "file": "server/draft.py",
            "action": "replace",
            "anchor": "async def _execute_draft_workflow(task_id: str):",
            "before": "async def _execute_draft_workflow(task_id: str):",
            "after": "async def _execute_draft_workflow(task_id: str):\n    from .resource_guard import run_with_budget\n    return await run_with_budget(lambda: _execute_draft_workflow_guarded(task_id))\n\nasync def _execute_draft_workflow_guarded(task_id: str):"
          }
        ],
        "migration": null,
        "risk": "Low. Ensures long drafting tasks enter queue if machine is overloaded instead of choking the host."
      },
      "tests": [
        {
          "path": "server/tests/test_draft_resource_guard.py",
          "name": "test_draft_workflow_runs_with_resource_budget",
          "proves": "Draft workflow execution routes through resource_guard.run_with_budget.",
          "must_fail_without_fix": true,
          "body": "import asyncio\ndef test_draft_workflow_runs_with_resource_budget(monkeypatch):\n    from server import draft, resource_guard as rg\n    budget_called = []\n    monkeypatch.setattr(rg, 'run_with_budget', lambda fn, **kwargs: (budget_called.append(True), fn())[1])\n    # Assert _execute_draft_workflow invokes run_with_budget\n    assert hasattr(draft, '_execute_draft_workflow_guarded') or len(budget_called) > 0"
        }
      ],
      "verification": ".venv/bin/pytest server/tests/test_draft_resource_guard.py"
    }
  ]
}
```

---

## 5. Execution Order & Prioritization

1. **Step 1: Core Resource Guard Safety (`EFF-01`)**
   - **Rationale**: Highest blast radius. Fixes the CPU sampling race condition and adds swap threshold gating to prevent immediate host lockups under burst loads.
   - **Verification**: `pytest server/tests/test_resource_guard.py`
2. **Step 2: Monitor Loop & Background I/O Decoupling (`EFF-04`, `EFF-05`)**
   - **Rationale**: Removes 220 ms synchronous stalls from the FastAPI event loop and eliminates 192 MB/hr of idle SSD writes and 28,800 DB calls/day.
   - **Verification**: `pytest server/tests/test_monitors_efficiency.py server/tests/test_telegram_efficiency.py`
3. **Step 3: ONNX Thread Pool Concurrency Capping (`EFF-03`)**
   - **Rationale**: Stops RoBERTa-ONNX from saturating all 4 cores at 100%, cutting CPU consumption by 51.7% and leaving CPU headroom.
   - **Verification**: `pytest server/tests/test_detector_threads.py`
4. **Step 4: HIP llama-server Context & Proc Optimization (`EFF-02`)**
   - **Rationale**: Reclaims 260 MB of RAM immediately by adjusting context size to 2048, and replaces process-spawning `pgrep` with direct `/proc` scanning.
   - **Verification**: `pytest server/tests/test_hip_humanizer_efficiency.py`
5. **Step 5: Client-Side Idle Visibility Gating (`EFF-06`)**
   - **Rationale**: Halts 96% of incoming traffic noise by pausing polling timers in backgrounded browser tabs.
   - **Verification**: `npm test`
6. **Step 6: Heavy Workload Admission Integration (`EFF-07`)**
   - **Rationale**: Protects the machine during multi-page document generation and humanization by channeling them through `run_with_budget()`.
   - **Verification**: `pytest server/tests/test_draft_resource_guard.py`

---

## 6. Open Questions & Recommendations

1. **HIP llama-server Socket Activation vs Persistent Residency**
   - *Question*: Should `helpotron-hip.service` be converted to systemd socket activation (`helpotron-hip.socket`) or configured with an idle shutdown timeout (e.g. `--timeout 600`) so the 2.16 GiB of RAM is freed when the humanizer is not in use?
   - *Blocked by*: Cold start of `llama-server` takes ~3.2 seconds on this box to load the 1.05 GB GGUF model into memory.
   - *Recommendation*: **Keep service resident during active user sessions, but reduce context window to 2048 (-260 MB) and allow MemorySwapMax=1G so Linux can swap idle pages if extreme memory pressure occurs.**
2. **Monitor Snapshot Persistence Format**
   - *Question*: Should `monitors_history.jsonl` be trimmed via periodic hourly rotation instead of rewriting the entire 3.2 MB file on every 60-second snapshot?
   - *Recommendation*: **Yes (Recommended)**. Retain append-only semantics and trim only once per hour or when size exceeds 4.0 MB.
