from datetime import datetime, date
from pydantic import BaseModel, EmailStr, StringConstraints, Field, field_validator, model_validator
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
    trip_item_count: int = 0
    trip_start_at: datetime | None = None
    trip_end_at: datetime | None = None


class GroupListOut(BaseModel):
    groups: list[GroupOut]


class GroupUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: Literal["planning", "confirmed", "finalized", "upcoming", "active", "archived"] | None = None


class TripStateUpdateIn(BaseModel):
    status: Literal["planning", "upcoming", "active", "archived"]


class PollOptionCreateIn(BaseModel):
    label: str = Field(min_length=1, max_length=255)


class GroupPollCreateIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    decision_type: Literal["destination", "flight", "hotel", "activity", "other"] = "other"
    closes_at: datetime
    allow_vote_update: bool = True
    options: list[PollOptionCreateIn] = Field(min_length=2, max_length=12)


class GroupPollVoteIn(BaseModel):
    option_id: int


class GroupNotificationOut(BaseModel):
    id: int
    user_id: int
    group_id: int
    poll_id: int | None = None
    notification_type: str
    title: str
    body: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class GroupNotificationListOut(BaseModel):
    items: list[GroupNotificationOut]


class GroupAddMembersIn(BaseModel):
    user_ids: list[int] = Field(min_length=1, description="List of user IDs to invite")


class GroupMemberListOut(BaseModel):
    members: list[GroupMemberOut]


class GroupUpdateRoleIn(BaseModel):
    role: Literal["member", "admin", "viewer"]


class GroupShortlistCreateIn(BaseModel):
    place_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    address: str | None = None
    photo_url: str | None = None
    photo_reference: str | None = None
    rating: float | None = None
    types: list[str] = Field(default_factory=list)


class GroupShortlistItemOut(BaseModel):
    id: int
    group_id: int
    place_id: str
    name: str
    address: str | None = None
    photo_url: str | None = None
    photo_reference: str | None = None
    rating: float | None = None
    types: list[str] = []
    added_by: int
    created_at: datetime


class GroupShortlistListOut(BaseModel):
    items: list[GroupShortlistItemOut]


class GroupShortlistFlightCreateIn(BaseModel):
    flight_offer_id: str = Field(min_length=1)
    airline: str = Field(min_length=1)
    logo_url: str | None = None
    price: float
    currency: str = Field(min_length=1)
    duration: str = Field(min_length=1)
    stops: int = Field(ge=0)
    departure_time: str | None = None
    arrival_time: str | None = None
    departure_airport: str = Field(min_length=1)
    arrival_airport: str = Field(min_length=1)
    cabin_class: str | None = None
    baggages: list[dict] = Field(default_factory=list)
    slices: list[dict] = Field(default_factory=list)
    emissions_kg: str | None = None


class GroupShortlistFlightItemOut(BaseModel):
    id: int
    group_id: int
    flight_offer_id: str
    airline: str
    logo_url: str | None = None
    price: float
    currency: str
    duration: str
    stops: int
    departure_time: str | None = None
    arrival_time: str | None = None
    departure_airport: str
    arrival_airport: str
    cabin_class: str | None = None
    baggages: list[dict] = []
    slices: list[dict] = []
    emissions_kg: str | None = None
    added_by: int
    created_at: datetime


class GroupShortlistFlightListOut(BaseModel):
    items: list[GroupShortlistFlightItemOut]


class GroupShortlistHotelCreateIn(BaseModel):
    place_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    address: str | None = None
    photo_url: str | None = None
    photo_reference: str | None = None
    rating: float | None = None
    price_level: str | None = None
    currency: str = "USD"
    price_per_night: float | None = None
    total_price: float | None = None
    nights: int | None = Field(default=None, ge=1)
    types: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    booking_url: str | None = None


class GroupShortlistHotelItemOut(BaseModel):
    id: int
    group_id: int
    place_id: str
    name: str
    address: str | None = None
    photo_url: str | None = None
    photo_reference: str | None = None
    rating: float | None = None
    price_level: str | None = None
    currency: str
    price_per_night: float | None = None
    total_price: float | None = None
    nights: int | None = None
    types: list[str] = []
    amenities: list[str] = []
    booking_url: str | None = None
    added_by: int
    created_at: datetime


class GroupShortlistHotelListOut(BaseModel):
    items: list[GroupShortlistHotelItemOut]


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
    wallet_balance: float = 0.00
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


class WalletTopUpIn(BaseModel):
    amount: float = Field(..., ge=1, le=5000, description="Top-up amount in USD")
    currency: Literal["USD"] = "USD"


class WalletTopUpOut(BaseModel):
    payment_intent_id: str
    amount_added: float
    currency: str
    wallet_balance: float
    payment_status: str


class WalletCheckoutSessionOut(BaseModel):
    session_id: str
    checkout_url: str


class WalletTopUpConfirmIn(BaseModel):
    session_id: str


class WalletTopUpConfirmOut(BaseModel):
    amount_added: float
    currency: str
    wallet_balance: float
    payment_status: str
    already_processed: bool = False


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


class DestinationDetailOut(BaseModel):
    """Detailed destination/place response from Google Places Details API"""
    place_id: str
    name: str
    address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    types: List[str] = []
    business_status: Optional[str] = None
    primary_type_display_name: Optional[str] = None
    location: Optional[DestinationLocation] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    editorial_summary: Optional[str] = None
    weekday_descriptions: List[str] = []


# -------------------------
# Hotel Search Schemas
# -------------------------

class HotelSearchIn(BaseModel):
    destination: str = Field(min_length=1, max_length=200)
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=20)
    rooms: int = Field(ge=1, le=10)
    sort_by: Literal["relevance", "rating_desc", "reviews_desc"] = "relevance"

    # make sure they provide necessary info

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Destination is required")
        return cleaned

    @model_validator(mode="after")
    def validate_dates_and_counts(self):
        today = date.today()
        if self.check_in < today:
            raise ValueError("Check-in date must be today or later")
        if self.check_out <= self.check_in:
            raise ValueError("Check-out date must be after check-in date")
        if self.rooms > self.guests:
            raise ValueError("Rooms cannot exceed number of guests")
        return self


class HotelLocation(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


class HotelOptionOut(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    price_level: Optional[str] = None
    currency: str = "USD"
    price_per_night: Optional[float] = None
    total_price: Optional[float] = None
    nights: Optional[int] = None
    types: List[str] = []
    amenities: List[str] = []
    photo_url: Optional[str] = None
    photo_reference: Optional[str] = None
    location: Optional[HotelLocation] = None
    business_status: Optional[str] = None
    website: Optional[str] = None
    google_maps_url: Optional[str] = None
    booking_url: Optional[str] = None


class HotelSearchResponse(BaseModel):
    status: str
    results: List[HotelOptionOut]
    message: Optional[str] = None
    cached: Optional[bool] = False
    dummy: Optional[bool] = False


# -------------------------
# Flight Search Schemas
# -------------------------

class FlightSearchIn(BaseModel):
    origin: str = Field(min_length=3, max_length=3, description="IATA airport/city code, e.g. JFK")
    destination: str = Field(min_length=3, max_length=3, description="IATA airport/city code, e.g. CDG")
    depart_date: str = Field(description="Outbound departure date in YYYY-MM-DD format")
    return_date: Optional[str] = Field(default=None, description="Return date in YYYY-MM-DD format")
    travelers: int = Field(ge=1, le=9)

    @field_validator("origin", "destination")
    @classmethod
    def validate_iata_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError("Use a valid 3-letter IATA airport or city code")
        return normalized


class LayoverInfo(BaseModel):
    airport: str
    duration: str  # formatted as "2h 15m"


class BaggageInfo(BaseModel):
    type: str      # "checked_baggage" or "carry_on"
    quantity: int


class FlightSliceSummaryOut(BaseModel):
    origin: str
    destination: str
    departure_date: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_date: Optional[str] = None
    arrival_time: Optional[str] = None
    stops: int = 0
    layovers: list[LayoverInfo] = []


class FlightOfferOut(BaseModel):
    id: str
    airline: str
    logo_url: Optional[str] = None
    price: float
    currency: str
    duration: str
    stops: int
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    departure_airport: str
    arrival_airport: str
    cabin_class: Optional[str] = None
    baggages: list[BaggageInfo] = []
    slices: list[FlightSliceSummaryOut] = []
    emissions_kg: Optional[str] = None


class FlightSearchResponse(BaseModel):
    status: str
    results: list[FlightOfferOut]
    message: Optional[str] = None


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
    google_maps_url: Optional[str] = None
    yelp_url: Optional[str] = None
    opentable_url: Optional[str] = None
    reservable: bool = False


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


# -------------------------
# Flight Booking Schemas (Duffel Integration)
# -------------------------

class PassengerIn(BaseModel):
    """Passenger details for booking"""
    given_name: str = Field(min_length=1)
    family_name: str = Field(min_length=1)
    email: EmailStr
    phone_number: str = Field(min_length=7, max_length=20)
    born_at: str = Field(description="Date of birth in YYYY-MM-DD format")
    gender: Literal["male", "female", "other"]
    title: Literal["mr", "ms", "mrs", "mx"]


class BookingCreateIn(BaseModel):
    """Request to create a flight booking order"""
    offer_id: str = Field(min_length=1)
    passengers: list[PassengerIn] = Field(min_items=1, max_items=9)
    payment_type: Literal["card", "bank_transfer", "balance"] = "balance"
    total_amount: str = Field(min_length=1, description="Offer total amount as string, e.g. '123.45'")
    currency: str = Field(min_length=3, max_length=3, description="ISO currency code, e.g. USD")


class PaymentMethodIn(BaseModel):
    """Payment method details"""
    type: str
    currency: str
    amount: str


class DuffelOrderResponseOut(BaseModel):
    """Order response from Duffel API"""
    id: str
    booking_reference: Optional[str] = None
    total_amount: str
    total_currency: str
    type: str
    payment_status: Optional[Dict[str, Any]] = None
    slices: list[dict] = []
    passengers: list[dict] = []


class BookingCreateOut(BaseModel):
    """Response after creating a booking"""
    status: str
    order_id: str
    booking_reference: Optional[str] = None
    total_amount: str
    total_currency: str
    payment_required: bool
    remaining_balance: float


class BookingStatusOut(BaseModel):
    """Status of an existing booking"""
    order_id: str
    booking_reference: Optional[str] = None
    status: str
    total_amount: str
    total_currency: str
    payment_status: Optional[str] = None
    passengers: list[dict] = []
    slices: list[dict] = []
    created_at: Optional[datetime] = None


class BookingOut(BaseModel):
    """Booking details for history/retrieval"""
    id: int
    order_id: str
    booking_reference: str
    total_amount: str
    currency: str
    payment_status: str
    offer_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingListOut(BaseModel):
    """List of bookings for a user"""
    bookings: list[BookingOut]
    total_count: int


# -------------------------
# AI Trip Success Score Schema
# -------------------------

class TripSuccessScoreResponse(BaseModel):
    score: Optional[int] = None
    label: str
    reasons: List[str] = []
    conflicts: List[str] = []
    evaluated_at: str
    fallback: bool = False


# -------------------------
# Itinerary Schemas
# -------------------------

class ItineraryPlanCreateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None


class ItineraryPlanOut(BaseModel):
    id: int
    group_id: int
    title: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    shared_notes: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ItineraryItemCreateIn(BaseModel):
    item_type: Literal["flight", "accommodation", "dining", "activity", "transfer", "other"]
    title: str = Field(min_length=1, max_length=255)
    start_at: datetime
    end_at: Optional[datetime] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    notes: Optional[str] = None
    source_kind: Optional[str] = None
    source_reference: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class ItineraryItemUpdateIn(BaseModel):
    item_type: Optional[Literal["flight", "accommodation", "dining", "activity", "transfer", "other"]] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    notes: Optional[str] = None
    source_kind: Optional[str] = None
    source_reference: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ItineraryItemReorderIn(BaseModel):
    item_ids: list[int] = Field(min_length=1)


class ItinerarySharedNotesIn(BaseModel):
    shared_notes: Optional[str] = None


class ItineraryShortlistImportIn(BaseModel):
    shortlist_type: Literal["destination", "hotel", "flight", "restaurant"]
    shortlist_reference: str = Field(min_length=1)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    notes: Optional[str] = None


class ItineraryItemOut(BaseModel):
    id: int
    trip_plan_id: int
    item_type: str
    title: str
    sort_order: int
    start_at: datetime
    end_at: Optional[datetime] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    notes: Optional[str] = None
    source_kind: Optional[str] = None
    source_reference: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    created_by: int
    created_at: datetime
    updated_at: datetime
    display_date: str
    display_time: str
    display_location: str

    class Config:
        from_attributes = True


class ItineraryTimelineOut(BaseModel):
    trip_plan: ItineraryPlanOut
    items: list[ItineraryItemOut]
    is_empty: bool = False
    group_name: Optional[str] = None
    group_status: Optional[str] = None


class BookingShortlistToGroupIn(BaseModel):
    group_id: int

