"""
Cost calculation utilities for trip planning.
Aggregates costs from shortlists and itinerary items.
"""

from sqlalchemy.orm import Session
from . import models
import json


def calculate_trip_total_cost(group_id: int, db: Session) -> dict:
    """
    Calculate total trip cost by aggregating:
    - Shortlisted flights (price)
    - Shortlisted hotels (total_price or price_per_night × nights)
    - Shortlisted destinations (estimated_cost)
    - Itinerary items (estimated_cost)
    
    Returns:
        dict with keys: total_cost, currency, items_breakdown, missing_items
    """
    total_cost = 0.0
    currency = "USD"  # Default currency
    items_breakdown = []
    items_with_cost = 0
    items_missing_cost = 0
    
    # Get group to check member count
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        return {
            "total_cost": 0.0,
            "currency": currency,
            "items_breakdown": [],
            "items_with_cost": 0,
            "items_missing_cost": 0,
            "per_person_cost": 0.0,
            "member_count": 0,
        }
    
    member_count = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id)
        .count()
    )
    if member_count == 0:
        member_count = 1  # Avoid division by zero
    
    # 1. Shortlisted Flights
    flights = (
        db.query(models.GroupShortlistFlight)
        .filter(models.GroupShortlistFlight.group_id == group_id)
        .all()
    )
    for flight in flights:
        if flight.price is not None and flight.price > 0:
            total_cost += flight.price
            currency = flight.currency or "USD"
            items_breakdown.append({
                "item_id": flight.id,
                "item_type": "flight",
                "title": f"{flight.departure_airport} → {flight.arrival_airport}",
                "estimated_cost": flight.price,
                "currency": flight.currency or "USD",
                "is_missing": False,
            })
            items_with_cost += 1
        else:
            items_breakdown.append({
                "item_id": flight.id,
                "item_type": "flight",
                "title": f"{flight.departure_airport} → {flight.arrival_airport}",
                "estimated_cost": None,
                "currency": flight.currency or "USD",
                "is_missing": True,
            })
            items_missing_cost += 1
    
    # 2. Shortlisted Hotels
    hotels = (
        db.query(models.GroupShortlistHotel)
        .filter(models.GroupShortlistHotel.group_id == group_id)
        .all()
    )
    for hotel in hotels:
        hotel_cost = hotel.total_price
        if hotel_cost is None and hotel.price_per_night and hotel.nights:
            hotel_cost = hotel.price_per_night * hotel.nights
        
        if hotel_cost is not None and hotel_cost > 0:
            total_cost += hotel_cost
            currency = hotel.currency or "USD"
            items_breakdown.append({
                "item_id": hotel.id,
                "item_type": "hotel",
                "title": hotel.name,
                "estimated_cost": hotel_cost,
                "currency": hotel.currency or "USD",
                "is_missing": False,
            })
            items_with_cost += 1
        else:
            items_breakdown.append({
                "item_id": hotel.id,
                "item_type": "hotel",
                "title": hotel.name,
                "estimated_cost": None,
                "currency": hotel.currency or "USD",
                "is_missing": True,
            })
            items_missing_cost += 1
    
    # 3. Shortlisted Destinations (restaurants, activities)
    destinations = (
        db.query(models.GroupShortlistDestination)
        .filter(models.GroupShortlistDestination.group_id == group_id)
        .all()
    )
    for destination in destinations:
        if destination.estimated_cost is not None and destination.estimated_cost > 0:
            total_cost += destination.estimated_cost
            currency = destination.currency or "USD"
            items_breakdown.append({
                "item_id": destination.id,
                "item_type": "destination",
                "title": destination.name,
                "estimated_cost": destination.estimated_cost,
                "currency": destination.currency or "USD",
                "is_missing": False,
            })
            items_with_cost += 1
        else:
            items_breakdown.append({
                "item_id": destination.id,
                "item_type": "destination",
                "title": destination.name,
                "estimated_cost": None,
                "currency": destination.currency or "USD",
                "is_missing": True,
            })
            items_missing_cost += 1
    
    # 4. Itinerary Items
    if group.trip_plan:
        itinerary_items = (
            db.query(models.ItineraryItem)
            .filter(models.ItineraryItem.trip_plan_id == group.trip_plan.id)
            .all()
        )
        for item in itinerary_items:
            if item.estimated_cost is not None and item.estimated_cost > 0:
                total_cost += item.estimated_cost
                currency = item.currency or "USD"
                items_breakdown.append({
                    "item_id": item.id,
                    "item_type": f"itinerary_{item.item_type}",
                    "title": item.title,
                    "estimated_cost": item.estimated_cost,
                    "currency": item.currency or "USD",
                    "is_missing": False,
                })
                items_with_cost += 1
            else:
                items_breakdown.append({
                    "item_id": item.id,
                    "item_type": f"itinerary_{item.item_type}",
                    "title": item.title,
                    "estimated_cost": None,
                    "currency": item.currency or "USD",
                    "is_missing": True,
                })
                items_missing_cost += 1
    
    per_person_cost = total_cost / member_count if member_count > 0 else 0
    
    return {
        "total_cost": round(total_cost, 2),
        "currency": currency,
        "items_breakdown": items_breakdown,
        "items_with_cost": items_with_cost,
        "items_missing_cost": items_missing_cost,
        "per_person_cost": round(per_person_cost, 2),
        "member_count": member_count,
        "has_missing_costs": items_missing_cost > 0,
    }


def calculate_cost_per_member(group_id: int, db: Session) -> list[dict]:
    """
    Calculate cost breakdown per group member.
    Each member pays equal share: total_cost / member_count
    
    Returns:
        list of dicts with member_id, member_name, member_email, individual_share
    """
    cost_data = calculate_trip_total_cost(group_id, db)
    per_person = cost_data["per_person_cost"]
    
    members = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id)
        .all()
    )
    
    members_breakdown = []
    for member in members:
        members_breakdown.append({
            "member_id": member.user_id,
            "member_name": member.user.name,
            "member_email": member.user.email,
            "individual_share": round(per_person, 2),
        })
    
    return members_breakdown
