"use client";

import React, { useEffect, useMemo, useState } from "react";
import "./HotelSearchPanel.css";
import HotelLocationMap from "./HotelLocationMap";

type HotelOption = {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: string;
    currency?: string;
    price_per_night?: number;
    total_price?: number;
    nights?: number;
    types: string[];
    amenities?: string[];
    photo_url?: string;
    photo_reference?: string;
    location?: { lat: number | null; lng: number | null };
    business_status?: string;
    website?: string;
    google_maps_url?: string;
    booking_url?: string;
};

type HotelSearchResponse = {
    status: "success" | "error";
    results: HotelOption[];
    message?: string;
};

type DisplaySortMode =
    | "relevance"
    | "price_low_to_high"
    | "price_high_to_low"
    | "rating_high_to_low"
    | "distance_nearest";

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
    const [displaySort, setDisplaySort] = useState<DisplaySortMode>("relevance");
    const [budgetMax, setBudgetMax] = useState(500);
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
    const [selectedHotelTypes, setSelectedHotelTypes] = useState<string[]>([]);

    const [errors, setErrors] = useState<FormErrors>({});
    const [hotels, setHotels] = useState<HotelOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [selectedHotel, setSelectedHotel] = useState<HotelOption | null>(null);
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

    const priceValues = useMemo(
        () => hotels.map((h) => h.price_per_night).filter((p): p is number => typeof p === "number"),
        [hotels]
    );

    const absoluteMaxPrice = useMemo(() => {
        if (priceValues.length === 0) return 500;
        return Math.ceil(Math.max(...priceValues));
    }, [priceValues]);

    const availableAmenities = useMemo(() => {
        const set = new Set<string>();
        hotels.forEach((hotel) => (hotel.amenities || []).forEach((amenity) => set.add(amenity)));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [hotels]);

    const availableHotelTypes = useMemo(() => {
        const set = new Set<string>();
        hotels.forEach((hotel) => {
            (hotel.types || []).forEach((type) => {
                if (["lodging", "hotel", "resort", "inn", "hostel"].includes(type)) {
                    set.add(type);
                }
            });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [hotels]);

    const centerPoint = useMemo(() => {
        const points = hotels.filter(
            (h) => h.location?.lat != null && h.location?.lng != null
        );
        if (points.length === 0) return null;
        const lat = points.reduce((sum, h) => sum + (h.location?.lat || 0), 0) / points.length;
        const lng = points.reduce((sum, h) => sum + (h.location?.lng || 0), 0) / points.length;
        return { lat, lng };
    }, [hotels]);

    const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const visibleHotels = useMemo(() => {
        let list = hotels.filter((hotel) => {
            const perNight = hotel.price_per_night;
            if (typeof perNight === "number" && perNight > budgetMax) {
                return false;
            }

            if (selectedAmenities.length > 0) {
                const hotelAmenities = hotel.amenities || [];
                const hasAll = selectedAmenities.every((amenity) => hotelAmenities.includes(amenity));
                if (!hasAll) return false;
            }

            if (selectedHotelTypes.length > 0) {
                const hotelTypes = hotel.types || [];
                const hasAnyType = selectedHotelTypes.some((type) => hotelTypes.includes(type));
                if (!hasAnyType) return false;
            }

            return true;
        });

        const withDistance = list.map((hotel) => {
            if (!centerPoint || hotel.location?.lat == null || hotel.location?.lng == null) {
                return { ...hotel, distance_km: null as number | null };
            }
            return {
                ...hotel,
                distance_km: haversineKm(centerPoint.lat, centerPoint.lng, hotel.location.lat, hotel.location.lng),
            };
        });

        if (displaySort === "price_low_to_high") {
            withDistance.sort((a, b) => (a.price_per_night || Number.MAX_SAFE_INTEGER) - (b.price_per_night || Number.MAX_SAFE_INTEGER));
        } else if (displaySort === "price_high_to_low") {
            withDistance.sort((a, b) => (b.price_per_night || 0) - (a.price_per_night || 0));
        } else if (displaySort === "rating_high_to_low") {
            withDistance.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else if (displaySort === "distance_nearest") {
            withDistance.sort((a, b) => {
                const ad = typeof a.distance_km === "number" ? a.distance_km : Number.MAX_SAFE_INTEGER;
                const bd = typeof b.distance_km === "number" ? b.distance_km : Number.MAX_SAFE_INTEGER;
                return ad - bd;
            });
        }

        return withDistance;
    }, [hotels, budgetMax, selectedAmenities, selectedHotelTypes, displaySort, centerPoint]);

    useEffect(() => {
        setBudgetMax(absoluteMaxPrice);
        setSelectedAmenities([]);
        setSelectedHotelTypes([]);
        setDisplaySort("relevance");
    }, [absoluteMaxPrice]);

    useEffect(() => {
        if (selectedHotel && !visibleHotels.some((h) => h.place_id === selectedHotel.place_id)) {
            setSelectedHotel(null);
        }
    }, [visibleHotels, selectedHotel]);

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
                    sort_by: "relevance",
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

    const currencyFormatter = (value?: number, currencyCode = "USD") => {
        if (typeof value !== "number") return "N/A";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currencyCode,
            maximumFractionDigits: 2,
        }).format(value);
    };

    const closeModal = () => setSelectedHotel(null);

    const toggleAmenity = (amenity: string) => {
        setSelectedAmenities((prev) =>
            prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
        );
    };

    const toggleHotelType = (hotelType: string) => {
        setSelectedHotelTypes((prev) =>
            prev.includes(hotelType) ? prev.filter((t) => t !== hotelType) : [...prev, hotelType]
        );
    };

    const clearFilters = () => {
        setBudgetMax(absoluteMaxPrice);
        setSelectedAmenities([]);
        setSelectedHotelTypes([]);
        setDisplaySort("relevance");
    };

    const formatTypeLabel = (value: string) =>
        value
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");

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

                <button type="submit" className="hotel-submit-btn" disabled={loading}>
                    {loading ? "Searching..." : "Search Hotels"}
                </button>
            </form>

            {message && <div className="hotel-search-message">{message}</div>}

            {!loading && hasSearched && hotels.length === 0 && !message && (
                <div className="hotel-search-empty">No hotels found for that search.</div>
            )}

            {hotels.length > 0 && (
                <div className="hotel-filter-panel">
                    <div className="hotel-filter-item hotel-budget-filter">
                        <label htmlFor="hotel-budget">
                            Max Budget Per Night: <strong>{currencyFormatter(budgetMax, "USD")}</strong>
                        </label>
                        <input
                            id="hotel-budget"
                            type="range"
                            min={0}
                            max={absoluteMaxPrice}
                            value={budgetMax}
                            onChange={(e) => setBudgetMax(Number(e.target.value))}
                        />
                    </div>

                    <div className="hotel-filter-item">
                        <label htmlFor="hotel-display-sort">Sort</label>
                        <select
                            id="hotel-display-sort"
                            value={displaySort}
                            onChange={(e) => setDisplaySort(e.target.value as DisplaySortMode)}
                        >
                            <option value="relevance">Relevance</option>
                            <option value="price_low_to_high">Price: Low to High</option>
                            <option value="price_high_to_low">Price: High to Low</option>
                            <option value="rating_high_to_low">Rating: High to Low</option>
                            <option value="distance_nearest">Distance: Nearest First</option>
                        </select>
                    </div>

                    {availableHotelTypes.length > 0 && (
                        <div className="hotel-filter-item hotel-checkbox-filter">
                            <p>Hotel Type</p>
                            <div className="hotel-checkbox-grid">
                                {availableHotelTypes.map((hotelType) => (
                                    <label key={hotelType} className="hotel-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedHotelTypes.includes(hotelType)}
                                            onChange={() => toggleHotelType(hotelType)}
                                        />
                                        {formatTypeLabel(hotelType)}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {availableAmenities.length > 0 && (
                        <div className="hotel-filter-item hotel-checkbox-filter">
                            <p>Amenities (must include all selected)</p>
                            <div className="hotel-checkbox-grid">
                                {availableAmenities.map((amenity) => (
                                    <label key={amenity} className="hotel-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedAmenities.includes(amenity)}
                                            onChange={() => toggleAmenity(amenity)}
                                        />
                                        {amenity}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {hotels.length > 0 && visibleHotels.length === 0 && !loading && (
                <div className="hotel-filter-empty">
                    <p>No hotels match your current filters.</p>
                    <button type="button" className="hotel-clear-btn" onClick={clearFilters}>
                        Clear Filters
                    </button>
                </div>
            )}

            {visibleHotels.length > 0 && (
                <div className="hotel-results-grid">
                    {visibleHotels.map((hotel) => {
                        return (
                            <article
                                className="hotel-card"
                                key={hotel.place_id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedHotel(hotel)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSelectedHotel(hotel);
                                    }
                                }}
                            >
                                <img src={getCardImage(hotel)} alt={hotel.name} className="hotel-card-image" />
                                <div className="hotel-card-body">
                                    <h3>{hotel.name}</h3>
                                    {hotel.address && <p>{hotel.address}</p>}
                                    <div className="hotel-card-meta">
                                        <span>{hotel.rating ? `⭐ ${hotel.rating.toFixed(1)}` : "No rating"}</span>
                                        <span>{hotel.user_ratings_total ? `${hotel.user_ratings_total.toLocaleString()} reviews` : "No reviews"}</span>
                                        {typeof hotel.distance_km === "number" && <span>{hotel.distance_km.toFixed(1)} km from center</span>}
                                    </div>
                                    <div className="hotel-price-block">
                                        <div className="hotel-per-night-line">
                                            <strong>{currencyFormatter(hotel.price_per_night, hotel.currency || "USD")}</strong>
                                            <span>per night</span>
                                        </div>
                                        <div className="hotel-total-line">
                                            Total for {hotel.nights || 1} night{(hotel.nights || 1) > 1 ? "s" : ""}: {currencyFormatter(hotel.total_price, hotel.currency || "USD")}
                                        </div>
                                    </div>
                                    <button type="button" className="hotel-details-btn">View Details</button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {selectedHotel && (
                <div className="hotel-modal-backdrop" onClick={closeModal}>
                    <div className="hotel-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                        <button type="button" className="hotel-modal-close" onClick={closeModal} aria-label="Close hotel details">
                            x
                        </button>
                        <div className="hotel-modal-layout">
                            <div className="hotel-modal-content">
                                <h3>{selectedHotel.name}</h3>
                                {selectedHotel.address && <p className="hotel-modal-address">{selectedHotel.address}</p>}
                                <div className="hotel-price-block hotel-price-block-modal">
                                    <div className="hotel-per-night-line">
                                        <strong>{currencyFormatter(selectedHotel.price_per_night, selectedHotel.currency || "USD")}</strong>
                                        <span>per night</span>
                                    </div>
                                    <div className="hotel-total-line">
                                        Total for {selectedHotel.nights || 1} night{(selectedHotel.nights || 1) > 1 ? "s" : ""}: {currencyFormatter(selectedHotel.total_price, selectedHotel.currency || "USD")}
                                    </div>
                                </div>
                                <div className="hotel-card-meta">
                                    <span>{selectedHotel.rating ? `⭐ ${selectedHotel.rating.toFixed(1)}` : "No rating"}</span>
                                    <span>{selectedHotel.price_level || "Price level N/A"}</span>
                                </div>

                                <h4>Amenities</h4>
                                <div className="hotel-tags-row">
                                    {(selectedHotel.amenities || []).length > 0 ? (
                                        (selectedHotel.amenities || []).map((amenity) => (
                                            <span key={`${selectedHotel.place_id}_${amenity}`} className="hotel-type-tag">{amenity}</span>
                                        ))
                                    ) : (
                                        <span className="hotel-type-tag">Amenities unavailable</span>
                                    )}
                                </div>

                                <div className="hotel-links-row">
                                    {selectedHotel.booking_url && (
                                        <a href={selectedHotel.booking_url} target="_blank" rel="noreferrer">
                                            Book This Hotel
                                        </a>
                                    )}
                                    {selectedHotel.website && (
                                        <a href={selectedHotel.website} target="_blank" rel="noreferrer">
                                            Hotel Website
                                        </a>
                                    )}
                                    {selectedHotel.google_maps_url && (
                                        <a href={selectedHotel.google_maps_url} target="_blank" rel="noreferrer">
                                            Open in Google Maps
                                        </a>
                                    )}
                                </div>
                            </div>

                            <div className="hotel-modal-map-wrap">
                                {selectedHotel.location?.lat != null && selectedHotel.location?.lng != null ? (
                                    <HotelLocationMap
                                        hotelName={selectedHotel.name}
                                        lat={selectedHotel.location.lat}
                                        lng={selectedHotel.location.lng}
                                    />
                                ) : (
                                    <div className="hotel-map-fallback">Map unavailable for this hotel.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
