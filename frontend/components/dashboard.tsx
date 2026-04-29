"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import CreateGroupModal from "./CreateGroupModal";
import TripSuccessAdvisorModal from "./TripSuccessAdvisorModal";
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

type HotelDeal = {
    place_id: string;
    name: string;
    address?: string | null;
    rating?: number | null;
    user_ratings_total?: number | null;
    price_per_night?: number | null;
    total_price?: number | null;
    currency: string;
    nights?: number | null;
    photo_url?: string | null;
    photo_reference?: string | null;
};

type FlightDeal = {
    id: string;
    airline: string;
    price: number;
    currency: string;
    duration: string;
    stops: number;
    departure_airport: string;
    arrival_airport: string;
    departure_time?: string | null;
    arrival_time?: string | null;
    logo_url?: string | null;
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

type InboxNotification = {
    id: number;
    user_id: number;
    group_id: number;
    poll_id: number | null;
    notification_type: string;
    title: string;
    body: string;
    payload: Record<string, unknown>;
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

type PreviousTripSummary = {
    id: string;
    title: string;
    destination: string;
    dates: string;
    groupSize: string;
    status: string;
    actionLabel: string;
    actionPath: string;
    sortDate: string | null;
    estimatedCost: number | null;
    currency: string;
    costNote: string;
};

type ComparableItem = {
    id: string;
    label: string;
    category: "Previous Trip" | "Destination" | "Hotel" | "Flight";
    primary: string;
    secondary: string;
    estimatedCost: number | null;
    currency: string;
    costNote: string;
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

function formatDashboardDate(value: string | null): string {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatDashboardDateRange(start: string | null, end: string | null): string {
    if (!start && !end) return "Dates unavailable";
    if (start && end) return `${formatDashboardDate(start)} - ${formatDashboardDate(end)}`;
    return formatDashboardDate(start || end);
}

function formatDashboardMoney(amount: number | null, currency = "USD"): string {
    if (amount == null || Number.isNaN(amount)) return "Estimate unavailable";
    return `${currency} ${amount.toFixed(2)}`;
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

function getFutureDateISO(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split("T")[0];
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
    const [popularDestinations, setPopularDestinations] = useState<Destination[]>([]);
    const [loadingDestinations, setLoadingDestinations] = useState(true);
    const [trendingError, setTrendingError] = useState<string | null>(null);
    const [hotelDeals, setHotelDeals] = useState<HotelDeal[]>([]);
    const [loadingHotelDeals, setLoadingHotelDeals] = useState(true);
    const [hotelDealsError, setHotelDealsError] = useState<string | null>(null);
    const [flightDeals, setFlightDeals] = useState<FlightDeal[]>([]);
    const [loadingFlightDeals, setLoadingFlightDeals] = useState(true);
    const [flightDealsError, setFlightDealsError] = useState<string | null>(null);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loadingBookings, setLoadingBookings] = useState(true);
    const [inboxItems, setInboxItems] = useState<InboxNotification[]>([]);
    const [loadingInbox, setLoadingInbox] = useState(true);
    const [archivedHistory, setArchivedHistory] = useState<ArchivedTripHistory[]>([]);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [selectedTripSection, setSelectedTripSection] = useState<TripSection>("upcoming");
    const [showCreatePoll, setShowCreatePoll] = useState(false);
    const [showTripSuccessAdvisor, setShowTripSuccessAdvisor] = useState(false);
    const [selectedAdvisorGroupId, setSelectedAdvisorGroupId] = useState("");
    const [pollSection, setPollSection] = useState<PollSection>("upcoming");
    const [loadingPolls, setLoadingPolls] = useState(true);
    const [creatingPoll, setCreatingPoll] = useState(false);
    const [upcomingPolls, setUpcomingPolls] = useState<DashboardPoll[]>([]);
    const [previousPolls, setPreviousPolls] = useState<DashboardPoll[]>([]);
    const [selectedOptionByPollId, setSelectedOptionByPollId] = useState<Record<number, number>>({});
    const [submittingPollVotes, setSubmittingPollVotes] = useState<Record<number, boolean>>({});
    const [selectedGroupByBookingId, setSelectedGroupByBookingId] = useState<Record<number, string>>({});
    const [shortlistingBookingIds, setShortlistingBookingIds] = useState<Record<number, boolean>>({});
    const [selectedComparisonIds, setSelectedComparisonIds] = useState<string[]>([]);
    const [pollForm, setPollForm] = useState({
        groupId: "",
        question: "",
        decisionType: "activity" as PollDecisionType,
        closesAt: getDefaultPollDeadlineInputValue(),
        allowVoteUpdate: true,
        optionsText: "",
    });

    const loadDashboardPolls = useCallback(async () => {
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
    }, []);

    const loadInbox = useCallback(async () => {
        try {
            setLoadingInbox(true);
            const response = await fetch("/api/poll-notifications", { credentials: "include" });
            const data = await response.json().catch(() => ({ items: [] }));

            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to load inbox"));
            }

            setInboxItems(Array.isArray(data.items) ? data.items : []);
        } catch {
            setInboxItems([]);
        } finally {
            setLoadingInbox(false);
        }
    }, []);

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
        void loadInbox();
    }, [loadDashboardPolls, loadInbox]);

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

    // Fetch popular destination data for dashboard cards.
    useEffect(() => {
        const fetchDestinations = async () => {
            try {
                const response = await fetch("/api/destinations/filter");
                const data = await response.json().catch(() => ({ results: [] }));

                if (!response.ok) {
                    throw new Error(parseApiError(data, "Failed to load trending destinations"));
                }

                const results = Array.isArray(data.results) ? data.results : [];
                setPopularDestinations(results);

                if (results.length === 0) {
                    setTrendingError("No trending destinations available right now. Check back soon.");
                } else {
                    setTrendingError(null);
                }
            } catch (err) {
                console.error("Error loading destinations:", err);
                setPopularDestinations([]);
                setTrendingError("We couldn't load trending destinations right now.");
            } finally {
                setLoadingDestinations(false);
            }
        };

        fetchDestinations();
    }, []);

    useEffect(() => {
        const fetchHotelDeals = async () => {
            const destination = popularDestinations[0]?.name || "Paris";
            try {
                setLoadingHotelDeals(true);
                setHotelDealsError(null);

                const response = await fetch("/api/hotels/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        destination,
                        check_in: getFutureDateISO(45),
                        check_out: getFutureDateISO(48),
                        guests: 2,
                        rooms: 1,
                        sort_by: "rating_desc",
                    }),
                });
                const data = await response.json().catch(() => ({ results: [] }));
                if (!response.ok) {
                    throw new Error(parseApiError(data, "Hotel ideas are unavailable right now."));
                }

                setHotelDeals(Array.isArray(data.results) ? data.results.slice(0, 3) : []);
            } catch (error) {
                setHotelDeals([]);
                setHotelDealsError(error instanceof Error ? error.message.replaceAll("deals", "ideas") : "Hotel ideas are unavailable right now.");
            } finally {
                setLoadingHotelDeals(false);
            }
        };

        if (!loadingDestinations) {
            void fetchHotelDeals();
        }
    }, [loadingDestinations, popularDestinations]);

    useEffect(() => {
        const fetchFlightDeals = async () => {
            try {
                setLoadingFlightDeals(true);
                setFlightDealsError(null);

                const response = await fetch("/api/flights/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        origin: "JFK",
                        destination: "CDG",
                        depart_date: getFutureDateISO(45),
                        return_date: getFutureDateISO(52),
                        travelers: 1,
                    }),
                });
                const data = await response.json().catch(() => ({ results: [] }));
                if (!response.ok) {
                    throw new Error(parseApiError(data, "Airline ideas are unavailable right now."));
                }

                setFlightDeals(Array.isArray(data.results) ? data.results.slice(0, 3) : []);
            } catch (error) {
                setFlightDeals([]);
                setFlightDealsError(error instanceof Error ? error.message.replaceAll("deals", "ideas") : "Airline ideas are unavailable right now.");
            } finally {
                setLoadingFlightDeals(false);
            }
        };

        void fetchFlightDeals();
    }, []);

    const featuredDestination = popularDestinations[0] ?? null;
    const trendingCards = popularDestinations.slice(1, 4);
    const destinationDeals = popularDestinations.slice(0, 3);

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

    const previousTripSummaries = useMemo<PreviousTripSummary[]>(() => {
        const archivedItems = archivedHistory.map((item) => ({
            id: `history-${item.id}`,
            title: item.title || item.group_name,
            destination: item.group_name,
            dates: formatDashboardDateRange(item.starts_at, item.ends_at),
            groupSize: "Group size unavailable",
            status: "archived",
            actionLabel: "View Itinerary",
            actionPath: `/group/${item.group_id}/itinerary?historyId=${item.id}`,
            sortDate: item.archived_at || item.ends_at || item.starts_at,
            estimatedCost: null,
            currency: "USD",
            costNote: "Archived itinerary cost varies",
        }));

        const groupItems = previousTrips.map((group) => ({
            id: `group-${group.id}`,
            title: group.name,
            destination: group.description || "Group trip",
            dates: formatDashboardDateRange(group.trip_start_at, group.trip_end_at),
            groupSize: `${group.member_count} ${group.member_count === 1 ? "member" : "members"}`,
            status: normalizeGroupStatus(group.status),
            actionLabel: "Open Group",
            actionPath: `/group/${group.id}`,
            sortDate: group.trip_end_at || group.trip_start_at || group.created_at,
            estimatedCost: null,
            currency: "USD",
            costNote: "Group trip cost varies by itinerary",
        }));

        const bookingItems = bookings.map((booking) => {
            const bookingAmount = Number(booking.total_amount);
            return {
                id: `booking-${booking.id}`,
                title: `Flight booking ${booking.booking_reference || booking.order_id}`,
                destination: "Booked flight",
                dates: `Booked ${formatDashboardDate(booking.created_at)}`,
                groupSize: "Solo booking",
                status: booking.payment_status,
                actionLabel: "View Booking",
                actionPath: "/bookings/history",
                sortDate: booking.created_at,
                estimatedCost: Number.isNaN(bookingAmount) ? null : bookingAmount,
                currency: booking.currency,
                costNote: "Confirmed flight booking",
            };
        });

        return [...archivedItems, ...groupItems, ...bookingItems]
            .sort((a, b) => {
                const aTime = a.sortDate ? new Date(a.sortDate).getTime() : 0;
                const bTime = b.sortDate ? new Date(b.sortDate).getTime() : 0;
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [archivedHistory, bookings, previousTrips]);

    const comparisonOptions = useMemo<ComparableItem[]>(() => {
        const previousTripOptions = previousTripSummaries.map((trip) => ({
            id: trip.id,
            label: trip.title,
            category: "Previous Trip" as const,
            primary: trip.destination,
            secondary: `${trip.dates} • ${trip.groupSize}`,
            estimatedCost: trip.estimatedCost,
            currency: trip.currency,
            costNote: trip.costNote,
        }));

        const destinationOptions = destinationDeals.map((destination) => ({
            id: `destination-${destination.place_id}`,
            label: destination.name,
            category: "Destination" as const,
            primary: destination.address || "Popular destination",
            secondary: destination.rating != null ? `${destination.rating.toFixed(1)} rating` : "No rating yet",
            estimatedCost: null,
            currency: "USD",
            costNote: "Destination cost varies",
        }));

        const hotelOptions = hotelDeals.map((hotel) => {
            const estimatedCost = hotel.total_price ?? (
                hotel.price_per_night != null && hotel.nights != null
                    ? hotel.price_per_night * hotel.nights
                    : hotel.price_per_night ?? null
            );

            return {
                id: `hotel-${hotel.place_id}`,
                label: hotel.name,
                category: "Hotel" as const,
                primary: hotel.address || "Hotel idea",
                secondary: hotel.rating != null ? `${hotel.rating.toFixed(1)} rating` : "No rating yet",
                estimatedCost,
                currency: hotel.currency,
                costNote: hotel.total_price != null ? "Estimated stay total" : "Nightly estimate",
            };
        });

        const flightOptions = flightDeals.map((flight) => ({
            id: `flight-${flight.id}`,
            label: `${flight.departure_airport} to ${flight.arrival_airport}`,
            category: "Flight" as const,
            primary: flight.airline,
            secondary: `${flight.duration} • ${flight.stops === 0 ? "Nonstop" : `${flight.stops} stops`}`,
            estimatedCost: flight.price,
            currency: flight.currency,
            costNote: "Flight offer price",
        }));

        return [...previousTripOptions, ...destinationOptions, ...hotelOptions, ...flightOptions];
    }, [destinationDeals, flightDeals, hotelDeals, previousTripSummaries]);

    const selectedComparisonItems = useMemo(() => {
        return selectedComparisonIds
            .map((id) => comparisonOptions.find((item) => item.id === id))
            .filter((item): item is ComparableItem => Boolean(item));
    }, [comparisonOptions, selectedComparisonIds]);

    const comparisonTotal = selectedComparisonItems.reduce((total, item) => {
        return item.estimatedCost == null ? total : total + item.estimatedCost;
    }, 0);
    const comparisonCurrencies = Array.from(
        new Set(selectedComparisonItems.filter((item) => item.estimatedCost != null).map((item) => item.currency))
    );
    const comparisonTotalCurrency = comparisonCurrencies.length === 1 ? comparisonCurrencies[0] : "USD";
    const comparisonTotalLabel = comparisonCurrencies.length > 1 ? "Total Known Estimate (mixed currencies)" : "Total Known Estimate";

    const toggleComparisonItem = (itemId: string) => {
        setSelectedComparisonIds((prev) => {
            if (prev.includes(itemId)) {
                return prev.filter((id) => id !== itemId);
            }
            return [...prev, itemId].slice(-4);
        });
    };

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

    const handleOpenTripSuccessAdvisor = () => {
        if (!selectedAdvisorGroupId && groups.length > 0) {
            setSelectedAdvisorGroupId(String(groups[0].id));
        }
        setShowTripSuccessAdvisor(true);
    };

    const handleShortlistBookingToGroup = async (bookingId: number) => {
        const selectedGroupId = selectedGroupByBookingId[bookingId] || (groups[0] ? String(groups[0].id) : "");
        if (!selectedGroupId) {
            setToastMessage("Select a group to add this booking to group plan.");
            return;
        }

        setShortlistingBookingIds((prev) => ({ ...prev, [bookingId]: true }));
        try {
            const response = await fetch(`/api/bookings/${bookingId}/shortlist-to-group`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ group_id: Number(selectedGroupId) }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to add booking to group plan"));
            }

            setToastMessage("Booking added to group flight shortlist.");
        } catch (error) {
            setToastMessage(error instanceof Error ? error.message : "Failed to add booking to group plan");
        } finally {
            setShortlistingBookingIds((prev) => ({ ...prev, [bookingId]: false }));
        }
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

    useEffect(() => {
        const handlePollRealtime = (event: Event) => {
            const customEvent = event as CustomEvent<{ type?: string; group_id?: number; poll?: DashboardPoll; notification?: InboxNotification }>;
            const payload = customEvent.detail;
            if (!payload?.type || !payload.group_id) return;

            const shouldRefresh = groups.some((group) => group.id === payload.group_id);
            if (shouldRefresh && payload.type !== "notification.created") {
                void loadDashboardPolls();
            }

            if (payload.type === "notification.created") {
                void loadInbox();
                if (payload.notification) {
                    setToastMessage(payload.notification.title);
                }
                return;
            }

            const poll = payload.poll;
            if (!poll) return;

            if (payload.type === "poll.updated") {
                void loadInbox();
            }
        };

        window.addEventListener("poll-realtime", handlePollRealtime as EventListener);
        return () => {
            window.removeEventListener("poll-realtime", handlePollRealtime as EventListener);
        };
    }, [groups, loadDashboardPolls, loadInbox]);

    const handleDismissInboxItem = async (notificationId: number) => {
        try {
            const response = await fetch(`/api/poll-notifications/${notificationId}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(parseApiError(data, "Failed to remove inbox message"));
            }

            setInboxItems((prev) => prev.filter((item) => item.id !== notificationId));
        } catch (error) {
            setToastMessage(error instanceof Error ? error.message : "Failed to remove inbox message");
        }
    };

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
                    <button className="action-btn explore-hotels-btn" onClick={() => router.push("/hotels")}>
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

                    <section className="previous-summary-section">
                        <div className="previous-summary-header">
                            <div>
                                <p className="previous-summary-kicker">Travel History</p>
                                <h3 className="previous-summary-title">Previous Trips</h3>
                            </div>
                            <span className="previous-summary-count">
                                {previousTripSummaries.length} {previousTripSummaries.length === 1 ? "item" : "items"}
                            </span>
                        </div>

                        {loadingBookings ? (
                            <div className="trip-section-empty">Loading previous trips...</div>
                        ) : previousTripSummaries.length === 0 ? (
                            <div className="trip-section-empty">
                                No previous bookings or group trips yet. Completed plans and flight bookings will appear here.
                            </div>
                        ) : (
                            <div className="previous-summary-grid">
                                {previousTripSummaries.map((trip) => (
                                    <article key={trip.id} className="previous-summary-card">
                                        <div className="previous-summary-main">
                                            <span className="previous-summary-label">Destination</span>
                                            <h4>{trip.title}</h4>
                                            <p>{trip.destination}</p>
                                        </div>
                                        <div className="previous-summary-meta">
                                            <span>{trip.dates}</span>
                                            <span>{trip.groupSize}</span>
                                            <span className={`previous-status status-${trip.status.toLowerCase().replaceAll("_", "-")}`}>
                                                {trip.status.replaceAll("_", " ")}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className="previous-summary-action"
                                            onClick={() => router.push(trip.actionPath)}
                                        >
                                            {trip.actionLabel}
                                        </button>
                                        <button
                                            type="button"
                                            className={`compare-toggle ${selectedComparisonIds.includes(trip.id) ? "selected" : ""}`}
                                            onClick={() => toggleComparisonItem(trip.id)}
                                        >
                                            {selectedComparisonIds.includes(trip.id) ? "Selected" : "Compare"}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="dashboard-deals-section">
                        <div className="previous-summary-header">
                            <div>
                                <p className="previous-summary-kicker">Trip Ideas</p>
                                <h3 className="previous-summary-title">Popular Destinations, Hotels, and Flights</h3>
                            </div>
                        </div>

                        <div className="dashboard-deals-grid">
                            <div className="deal-column">
                                <div className="deal-column-header">
                                    <h4>Popular Destinations</h4>
                                    <button type="button" onClick={() => handleDestinationClick(destinationDeals[0] || null)}>Explore</button>
                                </div>
                                {loadingDestinations ? (
                                    <div className="deal-empty">Loading destinations...</div>
                                ) : destinationDeals.length === 0 ? (
                                    <div className="deal-empty">{trendingError || "No popular destinations available right now."}</div>
                                ) : (
                                    <div className="deal-card-list">
                                        {destinationDeals.map((destination) => (
                                            <article
                                                key={destination.place_id}
                                                className="deal-card"
                                                onClick={() => handleDestinationClick(destination)}
                                            >
                                                <div
                                                    className="deal-card-image"
                                                    style={{ backgroundImage: `url('${getImageUrl(destination)}')` }}
                                                />
                                                <div className="deal-card-body">
                                                    <h5>{destination.name}</h5>
                                                    <p>{destination.address || "Trending trip idea"}</p>
                                                    <div className="deal-card-meta">
                                                        <span>{destination.rating != null ? `${destination.rating.toFixed(1)} rating` : "No rating yet"}</span>
                                                        <span>Cost varies</span>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`compare-toggle deal-compare-toggle ${selectedComparisonIds.includes(`destination-${destination.place_id}`) ? "selected" : ""}`}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleComparisonItem(`destination-${destination.place_id}`);
                                                    }}
                                                >
                                                    {selectedComparisonIds.includes(`destination-${destination.place_id}`) ? "Selected" : "Compare"}
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="deal-column">
                                <div className="deal-column-header">
                                    <h4>Hotel Ideas</h4>
                                    <button type="button" onClick={() => router.push("/hotels")}>Explore</button>
                                </div>
                                {loadingHotelDeals ? (
                                    <div className="deal-empty">Loading hotel ideas...</div>
                                ) : hotelDeals.length === 0 ? (
                                    <div className="deal-empty">{hotelDealsError || "No hotel ideas available right now."}</div>
                                ) : (
                                    <div className="deal-card-list">
                                        {hotelDeals.map((hotel) => (
                                            <article key={hotel.place_id} className="deal-card">
                                                <div
                                                    className="deal-card-image"
                                                    style={{
                                                        backgroundImage: `url('${hotel.photo_reference
                                                            ? `/api/destinations/image?photo_reference=${encodeURIComponent(hotel.photo_reference)}&width=500&height=320`
                                                            : hotel.photo_url || "/trip-marseille.jpg"}')`,
                                                    }}
                                                />
                                                <div className="deal-card-body">
                                                    <h5>{hotel.name}</h5>
                                                    <p>{hotel.address || "Top-rated stay"}</p>
                                                    <div className="deal-card-meta">
                                                        <span>{hotel.rating != null ? `${hotel.rating.toFixed(1)} rating` : "No rating yet"}</span>
                                                        <span>
                                                            {hotel.price_per_night != null
                                                                ? `${hotel.currency} ${hotel.price_per_night.toFixed(0)} / night`
                                                                : "Price varies"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`compare-toggle deal-compare-toggle ${selectedComparisonIds.includes(`hotel-${hotel.place_id}`) ? "selected" : ""}`}
                                                    onClick={() => toggleComparisonItem(`hotel-${hotel.place_id}`)}
                                                >
                                                    {selectedComparisonIds.includes(`hotel-${hotel.place_id}`) ? "Selected" : "Compare"}
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="deal-column">
                                <div className="deal-column-header">
                                    <h4>Airline Ideas</h4>
                                    <button type="button" onClick={() => router.push("/bookings")}>Search</button>
                                </div>
                                {loadingFlightDeals ? (
                                    <div className="deal-empty">Loading airline ideas...</div>
                                ) : flightDeals.length === 0 ? (
                                    <div className="deal-empty">{flightDealsError || "No airline ideas available right now."}</div>
                                ) : (
                                    <div className="deal-card-list">
                                        {flightDeals.map((flight) => (
                                            <article key={flight.id} className="flight-deal-card">
                                                <div className="flight-deal-route">
                                                    <strong>{flight.departure_airport} to {flight.arrival_airport}</strong>
                                                    <span>{flight.airline}</span>
                                                </div>
                                                <div className="deal-card-meta">
                                                    <span>{flight.duration}</span>
                                                    <span>{flight.stops === 0 ? "Nonstop" : `${flight.stops} ${flight.stops === 1 ? "stop" : "stops"}`}</span>
                                                </div>
                                                <div className="flight-deal-price">
                                                    {flight.currency} {flight.price.toFixed(2)}
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`compare-toggle ${selectedComparisonIds.includes(`flight-${flight.id}`) ? "selected" : ""}`}
                                                    onClick={() => toggleComparisonItem(`flight-${flight.id}`)}
                                                >
                                                    {selectedComparisonIds.includes(`flight-${flight.id}`) ? "Selected" : "Compare"}
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="cost-comparison-section">
                        <div className="previous-summary-header">
                            <div>
                                <p className="previous-summary-kicker">Cost Planning</p>
                                <h3 className="previous-summary-title">Cost Comparison</h3>
                            </div>
                            <span className="previous-summary-count">
                                {selectedComparisonItems.length} selected
                            </span>
                        </div>

                        {selectedComparisonItems.length === 0 ? (
                            <div className="trip-section-empty">
                                Select previous trips or trip ideas to compare flights, hotels, and estimated total cost.
                            </div>
                        ) : (
                            <>
                                <div className="comparison-grid">
                                    {selectedComparisonItems.map((item) => (
                                        <article key={item.id} className="comparison-card">
                                            <div className="comparison-card-topline">
                                                <span>{item.category}</span>
                                                <button type="button" onClick={() => toggleComparisonItem(item.id)}>Remove</button>
                                            </div>
                                            <h4>{item.label}</h4>
                                            <p>{item.primary}</p>
                                            <p>{item.secondary}</p>
                                            <div className="comparison-cost">
                                                {formatDashboardMoney(item.estimatedCost, item.currency)}
                                            </div>
                                            <span className="comparison-note">{item.costNote}</span>
                                        </article>
                                    ))}
                                </div>
                                <div className="comparison-total-row">
                                    <span>{comparisonTotalLabel}</span>
                                    <strong>{formatDashboardMoney(comparisonTotal, comparisonTotalCurrency)}</strong>
                                </div>
                            </>
                        )}
                    </section>

                    {/* Trip Cards */}
                    {featuredDestination && (
                        <div
                            className="trip-card large-card"
                            onClick={() => handleDestinationClick(featuredDestination)}
                            style={{ cursor: "pointer" }}
                        >
                            <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(featuredDestination)}')` }}>
                                <div className="trip-overlay" />
                            </div>
                            <div className="trip-content">
                                <h3 className="trip-title">{featuredDestination.name}</h3>
                                <p className="trip-dates">{featuredDestination.address || "Trending destination for your next group trip"}</p>
                                {featuredDestination.rating != null && (
                                    <p className="trip-rating" style={{ marginTop: "0.5rem" }}>⭐ {featuredDestination.rating.toFixed(1)}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Finalizing Trip Section */}
                    <div className="finalizing-section">
                        <h3 className="finalizing-title">Finalizing Trip...</h3>
                        <button className="view-plan-btn" onClick={handlePlanTrip}>Plan Trip</button>
                    </div>


                    <div className="dashboard-inbox">
                        <div className="polls-header-row">
                            <h3 className="polls-title">Inbox</h3>
                            <button type="button" className="poll-section-tab" onClick={() => void loadInbox()}>
                                Refresh
                            </button>
                        </div>

                        {loadingInbox ? (
                            <div className="trip-section-empty">Loading inbox...</div>
                        ) : inboxItems.length === 0 ? (
                            <div className="trip-section-empty">No group updates yet. Poll creation and completion messages will appear here.</div>
                        ) : (
                            <div className="inbox-list">
                                {inboxItems.map((item) => (
                                    <div key={item.id} className="inbox-card">
                                        <div className="inbox-card-main">
                                            <div className="inbox-card-topline">
                                                <span className={`inbox-pill inbox-${item.notification_type.replaceAll(".", "-")}`}>{item.notification_type.replace(".", " ")}</span>
                                                <span className="inbox-time">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(item.created_at))}</span>
                                            </div>
                                            <h4 className="inbox-title">{item.title}</h4>
                                            <p className="inbox-body">{item.body}</p>
                                            {typeof item.payload["poll_question"] === "string" && (
                                                <p className="inbox-meta">Poll: {String(item.payload["poll_question"])}</p>
                                            )}
                                        </div>
                                        <button type="button" className="inbox-dismiss-btn" onClick={() => void handleDismissInboxItem(item.id)}>
                                            Dismiss
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>



                    {/* Polls Section */}
                    <div className="upcoming-polls">
                        <div className="polls-header-row">
                            <h3 className="polls-title">Group Polls</h3>
                            <div className="polls-header-actions">
                                <button type="button" className="advisor-launch-btn" onClick={handleOpenTripSuccessAdvisor}>
                                    AI Trip Advisor
                                </button>
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
                                            const progressDenominator = Math.max(poll.total_votes || 0, 1);

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
                                                                <div className="poll-option-topline">
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
                                                                </div>
                                                                <div className="poll-option-track" aria-hidden="true">
                                                                    <div
                                                                        className={`poll-option-fill ${option.is_winner ? "winner" : ""}`}
                                                                        style={{ width: `${Math.round((option.vote_count / progressDenominator) * 100)}%` }}
                                                                    />
                                                                </div>
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
                                {trendingCards.map((destination, index) => (
                                    <div
                                        key={destination.place_id}
                                        className="suggested-trip"
                                        onClick={() => handleDestinationClick(destination)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <div className="trip-image" style={{ backgroundImage: `url('${getImageUrl(destination)}')` }}>
                                            <div className="trip-overlay" />
                                            <span className="trip-percentage">#{index + 1}</span>
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
                                            {groups.length > 0 ? (
                                                <div className="booking-shortlist-row">
                                                    <select
                                                        className="booking-group-select"
                                                        value={selectedGroupByBookingId[booking.id] || ""}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setSelectedGroupByBookingId((prev) => ({ ...prev, [booking.id]: value }));
                                                        }}
                                                    >
                                                        <option value="">Select group</option>
                                                        {groups.map((group) => (
                                                            <option key={group.id} value={group.id}>{group.name}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        className="booking-shortlist-btn"
                                                        onClick={() => handleShortlistBookingToGroup(booking.id)}
                                                        disabled={Boolean(shortlistingBookingIds[booking.id])}
                                                    >
                                                        {shortlistingBookingIds[booking.id] ? "Adding..." : "Shortlist to Group Plan"}
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="booking-inline-hint">Join a group to add this booking to a group plan.</p>
                                            )}
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

            {showTripSuccessAdvisor && (
                <TripSuccessAdvisorModal
                    groups={groups.map((group) => ({ id: group.id, name: group.name }))}
                    selectedGroupId={selectedAdvisorGroupId}
                    onSelectedGroupIdChange={setSelectedAdvisorGroupId}
                    onClose={() => setShowTripSuccessAdvisor(false)}
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
