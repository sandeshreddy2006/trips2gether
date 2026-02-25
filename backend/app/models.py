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
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
