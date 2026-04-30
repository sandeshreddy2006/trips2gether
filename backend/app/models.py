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
    trip_plan = relationship(
        "TripPlan",
        back_populates="group",
        uselist=False,
        cascade="all, delete-orphan",
    )
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
    shortlisted_hotels = relationship(
        "GroupShortlistHotel",
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
    last_chat_read_at = Column(DateTime, nullable=True)

    group = relationship("Group", back_populates="members")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
    )


class TripPlan(Base):
    __tablename__ = "trip_plans"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    shared_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    group = relationship("Group", back_populates="trip_plan")
    items = relationship(
        "ItineraryItem",
        back_populates="trip_plan",
        cascade="all, delete-orphan",
        order_by="ItineraryItem.sort_order, ItineraryItem.start_at, ItineraryItem.created_at",
    )


class ItineraryItem(Base):
    __tablename__ = "itinerary_items"

    id = Column(Integer, primary_key=True, index=True)
    trip_plan_id = Column(Integer, ForeignKey("trip_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    item_type = Column(String(32), nullable=False)
    title = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0, index=True)
    start_at = Column(DateTime, nullable=False, index=True)
    end_at = Column(DateTime, nullable=True)
    location_name = Column(String(255), nullable=True)
    location_address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    source_kind = Column(String(32), nullable=True)
    source_reference = Column(String(255), nullable=True)
    details_json = Column(Text, nullable=False, default="{}")
    estimated_cost = Column(Float, nullable=True)
    currency = Column(String(12), nullable=False, default="USD")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    trip_plan = relationship("TripPlan", back_populates="items")
    creator = relationship("User", foreign_keys=[created_by])


class TripPlanHistory(Base):
    __tablename__ = "trip_plan_history"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    shared_notes = Column(Text, nullable=True)
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)
    items_json = Column(Text, nullable=False, default="[]")

    group = relationship("Group")


class GroupChatMessage(Base):
    __tablename__ = "group_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    group = relationship("Group")
    sender = relationship("User", foreign_keys=[sender_id])


class GroupPoll(Base):
    __tablename__ = "group_polls"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    decision_type = Column(String(32), nullable=False, default="other", index=True)
    status = Column(String(20), nullable=False, default="active", index=True)
    allow_vote_update = Column(Boolean, nullable=False, default=True)
    closes_at = Column(DateTime, nullable=False, index=True)
    closed_at = Column(DateTime, nullable=True)
    winner_option_id = Column(Integer, ForeignKey("group_poll_options.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    group = relationship("Group")
    creator = relationship("User", foreign_keys=[created_by])
    options = relationship(
        "GroupPollOption",
        back_populates="poll",
        cascade="all, delete-orphan",
        order_by="GroupPollOption.position, GroupPollOption.id",
        foreign_keys="GroupPollOption.poll_id",
    )
    votes = relationship("GroupPollVote", back_populates="poll", cascade="all, delete-orphan")
    winner_option = relationship("GroupPollOption", foreign_keys=[winner_option_id], post_update=True)


class GroupPollOption(Base):
    __tablename__ = "group_poll_options"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("group_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    poll = relationship("GroupPoll", back_populates="options", foreign_keys=[poll_id])


class GroupPollVote(Base):
    __tablename__ = "group_poll_votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("group_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    option_id = Column(Integer, ForeignKey("group_poll_options.id", ondelete="CASCADE"), nullable=False, index=True)
    voter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    poll = relationship("GroupPoll", back_populates="votes")
    option = relationship("GroupPollOption")
    voter = relationship("User", foreign_keys=[voter_id])

    __table_args__ = (
        UniqueConstraint("poll_id", "voter_id", name="uq_group_poll_votes_poll_voter"),
        Index("ix_group_poll_votes_poll_option", "poll_id", "option_id"),
    )


class GroupNotification(Base):
    __tablename__ = "group_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    poll_id = Column(Integer, ForeignKey("group_polls.id", ondelete="CASCADE"), nullable=True, index=True)
    notification_type = Column(String(32), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=False, default="{}")
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    group = relationship("Group")
    poll = relationship("GroupPoll")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notification_type = Column(String(32), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=False, default="{}")
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class UserReport(Base):
    __tablename__ = "user_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, index=True)  # e.g., bug, data_error, feedback
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, default="open", index=True)
    admin_notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id])


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
    estimated_cost = Column(Float, nullable=True)
    currency = Column(String(12), nullable=False, default="USD")
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


class GroupShortlistHotel(Base):
    __tablename__ = "group_shortlist_hotels"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)
    photo_url = Column(Text, nullable=True)
    photo_reference = Column(Text, nullable=True)
    rating = Column(Float, nullable=True)
    price_level = Column(String(32), nullable=True)
    currency = Column(String(12), nullable=False, default="USD")
    price_per_night = Column(Float, nullable=True)
    total_price = Column(Float, nullable=True)
    nights = Column(Integer, nullable=True)
    hotel_types_json = Column(Text, nullable=False, default="[]")
    amenities_json = Column(Text, nullable=False, default="[]")
    booking_url = Column(Text, nullable=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    group = relationship("Group", back_populates="shortlisted_hotels")
    adder = relationship("User", foreign_keys=[added_by])

    __table_args__ = (
        UniqueConstraint("group_id", "place_id", name="uq_group_shortlist_group_hotel_place"),
    )


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(120), nullable=False)
    avatar_url = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    visibility = Column(String(20), nullable=False, default="public", server_default="public")
    
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


class GroupTripPayment(Base):
    """Tracks per-member payment for their share of a group trip."""
    __tablename__ = "group_trip_payments"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(12), nullable=False, default="USD")
    payment_method = Column(String(50), nullable=False)  # "stripe" or "wallet"
    stripe_session_id = Column(String(255), nullable=True, unique=True, index=True)
    payment_status = Column(String(50), nullable=False, default="pending")  # pending | paid | failed | cancelled
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_group_trip_payments_group_user", "group_id", "user_id"),
    )
