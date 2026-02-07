from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import Base, engine, get_db
from . import models  # Import models to register them with SQLAlchemy
print("[Startup] Running Base.metadata.create_all...")
# MySQL-specific: drop the verification_tokens table so it will be recreated
# by SQLAlchemy with the updated model (e.g. allow NULL user_id). This is
# destructive for that table only. Make sure you have a backup before running
# in production.

Base.metadata.create_all(bind=engine)
print("[Startup] Finished Base.metadata.create_all.")

print("[Startup] Running ensure_all_tables_columns...")
print("[Startup] Finished ensure_all_tables_columns.")

app = FastAPI(title="trips2gether API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8888",
        "https://trips2gether.netlify.app",
        "https://thefilmfoodie.com",
        "https://www.thefilmfoodie.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)