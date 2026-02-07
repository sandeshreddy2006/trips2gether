import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

def _from_railway_vars() -> str | None:
    """
    Build a SQLAlchemy MySQL URL from Railway's individual env vars.
    Works whether the backend runs on Railway (mysql.railway.internal) or locally (if you copy vars).
    """
    user = os.getenv("MYSQLUSER") or os.getenv("MYSQL_USER")
    password = os.getenv("MYSQLPASSWORD") or os.getenv("MYSQL_PASSWORD")
    host = os.getenv("MYSQLHOST") or os.getenv("MYSQL_HOST")
    port = os.getenv("MYSQLPORT") or os.getenv("MYSQL_PORT") or "3306"
    db   = os.getenv("MYSQLDATABASE") or os.getenv("MYSQL_DATABASE")
    if not all([user, password, host, port, db]):
        return None
    # Internal Railway host usually doesn't require SSL. If you connect externally, append &ssl=true.
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{db}?charset=utf8mb4"

def _normalize_url(url: str) -> str:
    """
    Ensure the URL is in the form mysql+pymysql://... and includes charset.
    """
    norm = url
    if norm.startswith("mysql://"):
        norm = norm.replace("mysql://", "mysql+pymysql://", 1)
    if "charset=" not in norm:
        norm += ("&" if "?" in norm else "?") + "charset=utf8mb4"
    return norm

DB_URL = os.getenv("DB_URL") or os.getenv("DATABASE_URL")
if DB_URL:
    DB_URL = _normalize_url(DB_URL)
else:
    DB_URL = _from_railway_vars()

if not DB_URL:
    raise RuntimeError(
        "No database URL found. Set DB_URL / DATABASE_URL or the Railway MYSQL* vars."
    )

engine = create_engine(DB_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()