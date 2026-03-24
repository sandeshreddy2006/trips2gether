"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import "./destination.css";

interface Destination {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    types: string[];
    photo_url?: string;
    photo_reference?: string;
    location?: { lat: number | null; lng: number | null };
    business_status?: string;
}

interface NearbyRestaurant {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: string;
    distance_km?: number;
    distance_text?: string;
    location?: { lat: number | null; lng: number | null };
    photo_url?: string;
    photo_reference?: string;
}

interface ThingToDo {
    id: string;
    name: string;
    rating: number;
    distance: string;
    image: string;
    category: string;
}

// Hardcoded things to do for different destinations
const THINGS_BY_DESTINATION: { [key: string]: ThingToDo[] } = {
    prague: [
        { id: "1", name: "Prague Castle", rating: 4.7, distance: "2.5 km", image: "/placeholder-prague-castle.jpg", category: "Historical" },
        { id: "2", name: "Charles Bridge", rating: 4.6, distance: "0.8 km", image: "/placeholder-charles-bridge.jpg", category: "Monument" },
        { id: "3", name: "Old Town Square", rating: 4.5, distance: "1.2 km", image: "/placeholder-old-town.jpg", category: "Landmark" },
    ],
    paris: [
        { id: "1", name: "Eiffel Tower", rating: 4.8, distance: "2.1 km", image: "/placeholder-eiffel.jpg", category: "Monument" },
        { id: "2", name: "Louvre Museum", rating: 4.7, distance: "3.5 km", image: "/placeholder-louvre.jpg", category: "Museum" },
        { id: "3", name: "Arc de Triomphe", rating: 4.6, distance: "1.8 km", image: "/placeholder-arc.jpg", category: "Landmark" },
    ],
    tokyo: [
        { id: "1", name: "Senso-ji Temple", rating: 4.6, distance: "1.2 km", image: "/placeholder-senso.jpg", category: "Temple" },
        { id: "2", name: "Meiji Shrine", rating: 4.5, distance: "2.0 km", image: "/placeholder-meiji.jpg", category: "Shrine" },
        { id: "3", name: "Tokyo Tower", rating: 4.4, distance: "3.8 km", image: "/placeholder-tower.jpg", category: "Landmark" },
    ],
    london: [
        { id: "1", name: "Big Ben & Parliament", rating: 4.7, distance: "1.5 km", image: "/placeholder-bigben.jpg", category: "Landmark" },
        { id: "2", name: "Tower of London", rating: 4.6, distance: "2.2 km", image: "/placeholder-tower-london.jpg", category: "Historical" },
        { id: "3", name: "Buckingham Palace", rating: 4.4, distance: "1.0 km", image: "/placeholder-buckingham.jpg", category: "Royal" },
    ],
    bali: [
        { id: "1", name: "Ubud Temple", rating: 4.5, distance: "1.8 km", image: "/placeholder-ubud.jpg", category: "Temple" },
        { id: "2", name: "Rice Terraces", rating: 4.6, distance: "2.5 km", image: "/placeholder-rice.jpg", category: "Nature" },
        { id: "3", name: "Monkey Forest Sanctuary", rating: 4.4, distance: "0.5 km", image: "/placeholder-monkeys.jpg", category: "Wildlife" },
    ],
};

export default function DestinationDetail() {
    const params = useParams();
    const router = useRouter();
    const [destination, setDestination] = useState<Destination | null>(null);
    const [thingsToDo, setThingsToDo] = useState<ThingToDo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("overview");

    const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(false);
    const [restaurantsError, setRestaurantsError] = useState<string | null>(null);
    const [restaurantRadius, setRestaurantRadius] = useState(1500);
    const [restaurantsFetched, setRestaurantsFetched] = useState(false);

    const placeId = params.id as string;

    useEffect(() => {
        // Retrieve destination data from sessionStorage
        if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem(`destination_${placeId}`);
            if (stored) {
                try {
                    const dest = JSON.parse(stored);
                    setDestination(dest);

                    // Get things to do based on destination name
                    const destKey = dest.name.toLowerCase();
                    const activities = Object.keys(THINGS_BY_DESTINATION).find(
                        key => destKey.includes(key) || key.includes(destKey.split(" ")[0])
                    );
                    if (activities) {
                        setThingsToDo(THINGS_BY_DESTINATION[activities]);
                    }
                } catch (err) {
                    console.error("Failed to parse stored destination:", err);
                }
            } else {
                setError("Destination not found. Please search again.");
            }
            setLoading(false);
        }
    }, [placeId]);

    const fetchRestaurants = async (lat: number, lng: number, radius: number) => {
        setRestaurantsLoading(true);
        setRestaurantsError(null);
        try {
            const res = await fetch(
                `/api/restaurants/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.detail || `Server error (${res.status})`);
            }
            const data = await res.json();
            setRestaurants(data.results || []);
            setRestaurantsFetched(true);
        } catch (err: any) {
            setRestaurantsError(err.message || "Failed to load restaurants");
        } finally {
            setRestaurantsLoading(false);
        }
    };

    useEffect(() => {
        if (
            activeTab === "restaurants" &&
            !restaurantsFetched &&
            !restaurantsLoading &&
            destination?.location?.lat != null &&
            destination?.location?.lng != null
        ) {
            fetchRestaurants(destination.location.lat, destination.location.lng, restaurantRadius);
        }
    }, [activeTab, restaurantsFetched, restaurantsLoading, destination, restaurantRadius]);

    const getRestaurantImageUrl = (r: NearbyRestaurant): string => {
        if (r.photo_reference) {
            return `/api/destinations/image?photo_reference=${encodeURIComponent(r.photo_reference)}&width=400&height=300`;
        }
        if (r.photo_url) return r.photo_url;
        return "https://via.placeholder.com/400x300?text=" + encodeURIComponent(r.name);
    };

    const getImageUrl = (dest: Destination): string => {
        if (dest.photo_reference) {
            return `/api/destinations/image?photo_reference=${encodeURIComponent(dest.photo_reference)}&width=1500&height=600`;
        }
        if (dest.photo_url) {
            return dest.photo_url;
        }
        return "https://via.placeholder.com/1500x600?text=" + encodeURIComponent(dest.name);
    };

    const formatTypes = (types: string[]) => {
        return types
            .slice(0, 4)
            .map((type) =>
                type
                    .split("_")
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ")
            );
    };

    if (loading) {
        return (
            <div className="destination-detail-container">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (error || !destination) {
        return (
            <div className="destination-detail-container">
                <div className="error-container">
                    <h2>Oops!</h2>
                    <p>{error || "Destination not found"}</p>
                    <button className="back-button" onClick={() => router.back()}>
                        ← Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="destination-detail-container">
            {/* Hero Section */}
            <div className="hero-section">
                <img
                    src={getImageUrl(destination)}
                    alt={destination.name}
                    className="hero-image"
                    onError={(e) => {
                        e.currentTarget.src = "https://via.placeholder.com/1500x600?text=" + encodeURIComponent(destination.name);
                    }}
                />
                <button className="back-button-hero" onClick={() => router.back()}>
                    ← Back
                </button>
                <div className="hero-overlay">
                    <div className="hero-content">
                        <h1 className="hero-title">{destination.name}</h1>
                        {destination.rating && (
                            <div className="hero-rating">
                                <span className="rating-stars">★ {destination.rating.toFixed(1)}</span>
                                {destination.user_ratings_total && (
                                    <span className="rating-count">({destination.user_ratings_total.toLocaleString()} reviews)</span>
                                )}
                            </div>
                        )}
                        {destination.types.length > 0 && (
                            <div className="hero-categories">
                                {formatTypes(destination.types).map((type, idx) => (
                                    <span key={idx} className="category-tag">{type}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="detail-wrapper">
                <div className="detail-main">
                    {/* Tabs */}
                    <div className="tabs">
                        <button
                            className={`tab ${activeTab === "overview" ? "active" : ""}`}
                            onClick={() => setActiveTab("overview")}
                        >
                            Overview
                        </button>
                        {thingsToDo.length > 0 && (
                            <button
                                className={`tab ${activeTab === "things" ? "active" : ""}`}
                                onClick={() => setActiveTab("things")}
                            >
                                Things to Do
                            </button>
                        )}
                        {destination.location?.lat != null && destination.location?.lng != null && (
                            <button
                                className={`tab ${activeTab === "restaurants" ? "active" : ""}`}
                                onClick={() => setActiveTab("restaurants")}
                            >
                                Restaurants
                            </button>
                        )}
                        <button
                            className={`tab ${activeTab === "info" ? "active" : ""}`}
                            onClick={() => setActiveTab("info")}
                        >
                            Info
                        </button>
                    </div>

                    {/* Tab Content - Overview */}
                    {activeTab === "overview" && (
                        <div className="tab-content">
                            <div className="info-grid">
                                {destination.address && (
                                    <div className="info-card">
                                        <div className="info-icon">📍</div>
                                        <div className="info-content">
                                            <h3>Location</h3>
                                            <p>{destination.address}</p>
                                        </div>
                                    </div>
                                )}

                                {destination.location?.lat && destination.location?.lng && (
                                    <div className="info-card">
                                        <div className="info-icon"></div>
                                        <div className="info-content">
                                            <h3>Coordinates</h3>
                                            <p>{destination.location.lat.toFixed(4)}, {destination.location.lng.toFixed(4)}</p>
                                        </div>
                                    </div>
                                )}

                                {destination.business_status && (
                                    <div className="info-card">
                                        <div className="info-icon"></div>
                                        <div className="info-content">
                                            <h3>Status</h3>
                                            <p className={`status-${destination.business_status.toLowerCase()}`}>
                                                {destination.business_status === "OPERATIONAL" ? "Open" : destination.business_status}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="description-section">
                                <h2>About {destination.name}</h2>
                                <p>Discover the beauty and culture of {destination.name}. This destination offers amazing experiences with {destination.user_ratings_total?.toLocaleString()} visitor reviews and a {destination.rating?.toFixed(1)} star rating.</p>
                            </div>
                        </div>
                    )}

                    {/* Tab Content - Things to Do */}
                    {activeTab === "things" && thingsToDo.length > 0 && (
                        <div className="tab-content">
                            <h2>Popular Attractions</h2>
                            <div className="attractions-grid">
                                {thingsToDo.map((thing) => (
                                    <div key={thing.id} className="attraction-card">
                                        <div className="attraction-image">
                                            <img src={thing.image} alt={thing.name} onError={(e) => {
                                                e.currentTarget.src = "https://via.placeholder.com/300x200?text=" + encodeURIComponent(thing.name);
                                            }} />
                                        </div>
                                        <div className="attraction-content">
                                            <h3>{thing.name}</h3>
                                            <p className="attraction-category">{thing.category}</p>
                                            <div className="attraction-footer">
                                                <span className="attraction-rating">★ {thing.rating}</span>
                                                <span className="attraction-distance">{thing.distance}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tab Content - Restaurants */}
                    {activeTab === "restaurants" && (
                        <div className="tab-content">
                            <h2>Nearby Restaurants</h2>

                            {restaurantsLoading && (
                                <div className="restaurants-loading">
                                    <div className="loading-spinner-small"></div>
                                    <p>Searching for restaurants nearby...</p>
                                </div>
                            )}

                            {restaurantsError && (
                                <div className="restaurants-error">
                                    <p>{restaurantsError}</p>
                                    <button
                                        className="btn btn-retry"
                                        onClick={() => {
                                            if (destination?.location?.lat != null && destination?.location?.lng != null) {
                                                setRestaurantsFetched(false);
                                            }
                                        }}
                                    >
                                        Retry
                                    </button>
                                </div>
                            )}

                            {!restaurantsLoading && !restaurantsError && restaurantsFetched && restaurants.length === 0 && (
                                <div className="restaurants-empty">
                                    <p>No restaurants found within {restaurantRadius >= 1000 ? `${(restaurantRadius / 1000).toFixed(1)} km` : `${restaurantRadius} m`}.</p>
                                    <button
                                        className="btn btn-widen"
                                        onClick={() => {
                                            const newRadius = Math.min(restaurantRadius * 2, 50000);
                                            setRestaurantRadius(newRadius);
                                            setRestaurantsFetched(false);
                                        }}
                                    >
                                        Widen Search
                                    </button>
                                </div>
                            )}

                            {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && (
                                <div className="restaurants-grid">
                                    {restaurants.map((r) => (
                                        <div key={r.place_id} className="restaurant-card">
                                            <div className="restaurant-image">
                                                <img
                                                    src={getRestaurantImageUrl(r)}
                                                    alt={r.name}
                                                    onError={(e) => {
                                                        e.currentTarget.src = "https://via.placeholder.com/400x300?text=" + encodeURIComponent(r.name);
                                                    }}
                                                />
                                            </div>
                                            <div className="restaurant-content">
                                                <h3>{r.name}</h3>
                                                <div className="restaurant-meta">
                                                    {r.rating && <span className="restaurant-rating">★ {r.rating.toFixed(1)}</span>}
                                                    {r.price_level && <span className="restaurant-price">{r.price_level}</span>}
                                                </div>
                                                {r.address && <p className="restaurant-address">{r.address}</p>}
                                                <div className="restaurant-footer">
                                                    {r.distance_text && <span className="restaurant-distance">{r.distance_text}</span>}
                                                    {r.user_ratings_total && (
                                                        <span className="restaurant-reviews">{r.user_ratings_total.toLocaleString()} reviews</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab Content - Info */}
                    {activeTab === "info" && (
                        <div className="tab-content">
                            <div className="info-columns">
                                <div className="info-column">
                                    <h3>Best Time to Visit</h3>
                                    <p>April - October (Spring and Fall seasons offer pleasant weather and fewer crowds)</p>
                                </div>
                                <div className="info-column">
                                    <h3>💱 Currency</h3>
                                    <p>€ EUR (for European destinations) or local currency</p>
                                </div>
                                <div className="info-column">
                                    <h3>💰 Budget Guide</h3>
                                    <p>Budget: $30-50/day | Mid-range: $50-150/day | Luxury: $150+/day</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <aside className="detail-sidebar">
                    <div className="sidebar-card plan-card">
                        <h3>Plan a Group Trip to {destination.name}</h3>
                        <p>Plan and coordinate a memorable trip with your friends!</p>
                        <div className="sidebar-section">
                            <label>Group Members</label>
                            <div className="avatars">👤 Add friends</div>
                        </div>
                        <div className="sidebar-section">
                            <label>Budget Range</label>
                            <p>$1000 - $2000 per person</p>
                        </div>
                        <div className="sidebar-section">
                            <label>Dates</label>
                            <p>Apr 15 - Apr 21, 2024</p>
                        </div>
                        <button className="btn btn-plan">Plan Trip</button>
                    </div>

                    <div className="sidebar-card">
                        <h3>Quick Info</h3>
                        <div className="quick-info-item">
                            <span className="label">Rating</span>
                            <span className="value">★ {destination.rating?.toFixed(1)}</span>
                        </div>
                        <div className="quick-info-item">
                            <span className="label">Reviews</span>
                            <span className="value">{destination.user_ratings_total?.toLocaleString()}</span>
                        </div>
                        {destination.location?.lat && destination.location?.lng && (
                            <button
                                className="btn btn-map"
                                onClick={() =>
                                    window.open(
                                        `https://www.google.com/maps/search/?api=1&query=${destination.location!.lat},${destination.location!.lng}`,
                                        "_blank"
                                    )
                                }
                            >
                                View on Map
                            </button>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
