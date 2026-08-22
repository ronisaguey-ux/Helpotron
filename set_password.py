from server.database import SessionLocal, User
from server.security import hash_password

def set_password(public_id, password):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user:
            h, s = hash_password(password)
            user.password_hash = h
            user.password_salt = s
            db.commit()
            print(f"Password set for {public_id}")
        else:
            print(f"User {public_id} not found")
    finally:
        db.close()

if __name__ == "__main__":
    set_password("RoniDev", "<REDACTED-DEV-PASSWORD>")
