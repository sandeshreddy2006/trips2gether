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

type PollSection = "upcoming" | "previous";
type PollDecisionType = "destination" | "flight" | "hotel" | "activity" | "other";

type DashboardPollOption = {
    id: number;
    label: string;
    position: number;
    vote_count: number;
    is_winner: boolean;
};

type DashboardPoll = {
    id: number;
    group_id: number;
    group_name: string | null;
    question: string;
    decision_type: PollDecisionType;
    status: "active" | "closed";
    allow_vote_update: boolean;
    closes_at: string | null;
    closed_at: string | null;
    winner_option_id: number | null;
    created_by: number;
    created_by_name: string | null;
    member_count: number;
    total_votes: number;
    voted_by_all: boolean;
    user_vote_option_id: number | null;
    options: DashboardPollOption[];
};

function formatPollDateLabel(value: string | null): string {
    if (!value) return "No deadline";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No deadline";

    return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
    }).format(date);
}

function getPollDecisionLabel(type: PollDecisionType): string {
    if (type === "destination") return "Destination";
    if (type === "flight") return "Flight";
    if (type === "hotel") return "Hotel";
    if (type === "activity") return "Activity";
    return "Other";
}

function parseApiError(data: unknown, fallback: string): string {
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === "string") return detail;
    }
    return fallback;
}

function getDefaultPollDeadlineInputValue(): string {
    const twoDaysLater = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000));
    const year = twoDaysLater.getFullYear();
    const month = String(twoDaysLater.getMonth() + 1).padStart(2, "0");
    const day = String(twoDaysLater.getDate()).padStart(2, "0");
    const hour = String(twoDaysLater.getHours()).padStart(2, "0");
    const minute = String(twoDaysLater.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
}

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
    const [showCreatePoll, setShowCreatePoll] = useState(false);
    const [pollSection, setPollSection] = useState<PollSection>("upcoming");
    const [loadingPolls, setLoadingPolls] = useState(true);
    const [creatingPoll, setCreatingPoll] = useState(false);
    const [upcomingPolls, setUpcomingPolls] = useState<DashboardPoll[]>([]);
    const [previousPolls, setPreviousPolls] = useState<DashboardPoll[]>([]);
    const [selectedOptionByPollId, setSelectedOptionByPollId] = useState<Record<number, number>>({});
    const [submittingPollVotes, setSubmittingPollVotes] = useState<Record<number, boolean>>({});
    const [pollForm, setPollForm] = useState({
        groupId: "",
        question: "",
        decisionType: "activity" as PollDecisionType,
        closesAt: getDefaultPollDeadlineInputValue(),
        allowVoteUpdate: true,
        optionsText: "",
    });

    const loadDashboardPolls = async () => {
        try {
            setLoadingPolls(true);
            const response = await fetch("/api/polls/dashboard", { credentials: "include" });
            const data = await response.json().catch(() => ({ upcoming: [], previous: [] }));

            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to load polls"));
            }

            const nextUpcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
            const nextPrevious = Array.isArray(data.previous) ? data.previous : [];

            setUpcomingPolls(nextUpcoming);
            setPreviousPolls(nextPrevious);
            setSelectedOptionByPollId((prev) => {
                const next = { ...prev };
                for (const poll of nextUpcoming) {
                    if (poll.user_vote_option_id && !next[poll.id]) {
                        next[poll.id] = poll.user_vote_option_id;
                    }
                }
                return next;
            });
        } catch {
            setUpcomingPolls([]);
            setPreviousPolls([]);
        } finally {
            setLoadingPolls(false);
        }
    };

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
            .then((data) => {
                const fetchedGroups = Array.isArray(data.groups) ? data.groups : [];
                setGroups(fetchedGroups);
                setPollForm((prev) => ({
                    ...prev,
                    groupId: prev.groupId || (fetchedGroups[0] ? String(fetchedGroups[0].id) : ""),
                }));
            })
            .catch(() => { });

        fetch("/api/itinerary/history", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { items: [] }))
            .then((data) => setArchivedHistory(Array.isArray(data.items) ? data.items : []))
            .catch(() => { setArchivedHistory([]); });

        void loadDashboardPolls();
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

    const handleCreatePollClick = () => {
        if (groups.length === 0) {
            setToastMessage("Create or join a group before creating a poll.");
            return;
        }

        setPollForm((prev) => ({
            ...prev,
            groupId: prev.groupId || String(groups[0].id),
        }));
        setShowCreatePoll(true);
    };

    const handleSubmitPollVote = async (poll: DashboardPoll) => {
        const selectedOptionId = selectedOptionByPollId[poll.id] || poll.user_vote_option_id;
        if (!selectedOptionId) {
            setToastMessage("Choose an option before voting.");
            return;
        }

        setSubmittingPollVotes((prev) => ({ ...prev, [poll.id]: true }));
        try {
            const response = await fetch(`/api/groups/${poll.group_id}/polls/${poll.id}/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ option_id: selectedOptionId }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to submit vote"));
            }

            setToastMessage("Vote recorded.");
            await loadDashboardPolls();
        } catch (error) {
            setToastMessage(error instanceof Error ? error.message : "Failed to submit vote");
        } finally {
            setSubmittingPollVotes((prev) => ({ ...prev, [poll.id]: false }));
        }
    };

    const handleEndPollEarly = async (poll: DashboardPoll) => {
        if (!user || poll.created_by !== user.id) {
            setToastMessage("Only the poll host can end this poll early.");
            return;
        }

        setSubmittingPollVotes((prev) => ({ ...prev, [poll.id]: true }));
        try {
            const response = await fetch(`/api/groups/${poll.group_id}/polls/${poll.id}/end`, {
                method: "PATCH",
                credentials: "include",
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to end poll"));
            }

            setToastMessage("Poll ended early.");
            await loadDashboardPolls();
        } catch (error) {
            setToastMessage(error instanceof Error ? error.message : "Failed to end poll");
        } finally {
            setSubmittingPollVotes((prev) => ({ ...prev, [poll.id]: false }));
        }
    };

    const handleCreatePollSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!pollForm.groupId) {
            setToastMessage("Select a group for this poll.");
            return;
        }

        const optionLabels = pollForm.optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        if (optionLabels.length < 2) {
            setToastMessage("Add at least two poll options.");
            return;
        }

        const closesAtDate = new Date(pollForm.closesAt);
        if (Number.isNaN(closesAtDate.getTime()) || closesAtDate <= new Date()) {
            setToastMessage("Set a poll deadline in the future.");
            return;
        }

        setCreatingPoll(true);
        try {
            const response = await fetch(`/api/groups/${pollForm.groupId}/polls`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    question: pollForm.question,
                    decision_type: pollForm.decisionType,
                    closes_at: closesAtDate.toISOString(),
                    allow_vote_update: pollForm.allowVoteUpdate,
                    options: optionLabels.map((label) => ({ label })),
                }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to create poll"));
            }

            setShowCreatePoll(false);
            setPollSection("upcoming");
            setPollForm((prev) => ({
                ...prev,
                question: "",
                decisionType: "activity",
                closesAt: getDefaultPollDeadlineInputValue(),
                allowVoteUpdate: true,
                optionsText: "",
            }));
            setToastMessage("Poll created.");
            await loadDashboardPolls();
        } catch (error) {
            setToastMessage(error instanceof Error ? error.message : "Failed to create poll");
        } finally {
            setCreatingPoll(false);
        }
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
                    <button className="action-btn create-poll-btn" onClick={handleCreatePollClick}>
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



                    {/* Polls Section */}
                    <div className="upcoming-polls">
                        <div className="polls-header-row">
                            <h3 className="polls-title">Group Polls</h3>
                            <div className="poll-section-tabs">
                                <button
                                    type="button"
                                    className={`poll-section-tab ${pollSection === "upcoming" ? "active" : ""}`}
                                    onClick={() => setPollSection("upcoming")}
                                >
                                    Upcoming Polls ({upcomingPolls.length})
                                </button>
                                <button
                                    type="button"
                                    className={`poll-section-tab ${pollSection === "previous" ? "active" : ""}`}
                                    onClick={() => setPollSection("previous")}
                                >
                                    Previous Polls ({previousPolls.length})
                                </button>
                            </div>
                        </div>

                        {loadingPolls ? (
                            <div className="trip-section-empty">Loading polls...</div>
                        ) : (
                            <>
                                {(pollSection === "upcoming" ? upcomingPolls : previousPolls).length === 0 ? (
                                    <div className="trip-section-empty">
                                        {pollSection === "upcoming"
                                            ? "No active polls right now. Create one to collect votes from your group."
                                            : "No previous polls yet."}
                                    </div>
                                ) : (
                                    <div className="polls-grid">
                                        {(pollSection === "upcoming" ? upcomingPolls : previousPolls).map((poll) => {
                                            const selectedOptionId = selectedOptionByPollId[poll.id] || poll.user_vote_option_id || undefined;
                                            const winner = poll.options.find((option) => option.id === poll.winner_option_id);

                                            return (
                                                <div key={poll.id} className="poll-card">
                                                    <h4 className="poll-question">{poll.question}</h4>
                                                    <div className="poll-group-tag">{poll.group_name || "Trip Group"}</div>
                                                    <div className="poll-time">
                                                        {poll.status === "active"
                                                            ? `Closes ${formatPollDateLabel(poll.closes_at)}`
                                                            : `Closed ${formatPollDateLabel(poll.closed_at || poll.closes_at)}`}
                                                    </div>
                                                    <div className="poll-time">
                                                        Type: {getPollDecisionLabel(poll.decision_type)} • Votes: {poll.total_votes}/{poll.member_count}
                                                    </div>

                                                    <div className="poll-options">
                                                        {poll.options.map((option) => (
                                                            <label
                                                                key={option.id}
                                                                className={`poll-option ${option.is_winner ? "winner" : ""}`}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={`poll-${poll.id}`}
                                                                    checked={selectedOptionId === option.id}
                                                                    disabled={poll.status !== "active"}
                                                                    onChange={() => {
                                                                        setSelectedOptionByPollId((prev) => ({ ...prev, [poll.id]: option.id }));
                                                                    }}
                                                                />
                                                                <span>{option.label}</span>
                                                                <span className="poll-option-votes">{option.vote_count}</span>
                                                            </label>
                                                        ))}
                                                    </div>

                                                    {poll.status === "active" ? (
                                                        <div className="poll-actions-row">
                                                            <button
                                                                className="vote-btn"
                                                                disabled={Boolean(submittingPollVotes[poll.id])}
                                                                onClick={() => {
                                                                    void handleSubmitPollVote(poll);
                                                                }}
                                                            >
                                                                {submittingPollVotes[poll.id] ? "Saving..." : "Vote Now"}
                                                            </button>
                                                            {user && poll.created_by === user.id && (
                                                                <button
                                                                    type="button"
                                                                    className="poll-end-btn"
                                                                    disabled={Boolean(submittingPollVotes[poll.id])}
                                                                    onClick={() => {
                                                                        void handleEndPollEarly(poll);
                                                                    }}
                                                                >
                                                                    End Poll Early
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="poll-result-line">
                                                            Winner: {winner ? winner.label : "No winner"}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
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

            {showCreatePoll && (
                <div className="poll-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create poll">
                    <div className="poll-modal">
                        <div className="poll-modal-header">
                            <h3>Create Poll</h3>
                            <button type="button" className="poll-modal-close" onClick={() => setShowCreatePoll(false)}>×</button>
                        </div>

                        <form className="poll-modal-form" onSubmit={handleCreatePollSubmit}>
                            <label>
                                Group
                                <select
                                    value={pollForm.groupId}
                                    onChange={(event) => setPollForm((prev) => ({ ...prev, groupId: event.target.value }))}
                                    required
                                >
                                    {groups.map((group) => (
                                        <option key={group.id} value={group.id}>{group.name}</option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                Question
                                <input
                                    type="text"
                                    value={pollForm.question}
                                    onChange={(event) => setPollForm((prev) => ({ ...prev, question: event.target.value }))}
                                    placeholder="What should we vote on?"
                                    required
                                />
                            </label>

                            <label>
                                Decision Type
                                <select
                                    value={pollForm.decisionType}
                                    onChange={(event) => setPollForm((prev) => ({ ...prev, decisionType: event.target.value as PollDecisionType }))}
                                >
                                    <option value="destination">Destination</option>
                                    <option value="flight">Flight</option>
                                    <option value="hotel">Hotel</option>
                                    <option value="activity">Activity</option>
                                    <option value="other">Other</option>
                                </select>
                            </label>

                            <label>
                                Deadline
                                <input
                                    type="datetime-local"
                                    value={pollForm.closesAt}
                                    onChange={(event) => setPollForm((prev) => ({ ...prev, closesAt: event.target.value }))}
                                    required
                                />
                            </label>

                            <label>
                                Options (one per line)
                                <textarea
                                    rows={5}
                                    value={pollForm.optionsText}
                                    onChange={(event) => setPollForm((prev) => ({ ...prev, optionsText: event.target.value }))}
                                    placeholder={"Option A\nOption B\nOption C"}
                                    required
                                />
                            </label>

                            <label className="poll-checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={pollForm.allowVoteUpdate}
                                    onChange={(event) => setPollForm((prev) => ({ ...prev, allowVoteUpdate: event.target.checked }))}
                                />
                                Allow members to change their vote before the deadline
                            </label>

                            <div className="poll-modal-actions">
                                <button type="button" className="itinerary-secondary-btn" onClick={() => setShowCreatePoll(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="vote-btn" disabled={creatingPoll}>
                                    {creatingPoll ? "Creating..." : "Create Poll"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
