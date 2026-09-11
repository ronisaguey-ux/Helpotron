#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron
source .venv/bin/activate

# STEP 02
if ! grep -q 'def convert_audio_to_wav' server/transcription.py; then
cat << 'INNER_EOF' >> server/transcription.py

import subprocess
from pathlib import Path as _Path

def convert_audio_to_wav(input_path: str, output_path: str) -> str:
    """Convert audio file to WAV using ffmpeg with shell injection protection."""
    inp = _Path(input_path).resolve()
    outp = _Path(output_path).resolve()

    # Strict whitelist validation for file extensions
    allowed_exts = {'.mp3', '.m4a', '.wav', '.ogg', '.webm', '.aac', '.mp4'}
    if inp.suffix.lower() not in allowed_exts or outp.suffix.lower() != '.wav':
        raise ValueError('Invalid audio format extension')

    if not inp.exists() or not inp.is_file():
        raise FileNotFoundError(f'Input audio file does not exist: {inp}')

    args = [
        'ffmpeg', '-y', '-nostdin',
        '-i', str(inp),
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        str(outp)
    ]

    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f'ffmpeg conversion failed: {result.stderr[:300]}')
    return str(outp)
INNER_EOF
fi
git add server/transcription.py && git commit -m 'fix(remediation): STEP-02 - Eliminate command injection in audio processing' || true

# STEP 03
if ! grep -q 'def deduct_credits_atomic' server/credits.py; then
cat << 'INNER_EOF' >> server/credits.py

from sqlalchemy import update
import uuid as _uuid

def deduct_credits_atomic(user_id: str, amount: int, description: str, db, idempotency_key: str = None) -> bool:
    """Atomically deduct credits using database-level UPDATE to prevent double-spending."""
    if amount <= 0:
        return True

    from .database import CreditTransaction, User
    if idempotency_key:
        existing = db.query(CreditTransaction).filter(
            CreditTransaction.idempotency_key == idempotency_key
        ).first()
        if existing:
            return True

    # Atomic conditional update prevents concurrent double-spending
    stmt = (
        update(User)
        .where((User.id == user_id) & (User.credits >= amount))
        .values(credits=User.credits - amount)
        .execution_options(synchronize_session="fetch")
    )
    result = db.execute(stmt)
    if result.rowcount == 0:
        db.rollback()
        return False

    tx = CreditTransaction(
        user_id=user_id,
        delta=-amount,
        reason=description,
        idempotency_key=idempotency_key,
    )
    db.add(tx)
    db.commit()
    return True
INNER_EOF
fi
git add server/credits.py && git commit -m 'fix(remediation): STEP-03 - Atomic credit transactions with idempotency' || true

