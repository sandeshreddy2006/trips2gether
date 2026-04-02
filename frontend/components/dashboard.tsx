"use client";
import React, { useState, useEffect, useMemo } from "react";
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
    trip_item_count: number;
    trip_start_at: string | null;
    trip_end_at: string | null;
};

type TripSection = "upcoming" | "active" | "previous";

function normalizeGroupStatus(status: string): "planning" | "upcoming" | "active" | "archived" {
    if (status === "active") return "active";
    if (status === "archived") return "archived";
    if (status === "upcoming" || status === "confirmed" || status === "finalized") return "upcoming";
    return "planning";
}

function parseIsoDate(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

type Booking = {
    id: number;
    order_id: string;
    booking_reference: string;
    total_amount: string;
    currency: string;
    payment_status: string;
    created_at: string;
};

type ArchivedTripHistory = {
    id: number;
    group_id: number;
    group_name: string;
    title: string;
    description: string | null;
    shared_notes: string | null;
    starts_at: string | null;
    ends_at: string | null;
    archived_at: string | null;
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
    const [trendingError, setTrendingError] = useState<string | null>(null);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loadingBookings, setLoadingBookings] = useState(true);
    const [archivedHistory, setArchivedHistory] = useState<ArchivedTripHistory[]>([]);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [selectedTripSection, setSelectedTripSection] = useState<TripSection>("upcoming");

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

        fetch("/api/itinerary/history", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { items: [] }))
            .then((data) => setArchivedHistory(Array.isArray(data.items) ? data.items : []))
            .catch(() => { setArchivedHistory([]); });
    }, []);

    useEffect(() => {
        const loadBookings = async () => {
            try {
                setLoadingBookings(true);
                const response = await fetch("/api/bookings", { credentials: "include" });
                if (!response.ok) {
                    setBookings([]);
                    return;
                }
                const data = await response.json();
                setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
            } catch {
                setBookings([]);
            } finally {
                setLoadingBookings(false);
            }
        };

        loadBookings();
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

                const hasAnyResults = Object.values(results).some((value) => value !== null);
                if (!hasAnyResults) {
                    setTrendingError("No trending destinations available right now. Check back soon.");
                } else {
                    setTrendingError(null);
                }
                setDestinationData(results);
            } catch (err) {
                console.error("Error loading destinations:", err);
                setTrendingError("We couldn't load trending destinations right now.");
            } finally {
                setLoadingDestinations(false);
            }
        };

        fetchDestinations();
    }, []);

    const trendingCards: Array<{ destination: Destination; matchScore: string }> = [
        { destination: destinationData.santorini, matchScore: "85%" },
        { destination: destinationData.kyoto, matchScore: "81%" },
        { destination: destinationData.prague, matchScore: "79%" },
    ]
        .filter((item): item is { destination: Destination; matchScore: string } => Boolean(item.destination));

    const now = useMemo(() => new Date(), []);

    const upcomingTrips = useMemo(() => {
        return groups.filter((group) => {
            const status = normalizeGroupStatus(group.status);
            if (status !== "upcoming") return false;
            const endAt = parseIsoDate(group.trip_end_at);
            if (!endAt) return true;
            return endAt >= now;
        });
    }, [groups, now]);

    const activeTrips = useMemo(() => {
        return groups.filter((group) => {
            const status = normalizeGroupStatus(group.status);
            if (status !== "active") return false;
            const endAt = parseIsoDate(group.trip_end_at);
            if (!endAt) return true;
            return endAt >= now;
        });
    }, [groups, now]);

    const previousTrips = useMemo(() => {
        return groups.filter((group) => {
            const status = normalizeGroupStatus(group.status);
            if (status === "archived") return true;
            const endAt = parseIsoDate(group.trip_end_at);
            if (!endAt) return false;
            return endAt < now;
        });
    }, [groups, now]);

    const previousTripCount = previousTrips.length + archivedHistory.length;

    const visibleTrips = selectedTripSection === "upcoming"
        ? upcomingTrips
        : selectedTripSection === "active"
            ? activeTrips
            : previousTrips;

    const handlePlanTrip = () => {
        if (groups.length === 0) {
            setToastMessage("Create or join a group first to build a trip itinerary.");
            return;
        }

        router.push(`/group/${groups[0].id}/itinerary`);
    };

    const handleViewGroups = () => {
        const section = document.getElementById("all-groups-section");
        if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        setToastMessage("Your groups appear in the Active Groups section on the dashboard.");
    };

    useEffect(() => {
        if (!toastMessage) return;

        const timeout = window.setTimeout(() => {
            setToastMessage(null);
        }, 3200);

        return () => window.clearTimeout(timeout);
    }, [toastMessage]);

    return (
        <div className="dashboard-container">
            {toastMessage && (
                <div className="dashboard-toast" role="status" aria-live="polite">
                    <span className="dashboard-toast-dot" />
                    <span>{toastMessage}</span>
                    <button
                        className="dashboard-toast-close"
                        onClick={() => setToastMessage(null)}
                        aria-label="Dismiss message"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Welcome Section */}
            <div className="welcome-section">
                <h1 className="welcome-title">
                    Welcome, {user?.name || "Guest"}!
                </h1>
                <div className="action-buttons">
                    <button className="action-btn dashboard-btn">
                        Dashboard
                    </button>
                    <button className="action-btn my-groups-btn" onClick={handleViewGroups}>
                        My Groups
                    </button>
                    <button className="action-btn plan-trip-btn" onClick={handlePlanTrip}>
                        Plan Trip
                    </button>
                    <button className="action-btn create-poll-btn">
                        + Create Poll
                    </button>
                    <button className="action-btn create-poll-btn" onClick={() => setShowCreateGroup(true)}>
                        + Create Group
                    </button>
                    <button className="action-btn search-flights-btn" onClick={() => router.push("/bookings")}>
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
                    <h2 className="active-trips-title">Trip Timeline</h2>

                    <div className="trip-section-tabs">
                        <button
                            className={`trip-section-tab ${selectedTripSection === "upcoming" ? "active" : ""}`}
                            onClick={() => setSelectedTripSection("upcoming")}
                        >
                            Upcoming Trips ({upcomingTrips.length})
                        </button>
                        <button
                            className={`trip-section-tab ${selectedTripSection === "active" ? "active" : ""}`}
                            onClick={() => setSelectedTripSection("active")}
                        >
                            Active Trips ({activeTrips.length})
                        </button>
                        <button
                            className={`trip-section-tab ${selectedTripSection === "previous" ? "active" : ""}`}
                            onClick={() => setSelectedTripSection("previous")}
                        >
                            Previous Trips ({previousTripCount})
                        </button>
                    </div>

                    {visibleTrips.length === 0 ? (
                        <div className="trip-section-empty">
                            {selectedTripSection === "upcoming" && "No upcoming trips yet. Finalize an itinerary to move it here."}
                            {selectedTripSection === "active" && "No active trips right now."}
                            {selectedTripSection === "previous" && previousTripCount === 0 && "No previous trips yet."}
                        </div>
                    ) : (
                        <div className="active-groups-section" id="active-groups-section">
                            <div className="active-groups-grid">
                                {visibleTrips.map((g) => (
                                    <div key={g.id} className="active-group-card" onClick={() => router.push(`/group/${g.id}`)} style={{ cursor: "pointer" }}>
                                        <div className="active-group-info">
                                            <h4 className="active-group-name">{g.name}</h4>
                                            {g.description && (
                                                <p className="active-group-desc">{g.description}</p>
                                            )}
                                        </div>
                                        <div className="active-group-meta">
                                            <span className={`active-group-status status-${normalizeGroupStatus(g.status)}`}>
                                                {normalizeGroupStatus(g.status)}
                                            </span>
                                            <span className="active-group-role">{g.role}</span>
                                            <span className="active-group-members">
                                                {g.member_count} {g.member_count === 1 ? "member" : "members"}
                                            </span>
                                            {g.trip_start_at && g.trip_end_at && (
                                                <span className="active-group-dates">
                                                    {new Date(g.trip_start_at).toLocaleDateString()} - {new Date(g.trip_end_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className="group-open-btn"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                router.push(`/group/${g.id}`);
                                            }}
                                        >
                                            Open Group
                                        </button>
                                        <button
                                            className="group-plan-btn"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                router.push(`/group/${g.id}/itinerary`);
                                            }}
                                        >
                                            Open Itinerary
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedTripSection === "previous" && archivedHistory.length > 0 && (
                        <div className="active-groups-section">
                            <h3 className="active-groups-title">Archived Trip History</h3>
                            <div className="active-groups-grid">
                                {archivedHistory.map((historyItem) => (
                                    <div
                                        key={`history-${historyItem.id}`}
                                        className="active-group-card"
                                        onClick={() => router.push(`/group/${historyItem.group_id}/itinerary?historyId=${historyItem.id}`)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <div className="active-group-info">
                                            <h4 className="active-group-name">{historyItem.title}</h4>
                                            <p className="active-group-desc">{historyItem.group_name}</p>
                                            {historyItem.description && <p className="active-group-desc">{historyItem.description}</p>}
                                        </div>
                                        <div className="active-group-meta">
                                            <span className="active-group-status status-archived">archived</span>
                                            {historyItem.starts_at && historyItem.ends_at && (
                                                <span className="active-group-dates">
                                                    {new Date(historyItem.starts_at).toLocaleDateString()} - {new Date(historyItem.ends_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className="group-plan-btn"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                router.push(`/group/${historyItem.group_id}/itinerary?historyId=${historyItem.id}`);
                                            }}
                                        >
                                            View Group Itinerary
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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
                        <button className="view-plan-btn" onClick={handlePlanTrip}>Plan Trip</button>
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

                    {/* All Groups Section */}
                    {groups.length > 0 && (
                        <div className="active-groups-section" id="all-groups-section">
                            <h3 className="active-groups-title">All Groups</h3>
                            <div className="active-groups-grid">
                                {groups.map((g) => (
                                    <div key={g.id} className="active-group-card" onClick={() => router.push(`/group/${g.id}`)} style={{ cursor: "pointer" }}>
                                        <div className="active-group-info">
                                            <h4 className="active-group-name">{g.name}</h4>
                                            {g.description && <p className="active-group-desc">{g.description}</p>}
                                        </div>
                                        <div className="active-group-meta">
                                            <span className={`active-group-status status-${normalizeGroupStatus(g.status)}`}>{normalizeGroupStatus(g.status)}</span>
                                            <span className="active-group-members">{g.member_count} {g.member_count === 1 ? "member" : "members"}</span>
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
                        <h3 className="sidebar-title">Trending Destinations</h3>
                        {loadingDestinations ? (
                            <p className="suggested-fallback">Loading trending destinations...</p>
                        ) : trendingCards.length === 0 ? (
                            <p className="suggested-fallback">
                                {trendingError || "No trending destinations available right now."}
                            </p>
                        ) : (
                            <div className="suggested-trips">
                                {trendingCards.map(({ destination, matchScore }) => (
                                    <div
                                        key={destination.place_id}
                                        className="suggested-trip"
                                        onClick={() => handleDestinationClick(destination)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(destination)}')` }}>
                                            <div className="trip-overlay" />
                                            <span className="trip-percentage">{matchScore}</span>
                                        </div>
                                        <h4 className="trip-name">{destination.name}</h4>
                                        <p className="trip-rating-inline">
                                            ⭐ {destination.rating != null ? destination.rating.toFixed(1) : "N/A"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* My Bookings */}
                    <div className="bookings-section">
                        <h3 className="sidebar-title">My Bookings</h3>
                        {loadingBookings ? (
                            <p className="booking-empty">Loading your bookings...</p>
                        ) : bookings.length === 0 ? (
                            <p className="booking-empty">No bookings yet. Start by searching flights.</p>
                        ) : (
                            <div className="booking-list">
                                {bookings.slice(0, 3).map((booking) => (
                                    <div key={booking.id} className="booking-card">
                                        <div className="booking-content">
                                            <h4 className="booking-title">Ref: {booking.booking_reference}</h4>
                                            <p className="booking-dates">
                                                {new Date(booking.created_at).toLocaleDateString()} • {booking.currency} {booking.total_amount}
                                            </p>
                                            <p className="booking-info">Status: {booking.payment_status}</p>
                                            <button className="view-details-btn" onClick={() => router.push("/bookings")}>View Details</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
