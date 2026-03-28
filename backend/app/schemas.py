from datetime import datetime
from pydantic import BaseModel, EmailStr, StringConstraints, Field, field_validator
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
    avatar_url: str | None = None


class GroupOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    status: str = "planning"
    created_by: int
    created_at: datetime | None = None
    member_count: int = 0
    role: str | None = None


class GroupListOut(BaseModel):
    groups: list[GroupOut]


class GroupUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: Literal["planning", "confirmed", "finalized"] | None = None


class GroupAddMembersIn(BaseModel):
    user_ids: list[int] = Field(min_length=1, description="List of user IDs to invite")


class GroupMemberListOut(BaseModel):
    members: list[GroupMemberOut]


class GroupUpdateRoleIn(BaseModel):
    role: Literal["member", "admin", "viewer"]


class ProfileOut(BaseModel):
    id: int
    user_id: int
    email: str
    username: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    travel_mode: Optional[str] = None
    preferred_destination: Optional[str] = None
    travel_pace: Optional[str] = None
    hotel_type: Optional[str] = None
    room_sharing: Optional[str] = None
    cuisine_preference: Optional[str] = None
    dietary_restrictions: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    username: Optional[Annotated[str, StringConstraints(min_length=1, max_length=100)]] = None
    email: Optional[str] = None
    bio: Optional[Annotated[str, StringConstraints(max_length=500)]] = None
    budget_min: Optional[int] = Field(None, ge=0, description="Minimum budget must be non-negative")
    budget_max: Optional[int] = Field(None, ge=0, description="Maximum budget must be non-negative")
    travel_mode: Optional[str] = None
    preferred_destination: Optional[str] = None
    travel_pace: Optional[Literal["Slow", "Moderate", "Fast", "Very Fast"]] = None
    hotel_type: Optional[str] = None
    room_sharing: Optional[str] = None
    cuisine_preference: Optional[str] = None
    dietary_restrictions: Optional[str] = None
    
    @field_validator('budget_min', 'budget_max')
    @classmethod
    def validate_budget(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v > 1000000:  # Reasonable max budget
            raise ValueError('Budget cannot exceed $1,000,000')
        return v
    
    @field_validator('budget_max')
    @classmethod
    def validate_budget_range(cls, v: Optional[int], info) -> Optional[int]:
        if v is not None and 'budget_min' in info.data and info.data['budget_min'] is not None:
            if info.data['budget_min'] > v:
                raise ValueError('Minimum budget cannot be greater than maximum budget')
        return v


# -------------------------
# Destination Search Schemas
# -------------------------

class DestinationLocation(BaseModel):
    """Geographic location of a destination"""
    lat: Optional[float] = None
    lng: Optional[float] = None


class DestinationOut(BaseModel):
    """Individual destination result"""
    place_id: str
    name: str
    address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    types: List[str] = []
    photo_url: Optional[str] = None
    photo_reference: Optional[str] = None
    location: Optional[DestinationLocation] = None
    business_status: Optional[str] = None


class DestinationSearchResponse(BaseModel):
    """Response for destination search"""
    status: str  # "success" or "error"
    results: List[DestinationOut]
    message: Optional[str] = None
    cached: Optional[bool] = False
    dummy: Optional[bool] = False


# -------------------------
# Nearby Restaurants Schemas
# -------------------------

class NearbyRestaurantOut(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    price_level: Optional[str] = None
    cuisine_type: Optional[str] = None
    distance_km: Optional[float] = None
    distance_text: Optional[str] = None
    location: Optional[DestinationLocation] = None
    photo_url: Optional[str] = None
    photo_reference: Optional[str] = None


class NearbyRestaurantsResponse(BaseModel):
    status: str
    results: List[NearbyRestaurantOut]
    message: Optional[str] = None
    cached: Optional[bool] = False
    dummy: Optional[bool] = False
    anchor_lat: Optional[float] = None
    anchor_lng: Optional[float] = None
    radius_m: Optional[int] = None


# -------------------------
# Restaurant Detail Schemas
# -------------------------

class OpeningHoursPeriod(BaseModel):
    open_day: Optional[int] = None
    open_time: Optional[str] = None
    close_day: Optional[int] = None
    close_time: Optional[str] = None


class RestaurantOpeningHours(BaseModel):
    open_now: Optional[bool] = None
    weekday_descriptions: List[str] = []
    periods: List[OpeningHoursPeriod] = []


class RestaurantDetailOut(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    price_level: Optional[str] = None
    cuisine_types: List[str] = []
    location: Optional[DestinationLocation] = None
    photo_urls: List[str] = []
    opening_hours: Optional[RestaurantOpeningHours] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    editorial_summary: Optional[str] = None


# -------------------------
# Face Verification Schemas
# -------------------------

class FaceEncodingIn(BaseModel):
    """Submit face encoding for storage"""
    face_encoding: List[float] = Field(..., description="Face descriptor array from face-api.js")


class FaceVerificationCheckIn(BaseModel):
    """Check if user has face verification enabled"""
    email: EmailStr


class FaceVerificationCheckOut(BaseModel):
    """Response indicating if face verification is required"""
    face_verification_enabled: bool
    message: str


class FaceVerificationIn(BaseModel):
    """Submit face encoding for verification during login"""
    face_encoding: List[float] = Field(..., description="Face descriptor array from face-api.js")


class FaceVerificationOut(BaseModel):
    """Response from face verification"""
    success: bool
    message: str
    distance: Optional[float] = None  # For debugging
