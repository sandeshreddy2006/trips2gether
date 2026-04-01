from sqlalchemy import Column, Integer, String, Boolean, DateTime, func, UniqueConstraint, Float, Text, Index, CHAR
from sqlalchemy import ForeignKey
from datetime import datetime
from sqlalchemy.orm import relationship
from .db import Base
import uuid
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, unique=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    google_client_id = Column(String(255), unique=True, nullable=True)
    name = Column(String(120), nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    failed_reset_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    last_failed_reset = Column(DateTime, nullable=True)
    location = Column(String(255), nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), index=True, nullable=False)
    token = Column(String(6), unique=True, nullable=False, index=True)
    link = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), index=True, nullable=False)
    token = Column(String(6), unique=True, nullable=False, index=True)
    link = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True, unique=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendships_requester_addressee"),
    )


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="planning")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    shortlisted_destinations = relationship(
        "GroupShortlistDestination",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    shortlisted_flights = relationship(
        "GroupShortlistFlight",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    creator = relationship("User", foreign_keys=[created_by])


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")
    joined_at = Column(DateTime, server_default=func.now())

    group = relationship("Group", back_populates="members")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
    )


class GroupShortlistDestination(Base):
    __tablename__ = "group_shortlist_destinations"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)
    photo_url = Column(Text, nullable=True)
    photo_reference = Column(Text, nullable=True)
    rating = Column(Float, nullable=True)
    destination_types_json = Column(Text, nullable=False, default="[]")
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    group = relationship("Group", back_populates="shortlisted_destinations")
    adder = relationship("User", foreign_keys=[added_by])

    __table_args__ = (
        UniqueConstraint("group_id", "place_id", name="uq_group_shortlist_group_place"),
    )


class GroupShortlistFlight(Base):
    __tablename__ = "group_shortlist_flights"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    flight_offer_id = Column(String(255), nullable=False)
    airline = Column(String(255), nullable=False)
    logo_url = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    currency = Column(String(12), nullable=False)
    duration = Column(String(64), nullable=False)
    stops = Column(Integer, nullable=False, default=0)
    departure_time = Column(String(16), nullable=True)
    arrival_time = Column(String(16), nullable=True)
    departure_airport = Column(String(12), nullable=False)
    arrival_airport = Column(String(12), nullable=False)
    cabin_class = Column(String(64), nullable=True)
    baggages_json = Column(Text, nullable=False, default="[]")
    slices_json = Column(Text, nullable=False, default="[]")
    emissions_kg = Column(String(32), nullable=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    group = relationship("Group", back_populates="shortlisted_flights")
    adder = relationship("User", foreign_keys=[added_by])

    __table_args__ = (
        UniqueConstraint("group_id", "flight_offer_id", name="uq_group_shortlist_group_flight_offer"),
    )


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(120), nullable=False)
    avatar_url = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    
    # Travel Preferences
    budget_min = Column(Integer, nullable=True)  # in USD
    budget_max = Column(Integer, nullable=True)  # in USD
    travel_mode = Column(String(100), nullable=True)  # e.g., "backpacking", "luxury", "adventure", "eco-tourism"
    preferred_destination = Column(String(255), nullable=True)
    travel_pace = Column(String(100), nullable=True)  # e.g., "slow", "moderate", "fast"
    
    # Accommodation Preferences
    hotel_type = Column(String(100), nullable=True)  # e.g., "budget", "mid-range", "luxury", "hostel", "airbnb"
    room_sharing = Column(String(100), nullable=True)  # e.g., "yes", "no", "open"
    
    # Dining Preferences
    cuisine_preference = Column(String(255), nullable=True)  # e.g., "Italian, Asian, Mediterranean"
    dietary_restrictions = Column(String(255), nullable=True)  # e.g., "vegetarian, gluten-free, vegan"
    
    # Face Verification (2FA)
    face_encoding = Column(Text, nullable=True)  # Stored as JSON array of face descriptor
    face_verification_enabled = Column(Boolean, default=False, nullable=False)
    face_last_verified_at = Column(DateTime, nullable=True)

    # Wallet (sandbox balance for demo flight bookings)
    wallet_balance = Column(Float, nullable=False, default=0.00)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    bookings = relationship("Booking", back_populates="profile", cascade="all, delete-orphan")
    wallet_topups = relationship("WalletTopUp", back_populates="profile", cascade="all, delete-orphan")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False, index=True)
    order_id = Column(String(255), unique=True, nullable=False, index=True)
    booking_reference = Column(String(255), nullable=False, index=True)
    total_amount = Column(String(50), nullable=False)
    currency = Column(String(12), nullable=False)
    payment_status = Column(String(50), nullable=False, default="pending")
    passengers_json = Column(Text, nullable=False, default="[]")  # JSON array of passenger details
    offer_id = Column(String(255), nullable=True)  # Duffel offer ID
    slices_json = Column(Text, nullable=True, default="[]")  # Flight details as JSON
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    profile = relationship("Profile", back_populates="bookings")


class WalletTopUp(Base):
    __tablename__ = "wallet_topups"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False, index=True)
    stripe_session_id = Column(String(255), unique=True, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(12), nullable=False, default="USD")
    payment_status = Column(String(50), nullable=False, default="paid")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    profile = relationship("Profile", back_populates="wallet_topups")
