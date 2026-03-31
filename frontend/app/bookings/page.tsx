"use client";

import React, { useMemo, useState } from "react";
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
    departure_time: string | null;
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
};

type FormState = {
    tripType: "round_trip" | "one_way";
    origin: string;
    destination: string;
    departDate: string;
    returnDate: string;
    travelers: number;
};

function formatStops(stops: number): string {
    if (stops === 0) return "Nonstop";
    if (stops === 1) return "1 stop";
    return `${stops} stops`;
}

export default function BookingsPage() {
    const { isAuthenticated, isLoading } = useAuth();
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

    const minDate = useMemo(() => new Date().toISOString().split("T")[0], []);
    const availableAirlines = useMemo(
        () => Array.from(new Set(results.map((flight) => flight.airline))).sort(),
        [results]
    );
    const filteredResults = useMemo(() => {
        if (selectedAirlines.length === 0) {
            return results;
        }
        return results.filter((flight) => selectedAirlines.includes(flight.airline));
    }, [results, selectedAirlines]);

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
                        departure_time: s.departure_time,
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
                        <span className="results-count">{filteredResults.length} options found</span>
                    )}
                </div>

                {!searched && (
                    <p className="filters-hint">Airline filters appear here after your search results load.</p>
                )}

                {availableAirlines.length > 0 && (
                    <div className="filters-toolbar">
                        <span className="filters-label">Airlines</span>
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
                            {selectedAirlines.length > 0 && (
                                <button
                                    type="button"
                                    className="filter-reset-btn"
                                    onClick={() => setSelectedAirlines([])}
                                >
                                    Clear filters
                                </button>
                            )}
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

                {searched && !loading && !apiError && results.length > 0 && filteredResults.length === 0 && (
                    <div className="results-placeholder">No flights match the selected airline filters.</div>
                )}

                <div className="flight-results-list">
                    {filteredResults.map((flight) => (
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

                            {/* ── Pills: travelers ── */}
                            <div className="flight-pill-row">
                                <span className="pill">{form.travelers} traveler{form.travelers > 1 ? "s" : ""}</span>
                            </div>

                            {/* ── Baggage info ── */}
                            {flight.baggages.length > 0 && (
                                <div className="flight-baggage-row">
                                    {flight.baggages.map((bag, bi) => (
                                        <span key={bi} className="baggage-chip">
                                            {bag.type === "carry_on" ? "🎒" : "🧳"}{" "}
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
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
