"""Shortlist serialization utilities for destinations and flights."""

import json
from . import models
from .schemas import GroupShortlistItemOut, GroupShortlistFlightItemOut, GroupShortlistHotelItemOut


def serialize_shortlist_item(item: models.GroupShortlistDestination) -> GroupShortlistItemOut:
    """Serialize a GroupShortlistDestination model to output schema."""
    try:
        types = json.loads(item.destination_types_json or "[]")
        if not isinstance(types, list):
            types = []
    except Exception:
        types = []

    return GroupShortlistItemOut(
        id=item.id,
        group_id=item.group_id,
        place_id=item.place_id,
        name=item.name,
        address=item.address,
        photo_url=item.photo_url,
        photo_reference=item.photo_reference,
        rating=item.rating,
        types=types,
        added_by=item.added_by,
        created_at=item.created_at,
    )


def serialize_shortlist_flight_item(item: models.GroupShortlistFlight) -> GroupShortlistFlightItemOut:
    """Serialize a GroupShortlistFlight model to output schema."""
    try:
        baggages = json.loads(item.baggages_json or "[]")
        if not isinstance(baggages, list):
            baggages = []
    except Exception:
        baggages = []

    try:
        slices = json.loads(item.slices_json or "[]")
        if not isinstance(slices, list):
            slices = []
    except Exception:
        slices = []

    return GroupShortlistFlightItemOut(
        id=item.id,
        group_id=item.group_id,
        flight_offer_id=item.flight_offer_id,
        airline=item.airline,
        logo_url=item.logo_url,
        price=item.price,
        currency=item.currency,
        duration=item.duration,
        stops=item.stops,
        departure_time=item.departure_time,
        arrival_time=item.arrival_time,
        departure_airport=item.departure_airport,
        arrival_airport=item.arrival_airport,
        cabin_class=item.cabin_class,
        baggages=baggages,
        slices=slices,
        emissions_kg=item.emissions_kg,
        added_by=item.added_by,
        created_at=item.created_at,
    )


def serialize_shortlist_hotel_item(item: models.GroupShortlistHotel) -> GroupShortlistHotelItemOut:
    """Serialize a GroupShortlistHotel model to output schema."""
    try:
        types = json.loads(item.hotel_types_json or "[]")
        if not isinstance(types, list):
            types = []
    except Exception:
        types = []

    try:
        amenities = json.loads(item.amenities_json or "[]")
        if not isinstance(amenities, list):
            amenities = []
    except Exception:
        amenities = []

    return GroupShortlistHotelItemOut(
        id=item.id,
        group_id=item.group_id,
        place_id=item.place_id,
        name=item.name,
        address=item.address,
        photo_url=item.photo_url,
        photo_reference=item.photo_reference,
        rating=item.rating,
        price_level=item.price_level,
        currency=item.currency,
        price_per_night=item.price_per_night,
        total_price=item.total_price,
        nights=item.nights,
        types=types,
        amenities=amenities,
        booking_url=item.booking_url,
        added_by=item.added_by,
        created_at=item.created_at,
    )
