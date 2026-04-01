"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../AuthContext";
import "./destination.css";

const RestaurantMap = dynamic(() => import("./RestaurantMap"), { ssr: false });
import RestaurantDetail from "./RestaurantDetail";

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

interface DestinationDetail {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    types: string[];
    business_status?: string;
    primary_type_display_name?: string;
    location?: { lat: number | null; lng: number | null };
    website?: string;
    phone?: string;
    editorial_summary?: string;
    weekday_descriptions?: string[];
}

interface NearbyRestaurant {
    place_id: string;
    name: string;
    address?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: string;
    cuisine_type?: string;
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
    const { isAuthenticated } = useAuth();
    const [destination, setDestination] = useState<Destination | null>(null);
    const [thingsToDo, setThingsToDo] = useState<ThingToDo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [destinationDetail, setDestinationDetail] = useState<DestinationDetail | null>(null);

    const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(false);
    const [restaurantsError, setRestaurantsError] = useState<string | null>(null);
    const [restaurantRadius, setRestaurantRadius] = useState(1500);
    const [restaurantsFetched, setRestaurantsFetched] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
    const restaurantRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const [detailData, setDetailData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null);

    const [filterCuisines, setFilterCuisines] = useState<string[]>([]);
    const [filterPrices, setFilterPrices] = useState<string[]>([]);
    const [filterMinRating, setFilterMinRating] = useState<number | null>(null);

    // Save to Group Plan state
    const [userGroups, setUserGroups] = useState<{ id: number; name: string; role: string }[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [showGroupSelector, setShowGroupSelector] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);

    const placeId = params.id as string;

    const handleBackNavigation = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            window.history.back();
            setTimeout(() => {
                window.location.reload();
            }, 120);
            return;
        }

        router.push("/");
        router.refresh();
    };

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

    useEffect(() => {
        if (!destination?.place_id) return;

        const fetchDestinationDetails = async () => {
            try {
                const res = await fetch(`/api/destinations/details/${encodeURIComponent(destination.place_id)}`);
                if (!res.ok) return;
                const data = await res.json();
                setDestinationDetail(data);
            } catch {
                // Keep page usable even if detail fetch fails.
            }
        };

        fetchDestinationDetails();
    }, [destination?.place_id]);

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

    useEffect(() => {
        const fetchGroups = async () => {
            setGroupsLoading(true);
            try {
                const res = await fetch("/api/groups");
                if (res.ok) {
                    const data = await res.json();
                    setUserGroups(data.groups || []);
                }
            } catch {
                // silently fail — user may not be authenticated
            } finally {
                setGroupsLoading(false);
            }
        };
        fetchGroups();
    }, []);

    const handleSaveToGroup = async () => {
        if (!selectedGroupId || !destination) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            const res = await fetch(`/api/groups/${selectedGroupId}/shortlist`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    place_id: destination.place_id,
                    name: destination.name,
                    address: destination.address ?? null,
                    photo_url: destination.photo_url ?? null,
                    photo_reference: destination.photo_reference ?? null,
                    rating: destination.rating ?? null,
                    types: destination.types,
                }),
            });
            if (res.status === 409) {
                setSaveMessage({ type: "warning", text: "Already in this group's shortlist." });
            } else if (!res.ok) {
                const body = await res.json().catch(() => null);
                const detail = body?.detail;
                if (Array.isArray(detail) && detail.length > 0) {
                    const first = detail[0];
                    throw new Error(first?.msg || `Error (${res.status})`);
                }
                throw new Error(detail || `Error (${res.status})`);
            } else {
                const groupName = userGroups.find(g => g.id === selectedGroupId)?.name ?? "group";
                setSaveMessage({ type: "success", text: `Saved to "${groupName}"!` });
                setShowGroupSelector(false);
                setSelectedGroupId(null);
            }
        } catch (err: any) {
            setSaveMessage({ type: "error", text: err.message || "Failed to save destination." });
        } finally {
            setSaving(false);
        }
    };

    const getFallbackRestaurantImage = (name: string): string => {
        const safeName = name.replace(/[&<>"']/g, "");
        const initials = safeName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("") || "R";

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" fill="none">
                <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#effaf4"/>
                        <stop offset="100%" stop-color="#dcefe6"/>
                    </linearGradient>
                </defs>
                <rect width="400" height="300" rx="24" fill="url(#g)"/>
                <circle cx="200" cy="122" r="42" fill="#145c46" opacity="0.12"/>
                <text x="200" y="133" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="28" font-weight="800" fill="#145c46">${initials}</text>
                <text x="200" y="210" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="20" font-weight="700" fill="#145c46">${safeName.slice(0, 28)}</text>
                <text x="200" y="236" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="13" fill="#5b6475">Photo unavailable</text>
            </svg>
        `;

        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    };

    const getRestaurantImageUrl = (r: NearbyRestaurant): string => {
        if (r.photo_reference) {
            return `/api/destinations/image?photo_reference=${encodeURIComponent(r.photo_reference)}&width=400&height=300`;
        }
        if (r.photo_url) return r.photo_url;
        return getFallbackRestaurantImage(r.name);
    };

    const availableCuisines = Array.from(
        new Set(restaurants.map((r) => r.cuisine_type).filter(Boolean) as string[])
    ).sort();
    const availablePrices = ["$", "$$", "$$$", "$$$$"].filter((p) =>
        restaurants.some((r) => r.price_level === p)
    );
    const filtersActive = filterCuisines.length > 0 || filterPrices.length > 0 || filterMinRating !== null;

    const filteredRestaurants = restaurants.filter((r) => {
        if (filterCuisines.length > 0 && (!r.cuisine_type || !filterCuisines.includes(r.cuisine_type))) return false;
        if (filterPrices.length > 0 && (!r.price_level || !filterPrices.includes(r.price_level))) return false;
        if (filterMinRating !== null && (r.rating == null || r.rating < filterMinRating)) return false;
        return true;
    });

    const clearFilters = () => {
        setFilterCuisines([]);
        setFilterPrices([]);
        setFilterMinRating(null);
    };

    const toggleCuisine = (c: string) => {
        setFilterCuisines((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
    };

    const togglePrice = (p: string) => {
        setFilterPrices((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    };

    const openRestaurantDetail = async (placeId: string) => {
        setDetailPlaceId(placeId);
        setDetailLoading(true);
        setDetailError(null);
        setDetailData(null);
        try {
            const res = await fetch(`/api/restaurants/${encodeURIComponent(placeId)}`);
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.detail || `Server error (${res.status})`);
            }
            const data = await res.json();
            setDetailData(data);
        } catch (err: any) {
            setDetailError(err.message || "Failed to load restaurant details");
        } finally {
            setDetailLoading(false);
        }
    };

    const closeRestaurantDetail = () => {
        setDetailPlaceId(null);
        setDetailData(null);
        setDetailError(null);
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

    const formatBusinessStatus = (status?: string) => {
        if (!status) return "Status unavailable";
        if (status === "OPERATIONAL") return "Open";

        return status
            .toLowerCase()
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    const buildOverviewDescription = (dest: Destination) => {
        if (destinationDetail?.editorial_summary) {
            return destinationDetail.editorial_summary;
        }

        const primaryType = formatTypes(dest.types)[0]?.toLowerCase() ?? "destination";
        const ratingText = dest.rating != null ? `${dest.rating.toFixed(1)} rating` : "no public rating";
        const reviewText = dest.user_ratings_total != null
            ? `${dest.user_ratings_total.toLocaleString()} reviews`
            : "limited review volume";
        const statusText = dest.business_status ? `Current status is ${formatBusinessStatus(dest.business_status).toLowerCase()}.` : "";

        return `${dest.name} is listed as a ${primaryType} with ${ratingText} and ${reviewText}. ${statusText} Use this page to compare nearby food options and decide if it fits your group plan.`.replace(/\s+/g, " ").trim();
    };

    const buildBestTimeText = (types: string[]) => {
        if (destinationDetail?.weekday_descriptions && destinationDetail.weekday_descriptions.length > 0) {
            return `Typical opening pattern: ${destinationDetail.weekday_descriptions[0]}`;
        }

        const normalized = types.map((t) => t.toLowerCase());
        if (normalized.some((t) => t.includes("island") || t.includes("beach") || t.includes("natural"))) {
            return "Dry-season months are usually the best for clear weather and easier local transport.";
        }
        if (normalized.some((t) => t.includes("tourist") || t.includes("point_of_interest") || t.includes("museum"))) {
            return "Weekday mornings and shoulder seasons usually give a better experience with shorter queues.";
        }
        return "Shoulder seasons are usually the safest pick for balanced weather, prices, and crowd levels.";
    };

    const buildCurrencyText = (address?: string) => {
        if (destinationDetail?.website) {
            return `Official website available: ${destinationDetail.website}`;
        }

        const a = (address || "").toLowerCase();
        if (a.includes("spain") || a.includes("france") || a.includes("germany") || a.includes("italy") || a.includes("portugal")) {
            return "Likely currency: EUR. Confirm local pricing and card acceptance before booking activities.";
        }
        if (a.includes("united kingdom") || a.includes("london")) {
            return "Likely currency: GBP. Many attractions use timed entry, so pre-booking helps avoid price surges.";
        }
        if (a.includes("japan") || a.includes("tokyo")) {
            return "Likely currency: JPY. Keep a mix of digital payments and some cash for smaller spots.";
        }
        return "Check local currency and payment methods before you finalize your daily plan.";
    };

    const buildBudgetText = (rating?: number, reviews?: number) => {
        const sourceRating = destinationDetail?.rating ?? rating;
        const sourceReviews = destinationDetail?.user_ratings_total ?? reviews;

        if (sourceRating != null && sourceRating >= 4.6 && (sourceReviews ?? 0) > 10000) {
            return "This place is highly in-demand. Book nearby stays and key activities early to avoid peak pricing.";
        }
        if ((sourceReviews ?? 0) > 1000) {
            return "Expect moderate-to-high demand around peak hours; reserve popular spots in advance when possible.";
        }
        return "Demand looks moderate. You can usually keep plans flexible and compare options closer to your visit date.";
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
                    <button className="back-button" onClick={handleBackNavigation}>
                        ← Go Back
                    </button>
                </div>
            </div>
        );
    }

    const overviewDescription = buildOverviewDescription(destination);
    const bestTimeText = buildBestTimeText(destinationDetail?.types ?? destination.types);
    const currencyText = buildCurrencyText(destinationDetail?.address ?? destination.address);
    const budgetText = buildBudgetText(destinationDetail?.rating ?? destination.rating, destinationDetail?.user_ratings_total ?? destination.user_ratings_total);

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
                <button className="back-button-hero" onClick={handleBackNavigation}>
                    ← Back
                </button>
                <div className="hero-overlay">
                    <div className="hero-content">
                        <h1 className="hero-title">{destination.name}</h1>
                        <div className="hero-rating">
                            {destination.rating != null ? (
                                <span className="rating-stars">★ {destination.rating.toFixed(1)}</span>
                            ) : (
                                <span className="rating-stars">Rating unavailable</span>
                            )}
                            <span className="rating-count">
                                {destination.user_ratings_total != null
                                    ? `(${destination.user_ratings_total.toLocaleString()} reviews)`
                                    : "(No reviews yet)"}
                            </span>
                        </div>
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
                                        <div className="info-icon" aria-hidden="true">
                                            <img src="/location.svg" alt="" />
                                        </div>
                                        <div className="info-content">
                                            <h3>Location</h3>
                                            <p>{destination.address}</p>
                                        </div>
                                    </div>
                                )}

                                {destination.location?.lat && destination.location?.lng && (
                                    <div className="info-card">
                                        <div className="info-icon" aria-hidden="true">
                                            <img src="/compass.svg" alt="" />
                                        </div>
                                        <div className="info-content">
                                            <h3>Coordinates</h3>
                                            <p>{destination.location.lat.toFixed(4)}, {destination.location.lng.toFixed(4)}</p>
                                        </div>
                                    </div>
                                )}

                                {destination.business_status && (
                                    <div className="info-card">
                                        <div className="info-icon">●</div>
                                        <div className="info-content">
                                            <h3>Status</h3>
                                            <p className={`status-${destination.business_status.toLowerCase()}`}>
                                                {formatBusinessStatus(destination.business_status)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="description-section">
                                <h2>About {destination.name}</h2>
                                <p>{overviewDescription}</p>
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
                            <div className="restaurants-header">
                                <h2>Nearby Restaurants</h2>
                                <div className="restaurants-controls">
                                    <select
                                        className="radius-select"
                                        value={restaurantRadius}
                                        onChange={(e) => {
                                            const newRadius = Number(e.target.value);
                                            setRestaurantRadius(newRadius);
                                            setRestaurantsFetched(false);
                                            clearFilters();
                                        }}
                                    >
                                        <option value={500}>500 m</option>
                                        <option value={1000}>1 km</option>
                                        <option value={1500}>1.5 km</option>
                                        <option value={3000}>3 km</option>
                                        <option value={5000}>5 km</option>
                                        <option value={10000}>10 km</option>
                                    </select>
                                    {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && (
                                        <button
                                            className="btn-toggle-map"
                                            onClick={() => { setShowMap(!showMap); setSelectedRestaurant(null); }}
                                        >
                                            {showMap ? "List View" : "Map View"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && (
                                <div className="filter-bar">
                                    {availableCuisines.length > 0 && (
                                        <div className="filter-group">
                                            <span className="filter-label">Cuisine</span>
                                            <div className="filter-chips">
                                                {availableCuisines.map((c) => (
                                                    <button
                                                        key={c}
                                                        className={`filter-chip ${filterCuisines.includes(c) ? "filter-chip-active" : ""}`}
                                                        onClick={() => toggleCuisine(c)}
                                                    >
                                                        {c}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {availablePrices.length > 0 && (
                                        <div className="filter-group">
                                            <span className="filter-label">Price</span>
                                            <div className="filter-chips">
                                                {availablePrices.map((p) => (
                                                    <button
                                                        key={p}
                                                        className={`filter-chip ${filterPrices.includes(p) ? "filter-chip-active" : ""}`}
                                                        onClick={() => togglePrice(p)}
                                                    >
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="filter-group">
                                        <span className="filter-label">Min Rating</span>
                                        <select
                                            className="filter-select"
                                            value={filterMinRating ?? ""}
                                            onChange={(e) => setFilterMinRating(e.target.value ? Number(e.target.value) : null)}
                                        >
                                            <option value="">Any</option>
                                            <option value="3">3.0+</option>
                                            <option value="3.5">3.5+</option>
                                            <option value="4">4.0+</option>
                                            <option value="4.5">4.5+</option>
                                        </select>
                                    </div>
                                    {filtersActive && (
                                        <button className="btn-clear-filters" onClick={clearFilters}>
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            )}

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
                                <>
                                    {filtersActive && (
                                        <div className="active-filters">
                                            {filterCuisines.map((c) => (
                                                <span key={c} className="active-filter-chip" onClick={() => toggleCuisine(c)}>
                                                    {c} ✕
                                                </span>
                                            ))}
                                            {filterPrices.map((p) => (
                                                <span key={p} className="active-filter-chip" onClick={() => togglePrice(p)}>
                                                    {p} ✕
                                                </span>
                                            ))}
                                            {filterMinRating !== null && (
                                                <span className="active-filter-chip" onClick={() => setFilterMinRating(null)}>
                                                    ★ {filterMinRating}+ ✕
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {filteredRestaurants.length === 0 && filtersActive && (
                                        <div className="restaurants-empty">
                                            <p>No restaurants match your filters.</p>
                                            <button className="btn btn-widen" onClick={clearFilters}>
                                                Clear filters
                                            </button>
                                        </div>
                                    )}

                                    {showMap && filteredRestaurants.length > 0 && destination?.location?.lat != null && destination?.location?.lng != null && (
                                        <RestaurantMap
                                            anchorLat={destination.location.lat}
                                            anchorLng={destination.location.lng}
                                            anchorName={destination.name}
                                            restaurants={filteredRestaurants}
                                            selectedId={selectedRestaurant}
                                            onSelectRestaurant={(id) => {
                                                setSelectedRestaurant(id);
                                                if (id) {
                                                    openRestaurantDetail(id);
                                                    if (restaurantRefs.current[id]) {
                                                        restaurantRefs.current[id]!.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                                    }
                                                }
                                            }}
                                        />
                                    )}

                                    {filteredRestaurants.length > 0 && (
                                        <div className="restaurants-grid">
                                            {filteredRestaurants.map((r) => (
                                                <div
                                                    key={r.place_id}
                                                    ref={(el) => { restaurantRefs.current[r.place_id] = el; }}
                                                    className={`restaurant-card ${selectedRestaurant === r.place_id ? "restaurant-card-selected" : ""}`}
                                                    onClick={() => {
                                                        setSelectedRestaurant(r.place_id);
                                                        openRestaurantDetail(r.place_id);
                                                    }}
                                                >
                                                    <div className="restaurant-image">
                                                        <img
                                                            src={getRestaurantImageUrl(r)}
                                                            alt={r.name}
                                                            onError={(e) => {
                                                                e.currentTarget.src = getFallbackRestaurantImage(r.name);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="restaurant-content">
                                                        <h3>{r.name}</h3>
                                                        <div className="restaurant-meta">
                                                            {r.rating && <span className="restaurant-rating">★ {r.rating.toFixed(1)}</span>}
                                                            {r.price_level && <span className="restaurant-price">{r.price_level}</span>}
                                                            {r.cuisine_type && <span className="restaurant-cuisine">{r.cuisine_type}</span>}
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
                                </>
                            )}

                        </div>
                    )}

                    {/* Tab Content - Info */}
                    {activeTab === "info" && (
                        <div className="tab-content">
                            <div className="info-columns">
                                <div className="info-column">
                                    <h3>Best Time to Visit</h3>
                                    <p>{bestTimeText}</p>
                                </div>
                                <div className="info-column">
                                    <h3>💱 Currency</h3>
                                    <p>{currencyText}</p>
                                </div>
                                <div className="info-column">
                                    <h3>💰 Budget Guide</h3>
                                    <p>{budgetText}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <aside className="detail-sidebar">
                    <div className="sidebar-card plan-card">
                        <h3 className="save-title">
                            <img src="/save.svg" alt="" aria-hidden="true" />
                            <span>Save to Group Plan</span>
                        </h3>
                        <p>Shortlist this destination so your group can discuss it later.</p>

                        {!isAuthenticated ? (
                            <p className="save-no-groups">Sign in to save destinations to a group plan.</p>
                        ) : !showGroupSelector ? (
                            <button
                                className="btn btn-plan"
                                onClick={() => setShowGroupSelector(true)}
                                disabled={groupsLoading}
                            >
                                {groupsLoading ? "Loading..." : "Save to Group Plan"}
                            </button>
                        ) : (
                            <div className="save-group-selector">
                                {userGroups.length === 0 ? (
                                    <p className="save-no-groups">You are not a member of any group yet. Create or join a group first.</p>
                                ) : (
                                    <>
                                        <select
                                            className="group-select"
                                            value={selectedGroupId ?? ""}
                                            onChange={(e) => setSelectedGroupId(Number(e.target.value) || null)}
                                        >
                                            <option value="">Select a group...</option>
                                            {userGroups.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                        <div className="save-actions">
                                            <button
                                                className="btn btn-plan"
                                                onClick={handleSaveToGroup}
                                                disabled={!selectedGroupId || saving}
                                            >
                                                {saving ? "Saving..." : "Confirm"}
                                            </button>
                                            <button
                                                className="btn btn-cancel"
                                                onClick={() => {
                                                    setShowGroupSelector(false);
                                                    setSaveMessage(null);
                                                    setSelectedGroupId(null);
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </>
                                )}
                                {saveMessage && (
                                    <p className={`save-message save-message-${saveMessage.type}`}>
                                        {saveMessage.text}
                                    </p>
                                )}
                            </div>
                        )}

                        {saveMessage && !showGroupSelector && (
                            <p className={`save-message save-message-${saveMessage.type}`}>
                                {saveMessage.text}
                            </p>
                        )}
                    </div>

                    <div className="sidebar-card">
                        <h3>Quick Info</h3>
                        <div className="quick-info-item">
                            <span className="label">Rating</span>
                            <span className="value">
                                {destination.rating != null ? `★ ${destination.rating.toFixed(1)}` : "N/A"}
                            </span>
                        </div>
                        <div className="quick-info-item">
                            <span className="label">Reviews</span>
                            <span className="value">
                                {destination.user_ratings_total != null
                                    ? destination.user_ratings_total.toLocaleString()
                                    : "N/A"}
                            </span>
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

            {detailPlaceId && (
                <RestaurantDetail
                    detail={detailData}
                    loading={detailLoading}
                    error={detailError}
                    onClose={closeRestaurantDetail}
                    onRetry={() => openRestaurantDetail(detailPlaceId)}
                />
            )}
        </div>
    );
}
