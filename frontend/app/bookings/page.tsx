"use client";

import React, { useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import "./bookings.css";

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
    slices: Array<{
        origin: string;
        destination: string;
        departure_time: string | null;
        arrival_time: string | null;
        stops: number;
    }>;
};

type FormState = {
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
        if (!form.returnDate) nextErrors.returnDate = "Return date is required";
        if (!form.travelers || form.travelers < 1) nextErrors.travelers = "At least 1 traveler is required";

        if (form.origin.trim() && !/^[A-Za-z]{3}$/.test(form.origin.trim())) {
            nextErrors.origin = "Use a 3-letter IATA code, e.g. JFK";
        }

        if (form.destination.trim() && !/^[A-Za-z]{3}$/.test(form.destination.trim())) {
            nextErrors.destination = "Use a 3-letter IATA code, e.g. CDG";
        }

        if (form.departDate) {
            const depart = new Date(form.departDate);
            if (depart < today) {
                nextErrors.departDate = "Departure date cannot be in the past";
            }
        }

        if (form.departDate && form.returnDate) {
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
                    return_date: form.returnDate,
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
                    slices: flight.slices || [],
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
                <form onSubmit={handleSearch} className="flight-search-grid" noValidate>
                    <div className="field-wrap">
                        <label htmlFor="origin">Origin</label>
                        <input
                            id="origin"
                            type="text"
                            placeholder="e.g., JFK"
                            value={form.origin}
                            onChange={(e) => setForm((prev) => ({ ...prev, origin: e.target.value }))}
                        />
                        {errors.origin && <p className="field-error">{errors.origin}</p>}
                    </div>

                    <div className="field-wrap">
                        <label htmlFor="destination">Destination</label>
                        <input
                            id="destination"
                            type="text"
                            placeholder="e.g., CDG"
                            value={form.destination}
                            onChange={(e) => setForm((prev) => ({ ...prev, destination: e.target.value }))}
                        />
                        {errors.destination && <p className="field-error">{errors.destination}</p>}
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
                                    <h3>{flight.airline}</h3>
                                </div>
                                <span className="flight-price">{flight.currency} {flight.price}</span>
                            </div>
                            <div className="flight-meta-row">
                                <span>{flight.departureAirport} {flight.departureTime || "--:--"}</span>
                                <span className="flight-arrow">→</span>
                                <span>{flight.arrivalAirport} {flight.arrivalTime || "--:--"}</span>
                            </div>
                            <div className="flight-pill-row">
                                <span className="pill">{flight.duration}</span>
                                <span className="pill">{formatStops(flight.stops)}</span>
                                <span className="pill">{form.travelers} traveler{form.travelers > 1 ? "s" : ""}</span>
                            </div>
                            {flight.slices.length > 0 && (
                                <div className="flight-slices-grid">
                                    {flight.slices.map((slice, index) => (
                                        <div key={`${flight.id}-${index}`} className="flight-slice-card">
                                            <span className="slice-label">{index === 0 ? "Outbound" : "Return"}</span>
                                            <div className="slice-route">{slice.origin} → {slice.destination}</div>
                                            <div className="slice-times">
                                                <span>{slice.departure_time || "--:--"}</span>
                                                <span>{slice.arrival_time || "--:--"}</span>
                                            </div>
                                            <div className="slice-stops">{formatStops(slice.stops)}</div>
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
