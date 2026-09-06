#!/usr/bin/env bash
# Fetch the INT8 ONNX AI-detector model for the free self-hosted tier
# (owner 09-06: ZipPy + RoBERTa-ONNX in-process detectors).
#
# Downloads the pre-exported INT8 quantized RoBERTa classifier from
# onnx-community/roberta-base-openai-detector-ONNX (itself an export of
# openai-community/roberta-base-openai-detector — the OpenAI GPT-2 detector).
# NO torch/transformers needed: runtime inference is onnxruntime + tokenizers.
#
# Usage:
#   scripts/fetch_detector_model.sh [target_dir]
#   default target: server/detector_models/onnx
#
# Sets HELPOTRON_DETECTOR_MODEL_DIR (in the shell) to the target dir; the
# server registers the "roberta_onnx" detector only when model_int8.onnx and
# tokenizer.json are present (graceful degrade to ZipPy-only otherwise).
set -euo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$BASE/server/detector_models/onnx}"
HF="https://huggingface.co/onnx-community/roberta-base-openai-detector-ONNX/resolve/main"
MODEL=onnx/model_int8.onnx
TOK=tokenizer.json
CONF=config.json
MIN_BYTES=104857600  # 100 MB — guard against empty/HTML error pages

mkdir -p "$TARGET"

fetch() {
    # $1=url $2=output $3=min-bytes guard (default 100 MB for the model)
    local url="$1" out="$2" min="${3:-$MIN_BYTES}"
    echo ">> $url"
    curl --fail --location --retry 3 --retry-all-errors --max-time 600 \
         -o "$out.tmp" "$url"
    local bytes; bytes="$(stat -c%s "$out.tmp" 2>/dev/null || stat -f%z "$out.tmp")"
    if [ "$bytes" -lt "$min" ]; then
        echo "ERROR: '$out' too small ($bytes bytes) — not a real download; aborting." >&2
        rm -f "$out.tmp"
        exit 1
    fi
    mv "$out.tmp" "$out"
    echo "   saved $out ($bytes bytes)"
}

fetch "$HF/$MODEL" "$TARGET/model_int8.onnx" 104857600
fetch "$HF/$TOK"   "$TARGET/tokenizer.json" 524288
curl --fail --location --max-time 60 -o "$TARGET/config.json" "$HF/$CONF"

echo ""
echo "OK — model dir ready: $TARGET"
echo "In .env (or environment): HELPOTRON_DETECTOR_MODEL_DIR=$TARGET"
echo "Restart the API to register the roberta_onnx detector."
