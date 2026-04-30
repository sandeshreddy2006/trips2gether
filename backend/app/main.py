import asyncio
import threading

from fastapi import FastAPI, Depends, HTTPException, Query, Request, BackgroundTasks, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, inspect, text
from sqlalchemy.exc import DataError
from datetime import datetime, timedelta, timezone
from .db import Base, engine, get_db
from . import models  # Import models to register them with SQLAlchemy
from .schemas import (
    LoginIn,
    RegisterIn,
    GoogleOAuthIn,
    AuthLocationUpdateIn,
    ForgotPasswordIn,
    VerifyResetCodeIn,
    ResetPasswordIn,
    FriendRequestIn,
    FriendsListOut,
    FriendRequestListOut,
    UserSearchListOut,
    ProfileViewOut,
    GroupCreateIn,
    GroupOut,
    GroupListOut,
    GroupUpdateIn,
    GroupAddMembersIn,
    GroupMemberOut,
    GroupMemberListOut,
    GroupUpdateRoleIn,
    DashboardCurrentPlanListOut,
    DashboardCurrentPlanOut,
    DashboardChatSummaryListOut,
    DashboardChatSummaryOut,
    GroupChatMessageCreateIn,
    GroupChatMessageOut,
    GroupChatThreadOut,
    GroupShortlistCreateIn,
    GroupShortlistItemOut,
    GroupShortlistListOut,
    GroupShortlistFlightCreateIn,
    GroupShortlistFlightItemOut,
    GroupShortlistFlightListOut,
    GroupShortlistHotelCreateIn,
    GroupShortlistHotelItemOut,
    GroupShortlistHotelListOut,
    ItineraryPlanCreateIn,
    ItineraryPlanOut,
    ItineraryItemCreateIn,
    ItineraryItemOut,
    ItineraryItemReorderIn,
    ItinerarySharedNotesIn,
    ItineraryShortlistImportIn,
    ItineraryItemUpdateIn,
    ItineraryTimelineOut,
    TripStateUpdateIn,
    TripSuccessScoreResponse,
    AiTripPlanGenerateIn,
    AiAssistantSuggestIn,
    AiAssistantSuggestOut,
    GroupPollCreateIn,
    GroupPollVoteIn,
    GroupPollSuggestionIn,
    GroupNotificationOut,
    GroupNotificationListOut,
    NotificationOut,
    NotificationListOut,
    ReportCreateIn,
    ReportOut,
    ReportListOut,
    AdminReportOut,
    AdminReportFilterIn,
    AdminReportStatusUpdateIn,
    AdminReportNoteIn,
    ProfileOut, 
    ProfileUpdate,
    WalletTopUpIn,
    WalletTopUpOut,
    WalletCheckoutSessionOut,
    WalletTopUpConfirmIn,
    WalletTopUpConfirmOut,
    FlightSearchIn,
    FlightSearchResponse,
    DestinationSearchResponse,
    DestinationDetailOut,
    HotelSearchIn,
    HotelSearchResponse,
    NearbyRestaurantsResponse,
    RestaurantDetailOut,
    FaceEncodingIn,
    FaceVerificationCheckIn,
    FaceVerificationCheckOut,
    FaceVerificationIn,
    FaceVerificationOut,
    BookingCreateIn,
    BookingCreateOut,
    BookingStatusOut,
    BookingOut,
    BookingListOut,
    BookingShortlistToGroupIn,
    TripPaymentStripeIn,
    TripPaymentWalletIn,
    TripPaymentConfirmIn,
    TripPaymentOut,
    TripPaymentCheckoutOut,
    TripPaymentStatusOut,
    QuickJumpResult,
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
from .email_utils import send_email, get_welcome_email_template, get_login_email_template, get_password_reset_email_template, get_email_verification_template, get_account_deletion_email_template, get_booking_confirmation_email_template, generate_booking_confirmation_pdf
from .cloudflare import delete_image_from_cloudflare, upload_image_to_cloudflare
from .google_places import get_places_service
from .flightbookings import _select_diverse_offers, _serialize_duffel_offer
from .shortlist import serialize_shortlist_item, serialize_shortlist_flight_item, serialize_shortlist_hotel_item
from .itinerary import serialize_trip_plan, serialize_itinerary_item
from jose import JWTError
import os
import requests
import json
import math
import stripe
from apscheduler.schedulers.background import BackgroundScheduler

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGO = os.getenv("JWT_ALGO")
DUFFEL_API_URL = "https://api.duffel.com/air/offer_requests"

print("[Startup] Running Base.metadata.create_all...")
Base.metadata.create_all(bind=engine)
print("[Startup] Finished Base.metadata.create_all.")


def _ensure_itinerary_sort_order_column() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("itinerary_items")}
    except Exception:
        return

    if "sort_order" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE itinerary_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))


_ensure_itinerary_sort_order_column()


def _ensure_itinerary_cost_columns() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("itinerary_items")}
    except Exception:
        return

    with engine.begin() as connection:
        if "estimated_cost" not in columns:
            connection.execute(text("ALTER TABLE itinerary_items ADD COLUMN estimated_cost FLOAT NULL"))
        if "currency" not in columns:
            connection.execute(text("ALTER TABLE itinerary_items ADD COLUMN currency VARCHAR(12) NOT NULL DEFAULT 'USD'"))


_ensure_itinerary_cost_columns()


def _ensure_trip_plan_shared_notes_column() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("trip_plans")}
    except Exception:
        return

    if "shared_notes" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE trip_plans ADD COLUMN shared_notes TEXT"))


_ensure_trip_plan_shared_notes_column()


def _ensure_user_reports_admin_columns() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("user_reports")}
    except Exception:
        return

    with engine.begin() as connection:
        if "admin_notes" not in columns:
            connection.execute(text("ALTER TABLE user_reports ADD COLUMN admin_notes TEXT"))
        if "updated_at" not in columns:
            connection.execute(text("ALTER TABLE user_reports ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"))


_ensure_user_reports_admin_columns()


def _ensure_group_shortlist_cost_columns() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("group_shortlist_destinations")}
    except Exception:
        return

    with engine.begin() as connection:
        if "estimated_cost" not in columns:
            connection.execute(text("ALTER TABLE group_shortlist_destinations ADD COLUMN estimated_cost FLOAT NULL"))
        if "currency" not in columns:
            connection.execute(text("ALTER TABLE group_shortlist_destinations ADD COLUMN currency VARCHAR(12) NOT NULL DEFAULT 'USD'"))


_ensure_group_shortlist_cost_columns()


def _ensure_profile_visibility_column() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("profiles")}
    except Exception:
        return

    if "visibility" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE profiles ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'public'"))


_ensure_profile_visibility_column()
def _ensure_notifications_columns_and_table() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("group_notifications")}
    except Exception:
        columns = set()

    with engine.begin() as connection:
        if "is_read" not in columns:
            try:
                connection.execute(text("ALTER TABLE group_notifications ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0"))
            except Exception:
                # best-effort; continue
                pass

    # Ensure the personal notifications table exists
    try:
        has_table = inspector.has_table("notifications")
    except Exception:
        has_table = False

    if not has_table:
        try:
            models.Notification.__table__.create(bind=engine, checkfirst=True)
        except Exception:
            pass


_ensure_notifications_columns_and_table()


def _ensure_group_chat_columns() -> None:
    inspector = inspect(engine)
    try:
        columns = {column["name"] for column in inspector.get_columns("group_members")}
    except Exception:
        return

    if "last_chat_read_at" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE group_members ADD COLUMN last_chat_read_at DATETIME"))


_ensure_group_chat_columns()


def _ensure_trip_plan_history_table() -> None:
    inspector = inspect(engine)
    try:
        has_table = inspector.has_table("trip_plan_history")
    except Exception:
        return

    if not has_table:
        models.TripPlanHistory.__table__.create(bind=engine, checkfirst=True)


_ensure_trip_plan_history_table()


def _ensure_user_reports_table() -> None:
    inspector = inspect(engine)
    try:
        has_table = inspector.has_table("user_reports")
    except Exception:
        has_table = False

    if not has_table:
        try:
            models.UserReport.__table__.create(bind=engine, checkfirst=True)
        except Exception:
            pass


_ensure_user_reports_table()


app = FastAPI(title="trips2gether API")


class PollRealtimeManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._connections: dict[int, WebSocket] = {}
        self._group_connections: dict[int, set[int]] = {}

    async def connect(self, websocket: WebSocket, group_ids: list[int]) -> None:
        await websocket.accept()
        connection_id = id(websocket)
        with self._lock:
            self._connections[connection_id] = websocket
            for group_id in group_ids:
                self._group_connections.setdefault(group_id, set()).add(connection_id)

    async def disconnect(self, websocket: WebSocket) -> None:
        connection_id = id(websocket)
        with self._lock:
            self._connections.pop(connection_id, None)
            for subscribers in self._group_connections.values():
                subscribers.discard(connection_id)

    async def broadcast_group(self, group_id: int, payload: dict) -> None:
        with self._lock:
            connection_ids = list(self._group_connections.get(group_id, set()))

        dead_connections: list[int] = []
        for connection_id in connection_ids:
            websocket = None
            with self._lock:
                websocket = self._connections.get(connection_id)
            if websocket is None:
                dead_connections.append(connection_id)
                continue

            try:
                await websocket.send_json(payload)
            except Exception:
                dead_connections.append(connection_id)

        if dead_connections:
            with self._lock:
                for connection_id in dead_connections:
                    self._connections.pop(connection_id, None)
                for subscribers in self._group_connections.values():
                    for connection_id in dead_connections:
                        subscribers.discard(connection_id)


poll_realtime_manager = PollRealtimeManager()


def _publish_poll_event_sync(group_id: int, payload: dict) -> None:
    loop = getattr(app.state, "loop", None)
    if not loop or not loop.is_running():
        return
    asyncio.run_coroutine_threadsafe(poll_realtime_manager.broadcast_group(group_id, payload), loop)


async def _publish_poll_event_async(group_id: int, payload: dict) -> None:
    await poll_realtime_manager.broadcast_group(group_id, payload)

# Initialize scheduler for cleanup tasks
scheduler = BackgroundScheduler()

@app.on_event("startup")
async def start_scheduler():
    """Start background scheduler for cleanup tasks"""
    app.state.loop = asyncio.get_running_loop()
    
    def cleanup_job():
        """Background job to clean up expired tokens"""
        db = next(get_db())
        try:
            current_time = datetime.now()
            deleted_count = db.query(models.PasswordResetToken).filter(
                models.PasswordResetToken.expires_at < current_time
            ).delete()

            due_polls = (
                db.query(models.GroupPoll)
                .filter(
                    models.GroupPoll.status == "active",
                    models.GroupPoll.closes_at <= current_time,
                )
                .all()
            )
            finalized_count = 0
            finalized_polls: list[models.GroupPoll] = []
            finalized_notifications: list[models.GroupNotification] = []
            for poll in due_polls:
                if _finalize_poll_if_due(poll, db):
                    finalized_count += 1
                    finalized_polls.append(poll)
                    finalized_notifications.extend(_create_poll_notifications(poll, db, "poll.closed"))

            db.commit()
            for poll in finalized_polls:
                _publish_poll_event_sync(poll.group_id, _build_poll_event_payload("poll.closed", poll, db))
            if finalized_notifications:
                _broadcast_poll_notifications(finalized_notifications)
            print(f"[Cleanup Job] Deleted {deleted_count} expired password reset tokens; finalized {finalized_count} polls")
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


def _get_group_and_membership(group_id: int, user_id: int, db: Session):
    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    return group, membership


def _get_itinerary_items(plan_id: int, db: Session):
    return (
        db.query(models.ItineraryItem)
        .filter(models.ItineraryItem.trip_plan_id == plan_id)
        .order_by(
            models.ItineraryItem.sort_order.asc(),
            models.ItineraryItem.start_at.asc(),
            models.ItineraryItem.created_at.asc(),
        )
        .all()
    )


def _build_itinerary_payload(group: models.Group, plan: models.TripPlan, db: Session, warnings: list[str] | None = None):
    items = _get_itinerary_items(plan.id, db)
    starts_at = items[0].start_at if items else None
    ends_at = None
    if items:
        ends_at = max((item.end_at or item.start_at) for item in items)

    payload = {
        "ok": True,
        "trip_plan": serialize_trip_plan(plan, len(items), starts_at, ends_at),
        "items": [serialize_itinerary_item(item) for item in items],
        "is_empty": len(items) == 0,
        "group_name": group.name,
        "group_status": group.status,
    }
    if warnings:
        payload["warnings"] = warnings
    return payload


def _derive_trip_window_from_items(items: list[models.ItineraryItem]) -> tuple[datetime | None, datetime | None]:
    if not items:
        return None, None
    starts_at = min(item.start_at for item in items)
    ends_at = max((item.end_at or item.start_at) for item in items)
    return starts_at, ends_at


def _clip_text(value: str, limit: int = 160) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(limit - 1, 1)].rstrip() + "…"


def _serialize_chat_message(message: models.GroupChatMessage) -> dict:
    sender_name = message.sender.name if message.sender else "A member"
    return {
        "id": message.id,
        "group_id": message.group_id,
        "sender_id": message.sender_id,
        "sender_name": sender_name,
        "body": message.body,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "updated_at": message.updated_at.isoformat() if message.updated_at else None,
    }


def _compute_group_chat_unread_count(
    messages: list[models.GroupChatMessage],
    last_read_at: datetime | None,
    current_user_id: int,
) -> int:
    unread_count = 0
    for message in messages:
        if message.sender_id == current_user_id:
            continue
        if last_read_at is not None and message.created_at and message.created_at <= last_read_at:
            continue
        unread_count += 1
    return unread_count


def _build_dashboard_current_plan_item(
    group: models.Group,
    plan: models.TripPlan | None,
    items: list[models.ItineraryItem],
) -> dict | None:
    status = group.status.lower() if group.status else "planning"
    if status == "archived":
        return None

    if not items:
        return None

    starts_at, ends_at = _derive_trip_window_from_items(items)

    title = plan.title if plan and plan.title else f"{group.name} Itinerary"
    return {
        "id": plan.id if plan else group.id,
        "group_id": group.id,
        "group_name": group.name,
        "title": title,
        "description": plan.description if plan else group.description,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "status": status,
        "item_count": len(items),
        "action_path": f"/group/{group.id}/itinerary",
    }


def _build_dashboard_chat_summary_item(
    group: models.Group,
    messages: list[models.GroupChatMessage],
    current_user_id: int,
    last_read_at: datetime | None,
) -> dict | None:
    if not messages:
        return None

    latest = messages[0]
    latest_at = latest.created_at or latest.updated_at
    if latest_at is None:
        return None

    unread_count = _compute_group_chat_unread_count(messages, last_read_at, current_user_id)
    return {
        "group_id": group.id,
        "group_name": group.name,
        "latest_message": _clip_text(latest.body),
        "latest_message_at": latest_at,
        "unread_count": unread_count,
        "latest_sender_name": latest.sender.name if latest.sender else None,
        "action_path": f"/group/{group.id}/chat",
    }


def _has_time_conflict(start_at: datetime, end_at: datetime | None, other_start: datetime, other_end: datetime | None) -> bool:
    candidate_end = end_at or start_at
    existing_end = other_end or other_start
    return start_at <= existing_end and other_start <= candidate_end


def _build_time_conflict_warnings(plan_id: int, item_id: int | None, start_at: datetime, end_at: datetime | None, db: Session) -> list[str]:
    query = db.query(models.ItineraryItem).filter(models.ItineraryItem.trip_plan_id == plan_id)
    if item_id is not None:
        query = query.filter(models.ItineraryItem.id != item_id)

    conflicts: list[str] = []
    for item in query.all():
        if _has_time_conflict(start_at, end_at, item.start_at, item.end_at):
            conflicts.append(item.title)

    if not conflicts:
        return []

    preview = ", ".join(conflicts[:3])
    if len(conflicts) > 3:
        preview += ", and more"
    return [f"Time conflict: overlaps with {preview}."]


def _resequence_itinerary_items(plan_id: int, db: Session) -> None:
    items = (
        db.query(models.ItineraryItem)
        .filter(models.ItineraryItem.trip_plan_id == plan_id)
        .order_by(
            models.ItineraryItem.sort_order.asc(),
            models.ItineraryItem.start_at.asc(),
            models.ItineraryItem.created_at.asc(),
            models.ItineraryItem.id.asc(),
        )
        .all()
    )

    for index, item in enumerate(items):
        item.sort_order = index


def _get_or_create_trip_plan(group: models.Group, db: Session) -> models.TripPlan:
    plan = group.trip_plan
    if plan:
        return plan

    plan = models.TripPlan(
        group_id=group.id,
        title=f"{group.name} Itinerary",
        description=f"Chronological plan for {group.name}",
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _assert_itinerary_mutable(group: models.Group) -> None:
    if group.status in ("active", "archived"):
        raise HTTPException(
            status_code=400,
            detail="Itinerary is finalized for this trip state. Only shared notes can be edited.",
        )


def _coerce_hhmm(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    try:
        parts = value.strip().split(":")
        if len(parts) != 2:
            return None
        hours = int(parts[0])
        minutes = int(parts[1])
        if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
            return None
        return hours, minutes
    except Exception:
        return None


def _duration_label(start_at: datetime, end_at: datetime | None) -> str:
    if not end_at or end_at <= start_at:
        return "N/A"
    minutes = int((end_at - start_at).total_seconds() // 60)
    if minutes <= 0:
        return "N/A"
    hours, rem = divmod(minutes, 60)
    if hours and rem:
        return f"{hours}h {rem}m"
    if hours:
        return f"{hours}h"
    return f"{rem}m"


def _resolve_itinerary_slot(group: models.Group, plan: models.TripPlan, db: Session) -> datetime:
    items = _get_itinerary_items(plan.id, db)
    if items:
        last_item = max(items, key=lambda entry: (entry.end_at or entry.start_at, entry.sort_order, entry.id))
        return (last_item.end_at or last_item.start_at) + timedelta(hours=1)

    if group.trip_start_at:
        return group.trip_start_at.replace(hour=10, minute=0, second=0, microsecond=0)

    now = datetime.utcnow().replace(second=0, microsecond=0)
    return now + timedelta(hours=2)


def _snapshot_trip_plan_history(
    group: models.Group,
    plan: models.TripPlan,
    items: list[models.ItineraryItem],
    db: Session,
) -> None:
    starts_at = items[0].start_at if items else None
    ends_at = max((item.end_at or item.start_at) for item in items) if items else None
    serialized_items = [serialize_itinerary_item(item).model_dump(mode="json") for item in items]

    history = models.TripPlanHistory(
        group_id=group.id,
        title=plan.title,
        description=plan.description,
        shared_notes=plan.shared_notes,
        starts_at=starts_at,
        ends_at=ends_at,
        items_json=json.dumps(serialized_items),
    )
    db.add(history)


def _get_group_member_count(group_id: int, db: Session) -> int:
    return (
        db.query(func.count(models.GroupMember.id))
        .filter(models.GroupMember.group_id == group_id)
        .scalar()
        or 0
    )


def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _finalize_poll_if_due(poll: models.GroupPoll, db: Session) -> bool:
    if poll.status != "active":
        return False

    now = datetime.utcnow()
    closes_at = _to_naive_utc(poll.closes_at)
    if closes_at > now:
        return False

    return _close_poll_and_compute_winner(poll, db, now)


def _close_poll_and_compute_winner(poll: models.GroupPoll, db: Session, closed_at: datetime | None = None) -> bool:
    if poll.status != "active":
        return False

    options = (
        db.query(models.GroupPollOption)
        .filter(models.GroupPollOption.poll_id == poll.id)
        .order_by(models.GroupPollOption.position.asc(), models.GroupPollOption.id.asc())
        .all()
    )

    votes = (
        db.query(models.GroupPollVote.option_id, func.count(models.GroupPollVote.id))
        .filter(models.GroupPollVote.poll_id == poll.id)
        .group_by(models.GroupPollVote.option_id)
        .all()
    )
    vote_counts = {option_id: count for option_id, count in votes}

    winner_option_id = None
    if options and vote_counts:
        highest = max(vote_counts.values())
        for option in options:
            if vote_counts.get(option.id, 0) == highest:
                winner_option_id = option.id
                break

    poll.status = "closed"
    poll.closed_at = closed_at or datetime.utcnow()
    poll.winner_option_id = winner_option_id
    return True


def _finalize_due_polls_for_groups(group_ids: list[int], db: Session) -> tuple[list[models.GroupPoll], list[models.GroupNotification]]:
    if not group_ids:
        return [], []

    due_polls = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.group_id.in_(group_ids),
            models.GroupPoll.status == "active",
        )
        .all()
    )

    has_changes = False
    finalized_polls: list[models.GroupPoll] = []
    for poll in due_polls:
        if _finalize_poll_if_due(poll, db):
            has_changes = True
            finalized_polls.append(poll)

    notifications: list[models.GroupNotification] = []
    for poll in finalized_polls:
        notifications.extend(_create_poll_notifications(poll, db, "poll.closed"))

    if has_changes:
        db.commit()

    return finalized_polls, notifications


def _serialize_poll(
    poll: models.GroupPoll,
    current_user_id: int,
    db: Session,
    group_name: str | None = None,
    member_count: int | None = None,
) -> dict:
    options = (
        db.query(models.GroupPollOption)
        .filter(models.GroupPollOption.poll_id == poll.id)
        .order_by(models.GroupPollOption.position.asc(), models.GroupPollOption.id.asc())
        .all()
    )
    votes = (
        db.query(models.GroupPollVote)
        .filter(models.GroupPollVote.poll_id == poll.id)
        .all()
    )

    vote_counts: dict[int, int] = {}
    user_vote_option_id = None
    voter_ids: set[int] = set()
    for vote in votes:
        vote_counts[vote.option_id] = vote_counts.get(vote.option_id, 0) + 1
        voter_ids.add(vote.voter_id)
        if vote.voter_id == current_user_id:
            user_vote_option_id = vote.option_id

    if member_count is None:
        member_count = _get_group_member_count(poll.group_id, db)

    creator_name = None
    creator = db.get(models.User, poll.created_by)
    if creator:
        creator_name = creator.name

    return {
        "id": poll.id,
        "group_id": poll.group_id,
        "group_name": group_name,
        "question": poll.question,
        "decision_type": poll.decision_type,
        "status": poll.status,
        "allow_vote_update": poll.allow_vote_update,
        "closes_at": poll.closes_at.isoformat() if poll.closes_at else None,
        "closed_at": poll.closed_at.isoformat() if poll.closed_at else None,
        "created_by": poll.created_by,
        "created_by_name": creator_name,
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "winner_option_id": poll.winner_option_id,
        "member_count": member_count,
        "total_votes": len(votes),
        "voted_by_all": member_count > 0 and len(voter_ids) >= member_count,
        "user_vote_option_id": user_vote_option_id,
        "options": [
            {
                "id": option.id,
                "label": option.label,
                "position": option.position,
                "vote_count": vote_counts.get(option.id, 0),
                "is_winner": poll.winner_option_id == option.id,
            }
            for option in options
        ],
    }


def _build_poll_event_payload(event_type: str, poll: models.GroupPoll, db: Session) -> dict:
    group = db.get(models.Group, poll.group_id)
    return {
        "type": event_type,
        "group_id": poll.group_id,
        "poll": _serialize_poll(
            poll,
            current_user_id=0,
            db=db,
            group_name=group.name if group else None,
            member_count=_get_group_member_count(poll.group_id, db),
        ),
    }


def _get_user_group_ids(user_id: int, db: Session) -> list[int]:
    memberships = (
        db.query(models.GroupMember.group_id)
        .filter(models.GroupMember.user_id == user_id)
        .all()
    )
    return [membership.group_id for membership in memberships]


def _get_current_user_from_websocket(websocket: WebSocket, db: Session) -> models.User:
    token = websocket.cookies.get("authToken")
    if not token:
        raise HTTPException(status_code=401, detail="No session")

    try:
        data = decode_jwt(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid session")

    user_id = int(data["sub"])
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# -------------------------
# Auth endpoints
# -------------------------

@app.post("/auth/register", response_model=dict)
def register(body: RegisterIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Register a new user with email verification required"""
    from .auth import generate_unique_reset_token, generate_reset_link
    
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
    
    # Create new user but mark as unverified
    user = models.User(
        email=body.email,
        password_hash=hash_password(body.password) if body.password else None,
        name=body.name or body.email.split("@")[0],
        email_verified=False,
        latitude=body.latitude,
        longitude=body.longitude,
        location=body.location
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Generate unique 6-digit verification token
    verification_token = generate_unique_reset_token(db)
    verification_link = generate_reset_link(body.email, verification_token)
    
    # Create expiration time (1 hour from now)
    expires_at = datetime.now() + timedelta(hours=1)
    
    # Store verification token in database
    verification_record = models.EmailVerificationToken(
        email=body.email,
        token=verification_token,
        link=verification_link,
        expires_at=expires_at
    )
    db.add(verification_record)
    db.commit()
    
    # Send verification email in background
    try:
        verification_body = get_email_verification_template(
            name=user.name,
            verification_code=verification_token,
            verification_link=verification_link
        )
        
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=body.email,
            subject="Verify Your Trips2gether Email 📧",
            body=verification_body
        )
    except Exception as e:
        print(f"Failed to queue verification email: {e}")
    
    return {
        "ok": True,
        "message": "Signup successful! Please check your email to verify your account.",
        "email": body.email
    }


@app.post("/auth/verify-signup", response_model=dict)
def verify_signup(body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Verify email and complete signup"""
    email = body.get("email", "").strip()
    code = body.get("code", "").strip()
    
    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code are required")
    
    # Find verification record
    verification_record = db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.email == email,
        models.EmailVerificationToken.token == code
    ).first()
    
    if not verification_record:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    if verification_record.used:
        raise HTTPException(status_code=400, detail="Verification code has already been used")
    
    if verification_record.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="Verification code has expired")
    
    # Find user
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    
    # Mark email as verified
    user.email_verified = True
    db.commit()
    
    # Create profile for the user
    profile = models.Profile(
        user_id=user.id,
        email=user.email,
        username=user.name
    )
    db.add(profile)
    db.commit()
    
    # Mark verification code as used
    verification_record.used = True
    db.commit()
    
    # Send welcome email in background
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=email,
            subject="Welcome to Trips2gether! ✈️",
            body=get_welcome_email_template(user.name)
        )
    except Exception as e:
        print(f"Failed to queue welcome email: {e}")
    
    return {
        "ok": True,
        "message": "Email verified successfully! Your account is now active.",
        "user": {"id": user.id, "email": user.email, "name": user.name}
    }


@app.post("/auth/resend-verification", response_model=dict)
def resend_verification(body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Resend verification code to user's email"""
    from .auth import generate_unique_reset_token, generate_reset_link
    
    email = body.get("email", "").strip()
    
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Find user
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    
    if user.email_verified:
        raise HTTPException(status_code=400, detail="Email is already verified")
    
    # Delete any existing verification tokens for this email
    db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.email == email
    ).delete()
    db.commit()
    
    # Generate new verification token
    verification_token = generate_unique_reset_token(db)
    verification_link = generate_reset_link(email, verification_token)
    
    # Create expiration time (1 hour from now)
    expires_at = datetime.now() + timedelta(hours=1)
    
    # Store verification token in database
    verification_record = models.EmailVerificationToken(
        email=email,
        token=verification_token,
        link=verification_link,
        expires_at=expires_at
    )
    db.add(verification_record)
    db.commit()
    
    # Send verification email in background
    try:
        verification_body = get_email_verification_template(
            name=user.name,
            verification_code=verification_token,
            verification_link=verification_link
        )
        
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=email,
            subject="New Verification Code - Trips2gether 📧",
            body=verification_body
        )
    except Exception as e:
        print(f"Failed to queue verification email: {e}")
    
    return {
        "ok": True,
        "message": "Verification code sent to your email. Please check your inbox."
    }


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
    
    # Check if email is verified
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in. Check your inbox for verification code.")
    
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
            subject="Login Notification - Trips2gether 🔐",
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

    # Check if user exists by google_client_id (already linked)
    user = db.query(models.User).filter(models.User.google_client_id == google_id).first()
    
    if user:
        # Already linked with Google, proceed with login
        is_new = False
    else:
        # Check if email exists (potentially needs linking)
        user = db.query(models.User).filter(models.User.email == email).first()
        
        if user and not user.google_client_id:
            # Account exists but not linked to Google - need user consent
            return {
                "ok": False,
                "needs_linking": True,
                "email": email,
                "google_id": google_id,
                "name": name,
                "message": "An account with this email already exists. Would you like to link your Google account?"
            }
        elif not user:
            # New user - create account via Google (auto-verified)
            user = models.User(
                email=email,
                name=name,
                google_client_id=google_id,
                password_hash=None,
                email_verified=True,  # Google users auto-verified
                latitude=latitude,
                longitude=longitude,
                location=location_str
            )
            db.add(user)
            is_new = True
    
    if user:
        # Update location if provided
        if latitude is not None:
            user.latitude = latitude
        if longitude is not None:
            user.longitude = longitude
        if location_str:
            user.location = location_str
    
    db.commit()
    db.refresh(user)
    
    # Create profile if it doesn't exist (for new Google users or linked accounts)
    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        profile = models.Profile(
            user_id=user.id,
            email=user.email,
            username=user.name
        )
        db.add(profile)
        db.commit()
    
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
            subject="Login Notification - Trips2gether 🔐",
            body=get_login_email_template(user.name)
        )
    except Exception as e:
        print(f"Failed to queue login notification email: {e}")
    
    return {
        "ok": True,
        "user": {"id": user.id, "email": user.email, "name": user.name},
        "message": "Login successful"
    }


@app.post("/auth/google/merge", response_model=dict)
def merge_google_account(response: Response, body: GoogleOAuthIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Merge Google account with existing email account after user consent"""
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

    # Find user by email
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    
    if user.google_client_id:
        raise HTTPException(status_code=400, detail="Google account already linked")
    
    # Link the Google account
    user.google_client_id = google_id
    if latitude is not None:
        user.latitude = latitude
    if longitude is not None:
        user.longitude = longitude
    if location_str:
        user.location = location_str
    
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
    
    # Send account linked notification email
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=user.email,
            subject="Google Account Linked - Trips2gether 🔐",
            body=f"Your account has been successfully linked with Google. You can now sign in using either your email/password or Google account.\n\nIf you did not authorize this, please contact our support team."
        )
    except Exception as e:
        print(f"Failed to queue account linked email: {e}")
    
    return {
        "ok": True,
        "user": {"id": user.id, "email": user.email, "name": user.name},
        "message": "Account linked successfully"
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
        "is_admin": user.is_admin,
        "location": user.location,
        "latitude": user.latitude,
        "longitude": user.longitude,
    }


@app.get("/geo/reverse-geocode", response_model=dict)
def reverse_geocode(lat: float, lng: float):
    """Reverse geocode coordinates via backend to avoid browser key/referrer restrictions."""
    api_key = os.getenv("GOOGLE_PLACES_API")
    if not api_key:
        raise HTTPException(status_code=500, detail="Google API key is not configured")

    try:
        res = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"latlng": f"{lat},{lng}", "key": api_key},
            timeout=10,
        )
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Failed to reach geocoding provider")

    if not res.ok:
        raise HTTPException(status_code=502, detail=f"Geocoding request failed ({res.status_code})")

    data = res.json()
    status = data.get("status")
    if status != "OK":
        error_message = data.get("error_message") or status or "Geocoding failed"
        raise HTTPException(status_code=400, detail=error_message)

    results = data.get("results") or []
    if not results:
        return {"ok": True, "location": None}

    return {
        "ok": True,
        "location": results[0].get("formatted_address"),
    }


@app.patch("/auth/location", response_model=dict)
def update_auth_location(body: AuthLocationUpdateIn, request: Request, db: Session = Depends(get_db)):
    """Update authenticated user's location data without blocking login."""
    user = get_current_user_info(request, db)

    has_payload = (
        body.latitude is not None
        or body.longitude is not None
        or (body.location is not None and body.location.strip() != "")
    )
    if not has_payload:
        raise HTTPException(status_code=400, detail="No location fields provided")

    if body.latitude is not None:
        user.latitude = body.latitude
    if body.longitude is not None:
        user.longitude = body.longitude
    if body.location is not None:
        user.location = body.location.strip() or None

    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "location": user.location,
        "latitude": user.latitude,
        "longitude": user.longitude,
    }


def _friend_out(user: models.User, status: str, avatar_url: str | None = None) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": avatar_url,
        "status": status,
    }


def _get_friendship_between(db: Session, user_id: int, other_user_id: int) -> models.Friendship | None:
    return (
        db.query(models.Friendship)
        .filter(
            or_(
                and_(
                    models.Friendship.requester_id == user_id,
                    models.Friendship.addressee_id == other_user_id,
                ),
                and_(
                    models.Friendship.requester_id == other_user_id,
                    models.Friendship.addressee_id == user_id,
                ),
            )
        )
        .first()
    )


def _friend_status_for(current_user_id: int, other_user_id: int, db: Session) -> str:
    if current_user_id == other_user_id:
        return "self"

    friendship = _get_friendship_between(db, current_user_id, other_user_id)
    return friendship.status if friendship else "none"


def _can_view_profile(profile: models.Profile, friend_status: str) -> bool:
    visibility = profile.visibility or "public"
    return (
        friend_status == "self"
        or visibility == "public"
        or (visibility == "friends_only" and friend_status == "accepted")
    )


def _profile_view_out(profile: models.Profile, friend_status: str) -> dict:
    can_view = _can_view_profile(profile, friend_status)
    visible_fields = {
        "bio": profile.bio,
        "budget_min": profile.budget_min,
        "budget_max": profile.budget_max,
        "travel_mode": profile.travel_mode,
        "preferred_destination": profile.preferred_destination,
        "travel_pace": profile.travel_pace,
        "hotel_type": profile.hotel_type,
        "room_sharing": profile.room_sharing,
        "cuisine_preference": profile.cuisine_preference,
        "dietary_restrictions": profile.dietary_restrictions,
    }

    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "username": profile.username,
        "avatar_url": profile.avatar_url,
        "visibility": profile.visibility or "public",
        "friend_status": friend_status,
        "can_view": can_view,
        **(visible_fields if can_view else {field: None for field in visible_fields}),
    }


@app.get("/users/search", response_model=UserSearchListOut)
def search_users(
    request: Request,
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=25),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_info(request, db)
    search_term = q.strip().lower()
    if not search_term:
        return {"users": []}

    rows = (
        db.query(models.User, models.Profile)
        .join(models.Profile, models.Profile.user_id == models.User.id)
        .filter(
            models.User.id != current_user.id,
            or_(
                func.lower(models.User.name).like(f"%{search_term}%"),
                func.lower(models.User.email).like(f"%{search_term}%"),
            ),
        )
        .order_by(models.User.name.asc())
        .limit(limit)
        .all()
    )

    return {
        "users": [
            {
                "id": user.id,
                "name": user.name,
                "avatar_url": profile.avatar_url,
                "friend_status": _friend_status_for(current_user.id, user.id, db),
            }
            for user, profile in rows
        ]
    }


@app.get("/users/{user_id}/profile", response_model=ProfileViewOut)
def get_user_profile(user_id: int, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)

    profile = db.query(models.Profile).filter(models.Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    friend_status = _friend_status_for(current_user.id, user_id, db)
    return _profile_view_out(profile, friend_status)


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

    profiles = db.query(models.Profile).filter(models.Profile.user_id.in_(friend_ids)).all()
    avatar_by_user_id = {p.user_id: p.avatar_url for p in profiles}

    friends = []
    for friend_id in friend_ids:
        friend_user = users_by_id.get(friend_id)
        if friend_user:
            friends.append(_friend_out(friend_user, "accepted", avatar_by_user_id.get(friend_id)))

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

    profiles = db.query(models.Profile).filter(models.Profile.user_id.in_(lookup_ids)).all() if lookup_ids else []
    avatar_by_user_id = {p.user_id: p.avatar_url for p in profiles}

    incoming = [_friend_out(users_by_id[u], "pending", avatar_by_user_id.get(u)) for u in incoming_ids if u in users_by_id]
    outgoing = [_friend_out(users_by_id[u], "pending", avatar_by_user_id.get(u)) for u in outgoing_ids if u in users_by_id]

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
            subject="Password Reset - Trips2gether 🔑",
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


@app.delete("/auth/delete-account", response_model=dict)
def delete_account(response: Response, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Permanently delete the authenticated user's account and all related data.
    Deletes in safe order to avoid foreign key violations:
      1. Profile (+ Cloudflare avatar cleanup)
      2. Friendships
      3. Owned groups (all their members first), then non-owner memberships
      4. Password reset tokens
      5. Email verification tokens
      6. The user record itself
    Then clears the auth cookie and sends a confirmation email.
    """
    current_user = get_current_user_info(request, db)

    user_email = current_user.email
    user_name = current_user.name
    deleted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")

    # 1. Delete profile
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if profile:
        if profile.avatar_url:
            try:
                delete_image_from_cloudflare(profile.avatar_url)
            except Exception as e:
                print(f"[delete_account] Failed to delete avatar from Cloudflare: {e}")
        db.delete(profile)

    # 2. Delete friendships
    db.query(models.Friendship).filter(
        or_(
            models.Friendship.requester_id == current_user.id,
            models.Friendship.addressee_id == current_user.id,
        )
    ).delete(synchronize_session=False)

    # 3. Delete groups the user owns (members first, then the group)
    owned_group_ids = [
        m.group_id for m in db.query(models.GroupMember).filter(
            models.GroupMember.user_id == current_user.id,
            models.GroupMember.role == "owner"
        ).all()
    ]
    if owned_group_ids:
        db.query(models.GroupMember).filter(
            models.GroupMember.group_id.in_(owned_group_ids)
        ).delete(synchronize_session=False)
        db.query(models.Group).filter(
            models.Group.id.in_(owned_group_ids)
        ).delete(synchronize_session=False)

    # Remove user from any groups they are a non-owner member of
    db.query(models.GroupMember).filter(
        models.GroupMember.user_id == current_user.id
    ).delete(synchronize_session=False)

    # 4. Delete password reset tokens
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.email == user_email
    ).delete(synchronize_session=False)

    # 5. Delete email verification tokens
    db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.email == user_email
    ).delete(synchronize_session=False)

    # 6. Delete the user record
    db.delete(current_user)
    db.commit()

    # Clear the auth cookie
    response.delete_cookie("authToken", path="/")

    # Send confirmation email
    try:
        background_tasks.add_task(
            send_email,
            sender_email=os.getenv("SMTP_EMAIL"),
            sender_password=os.getenv("SMTP_PASSWORD"),
            recipient_email=user_email,
            subject="Your Trips2gether account has been deleted 🗑️",
            body=get_account_deletion_email_template(user_name, deleted_at)
        )
    except Exception as e:
        print(f"[delete_account] Failed to queue deletion confirmation email: {e}")

    return {"ok": True, "message": "Account permanently deleted."}


# -------------------------
# Group endpoints
# -------------------------

@app.post("/flights/search", response_model=FlightSearchResponse)
def search_flights(body: FlightSearchIn):
    """Search flights with Duffel offer requests using test/live API key from backend env."""
    duffel_api_key = os.getenv("DUFFEL_API_KEY")
    if not duffel_api_key:
        raise HTTPException(status_code=500, detail="Duffel API key is not configured on the server")

    try:
        depart_date = datetime.strptime(body.depart_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Departure date must be in YYYY-MM-DD format")

    return_date = None
    if body.return_date:
        try:
            return_date = datetime.strptime(body.return_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="Return date must be in YYYY-MM-DD format")

    today = datetime.utcnow().date()
    if depart_date < today:
        raise HTTPException(status_code=422, detail="Departure date cannot be in the past")
    if return_date and return_date < depart_date:
        raise HTTPException(status_code=422, detail="Return date cannot be before departure")

    slices = [
        {
            "origin": body.origin,
            "destination": body.destination,
            "departure_date": body.depart_date,
        }
    ]
    if body.return_date:
        slices.append(
            {
                "origin": body.destination,
                "destination": body.origin,
                "departure_date": body.return_date,
            }
        )

    payload = {
        "data": {
            "slices": slices,
            "passengers": [{"type": "adult"} for _ in range(body.travelers)],
            "cabin_class": "economy",
        }
    }

    try:
        response = requests.post(
            f"{DUFFEL_API_URL}?return_offers=true&supplier_timeout=10000",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Duffel-Version": "v2",
                "Authorization": f"Bearer {duffel_api_key}",
            },
            json=payload,
            timeout=15,
        )
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="Flight search timed out. Please try again.")
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Unable to reach the flight provider right now")

    if not response.ok:
        detail = "Flight provider returned an error"
        try:
            body_json = response.json()
            errors = body_json.get("errors") or []
            if errors:
                detail = errors[0].get("message") or errors[0].get("title") or detail
            elif body_json.get("error"):
                detail = body_json.get("error")
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=detail)

    data = response.json().get("data", {})
    offers = data.get("offers", []) or []
    selected_offers = _select_diverse_offers(offers, limit=20)
    serialized_offers = [_serialize_duffel_offer(offer) for offer in selected_offers]

    return {
        "status": "success",
        "results": serialized_offers,
        "message": None if serialized_offers else "No matching flights found for this route.",
    }

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
            "status": group.status,
            "created_by": group.created_by,
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "member_count": 1,
            "role": "owner",
        },
    }


def _serialize_notification(notification: models.GroupNotification) -> dict:
    payload = {}
    try:
        payload = json.loads(notification.payload_json or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "group_id": notification.group_id,
        "poll_id": notification.poll_id,
        "notification_type": notification.notification_type,
        "title": notification.title,
        "body": notification.body,
        "payload": payload,
        "is_read": bool(getattr(notification, "is_read", False)),
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def _build_poll_notification_payload(poll: models.GroupPoll, db: Session, notification_type: str) -> tuple[str, str, dict]:
    group = db.get(models.Group, poll.group_id)
    creator = db.get(models.User, poll.created_by)
    poll_snapshot = _serialize_poll(
        poll,
        current_user_id=0,
        db=db,
        group_name=group.name if group else None,
        member_count=_get_group_member_count(poll.group_id, db),
    )
    option_labels = [option["label"] for option in poll_snapshot.get("options", []) if isinstance(option, dict)]
    poll_question = poll_snapshot.get("question") or poll.question
    group_name = group.name if group else "Your group"
    creator_name = creator.name if creator else "A member"

    if notification_type == "poll.created":
        title = f"New poll in {group_name}"
        body = f"{creator_name} created a new poll: {poll_question}. Vote before the deadline."
    else:
        winner_label = "No winning option"
        winner_option = next((option for option in poll_snapshot.get("options", []) if option.get("is_winner")), None)
        if winner_option:
            winner_label = winner_option.get("label", winner_label)
        title = f"Poll finished in {group_name}"
        body = f"{poll_question} is closed. Winning choice: {winner_label}."

    payload = {
        "group_id": poll.group_id,
        "group_name": group_name,
        "poll_id": poll.id,
        "poll_question": poll_question,
        "decision_type": poll.decision_type,
        "poll_status": poll.status,
        "created_by": poll.created_by,
        "created_by_name": creator_name,
        "option_labels": option_labels,
    }
    return title, body, payload


def _create_poll_notifications(
    poll: models.GroupPoll,
    db: Session,
    notification_type: str,
) -> list[models.GroupNotification]:
    members = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == poll.group_id)
        .all()
    )

    title, body, payload = _build_poll_notification_payload(poll, db, notification_type)
    notifications: list[models.GroupNotification] = []

    for member in members:
        notification = models.GroupNotification(
            user_id=member.user_id,
            group_id=poll.group_id,
            poll_id=poll.id,
            notification_type=notification_type,
            title=title,
            body=body,
            payload_json=json.dumps(payload),
        )
        db.add(notification)
        notifications.append(notification)

    return notifications


def _broadcast_poll_notifications(notifications: list[models.GroupNotification]) -> None:
    for notification in notifications:
        _publish_poll_event_sync(
            notification.group_id,
            {
                "type": "notification.created",
                "group_id": notification.group_id,
                "notification": _serialize_notification(notification),
            },
        )


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
    joined_at_map = {m.group_id: m.joined_at for m in memberships}

    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()

    items = (
        db.query(models.ItineraryItem)
        .join(models.TripPlan, models.ItineraryItem.trip_plan_id == models.TripPlan.id)
        .filter(models.TripPlan.group_id.in_(group_ids))
        .all()
    )
    items_by_group_id: dict[int, list[models.ItineraryItem]] = {}
    for item in items:
        group_id = item.trip_plan.group_id if item.trip_plan else None
        if group_id is None:
            continue
        items_by_group_id.setdefault(group_id, []).append(item)

    member_counts = {}
    for gid in group_ids:
        member_counts[gid] = (
            db.query(func.count(models.GroupMember.id))
            .filter(models.GroupMember.group_id == gid)
            .scalar()
        )

    result = []
    for g in groups:
        group_items = items_by_group_id.get(g.id, [])
        trip_start_at = None
        trip_end_at = None
        if group_items:
            trip_start_at = min(item.start_at for item in group_items)
            trip_end_at = max((item.end_at or item.start_at) for item in group_items)

        result.append(
            GroupOut(
                id=g.id,
                name=g.name,
                description=g.description,
                status=g.status,
                created_by=g.created_by,
                created_at=g.created_at,
                joined_at=joined_at_map.get(g.id),
                member_count=member_counts.get(g.id, 0),
                role=role_map.get(g.id),
                trip_item_count=len(group_items),
                trip_start_at=trip_start_at,
                trip_end_at=trip_end_at,
            )
        )

    return {"groups": result}


@app.get("/groups/{group_id}", response_model=dict)
def get_group_detail(group_id: int, request: Request, db: Session = Depends(get_db)):
    """Get full group metadata including members. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_count = (
        db.query(func.count(models.GroupMember.id))
        .filter(models.GroupMember.group_id == group_id)
        .scalar()
    )

    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "status": group.status,
        "created_by": group.created_by,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "member_count": member_count,
        "role": my_membership.role,
    }


@app.get("/dashboard/current-plans", response_model=DashboardCurrentPlanListOut)
def list_dashboard_current_plans(request: Request, db: Session = Depends(get_db)):
    """List the current user's active and upcoming group trip plans."""
    current_user = get_current_user_info(request, db)
    memberships = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.user_id == current_user.id)
        .all()
    )
    if not memberships:
        return {"items": []}

    group_ids = [membership.group_id for membership in memberships]
    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    if not groups:
        return {"items": []}

    items = (
        db.query(models.ItineraryItem)
        .join(models.TripPlan, models.ItineraryItem.trip_plan_id == models.TripPlan.id)
        .filter(models.TripPlan.group_id.in_(group_ids))
        .all()
    )
    items_by_group_id: dict[int, list[models.ItineraryItem]] = {}
    for item in items:
        group_id = item.trip_plan.group_id if item.trip_plan else None
        if group_id is None:
            continue
        items_by_group_id.setdefault(group_id, []).append(item)

    summaries: list[dict] = []
    for group in groups:
        summary = _build_dashboard_current_plan_item(
            group,
            group.trip_plan,
            items_by_group_id.get(group.id, []),
        )
        if summary is not None:
            summaries.append(summary)

    summaries.sort(
        key=lambda item: (
            item["starts_at"] is None,
            item["starts_at"] or datetime.max,
            item["title"].lower(),
        )
    )
    return {"items": summaries}


@app.get("/dashboard/active-chats", response_model=DashboardChatSummaryListOut)
def list_dashboard_active_chats(request: Request, db: Session = Depends(get_db)):
    """List the current user's active group chat summaries."""
    current_user = get_current_user_info(request, db)
    memberships = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.user_id == current_user.id)
        .all()
    )
    if not memberships:
        return {"items": []}

    group_ids = [membership.group_id for membership in memberships]
    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    if not groups:
        return {"items": []}

    group_map = {group.id: group for group in groups}
    messages = (
        db.query(models.GroupChatMessage)
        .filter(models.GroupChatMessage.group_id.in_(group_ids))
        .order_by(
            models.GroupChatMessage.created_at.desc(),
            models.GroupChatMessage.id.desc(),
        )
        .all()
    )
    messages_by_group: dict[int, list[models.GroupChatMessage]] = {}
    for message in messages:
        messages_by_group.setdefault(message.group_id, []).append(message)

    read_map = {membership.group_id: membership.last_chat_read_at for membership in memberships}
    summaries: list[dict] = []
    for membership in memberships:
        group = group_map.get(membership.group_id)
        if not group:
            continue

        summary = _build_dashboard_chat_summary_item(
            group,
            messages_by_group.get(group.id, []),
            current_user.id,
            read_map.get(group.id),
        )
        if summary is not None:
            summaries.append(summary)

    summaries.sort(key=lambda item: item["latest_message_at"], reverse=True)
    return {"items": summaries}


@app.get("/search/quick-jump", response_model=QuickJumpResult)
def quick_jump_search(query: str = "", request: Request = None, db: Session = Depends(get_db)):
    """
    Global quick-jump search returning groups, bookings, destinations, and chats.
    Filters by query (min 2 chars) or returns recent items if query is empty.
    """
    current_user = get_current_user_info(request, db)
    query = query.strip().lower()
    
    # Get user's group memberships
    memberships = db.query(models.GroupMember).filter(
        models.GroupMember.user_id == current_user.id
    ).all()
    
    if not memberships:
        return QuickJumpResult()
    
    group_ids = [m.group_id for m in memberships]
    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    group_map = {g.id: g for g in groups}
    
    # == GROUPS ==
    groups_result = []
    for group in groups:
        # Filter by query if provided
        if query and query not in group.name.lower():
            continue
        
        member_count = len(group.members) if group.members else 0
        groups_result.append({
            "id": group.id,
            "name": group.name,
            "status": group.status,
            "member_count": member_count,
        })
    
    # Sort groups by name; limit to 5 most recent
    groups_result.sort(key=lambda x: x["name"].lower())
    groups_result = groups_result[:5]
    
    # == BOOKINGS ==
    bookings_result = []
    profile = db.query(models.Profile).filter(
        models.Profile.user_id == current_user.id
    ).first()
    
    if profile:
        bookings = db.query(models.Booking).filter(
            models.Booking.profile_id == profile.id
        ).order_by(models.Booking.created_at.desc()).all()
        
        for booking in bookings:
            if query and query not in booking.booking_reference.lower():
                continue
            
            bookings_result.append({
                "id": booking.id,
                "booking_reference": booking.booking_reference,
                "status": booking.payment_status,
                "total_amount": booking.total_amount,
                "currency": booking.currency,
            })
        
        bookings_result = bookings_result[:5]
    
    # == DESTINATIONS (Shortlisted) ==
    destinations_result = []
    shortlisted_dests = db.query(models.GroupShortlistDestination).filter(
        models.GroupShortlistDestination.group_id.in_(group_ids)
    ).all()
    
    for dest in shortlisted_dests:
        if query and query not in dest.name.lower():
            continue
        
        group = group_map.get(dest.group_id)
        if not group:
            continue
        
        destinations_result.append({
            "id": dest.id,
            "name": dest.name,
            "place_id": dest.place_id,
            "group_id": dest.group_id,
            "group_name": group.name,
            "rating": dest.rating,
        })
    
    destinations_result = destinations_result[:5]
    
    # == CHATS ==
    chats_result = []
    messages = db.query(models.GroupChatMessage).filter(
        models.GroupChatMessage.group_id.in_(group_ids)
    ).order_by(models.GroupChatMessage.created_at.desc()).all()
    
    chats_by_group = {}
    for msg in messages:
        if msg.group_id not in chats_by_group:
            chats_by_group[msg.group_id] = msg
    
    for group_id, latest_msg in list(chats_by_group.items())[:5]:
        group = group_map.get(group_id)
        if not group:
            continue
        
        # For query filter, search in group name or message preview
        if query:
            if query not in group.name.lower() and query not in latest_msg.body.lower():
                continue
        
        # Count unread messages for this group
        membership = next((m for m in memberships if m.group_id == group_id), None)
        unread_count = 0
        if membership and membership.last_chat_read_at:
            unread_count = db.query(models.GroupChatMessage).filter(
                models.GroupChatMessage.group_id == group_id,
                models.GroupChatMessage.created_at > membership.last_chat_read_at
            ).count()
        
        chats_result.append({
            "group_id": group_id,
            "group_name": group.name,
            "latest_message": latest_msg.body[:100],  # Truncate to 100 chars
            "unread_count": unread_count,
        })
    
    return QuickJumpResult(
        groups=groups_result,
        bookings=bookings_result,
        destinations=destinations_result,
        chats=chats_result,
    )


@app.get("/groups/{group_id}/chat/messages", response_model=GroupChatThreadOut)
def list_group_chat_messages(group_id: int, request: Request, db: Session = Depends(get_db)):
    """Load a group's chat thread and mark it read for the current user."""
    current_user = get_current_user_info(request, db)
    group, membership = _get_group_and_membership(group_id, current_user.id, db)

    messages = (
        db.query(models.GroupChatMessage)
        .filter(models.GroupChatMessage.group_id == group_id)
        .order_by(
            models.GroupChatMessage.created_at.asc(),
            models.GroupChatMessage.id.asc(),
        )
        .all()
    )

    membership.last_chat_read_at = datetime.now()
    db.commit()

    return {
        "group_id": group.id,
        "group_name": group.name,
        "unread_count": 0,
        "messages": [_serialize_chat_message(message) for message in messages],
    }


@app.post("/groups/{group_id}/chat/messages", response_model=dict)
def create_group_chat_message(
    group_id: int,
    body: GroupChatMessageCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a new message to a group's chat thread."""
    current_user = get_current_user_info(request, db)
    group, membership = _get_group_and_membership(group_id, current_user.id, db)

    message_body = body.body.strip()
    if not message_body:
        raise HTTPException(status_code=400, detail="Message body cannot be empty")

    message = models.GroupChatMessage(
        group_id=group.id,
        sender_id=current_user.id,
        body=message_body,
    )
    db.add(message)
    membership.last_chat_read_at = datetime.now()
    db.commit()
    db.refresh(message)

    return {
        "ok": True,
        "message": {
            "id": message.id,
            "group_id": message.group_id,
            "sender_id": current_user.id,
            "sender_name": current_user.name,
            "body": message.body,
            "created_at": message.created_at.isoformat() if message.created_at else None,
            "updated_at": message.updated_at.isoformat() if message.updated_at else None,
        },
    }


@app.patch("/groups/{group_id}", response_model=dict)
def update_group(group_id: int, body: GroupUpdateIn, request: Request, db: Session = Depends(get_db)):
    """Update group name, description, or status. Only the owner can edit."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    if my_membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the group owner can edit group details")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if body.name is not None:
        group.name = body.name.strip()
    if body.description is not None:
        group.description = body.description.strip() or None
    if body.status is not None:
        group.status = body.status

    db.commit()
    db.refresh(group)

    member_count = (
        db.query(func.count(models.GroupMember.id))
        .filter(models.GroupMember.group_id == group_id)
        .scalar()
    )

    return {
        "ok": True,
        "group": {
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "status": group.status,
            "created_by": group.created_by,
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "member_count": member_count,
            "role": my_membership.role,
        },
    }


@app.patch("/groups/{group_id}/trip-state", response_model=dict)
def update_group_trip_state(
    group_id: int,
    body: TripStateUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update high-level trip lifecycle status for a group."""
    current_user = get_current_user_info(request, db)
    group, membership = _get_group_and_membership(group_id, current_user.id, db)

    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only group owners or admins can update trip state")

    allowed = {
        "planning": {"upcoming"},
        "confirmed": {"upcoming"},
        "finalized": {"upcoming"},
        "upcoming": {"active", "planning"},
        "active": {"archived", "upcoming"},
        "archived": {"upcoming"},
    }

    current_state = group.status
    target_state = body.status
    if target_state != current_state and target_state not in allowed.get(current_state, set()):
        raise HTTPException(status_code=400, detail=f"Cannot transition trip from {current_state} to {target_state}")

    if target_state == "archived" and current_state != "archived":
        plan = _get_or_create_trip_plan(group, db)
        items = _get_itinerary_items(plan.id, db)
        _snapshot_trip_plan_history(group, plan, items, db)

    group.status = target_state
    db.commit()
    db.refresh(group)

    return {
        "ok": True,
        "group": {
            "id": group.id,
            "status": group.status,
        },
    }


@app.post("/groups/{group_id}/polls", response_model=dict)
async def create_group_poll(
    group_id: int,
    body: GroupPollCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a poll in a group. Any current group member can create polls."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    closes_at = _to_naive_utc(body.closes_at)
    if closes_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Poll deadline must be in the future")

    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Poll question is required")

    option_labels = [option.label.strip() for option in body.options if option.label.strip()]
    if len(option_labels) < 2:
        raise HTTPException(status_code=400, detail="Poll requires at least two non-empty options")

    poll = models.GroupPoll(
        group_id=group.id,
        question=question,
        decision_type=body.decision_type,
        allow_vote_update=body.allow_vote_update,
        closes_at=closes_at,
        created_by=current_user.id,
    )
    db.add(poll)
    db.flush()

    for index, label in enumerate(option_labels):
        db.add(models.GroupPollOption(poll_id=poll.id, label=label, position=index))

    notifications = _create_poll_notifications(poll, db, "poll.created")

    db.commit()
    db.refresh(poll)

    await _publish_poll_event_async(group.id, _build_poll_event_payload("poll.created", poll, db))
    if notifications:
        _broadcast_poll_notifications(notifications)

    return {
        "ok": True,
        "message": "Poll created",
        "poll": _serialize_poll(
            poll,
            current_user.id,
            db,
            group_name=group.name,
            member_count=_get_group_member_count(group.id, db),
        ),
    }


@app.get("/groups/{group_id}/polls", response_model=dict)
def list_group_polls(group_id: int, request: Request, db: Session = Depends(get_db)):
    """List active and closed polls for a specific group the caller belongs to."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    finalized_polls, finalized_notifications = _finalize_due_polls_for_groups([group_id], db)
    for poll in finalized_polls:
        _publish_poll_event_sync(poll.group_id, _build_poll_event_payload("poll.closed", poll, db))
    if finalized_notifications:
        _broadcast_poll_notifications(finalized_notifications)

    member_count = _get_group_member_count(group_id, db)
    upcoming_polls = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.group_id == group_id,
            models.GroupPoll.status == "active",
        )
        .order_by(models.GroupPoll.closes_at.asc(), models.GroupPoll.created_at.desc())
        .all()
    )
    previous_polls = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.group_id == group_id,
            models.GroupPoll.status == "closed",
        )
        .order_by(models.GroupPoll.closed_at.desc(), models.GroupPoll.created_at.desc())
        .all()
    )

    return {
        "upcoming": [
            _serialize_poll(
                poll,
                current_user.id,
                db,
                group_name=group.name,
                member_count=member_count,
            )
            for poll in upcoming_polls
        ],
        "previous": [
            _serialize_poll(
                poll,
                current_user.id,
                db,
                group_name=group.name,
                member_count=member_count,
            )
            for poll in previous_polls
        ],
    }


@app.post("/groups/{group_id}/poll-suggestions", response_model=dict)
def get_group_poll_suggestions(
    group_id: int,
    body: GroupPollSuggestionIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Generate AI suggestions for poll options using group context and shortlist data."""
    from .ai import get_poll_option_suggestions as _get_poll_option_suggestions

    current_user = get_current_user_info(request, db)
    _group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    suggestions_result = _get_poll_option_suggestions(
        group_id=group_id,
        decision_type=body.decision_type,
        question=body.question,
        existing_options=body.existing_options,
        db=db,
    )
    suggestions = suggestions_result.get("suggestions", [])

    return {
        "ok": True,
        "suggestions": suggestions,
        "fallback": bool(suggestions_result.get("fallback", False)),
        "reason": suggestions_result.get("reason"),
    }


@app.get("/polls/dashboard", response_model=dict)
def list_dashboard_polls(request: Request, db: Session = Depends(get_db)):
    """List upcoming (active) and previous (closed) polls for all groups of the current user."""
    current_user = get_current_user_info(request, db)

    memberships = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.user_id == current_user.id)
        .all()
    )
    if not memberships:
        return {"upcoming": [], "previous": []}

    group_ids = [membership.group_id for membership in memberships]
    finalized_polls, finalized_notifications = _finalize_due_polls_for_groups(group_ids, db)
    for poll in finalized_polls:
        _publish_poll_event_sync(poll.group_id, _build_poll_event_payload("poll.closed", poll, db))
    if finalized_notifications:
        _broadcast_poll_notifications(finalized_notifications)

    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    group_name_map = {group.id: group.name for group in groups}

    member_counts = {
        group_id: _get_group_member_count(group_id, db)
        for group_id in group_ids
    }

    upcoming_polls = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.group_id.in_(group_ids),
            models.GroupPoll.status == "active",
        )
        .order_by(models.GroupPoll.closes_at.asc(), models.GroupPoll.created_at.desc())
        .all()
    )
    previous_polls = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.group_id.in_(group_ids),
            models.GroupPoll.status == "closed",
        )
        .order_by(models.GroupPoll.closed_at.desc(), models.GroupPoll.created_at.desc())
        .all()
    )

    return {
        "upcoming": [
            _serialize_poll(
                poll,
                current_user.id,
                db,
                group_name=group_name_map.get(poll.group_id),
                member_count=member_counts.get(poll.group_id, 0),
            )
            for poll in upcoming_polls
        ],
        "previous": [
            _serialize_poll(
                poll,
                current_user.id,
                db,
                group_name=group_name_map.get(poll.group_id),
                member_count=member_counts.get(poll.group_id, 0),
            )
            for poll in previous_polls
        ],
    }


@app.post("/groups/{group_id}/polls/{poll_id}/vote", response_model=dict)
async def submit_group_poll_vote(
    group_id: int,
    poll_id: int,
    body: GroupPollVoteIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Submit or update the caller's vote for an active group poll."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    poll = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.id == poll_id,
            models.GroupPoll.group_id == group_id,
        )
        .first()
    )
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    if _finalize_poll_if_due(poll, db):
        db.commit()
        db.refresh(poll)

    if poll.status != "active":
        raise HTTPException(status_code=400, detail="This poll is closed")

    option = (
        db.query(models.GroupPollOption)
        .filter(
            models.GroupPollOption.id == body.option_id,
            models.GroupPollOption.poll_id == poll.id,
        )
        .first()
    )
    if not option:
        raise HTTPException(status_code=400, detail="Selected option is not part of this poll")

    existing_vote = (
        db.query(models.GroupPollVote)
        .filter(
            models.GroupPollVote.poll_id == poll.id,
            models.GroupPollVote.voter_id == current_user.id,
        )
        .first()
    )

    if existing_vote:
        if not poll.allow_vote_update and existing_vote.option_id != body.option_id:
            raise HTTPException(status_code=400, detail="You have already voted and this poll does not allow vote changes")
        existing_vote.option_id = body.option_id
    else:
        db.add(models.GroupPollVote(
            poll_id=poll.id,
            option_id=body.option_id,
            voter_id=current_user.id,
        ))

    db.commit()
    db.refresh(poll)

    await _publish_poll_event_async(group.id, _build_poll_event_payload("poll.updated", poll, db))

    return {
        "ok": True,
        "message": "Vote recorded",
        "poll": _serialize_poll(
            poll,
            current_user.id,
            db,
            group_name=group.name,
            member_count=_get_group_member_count(group.id, db),
        ),
    }


@app.patch("/groups/{group_id}/polls/{poll_id}/end", response_model=dict)
async def end_group_poll_early(
    group_id: int,
    poll_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Allow the poll host to end an active poll early and publish the winning option."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    poll = (
        db.query(models.GroupPoll)
        .filter(
            models.GroupPoll.id == poll_id,
            models.GroupPoll.group_id == group_id,
        )
        .first()
    )
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    if poll.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the poll host can end this poll early")

    if poll.status != "active":
        raise HTTPException(status_code=400, detail="This poll is already closed")

    _close_poll_and_compute_winner(poll, db)
    notifications = _create_poll_notifications(poll, db, "poll.closed")
    db.commit()
    db.refresh(poll)

    await _publish_poll_event_async(group.id, _build_poll_event_payload("poll.closed", poll, db))
    if notifications:
        _broadcast_poll_notifications(notifications)

    return {
        "ok": True,
        "message": "Poll ended early",
        "poll": _serialize_poll(
            poll,
            current_user.id,
            db,
            group_name=group.name,
            member_count=_get_group_member_count(group.id, db),
        ),
    }


@app.websocket("/ws/polls")
async def poll_updates_socket(websocket: WebSocket):
    db = next(get_db())
    try:
        current_user = _get_current_user_from_websocket(websocket, db)
        group_ids = _get_user_group_ids(current_user.id, db)
        await poll_realtime_manager.connect(websocket, group_ids)
        await websocket.send_json({"type": "poll.connection.ready", "group_ids": group_ids})

        while True:
            await websocket.receive()
    except WebSocketDisconnect:
        pass
    except HTTPException:
        await websocket.close(code=4401)
    finally:
        try:
            await poll_realtime_manager.disconnect(websocket)
        except Exception:
            pass
        db.close()


@app.get("/poll-notifications", response_model=GroupNotificationListOut)
def list_poll_notifications(request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    notifications = (
        db.query(models.GroupNotification)
        .filter(models.GroupNotification.user_id == current_user.id)
        .order_by(models.GroupNotification.created_at.desc())
        .all()
    )
    return {"items": [_serialize_notification(notification) for notification in notifications]}


@app.delete("/poll-notifications/{notification_id}", response_model=dict)
def delete_poll_notification(notification_id: int, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    notification = (
        db.query(models.GroupNotification)
        .filter(
            models.GroupNotification.id == notification_id,
            models.GroupNotification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notification)
    db.commit()
    return {"ok": True, "message": "Notification removed"}


@app.patch("/poll-notifications/{notification_id}/read", response_model=dict)
def mark_poll_notification_read(notification_id: int, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    notification = (
        db.query(models.GroupNotification)
        .filter(
            models.GroupNotification.id == notification_id,
            models.GroupNotification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()
    return {"ok": True}


@app.get("/notifications", response_model=NotificationListOut)
def list_personal_notifications(request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    notes = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc())
        .all()
    )

    items = []
    for n in notes:
        payload = {}
        try:
            payload = json.loads(n.payload_json or "{}")
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}

        items.append({
            "id": n.id,
            "user_id": n.user_id,
            "notification_type": n.notification_type,
            "title": n.title,
            "body": n.body,
            "payload": payload,
            "is_read": bool(n.is_read),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        })

    return {"items": items}


@app.patch("/notifications/{notification_id}/read", response_model=dict)
def mark_personal_notification_read(notification_id: int, request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    notification = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()
    return {"ok": True}


@app.get("/notifications/unread-count", response_model=dict)
def get_unread_notifications_count(request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user_info(request, db)
    personal_unread = (
        db.query(func.count(models.Notification.id))
        .filter(models.Notification.user_id == current_user.id, models.Notification.is_read == False)
        .scalar()
    ) or 0
    group_unread = (
        db.query(func.count(models.GroupNotification.id))
        .filter(models.GroupNotification.user_id == current_user.id, models.GroupNotification.is_read == False)
        .scalar()
    ) or 0
    return {"unread_count": int(personal_unread) + int(group_unread)}


@app.get("/groups/{group_id}/members", response_model=GroupMemberListOut)
def list_group_members(group_id: int, request: Request, db: Session = Depends(get_db)):
    """List all members of a group. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    memberships = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id)
        .all()
    )

    user_ids = [m.user_id for m in memberships]
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
    users_by_id = {u.id: u for u in users}

    profiles = db.query(models.Profile).filter(models.Profile.user_id.in_(user_ids)).all()
    avatar_by_user_id = {p.user_id: p.avatar_url for p in profiles}

    members = []
    for m in memberships:
        u = users_by_id.get(m.user_id)
        if u:
            members.append(
                GroupMemberOut(
                    id=m.id,
                    user_id=u.id,
                    name=u.name,
                    email=u.email,
                    role=m.role,
                    avatar_url=avatar_by_user_id.get(m.user_id),
                )
            )

    return {"members": members}


@app.post("/groups/{group_id}/members", response_model=dict)
def add_group_members(
    group_id: int, body: GroupAddMembersIn, request: Request, db: Session = Depends(get_db)
):
    """Add friends to a group. Caller must be a member. Users must be friends with caller."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    added = []
    skipped = []

    for uid in body.user_ids:
        if uid == current_user.id:
            skipped.append(uid)
            continue

        # Check that the target user is a friend
        friendship = (
            db.query(models.Friendship)
            .filter(
                models.Friendship.status == "accepted",
                or_(
                    and_(
                        models.Friendship.requester_id == current_user.id,
                        models.Friendship.addressee_id == uid,
                    ),
                    and_(
                        models.Friendship.requester_id == uid,
                        models.Friendship.addressee_id == current_user.id,
                    ),
                ),
            )
            .first()
        )
        if not friendship:
            skipped.append(uid)
            continue

        # Check if already a member
        existing = (
            db.query(models.GroupMember)
            .filter(
                models.GroupMember.group_id == group_id,
                models.GroupMember.user_id == uid,
            )
            .first()
        )
        if existing:
            skipped.append(uid)
            continue

        member = models.GroupMember(
            group_id=group_id,
            user_id=uid,
            role="member",
        )
        db.add(member)
        added.append(uid)

    db.commit()

    # Create notifications for newly added members
    if added:
        notifications: list[models.GroupNotification] = []
        inviter_name = current_user.name if current_user else "A member"
        for uid in added:
            title = f"You've been added to {group.name}"
            body = f"{inviter_name} added you to the group {group.name}."
            payload = {"group_id": group.id, "added_by": current_user.id}
            n = models.GroupNotification(
                user_id=uid,
                group_id=group.id,
                poll_id=None,
                notification_type="group.invite",
                title=title,
                body=body,
                payload_json=json.dumps(payload),
            )
            db.add(n)
            notifications.append(n)

        db.commit()
        # Broadcast real-time notification events for the group
        if notifications:
            _broadcast_poll_notifications(notifications)

    return {
        "ok": True,
        "added": added,
        "skipped": skipped,
        "message": f"Added {len(added)} member(s) to the group",
    }


@app.delete("/groups/{group_id}/members/{user_id}", response_model=dict)
def remove_group_member(
    group_id: int, user_id: int, request: Request, db: Session = Depends(get_db)
):
    """Remove a member from a group. Only the group owner can remove others."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    if my_membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the group owner can remove members")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Owner cannot remove themselves")

    target = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == user_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this group")

    db.delete(target)
    db.commit()

    return {"ok": True, "message": "Member removed from group"}


@app.post("/groups/{group_id}/leave", response_model=dict)
def leave_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    """Leave a group. Owners cannot leave — they must delete the group instead."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=404, detail="You are not a member of this group")

    if my_membership.role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot leave the group. Delete the group instead.")

    db.delete(my_membership)
    db.commit()

    return {"ok": True, "message": "You have left the group"}


@app.delete("/groups/{group_id}", response_model=dict)
def delete_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    """Delete a group entirely. Only the owner can delete."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    if my_membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the group owner can delete the group")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    db.delete(group)
    db.commit()

    return {"ok": True, "message": "Group deleted"}


@app.patch("/groups/{group_id}/members/{user_id}/role", response_model=dict)
def update_member_role(
    group_id: int, user_id: int, body: GroupUpdateRoleIn, request: Request, db: Session = Depends(get_db)
):
    """Update a member's role. Only the owner can change roles."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    if my_membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the group owner can change roles")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Owner cannot change their own role")

    target = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == user_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this group")

    target.role = body.role
    db.commit()

    return {"ok": True, "message": f"Role updated to {body.role}"}





@app.get("/groups/{group_id}/shortlist", response_model=GroupShortlistListOut)
def list_group_shortlist(group_id: int, request: Request, db: Session = Depends(get_db)):
    """List shortlisted destinations for a group. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    items = (
        db.query(models.GroupShortlistDestination)
        .filter(models.GroupShortlistDestination.group_id == group_id)
        .order_by(models.GroupShortlistDestination.created_at.desc())
        .all()
    )

    return {"items": [serialize_shortlist_item(item) for item in items]}


@app.post("/groups/{group_id}/shortlist", response_model=dict)
def add_group_shortlist_destination(
    group_id: int,
    body: GroupShortlistCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a destination to group shortlist. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    existing = (
        db.query(models.GroupShortlistDestination)
        .filter(
            models.GroupShortlistDestination.group_id == group_id,
            models.GroupShortlistDestination.place_id == body.place_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Destination already shortlisted for this group")

    photo_reference = body.photo_reference.strip() if body.photo_reference else None
    # Google Places photo references can exceed older VARCHAR(255) schemas in production.
    # Keep the API stable by dropping overly long references instead of crashing the request.
    if photo_reference and len(photo_reference) > 255:
        photo_reference = None

    # Estimate cost if not provided
    estimated_cost = body.estimated_cost
    if estimated_cost is None or estimated_cost == 0:
        from .ai import estimate_item_cost
        # Determine item type from types array
        item_type = "activity"
        if body.types and len(body.types) > 0:
            type_str = body.types[0].lower()
            if "restaurant" in type_str or "food" in type_str:
                item_type = "restaurant"
            elif "bar" in type_str or "cafe" in type_str:
                item_type = "activity"
        
        location = body.address or "unknown"
        estimated_cost = estimate_item_cost(
            item_type=item_type,
            item_name=body.name,
            item_location=location,
            item_duration=1,
            currency=body.currency,
        )

    item = models.GroupShortlistDestination(
        group_id=group_id,
        place_id=body.place_id.strip(),
        name=body.name.strip(),
        address=(body.address.strip() if body.address else None),
        photo_url=(body.photo_url.strip() if body.photo_url else None),
        photo_reference=photo_reference,
        rating=body.rating,
        destination_types_json=json.dumps(body.types or []),
        estimated_cost=estimated_cost,
        currency=body.currency,
        added_by=current_user.id,
    )
    db.add(item)
    try:
        db.commit()
    except DataError as exc:
        db.rollback()
        if "photo_reference" not in str(exc).lower():
            raise HTTPException(status_code=500, detail="Failed to save shortlisted destination")

        item.photo_reference = None
        db.add(item)
        db.commit()

    db.refresh(item)

    return {
        "ok": True,
        "message": "Destination added to shortlist",
        "item": serialize_shortlist_item(item),
    }


@app.delete("/groups/{group_id}/shortlist/{place_id}", response_model=dict)
def remove_group_shortlist_destination(
    group_id: int,
    place_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Remove a destination from group shortlist. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    item = (
        db.query(models.GroupShortlistDestination)
        .filter(
            models.GroupShortlistDestination.group_id == group_id,
            models.GroupShortlistDestination.place_id == place_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Shortlisted destination not found")

    db.delete(item)
    db.commit()

    return {"ok": True, "message": "Destination removed from shortlist"}


@app.get("/groups/{group_id}/flight-shortlist", response_model=GroupShortlistFlightListOut)
def list_group_flight_shortlist(group_id: int, request: Request, db: Session = Depends(get_db)):
    """List shortlisted flights for a group. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    items = (
        db.query(models.GroupShortlistFlight)
        .filter(models.GroupShortlistFlight.group_id == group_id)
        .order_by(models.GroupShortlistFlight.created_at.desc())
        .all()
    )

    return {"items": [serialize_shortlist_flight_item(item) for item in items]}


@app.post("/groups/{group_id}/flight-shortlist", response_model=dict)
def add_group_shortlist_flight(
    group_id: int,
    body: GroupShortlistFlightCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a flight to group shortlist. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    offer_id = body.flight_offer_id.strip()
    existing = (
        db.query(models.GroupShortlistFlight)
        .filter(
            models.GroupShortlistFlight.group_id == group_id,
            models.GroupShortlistFlight.flight_offer_id == offer_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Flight already shortlisted for this group")

    item = models.GroupShortlistFlight(
        group_id=group_id,
        flight_offer_id=offer_id,
        airline=body.airline.strip(),
        logo_url=(body.logo_url.strip() if body.logo_url else None),
        price=body.price,
        currency=body.currency.strip(),
        duration=body.duration.strip(),
        stops=body.stops,
        departure_time=(body.departure_time.strip() if body.departure_time else None),
        arrival_time=(body.arrival_time.strip() if body.arrival_time else None),
        departure_airport=body.departure_airport.strip(),
        arrival_airport=body.arrival_airport.strip(),
        cabin_class=(body.cabin_class.strip() if body.cabin_class else None),
        baggages_json=json.dumps(body.baggages or []),
        slices_json=json.dumps(body.slices or []),
        emissions_kg=(body.emissions_kg.strip() if body.emissions_kg else None),
        added_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "ok": True,
        "message": "Flight added to shortlist",
        "item": serialize_shortlist_flight_item(item),
    }


@app.delete("/groups/{group_id}/flight-shortlist/{flight_offer_id}", response_model=dict)
def remove_group_shortlist_flight(
    group_id: int,
    flight_offer_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Remove a flight from group shortlist. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    item = (
        db.query(models.GroupShortlistFlight)
        .filter(
            models.GroupShortlistFlight.group_id == group_id,
            models.GroupShortlistFlight.flight_offer_id == flight_offer_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Shortlisted flight not found")

    db.delete(item)
    db.commit()

    return {"ok": True, "message": "Flight removed from shortlist"}


@app.get("/groups/{group_id}/hotel-shortlist", response_model=GroupShortlistHotelListOut)
def list_group_hotel_shortlist(group_id: int, request: Request, db: Session = Depends(get_db)):
    """List shortlisted hotels for a group. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    items = (
        db.query(models.GroupShortlistHotel)
        .filter(models.GroupShortlistHotel.group_id == group_id)
        .order_by(models.GroupShortlistHotel.created_at.desc())
        .all()
    )

    return {"items": [serialize_shortlist_hotel_item(item) for item in items]}


@app.post("/groups/{group_id}/hotel-shortlist", response_model=dict)
def add_group_shortlist_hotel(
    group_id: int,
    body: GroupShortlistHotelCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a hotel to group shortlist. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    place_id = body.place_id.strip()
    existing = (
        db.query(models.GroupShortlistHotel)
        .filter(
            models.GroupShortlistHotel.group_id == group_id,
            models.GroupShortlistHotel.place_id == place_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Hotel already shortlisted for this group")

    item = models.GroupShortlistHotel(
        group_id=group_id,
        place_id=place_id,
        name=body.name.strip(),
        address=(body.address.strip() if body.address else None),
        photo_url=(body.photo_url.strip() if body.photo_url else None),
        photo_reference=(body.photo_reference.strip() if body.photo_reference else None),
        rating=body.rating,
        price_level=(body.price_level.strip() if body.price_level else None),
        currency=body.currency.strip() if body.currency else "USD",
        price_per_night=body.price_per_night,
        total_price=body.total_price,
        nights=body.nights,
        hotel_types_json=json.dumps(body.types or []),
        amenities_json=json.dumps(body.amenities or []),
        booking_url=(body.booking_url.strip() if body.booking_url else None),
        added_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "ok": True,
        "message": "Hotel added to shortlist",
        "item": serialize_shortlist_hotel_item(item),
    }


@app.delete("/groups/{group_id}/hotel-shortlist/{place_id}", response_model=dict)
def remove_group_shortlist_hotel(
    group_id: int,
    place_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Remove a hotel from group shortlist. Caller must be a member."""
    current_user = get_current_user_info(request, db)

    my_membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not my_membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    item = (
        db.query(models.GroupShortlistHotel)
        .filter(
            models.GroupShortlistHotel.group_id == group_id,
            models.GroupShortlistHotel.place_id == place_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Shortlisted hotel not found")

    db.delete(item)
    db.commit()

    return {"ok": True, "message": "Hotel removed from shortlist"}


# Itinerary Endpoints

@app.get("/groups/{group_id}/itinerary", response_model=ItineraryTimelineOut)
def get_group_itinerary(group_id: int, request: Request, db: Session = Depends(get_db)):
    """Get the compiled itinerary for a group. Caller must be a member."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    plan = _get_or_create_trip_plan(group, db)
    return _build_itinerary_payload(group, plan, db)


@app.post("/groups/{group_id}/itinerary", response_model=dict)
def create_or_update_itinerary_plan(
    group_id: int,
    body: ItineraryPlanCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create or update the trip plan metadata for a group."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    _assert_itinerary_mutable(group)

    plan = _get_or_create_trip_plan(group, db)

    if body.title is not None:
        trimmed_title = body.title.strip()
        if not trimmed_title:
            raise HTTPException(status_code=400, detail="Itinerary title cannot be empty")
        plan.title = trimmed_title
    elif not plan.title:
        plan.title = f"{group.name} Itinerary"

    if body.description is not None:
        plan.description = body.description.strip() or None

    db.commit()
    db.refresh(plan)

    item_count = (
        db.query(func.count(models.ItineraryItem.id))
        .filter(models.ItineraryItem.trip_plan_id == plan.id)
        .scalar()
    )

    return {
        "ok": True,
        "trip_plan": serialize_trip_plan(plan, item_count or 0),
    }


@app.post("/groups/{group_id}/itinerary/items", response_model=dict)
def add_itinerary_item(
    group_id: int,
    body: ItineraryItemCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a timeline item to a group's itinerary."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    _assert_itinerary_mutable(group)

    if body.end_at is not None and body.end_at < body.start_at:
        raise HTTPException(status_code=400, detail="End time cannot be before start time")

    plan = _get_or_create_trip_plan(group, db)
    item_title = body.title.strip()
    if not item_title:
        raise HTTPException(status_code=400, detail="Itinerary item title cannot be empty")

    max_sort_order = db.query(func.max(models.ItineraryItem.sort_order)).filter(models.ItineraryItem.trip_plan_id == plan.id).scalar() or 0

    # Estimate cost if not provided
    estimated_cost = body.estimated_cost
    if estimated_cost is None or estimated_cost == 0:
        from .ai import estimate_item_cost
        location = body.location_name or "unknown"
        duration = 1
        estimated_cost = estimate_item_cost(
            item_type=body.item_type,
            item_name=body.title,
            item_location=location,
            item_duration=duration,
            currency=body.currency,
        )

    item = models.ItineraryItem(
        trip_plan_id=plan.id,
        item_type=body.item_type,
        title=item_title,
        sort_order=max_sort_order + 1 if max_sort_order > 0 else 0,
        start_at=body.start_at,
        end_at=body.end_at,
        location_name=body.location_name.strip() if body.location_name else None,
        location_address=body.location_address.strip() if body.location_address else None,
        notes=body.notes.strip() if body.notes else None,
        source_kind=body.source_kind.strip() if body.source_kind else None,
        source_reference=body.source_reference.strip() if body.source_reference else None,
        details_json=json.dumps(body.details or {}),
        estimated_cost=estimated_cost,
        currency=body.currency,
        created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # Notify group members about the new itinerary item
    try:
        members = (
            db.query(models.GroupMember)
            .filter(models.GroupMember.group_id == group_id)
            .all()
        )
        created_notifications: list[models.GroupNotification] = []
        for member in members:
            if member.user_id == current_user.id:
                continue
            title = f"Itinerary updated in {group.name}"
            body = f"{current_user.name} added '{item.title}' to the itinerary."
            payload = {"group_id": group.id, "trip_plan_id": plan.id, "item_id": item.id}
            n = models.GroupNotification(
                user_id=member.user_id,
                group_id=group.id,
                poll_id=None,
                notification_type="itinerary.added",
                title=title,
                body=body,
                payload_json=json.dumps(payload),
            )
            db.add(n)
            created_notifications.append(n)
        db.commit()
        if created_notifications:
            _broadcast_poll_notifications(created_notifications)
    except Exception:
        db.rollback()

    warnings = _build_time_conflict_warnings(plan.id, item.id, item.start_at, item.end_at, db)

    payload = _build_itinerary_payload(group, plan, db, warnings)
    payload["message"] = "Itinerary item added"
    return payload


@app.post("/groups/{group_id}/itinerary/from-shortlist", response_model=dict)
def add_itinerary_item_from_shortlist(
    group_id: int,
    body: ItineraryShortlistImportIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create an itinerary item directly from a shortlisted destination/hotel/flight entry."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    _assert_itinerary_mutable(group)

    plan = _get_or_create_trip_plan(group, db)
    resolved_start = body.start_at or _resolve_itinerary_slot(group, plan, db)
    resolved_end = body.end_at

    shortlist_type = body.shortlist_type
    reference = body.shortlist_reference.strip()
    title = ""
    item_type = "other"
    location_name = None
    location_address = None
    notes = body.notes.strip() if body.notes else None
    details: dict = {"shortlist_type": shortlist_type}

    if shortlist_type in ("destination", "restaurant"):
        entry = (
            db.query(models.GroupShortlistDestination)
            .filter(
                models.GroupShortlistDestination.group_id == group_id,
                models.GroupShortlistDestination.place_id == reference,
            )
            .first()
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Shortlisted destination not found")

        try:
            destination_types = json.loads(entry.destination_types_json or "[]")
            if not isinstance(destination_types, list):
                destination_types = []
        except Exception:
            destination_types = []

        is_restaurant = shortlist_type == "restaurant" or any(str(t).lower() == "restaurant" for t in destination_types)
        shortlist_type = "restaurant" if is_restaurant else "destination"
        item_type = "dining" if is_restaurant else "activity"
        title = ("Restaurant: " if is_restaurant else "Destination: ") + entry.name
        location_name = entry.name
        location_address = entry.address
        details.update({
            "place_id": entry.place_id,
            "types": destination_types,
            "rating": entry.rating,
            "photo_url": entry.photo_url,
            "photo_reference": entry.photo_reference,
        })

    elif shortlist_type == "hotel":
        entry = (
            db.query(models.GroupShortlistHotel)
            .filter(
                models.GroupShortlistHotel.group_id == group_id,
                models.GroupShortlistHotel.place_id == reference,
            )
            .first()
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Shortlisted hotel not found")

        item_type = "accommodation"
        title = f"Hotel: {entry.name}"
        location_name = entry.name
        location_address = entry.address
        if resolved_end is None and entry.nights:
            resolved_end = resolved_start + timedelta(days=max(entry.nights, 1))
        details.update({
            "place_id": entry.place_id,
            "rating": entry.rating,
            "price_per_night": entry.price_per_night,
            "total_price": entry.total_price,
            "currency": entry.currency,
            "booking_url": entry.booking_url,
            "photo_url": entry.photo_url,
            "photo_reference": entry.photo_reference,
        })

    elif shortlist_type == "flight":
        entry = (
            db.query(models.GroupShortlistFlight)
            .filter(
                models.GroupShortlistFlight.group_id == group_id,
                models.GroupShortlistFlight.flight_offer_id == reference,
            )
            .first()
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Shortlisted flight not found")

        item_type = "flight"
        title = f"Flight: {entry.airline} {entry.departure_airport} -> {entry.arrival_airport}"
        location_name = entry.departure_airport
        location_address = f"Arrive at {entry.arrival_airport}"

        dep_parts = _coerce_hhmm(entry.departure_time)
        arr_parts = _coerce_hhmm(entry.arrival_time)
        if dep_parts:
            resolved_start = resolved_start.replace(hour=dep_parts[0], minute=dep_parts[1], second=0, microsecond=0)
        if arr_parts:
            candidate_end = resolved_start.replace(hour=arr_parts[0], minute=arr_parts[1], second=0, microsecond=0)
            if candidate_end <= resolved_start:
                candidate_end = candidate_end + timedelta(days=1)
            resolved_end = resolved_end or candidate_end
        elif resolved_end is None:
            resolved_end = resolved_start + timedelta(hours=3)

        details.update({
            "flight_offer_id": entry.flight_offer_id,
            "airline": entry.airline,
            "price": entry.price,
            "currency": entry.currency,
            "duration": entry.duration,
            "stops": entry.stops,
            "departure_airport": entry.departure_airport,
            "arrival_airport": entry.arrival_airport,
            "cabin_class": entry.cabin_class,
            "emissions_kg": entry.emissions_kg,
        })
    else:
        raise HTTPException(status_code=400, detail="Unsupported shortlist type")

    if resolved_end is not None and resolved_end < resolved_start:
        raise HTTPException(status_code=400, detail="End time cannot be before start time")

    max_sort_order = db.query(func.max(models.ItineraryItem.sort_order)).filter(models.ItineraryItem.trip_plan_id == plan.id).scalar() or 0
    itinerary_item = models.ItineraryItem(
        trip_plan_id=plan.id,
        item_type=item_type,
        title=title,
        sort_order=max_sort_order + 1 if max_sort_order > 0 else 0,
        start_at=resolved_start,
        end_at=resolved_end,
        location_name=location_name,
        location_address=location_address,
        notes=notes,
        source_kind=f"shortlist:{shortlist_type}",
        source_reference=reference,
        details_json=json.dumps(details),
        created_by=current_user.id,
    )
    db.add(itinerary_item)
    db.commit()
    db.refresh(itinerary_item)

    warnings = _build_time_conflict_warnings(plan.id, itinerary_item.id, itinerary_item.start_at, itinerary_item.end_at, db)
    payload = _build_itinerary_payload(group, plan, db, warnings)
    payload["item"] = serialize_itinerary_item(itinerary_item)
    payload["message"] = "Shortlisted item added to itinerary"
    return payload


@app.patch("/groups/{group_id}/itinerary/notes", response_model=dict)
def update_itinerary_shared_notes(
    group_id: int,
    body: ItinerarySharedNotesIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Save shared itinerary notes visible to all group members."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    plan = _get_or_create_trip_plan(group, db)

    plan.shared_notes = (body.shared_notes or "").strip() or None
    db.commit()
    db.refresh(plan)

    payload = _build_itinerary_payload(group, plan, db)
    payload["message"] = "Shared notes updated"
    return payload


@app.patch("/groups/{group_id}/itinerary/items/{item_id}", response_model=dict)
def update_itinerary_item(
    group_id: int,
    item_id: int,
    body: ItineraryItemUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update a single itinerary item."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    _assert_itinerary_mutable(group)
    plan = _get_or_create_trip_plan(group, db)

    item = (
        db.query(models.ItineraryItem)
        .filter(
            models.ItineraryItem.trip_plan_id == plan.id,
            models.ItineraryItem.id == item_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Itinerary item not found")

    new_start_at = body.start_at if body.start_at is not None else item.start_at
    new_end_at = body.end_at if body.end_at is not None else item.end_at
    if new_end_at is not None and new_end_at < new_start_at:
        raise HTTPException(status_code=400, detail="End time cannot be before start time")

    if body.item_type is not None:
        item.item_type = body.item_type
    if body.title is not None:
        trimmed_title = body.title.strip()
        if not trimmed_title:
            raise HTTPException(status_code=400, detail="Itinerary item title cannot be empty")
        item.title = trimmed_title
    if body.start_at is not None:
        item.start_at = body.start_at
    if body.end_at is not None:
        item.end_at = body.end_at
    if body.location_name is not None:
        item.location_name = body.location_name.strip() or None
    if body.location_address is not None:
        item.location_address = body.location_address.strip() or None
    if body.notes is not None:
        item.notes = body.notes.strip() or None
    if body.source_kind is not None:
        item.source_kind = body.source_kind.strip() or None
    if body.source_reference is not None:
        item.source_reference = body.source_reference.strip() or None
    if body.details is not None:
        item.details_json = json.dumps(body.details or {})
    if body.estimated_cost is not None:
        item.estimated_cost = body.estimated_cost
    if body.currency is not None:
        item.currency = body.currency

    db.commit()
    db.refresh(item)

    # Notify other group members about the itinerary update
    try:
        members = (
            db.query(models.GroupMember)
            .filter(models.GroupMember.group_id == group_id)
            .all()
        )
        created_notifications: list[models.GroupNotification] = []
        for member in members:
            if member.user_id == current_user.id:
                continue
            title = f"Itinerary updated in {group.name}"
            body = f"{current_user.name} updated '{item.title}' in the itinerary."
            payload = {"group_id": group.id, "trip_plan_id": plan.id, "item_id": item.id}
            n = models.GroupNotification(
                user_id=member.user_id,
                group_id=group.id,
                poll_id=None,
                notification_type="itinerary.updated",
                title=title,
                body=body,
                payload_json=json.dumps(payload),
            )
            db.add(n)
            created_notifications.append(n)
        db.commit()
        if created_notifications:
            _broadcast_poll_notifications(created_notifications)
    except Exception:
        db.rollback()

    warnings = _build_time_conflict_warnings(plan.id, item.id, item.start_at, item.end_at, db)
    payload = _build_itinerary_payload(group, plan, db, warnings)
    payload["message"] = "Itinerary item updated"
    payload["item"] = serialize_itinerary_item(item)
    return payload


@app.delete("/groups/{group_id}/itinerary/items/{item_id}", response_model=dict)
def delete_itinerary_item(
    group_id: int,
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Delete an itinerary item and renumber the remaining sequence."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    _assert_itinerary_mutable(group)
    plan = _get_or_create_trip_plan(group, db)

    item = (
        db.query(models.ItineraryItem)
        .filter(
            models.ItineraryItem.trip_plan_id == plan.id,
            models.ItineraryItem.id == item_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Itinerary item not found")

    db.delete(item)
    db.flush()
    _resequence_itinerary_items(plan.id, db)
    db.commit()

    payload = _build_itinerary_payload(group, plan, db)
    payload["message"] = "Itinerary item deleted"
    return payload


@app.patch("/groups/{group_id}/itinerary/reorder", response_model=dict)
def reorder_itinerary_items(
    group_id: int,
    body: ItineraryItemReorderIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Persist a reordered itinerary sequence."""
    current_user = get_current_user_info(request, db)
    group, _membership = _get_group_and_membership(group_id, current_user.id, db)
    _assert_itinerary_mutable(group)
    plan = _get_or_create_trip_plan(group, db)

    items = (
        db.query(models.ItineraryItem)
        .filter(models.ItineraryItem.trip_plan_id == plan.id)
        .all()
    )
    item_by_id = {item.id: item for item in items}
    if len(body.item_ids) != len(items) or set(body.item_ids) != set(item_by_id):
        raise HTTPException(status_code=400, detail="Reorder payload must include every itinerary item exactly once")

    for index, item_id in enumerate(body.item_ids):
        item_by_id[item_id].sort_order = index

    db.commit()

    payload = _build_itinerary_payload(group, plan, db)
    payload["message"] = "Itinerary order updated"
    return payload


@app.post("/groups/{group_id}/itinerary/new-trip", response_model=dict)
def start_new_trip_from_archived_itinerary(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Archive the current trip snapshot and reset itinerary for a fresh planning cycle."""
    current_user = get_current_user_info(request, db)
    group, membership = _get_group_and_membership(group_id, current_user.id, db)

    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only group owners or admins can start a new trip")

    if group.status != "archived":
        raise HTTPException(status_code=400, detail="A new trip can only be started from an archived trip")

    plan = _get_or_create_trip_plan(group, db)
    items = _get_itinerary_items(plan.id, db)

    existing_history_count = (
        db.query(func.count(models.TripPlanHistory.id))
        .filter(models.TripPlanHistory.group_id == group.id)
        .scalar()
        or 0
    )
    if existing_history_count == 0 and items:
        _snapshot_trip_plan_history(group, plan, items, db)

    for item in items:
        db.delete(item)

    plan.shared_notes = None
    plan.description = f"Chronological plan for {group.name}"
    plan.title = f"{group.name} Itinerary"
    group.status = "planning"

    db.commit()
    db.refresh(plan)
    db.refresh(group)

    payload = _build_itinerary_payload(group, plan, db)
    payload["message"] = "Started a fresh trip itinerary"
    return payload


# -------------------------
# AI Trip Success Score
# -------------------------

@app.get("/groups/{group_id}/trip-success-score", response_model=TripSuccessScoreResponse)
def group_trip_success_score(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return an AI-generated trip success score for the group."""
    from .ai import get_trip_success_score as _get_score
    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)  # verifies membership
    result = _get_score(group_id, db)
    return result


@app.post("/ai-assistant/suggest", response_model=AiAssistantSuggestOut)
def ai_assistant_suggest(
    body: AiAssistantSuggestIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """General-purpose AI assistant endpoint for free-form travel suggestions."""
    from .ai import generate_general_assistant_reply as _suggest

    _ = get_current_user_info(request, db)
    result = _suggest(body.prompt, body.mode)
    return result


@app.post("/groups/{group_id}/ai-trip-plan/generate", response_model=dict)
def generate_ai_trip_plan(
    group_id: int,
    body: AiTripPlanGenerateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Generate and persist a full AI trip plan snapshot for the group."""
    from .ai import generate_group_trip_plan as _generate_plan

    current_user = get_current_user_info(request, db)
    _group, _membership = _get_group_and_membership(group_id, current_user.id, db)

    constraints = {
        "start_date": body.start_date.strip(),
        "end_date": body.end_date.strip(),
        "budget": body.budget,
        "budget_currency": body.budget_currency.strip() if body.budget_currency else "USD",
        "accommodation_preference": (body.accommodation_preference or "").strip() or None,
        "notes": (body.notes or "").strip() or None,
    }

    result = _generate_plan(group_id, constraints, db)
    if not result.get("ok") or not result.get("plan"):
        raise HTTPException(status_code=503, detail=result.get("detail") or "Unable to generate AI trip plan")

    existing = (
        db.query(models.GroupAiTripPlanSnapshot)
        .filter(models.GroupAiTripPlanSnapshot.group_id == group_id)
        .first()
    )
    if not existing:
        existing = models.GroupAiTripPlanSnapshot(
            group_id=group_id,
            generated_by=current_user.id,
        )
        db.add(existing)

    existing.generated_by = current_user.id
    existing.constraints_json = json.dumps(constraints)
    existing.plan_json = json.dumps(result["plan"])
    db.commit()
    db.refresh(existing)

    return {
        "ok": True,
        "message": "AI trip plan generated",
        "constraints": constraints,
        "plan": result["plan"],
        "saved_at": existing.updated_at.isoformat() if existing.updated_at else None,
    }


@app.get("/groups/{group_id}/ai-trip-plan", response_model=dict)
def get_ai_trip_plan(group_id: int, request: Request, db: Session = Depends(get_db)):
    """Fetch the most recent saved AI trip plan snapshot for the group."""
    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)

    existing = (
        db.query(models.GroupAiTripPlanSnapshot)
        .filter(models.GroupAiTripPlanSnapshot.group_id == group_id)
        .first()
    )
    if not existing:
        return {"ok": True, "plan": None, "constraints": None, "saved_at": None}

    try:
        plan = json.loads(existing.plan_json or "{}")
    except Exception:
        plan = {}

    try:
        constraints = json.loads(existing.constraints_json or "{}")
    except Exception:
        constraints = {}

    return {
        "ok": True,
        "plan": plan if isinstance(plan, dict) else {},
        "constraints": constraints if isinstance(constraints, dict) else {},
        "saved_at": existing.updated_at.isoformat() if existing.updated_at else None,
    }


@app.get("/groups/{group_id}/cost-summary", response_model=dict)
def get_group_cost_summary(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get total estimated trip cost and breakdown by member."""
    from .cost_calculator import calculate_trip_total_cost, calculate_cost_per_member
    
    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)  # verifies membership
    
    cost_data = calculate_trip_total_cost(group_id, db)
    members_breakdown = calculate_cost_per_member(group_id, db)

    # Attach payment status for each member
    per_person = cost_data["per_person_cost"]
    payments = (
        db.query(models.GroupTripPayment)
        .filter(
            models.GroupTripPayment.group_id == group_id,
            models.GroupTripPayment.payment_status == "paid",
        )
        .all()
    )
    paid_by_user: dict[int, float] = {}
    for p in payments:
        paid_by_user[p.user_id] = round(paid_by_user.get(p.user_id, 0) + p.amount, 2)

    members_with_payment = []
    for m in members_breakdown:
        uid = m["member_id"]
        amount_paid = paid_by_user.get(uid, 0.0)
        if amount_paid >= per_person:
            status = "paid"
        elif amount_paid > 0:
            status = "partial"
        else:
            status = "unpaid"
        members_with_payment.append({
            **m,
            "amount_paid": amount_paid,
            "payment_status": status,
        })

    return {
        "total_cost": cost_data["total_cost"],
        "currency": cost_data["currency"],
        "per_person_cost": cost_data["per_person_cost"],
        "member_count": cost_data["member_count"],
        "items_with_cost": cost_data["items_with_cost"],
        "items_missing_cost": cost_data["items_missing_cost"],
        "has_missing_costs": cost_data["has_missing_costs"],
        "breakdown": cost_data["items_breakdown"],
        "members_breakdown": members_with_payment,
    }


@app.get("/itinerary/history", response_model=dict)
def list_my_archived_itinerary_history(request: Request, db: Session = Depends(get_db)):
    """List archived itinerary snapshots for all groups the current user belongs to."""
    current_user = get_current_user_info(request, db)

    memberships = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.user_id == current_user.id)
        .all()
    )
    if not memberships:
        return {"items": []}

    group_ids = [membership.group_id for membership in memberships]
    group_by_id = {
        group.id: group
        for group in db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    }

    history_items = (
        db.query(models.TripPlanHistory)
        .filter(models.TripPlanHistory.group_id.in_(group_ids))
        .order_by(models.TripPlanHistory.archived_at.desc())
        .all()
    )

    results = []
    for item in history_items:
        group = group_by_id.get(item.group_id)
        results.append({
            "id": item.id,
            "group_id": item.group_id,
            "group_name": group.name if group else "Trip Group",
            "title": item.title,
            "description": item.description,
            "shared_notes": item.shared_notes,
            "starts_at": item.starts_at.isoformat() if item.starts_at else None,
            "ends_at": item.ends_at.isoformat() if item.ends_at else None,
            "archived_at": item.archived_at.isoformat() if item.archived_at else None,
        })

    return {"items": results}


@app.get("/itinerary/history/{history_id}", response_model=dict)
def get_archived_itinerary_history(history_id: int, request: Request, db: Session = Depends(get_db)):
    """Get one archived itinerary snapshot by id for a member of the owning group."""
    current_user = get_current_user_info(request, db)

    history_item = db.get(models.TripPlanHistory, history_id)
    if not history_item:
        raise HTTPException(status_code=404, detail="Archived itinerary not found")

    membership = (
        db.query(models.GroupMember)
        .filter(
            models.GroupMember.group_id == history_item.group_id,
            models.GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = db.get(models.Group, history_item.group_id)

    parsed_items = []
    try:
        parsed = json.loads(history_item.items_json or "[]")
        if isinstance(parsed, list):
            parsed_items = parsed
    except Exception:
        parsed_items = []

    return {
        "ok": True,
        "history_id": history_item.id,
        "group_id": history_item.group_id,
        "group_name": group.name if group else "Trip Group",
        "group_status": "archived",
        "trip_plan": {
            "id": -history_item.id,
            "group_id": history_item.group_id,
            "title": history_item.title,
            "description": history_item.description,
            "created_at": history_item.archived_at,
            "updated_at": history_item.archived_at,
            "item_count": len(parsed_items),
            "shared_notes": history_item.shared_notes,
            "starts_at": history_item.starts_at,
            "ends_at": history_item.ends_at,
        },
        "items": parsed_items,
        "is_empty": len(parsed_items) == 0,
    }


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


@app.post("/reports", response_model=dict)
def create_report(body: ReportCreateIn, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create a user report (bug, data error, feedback) and alert the dev team."""
    current_user = get_current_user_info(request, db)

    report_type = (body.report_type or "bug").strip()
    description = (body.description or "").strip()
    title = (body.title or "").strip() if body.title else None

    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    report = models.UserReport(
        user_id=current_user.id,
        report_type=report_type,
        title=title,
        description=description,
        status="open",
    )
    db.add(report)
    db.flush()
    db.commit()
    db.refresh(report)

    # Prepare payload for background alert
    payload = {
        "id": report.id,
        "user_id": report.user_id,
        "report_type": report.report_type,
        "title": report.title,
        "description": report.description,
        "status": report.status,
        "created_at": str(report.created_at),
    }

    background_tasks.add_task(_send_report_alert, payload)

    return {"ok": True, "report": payload}


@app.get("/reports", response_model=dict)
def list_reports(request: Request, db: Session = Depends(get_db)):
    """List reports for the current authenticated user."""
    user = get_current_user_info(request, db)
    items = (
        db.query(models.UserReport)
        .filter(models.UserReport.user_id == user.id)
        .order_by(models.UserReport.created_at.desc())
        .all()
    )

    out = []
    for it in items:
        out.append({
            "id": it.id,
            "user_id": it.user_id,
            "report_type": it.report_type,
            "title": it.title,
            "description": it.description,
            "status": it.status,
            "created_at": it.created_at,
        })

    return {"ok": True, "items": out}


def _send_report_alert(payload: dict) -> None:
    """Background helper to notify dev team about a new user report.

    Uses SMTP credentials from env vars if available; otherwise logs to console.
    """
    try:
        dev_recipient = os.getenv("DEV_REPORT_RECIPIENT") or os.getenv("SMTP_EMAIL")
        sender = os.getenv("SMTP_EMAIL")
        sender_password = os.getenv("SMTP_PASSWORD")

        subject = f"[User Report] {payload.get('report_type')} - id:{payload.get('id')}"
        body = f"<p>A new user report was submitted:</p>"
        body += f"<ul>"
        body += f"<li><strong>Report ID:</strong> {payload.get('id')}</li>"
        body += f"<li><strong>User ID:</strong> {payload.get('user_id')}</li>"
        body += f"<li><strong>Type:</strong> {payload.get('report_type')}</li>"
        if payload.get('title'):
            body += f"<li><strong>Title:</strong> {payload.get('title')}</li>"
        body += f"<li><strong>Description:</strong> {payload.get('description')}</li>"
        body += f"<li><strong>Created At:</strong> {payload.get('created_at')}</li>"
        body += f"</ul>"

        if sender and sender_password and dev_recipient:
            try:
                send_email(sender, sender_password, dev_recipient, subject, body)
                print(f"[Report Alert] Email sent to {dev_recipient} for report {payload.get('id')}")
            except Exception as e:
                print(f"[Report Alert] Failed to send email: {e}")


        else:
            print("[Report Alert] SMTP credentials or recipient not configured. Report payload:", payload)
    except Exception as e:
        print(f"[Report Alert] Unexpected error: {e}")


@app.get("/admin/reports", response_model=dict)
def list_admin_reports(
    request: Request,
    db: Session = Depends(get_db),
    status: str | None = None,
    report_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """List all user reports for admins with optional filters."""
    current_user = get_current_user_info(request, db)
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # join user to get reporter email and name (models.User has `name`, not first_name/last_name)
    query = (
        db.query(models.UserReport, models.User.email, models.User.name)
        .outerjoin(models.User, models.User.id == models.UserReport.user_id)
    )

    if status:
        query = query.filter(models.UserReport.status == status)
    if report_type:
        query = query.filter(models.UserReport.report_type == report_type)
    if date_from:
        try:
            query = query.filter(models.UserReport.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    if date_to:
        try:
            query = query.filter(models.UserReport.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")

    rows = query.order_by(models.UserReport.created_at.desc()).all()
    items = []
    for report, email, name in rows:
        reporter_name = name or ""
        items.append({
            "id": report.id,
            "user_id": report.user_id,
            "report_type": report.report_type,
            "title": report.title,
            "description": report.description,
            "status": report.status,
            "admin_notes": report.admin_notes,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
            "reporter_email": email,
            "reporter_name": reporter_name,
        })

    return {"ok": True, "items": items}


@app.patch("/admin/reports/{report_id}/status", response_model=dict)
def update_admin_report_status(
    report_id: int,
    body: AdminReportStatusUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update a report's status (admin only)."""
    current_user = get_current_user_info(request, db)
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    report = db.get(models.UserReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    allowed_statuses = {"open", "in_progress", "resolved"}
    if body.new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid report status")

    report.status = body.new_status
    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)

    return {
        "ok": True,
        "report": {
            "id": report.id,
            "user_id": report.user_id,
            "report_type": report.report_type,
            "title": report.title,
            "description": report.description,
            "status": report.status,
            "admin_notes": report.admin_notes,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        },
    }


@app.post("/admin/reports/{report_id}/notes", response_model=dict)
def add_admin_report_note(
    report_id: int,
    body: AdminReportNoteIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Append an internal note to a report (admin only)."""
    current_user = get_current_user_info(request, db)
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    report = db.get(models.UserReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    note_text = (body.note_text or "").strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="Note text is required")

    author_name = " ".join(part for part in [current_user.first_name, current_user.last_name] if part) or "Admin"
    note_line = f"[{datetime.utcnow().isoformat()}] {author_name}: {note_text}"
    report.admin_notes = f"{report.admin_notes}\n{note_line}".strip() if report.admin_notes else note_line
    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)

    return {
        "ok": True,
        "report": {
            "id": report.id,
            "user_id": report.user_id,
            "report_type": report.report_type,
            "title": report.title,
            "description": report.description,
            "status": report.status,
            "admin_notes": report.admin_notes,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        },
    }


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

    # Sync username change back to users table so it shows everywhere
    if "username" in update_data:
        user.name = update_data["username"]

    profile.updated_at = datetime.now()
    db.commit()
    db.refresh(profile)
    
    return profile


@app.post("/wallet/top-up-demo", response_model=WalletTopUpOut)
def top_up_demo_wallet(body: WalletTopUpIn, request: Request, db: Session = Depends(get_db)):
    """Run a Stripe test payment and credit the user's demo wallet on success."""
    user = get_current_user_info(request, db)

    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    stripe_api_key = os.getenv("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    stripe.api_key = stripe_api_key

    try:
        payment_intent = stripe.PaymentIntent.create(
            amount=int(round(body.amount * 100)),
            currency=body.currency.lower(),
            automatic_payment_methods={
                "enabled": True,
                "allow_redirects": "never",
            },
            confirm=True,
            payment_method="pm_card_visa",
            description=f"Trips2gether demo wallet top-up for user {user.id}",
            metadata={
                "user_id": str(user.id),
                "profile_id": str(profile.id),
                "kind": "wallet_top_up_demo",
            },
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=502, detail=f"Stripe demo payment failed: {message}")

    if payment_intent.status != "succeeded":
        raise HTTPException(status_code=502, detail="Stripe payment did not succeed")

    profile.wallet_balance = round(float(profile.wallet_balance or 0) + body.amount, 2)
    profile.updated_at = datetime.now()
    db.commit()
    db.refresh(profile)

    return WalletTopUpOut(
        payment_intent_id=payment_intent.id,
        amount_added=round(body.amount, 2),
        currency=body.currency,
        wallet_balance=round(float(profile.wallet_balance), 2),
        payment_status=payment_intent.status,
    )


@app.post("/wallet/top-up-checkout-session", response_model=WalletCheckoutSessionOut)
def create_wallet_checkout_session(body: WalletTopUpIn, request: Request, db: Session = Depends(get_db)):
    """Create a Stripe-hosted checkout session for wallet top-up."""
    user = get_current_user_info(request, db)

    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    stripe_api_key = os.getenv("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    stripe.api_key = stripe_api_key
    frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": body.currency.lower(),
                        "product_data": {
                            "name": "Trips2gether Wallet Top-up",
                        },
                        "unit_amount": int(round(body.amount * 100)),
                    },
                    "quantity": 1,
                }
            ],
            success_url=f"{frontend_base_url}/profile?wallet_topup=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_base_url}/profile?wallet_topup=cancel",
            metadata={
                "user_id": str(user.id),
                "profile_id": str(profile.id),
                "kind": "wallet_top_up_checkout",
            },
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {message}")

    return WalletCheckoutSessionOut(
        session_id=session.id,
        checkout_url=session.url,
    )


@app.post("/wallet/top-up-confirm", response_model=WalletTopUpConfirmOut)
def confirm_wallet_top_up(body: WalletTopUpConfirmIn, request: Request, db: Session = Depends(get_db)):
    """Confirm Stripe checkout result and credit wallet only once."""
    user = get_current_user_info(request, db)

    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    stripe_api_key = os.getenv("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    stripe.api_key = stripe_api_key

    try:
        session = stripe.checkout.Session.retrieve(body.session_id)
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=502, detail=f"Stripe confirmation failed: {message}")

    raw_metadata = getattr(session, "metadata", None)
    if hasattr(raw_metadata, "to_dict"):
        metadata = raw_metadata.to_dict()
    elif raw_metadata:
        metadata = dict(raw_metadata)
    else:
        metadata = {}

    if str(metadata.get("user_id", "")) != str(user.id):
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    if session.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Checkout payment not completed")

    existing = db.query(models.WalletTopUp).filter(models.WalletTopUp.stripe_session_id == session.id).first()
    amount_added = round(float((session.amount_total or 0) / 100), 2)
    currency = (session.currency or "usd").upper()

    if existing:
        return WalletTopUpConfirmOut(
            amount_added=existing.amount,
            currency=existing.currency,
            wallet_balance=round(float(profile.wallet_balance or 0), 2),
            payment_status=existing.payment_status,
            already_processed=True,
        )

    wallet_topup = models.WalletTopUp(
        profile_id=profile.id,
        stripe_session_id=session.id,
        amount=amount_added,
        currency=currency,
        payment_status="paid",
    )

    profile.wallet_balance = round(float(profile.wallet_balance or 0) + amount_added, 2)
    profile.updated_at = datetime.now()
    db.add(wallet_topup)
    db.commit()
    db.refresh(profile)

    return WalletTopUpConfirmOut(
        amount_added=amount_added,
        currency=currency,
        wallet_balance=round(float(profile.wallet_balance), 2),
        payment_status="paid",
        already_processed=False,
    )


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


# -------------------------
# Hotel Search Endpoints
# -------------------------

@app.post("/hotels/search", response_model=HotelSearchResponse)
def search_hotels(body: HotelSearchIn):
    """Search for hotel options by destination, dates, guests, and rooms."""
    try:
        places_service = get_places_service()
        result = places_service.search_hotels(
            destination=body.destination,
            check_in=body.check_in.isoformat(),
            check_out=body.check_out.isoformat(),
            guests=body.guests,
            rooms=body.rooms,
            sort_by=body.sort_by,
        )

        if result["status"] == "unavailable":
            raise HTTPException(status_code=503, detail="Service unavailable")

        if result["status"] == "error":
            raise HTTPException(status_code=502, detail=result.get("message", "Hotel search failed"))

        return HotelSearchResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected hotel search error: {str(e)}")


# -------------------------
# Destination Search Endpoints
# -------------------------

@app.get("/destinations/search", response_model=DestinationSearchResponse)
def search_destinations(query: str = "", db: Session = Depends(get_db)):
    """
    Search for travel destinations using Google Places API
    
    Query parameters:
    - query: Search string (e.g., "Paris", "beach destinations", "Tokyo")
    
    Returns:
    - List of matching destinations with details
    - Error message if search fails
    - "No destinations found" if no results
    """
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Search query is required")
    
    try:
        places_service = get_places_service()
        result = places_service.search_destinations(query.strip())
        
        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result.get("message", "Search failed"))
        
        return DestinationSearchResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred while searching for destinations: {str(e)}"
        )


@app.get("/destinations/filter", response_model=DestinationSearchResponse)
def filter_destinations(
    query: str = "",
    min_rating: float = None,
    types: str = None,
    db: Session = Depends(get_db)
):
    """
    Search for destinations and apply filters
    
    Query parameters:
    - query: Search string (optional, if empty returns popular destinations)
    - min_rating: Minimum rating filter (0-5, optional)
    - types: Comma-separated place types to filter by (optional, e.g., "tourist_attraction,restaurant")
    
    Returns:
    - Up to 6 matching destinations with filters applied
    - Error message if search fails
    """
    try:
        places_service = get_places_service()
        
        # If no query provided, get popular destinations
        if not query or not query.strip():
            result = places_service.get_popular_destinations()
        else:
            # Check if query is coordinates (format: "lat,lng")
            query_clean = query.strip()
            try:
                parts = query_clean.split(",")
                if len(parts) == 2:
                    lat = float(parts[0].strip())
                    lng = float(parts[1].strip())
                    # It's coordinates, get nearby destinations
                    result = places_service.get_nearby_destinations(lat, lng)
                else:
                    # Regular text search
                    result = places_service.search_destinations(query_clean)
            except ValueError:
                # Not coordinates, do regular text search
                result = places_service.search_destinations(query_clean)
        
        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result.get("message", "Search failed"))
        
        # Apply filters if provided
        results = result.get("results", [])
        
        # Parse types filter
        types_list = None
        if types:
            types_list = [t.strip() for t in types.split(",") if t.strip()]
        
        # Apply filters
        filtered_results = places_service.apply_filters(
            results,
            min_rating=min_rating,
            place_types=types_list,
            max_results=6
        )
        
        # Determine if filters were applied
        filters_applied = min_rating is not None or types_list
        
        if not filtered_results:
            return DestinationSearchResponse(
                status="success",
                results=[],
                message="No matching destinations found" if filters_applied else "No destinations found"
            )
        
        return DestinationSearchResponse(
            status="success",
            results=filtered_results,
            message=f"Found {len(filtered_results)} destination(s)" if filters_applied else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred while filtering destinations: {str(e)}"
        )


@app.get("/destinations/photo")
def get_destination_photo(
    photo_reference: str,
    width: int = 800,
    height: int = 600,
    db: Session = Depends(get_db)
):
    """
    Get a destination photo URL with custom dimensions
    
    Query parameters:
    - photo_reference: Photo reference from Google Places API (required)
    - width: Desired image width in pixels (default: 800)
    - height: Desired image height in pixels (default: 600)
    
    Returns:
    - photo_url: Full URL to the image with specified dimensions
    """
    if not photo_reference or not photo_reference.strip():
        raise HTTPException(status_code=400, detail="photo_reference is required")
    
    try:
        places_service = get_places_service()
        photo_url = places_service.get_photo_url(
            photo_reference.strip(),
            width=max(100, min(width, 2000)),  # Clamp between 100 and 2000px
            height=max(100, min(height, 2000))  # Clamp between 100 and 2000px
        )
        
        if not photo_url:
            raise HTTPException(status_code=500, detail="Failed to generate photo URL")
        
        return {"photo_url": photo_url}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred: {str(e)}"
        )


@app.get("/destinations/details/{place_id}", response_model=DestinationDetailOut)
def get_destination_detail(place_id: str):
    """Fetch detailed place data for a destination using Google Places Details API."""
    if not place_id or not place_id.strip():
        raise HTTPException(status_code=400, detail="place_id is required")

    try:
        places_service = get_places_service()
        result = places_service.get_destination_details(place_id.strip())

        if result["status"] == "error":
            raise HTTPException(status_code=502, detail=result.get("message", "Failed to fetch destination details"))

        if not result.get("result"):
            raise HTTPException(status_code=404, detail="Destination details not found")

        return DestinationDetailOut(**result["result"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/destinations/image")
def get_destination_image(
    photo_reference: str,
    width: int = 800,
    height: int = 600
):
    """
    Proxy endpoint for Google Places images.
    Fetches image from Google Places and returns it with proper CORS headers.
    This avoids Safari's tracking prevention from blocking third-party images.
    """
    if not photo_reference or not photo_reference.strip():
        raise HTTPException(status_code=400, detail="photo_reference is required")
    
    try:
        places_service = get_places_service()
        photo_url = places_service.get_photo_url(
            photo_reference.strip(),
            width=max(100, min(width, 2000)),
            height=max(100, min(height, 2000))
        )
        
        if not photo_url:
            raise HTTPException(status_code=500, detail="Failed to generate photo URL")
        
        # Fetch the image from Google Places
        import requests as req
        response = req.get(photo_url, timeout=10)
        
        if not response.ok:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch image from Google")
        
        # Return image with proper headers for Safari compatibility
        return Response(
            content=response.content,
            media_type=response.headers.get('content-type', 'image/jpeg'),
            headers={
                "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
                "Access-Control-Allow-Origin": "*",
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


# -------------------------
# Nearby Restaurants Endpoints
# -------------------------

@app.get("/restaurants/nearby", response_model=NearbyRestaurantsResponse)
def get_nearby_restaurants(
    lat: float,
    lng: float,
    radius: int = 1500,
):
    if lat < -90 or lat > 90 or lng < -180 or lng > 180:
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    radius = max(500, min(radius, 50000))
    try:
        places_service = get_places_service()
        result = places_service.search_nearby_restaurants(lat, lng, radius_m=radius)
        if result["status"] == "error":
            raise HTTPException(status_code=502, detail=result.get("message", "Restaurant search failed"))
        return NearbyRestaurantsResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/restaurants/{place_id}", response_model=RestaurantDetailOut)
def get_restaurant_detail(place_id: str):
    if not place_id or not place_id.strip():
        raise HTTPException(status_code=400, detail="place_id is required")
    try:
        places_service = get_places_service()
        result = places_service.get_restaurant_details(place_id.strip())
        if result["status"] == "error":
            raise HTTPException(status_code=502, detail=result.get("message", "Failed to fetch restaurant details"))
        if not result.get("result"):
            raise HTTPException(status_code=404, detail="Restaurant not found")
        return RestaurantDetailOut(**result["result"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# -------------------------
# Face Verification Endpoints
# -------------------------

def calculate_face_distance(encoding1_json: str, encoding2: list) -> float:
    """Calculate Euclidean distance between two face encodings"""
    try:
        encoding1 = json.loads(encoding1_json)
        if not encoding1 or not encoding2 or len(encoding1) != len(encoding2):
            return float('inf')
        
        sum_sq = sum((a - b) ** 2 for a, b in zip(encoding1, encoding2))
        return math.sqrt(sum_sq)
    except Exception:
        return float('inf')


@app.post("/face-verification/check", response_model=FaceVerificationCheckOut)
def check_face_verification(body: FaceVerificationCheckIn, db: Session = Depends(get_db)):
    """Check if a user has face verification enabled (public endpoint for login flow)"""
    user = db.query(models.User).filter(models.User.email == body.email).first()
    
    if not user:
        return FaceVerificationCheckOut(
            face_verification_enabled=False,
            message="User not found or face verification not enabled"
        )
    
    profile = db.query(models.Profile).filter(models.Profile.user_id == user.id).first()
    
    if not profile or not profile.face_verification_enabled:
        return FaceVerificationCheckOut(
            face_verification_enabled=False,
            message="Face verification not enabled"
        )
    
    return FaceVerificationCheckOut(
        face_verification_enabled=True,
        message="Face verification is enabled for this account"
    )


@app.post("/face-verification/verify", response_model=FaceVerificationOut)
def verify_face(body: FaceVerificationIn, request: Request, db: Session = Depends(get_db)):
    """Verify user's face during login (must be done after password verification)"""
    current_user = get_current_user_info(request, db)
    
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    if not profile.face_verification_enabled or not profile.face_encoding:
        raise HTTPException(status_code=400, detail="Face verification not enabled for this user")
    
    # Calculate distance between stored encoding and provided encoding
    distance = calculate_face_distance(profile.face_encoding, body.face_encoding)
    
    # Distance threshold: 0.6 is standard for face-api.js (lower = stricter match)
    # Typical range: 0.3 (very strict) to 0.7 (looser)
    FACE_MATCH_THRESHOLD = 0.5
    
    if distance <= FACE_MATCH_THRESHOLD:
        # Update last verified timestamp
        profile.face_last_verified_at = datetime.utcnow()
        db.commit()
        
        return FaceVerificationOut(
            success=True,
            message="Face verification successful",
            distance=distance
        )
    else:
        return FaceVerificationOut(
            success=False,
            message=f"Face verification failed. Face does not match stored encoding.",
            distance=distance
        )


@app.post("/face-verification/enable", response_model=dict)
def enable_face_verification(body: FaceEncodingIn, request: Request, db: Session = Depends(get_db)):
    """Enable face verification and store face encoding in profile"""
    current_user = get_current_user_info(request, db)
    
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Store face encoding as JSON string
    try:
        profile.face_encoding = json.dumps(body.face_encoding)
        profile.face_verification_enabled = True
        profile.face_last_verified_at = datetime.utcnow()
        db.commit()
        
        return {
            "ok": True,
            "message": "Face verification enabled successfully",
            "face_verification_enabled": True
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enable face verification: {str(e)}"
        )


@app.post("/face-verification/disable", response_model=dict)
def disable_face_verification(request: Request, db: Session = Depends(get_db)):
    """Disable face verification for the user"""
    current_user = get_current_user_info(request, db)
    
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    try:
        profile.face_encoding = None
        profile.face_verification_enabled = False
        profile.face_last_verified_at = None
        db.commit()
        
        return {
            "ok": True,
            "message": "Face verification disabled successfully",
            "face_verification_enabled": False
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to disable face verification: {str(e)}"
        )


# -------------------------
# Flight Booking Endpoints (Duffel Integration)
# -------------------------

@app.post("/bookings/create-order", response_model=BookingCreateOut)
def create_booking(body: BookingCreateIn, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create a flight booking order using Duffel API. Only authenticated users."""
    # Verify user is authenticated
    current_user = get_current_user_info(request, db)
    
    # Get user's profile
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    # Get Duffel API key (secure on backend only)
    duffel_api_key = os.getenv("DUFFEL_API_KEY")
    if not duffel_api_key:
        raise HTTPException(status_code=500, detail="Booking service not configured")
    
    gender_map = {"male": "m", "female": "f", "other": "m"}

    try:
        # Fetch the offer from Duffel to get the correct passenger IDs
        offer_response = requests.get(
            f"https://api.duffel.com/air/offers/{body.offer_id}",
            headers={
                "Accept": "application/json",
                "Duffel-Version": "v2",
                "Authorization": f"Bearer {duffel_api_key}",
            },
            timeout=10
        )
        if not offer_response.ok:
            raise HTTPException(status_code=502, detail="Could not retrieve offer details")

        offer_data = offer_response.json().get("data", {})
        offer_passengers = offer_data.get("passengers", [])
        # Use the offer's actual total to avoid amount mismatch
        offer_total_amount = offer_data.get("total_amount", body.total_amount)
        offer_total_currency = offer_data.get("total_currency", body.currency)
        planned_charge = float(offer_total_amount)

        if len(offer_passengers) != len(body.passengers):
            raise HTTPException(
                status_code=400,
                detail=f"Offer requires {len(offer_passengers)} passenger(s), got {len(body.passengers)}"
            )

        if profile.wallet_balance < planned_charge:
            raise HTTPException(status_code=402, detail="Insufficient wallet balance")

        # Build Duffel order creation payload using offer's passenger IDs
        passengers_payload = []
        for offer_pax, passenger in zip(offer_passengers, body.passengers):
            # Phone is already E.164 (e.g. +14155550123) from the frontend
            raw_phone = passenger.phone_number.strip()
            digits_only = "".join(c for c in raw_phone if c.isdigit())
            e164_phone = "+" + digits_only if not raw_phone.startswith("+") else raw_phone

            passengers_payload.append({
                "id": offer_pax["id"],
                "given_name": passenger.given_name,
                "family_name": passenger.family_name,
                "email": passenger.email,
                "phone_number": e164_phone,
                "born_on": passenger.born_at,
                "gender": gender_map.get(passenger.gender, "m"),
                "title": passenger.title,
            })
        
        # Build payment payload using the offer's confirmed total amount
        payment_payload = [{
            "type": body.payment_type,
            "currency": offer_total_currency,
            "amount": offer_total_amount
        }]
        
        order_payload = {
            "data": {
                "type": "instant",
                "selected_offers": [body.offer_id],
                "passengers": passengers_payload,
                "payments": payment_payload,
                "metadata": {
                    "user_id": str(current_user.id),
                    "booking_timestamp": datetime.utcnow().isoformat()
                }
            }
        }
        
        # Call Duffel API to create order
        print(f"[Duffel] Sending order payload: {json.dumps(order_payload, indent=2)}")
        response = requests.post(
            "https://api.duffel.com/air/orders",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Duffel-Version": "v2",
                "Authorization": f"Bearer {duffel_api_key}",
            },
            json=order_payload,
            timeout=90  # Duffel sandbox order creation can take 20-45s
        )
        
        if not response.ok:
            error_detail = "Failed to create booking"
            try:
                error_body = response.json()
                print(f"[Duffel Error] Status {response.status_code}: {error_body}")
                errors = error_body.get("errors", [])
                if errors:
                    error_detail = errors[0].get("message", error_detail)
            except ValueError:
                print(f"[Duffel Error] Status {response.status_code}: {response.text}")
            raise HTTPException(status_code=502, detail=error_detail)
        
        order_data = response.json().get("data", {})
        order_id = order_data.get("id", "")
        booking_reference = order_data.get("booking_reference")
        total_amount = order_data.get("total_amount", "0")
        total_currency = order_data.get("total_currency", "USD")
        
        # Deduct from user's wallet balance
        charge = float(total_amount)
        profile.wallet_balance = round(profile.wallet_balance - charge, 2)
        
        # Save booking to database after Duffel confirms it
        booking = models.Booking(
            profile_id=profile.id,
            order_id=order_id,
            booking_reference=booking_reference,
            total_amount=total_amount,
            currency=total_currency,
            payment_status="paid",
            offer_id=body.offer_id,
            passengers_json=json.dumps([p.model_dump() for p in body.passengers]),
            slices_json=json.dumps(order_data.get("slices", []))
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        # Create a personal notification for the booking confirmation
        try:
            notif_payload = {
                "order_id": order_id,
                "booking_reference": booking_reference,
            }
            pnotif = models.Notification(
                user_id=current_user.id,
                notification_type="booking.confirmation",
                title=f"Booking confirmed - {booking_reference or order_id}",
                body=f"Your booking {booking_reference or order_id} is confirmed.",
                payload_json=json.dumps(notif_payload),
            )
            db.add(pnotif)
            db.commit()
        except Exception:
            db.rollback()
        try:
            formatted_time = datetime.utcnow().strftime("%B %d, %Y at %I:%M %p UTC")
            booking_pdf = generate_booking_confirmation_pdf(
                booking_reference=booking_reference or "N/A",
                order_id=order_id,
                total_amount=total_amount,
                currency=total_currency,
                payment_status="pending",
                created_at=formatted_time,
                passengers=[p.model_dump() for p in body.passengers],
                slices=order_data.get("slices", []),
                remaining_balance=profile.wallet_balance,
            )
            background_tasks.add_task(
                send_email,
                sender_email=os.getenv("SMTP_EMAIL"),
                sender_password=os.getenv("SMTP_PASSWORD"),
                recipient_email=current_user.email,
                subject=f"Booking Confirmed - {booking_reference}",
                body=get_booking_confirmation_email_template(
                    name=current_user.name,
                    booking_reference=booking_reference or "N/A",
                    order_id=order_id,
                    total_amount=total_amount,
                    currency=total_currency,
                    payment_status="pending",
                    created_at=formatted_time,
                    passengers=[p.model_dump() for p in body.passengers],
                    slices=order_data.get("slices", []),
                    remaining_balance=profile.wallet_balance,
                ),
                attachments=[
                    {
                        "filename": f"booking-{booking_reference or order_id}.pdf",
                        "content": booking_pdf,
                        "mime_type": "application/pdf",
                    }
                ],
            )
        except Exception as email_exc:
            # Booking should remain successful even if email dispatch fails.
            print(f"[Booking Email] Failed to queue confirmation email: {email_exc}")

        return BookingCreateOut(
            status="confirmed",
            order_id=order_id,
            booking_reference=booking_reference,
            total_amount=total_amount,
            total_currency=total_currency,
            payment_required=False,
            remaining_balance=profile.wallet_balance
        )
    
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="Booking service timeout")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail="Unable to reach booking service")
    except ValueError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Invalid booking amount returned by provider")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Booking error: {str(e)}")


@app.get("/bookings/{order_id}/status", response_model=BookingStatusOut)
def get_booking_status(order_id: str, request: Request, db: Session = Depends(get_db)):
    """Retrieve booking status from Duffel API. Only authenticated users."""
    # Verify user is authenticated
    current_user = get_current_user_info(request, db)
    
    # Get Duffel API key
    duffel_api_key = os.getenv("DUFFEL_API_KEY")
    if not duffel_api_key:
        raise HTTPException(status_code=500, detail="Booking service not configured")
    
    try:
        # Fetch order from Duffel
        response = requests.get(
            f"https://api.duffel.com/air/orders/{order_id}",
            headers={
                "Accept": "application/json",
                "Duffel-Version": "v2",
                "Authorization": f"Bearer {duffel_api_key}",
            },
            timeout=10
        )
        
        if not response.ok:
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Booking not found")
            raise HTTPException(status_code=502, detail="Failed to retrieve booking status")
        
        order_data = response.json().get("data", {})
        payment_status_obj = order_data.get("payment_status", {})
        
        return BookingStatusOut(
            order_id=order_data.get("id", ""),
            booking_reference=order_data.get("booking_reference"),
            status=order_data.get("type", "unknown"),
            total_amount=order_data.get("total_amount", "0"),
            total_currency=order_data.get("total_currency", "USD"),
            payment_status=payment_status_obj.get("status") if payment_status_obj else None,
            passengers=order_data.get("passengers", []),
            slices=order_data.get("slices", []),
            created_at=datetime.fromisoformat(order_data.get("created_at", "").replace("Z", "+00:00")) if order_data.get("created_at") else None
        )
    
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="Booking service timeout")
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Unable to reach booking service")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving booking: {str(e)}")


@app.get("/bookings", response_model=BookingListOut)
def get_user_bookings(request: Request, db: Session = Depends(get_db)):
    """Retrieve all bookings for the authenticated user."""
    # Verify user is authenticated
    current_user = get_current_user_info(request, db)
    
    # Get user's profile
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    # Get all bookings for this profile, ordered by most recent first
    bookings = db.query(models.Booking).filter(
        models.Booking.profile_id == profile.id
    ).order_by(models.Booking.created_at.desc()).all()
    
    return BookingListOut(
        bookings=bookings,
        total_count=len(bookings)
    )


@app.post("/bookings/{booking_id}/shortlist-to-group", response_model=dict)
def shortlist_booking_to_group(
    booking_id: int,
    body: BookingShortlistToGroupIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a previously booked flight into a group's flight shortlist."""
    current_user = get_current_user_info(request, db)

    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.profile_id == profile.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    _group, _membership = _get_group_and_membership(body.group_id, current_user.id, db)

    offer_ref = (booking.offer_id or booking.order_id or "").strip()
    if not offer_ref:
        raise HTTPException(status_code=400, detail="Booking does not have a valid offer reference")

    existing = (
        db.query(models.GroupShortlistFlight)
        .filter(
            models.GroupShortlistFlight.group_id == body.group_id,
            models.GroupShortlistFlight.flight_offer_id == offer_ref,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="This booking is already shortlisted for the selected group")

    try:
        slices = json.loads(booking.slices_json or "[]")
        if not isinstance(slices, list):
            slices = []
    except Exception:
        slices = []

    segments: list[dict] = []
    for slice_item in slices:
        slice_segments = slice_item.get("segments") if isinstance(slice_item, dict) else None
        if isinstance(slice_segments, list):
            for segment in slice_segments:
                if isinstance(segment, dict):
                    segments.append(segment)

    first_segment = segments[0] if segments else {}
    last_segment = segments[-1] if segments else {}
    operating = first_segment.get("operating_carrier") if isinstance(first_segment.get("operating_carrier"), dict) else {}
    marketing = first_segment.get("marketing_carrier") if isinstance(first_segment.get("marketing_carrier"), dict) else {}

    airline = (
        operating.get("name")
        or marketing.get("name")
        or "Booked Flight"
    )
    logo_url = (
        operating.get("logo_symbol_url")
        or operating.get("logo_lockup_url")
        or marketing.get("logo_symbol_url")
        or marketing.get("logo_lockup_url")
    )

    departure_airport = (
        (first_segment.get("origin") or {}).get("iata_code")
        if isinstance(first_segment, dict) else None
    ) or "N/A"
    arrival_airport = (
        (last_segment.get("destination") or {}).get("iata_code")
        if isinstance(last_segment, dict) else None
    ) or "N/A"

    departure_dt = None
    arrival_dt = None
    try:
        departing_at = first_segment.get("departing_at") if isinstance(first_segment, dict) else None
        arriving_at = last_segment.get("arriving_at") if isinstance(last_segment, dict) else None
        if departing_at:
            departure_dt = datetime.fromisoformat(str(departing_at).replace("Z", "+00:00"))
        if arriving_at:
            arrival_dt = datetime.fromisoformat(str(arriving_at).replace("Z", "+00:00"))
    except Exception:
        departure_dt = None
        arrival_dt = None

    departure_time = departure_dt.strftime("%H:%M") if departure_dt else None
    arrival_time = arrival_dt.strftime("%H:%M") if arrival_dt else None
    duration = _duration_label(departure_dt, arrival_dt) if departure_dt else "N/A"

    first_passengers = first_segment.get("passengers") if isinstance(first_segment, dict) else None
    if not isinstance(first_passengers, list):
        first_passengers = []
    first_passenger = first_passengers[0] if first_passengers else {}
    cabin_class = first_passenger.get("cabin_class") if isinstance(first_passenger, dict) else None
    baggages = first_passenger.get("baggages") if isinstance(first_passenger, dict) else []
    if not isinstance(baggages, list):
        baggages = []

    shortlist_item = models.GroupShortlistFlight(
        group_id=body.group_id,
        flight_offer_id=offer_ref,
        airline=str(airline),
        logo_url=str(logo_url) if logo_url else None,
        price=float(booking.total_amount or 0),
        currency=booking.currency or "USD",
        duration=duration,
        stops=max(0, len(segments) - 1),
        departure_time=departure_time,
        arrival_time=arrival_time,
        departure_airport=departure_airport,
        arrival_airport=arrival_airport,
        cabin_class=str(cabin_class) if cabin_class else None,
        baggages_json=json.dumps(baggages),
        slices_json=json.dumps(slices),
        emissions_kg=None,
        added_by=current_user.id,
    )

    db.add(shortlist_item)
    db.commit()
    db.refresh(shortlist_item)

    return {
        "ok": True,
        "message": "Booked flight added to group shortlist",
        "item": serialize_shortlist_flight_item(shortlist_item),
    }


# =========================================================================
# Trip Share Payment Endpoints
# =========================================================================

@app.post("/groups/{group_id}/pay-stripe", response_model=TripPaymentCheckoutOut)
def create_trip_payment_stripe(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a Stripe checkout session to pay the user's trip share."""
    from .cost_calculator import calculate_trip_total_cost

    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)

    cost_data = calculate_trip_total_cost(group_id, db)
    per_person = cost_data["per_person_cost"]
    if per_person <= 0:
        raise HTTPException(status_code=400, detail="No cost to pay")

    # Calculate already paid amount
    already_paid = (
        db.query(func.coalesce(func.sum(models.GroupTripPayment.amount), 0))
        .filter(
            models.GroupTripPayment.group_id == group_id,
            models.GroupTripPayment.user_id == current_user.id,
            models.GroupTripPayment.payment_status == "paid",
        )
        .scalar()
    )
    remaining = round(per_person - float(already_paid), 2)
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Your share is already fully paid")

    stripe_api_key = os.getenv("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    stripe.api_key = stripe_api_key
    frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": cost_data["currency"].lower(),
                        "product_data": {
                            "name": f"Trip Share Payment – Group #{group_id}",
                        },
                        "unit_amount": int(round(remaining * 100)),
                    },
                    "quantity": 1,
                }
            ],
            success_url=f"{frontend_base_url}/group/{group_id}?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_base_url}/group/{group_id}?payment=cancel",
            metadata={
                "user_id": str(current_user.id),
                "group_id": str(group_id),
                "kind": "trip_share_payment",
            },
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {message}")

    # Create pending payment record
    payment = models.GroupTripPayment(
        group_id=group_id,
        user_id=current_user.id,
        amount=remaining,
        currency=cost_data["currency"],
        payment_method="stripe",
        stripe_session_id=session.id,
        payment_status="pending",
    )
    db.add(payment)
    db.commit()

    return TripPaymentCheckoutOut(
        session_id=session.id,
        checkout_url=session.url,
        amount=remaining,
        currency=cost_data["currency"],
    )


@app.post("/groups/{group_id}/pay-stripe-confirm", response_model=TripPaymentOut)
def confirm_trip_payment_stripe(
    group_id: int,
    body: TripPaymentConfirmIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Confirm Stripe checkout and mark payment as paid."""
    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)

    stripe_api_key = os.getenv("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    stripe.api_key = stripe_api_key

    try:
        session = stripe.checkout.Session.retrieve(body.session_id)
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=502, detail=f"Stripe confirmation failed: {message}")

    raw_metadata = getattr(session, "metadata", None)
    if hasattr(raw_metadata, "to_dict"):
        metadata = raw_metadata.to_dict()
    elif raw_metadata:
        metadata = dict(raw_metadata)
    else:
        metadata = {}

    if str(metadata.get("user_id", "")) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    if str(metadata.get("group_id", "")) != str(group_id):
        raise HTTPException(status_code=403, detail="Session does not belong to this group")

    payment = (
        db.query(models.GroupTripPayment)
        .filter(models.GroupTripPayment.stripe_session_id == body.session_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    if payment.payment_status == "paid":
        return TripPaymentOut(
            payment_id=payment.id,
            group_id=payment.group_id,
            amount=payment.amount,
            currency=payment.currency,
            payment_method=payment.payment_method,
            payment_status="paid",
        )

    if session.payment_status != "paid":
        payment.payment_status = "failed"
        payment.updated_at = datetime.now()
        db.commit()
        raise HTTPException(status_code=400, detail="Payment was not completed")

    payment.payment_status = "paid"
    payment.updated_at = datetime.now()
    db.commit()

    return TripPaymentOut(
        payment_id=payment.id,
        group_id=payment.group_id,
        amount=payment.amount,
        currency=payment.currency,
        payment_method="stripe",
        payment_status="paid",
    )


@app.post("/groups/{group_id}/pay-wallet", response_model=TripPaymentOut)
def pay_trip_share_with_wallet(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Pay the user's trip share from their wallet balance."""
    from .cost_calculator import calculate_trip_total_cost

    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)

    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    cost_data = calculate_trip_total_cost(group_id, db)
    per_person = cost_data["per_person_cost"]
    if per_person <= 0:
        raise HTTPException(status_code=400, detail="No cost to pay")

    already_paid = (
        db.query(func.coalesce(func.sum(models.GroupTripPayment.amount), 0))
        .filter(
            models.GroupTripPayment.group_id == group_id,
            models.GroupTripPayment.user_id == current_user.id,
            models.GroupTripPayment.payment_status == "paid",
        )
        .scalar()
    )
    remaining = round(per_person - float(already_paid), 2)
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Your share is already fully paid")

    balance = round(float(profile.wallet_balance or 0), 2)
    if balance < remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. Need {cost_data['currency']} {remaining:.2f}, have {cost_data['currency']} {balance:.2f}",
        )

    # Deduct from wallet
    profile.wallet_balance = round(balance - remaining, 2)
    profile.updated_at = datetime.now()

    payment = models.GroupTripPayment(
        group_id=group_id,
        user_id=current_user.id,
        amount=remaining,
        currency=cost_data["currency"],
        payment_method="wallet",
        payment_status="paid",
    )
    db.add(payment)
    db.commit()
    db.refresh(profile)

    return TripPaymentOut(
        payment_id=payment.id,
        group_id=group_id,
        amount=remaining,
        currency=cost_data["currency"],
        payment_method="wallet",
        payment_status="paid",
        wallet_balance=round(float(profile.wallet_balance), 2),
    )


@app.get("/groups/{group_id}/payment-status", response_model=list[TripPaymentStatusOut])
def get_group_payment_status(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get payment status for all members of a group."""
    from .cost_calculator import calculate_trip_total_cost, calculate_cost_per_member

    current_user = get_current_user_info(request, db)
    _get_group_and_membership(group_id, current_user.id, db)

    cost_data = calculate_trip_total_cost(group_id, db)
    members_breakdown = calculate_cost_per_member(group_id, db)
    per_person = cost_data["per_person_cost"]

    payments = (
        db.query(models.GroupTripPayment)
        .filter(
            models.GroupTripPayment.group_id == group_id,
            models.GroupTripPayment.payment_status == "paid",
        )
        .all()
    )
    paid_by_user: dict[int, float] = {}
    for p in payments:
        paid_by_user[p.user_id] = round(paid_by_user.get(p.user_id, 0) + p.amount, 2)

    result = []
    for m in members_breakdown:
        uid = m["member_id"]
        amount_paid = paid_by_user.get(uid, 0.0)
        if amount_paid >= per_person:
            status = "paid"
        elif amount_paid > 0:
            status = "partial"
        else:
            status = "unpaid"
        result.append(TripPaymentStatusOut(
            user_id=uid,
            member_name=m["member_name"],
            amount_due=per_person,
            amount_paid=amount_paid,
            currency=cost_data["currency"],
            payment_status=status,
        ))

    return result