"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";
import AirportAutocomplete from "./AirportAutocomplete";
import "./bookings.css";

type BaggageInfo = {
    type: string;    // "checked_baggage" | "carry_on"
    quantity: number;
};

type LayoverInfo = {
    airport: string;
    duration: string;
};

type FlightSlice = {
    origin: string;
    destination: string;
    departure_date: string | null;
    departure_time: string | null;
    arrival_date: string | null;
    arrival_time: string | null;
    stops: number;
    layovers: LayoverInfo[];
};

type FlightResult = {
    id: string;
    airline: string;
    logoUrl: string | null;
    price: number;
    currency: string;
    duration: string;
    stops: number;
    departureTime: string;
    arrivalTime: string;
    departureAirport: string;
    arrivalAirport: string;
    cabinClass: string | null;
    baggages: BaggageInfo[];
    slices: FlightSlice[];
    emissionsKg: string | null;
};

type FormState = {
    tripType: "round_trip" | "one_way";
    origin: string;
    destination: string;
    departDate: string;
    returnDate: string;
    travelers: number;
};

type SaveMessage = {
    flightId: string;
    type: "success" | "error" | "warning";
    text: string;
};

function formatStops(stops: number): string {
    if (stops === 0) return "Nonstop";
    if (stops === 1) return "1 stop";
    return `${stops} stops`;
}

function parseDurationToMinutes(dur: string): number {
    if (!dur || dur === "N/A" || dur === "—") return Infinity;
    const iso = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (iso) return (parseInt(iso[1] || "0") * 60) + parseInt(iso[2] || "0");
    const human = dur.match(/(\d+)h\s*(\d*)m?/);
    if (human) return (parseInt(human[1]) * 60) + parseInt(human[2] || "0");
    return Infinity;
}

function getCheckedBagQty(flight: FlightResult): number {
    return flight.baggages
        .filter((b) => b.type !== "carry_on")
        .reduce((sum, b) => sum + b.quantity, 0);
}

function getCarryOnQty(flight: FlightResult): number {
    return flight.baggages
        .filter((b) => b.type === "carry_on")
        .reduce((sum, b) => sum + b.quantity, 0);
}

export default function BookingsPage() {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const [form, setForm] = useState<FormState>({
        tripType: "round_trip",
        origin: "",
        destination: "",
        departDate: "",
        returnDate: "",
        travelers: 1,
    });
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [apiError, setApiError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<FlightResult[]>([]);
    const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
    const [searched, setSearched] = useState(false);
    const [sortBy, setSortBy] = useState<"price" | "duration" | "departure" | null>(null);
    const [filterStops, setFilterStops] = useState<"any" | "nonstop" | "1" | "2+">("any");
    const [filterPriceMin, setFilterPriceMin] = useState<string>("");
    const [filterPriceMax, setFilterPriceMax] = useState<string>("");
    const [filterMaxDuration, setFilterMaxDuration] = useState<number | null>(null);
    const [compareIds, setCompareIds] = useState<string[]>([]);
    const [showCompare, setShowCompare] = useState(false);
    const [userGroups, setUserGroups] = useState<{ id: number; name: string; role: string }[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [showGroupSelectorForFlight, setShowGroupSelectorForFlight] = useState<string | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [savingFlightId, setSavingFlightId] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null);

    const minDate = useMemo(() => new Date().toISOString().split("T")[0], []);
    const availableAirlines = useMemo(
        () => Array.from(new Set(results.map((flight) => flight.airline))).sort(),
        [results]
    );
    const priceBounds = useMemo(() => {
        if (results.length === 0) return { min: 0, max: 0 };
        const prices = results.map((f) => f.price);
        return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [results]);

    const filteredResults = useMemo(() => {
        return results.filter((flight) => {
            if (selectedAirlines.length > 0 && !selectedAirlines.includes(flight.airline)) return false;
            if (filterStops === "nonstop" && flight.stops !== 0) return false;
            if (filterStops === "1" && flight.stops !== 1) return false;
            if (filterStops === "2+" && flight.stops < 2) return false;
            const minP = filterPriceMin !== "" ? parseFloat(filterPriceMin) : null;
            const maxP = filterPriceMax !== "" ? parseFloat(filterPriceMax) : null;
            if (minP !== null && flight.price < minP) return false;
            if (maxP !== null && flight.price > maxP) return false;
            if (filterMaxDuration !== null && parseDurationToMinutes(flight.duration) > filterMaxDuration) return false;
            return true;
        });
    }, [results, selectedAirlines, filterStops, filterPriceMin, filterPriceMax, filterMaxDuration]);

    const sortedResults = useMemo(() => {
        const list = [...filteredResults];
        if (sortBy === "price") list.sort((a, b) => a.price - b.price);
        else if (sortBy === "duration") list.sort((a, b) => parseDurationToMinutes(a.duration) - parseDurationToMinutes(b.duration));
        else if (sortBy === "departure") list.sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
        return list;
    }, [filteredResults, sortBy]);

    const compareFlights = useMemo(
        () => results.filter((f) => compareIds.includes(f.id)),
        [results, compareIds]
    );

    useEffect(() => {
        if (!isAuthenticated) return;

        const fetchGroups = async () => {
            setGroupsLoading(true);
            try {
                const res = await fetch("/api/groups");
                if (res.ok) {
                    const data = await res.json();
                    setUserGroups(data.groups || []);
                }
            } catch {
                // Keep flight search functional even if group lookup fails.
            } finally {
                setGroupsLoading(false);
            }
        };

        fetchGroups();
    }, [isAuthenticated]);

    const validate = (): Partial<Record<keyof FormState, string>> => {
        const nextErrors: Partial<Record<keyof FormState, string>> = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!form.origin.trim()) nextErrors.origin = "Origin is required";
        if (!form.destination.trim()) nextErrors.destination = "Destination is required";
        if (!form.departDate) nextErrors.departDate = "Departure date is required";
        if (form.tripType === "round_trip" && !form.returnDate) {
            nextErrors.returnDate = "Return date is required";
        }
        if (!form.travelers || form.travelers < 1) nextErrors.travelers = "At least 1 traveler is required";

        if (form.origin.trim() && form.origin.trim().length !== 3) {
            nextErrors.origin = "Select an airport from the dropdown";
        }

        if (form.destination.trim() && form.destination.trim().length !== 3) {
            nextErrors.destination = "Select an airport from the dropdown";
        }

        if (form.departDate) {
            const depart = new Date(form.departDate);
            if (depart < today) {
                nextErrors.departDate = "Departure date cannot be in the past";
            }
        }

        if (form.tripType === "round_trip" && form.departDate && form.returnDate) {
            const depart = new Date(form.departDate);
            const ret = new Date(form.returnDate);
            if (ret < depart) {
                nextErrors.returnDate = "Return date cannot be before departure";
            }
        }

        return nextErrors;
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setApiError(null);

        const nextErrors = validate();
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        setLoading(true);
        setSearched(true);
        setSelectedAirlines([]);
        setSortBy(null);
        setCompareIds([]);
        setShowCompare(false);
        closeSaveSelector();
        setSaveMessage(null);
        setFilterStops("any");
        setFilterPriceMin("");
        setFilterPriceMax("");
        setFilterMaxDuration(null);

        try {
            const res = await fetch("/api/flights/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    origin: form.origin.trim().toUpperCase(),
                    destination: form.destination.trim().toUpperCase(),
                    depart_date: form.departDate,
                    return_date: form.tripType === "round_trip" ? form.returnDate : null,
                    travelers: form.travelers,
                }),
            });

            const body = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(body?.detail || body?.message || "Unable to load flights right now.");
            }

            setResults(
                (body?.results || []).map((flight: any) => ({
                    id: flight.id,
                    airline: flight.airline,
                    logoUrl: flight.logo_url || null,
                    price: flight.price,
                    currency: flight.currency,
                    duration: flight.duration,
                    stops: flight.stops,
                    departureTime: flight.departure_time,
                    arrivalTime: flight.arrival_time,
                    departureAirport: flight.departure_airport,
                    arrivalAirport: flight.arrival_airport,
                    cabinClass: flight.cabin_class || null,
                    baggages: (flight.baggages || []).map((b: any) => ({
                        type: b.type,
                        quantity: b.quantity,
                    })),
                    slices: (flight.slices || []).map((s: any) => ({
                        origin: s.origin,
                        destination: s.destination,
                        departure_date: s.departure_date || null,
                        departure_time: s.departure_time,
                        arrival_date: s.arrival_date || null,
                        arrival_time: s.arrival_time,
                        stops: s.stops,
                        layovers: (s.layovers || []).map((l: any) => ({
                            airport: l.airport,
                            duration: l.duration,
                        })),
                    })),
                }))
            );
            setApiError(body?.message || null);
        } catch (err) {
            setResults([]);
            setApiError(err instanceof Error ? err.message : "Unable to load flights right now.");
        } finally {
            setLoading(false);
        }
    };

    const toggleAirline = (airline: string) => {
        setSelectedAirlines((prev) =>
            prev.includes(airline)
                ? prev.filter((item) => item !== airline)
                : [...prev, airline]
        );
    };

    const clearAllFilters = () => {
        setSelectedAirlines([]);
        setFilterStops("any");
        setFilterPriceMin("");
        setFilterPriceMax("");
        setFilterMaxDuration(null);
    };

    const hasActiveFilters =
        selectedAirlines.length > 0 ||
        filterStops !== "any" ||
        filterPriceMin !== "" ||
        filterPriceMax !== "" ||
        filterMaxDuration !== null;

    const toggleCompare = (id: string) => {
        setCompareIds((prev) =>
            prev.includes(id)
                ? prev.filter((x) => x !== id)
                : prev.length < 4 ? [...prev, id] : prev
        );
    };

    const closeSaveSelector = () => {
        setShowGroupSelectorForFlight(null);
        setSelectedGroupId(null);
    };

    const handleSaveFlightToGroup = async (flight: FlightResult) => {
        if (!selectedGroupId) return;

        setSavingFlightId(flight.id);
        setSaveMessage(null);

        try {
            const res = await fetch(`/api/groups/${selectedGroupId}/flight-shortlist`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    flight_offer_id: flight.id,
                    airline: flight.airline,
                    logo_url: flight.logoUrl,
                    price: flight.price,
                    currency: flight.currency,
                    duration: flight.duration,
                    stops: flight.stops,
                    departure_time: flight.departureTime,
                    arrival_time: flight.arrivalTime,
                    departure_airport: flight.departureAirport,
                    arrival_airport: flight.arrivalAirport,
                    cabin_class: flight.cabinClass,
                    baggages: flight.baggages,
                    slices: flight.slices,
                    emissions_kg: flight.emissionsKg,
                }),
            });

            if (res.status === 409) {
                setSaveMessage({
                    flightId: flight.id,
                    type: "warning",
                    text: "This flight is already in the selected group's shortlist.",
                });
            } else if (!res.ok) {
                const body = await res.json().catch(() => null);
                const detail = body?.detail;
                if (Array.isArray(detail) && detail.length > 0) {
                    const first = detail[0];
                    throw new Error(first?.msg || `Error (${res.status})`);
                }
                throw new Error(detail || `Error (${res.status})`);
            } else {
                const groupName = userGroups.find((g) => g.id === selectedGroupId)?.name ?? "group";
                setSaveMessage({
                    flightId: flight.id,
                    type: "success",
                    text: `Saved to "${groupName}"!`,
                });
                closeSaveSelector();
            }
        } catch (err) {
            setSaveMessage({
                flightId: flight.id,
                type: "error",
                text: err instanceof Error ? err.message : "Failed to save flight.",
            });
        } finally {
            setSavingFlightId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="bookings-page">
                <div className="results-placeholder">Checking your session...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="bookings-page">
                <section className="bookings-hero">
                    <div>
                        <p className="bookings-kicker">Trip Planner</p>
                        <h1>Book Flights</h1>
                        <p className="bookings-subtitle">
                            Sign in to search flights, compare airlines, and save the best options for your trip.
                        </p>
                    </div>
                    <div className="bookings-hero-badge">Sign-in Required</div>
                </section>

                <div className="auth-required-card">
                    <h2>Sign in to continue</h2>
                    <p>
                        Flight search is only available for authenticated users. Use the header controls to sign in,
                        then come back here to search and filter live results.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bookings-page">
            <section className="bookings-hero">
                <div>
                    <p className="bookings-kicker">Trip Planner</p>
                    <h1>Book Flights</h1>
                    <p className="bookings-subtitle">
                        Search routes by origin, destination, dates, and travelers to compare your best options.
                    </p>
                </div>
            </section>

            <section className="flight-search-shell">
                <form
                    onSubmit={handleSearch}
                    className={`flight-search-grid ${form.tripType === "one_way" ? "flight-search-grid-oneway" : ""}`}
                    noValidate
                >
                    <AirportAutocomplete
                        id="origin"
                        label="Origin"
                        value={form.origin}
                        onChange={(iata) => setForm((prev) => ({ ...prev, origin: iata }))}
                        placeholder="City or airport..."
                        error={errors.origin}
                    />

                    <AirportAutocomplete
                        id="destination"
                        label="Destination"
                        value={form.destination}
                        onChange={(iata) => setForm((prev) => ({ ...prev, destination: iata }))}
                        placeholder="City or airport..."
                        error={errors.destination}
                    />

                    <div className="field-wrap">
                        <label htmlFor="tripType">Trip Type</label>
                        <select
                            id="tripType"
                            value={form.tripType}
                            onChange={(e) => {
                                const nextTripType = e.target.value as FormState["tripType"];
                                setForm((prev) => ({
                                    ...prev,
                                    tripType: nextTripType,
                                    returnDate: nextTripType === "one_way" ? "" : prev.returnDate,
                                }));
                            }}
                        >
                            <option value="round_trip">Round trip</option>
                            <option value="one_way">One way</option>
                        </select>
                    </div>

                    <div className="field-wrap">
                        <label htmlFor="departDate">Departure</label>
                        <input
                            id="departDate"
                            type="date"
                            min={minDate}
                            value={form.departDate}
                            onChange={(e) => setForm((prev) => ({ ...prev, departDate: e.target.value }))}
                        />
                        {errors.departDate && <p className="field-error">{errors.departDate}</p>}
                    </div>

                    {form.tripType === "round_trip" && (
                        <div className="field-wrap">
                            <label htmlFor="returnDate">Return</label>
                            <input
                                id="returnDate"
                                type="date"
                                min={form.departDate || minDate}
                                value={form.returnDate}
                                onChange={(e) => setForm((prev) => ({ ...prev, returnDate: e.target.value }))}
                            />
                            {errors.returnDate && <p className="field-error">{errors.returnDate}</p>}
                        </div>
                    )}

                    <div className="field-wrap">
                        <label htmlFor="travelers">Travelers</label>
                        <select
                            id="travelers"
                            value={form.travelers}
                            onChange={(e) => setForm((prev) => ({ ...prev, travelers: Number(e.target.value) }))}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                                <option key={count} value={count}>
                                    {count} {count === 1 ? "Traveler" : "Travelers"}
                                </option>
                            ))}
                        </select>
                        {errors.travelers && <p className="field-error">{errors.travelers}</p>}
                    </div>

                    <div className="search-action-wrap">
                        <button type="submit" className="flight-search-btn" disabled={loading}>
                            {loading ? "Searching..." : "Search Flights"}
                        </button>
                    </div>
                </form>

                {apiError && (
                    <div className="api-error-banner" role="alert">
                        {apiError}
                    </div>
                )}
            </section>

            <section className="flight-results-section">
                <div className="results-header">
                    <h2>Matching Flights</h2>
                    {searched && !loading && !apiError && (
                        <span className="results-count">{sortedResults.length} options found</span>
                    )}
                </div>

                {!searched && (
                    <p className="filters-hint">Filter options appear here after your search results load.</p>
                )}

                {availableAirlines.length > 0 && (
                    <div className="filters-panel">
                        <div className="filters-panel-header">
                            <span className="filters-panel-title">Filters</span>
                            {hasActiveFilters && (
                                <button type="button" className="filter-clear-all-btn" onClick={clearAllFilters}>
                                    Clear Filters
                                </button>
                            )}
                        </div>

                        <div className="filter-section">
                            <span className="filter-section-label">Price Range ({results[0]?.currency})</span>
                            <div className="filter-price-inputs">
                                <input
                                    type="number"
                                    placeholder={`Min (${priceBounds.min.toLocaleString()})`}
                                    className="filter-price-input"
                                    value={filterPriceMin}
                                    min={0}
                                    onChange={(e) => setFilterPriceMin(e.target.value)}
                                />
                                <span className="filter-price-sep">—</span>
                                <input
                                    type="number"
                                    placeholder={`Max (${priceBounds.max.toLocaleString()})`}
                                    className="filter-price-input"
                                    value={filterPriceMax}
                                    min={0}
                                    onChange={(e) => setFilterPriceMax(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="filter-section">
                            <span className="filter-section-label">Stops</span>
                            <div className="filters-chip-row">
                                {(["any", "nonstop", "1", "2+"] as const).map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        className={`filter-chip ${filterStops === opt ? "filter-chip-active" : ""}`}
                                        onClick={() => setFilterStops(opt)}
                                    >
                                        {opt === "any" ? "Any" : opt === "nonstop" ? "Nonstop" : opt === "1" ? "1 Stop" : "2+ Stops"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="filter-section">
                            <span className="filter-section-label">Airlines</span>
                            <div className="filters-chip-row">
                                {availableAirlines.map((airline) => (
                                    <button
                                        key={airline}
                                        type="button"
                                        className={`filter-chip ${selectedAirlines.includes(airline) ? "filter-chip-active" : ""}`}
                                        onClick={() => toggleAirline(airline)}
                                    >
                                        {airline}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="filter-section">
                            <span className="filter-section-label">Max Travel Time</span>
                            <div className="filters-chip-row">
                                {([null, 360, 600, 900] as (number | null)[]).map((mins) => (
                                    <button
                                        key={mins ?? "any"}
                                        type="button"
                                        className={`filter-chip ${filterMaxDuration === mins ? "filter-chip-active" : ""}`}
                                        onClick={() => setFilterMaxDuration(mins)}
                                    >
                                        {mins === null ? "Any" : mins === 360 ? "Under 6h" : mins === 600 ? "Under 10h" : "Under 15h"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {sortedResults.length > 0 && (
                    <div className="sort-toolbar">
                        <span className="filters-label">Sort by</span>
                        <div className="filters-chip-row">
                            <button
                                type="button"
                                className={`filter-chip ${sortBy === "price" ? "filter-chip-active" : ""}`}
                                onClick={() => setSortBy(sortBy === "price" ? null : "price")}
                            >
                                Lowest price
                            </button>
                            <button
                                type="button"
                                className={`filter-chip ${sortBy === "duration" ? "filter-chip-active" : ""}`}
                                onClick={() => setSortBy(sortBy === "duration" ? null : "duration")}
                            >
                                Shortest duration
                            </button>
                            <button
                                type="button"
                                className={`filter-chip ${sortBy === "departure" ? "filter-chip-active" : ""}`}
                                onClick={() => setSortBy(sortBy === "departure" ? null : "departure")}
                            >
                                Earliest departure
                            </button>
                        </div>
                    </div>
                )}

                {!searched && (
                    <div className="results-placeholder">
                        Enter your route details and search to view curated flight options.
                    </div>
                )}

                {searched && loading && (
                    <div className="results-placeholder">Searching best available options...</div>
                )}

                {searched && !loading && !apiError && results.length === 0 && (
                    <div className="results-placeholder">No flights found for your selected route.</div>
                )}

                {searched && !loading && !apiError && results.length > 0 && sortedResults.length === 0 && (
                    <div className="results-placeholder">No flights match your filters. Try adjusting or clearing them.</div>
                )}

                <div className="flight-results-list">
                    {sortedResults.map((flight) => (
                        <article key={flight.id} className="flight-card">
                            {/* ── Top row: airline identity + price ── */}
                            <div className="flight-top-row">
                                <div className="flight-airline-block">
                                    {flight.logoUrl ? (
                                        <img
                                            src={flight.logoUrl}
                                            alt={`${flight.airline} logo`}
                                            className="flight-airline-logo"
                                            onError={(e) => {
                                                e.currentTarget.style.display = "none";
                                            }}
                                        />
                                    ) : (
                                        <div className="flight-airline-fallback">
                                            {flight.airline.slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flight-airline-text">
                                        <h3>{flight.airline}</h3>
                                        {flight.cabinClass && (
                                            <span className="flight-cabin-badge">
                                                {flight.cabinClass.replace(/_/g, " ")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flight-price-block">
                                    <span className="flight-price">
                                        {flight.currency} {flight.price.toLocaleString()}
                                    </span>
                                    <span className="flight-price-note">per person</span>
                                    <button
                                        type="button"
                                        className={`compare-toggle-btn ${compareIds.includes(flight.id) ? "compare-toggle-active" : ""}`}
                                        onClick={() => toggleCompare(flight.id)}
                                        disabled={!compareIds.includes(flight.id) && compareIds.length >= 4}
                                        aria-label={compareIds.includes(flight.id) ? "Remove from comparison" : "Add to comparison"}
                                    >
                                        {compareIds.includes(flight.id) ? "✓ Comparing" : "+ Compare"}
                                    </button>
                                    <button
                                        type="button"
                                        className="save-to-group-btn"
                                        onClick={() => {
                                            setShowGroupSelectorForFlight(flight.id);
                                            setSaveMessage(null);
                                        }}
                                        disabled={groupsLoading}
                                    >
                                        {groupsLoading ? "Loading groups..." : "Save to Group Plan"}
                                    </button>
                                    <button
                                        type="button"
                                        className="book-now-btn"
                                        onClick={() => router.push(`/bookings/book?offer_id=${flight.id}&passengers=${form.travelers}&amount=${flight.price}&currency=${flight.currency}`)}
                                    >
                                        Book Now
                                    </button>
                                </div>
                            </div>

                            {/* ── Route summary ── */}
                            <div className="flight-meta-row">
                                <span className="flight-airport">
                                    <strong>{flight.departureAirport}</strong>
                                    <span className="flight-time">{flight.departureTime || "--:--"}</span>
                                </span>
                                <span className="flight-route-center">
                                    <span className="flight-duration-label">{flight.duration}</span>
                                    <span className="flight-route-line" />
                                    <span className="flight-stops-label">{formatStops(flight.stops)}</span>
                                </span>
                                <span className="flight-airport flight-airport-right">
                                    <strong>{flight.arrivalAirport}</strong>
                                    <span className="flight-time">{flight.arrivalTime || "--:--"}</span>
                                </span>
                            </div>

                            {/* ── Pills: travelers + emissions ── */}
                            <div className="flight-pill-row">
                                <span className="pill">{form.travelers} traveler{form.travelers > 1 ? "s" : ""}</span>
                                {flight.emissionsKg && (
                                    <span className="pill pill-emissions">🌿 {flight.emissionsKg} kg CO₂</span>
                                )}
                            </div>

                            {/* ── Baggage info ── */}
                            {flight.baggages.length > 0 && (
                                <div className="flight-baggage-row">
                                    {flight.baggages.map((bag, bi) => (
                                        <span key={bi} className="baggage-chip">
                                            <img
                                                src={bag.type === "carry_on" ? "/cabinbag.svg" : "/checkedbag.svg"}
                                                alt={bag.type === "carry_on" ? "carry-on bag" : "checked bag"}
                                                className="baggage-chip-icon"
                                            />
                                            {bag.quantity}x {bag.type === "carry_on" ? "carry-on" : "checked bag"}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* ── Slice breakdown ── */}
                            {flight.slices.length > 0 && (
                                <div className="flight-slices-grid">
                                    {flight.slices.map((slice, index) => (
                                        <div key={`${flight.id}-${index}`} className="flight-slice-card">
                                            <span className="slice-label">{index === 0 ? "Outbound" : "Return"}</span>
                                            <div className="slice-route">{slice.origin} → {slice.destination}</div>
                                            <div className="slice-times">
                                                <span>{slice.departure_time || "--:--"}</span>
                                                <span className="slice-time-arrow">→</span>
                                                <span>{slice.arrival_time || "--:--"}</span>
                                            </div>
                                            <div className="slice-stops">{formatStops(slice.stops)}</div>
                                            {slice.layovers.length > 0 && (
                                                <div className="slice-layovers">
                                                    {slice.layovers.map((layover, li) => (
                                                        <span key={li} className="layover-chip">
                                                            ✈ {layover.airport} · {layover.duration} layover
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {showGroupSelectorForFlight === flight.id && (
                                <div className="flight-save-panel">
                                    {userGroups.length === 0 ? (
                                        <p className="flight-save-empty">You are not a member of any group yet.</p>
                                    ) : (
                                        <>
                                            <select
                                                className="flight-save-select"
                                                value={selectedGroupId ?? ""}
                                                onChange={(e) => setSelectedGroupId(Number(e.target.value) || null)}
                                            >
                                                <option value="">Select a group...</option>
                                                {userGroups.map((g) => (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                            <div className="flight-save-actions">
                                                <button
                                                    type="button"
                                                    className="flight-save-confirm-btn"
                                                    onClick={() => handleSaveFlightToGroup(flight)}
                                                    disabled={!selectedGroupId || savingFlightId === flight.id}
                                                >
                                                    {savingFlightId === flight.id ? "Saving..." : "Confirm"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="flight-save-cancel-btn"
                                                    onClick={closeSaveSelector}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {saveMessage?.flightId === flight.id && (
                                <p className={`flight-save-message flight-save-message-${saveMessage.type}`}>
                                    {saveMessage.text}
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            </section>

            {/* ── Sticky compare bar ── */}
            {compareIds.length > 0 && (
                <div className="compare-bar">
                    <span className="compare-bar-info">
                        {compareIds.length} flight{compareIds.length > 1 ? "s" : ""} selected
                    </span>
                    <div className="compare-bar-actions">
                        <button type="button" className="compare-bar-clear" onClick={() => setCompareIds([])}>
                            Clear selection
                        </button>
                        <button
                            type="button"
                            className="compare-bar-btn"
                            onClick={() => setShowCompare(true)}
                            disabled={compareIds.length < 2}
                        >
                            {compareIds.length >= 2 ? `Compare ${compareIds.length} Flights` : "Select 1 more"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Compare modal ── */}
            {showCompare && (
                <div
                    className="compare-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowCompare(false); }}
                >
                    <div className="compare-modal">
                        <div className="compare-modal-header">
                            <h2>Compare Flights</h2>
                            <button type="button" className="compare-close-btn" onClick={() => setShowCompare(false)}>✕</button>
                        </div>
                        <div className="compare-scroll">
                            <div
                                className="compare-table"
                                style={{ gridTemplateColumns: `150px repeat(${compareFlights.length}, 1fr)` }}
                            >
                                {/* Airline header */}
                                <div className="compare-th" />
                                {compareFlights.map((f) => (
                                    <div key={f.id} className="compare-flight-th">
                                        {f.logoUrl ? (
                                            <img src={f.logoUrl} alt={`${f.airline} logo`} className="compare-airline-logo" />
                                        ) : (
                                            <div className="flight-airline-fallback compare-fallback-icon">
                                                {f.airline.slice(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                        <span className="compare-airline-name">{f.airline}</span>
                                    </div>
                                ))}

                                {/* Price */}
                                <div className="compare-field-label">Price</div>
                                {compareFlights.map((f) => {
                                    const bestPrice = Math.min(...compareFlights.map((x) => x.price));
                                    const isBest = f.price === bestPrice;
                                    return (
                                        <div key={f.id} className={`compare-cell${isBest ? " compare-cell-best" : ""}`}>
                                            <strong>{f.currency} {f.price.toLocaleString()}</strong>
                                            {isBest && <span className="best-badge">Best price</span>}
                                        </div>
                                    );
                                })}

                                {/* Duration */}
                                <div className="compare-field-label">Duration</div>
                                {compareFlights.map((f) => {
                                    const bestDur = Math.min(...compareFlights.map((x) => parseDurationToMinutes(x.duration)));
                                    const isBest = bestDur !== Infinity && parseDurationToMinutes(f.duration) === bestDur;
                                    return (
                                        <div key={f.id} className={`compare-cell${isBest ? " compare-cell-best" : ""}`}>
                                            {f.duration && f.duration !== "N/A" ? f.duration : "—"}
                                            {isBest && <span className="best-badge">Fastest</span>}
                                        </div>
                                    );
                                })}

                                {/* Stops */}
                                <div className="compare-field-label">Stops</div>
                                {compareFlights.map((f) => {
                                    const minStops = Math.min(...compareFlights.map((x) => x.stops));
                                    const isBest = f.stops === minStops;
                                    return (
                                        <div key={f.id} className={`compare-cell${isBest ? " compare-cell-best" : ""}`}>
                                            {formatStops(f.stops)}
                                            {isBest && <span className="best-badge">Best</span>}
                                        </div>
                                    );
                                })}

                                {/* Departure */}
                                <div className="compare-field-label">Departure</div>
                                {compareFlights.map((f) => (
                                    <div key={f.id} className="compare-cell">
                                        <strong>{f.departureAirport}</strong>
                                        <span>{f.departureTime || "--:--"}</span>
                                    </div>
                                ))}

                                {/* Arrival */}
                                <div className="compare-field-label">Arrival</div>
                                {compareFlights.map((f) => (
                                    <div key={f.id} className="compare-cell">
                                        <strong>{f.arrivalAirport}</strong>
                                        <span>{f.arrivalTime || "--:--"}</span>
                                    </div>
                                ))}

                                {/* Cabin class — only when at least one flight has it */}
                                {compareFlights.some((f) => f.cabinClass) && (
                                    <>
                                        <div className="compare-field-label">Cabin</div>
                                        {compareFlights.map((f) => (
                                            <div key={f.id} className="compare-cell">
                                                {f.cabinClass ? f.cabinClass.replace(/_/g, " ") : "—"}
                                            </div>
                                        ))}
                                    </>
                                )}

                                {/* Emissions */}
                                <div className="compare-field-label">CO₂ Emissions</div>
                                {compareFlights.map((f) => {
                                    const vals = compareFlights.map((x) => parseFloat(x.emissionsKg || "0"));
                                    const best = Math.min(...vals.filter((v) => v > 0));
                                    const isBest = f.emissionsKg !== null && parseFloat(f.emissionsKg) === best;
                                    return (
                                        <div key={f.id} className={`compare-cell${isBest ? " compare-cell-best" : ""}`}>
                                            {f.emissionsKg ? `${f.emissionsKg} kg` : "—"}
                                            {isBest && <span className="best-badge">Lowest</span>}
                                        </div>
                                    );
                                })}

                                {/* Baggage */}
                                <div className="compare-field-label">Baggage</div>
                                {compareFlights.map((f) => {
                                    const checkedVals = compareFlights.map((x) => getCheckedBagQty(x));
                                    const carryVals = compareFlights.map((x) => getCarryOnQty(x));
                                    const maxChecked = Math.max(...checkedVals);
                                    const maxCarry = Math.max(...carryVals);
                                    const currentChecked = getCheckedBagQty(f);
                                    const currentCarry = getCarryOnQty(f);
                                    const isBest = (currentChecked > 0 || currentCarry > 0)
                                        && currentChecked === maxChecked
                                        && currentCarry === maxCarry;
                                    return (
                                        <div key={f.id} className={`compare-cell${isBest ? " compare-cell-best" : ""}`}>
                                            {f.baggages.length > 0
                                                ? f.baggages.map((b, i) => (
                                                    <span key={i} className="baggage-chip">
                                                        <img
                                                            src={b.type === "carry_on" ? "/cabinbag.svg" : "/checkedbag.svg"}
                                                            alt={b.type === "carry_on" ? "carry-on bag" : "checked bag"}
                                                            className="baggage-chip-icon"
                                                        />
                                                        {b.quantity}x {b.type === "carry_on" ? "carry-on" : "checked"}
                                                    </span>
                                                ))
                                                : "—"
                                            }
                                            {isBest && <span className="best-badge">Most included</span>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
