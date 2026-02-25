from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
from .db import Base, engine, get_db
from . import models  # Import models to register them with SQLAlchemy
from .schemas import (
    LoginIn,
    RegisterIn,
    GoogleOAuthIn,
    ForgotPasswordIn,
    VerifyResetCodeIn,
    ResetPasswordIn,
    FriendRequestIn,
    FriendsListOut,
    FriendRequestListOut,
    GroupCreateIn,
    GroupOut,
    GroupListOut,
    ProfileOut, 
    ProfileUpdate,
)
from .auth import (
    hash_password,
    verify_password,
    is_password_strong,
    make_jwt,
    decode_jwt,
    verify_recaptcha,
    get_current_user_info,
)
from .email_utils import send_email, get_welcome_email_template, get_login_email_template, get_password_reset_email_template
from .cloudflare import delete_image_from_cloudflare, upload_image_to_cloudflare
from jose import JWTError
import os
import requests
from apscheduler.schedulers.background import BackgroundScheduler

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGO = os.getenv("JWT_ALGO")

print("[Startup] Running Base.metadata.create_all...")

Base.metadata.create_all(bind=engine)
print("[Startup] Finished Base.metadata.create_all.")

app = FastAPI(title="trips2gether API")

# Initialize scheduler for cleanup tasks
scheduler = BackgroundScheduler()

@app.on_event("startup")
def start_scheduler():
    """Start background scheduler for cleanup tasks"""
    
    def cleanup_job():
        """Background job to clean up expired tokens"""
        db = next(get_db())
        try:
            current_time = datetime.now()
            deleted_count = db.query(models.PasswordResetToken).filter(
                models.PasswordResetToken.expires_at < current_time
            ).delete()
            db.commit()
            print(f"[Cleanup Job] Deleted {deleted_count} expired password reset tokens")
        except Exception as e:
            print(f"[Cleanup Job] Error: {e}")
        finally:
            db.close()
    
    # Schedule cleanup to run every 5 minutes
    scheduler.add_job(cleanup_job, 'interval', minutes=5, id='cleanup_expired_tokens')
    scheduler.start()
    print("[Startup] Background scheduler started - cleanup job scheduled every 5 minutes")

@app.on_event("shutdown")
def stop_scheduler():
    """Stop background scheduler on shutdown"""
    scheduler.shutdown()
    print("[Shutdown] Background scheduler stopped")
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

@app.post("/auth/register", response_model=dict)
def register(body: RegisterIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Register a new user"""
    # Verify reCAPTCHA (required)
    success, msg = verify_recaptcha(body.recaptchaToken)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    # Check if email already exists
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate username - no commas allowed
    if "," in body.name:
        raise HTTPException(status_code=400, detail="Username cannot contain commas")
    
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
    
    # Create a profile for the new user
    profile = models.Profile(
        user_id=user.id,
        email=user.email,
        username=user.name
    )
    db.add(profile)
    db.commit()
    
    # Send welcome email in background (don't block response)
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=body.email,
            subject="Welcome to Trip2Gether! ✈️",
            body=get_welcome_email_template(user.name)
        )
    except Exception as e:
        print(f"Failed to queue welcome email: {e}")
    
    return {"ok": True, "user": {"id": user.id, "email": user.email, "name": user.name}}


@app.post("/auth/login", response_model=dict)
def login(response: Response, body: LoginIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Login with email and password"""
    # Verify reCAPTCHA (required)
    success, msg = verify_recaptcha(body.recaptchaToken)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    # Find user by email
    user = db.query(models.User).filter(models.User.email == body.email).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    # Verify password (user must have password_hash set for password login)
    if not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
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
    
    # Send login notification email in background (don't block response)
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=user.email,
            subject="Login Notification - Trip2Gether 🔐",
            body=get_login_email_template(user.name)
        )
    except Exception as e:
        print(f"Failed to queue login notification email: {e}")
    
    # Return token and user info
    result = {
        "ok": True,
        "user": {"id": user.id, "email": user.email, "name": user.name}
    }
    if remember_me:
        result["token"] = token
    
    return result


@app.post("/auth/logout", response_model=dict)
def logout(response: Response):
    """Logout user by clearing auth cookie"""
    response.delete_cookie("authToken", path="/")
    return {"ok": True}


@app.post("/auth/google", response_model=dict)
def google_login(response: Response, body: GoogleOAuthIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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
    
    # Send login notification email in background (don't block response)
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=user.email,
            subject="Login Notification - Trip2Gether 🔐",
            body=get_login_email_template(user.name)
        )
    except Exception as e:
        print(f"Failed to queue login notification email: {e}")
    
    return {
        "ok": True,
        "user": {"id": user.id, "email": user.email, "name": user.name}
    }


@app.get("/auth/me", response_model=dict)
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


def _friend_out(user: models.User, status: str) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": "/UserIcon.svg",
        "status": status,
    }


@app.get("/friends", response_model=FriendsListOut)
def list_friends(request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)

    friendships = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.status == "accepted",
            or_(
                models.Friendship.requester_id == current_user.id,
                models.Friendship.addressee_id == current_user.id,
            ),
        )
        .all()
    )

    friend_ids: list[int] = []
    for row in friendships:
        friend_ids.append(row.addressee_id if row.requester_id == current_user.id else row.requester_id)

    if not friend_ids:
        return {"friends": []}

    users = db.query(models.User).filter(models.User.id.in_(friend_ids)).all()
    users_by_id = {u.id: u for u in users}

    friends = []
    for friend_id in friend_ids:
        friend_user = users_by_id.get(friend_id)
        if friend_user:
            friends.append(_friend_out(friend_user, "accepted"))

    return {"friends": friends}


@app.get("/friends/requests", response_model=FriendRequestListOut)
def list_friend_requests(request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)

    incoming_rows = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.status == "pending",
            models.Friendship.addressee_id == current_user.id,
        )
        .all()
    )
    outgoing_rows = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.status == "pending",
            models.Friendship.requester_id == current_user.id,
        )
        .all()
    )

    incoming_ids = [row.requester_id for row in incoming_rows]
    outgoing_ids = [row.addressee_id for row in outgoing_rows]
    lookup_ids = list(set(incoming_ids + outgoing_ids))
    users = db.query(models.User).filter(models.User.id.in_(lookup_ids)).all() if lookup_ids else []
    users_by_id = {u.id: u for u in users}

    incoming = [_friend_out(users_by_id[u], "pending") for u in incoming_ids if u in users_by_id]
    outgoing = [_friend_out(users_by_id[u], "pending") for u in outgoing_ids if u in users_by_id]

    return {"incoming": incoming, "outgoing": outgoing}


@app.post("/friends/request", response_model=dict)
def send_friend_request(body: FriendRequestIn, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    identifier = body.identifier.strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Please enter a username or email")

    target_user = (
        db.query(models.User)
        .filter(
            or_(
                func.lower(models.User.email) == identifier.lower(),
                func.lower(models.User.name) == identifier.lower(),
            )
        )
        .first()
    )
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    existing = (
        db.query(models.Friendship)
        .filter(
            or_(
                and_(
                    models.Friendship.requester_id == current_user.id,
                    models.Friendship.addressee_id == target_user.id,
                ),
                and_(
                    models.Friendship.requester_id == target_user.id,
                    models.Friendship.addressee_id == current_user.id,
                ),
            )
        )
        .first()
    )

    if existing and existing.status == "accepted":
        raise HTTPException(status_code=400, detail="You are already friends")

    if existing and existing.status == "pending":
        if existing.requester_id == current_user.id:
            raise HTTPException(status_code=400, detail="Friend request already sent")
        existing.status = "accepted"
        db.commit()
        return {"ok": True, "message": "Friend request accepted", "status": "accepted"}

    friendship = models.Friendship(
        requester_id=current_user.id,
        addressee_id=target_user.id,
        status="pending",
    )
    db.add(friendship)
    db.commit()

    return {"ok": True, "message": "Friend request sent", "status": "pending"}


@app.post("/friends/accept/{requester_user_id}", response_model=dict)
def accept_friend_request(requester_user_id: int, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)

    if requester_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Invalid requester")

    friendship = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.requester_id == requester_user_id,
            models.Friendship.addressee_id == current_user.id,
            models.Friendship.status == "pending",
        )
        .first()
    )
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")

    friendship.status = "accepted"
    db.commit()
    return {"ok": True, "message": "Friend request accepted"}


@app.delete("/friends/{other_user_id}", response_model=dict)
def remove_friendship(other_user_id: int, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    if other_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    friendship = (
        db.query(models.Friendship)
        .filter(
            or_(
                and_(
                    models.Friendship.requester_id == current_user.id,
                    models.Friendship.addressee_id == other_user_id,
                ),
                and_(
                    models.Friendship.requester_id == other_user_id,
                    models.Friendship.addressee_id == current_user.id,
                ),
            )
        )
        .first()
    )
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")

    db.delete(friendship)
    db.commit()
    return {"ok": True, "message": "Friend removed"}


@app.post("/auth/forgot-password", response_model=dict)
def forgot_password(body: ForgotPasswordIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Request password reset - sends email with code and link"""
    from .auth import generate_unique_reset_token, generate_reset_link
    
    user = db.query(models.User).filter(models.User.email == body.email).first()
    
    if not user:
        # We protect email for privacy
        return {"ok": True, "message": "If this email exists, a reset link will be sent."}
    
    # Delete any existing reset tokens for this email
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.email == body.email
    ).delete()
    db.commit()
    
    # Generate unique 6-digit token
    reset_token = generate_unique_reset_token(db)
    reset_link = generate_reset_link(body.email, reset_token)
    
    # Create expiration time (1 hour from now)
    expires_at = datetime.now() + timedelta(hours=1)
    
    # Store reset token in database
    reset_record = models.PasswordResetToken(
        email=body.email,
        token=reset_token,
        link=reset_link,
        expires_at=expires_at
    )
    db.add(reset_record)
    db.commit()
    
    # Send reset email in background
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=body.email,
            subject="Password Reset - Trip2Gether 🔑",
            body=get_password_reset_email_template(body.email, reset_token, reset_link)
        )
    except Exception as e:
        print(f"Failed to queue reset email: {e}")
    
    return {"ok": True, "message": "If this email exists, a reset link will be sent."}


@app.post("/auth/verify-reset-code", response_model=dict)
def verify_reset_code(body: VerifyResetCodeIn, db: Session = Depends(get_db)):
    """Verify that reset code is valid and not expired"""
    reset_record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.email == body.email,
        models.PasswordResetToken.token == body.code
    ).first()
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid reset code")
    
    if reset_record.used:
        raise HTTPException(status_code=400, detail="Reset code has already been used")
    
    if reset_record.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="Reset code has expired")
    
    return {"ok": True, "message": "Code is valid"}


@app.post("/auth/reset-password", response_model=dict)
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    """Reset password using valid code"""
    # Find valid reset token
    reset_record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.email == body.email,
        models.PasswordResetToken.token == body.code
    ).first()
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid reset code")
    
    if reset_record.used:
        raise HTTPException(status_code=400, detail="Reset code has already been used")
    
    if reset_record.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="Reset code expired")
    
    # Find user and validate new password
    user = db.query(models.User).filter(models.User.email == body.email).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    
    # Validate new password strength
    ok, msg = is_password_strong(body.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    
    # Check if new password is same as current password
    if user.password_hash and verify_password(body.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="New password cannot be the same as your current password")
    
    # Update password
    user.password_hash = hash_password(body.new_password)
    db.commit()
    
    # Delete reset token after successful password reset
    db.delete(reset_record)
    db.commit()
    
    return {"ok": True, "message": "Password reset successful"}


@app.post("/auth/cleanup-expired-tokens", response_model=dict)
def cleanup_expired_tokens(db: Session = Depends(get_db)):
    """
    Delete all expired password reset tokens from database.
    Can be called by a scheduled job or manually.
    """
    current_time = datetime.now()
    
    # Delete all tokens that have expired
    deleted_count = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.expires_at < current_time
    ).delete()
    
    db.commit()
    
    return {"ok": True, "message": f"Deleted {deleted_count} expired tokens"}


# -------------------------
# Group endpoints
# -------------------------

@app.post("/groups", response_model=dict)
def create_group(body: GroupCreateIn, request: Request, db: Session = Depends(get_db)):
    """Create a new travel group. The creator is automatically assigned as Owner."""
    current_user = get_current_user_info(request, db)

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")

    group = models.Group(
        name=name,
        description=body.description.strip() if body.description else None,
        created_by=current_user.id,
    )
    db.add(group)
    db.flush()

    owner = models.GroupMember(
        group_id=group.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(owner)
    db.commit()
    db.refresh(group)

    return {
        "ok": True,
        "group": {
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "created_by": group.created_by,
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "member_count": 1,
            "role": "owner",
        },
    }


@app.get("/groups", response_model=GroupListOut)
def list_my_groups(request: Request, db: Session = Depends(get_db)):
    """List all groups the current user belongs to."""
    current_user = get_current_user_info(request, db)

    memberships = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.user_id == current_user.id)
        .all()
    )

    if not memberships:
        return {"groups": []}

    group_ids = [m.group_id for m in memberships]
    role_map = {m.group_id: m.role for m in memberships}

    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()

    member_counts = {}
    for gid in group_ids:
        member_counts[gid] = (
            db.query(func.count(models.GroupMember.id))
            .filter(models.GroupMember.group_id == gid)
            .scalar()
        )

    result = []
    for g in groups:
        result.append(
            GroupOut(
                id=g.id,
                name=g.name,
                description=g.description,
                created_by=g.created_by,
                created_at=g.created_at,
                member_count=member_counts.get(g.id, 0),
                role=role_map.get(g.id),
            )
        )

    return {"groups": result}
# Profile Endpoints

@app.get("/profile/get", response_model=ProfileOut)
def get_profile(request: Request, db: Session = Depends(get_db)):
    """
    Get user's profile by verifying JWT token
    """
    user = get_current_user_info(request, db)
    
    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return profile


@app.post("/profile/create", response_model=ProfileOut)
def create_profile(request: Request, db: Session = Depends(get_db)):
    """
    Create a new profile for authenticated user.
    Called when user registers or first time profile setup.
    """
    user = get_current_user_info(request, db)
    
    # Check if profile already exists
    existing_profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if existing_profile:
        raise HTTPException(status_code=400, detail="Profile already exists")
    
    # Create new profile with user's basic info
    new_profile = models.Profile(
        user_id=user.id,
        email=user.email,
        username=user.name,
        avatar_url=None,
        bio=None
    )
    
    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)
    
    return new_profile


@app.put("/profile/update", response_model=ProfileOut)
async def update_profile(profile_update: ProfileUpdate, request: Request, db: Session = Depends(get_db)):
    """
    Update user's profile preferences
    """
    user = get_current_user_info(request, db)
    
    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Update only provided fields
    update_data = profile_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    
    profile.updated_at = datetime.now()
    db.commit()
    db.refresh(profile)
    
    return profile


@app.post("/profile/upload-avatar")
async def upload_avatar(file: UploadFile = File(...), request: Request = None, db: Session = Depends(get_db)):
    """
    Upload an avatar image to Cloudflare and update user's profile
    """
    user = get_current_user_info(request, db)
    
    # Validate file type
    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Validate file size (max 10MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 10MB")
    
    # Reset file position after reading
    await file.seek(0)
    
    # Get user's profile
    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Delete old avatar from Cloudflare if exists
    if profile.avatar_url:
        delete_image_from_cloudflare(profile.avatar_url)
    
    # Upload new image to Cloudflare
    image_url = await upload_image_to_cloudflare(file)
    
    # Update profile with new avatar URL
    profile.avatar_url = image_url
    profile.updated_at = datetime.now()
    db.commit()
    db.refresh(profile)
    
    return {
        "ok": True,
        "avatar_url": image_url,
        "profile": profile
    }
