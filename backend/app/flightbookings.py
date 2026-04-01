import re
from datetime import datetime

from .schemas import BaggageInfo, FlightOfferOut, FlightSliceSummaryOut, LayoverInfo


def _format_duffel_duration(duration: str | None) -> str:
    if not duration:
        return "N/A"

    minutes_total = _iso_duration_to_minutes(duration)
    if minutes_total <= 0:
        return "N/A"
    hours, minutes = divmod(minutes_total, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}h")
    if minutes or not parts:
        parts.append(f"{minutes}m")
    return " ".join(parts)


def _iso_duration_to_minutes(iso: str | None) -> int:
    """Parse ISO 8601 duration (e.g. 'PT25H30M' or 'P2DT3H15M') into minutes."""
    if not iso:
        return 0

    m = re.match(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$", iso)
    if not m:
        return 0

    days = int(m.group(1) or 0)
    hours = int(m.group(2) or 0)
    minutes = int(m.group(3) or 0)
    return days * 24 * 60 + hours * 60 + minutes


def _format_minutes(minutes_total: int) -> str:
    if minutes_total <= 0:
        return "N/A"
    hours, mins = divmod(minutes_total, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}h")
    if mins or not parts:
        parts.append(f"{mins}m")
    return " ".join(parts)


def _compute_offer_duration(offer: dict) -> str:
    """Return a formatted duration string for an offer.

    Duffel v2 does not reliably populate `total_duration` at the offer level.
        Strategy (in order):
            1. Sum each slice's `duration` field.
            2. Use offer-level `total_duration` if present.
            3. Sum per-slice elapsed time (first departure -> last arrival per slice).
    """
    # Strategy 1 - sum slice-level duration fields
    slices = offer.get("slices") or []
    total_minutes = 0
    all_slices_have_duration = True
    for sl in slices:
        slice_dur = sl.get("duration")
        if slice_dur:
            total_minutes += _iso_duration_to_minutes(slice_dur)
        else:
            all_slices_have_duration = False
            break

    if all_slices_have_duration and total_minutes > 0:
        return _format_minutes(total_minutes)

    # Strategy 2 - offer-level duration when slice-level is not fully available
    raw = offer.get("total_duration")
    if raw:
        formatted = _format_duffel_duration(raw)
        if formatted != "N/A":
            return formatted

    # Strategy 3 - sum per-slice elapsed times to avoid counting stay duration
    try:
        total_slice_minutes = 0
        for sl in slices:
            segments = sl.get("segments") or []
            if not segments:
                continue
            dep_str = segments[0].get("departing_at")
            arr_str = segments[-1].get("arriving_at")
            if not dep_str or not arr_str:
                continue
            dep_dt = datetime.fromisoformat(dep_str.replace("Z", "+00:00"))
            arr_dt = datetime.fromisoformat(arr_str.replace("Z", "+00:00"))
            if arr_dt > dep_dt:
                total_slice_minutes += int((arr_dt - dep_dt).total_seconds() // 60)

        if total_slice_minutes > 0:
            return _format_minutes(total_slice_minutes)
    except (ValueError, TypeError):
        pass

    return "N/A"


def _format_duffel_time(value: str | None) -> str | None:
    if not value:
        return None
    timestamp = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(timestamp).strftime("%H:%M")
    except ValueError:
        return value


def _format_duffel_date(value: str | None) -> str | None:
    if not value:
        return None
    timestamp = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(timestamp).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _calculate_layover(arriving_at: str | None, departing_at: str | None) -> str:
    """Return layover duration formatted as '2h 15m' from two ISO datetime strings."""
    if not arriving_at or not departing_at:
        return "N/A"
    try:
        arr = datetime.fromisoformat(arriving_at.replace("Z", "+00:00"))
        dep = datetime.fromisoformat(departing_at.replace("Z", "+00:00"))
        total_minutes = int((dep - arr).total_seconds() // 60)
        if total_minutes < 0:
            return "N/A"
        hours, mins = divmod(total_minutes, 60)
        return f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
    except (ValueError, TypeError):
        return "N/A"


def _serialize_duffel_offer(offer: dict) -> FlightOfferOut:
    slices = offer.get("slices", []) or []
    slice_summaries: list[FlightSliceSummaryOut] = []
    carrier_names: list[str] = []
    logo_url: str | None = None
    total_stops = 0

    for slice_item in slices:
        segments = slice_item.get("segments", []) or []
        if not segments:
            continue

        first_segment = segments[0]
        last_segment = segments[-1]
        total_stops += max(0, len(segments) - 1)

        layovers: list[LayoverInfo] = []
        for i in range(len(segments) - 1):
            layover_airport = (
                segments[i].get("destination", {}).get("iata_code")
                or segments[i + 1].get("origin", {}).get("iata_code")
                or "N/A"
            )
            layover_duration = _calculate_layover(
                segments[i].get("arriving_at"),
                segments[i + 1].get("departing_at"),
            )
            layovers.append(LayoverInfo(airport=layover_airport, duration=layover_duration))

        for segment in segments:
            operating_carrier = segment.get("operating_carrier", {}) or {}
            marketing_carrier = segment.get("marketing_carrier", {}) or {}
            carrier_name = operating_carrier.get("name") or marketing_carrier.get("name")
            if carrier_name and carrier_name not in carrier_names:
                carrier_names.append(carrier_name)

            if not logo_url:
                logo_url = (
                    operating_carrier.get("logo_symbol_url")
                    or operating_carrier.get("logo_lockup_url")
                    or marketing_carrier.get("logo_symbol_url")
                    or marketing_carrier.get("logo_lockup_url")
                )

        slice_summaries.append(
            FlightSliceSummaryOut(
                origin=first_segment.get("origin", {}).get("iata_code") or slice_item.get("origin", {}).get("iata_code") or "N/A",
                destination=last_segment.get("destination", {}).get("iata_code") or slice_item.get("destination", {}).get("iata_code") or "N/A",
                departure_date=_format_duffel_date(first_segment.get("departing_at")),
                departure_time=_format_duffel_time(first_segment.get("departing_at")),
                arrival_date=_format_duffel_date(last_segment.get("arriving_at")),
                arrival_time=_format_duffel_time(last_segment.get("arriving_at")),
                stops=max(0, len(segments) - 1),
                layovers=layovers,
            )
        )

    baggages: list[BaggageInfo] = []
    cabin_class: str | None = None
    first_seg_passengers: list = []
    if slices:
        first_segments = offer.get("slices", [{}])[0].get("segments", [])
        if first_segments:
            first_seg_passengers = first_segments[0].get("passengers", []) or []
    if first_seg_passengers:
        sp = first_seg_passengers[0]
        cabin_class = sp.get("cabin_class")
        for bag in (sp.get("baggages") or []):
            bag_type = bag.get("type")
            quantity = bag.get("quantity", 0)
            if bag_type is not None:
                baggages.append(BaggageInfo(type=str(bag_type), quantity=int(quantity or 0)))

    first_slice = slice_summaries[0] if slice_summaries else None

    return FlightOfferOut(
        id=offer.get("id", "unknown-offer"),
        airline=carrier_names[0] if carrier_names else "Unknown airline",
        logo_url=logo_url,
        price=float(offer.get("total_amount") or 0),
        currency=offer.get("total_currency") or "USD",
        duration=_compute_offer_duration(offer),
        stops=total_stops,
        departure_time=first_slice.departure_time if first_slice else None,
        arrival_time=first_slice.arrival_time if first_slice else None,
        departure_airport=first_slice.origin if first_slice else "N/A",
        arrival_airport=first_slice.destination if first_slice else "N/A",
        cabin_class=cabin_class,
        baggages=baggages,
        slices=slice_summaries,
        emissions_kg=offer.get("total_emissions_kg") or None,
    )


def _offer_primary_airline(offer: dict) -> str:
    """Best-effort primary airline name for diversity selection."""
    slices = offer.get("slices") or []
    if slices:
        segments = slices[0].get("segments") or []
        if segments:
            first_segment = segments[0]
            operating = (first_segment.get("operating_carrier") or {}).get("name")
            marketing = (first_segment.get("marketing_carrier") or {}).get("name")
            if operating:
                return str(operating)
            if marketing:
                return str(marketing)

    owner_name = (offer.get("owner") or {}).get("name")
    if owner_name:
        return str(owner_name)

    return "Unknown airline"


def _select_diverse_offers(offers: list[dict], limit: int = 20) -> list[dict]:
    """Pick offers to maximize airline variety, then fill remaining slots by order."""
    if limit <= 0 or not offers:
        return []

    indexed_offers = list(enumerate(offers))
    selected: list[dict] = []
    selected_indices: set[int] = set()
    seen_airlines: set[str] = set()

    for idx, offer in indexed_offers:
        airline_key = _offer_primary_airline(offer).strip().lower()
        if airline_key in seen_airlines:
            continue
        selected.append(offer)
        selected_indices.add(idx)
        seen_airlines.add(airline_key)
        if len(selected) >= limit:
            return selected

    for idx, offer in indexed_offers:
        if idx in selected_indices:
            continue
        selected.append(offer)
        if len(selected) >= limit:
            break

    return selected
