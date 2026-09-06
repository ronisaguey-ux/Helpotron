# Self-hosted detector models (owner 09-06)

Free, in-process AI-detection tier for the 16 GB box — no API keys, no
outbound calls. Two components:

## 1. `human_prelude.txt` (committed, ~39 KB)

Public-domain English prose (Pride & Prejudice body, whitespace-cleaned with
`thinkst-zippy`'s own `clean_text`) used to seed the HUMAN side of the ZipPy
twin-prelude compression heuristic. Stock ZipPy seeds only on an AI prelude
and thereby flags everything "AI"; with a human-corpus seed the stronger-delta
verdict works (see `ZipPyDetector` in `server/detectors.py`).

## 2. `onnx/` (NOT committed — fetch via script)

`scripts/fetch_detector_model.sh` downloads:

- `model_int8.onnx` (126 MB) — INT8-quantized export of
  `openai-community/roberta-base-openai-detector` from
  `onnx-community/roberta-base-openai-detector-ONNX` (same head: label 0
  `Fake` = AI, label 1 `Real` = human).
- `tokenizer.json` + `config.json`.

Runtime deps: `onnxruntime` + `tokenizers` only — no torch/transformers.

The `roberta_onnx` detector is registered at server start only when the
model dir (env `HELPOTRON_DETECTOR_MODEL_DIR`, default
`server/detector_models/onnx`) contains both files; otherwise the stack
degrades to ZipPy-only. Measured on this box: ~345 MB RSS, ~0.7-0.85 s per
512-token input (lazy load, lock-serialized, 24h score cache).
