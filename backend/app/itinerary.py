"""Itinerary serialization helpers."""

from __future__ import annotations

import json
from datetime import datetime

from . import models
from .schemas import ItineraryItemOut, ItineraryPlanOut


def _format_location(item: models.ItineraryItem) -> str:
    parts = [part for part in [item.location_name, item.location_address] if part]
    return " · ".join(parts) if parts else "Location not set"


def _format_date(value: datetime) -> str:
    return value.strftime("%a, %b %d, %Y")


def _format_time_range(start_at: datetime, end_at: datetime | None) -> str:
    start_text = start_at.strftime("%I:%M %p").lstrip("0")
    if end_at:
        end_text = end_at.strftime("%I:%M %p").lstrip("0")
        return f"{start_text} - {end_text}"
    return start_text


def serialize_trip_plan(
    plan: models.TripPlan,
    item_count: int,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> ItineraryPlanOut:
    return ItineraryPlanOut(
        id=plan.id,
        group_id=plan.group_id,
        title=plan.title,
        description=plan.description,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        item_count=item_count,
        shared_notes=plan.shared_notes,
        starts_at=starts_at,
        ends_at=ends_at,
    )


def serialize_itinerary_item(item: models.ItineraryItem) -> ItineraryItemOut:
    try:
        details = json.loads(item.details_json or "{}")
        if not isinstance(details, dict):
            details = {}
    except Exception:
        details = {}

    return ItineraryItemOut(
        id=item.id,
        trip_plan_id=item.trip_plan_id,
        item_type=item.item_type,
        title=item.title,
        sort_order=item.sort_order,
        start_at=item.start_at,
        end_at=item.end_at,
        location_name=item.location_name,
        location_address=item.location_address,
        notes=item.notes,
        source_kind=item.source_kind,
        source_reference=item.source_reference,
        details=details,
        created_by=item.created_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
        display_date=_format_date(item.start_at),
        display_time=_format_time_range(item.start_at, item.end_at),
        display_location=_format_location(item),
    )
