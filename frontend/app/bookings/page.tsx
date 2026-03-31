"use client";

import React, { useMemo, useState } from "react";
import "./bookings.css";

type FlightResult = {
    id: string;
    airline: string;
    price: number;
    currency: string;
    duration: string;
    stops: number;
    departureTime: string;
    arrivalTime: string;
    departureAirport: string;
    arrivalAirport: string;
};

type FormState = {
    origin: string;
    destination: string;
    departDate: string;
    returnDate: string;
    travelers: number;
};

const MOCK_FLIGHTS: FlightResult[] = [
    {
        id: "f1",
        airline: "Air France",
        price: 742,
        currency: "USD",
        duration: "9h 20m",
        stops: 0,
        departureTime: "07:25",
        arrivalTime: "16:45",
        departureAirport: "JFK",
        arrivalAirport: "CDG",
    },
    {
        id: "f2",
        airline: "Delta Airlines",
        price: 689,
        currency: "USD",
        duration: "11h 10m",
        stops: 1,
        departureTime: "09:10",
        arrivalTime: "20:20",
        departureAirport: "JFK",
        arrivalAirport: "CDG",
    },
    {
        id: "f3",
        airline: "Lufthansa",
        price: 705,
        currency: "USD",
        duration: "10h 05m",
        stops: 1,
        departureTime: "13:40",
        arrivalTime: "23:45",
        departureAirport: "JFK",
        arrivalAirport: "CDG",
    },
    {
        id: "f4",
        airline: "KLM",
        price: 811,
        currency: "USD",
        duration: "9h 45m",
        stops: 0,
        departureTime: "18:15",
        arrivalTime: "03:00",
        departureAirport: "JFK",
        arrivalAirport: "CDG",
    },
];

function formatStops(stops: number): string {
    if (stops === 0) return "Nonstop";
    if (stops === 1) return "1 stop";
    return `${stops} stops`;
}

export default function BookingsPage() {
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
    const [searched, setSearched] = useState(false);

    const minDate = useMemo(() => new Date().toISOString().split("T")[0], []);

    const validate = (): Partial<Record<keyof FormState, string>> => {
        const nextErrors: Partial<Record<keyof FormState, string>> = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!form.origin.trim()) nextErrors.origin = "Origin is required";
        if (!form.destination.trim()) nextErrors.destination = "Destination is required";
        if (!form.departDate) nextErrors.departDate = "Departure date is required";
        if (!form.returnDate) nextErrors.returnDate = "Return date is required";
        if (!form.travelers || form.travelers < 1) nextErrors.travelers = "At least 1 traveler is required";

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

        try {
            await new Promise((resolve) => setTimeout(resolve, 900));

            const originLower = form.origin.toLowerCase();
            const destinationLower = form.destination.toLowerCase();

            // Simulate external provider failure mode for testing UX states.
            if (originLower.includes("error") || destinationLower.includes("error")) {
                throw new Error("Flight provider is currently unavailable. Please try again shortly.");
            }

            if (originLower.includes("timeout") || destinationLower.includes("timeout")) {
                throw new Error("Flight search timed out. Please retry your search.");
            }

            const normalizedOrigin = form.origin.trim().slice(0, 3).toUpperCase();
            const normalizedDestination = form.destination.trim().slice(0, 3).toUpperCase();

            const enriched = MOCK_FLIGHTS.map((f) => ({
                ...f,
                departureAirport: normalizedOrigin || f.departureAirport,
                arrivalAirport: normalizedDestination || f.arrivalAirport,
                price: f.price + Math.max(0, form.travelers - 1) * 55,
            }));

            setResults(enriched);
        } catch (err) {
            setResults([]);
            setApiError(err instanceof Error ? err.message : "Unable to load flights right now.");
        } finally {
            setLoading(false);
        }
    };

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
                <div className="bookings-hero-badge">Live Search Mock</div>
            </section>

            <section className="flight-search-shell">
                <form onSubmit={handleSearch} className="flight-search-grid" noValidate>
                    <div className="field-wrap">
                        <label htmlFor="origin">Origin</label>
                        <input
                            id="origin"
                            type="text"
                            placeholder="e.g., New York or JFK"
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
                            placeholder="e.g., Paris or CDG"
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
                        <span className="results-count">{results.length} options found</span>
                    )}
                </div>

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

                <div className="flight-results-list">
                    {results.map((flight) => (
                        <article key={flight.id} className="flight-card">
                            <div className="flight-top-row">
                                <h3>{flight.airline}</h3>
                                <span className="flight-price">{flight.currency} {flight.price}</span>
                            </div>
                            <div className="flight-meta-row">
                                <span>{flight.departureAirport} {flight.departureTime}</span>
                                <span className="flight-arrow">→</span>
                                <span>{flight.arrivalAirport} {flight.arrivalTime}</span>
                            </div>
                            <div className="flight-pill-row">
                                <span className="pill">{flight.duration}</span>
                                <span className="pill">{formatStops(flight.stops)}</span>
                                <span className="pill">{form.travelers} traveler{form.travelers > 1 ? "s" : ""}</span>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
