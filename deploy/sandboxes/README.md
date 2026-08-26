# subagent sandboxes

Every subagent run that helpotron spawns (executors, verifiers, evaluation
agents) performs its work inside an isolated temp workdir:

```
data/sandboxes/<run-id>/
  work/        the sandbox working copy / scratch
  logs/        per-run log capture
  state.json   run metadata (run-id, kind, timeout, started/finished)
```

## Rules (enforced by the launch wrapper `deploy/sandboxes/sandbox_run.sh`)
1. Each run gets a fresh `<run-id>` (timestamp + nanos + kind).
2. The workdir is under `data/sandboxes/` ONLY — sandbox agents must never
   write outside their sandbox dir or the repo checkout.
3. Per-run resource caps: timeout, max concurrent children, RAM ceiling.
4. After the run (success or fail) the run dir is kept for 48h, then a
   cleanup pass (`deploy/sandboxes/cleanup.sh`) removes finished run dirs.

## launch wrapper
```
./deploy/sandboxes/sandbox_run.sh --kind subagent --timeout 900 -- bash -c '<run body>'
```
Creates the run dir, stamps state.json, executes `<run body>` with workdir
set to data/sandboxes/<run-id>/work/, captures stdout+stderr to logs/,
returns the exit code.
