import os
import json
import re
from datetime import datetime
from sqlalchemy.orm import Session
import anthropic

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
