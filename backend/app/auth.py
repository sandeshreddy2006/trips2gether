import os
from datetime import datetime, timedelta
from typing import Any, Dict
import re
import requests

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session
from .models import User

# Using Argon2id for password hashing. Byscrypt is not working

pwd_ctx = CryptContext(
    schemes=["argon2"],   # Argon2id
    deprecated="auto",
)

def hash_password(p: str) -> str:
    """Hash a password using Argon2id."""
    return pwd_ctx.hash(p)

def verify_password(p: str, h: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    return pwd_ctx.verify(p, h)

def needs_rehash(h: str) -> bool:
    """Whether a stored hash should be upgraded (e.g., params changed)."""
    return pwd_ctx.needs_update(h)

def is_password_strong(password: str):
    """
    Returns (True, None) if strong, else (False, message) with specific reason.
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return False, "Password must include an uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must include a lowercase letter."
    if not re.search(r"\d", password):
        return False, "Password must include a number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\/'~`]", password):
        return False, "Password must include a special character."
    return True, None


# -------------------------
# JWT settings & helpers
# -------------------------
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGO = os.getenv("JWT_ALGO")
JWT_TTL_SECONDS = int(os.getenv("JWT_TTL_SECONDS", "604800"))  # default: 7 days

def make_jwt(sub: str, user_type: str = "local", extra_claims: Dict[str, Any] | None = None) -> str:
    """
    Create a signed JWT containing subject `sub`, user_type, and expiry.
    Optionally include extra claims.
    """
    now = datetime.utcnow()
    payload: Dict[str, Any] = {
        "sub": sub,
        "type": user_type,
        "iat": now,
        "exp": now + timedelta(seconds=JWT_TTL_SECONDS),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_jwt(token: str) -> Dict[str, Any]:
    """
    Decode & verify a JWT. Raises JWTError on invalid/expired tokens.
    """
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


# -------------------------
# reCAPTCHA verification
# -------------------------
RECAPTCHA_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY")

def verify_recaptcha(token: str) -> tuple[bool, str]:
    """
    Verify a reCAPTCHA v3 token with Google's API.
    Returns (success: bool, message: str)
    """
    if not RECAPTCHA_SECRET_KEY:
        return False, "reCAPTCHA is not configured on the server"
    
    if not token:
        return False, "reCAPTCHA token is required"
    
    try:
        response = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={
                "secret": RECAPTCHA_SECRET_KEY,
                "response": token
            },
            timeout=5
        )
        
        result = response.json()
        
        if result.get("success"):
            return True, "reCAPTCHA verification successful"
        else:
            error_codes = result.get("error-codes", [])
            return False, f"reCAPTCHA verification failed: {', '.join(error_codes)}"
    
    except requests.RequestException as e:
        return False, f"reCAPTCHA verification error: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error during reCAPTCHA verification: {str(e)}"


# -------------------------
# User info helpers
# -------------------------
def get_current_user_info(request: Request, db: Session) -> User:
    """Helper function to get current user info from JWT token in cookies"""
    token = request.cookies.get("authToken")
    if not token:
        raise HTTPException(status_code=401, detail="No session")
    try:
        data = decode_jwt(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    uid = int(data["sub"])
    user = db.get(User, uid)
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user
