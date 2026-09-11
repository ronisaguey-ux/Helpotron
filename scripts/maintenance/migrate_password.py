from server.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Add password_hash and password_salt columns if they don't exist
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(128)"))
            print("Added password_hash column")
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                print("password_hash column already exists")
            else:
                print(f"Error adding password_hash: {e}")
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_salt VARCHAR(64)"))
            print("Added password_salt column")
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                print("password_salt column already exists")
            else:
                print(f"Error adding password_salt: {e}")
        conn.commit()

if __name__ == "__main__":
    migrate()
