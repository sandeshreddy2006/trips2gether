from datetime import datetime
from pydantic import BaseModel, EmailStr, StringConstraints, Field
from typing import Optional, Annotated, List, Literal, Any, Dict

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location: str | None = None
    recaptchaToken: str | None = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    latitude: float | None = None
    longitude: float | None = None
    location: str | None = None
    rememberMe: bool = False
    recaptchaToken: str | None = None

class GoogleOAuthIn(BaseModel):
    token: str
    latitude: float | None = None
    longitude: float | None = None
    location: str | None = None
    rememberMe: bool = False

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    location: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    created_at: datetime | None = None


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class VerifyResetCodeIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)


class FriendRequestIn(BaseModel):
    identifier: str = Field(min_length=1, description="Friend email or username")


class FriendOut(BaseModel):
    id: int
    email: str
    name: str
    avatar_url: str | None = None
    status: str


class FriendsListOut(BaseModel):
    friends: list[FriendOut]


class FriendRequestListOut(BaseModel):
    incoming: list[FriendOut]
    outgoing: list[FriendOut]


class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class GroupMemberOut(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    role: str


class GroupOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_by: int
    created_at: datetime | None = None
    member_count: int = 0
    role: str | None = None


class GroupListOut(BaseModel):
    groups: list[GroupOut]
