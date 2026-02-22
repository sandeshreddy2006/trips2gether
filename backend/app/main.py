from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime
from .db import Base, engine, get_db
from . import models  # Import models to register them with SQLAlchemy
from .schemas import LoginIn, RegisterIn, GoogleOAuthIn
from .auth import hash_password, verify_password, is_password_strong, make_jwt, decode_jwt
from jose import JWTError
import os
import requests

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGO = os.getenv("JWT_ALGO")

print("[Startup] Running Base.metadata.create_all...")

# ONE-TIME: Drop user table to reset it
models.User.__table__.drop(bind=engine, checkfirst=True)
print("[Startup] Dropped users table (one-time operation)")

Base.metadata.create_all(bind=engine)
print("[Startup] Finished Base.metadata.create_all.")

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


# -------------------------
# Auth endpoints
# -------------------------

@app.post("/api/auth/register", response_model=dict)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if email already exists
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate password strength if password is provided
    if body.password:
        ok, msg = is_password_strong(body.password)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
    
    # Create new user
    user = models.User(
        email=body.email,
        password_hash=hash_password(body.password) if body.password else None,
        name=body.name or body.email.split("@")[0],
        latitude=body.latitude,
        longitude=body.longitude,
        location=body.location
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {"ok": True, "user": {"id": user.id, "email": user.email, "name": user.name}}


@app.post("/api/auth/login", response_model=dict)
def login(response: Response, body: LoginIn, db: Session = Depends(get_db)):
    """Login with email and password"""
    # Find user by email
    user = db.query(models.User).filter(models.User.email == body.email).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password (user must have password_hash set for password login)
    if not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Update user location if provided
    if body.latitude is not None:
        user.latitude = body.latitude
    if body.longitude is not None:
        user.longitude = body.longitude
    if body.location:
        user.location = body.location
    db.commit()
    
    # Create JWT token
    token = make_jwt(str(user.id), user_type="local", extra_claims={"email": user.email})
    
    # Set cookie with optional longer TTL for "Remember Me"
    remember_me = body.rememberMe or False
    
    # 1 day if not remember me, 7 days if remember me
    ttl_seconds = 7 * 24 * 60 * 60 if remember_me else 24 * 60 * 60
    
    cookie_kwargs = {
        "key": "authToken",
        "value": token,
        "httponly": True,
        "secure": os.getenv("ENVIRONMENT") == "production",
        "samesite": "lax",
        "path": "/",
        "max_age": ttl_seconds,
    }
    
    response.set_cookie(**cookie_kwargs)
    
    # Return token and user info
    result = {
        "ok": True,
        "user": {"id": user.id, "email": user.email, "name": user.name}
    }
    if remember_me:
        result["token"] = token
    
    return result


@app.post("/api/auth/logout", response_model=dict)
def logout(response: Response):
    """Logout user by clearing auth cookie"""
    response.delete_cookie("authToken", path="/")
    return {"ok": True}


@app.post("/api/auth/google", response_model=dict)
def google_login(response: Response, body: GoogleOAuthIn, db: Session = Depends(get_db)):
    """Google OAuth login/registration"""
    access_token = body.token
    latitude = body.latitude
    longitude = body.longitude
    location_str = body.location
    remember_me = body.rememberMe

    # Verify token and get user info from Google
    try:
        userinfo_response = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if not userinfo_response.ok:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        userinfo = userinfo_response.json()
    except requests.RequestException:
        raise HTTPException(status_code=400, detail="Failed to verify Google token")
    
    email = userinfo.get("email")
    name = userinfo.get("name")
    google_id = userinfo.get("sub")
    
    if not email or not google_id:
        raise HTTPException(status_code=400, detail="Google account info incomplete")

    # Check if user already exists (by email or google_client_id)
    user = db.query(models.User).filter(
        (models.User.email == email) | (models.User.google_client_id == google_id)
    ).first()
    
    if user:
        # Existing user - update google_client_id if not set, and location if provided
        if not user.google_client_id:
            user.google_client_id = google_id
        
        if latitude is not None:
            user.latitude = latitude
        if longitude is not None:
            user.longitude = longitude
        if location_str:
            user.location = location_str
    else:
        # New user - create account via Google (no password)
        user = models.User(
            email=email,
            name=name,
            google_client_id=google_id,
            password_hash=None,
            latitude=latitude,
            longitude=longitude,
            location=location_str
        )
        db.add(user)
    
    db.commit()
    db.refresh(user)
    
    # Create JWT token
    token = make_jwt(str(user.id), user_type="google", extra_claims={"email": user.email})
    
    # Set cookie with TTL based on remember_me
    ttl_seconds = 7 * 24 * 60 * 60 if remember_me else 24 * 60 * 60
    
    cookie_kwargs = {
        "key": "authToken",
        "value": token,
        "httponly": True,
        "secure": os.getenv("ENVIRONMENT") == "production",
        "samesite": "lax",
        "path": "/",
        "max_age": ttl_seconds,
    }
    
    response.set_cookie(**cookie_kwargs)
    
    return {
        "ok": True,
        "user": {"id": user.id, "email": user.email, "name": user.name}
    }


@app.get("/api/auth/me", response_model=dict)
def get_current_user(request: Request, db: Session = Depends(get_db)):
    """Get current authenticated user info"""
    token = request.cookies.get("authToken")
    
    if not token:
        raise HTTPException(status_code=401, detail="No session")
    
    try:
        data = decode_jwt(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    uid = int(data["sub"])
    user = db.get(models.User, uid)
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "location": user.location,
        "latitude": user.latitude,
        "longitude": user.longitude,
    }


