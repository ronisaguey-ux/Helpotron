#!/usr/bin/env python3
"""Create or update admin user securely.

Usage: ADMIN_PASSWORD="your-secure-pass" python scripts/create_admin.py
"""

import sys
import os
import secrets
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from server.database import SessionLocal, User, init_db
from server.security import hash_password
from server.config import config

def create_admin():
    """Create or update the admin user."""
    init_db()
    db = SessionLocal()

    admin_public_id = os.getenv("ADMIN_PUBLIC_ID", "RoniDev")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password:
        admin_password = secrets.token_urlsafe(16)
        print(f"⚠️  No ADMIN_PASSWORD provided. Generated random password: {admin_password}")

    # Check if admin already exists
    user = db.query(User).filter(User.public_id == admin_public_id).first()
    if user:
        print(f"✅ Admin user '{admin_public_id}' already exists. Updating password...")
    else:
        user = User(public_id=admin_public_id, plan="elite", credits=9999.0, settings={"reading_level": "college-freshman"})
        db.add(user)
        db.flush()
        print(f"✅ Created admin user '{admin_public_id}'.")

    # Hash and set password
    hashed, salt = hash_password(admin_password)
    user.password_hash = hashed
    user.password_salt = salt

    db.commit()
    db.close()
    print(f"✅ Admin credentials set successfully.")
    print(f"   Public ID: {admin_public_id}")

if __name__ == "__main__":
    create_admin()
