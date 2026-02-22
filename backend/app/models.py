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
    name = Column(String(120))
    created_at = Column(DateTime, server_default=func.now())
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    failed_reset_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    last_failed_reset = Column(DateTime, nullable=True)
    location = Column(String(255), nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
