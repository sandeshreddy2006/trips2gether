import os
import json
import re
from datetime import datetime
from sqlalchemy.orm import Session
import anthropic
from typing import Any

from . import models

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5-20250929")
CLAUDE_MODEL_FALLBACKS = [
    "claude-sonnet-4-5-20250929",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
]
TRIP_SCORE_LENIENCY_BONUS = max(0, min(15, int(os.getenv("TRIP_SCORE_LENIENCY_BONUS", "6"))))


def _label_for_score(score: int) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 50:
        return "Needs Work"
    if score >= 30:
        return "At Risk"
    return "Unlikely"


def _extract_json_object(raw_text: str) -> dict:
    """Extract and parse a JSON object from Claude text output.

    Handles common wrapper formats such as markdown fences or leading prose.
    Raises ValueError if no valid JSON object can be parsed.
    """
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("Empty Claude response")

    # Fast path: already valid JSON.
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    # Remove markdown code fences if present.
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=re.IGNORECASE)
    if fenced:
        fenced_text = fenced.group(1).strip()
        try:
            parsed = json.loads(fenced_text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    # Fallback: parse the first probable JSON object region.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1].strip()
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    raise ValueError("Could not parse JSON object from Claude response")


def _collect_group_context(group_id: int, db: Session) -> dict:
    """Collect all relevant trip-planning data for a group to feed into the AI prompt."""
    group = db.get(models.Group, group_id)
    if not group:
        return {}

    members = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id)
        .all()
    )
    member_count = len(members)

    member_profiles = []
    for member in members:
        profile = (
            db.query(models.Profile)
            .filter(models.Profile.user_id == member.user_id)
            .first()
        )
        if profile:
            member_profiles.append({
                "username": profile.username,
                "budget_min": profile.budget_min,
                "budget_max": profile.budget_max,
                "travel_mode": profile.travel_mode,
                "travel_pace": profile.travel_pace,
                "hotel_type": profile.hotel_type,
                "room_sharing": profile.room_sharing,
                "cuisine_preference": profile.cuisine_preference,
                "dietary_restrictions": profile.dietary_restrictions,
                "preferred_destination": profile.preferred_destination,
            })

    polls = (
        db.query(models.GroupPoll)
        .filter(models.GroupPoll.group_id == group_id)
        .all()
    )
    poll_data = []
    unresolved_polls = []
    for poll in polls:
        options = (
            db.query(models.GroupPollOption)
            .filter(models.GroupPollOption.poll_id == poll.id)
            .all()
        )
        votes = (
            db.query(models.GroupPollVote)
            .filter(models.GroupPollVote.poll_id == poll.id)
            .all()
        )
        vote_counts: dict[int, int] = {}
        for vote in votes:
            vote_counts[vote.option_id] = vote_counts.get(vote.option_id, 0) + 1

        winner_label = None
        if poll.winner_option_id:
            winner_option = db.get(models.GroupPollOption, poll.winner_option_id)
            winner_label = winner_option.label if winner_option else None

        poll_summary = {
            "question": poll.question,
            "decision_type": poll.decision_type,
            "status": poll.status,
            "winner": winner_label,
            "total_votes": len(votes),
            "member_count": member_count,
            "options": [
                {"label": opt.label, "votes": vote_counts.get(opt.id, 0)}
                for opt in options
            ],
        }
        poll_data.append(poll_summary)

        if poll.status == "active":
            unresolved_polls.append(poll.question)
        elif poll.status == "closed" and not poll.winner_option_id:
            unresolved_polls.append(f"No clear winner: {poll.question}")

    destinations = (
        db.query(models.GroupShortlistDestination)
        .filter(models.GroupShortlistDestination.group_id == group_id)
        .all()
    )
    flights = (
        db.query(models.GroupShortlistFlight)
        .filter(models.GroupShortlistFlight.group_id == group_id)
        .all()
    )
    hotels = (
        db.query(models.GroupShortlistHotel)
        .filter(models.GroupShortlistHotel.group_id == group_id)
        .all()
    )

    return {
        "group_name": group.name,
        "group_status": group.status,
        "member_count": member_count,
        "member_profiles": member_profiles,
        "polls": poll_data,
        "unresolved_polls": unresolved_polls,
        "shortlisted_destinations": [
            {
                "name": d.name,
                "rating": d.rating,
                "types": json.loads(d.destination_types_json or "[]"),
            }
            for d in destinations
        ],
        "shortlisted_flights": [
            {
                "airline": f.airline,
                "price": f.price,
                "currency": f.currency,
                "stops": f.stops,
                "duration": f.duration,
            }
            for f in flights
        ],
        "shortlisted_hotels": [
            {
                "name": h.name,
                "rating": h.rating,
                "price_per_night": h.price_per_night,
                "currency": h.currency,
            }
            for h in hotels
        ],
    }


def _build_prompt(context: dict) -> str:
    ctx_json = json.dumps(context, indent=2, default=str)
    return f"""You are an AI travel planning expert for trip2gether. Analyse the following group trip data and estimate the probability of this trip being successful.

Group data:
{ctx_json}

Consider:
1. Group size and coordination complexity
2. Member preference alignment (budget ranges, travel styles, dietary needs)
3. Poll outcomes and unresolved decisions
4. Shortlisted options diversity and conflicts
5. Overall planning progress

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{{
  "score": <integer 0-100>,
  "label": <one of "Excellent" | "Good" | "Needs Work" | "At Risk" | "Unlikely">,
  "reasons": [<2-4 concise strings explaining positive factors>],
  "conflicts": [<0-3 concise strings identifying issues or conflicts, empty list if none>]
}}

Score guidelines:
- 85-100: Excellent — highly aligned group, clear decisions, realistic plan
- 70-84: Good — mostly aligned with minor issues
- 50-69: Needs Work — notable conflicts or gaps in planning
- 30-49: At Risk — significant disagreements or missing critical decisions
- 0-29: Unlikely — major conflicts, no progress, incompatible preferences

Calibration (important):
- Be moderately optimistic by default; avoid overly harsh scoring for early-stage plans.
- Lack of full profile data alone should not force very low scores.
- Reserve scores below 40 for clear, severe conflicts (hard budget clashes, contradictory decisions, or complete planning deadlock)."""


def get_trip_success_score(group_id: int, db: Session) -> dict:
    """
    Collect group context and call Claude to estimate trip success.
    Always returns a safe dict — fallback=True if anything goes wrong.
    """
    fallback = {
        "score": None,
        "label": "Unavailable",
        "reasons": [],
        "conflicts": [],
        "evaluated_at": datetime.utcnow().isoformat(),
        "fallback": True,
    }

    try:
        context = _collect_group_context(group_id, db)
        if not context:
            return fallback

        api_key = os.getenv("CLAUDE_API_KEY")
        if not api_key:
            print("[AI] CLAUDE_API_KEY not configured — returning fallback")
            return fallback

        prompt = _build_prompt(context)
        client = anthropic.Anthropic(api_key=api_key, timeout=30.0)

        requested_model = (CLAUDE_MODEL or "").strip()
        candidate_models = []
        if requested_model:
            candidate_models.append(requested_model)
        for model_name in CLAUDE_MODEL_FALLBACKS:
            if model_name not in candidate_models:
                candidate_models.append(model_name)

        response = None
        last_error = None

        for model_name in candidate_models:
            try:
                response = client.messages.create(
                    model=model_name,
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}],
                )
                if model_name != requested_model:
                    print(f"[AI] Claude model fallback succeeded with: {model_name}")
                break
            except anthropic.NotFoundError as e:
                last_error = e
                print(f"[AI] Claude model not found: {model_name}")
                continue
            except Exception as e:
                last_error = e
                print(f"[AI] Claude API call failed for model {model_name}: {e}")
                continue

        if response is None:
            print(f"[AI] All Claude models failed. Last error: {last_error}")
            return fallback

        text_chunks = []
        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                text_chunks.append(block.text)
        text = "\n".join(text_chunks).strip()
        if not text:
            print("[AI] Claude returned empty content")
            return fallback

        try:
            result = _extract_json_object(text)
        except ValueError as e:
            print(f"[AI] Claude JSON parse error: {e}. Raw text preview: {text[:300]}")
            return fallback

        score = int(result.get("score", 0))
        score = max(0, min(100, score))

        # Apply a small, configurable leniency bonus to avoid overly pessimistic outputs.
        score = min(100, score + TRIP_SCORE_LENIENCY_BONUS)
        label = _label_for_score(score)

        reasons = result.get("reasons", [])
        if not isinstance(reasons, list):
            reasons = []

        conflicts = result.get("conflicts", [])
        if not isinstance(conflicts, list):
            conflicts = []

        return {
            "score": score,
            "label": label,
            "reasons": [str(r) for r in reasons[:5]],
            "conflicts": [str(c) for c in conflicts[:5]],
            "evaluated_at": datetime.utcnow().isoformat(),
            "fallback": False,
        }

    except Exception as e:
        print(f"[AI] get_trip_success_score error for group {group_id}: {e}")
        return fallback


def estimate_item_cost(
    item_type: str,
    item_name: str,
    item_location: str = "unknown",
    item_duration: int = 1,
    currency: str = "USD",
) -> float | None:
    """
    Use Claude AI to estimate cost for a trip item.
    
    Args:
        item_type: "flight", "hotel", "restaurant", "activity", "transfer", etc.
        item_name: Name of the item
        item_location: Location/destination
        item_duration: Duration in hours/days depending on type
        currency: Currency code (e.g., "USD", "EUR")
    
    Returns:
        Estimated cost as float, or None if estimation fails
    """
    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        return None
    
    prompt = f"""Estimate the cost of this trip item in {currency}. Return ONLY a number (integer or decimal), no text.

Item Type: {item_type}
Item: {item_name}
Location: {item_location}
Duration: {item_duration}

Return format: just the number, e.g., "150" or "89.99"
If you cannot estimate, return "0"."""
    
    try:
        requested_model = (CLAUDE_MODEL or "").strip()
        candidate_models = []
        if requested_model:
            candidate_models.append(requested_model)
        for model_name in CLAUDE_MODEL_FALLBACKS:
            if model_name not in candidate_models:
                candidate_models.append(model_name)
        
        client = anthropic.Anthropic(api_key=api_key, timeout=15.0)
        
        for model_name in candidate_models:
            try:
                response = client.messages.create(
                    model=model_name,
                    max_tokens=50,
                    messages=[{"role": "user", "content": prompt}],
                )
                
                if response.content and len(response.content) > 0:
                    text = response.content[0].text.strip()
                    try:
                        cost = float(text)
                        if cost < 0:
                            return None
                        return cost if cost > 0 else None
                    except ValueError:
                        return None
                
            except anthropic.NotFoundError:
                continue
            except Exception as e:
                print(f"[AI] Cost estimation error with {model_name}: {e}")
                continue
        
        return None
    
    except Exception as e:
        print(f"[AI] estimate_item_cost error: {e}")
        return None


def _normalize_suggestion_items(values: list[str], existing: set[str], limit: int) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set(existing)

    for value in values:
        item = " ".join(str(value).strip().split())
        key = item.casefold()
        if not item or key in seen:
            continue
        normalized.append(item)
        seen.add(key)
        if len(normalized) >= limit:
            break

    return normalized


def get_poll_option_suggestions(
    group_id: int,
    decision_type: str,
    question: str,
    existing_options: list[str],
    db: Session,
    max_suggestions: int = 6,
) -> dict:
    """Return AI-generated poll option suggestions based on group context."""
    existing_clean = [" ".join((option or "").strip().split()) for option in (existing_options or [])]
    existing_clean = [option for option in existing_clean if option]
    existing_set = {option.casefold() for option in existing_clean}

    fallback = {
        "suggestions": [],
        "fallback": True,
        "reason": "Suggestions unavailable",
    }

    context = _collect_group_context(group_id, db)
    if not context:
        fallback["reason"] = "Group context unavailable"
        return fallback

    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        fallback["reason"] = "CLAUDE_API_KEY not configured"
        return fallback

    shortlist_destinations = [item.get("name") for item in context.get("shortlisted_destinations", []) if item.get("name")]
    shortlist_hotels = [item.get("name") for item in context.get("shortlisted_hotels", []) if item.get("name")]
    shortlist_flights = [item.get("airline") for item in context.get("shortlisted_flights", []) if item.get("airline")]

    member_preferences: list[str] = []
    for profile in context.get("member_profiles", []):
        hints: list[str] = []
        if profile.get("preferred_destination"):
            hints.append(f"destination={profile.get('preferred_destination')}")
        if profile.get("travel_mode"):
            hints.append(f"style={profile.get('travel_mode')}")
        if profile.get("budget_min") is not None or profile.get("budget_max") is not None:
            hints.append(f"budget={profile.get('budget_min')}-{profile.get('budget_max')}")
        if hints:
            member_preferences.append(", ".join(hints))

    prompt_payload = {
        "group_name": context.get("group_name"),
        "decision_type": decision_type,
        "question": question,
        "existing_options": existing_clean,
        "shortlisted_destinations": shortlist_destinations[:15],
        "shortlisted_hotels": shortlist_hotels[:15],
        "shortlisted_flights": shortlist_flights[:15],
        "member_preference_hints": member_preferences[:12],
    }

    prompt = f"""You are helping a travel group create poll options.
Generate concise, realistic poll options aligned to the provided context.

Context JSON:
{json.dumps(prompt_payload, indent=2, default=str)}

Rules:
1. Return ONLY valid JSON.
2. JSON shape: {{"suggestions": ["Option 1", "Option 2", ...]}}
3. Return 4 to 8 suggestions.
4. Do not repeat any existing option.
5. Keep each suggestion short and user-friendly.
6. For date polls, use ISO-like readable format such as "2026-06-14".
"""

    try:
        requested_model = (CLAUDE_MODEL or "").strip()
        candidate_models = []
        if requested_model:
            candidate_models.append(requested_model)
        for model_name in CLAUDE_MODEL_FALLBACKS:
            if model_name not in candidate_models:
                candidate_models.append(model_name)

        client = anthropic.Anthropic(api_key=api_key, timeout=20.0)
        response = None

        for model_name in candidate_models:
            try:
                response = client.messages.create(
                    model=model_name,
                    max_tokens=400,
                    messages=[{"role": "user", "content": prompt}],
                )
                break
            except anthropic.NotFoundError:
                continue
            except Exception as e:
                print(f"[AI] Poll suggestions call failed for model {model_name}: {e}")
                continue

        if response is None:
            return fallback

        text_chunks = []
        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                text_chunks.append(block.text)
        text = "\n".join(text_chunks).strip()
        if not text:
            return fallback

        suggestions: list[str] = []
        try:
            parsed = _extract_json_object(text)
            raw_items = parsed.get("suggestions", []) if isinstance(parsed, dict) else []
            if isinstance(raw_items, list):
                suggestions = [str(item) for item in raw_items]
        except Exception:
            # Best-effort fallback for plain-text bullets.
            lines = [line.strip("- *\t ") for line in text.splitlines()]
            suggestions = [line for line in lines if line]

        final_suggestions = _normalize_suggestion_items(suggestions, existing_set, max_suggestions)
        return {
            "suggestions": final_suggestions,
            "fallback": False,
            "reason": None,
        }
    except Exception as e:
        print(f"[AI] get_poll_option_suggestions error for group {group_id}: {e}")
        return fallback


def _collect_group_trip_planning_input(group_id: int, constraints: dict[str, Any], db: Session) -> dict[str, Any]:
    group = db.get(models.Group, group_id)
    if not group:
        return {}

    members = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id)
        .all()
    )

    member_profiles: list[dict[str, Any]] = []
    for member in members:
        profile = (
            db.query(models.Profile)
            .filter(models.Profile.user_id == member.user_id)
            .first()
        )
        user = db.get(models.User, member.user_id)
        member_profiles.append({
            "name": user.name if user else f"Member {member.user_id}",
            "budget_min": profile.budget_min if profile else None,
            "budget_max": profile.budget_max if profile else None,
            "travel_mode": profile.travel_mode if profile else None,
            "travel_pace": profile.travel_pace if profile else None,
            "hotel_type": profile.hotel_type if profile else None,
            "room_sharing": profile.room_sharing if profile else None,
            "cuisine_preference": profile.cuisine_preference if profile else None,
            "dietary_restrictions": profile.dietary_restrictions if profile else None,
            "preferred_destination": profile.preferred_destination if profile else None,
            "location": user.location if user else None,
        })

    shortlisted_destinations = (
        db.query(models.GroupShortlistDestination)
        .filter(models.GroupShortlistDestination.group_id == group_id)
        .all()
    )
    shortlisted_flights = (
        db.query(models.GroupShortlistFlight)
        .filter(models.GroupShortlistFlight.group_id == group_id)
        .all()
    )
    shortlisted_hotels = (
        db.query(models.GroupShortlistHotel)
        .filter(models.GroupShortlistHotel.group_id == group_id)
        .all()
    )

    return {
        "group": {
            "id": group.id,
            "name": group.name,
            "status": group.status,
            "description": group.description,
            "member_count": len(members),
        },
        "constraints": constraints,
        "member_preferences": member_profiles,
        "shortlists": {
            "destinations": [
                {
                    "name": item.name,
                    "address": item.address,
                "reasoning_summary": {"budget_fit":"", "interest_fit":"", "availability_travel_time_fit":""},
                    "rating": item.rating,
                    "estimated_cost": item.estimated_cost,
                    "currency": item.currency,
                    "types": json.loads(item.destination_types_json or "[]"),
                }
                for item in shortlisted_destinations
            ],
            "flights": [
                {
                    "airline": item.airline,
                    "price": item.price,
                    "currency": item.currency,
                    "duration": item.duration,
                    "stops": item.stops,
                    "departure_airport": item.departure_airport,
                    "arrival_airport": item.arrival_airport,
                    "departure_time": item.departure_time,
                    "arrival_time": item.arrival_time,
                }
                for item in shortlisted_flights
            ],
            "hotels": [
                {
                    "name": item.name,
                    "address": item.address,
                    "rating": item.rating,
                    "price_per_night": item.price_per_night,
                    "total_price": item.total_price,
                    "nights": item.nights,
                    "currency": item.currency,
                }
                for item in shortlisted_hotels
            ],
        },
    }


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_reasoning_summary(
    raw: dict[str, Any],
    constraints: dict[str, Any],
    planning_input: dict[str, Any],
    default_currency: str,
) -> dict[str, Any]:
    """Ensure every recommendation has budget, interest, and availability/travel-time reasoning."""
    raw_reasoning = raw.get("reasoning_summary") if isinstance(raw.get("reasoning_summary"), dict) else {}

    budget = _to_float(constraints.get("budget"))
    member_count = int((planning_input.get("group") or {}).get("member_count") or 1)
    per_person_budget = (budget / member_count) if budget and member_count > 0 else None

    item_cost = _to_float(raw.get("estimated_cost"))
    currency = str(raw.get("currency") or default_currency).strip() or "USD"

    ai_budget_fit = str(raw_reasoning.get("budget_fit") or "").strip()
    if ai_budget_fit:
        budget_fit = ai_budget_fit
        budget_fallback_used = False
    elif item_cost is not None and per_person_budget is not None:
        if item_cost <= per_person_budget:
            budget_fit = (
                f"Estimated at {currency} {item_cost:.2f}, which fits within the per-person budget target of "
                f"{currency} {per_person_budget:.2f}."
            )
        else:
            budget_fit = (
                f"Estimated at {currency} {item_cost:.2f}; this may exceed the per-person budget target of "
                f"{currency} {per_person_budget:.2f}, so trade-offs may be needed."
            )
        budget_fallback_used = True
    elif budget is not None:
        budget_fit = f"Evaluated against the current group budget of {currency} {budget:.2f}."
        budget_fallback_used = True
    else:
        budget_fit = "Budget-fit reasoning is temporarily unavailable; generated from latest group constraints."
        budget_fallback_used = True

    member_preferences = planning_input.get("member_preferences") or []
    preference_tokens: list[str] = []
    for pref in member_preferences[:4]:
        if not isinstance(pref, dict):
            continue
        for key in ["travel_mode", "travel_pace", "hotel_type", "cuisine_preference", "preferred_destination"]:
            value = pref.get(key)
            if value:
                preference_tokens.append(str(value))
        if len(preference_tokens) >= 3:
            break

    ai_interest_fit = str(raw_reasoning.get("interest_fit") or "").strip()
    if ai_interest_fit:
        interest_fit = ai_interest_fit
        interest_fallback_used = False
    elif preference_tokens:
        interest_fit = f"Aligned with shared preferences such as {', '.join(preference_tokens[:3])}."
        interest_fallback_used = True
    else:
        interest_fit = "Interest-fit reasoning is temporarily unavailable; generated from latest member preference data."
        interest_fallback_used = True

    ai_availability_fit = str(raw_reasoning.get("availability_travel_time_fit") or "").strip()
    if ai_availability_fit:
        availability_fit = ai_availability_fit
        availability_fallback_used = False
    else:
        start_date = str(constraints.get("start_date") or "").strip()
        end_date = str(constraints.get("end_date") or "").strip()
        metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
        duration = str(metadata.get("duration") or raw.get("duration") or "").strip()
        stops = metadata.get("stops") if metadata.get("stops") is not None else raw.get("stops")

        pieces: list[str] = []
        if start_date and end_date:
            pieces.append(f"Fits the selected date window ({start_date} to {end_date})")
        elif start_date:
            pieces.append(f"Fits the selected start date ({start_date})")
        if duration:
            pieces.append(f"with travel duration around {duration}")
        if stops is not None:
            pieces.append(f"and approximately {stops} stop(s)")

        if pieces:
            availability_fit = " ".join(pieces) + "."
        else:
            availability_fit = "Availability/travel-time reasoning is temporarily unavailable; generated from latest schedule constraints."
        availability_fallback_used = True

    return {
        "budget_fit": budget_fit,
        "interest_fit": interest_fit,
        "availability_travel_time_fit": availability_fit,
        "fallback_used": budget_fallback_used or interest_fallback_used or availability_fallback_used,
    }


def _normalize_plan_item(
    raw: dict[str, Any],
    fallback_title: str,
    default_currency: str,
    constraints: dict[str, Any],
    planning_input: dict[str, Any],
) -> dict[str, Any]:
    return {
        "title": str(raw.get("title") or fallback_title).strip(),
        "summary": str(raw.get("summary") or "").strip(),
        "reason": str(raw.get("reason") or "Aligned with stated group preferences.").strip(),
        "estimated_cost": raw.get("estimated_cost"),
        "currency": str(raw.get("currency") or default_currency).strip(),
        "metadata": raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {},
        "reasoning_summary": _build_reasoning_summary(raw, constraints, planning_input, default_currency),
    }


def generate_group_trip_plan(group_id: int, constraints: dict[str, Any], db: Session) -> dict[str, Any]:
    fallback = {
        "ok": False,
        "detail": "AI trip plan generation unavailable",
        "plan": None,
        "constraints": constraints,
    }

    planning_input = _collect_group_trip_planning_input(group_id, constraints, db)
    if not planning_input:
        fallback["detail"] = "Group not found"
        return fallback

    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        fallback["detail"] = "CLAUDE_API_KEY is not configured"
        return fallback

    payload_json = json.dumps(planning_input, indent=2, default=str)
    prompt = f"""You are an expert group-trip planner.
Given this planning input JSON, generate one complete group trip recommendation.

Planning input:
{payload_json}

Return ONLY valid JSON with this exact shape:
{{
  "destination": {{
    "title": "City / Region",
    "summary": "Short practical overview",
    "reason": "Why this destination fits the group",
    "estimated_cost": 1200,
    "currency": "USD",
    "metadata": {{}}
  }},
  "flights": [{{"title":"", "summary":"", "reason":"", "reasoning_summary":{{"budget_fit":"", "interest_fit":"", "availability_travel_time_fit":""}}, "estimated_cost":0, "currency":"USD", "metadata":{{}}}}],
  "hotels": [{{"title":"", "summary":"", "reason":"", "reasoning_summary":{{"budget_fit":"", "interest_fit":"", "availability_travel_time_fit":""}}, "estimated_cost":0, "currency":"USD", "metadata":{{}}}}],
  "restaurants": [{{"title":"", "summary":"", "reason":"", "reasoning_summary":{{"budget_fit":"", "interest_fit":"", "availability_travel_time_fit":""}}, "estimated_cost":0, "currency":"USD", "metadata":{{}}}}],
  "activities": [{{"title":"", "summary":"", "reason":"", "reasoning_summary":{{"budget_fit":"", "interest_fit":"", "availability_travel_time_fit":""}}, "estimated_cost":0, "currency":"USD", "metadata":{{}}}}]
}}

Rules:
- Include 2-4 options for each list section.
- Keep summaries concise (1 sentence).
- Keep reasons concise and group-specific (1 sentence).
- For every item, reasoning_summary must be present and include budget_fit, interest_fit, and availability_travel_time_fit.
- Keep output JSON-only, no markdown or prose.
"""

    try:
        requested_model = (CLAUDE_MODEL or "").strip()
        candidate_models = []
        if requested_model:
            candidate_models.append(requested_model)
        for model_name in CLAUDE_MODEL_FALLBACKS:
            if model_name not in candidate_models:
                candidate_models.append(model_name)

        client = anthropic.Anthropic(api_key=api_key, timeout=45.0)
        response = None
        for model_name in candidate_models:
            try:
                response = client.messages.create(
                    model=model_name,
                    max_tokens=2200,
                    messages=[{"role": "user", "content": prompt}],
                )
                break
            except anthropic.NotFoundError:
                continue
            except Exception as e:
                print(f"[AI] generate_group_trip_plan failed for model {model_name}: {e}")
                continue

        if response is None:
            return fallback

        text_chunks = []
        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                text_chunks.append(block.text)
        text = "\n".join(text_chunks).strip()
        if not text:
            return fallback

        parsed = _extract_json_object(text)
        default_currency = str(constraints.get("budget_currency") or "USD")

        destination = _normalize_plan_item(
            parsed.get("destination", {}) if isinstance(parsed.get("destination"), dict) else {},
            "Recommended Destination",
            default_currency,
            constraints,
            planning_input,
        )

        def parse_list(name: str) -> list[dict[str, Any]]:
            raw_items = parsed.get(name, [])
            if not isinstance(raw_items, list):
                raw_items = []
            normalized = [
                _normalize_plan_item(item, f"Recommended {name[:-1].title()}", default_currency, constraints, planning_input)
                for item in raw_items
                if isinstance(item, dict)
            ]
            return normalized[:4]

        plan = {
            "group_id": group_id,
            "generated_at": datetime.utcnow().isoformat(),
            "destination": destination,
            "flights": parse_list("flights"),
            "hotels": parse_list("hotels"),
            "restaurants": parse_list("restaurants"),
            "activities": parse_list("activities"),
        }
        return {"ok": True, "plan": plan, "constraints": constraints}
    except Exception as e:
        print(f"[AI] generate_group_trip_plan error for group {group_id}: {e}")
        return fallback
