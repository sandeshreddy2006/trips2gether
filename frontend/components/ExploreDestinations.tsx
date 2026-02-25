"use client";

import React, { useState, useEffect, useCallback } from "react";
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

export default function ExploreDestinations() {
    const [searchQuery, setSearchQuery] = useState("");
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [cacheInfo, setCacheInfo] = useState<string | null>(null);

    // Debounce search to avoid too many API calls
    const [debouncedQuery, setDebouncedQuery] = useState("");

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
            setCacheInfo(null);
            return;
        }

        setLoading(true);
        setError(null);
        setCacheInfo(null);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await fetch(
                `${apiUrl}/destinations/search?query=${encodeURIComponent(query)}`,
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

            // Show cache/dummy info
            if (data.cached) {
                setCacheInfo("Results loaded from cache ⚡");
            } else if (data.dummy) {
                setCacheInfo("⚠️ Using demo data (Google Places API key not configured)");
            }
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

            <form onSubmit={handleSearchSubmit} className="search-form">
                <div className="search-input-wrapper">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search for destinations (e.g., Paris, Tokyo, beaches in Bali)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        className="search-button"
                        disabled={loading || !searchQuery.trim()}
                    >
                        {loading ? "Searching..." : "Search"}
                    </button>
                </div>
            </form>

            {cacheInfo && (
                <div className="cache-info">
                    <span>{cacheInfo}</span>
                </div>
            )}

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
                            Found {destinations.length} destination
                            {destinations.length !== 1 ? "s" : ""}
                        </h2>
                    </div>
                    <div className="destinations-grid">
                        {destinations.map((destination) => (
                            <div key={destination.place_id} className="destination-card">
                                <div className="destination-image">
                                    {destination.photo_url ? (
                                        <img
                                            src={destination.photo_url}
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

            {!loading && !hasSearched && (
                <div className="initial-state">
                    <div className="initial-icon">🌍</div>
                    <h3>Start your adventure</h3>
                    <p>
                        Enter a destination name or type of place to discover amazing
                        locations
                    </p>
                    <div className="search-examples">
                        <p>Try searching for:</p>
                        <div className="example-tags">
                            <button
                                className="example-tag"
                                onClick={() => setSearchQuery("Paris")}
                            >
                                Paris
                            </button>
                            <button
                                className="example-tag"
                                onClick={() => setSearchQuery("Tokyo")}
                            >
                                Tokyo
                            </button>
                            <button
                                className="example-tag"
                                onClick={() => setSearchQuery("beaches in Bali")}
                            >
                                Beaches in Bali
                            </button>
                            <button
                                className="example-tag"
                                onClick={() => setSearchQuery("London")}
                            >
                                London
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
