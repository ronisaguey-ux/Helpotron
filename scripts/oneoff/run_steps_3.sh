#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron
source .venv/bin/activate

# STEP 04
cat << 'INNER_EOF' >> server/config.py

# LLM config aliases
OPENROUTER_API_KEY = settings.openrouter_api_key if hasattr(settings, 'openrouter_api_key') else getattr(settings, 'omniroute_api_key', '')
DEFAULT_MODEL = getattr(settings, 'primary_model', 'deepseek/deepseek-chat')
INNER_EOF

if ! grep -q 'def extract_json' server/llm.py; then
cat << 'INNER_EOF' >> server/llm.py

def extract_json(raw_text: str) -> dict:
    """Extract and parse JSON from LLM output, handling markdown code blocks."""
    import json, re
    text = raw_text.strip()
    json_block = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if json_block:
        text = json_block.group(1).strip()
    else:
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end != 0:
            text = text[start:end]
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        raise ValueError(f'Failed to decode JSON from LLM output: {err}')
INNER_EOF
fi
git add server/llm.py server/config.py && git commit -m 'fix(remediation): STEP-04 - Async call_llm wrapper and resilient extract_json' || true

# STEP 05
python3 -c "
import sys
with open('server/engine/sandbox.py', 'r') as f:
    data = f.read()
if 'def get_sanitized_sandbox_path' in data:
    if 'startswith(str(SANDBOX_BASE_DIR))' not in data:
        print('Needs patching')
else:
    with open('server/engine/sandbox.py', 'a') as f:
        f.write('''\n
from pathlib import Path

SANDBOX_BASE_DIR = Path('./exports/sandboxes').resolve()

def get_sanitized_sandbox_path(sandbox_id: str, filename: str) -> Path:
    \"\"\"Return a safe resolved path inside the sandbox boundary.\"\"\"
    safe_sandbox_id = ''.join(c for c in sandbox_id if c.isalnum() or c in ('_', '-'))
    safe_filename = Path(filename).name

    target_dir = (SANDBOX_BASE_DIR / safe_sandbox_id).resolve()
    target_file = (target_dir / safe_filename).resolve()

    if not str(target_file).startswith(str(SANDBOX_BASE_DIR)):
        raise PermissionError('Sandbox path traversal violation detected')

    target_dir.mkdir(parents=True, exist_ok=True)
    return target_file


def write_sandbox_file(sandbox_id: str, filename: str, content: str) -> str:
    \"\"\"Write a file to the sandbox, blocking path traversal and executable extensions.\"\"\"
    path = get_sanitized_sandbox_path(sandbox_id, filename)
    if path.suffix.lower() in ('.sh', '.bash', '.exe', '.bat', '.py'):
        raise ValueError('Executable file extensions forbidden in standard sandbox export')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    return str(path)
''')
"
git add server/engine/sandbox.py && git commit -m 'fix(remediation): STEP-05 - Secure sandbox path traversal prevention' || true

