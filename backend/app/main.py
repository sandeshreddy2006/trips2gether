from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import Base, engine, get_db
from . import models  # Import models to register them with SQLAlchemy
print("[Startup] Running Base.metadata.create_all...")


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
        "https://trips2gether.com",
        "https://www.trips2gether.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)