"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CreateGroupModal from "./CreateGroupModal";
import { useAuth } from "@/app/AuthContext";

type Group = {
    id: number;
    name: string;
    description: string | null;
    status: string;
    created_by: number;
    created_at: string | null;
    member_count: number;
    role: string | null;
};

type Destination = {
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
};

// Helper function to get the image URL (using proxy for Safari compatibility)
const getImageUrl = (destination: Destination | null): string => {
    if (!destination) return '/trip-marseille.jpg';

    // Use proxy endpoint if photo_reference is available
    if (destination.photo_reference) {
        return `/api/destinations/image?photo_reference=${encodeURIComponent(destination.photo_reference)}&width=800&height=600`;
    }
    // Fallback to direct photo_url if available
    if (destination.photo_url) {
        return destination.photo_url;
    }
    // Default image
    return '/trip-marseille.jpg';
};

export default function Dashboard() {
    const router = useRouter();
    const { user } = useAuth();
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [groups, setGroups] = useState<Group[]>([]);
    const [destinationData, setDestinationData] = useState<{ [key: string]: Destination | null }>({
        panama: null,
        maldives: null,
        santorini: null,
        kyoto: null,
        prague: null,
        barcelona: null,
    });
    const [loadingDestinations, setLoadingDestinations] = useState(true);

    const handleDestinationClick = (destination: Destination | null) => {
        if (!destination) return;
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

    useEffect(() => {
        fetch("/api/groups", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { groups: [] }))
            .then((data) => setGroups(data.groups || []))
            .catch(() => { });
    }, []);

    // Fetch destination data for Panama, Maldives, Suggested Trips, and Barcelona
    useEffect(() => {
        const fetchDestinations = async () => {
            try {
                const destinations = ["Panama", "Maldives", "Santorini", "Kyoto", "Prague", "Barcelona"];
                const results: { [key: string]: Destination | null } = {
                    panama: null,
                    maldives: null,
                    santorini: null,
                    kyoto: null,
                    prague: null,
                    barcelona: null,
                };

                for (const destination of destinations) {
                    const response = await fetch(
                        `/api/destinations/search?query=${encodeURIComponent(destination)}`
                    );
                    if (response.ok) {
                        const data = await response.json();
                        if (data.results && data.results.length > 0) {
                            results[destination.toLowerCase()] = data.results[0];
                        }
                    }
                }

                setDestinationData(results);
            } catch (err) {
                console.error("Error loading destinations:", err);
            } finally {
                setLoadingDestinations(false);
            }
        };

        fetchDestinations();
    }, []);

    return (
        <div className="dashboard-container">
            {/* Welcome Section */}
            <div className="welcome-section">
                <h1 className="welcome-title">
                    Welcome, {user?.name || "Guest"}!
                </h1>
                <div className="action-buttons">
                    <button className="action-btn dashboard-btn">
                        Dashboard
                    </button>
                    <button className="action-btn create-poll-btn">
                        + Create Poll
                    </button>
                    <button className="action-btn create-poll-btn" onClick={() => setShowCreateGroup(true)}>
                        + Create Group
                    </button>
                    <button className="action-btn search-flights-btn">
                        Search Flights
                    </button>
                    <button className="action-btn explore-hotels-btn">
                        Explore Hotels
                    </button>
                    <button className="action-btn more-recommend-btn">
                        More Recommend
                    </button>
                    <button className="action-btn filter-btn">
                        Filter
                    </button>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Left Column */}
                <div className="dashboard-main">
                    <h2 className="active-trips-title">Active Trips</h2>

                    {/* Trip Cards */}
                    {destinationData.maldives && (
                        <div
                            className="trip-card large-card"
                            onClick={() => handleDestinationClick(destinationData.maldives)}
                            style={{ cursor: "pointer" }}
                        >
                            <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(destinationData.maldives)}')` }}>
                                <div className="trip-overlay" />
                            </div>
                            <div className="trip-content">
                                <h3 className="trip-title">{destinationData.maldives.name} Adventure</h3>
                                <p className="trip-dates">May 15, 2024 - May 21, 2024 | 5 days left</p>
                                {destinationData.maldives.rating && (
                                    <p className="trip-rating" style={{ marginTop: '0.5rem' }}>⭐ {destinationData.maldives.rating.toFixed(1)}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Finalizing Trip Section */}
                    <div className="finalizing-section">
                        <h3 className="finalizing-title">Finalizing Trip...</h3>
                        <button className="view-plan-btn">View Plan</button>
                    </div>



                    {/* Upcoming Polls Section */}
                    <div className="upcoming-polls">
                        <h3 className="polls-title">Upcoming Polls</h3>
                        <div className="polls-grid">
                            <div className="poll-card">
                                <h4 className="poll-question">Vote on Marseille Flights</h4>
                                <div className="poll-time">4 hours</div>
                                <div className="poll-options">
                                    <label className="poll-option">
                                        <input type="radio" name="marseille" />
                                        <span>Delta Airlines</span>
                                    </label>
                                    <label className="poll-option">
                                        <input type="radio" name="marseille" />
                                        <span>Air France</span>
                                    </label>
                                </div>
                                <button className="vote-btn">Vote Now</button>
                            </div>

                            <div className="poll-card">
                                <h4 className="poll-question">Vote on Hotel for London Trip</h4>
                                <div className="poll-time">Tomorrow</div>
                                <div className="poll-options">
                                    <label className="poll-option">
                                        <input type="radio" name="london" />
                                        <span>Hotel One Hundred Shoreditch</span>
                                    </label>
                                    <label className="poll-option">
                                        <input type="radio" name="london" />
                                        <span>The Westminster London</span>
                                    </label>
                                </div>
                                <button className="vote-btn">Vote</button>
                            </div>
                        </div>
                    </div>

                    {/* Active Groups Section */}
                    {groups.length > 0 && (
                        <div className="active-groups-section">
                            <h3 className="active-groups-title">Active Groups</h3>
                            <div className="active-groups-grid">
                                {groups.map((g) => (
                                    <div key={g.id} className="active-group-card" onClick={() => router.push(`/group/${g.id}`)} style={{ cursor: "pointer" }}>
                                        <div className="active-group-info">
                                            <h4 className="active-group-name">{g.name}</h4>
                                            {g.description && (
                                                <p className="active-group-desc">{g.description}</p>
                                            )}
                                        </div>
                                        <div className="active-group-meta">
                                            <span className={`active-group-status status-${g.status}`}>
                                                {g.status}
                                            </span>
                                            <span className="active-group-role">{g.role}</span>
                                            <span className="active-group-members">
                                                {g.member_count} {g.member_count === 1 ? "member" : "members"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <aside className="dashboard-sidebar">
                    {/* Suggested Trips */}
                    <div className="suggested-section">
                        <h3 className="sidebar-title">Suggested Trips for Your Group</h3>
                        <div className="suggested-trips">
                            {destinationData.santorini && (
                                <div
                                    className="suggested-trip"
                                    onClick={() => handleDestinationClick(destinationData.santorini)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(destinationData.santorini)}')` }}>
                                        <div className="trip-overlay" />
                                        <span className="trip-percentage">85%</span>
                                    </div>
                                    <h4 className="trip-name">{destinationData.santorini.name}</h4>
                                </div>
                            )}

                            {destinationData.kyoto && (
                                <div
                                    className="suggested-trip"
                                    onClick={() => handleDestinationClick(destinationData.kyoto)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(destinationData.kyoto)}')` }}>
                                        <div className="trip-overlay" />
                                        <span className="trip-percentage">81%</span>
                                    </div>
                                    <h4 className="trip-name">{destinationData.kyoto.name}</h4>
                                </div>
                            )}

                            {destinationData.prague && (
                                <div
                                    className="suggested-trip"
                                    onClick={() => handleDestinationClick(destinationData.prague)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(destinationData.prague)}')` }}>
                                        <div className="trip-overlay" />
                                        <span className="trip-percentage">79%</span>
                                    </div>
                                    <h4 className="trip-name">{destinationData.prague.name}</h4>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* My Bookings */}
                    <div className="bookings-section">
                        <h3 className="sidebar-title">My Bookings</h3>
                        <div
                            className="booking-card"
                            onClick={() => handleDestinationClick(destinationData.barcelona)}
                            style={{ cursor: destinationData.barcelona ? "pointer" : "default" }}
                        >
                            <div className="booking-image" style={{ backgroundImage: `url('${getImageUrl(destinationData.barcelona)}')` }} />
                            <div className="booking-content">
                                <h4 className="booking-title">{destinationData.barcelona?.name || 'Barcelona'} Adventure</h4>
                                <p className="booking-dates">May 15 - May 21</p>
                                <p className="booking-info">5.4 Days</p>
                                <button className="view-details-btn">View Details</button>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            {showCreateGroup && (
                <CreateGroupModal
                    onClose={() => setShowCreateGroup(false)}
                    onGroupCreated={(group) => {
                        setGroups((prev) => [group, ...prev]);
                    }}
                />
            )}
        </div>
    );
}
