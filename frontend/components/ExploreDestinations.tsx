"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import "./ExploreDestinations.css";

// Types for destination data
interface DestinationLocation {
    lat: number | null;
    lng: number | null;
}

interface Destination {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    types: string[];
    photo_url?: string;
    photo_reference?: string;
    location?: DestinationLocation;
    business_status?: string;
}

interface SearchResponse {
    status: string;
    results: Destination[];
    message?: string;
    cached?: boolean;
    dummy?: boolean;
}

// Helper function to get the image URL (using proxy for Safari compatibility)
const getImageUrl = (destination: Destination): string => {
    // Use proxy endpoint if photo_reference is available
    if (destination.photo_reference) {
        return `/api/destinations/image?photo_reference=${encodeURIComponent(destination.photo_reference)}&width=800&height=600`;
    }
    // Fallback to direct photo_url if available
    if (destination.photo_url) {
        return destination.photo_url;
    }
    // Return placeholder
    return "https://via.placeholder.com/400x300?text=No+Image";
};

export default function ExploreDestinations() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // Debounce search to avoid too many API calls
    const [debouncedQuery, setDebouncedQuery] = useState("");

    // Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [minRating, setMinRating] = useState<number | null>(null);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [filtersApplied, setFiltersApplied] = useState(false);

    // Common place types for filter options
    const placeTypeOptions = [
        { label: "Tourist Attraction", value: "tourist_attraction" },
        { label: "Museum", value: "museum" },
        { label: "Restaurant", value: "restaurant" },
        { label: "Hotel", value: "lodging" },
        { label: "Shopping", value: "shopping_mall" },
        { label: "Park", value: "park" },
    ];

    const handleDestinationClick = (destination: Destination) => {
        // Save destination data to sessionStorage
        if (typeof window !== "undefined") {
            sessionStorage.setItem(
                `destination_${destination.place_id}`,
                JSON.stringify(destination)
            );
        }
        // Navigate to destination details page
        router.push(`/destination/${destination.place_id}`);
    };

    // Check for query parameter on mount
    useEffect(() => {
        const queryParam = searchParams.get("query");
        if (queryParam) {
            setSearchQuery(queryParam);
            setDebouncedQuery(queryParam);
        } else {
            // Load popular destinations by default
            loadDefaultDestinations();
        }
    }, [searchParams]);

    const loadDefaultDestinations = useCallback(async () => {
        setLoading(true);
        try {
            const popularPlaces = ["Paris", "Tokyo", "Bali", "London", "Goa", "Barcelona"];
            const allResults: Destination[] = [];

            // Fetch results for each popular place
            for (const place of popularPlaces) {
                const response = await fetch(
                    `/api/destinations/search?query=${encodeURIComponent(place)}`,
                    { method: "GET", headers: { "Content-Type": "application/json" } }
                );
                if (response.ok) {
                    const data: SearchResponse = await response.json();
                    if (data.results && data.results.length > 0) {
                        allResults.push(data.results[0]);
                    }
                }
            }

            setDestinations(allResults);
            setHasSearched(true);
        } catch (err) {
            console.error("Error loading default destinations:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const performSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            setDestinations([]);
            setError(null);
            setHasSearched(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `/api/destinations/search?query=${encodeURIComponent(query)}`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.detail || `Search failed with status ${response.status}`
                );
            }

            const data: SearchResponse = await response.json();

            if (data.status === "error") {
                throw new Error(data.message || "Search failed");
            }

            setDestinations(data.results);
            setHasSearched(true);
        } catch (err: any) {
            console.error("Search error:", err);
            setError(
                err.message ||
                "Failed to search destinations. Please check your connection and try again."
            );
            setDestinations([]);
            setHasSearched(true);
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-search when debounced query changes
    useEffect(() => {
        if (debouncedQuery) {
            performSearch(debouncedQuery);
        }
    }, [debouncedQuery, performSearch]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(searchQuery);
    };

    const applyFilters = async () => {
        setLoading(true);
        setError(null);

        try {
            let queryString = searchQuery.trim();

            // If there's no search query, get user's location
            if (!queryString) {
                setError(null);

                // Get user's geolocation
                const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
                    if (!navigator.geolocation) {
                        setError("Geolocation is not supported by your browser");
                        resolve(null);
                        return;
                    }

                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            resolve({
                                lat: position.coords.latitude,
                                lng: position.coords.longitude,
                            });
                        },
                        (err) => {
                            console.error("Geolocation error:", err);
                            setError("Could not access your location. Please search for a destination instead.");
                            resolve(null);
                        },
                        { timeout: 5000 }
                    );
                });

                if (!coords) {
                    setLoading(false);
                    return;
                }

                // Use coordinates as query for nearby destinations
                queryString = `${coords.lat},${coords.lng}`;
            }

            // Build query params
            const params = new URLSearchParams();
            params.append("query", queryString);

            if (minRating) {
                params.append("min_rating", minRating.toString());
            }

            if (selectedTypes.length > 0) {
                params.append("types", selectedTypes.join(","));
            }

            const response = await fetch(
                `/api/destinations/filter?${params.toString()}`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.detail || `Filter failed with status ${response.status}`
                );
            }

            const data: SearchResponse = await response.json();

            if (data.status === "error") {
                throw new Error(data.message || "Filter failed");
            }

            setDestinations(data.results);
            setFiltersApplied(true);
            setShowFilters(false);

            if (data.results.length === 0) {
                setError("No matching destinations found");
            }
        } catch (err: any) {
            console.error("Filter error:", err);
            setError(
                err.message ||
                "Failed to apply filters. Please try again."
            );
            setDestinations([]);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setMinRating(null);
        setSelectedTypes([]);
        setFiltersApplied(false);
        setShowFilters(false);
        performSearch(searchQuery);
    };

    const handleTypeChange = (type: string) => {
        setSelectedTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
    };

    const formatRating = (rating?: number, total?: number) => {
        if (!rating) return null;
        return (
            <div className="destination-rating">
                <span className="rating-stars">⭐ {rating.toFixed(1)}</span>
                {total && <span className="rating-count">({total.toLocaleString()})</span>}
            </div>
        );
    };

    const formatTypes = (types: string[]) => {
        if (!types || types.length === 0) return null;
        // Show first 2 types, formatted nicely
        const displayTypes = types.slice(0, 2).map((type) =>
            type
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ")
        );
        return (
            <div className="destination-types">
                {displayTypes.map((type, idx) => (
                    <span key={idx} className="type-badge">
                        {type}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div className="explore-container">
            <div className="explore-header">
                <h1 className="explore-title">Explore Destinations</h1>
                <p className="explore-subtitle">
                    Discover amazing places for your solo or group trips
                </p>
            </div>

            {error && (
                <div className="error-message">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {loading && (
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">Searching for destinations...</p>
                </div>
            )}

            {/* Filter Panel - Only show after search */}
            {hasSearched && !loading && destinations.length > 0 && (
                <div className="filter-panel">
                    <button
                        className="filter-toggle-btn"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        {showFilters ? "▼ Hide Filters" : "▶ Show Filters"}
                    </button>

                    {showFilters && (
                        <div className="filter-options">
                            {/* Rating Filter */}
                            <div className="filter-group">
                                <label>Minimum Rating</label>
                                <select
                                    value={minRating ?? ""}
                                    onChange={(e) => setMinRating(e.target.value ? parseFloat(e.target.value) : null)}
                                    className="filter-select"
                                >
                                    <option value="">Any Rating</option>
                                    <option value="3">3★ and up</option>
                                    <option value="3.5">3.5★ and up</option>
                                    <option value="4">4★ and up</option>
                                    <option value="4.5">4.5★ and up</option>
                                </select>
                            </div>

                            {/* Types Filter */}
                            <div className="filter-group">
                                <label>Place Types</label>
                                <div className="filter-checkboxes">
                                    {placeTypeOptions.map((option) => (
                                        <label key={option.value} className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={selectedTypes.includes(option.value)}
                                                onChange={() => handleTypeChange(option.value)}
                                                className="filter-checkbox"
                                            />
                                            {option.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="filter-actions">
                                <button
                                    className="btn btn-apply-filter"
                                    onClick={applyFilters}
                                    disabled={loading}
                                >
                                    Apply Filters
                                </button>
                                {filtersApplied && (
                                    <button
                                        className="btn btn-clear-filter"
                                        onClick={clearFilters}
                                        disabled={loading}
                                    >
                                        Clear Filters
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!loading && hasSearched && destinations.length === 0 && !error && (
                <div className="no-results">
                    <div className="no-results-icon">🔍</div>
                    <h3>No destinations found</h3>
                    <p>Try a different search term or check your spelling</p>
                </div>
            )}

            {!loading && destinations.length > 0 && (
                <div className="results-container">
                    <div className="results-header">
                        <h2>
                            {searchQuery
                                ? `Found ${destinations.length} destination${destinations.length !== 1 ? "s" : ""}`
                                : "Popular Destinations"}
                        </h2>
                    </div>
                    <div className="destinations-grid">
                        {destinations.map((destination) => (
                            <div
                                key={destination.place_id}
                                className="destination-card"
                                onClick={() => handleDestinationClick(destination)}
                            >
                                <div className="destination-image">
                                    {destination.photo_url || destination.photo_reference ? (
                                        <img
                                            src={getImageUrl(destination)}
                                            alt={destination.name}
                                            onError={(e) => {
                                                e.currentTarget.src =
                                                    "https://via.placeholder.com/400x300?text=No+Image";
                                            }}
                                        />
                                    ) : (
                                        <div className="placeholder-image">
                                            <span>📍</span>
                                        </div>
                                    )}
                                </div>
                                <div className="destination-content">
                                    <h3 className="destination-name">{destination.name}</h3>
                                    {destination.address && (
                                        <p className="destination-address">
                                            📍 {destination.address}
                                        </p>
                                    )}
                                    {formatRating(
                                        destination.rating,
                                        destination.user_ratings_total
                                    )}
                                    {formatTypes(destination.types)}
                                    {destination.business_status === "CLOSED_PERMANENTLY" && (
                                        <span className="status-badge closed">
                                            Permanently Closed
                                        </span>
                                    )}
                                    {destination.business_status === "CLOSED_TEMPORARILY" && (
                                        <span className="status-badge temp-closed">
                                            Temporarily Closed
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}


        </div>
    );
}
