"use client";

import React, { useEffect, useMemo, useState } from "react";
import "./HotelSearchPanel.css";

type HotelOption = {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: string;
    types: string[];
    photo_url?: string;
    photo_reference?: string;
    location?: { lat: number | null; lng: number | null };
    business_status?: string;
    website?: string;
    google_maps_url?: string;
};

type HotelSearchResponse = {
    status: "success" | "error";
    results: HotelOption[];
    message?: string;
};

type SortMode = "relevance" | "rating_desc" | "reviews_desc";

type FormErrors = {
    destination?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
    rooms?: string;
};

const todayISO = () => new Date().toISOString().split("T")[0];

const defaultCheckIn = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
};

const defaultCheckOut = () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().split("T")[0];
};

export default function HotelSearchPanel({
    title = "Find Hotels",
    subtitle = "Search by destination, travel dates, guests, and rooms.",
    initialDestination = "",
}: {
    title?: string;
    subtitle?: string;
    initialDestination?: string;
}) {
    const [destination, setDestination] = useState(initialDestination);
    const [checkIn, setCheckIn] = useState(defaultCheckIn());
    const [checkOut, setCheckOut] = useState(defaultCheckOut());
    const [guests, setGuests] = useState(2);
    const [rooms, setRooms] = useState(1);
    const [sortBy, setSortBy] = useState<SortMode>("relevance");

    const [errors, setErrors] = useState<FormErrors>({});
    const [hotels, setHotels] = useState<HotelOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [expandedHotelId, setExpandedHotelId] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    useEffect(() => {
        if (initialDestination && !destination.trim()) {
            setDestination(initialDestination);
        }
    }, [initialDestination, destination]);

    const minCheckOut = useMemo(() => {
        if (!checkIn) return todayISO();
        const d = new Date(checkIn);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
    }, [checkIn]);

    const validate = (): FormErrors => {
        const nextErrors: FormErrors = {};
        const now = new Date(todayISO());

        if (!destination.trim()) {
            nextErrors.destination = "Destination is required.";
        }

        if (!checkIn) {
            nextErrors.checkIn = "Check-in date is required.";
        }

        if (!checkOut) {
            nextErrors.checkOut = "Check-out date is required.";
        }

        if (checkIn) {
            const checkInDate = new Date(checkIn);
            if (checkInDate < now) {
                nextErrors.checkIn = "Check-in date must be today or later.";
            }
        }

        if (checkIn && checkOut) {
            const checkInDate = new Date(checkIn);
            const checkOutDate = new Date(checkOut);
            if (checkOutDate <= checkInDate) {
                nextErrors.checkOut = "Check-out must be after check-in.";
            }
        }

        if (!Number.isInteger(guests) || guests < 1) {
            nextErrors.guests = "Guests must be at least 1.";
        }

        if (!Number.isInteger(rooms) || rooms < 1) {
            nextErrors.rooms = "Rooms must be at least 1.";
        } else if (rooms > guests) {
            nextErrors.rooms = "Rooms cannot exceed guest count.";
        }

        return nextErrors;
    };

    const runSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextErrors = validate();
        setErrors(nextErrors);
        setMessage(null);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        setLoading(true);
        setHasSearched(true);

        try {
            const response = await fetch("/api/hotels/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    destination: destination.trim(),
                    check_in: checkIn,
                    check_out: checkOut,
                    guests,
                    rooms,
                    sort_by: sortBy,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const detail = String(data.detail || "");
                if (response.status === 503 || detail.toLowerCase().includes("service unavailable")) {
                    setMessage("Service unavailable. Please try again in a few minutes.");
                    setHotels([]);
                    return;
                }
                throw new Error(detail || "Failed to search hotels.");
            }

            const data: HotelSearchResponse = await response.json();
            setHotels(data.results || []);
            setMessage(data.message || null);
        } catch (err) {
            const text = err instanceof Error ? err.message : "Failed to search hotels.";
            setMessage(text);
            setHotels([]);
        } finally {
            setLoading(false);
        }
    };

    const getCardImage = (hotel: HotelOption): string => {
        if (hotel.photo_reference) {
            return `/api/destinations/image?photo_reference=${encodeURIComponent(hotel.photo_reference)}&width=800&height=600`;
        }
        if (hotel.photo_url) {
            return hotel.photo_url;
        }
        return "https://via.placeholder.com/800x600?text=Hotel";
    };

    return (
        <section className="hotel-search-shell">
            <div className="hotel-search-header">
                <h2>{title}</h2>
                <p>{subtitle}</p>
            </div>

            <form className="hotel-search-form" onSubmit={runSearch} noValidate>
                <div className="hotel-field hotel-field-wide">
                    <label htmlFor="hotel-destination">Destination</label>
                    <input
                        id="hotel-destination"
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="e.g. Paris"
                    />
                    {errors.destination && <span className="hotel-field-error">{errors.destination}</span>}
                </div>

                <div className="hotel-field">
                    <label htmlFor="hotel-checkin">Check-in</label>
                    <input
                        id="hotel-checkin"
                        type="date"
                        min={todayISO()}
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                    />
                    {errors.checkIn && <span className="hotel-field-error">{errors.checkIn}</span>}
                </div>

                <div className="hotel-field">
                    <label htmlFor="hotel-checkout">Check-out</label>
                    <input
                        id="hotel-checkout"
                        type="date"
                        min={minCheckOut}
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                    />
                    {errors.checkOut && <span className="hotel-field-error">{errors.checkOut}</span>}
                </div>

                <div className="hotel-field">
                    <label htmlFor="hotel-guests">Guests</label>
                    <input
                        id="hotel-guests"
                        type="number"
                        min={1}
                        max={20}
                        value={guests}
                        onChange={(e) => setGuests(Number(e.target.value))}
                    />
                    {errors.guests && <span className="hotel-field-error">{errors.guests}</span>}
                </div>

                <div className="hotel-field">
                    <label htmlFor="hotel-rooms">Rooms</label>
                    <input
                        id="hotel-rooms"
                        type="number"
                        min={1}
                        max={10}
                        value={rooms}
                        onChange={(e) => setRooms(Number(e.target.value))}
                    />
                    {errors.rooms && <span className="hotel-field-error">{errors.rooms}</span>}
                </div>

                <div className="hotel-field">
                    <label htmlFor="hotel-sort">Sort by</label>
                    <select
                        id="hotel-sort"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortMode)}
                    >
                        <option value="relevance">Relevance</option>
                        <option value="rating_desc">Highest Rating</option>
                        <option value="reviews_desc">Most Reviewed</option>
                    </select>
                </div>

                <button type="submit" className="hotel-submit-btn" disabled={loading}>
                    {loading ? "Searching..." : "Search Hotels"}
                </button>
            </form>

            {message && <div className="hotel-search-message">{message}</div>}

            {!loading && hasSearched && hotels.length === 0 && !message && (
                <div className="hotel-search-empty">No hotels found for that search.</div>
            )}

            {hotels.length > 0 && (
                <div className="hotel-results-grid">
                    {hotels.map((hotel) => {
                        const isExpanded = expandedHotelId === hotel.place_id;
                        return (
                            <article className="hotel-card" key={hotel.place_id}>
                                <img src={getCardImage(hotel)} alt={hotel.name} className="hotel-card-image" />
                                <div className="hotel-card-body">
                                    <h3>{hotel.name}</h3>
                                    {hotel.address && <p>{hotel.address}</p>}
                                    <div className="hotel-card-meta">
                                        <span>{hotel.rating ? `⭐ ${hotel.rating.toFixed(1)}` : "No rating"}</span>
                                        <span>{hotel.user_ratings_total ? `${hotel.user_ratings_total.toLocaleString()} reviews` : "No reviews"}</span>
                                        <span>{hotel.price_level || "Price N/A"}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="hotel-details-btn"
                                        onClick={() => setExpandedHotelId(isExpanded ? null : hotel.place_id)}
                                    >
                                        {isExpanded ? "Hide Details" : "View Details"}
                                    </button>
                                    {isExpanded && (
                                        <div className="hotel-detail-panel">
                                            {hotel.types?.length > 0 && (
                                                <div className="hotel-tags-row">
                                                    {hotel.types.slice(0, 4).map((type) => (
                                                        <span key={`${hotel.place_id}_${type}`} className="hotel-type-tag">
                                                            {type.replaceAll("_", " ")}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {hotel.website && (
                                                <a href={hotel.website} target="_blank" rel="noreferrer">
                                                    Hotel Website
                                                </a>
                                            )}
                                            {hotel.google_maps_url && (
                                                <a href={hotel.google_maps_url} target="_blank" rel="noreferrer">
                                                    Open in Google Maps
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
