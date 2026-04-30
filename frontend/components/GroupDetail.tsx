"use client";
import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./GroupDetail.css";
import HotelSearchPanel from "./HotelSearchPanel";
import CostSummaryCard from "./CostSummaryCard";
import CostBreakdownTable from "./CostBreakdownTable";
import MemberCostBreakdown from "./MemberCostBreakdown";
import { useAuth } from "@/app/AuthContext";

type Member = {
    id: number;
    user_id: number;
    name: string;
    email: string;
    role: string;
    avatar_url?: string | null;
};

type GroupInfo = {
    id: number;
    name: string;
    description: string | null;
    status: string;
    member_count: number;
    role: string | null;
};

type Friend = {
    id: number;
    name: string;
    email: string;
    avatar_url?: string | null;
};

type ShortlistItem = {
    id: number;
    group_id: number;
    place_id: string;
    name: string;
    address: string | null;
    photo_url: string | null;
    photo_reference: string | null;
    rating: number | null;
    types: string[];
    added_by: number;
    created_at: string;
};

type FlightShortlistItem = {
    id: number;
    group_id: number;
    flight_offer_id: string;
    airline: string;
    logo_url: string | null;
    price: number;
    currency: string;
    duration: string;
    stops: number;
    departure_time: string | null;
    arrival_time: string | null;
    departure_airport: string;
    arrival_airport: string;
    cabin_class: string | null;
    emissions_kg: string | null;
    added_by: number;
    created_at: string;
};

type HotelShortlistItem = {
    id: number;
    group_id: number;
    place_id: string;
    name: string;
    address: string | null;
    photo_url: string | null;
    photo_reference: string | null;
    rating: number | null;
    price_level: string | null;
    currency: string;
    price_per_night: number | null;
    total_price: number | null;
    nights: number | null;
    types: string[];
    amenities: string[];
    booking_url: string | null;
    added_by: number;
    created_at: string;
};

type TripSuccessScore = {
    score: number | null;
    label: string;
    reasons: string[];
    conflicts: string[];
    evaluated_at: string;
    fallback: boolean;
};

type AiPlanItem = {
    title: string;
    summary: string;
    reason: string;
    estimated_cost?: number | null;
    currency?: string | null;
    metadata?: Record<string, unknown>;
};

type AiTripPlan = {
    group_id: number;
    generated_at: string;
    destination: AiPlanItem;
    flights: AiPlanItem[];
    hotels: AiPlanItem[];
    restaurants: AiPlanItem[];
    activities: AiPlanItem[];
};

type CostBreakdownItem = {
    item_id: number;
    item_type: string;
    title: string;
    estimated_cost: number | null;
    currency: string;
    is_missing: boolean;
};

type MemberCostBreakdown = {
    member_id: number;
    member_name: string;
    member_email: string;
    individual_share: number;
    amount_paid?: number;
    payment_status?: string;
};

type CostSummary = {
    total_cost: number;
    currency: string;
    per_person_cost: number;
    member_count: number;
    items_with_cost: number;
    items_missing_cost: number;
    has_missing_costs: boolean;
    breakdown: CostBreakdownItem[];
    members_breakdown: MemberCostBreakdown[];
};

type PollDecisionType = "destination" | "date" | "flight" | "hotel" | "activity" | "other";

type GroupPollOption = {
    id: number;
    label: string;
    position: number;
    vote_count: number;
    is_winner: boolean;
};

type GroupPoll = {
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
    options: GroupPollOption[];
};

type PollSection = "upcoming" | "previous";

function getScoreColor(score: number): string {
    if (score >= 80) return "#2e6b55";
    if (score >= 60) return "#d2ab3f";
    return "#c96a61";
}

function formatStops(stops: number): string {
    if (stops === 0) return "Nonstop";
    if (stops === 1) return "1 stop";
    return `${stops} stops`;
}

function parseApiError(data: unknown, fallback: string): string {
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === "string") return detail;
    }
    return fallback;
}

function toSafeId(value: string): string {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "ai-item";
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

function formatPollDateLabel(value: string | null): string {
    if (!value) return "No deadline";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No deadline";

    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function getPollDecisionLabel(type: PollDecisionType): string {
    if (type === "destination") return "Destination";
    if (type === "date") return "Date";
    if (type === "flight") return "Flight";
    if (type === "hotel") return "Hotel";
    if (type === "activity") return "Activity";
    return "Other";
}

const FLIGHT_LOGO_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90' viewBox='0 0 120 90'><rect width='120' height='90' rx='12' fill='%23eef4f0'/><text x='60' y='53' text-anchor='middle' font-size='26' fill='%232e6b55'>✈</text></svg>";

export default function GroupDetail({ groupId }: { groupId: number }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
    const [flightShortlist, setFlightShortlist] = useState<FlightShortlistItem[]>([]);
    const [hotelShortlist, setHotelShortlist] = useState<HotelShortlistItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [inviting, setInviting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editStatus, setEditStatus] = useState("");
    const [saving, setSaving] = useState(false);
    const [tripScore, setTripScore] = useState<TripSuccessScore | null>(null);
    const [aiTripPlan, setAiTripPlan] = useState<AiTripPlan | null>(null);
    const [aiPlanLoading, setAiPlanLoading] = useState(false);
    const [aiPlanGenerating, setAiPlanGenerating] = useState(false);
    const [aiPlanSavedAt, setAiPlanSavedAt] = useState<string | null>(null);
    const [aiPlanFeedback, setAiPlanFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [savingAiKey, setSavingAiKey] = useState<string | null>(null);
    const [aiForm, setAiForm] = useState({
        startDate: "",
        endDate: "",
        budget: "",
        budgetCurrency: "USD",
        accommodationPreference: "",
        notes: "",
    });
    const [scoreLoading, setScoreLoading] = useState(false);
    const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
    const [costLoading, setCostLoading] = useState(false);
    const [paymentMessage, setPaymentMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [pollSection, setPollSection] = useState<PollSection>("upcoming");
    const [pollsLoading, setPollsLoading] = useState(false);
    const [creatingPoll, setCreatingPoll] = useState(false);
    const [requestingSuggestions, setRequestingSuggestions] = useState(false);
    const [upcomingPolls, setUpcomingPolls] = useState<GroupPoll[]>([]);
    const [previousPolls, setPreviousPolls] = useState<GroupPoll[]>([]);
    const [selectedOptionByPollId, setSelectedOptionByPollId] = useState<Record<number, number>>({});
    const [submittingVoteByPollId, setSubmittingVoteByPollId] = useState<Record<number, boolean>>({});
    const [endingPollById, setEndingPollById] = useState<Record<number, boolean>>({});
    const [pollFeedback, setPollFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [pollForm, setPollForm] = useState({
        question: "",
        decisionType: "destination" as PollDecisionType,
        closesAt: getDefaultPollDeadlineInputValue(),
        optionsText: "",
    });
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const isOwner = group?.role === "owner";

    const memberUserIds = new Set(members.map((m) => m.user_id));
    const invitableFriends = friends.filter((f) => !memberUserIds.has(f.id));
    const destinationShortlist = shortlist.filter((item) => !item.types.some((type) => type.toLowerCase() === "restaurant"));
    const restaurantShortlist = shortlist.filter((item) => item.types.some((type) => type.toLowerCase() === "restaurant"));
    const heroItem = destinationShortlist[0] || restaurantShortlist[0] || hotelShortlist[0] || shortlist[0] || null;
    const heroImage = heroItem ? getShortlistImage(heroItem, "") : "";
    const heroUsesFlightCollage = !heroImage && flightShortlist.length > 0;
    const heroFlightLogos = flightShortlist.slice(0, 4);
    const heroBackgroundImage = heroImage || (heroUsesFlightCollage ? "" : "/trip-marseille.jpg");
    const visiblePolls = pollSection === "upcoming" ? upcomingPolls : previousPolls;

    useEffect(() => {
        const today = new Date();
        const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
        const inSixDays = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);
        const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
        setAiForm((prev) => ({
            ...prev,
            startDate: prev.startDate || toDateInput(inThreeDays),
            endDate: prev.endDate || toDateInput(inSixDays),
        }));
    }, []);

    function getShortlistImage(
        item: { photo_reference: string | null; photo_url: string | null },
        fallback: string = "/trip-marseille.jpg",
    ): string {
        if (item.photo_reference) {
            return `/api/destinations/image?photo_reference=${encodeURIComponent(item.photo_reference)}&width=640&height=420`;
        }
        return item.photo_url || fallback;
    }

    async function fetchTripScore() {
        setScoreLoading(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/trip-success-score`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to fetch score");
            const data: TripSuccessScore = await res.json();
            setTripScore(data);
        } catch {
            setTripScore({
                score: null,
                label: "Unavailable",
                reasons: [],
                conflicts: [],
                evaluated_at: new Date().toISOString(),
                fallback: true,
            });
        } finally {
            setScoreLoading(false);
        }
    }

    async function fetchCostSummary() {
        setCostLoading(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/cost-summary`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to fetch cost summary");
            const data: CostSummary = await res.json();
            setCostSummary(data);
        } catch (err) {
            console.error("Error fetching cost summary:", err);
            setCostSummary(null);
        } finally {
            setCostLoading(false);
        }
    }

    async function fetchSavedAiTripPlan() {
        setAiPlanLoading(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/ai-trip-plan`, {
                credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to load AI plan"));
            }
            setAiTripPlan(data.plan || null);
            setAiPlanSavedAt(data.saved_at || null);
        } catch (err) {
            setAiTripPlan(null);
            setAiPlanSavedAt(null);
            setAiPlanFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to load AI plan" });
        } finally {
            setAiPlanLoading(false);
        }
    }

    async function handleGenerateAiPlan(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const budgetValue = Number(aiForm.budget);
        if (!aiForm.startDate || !aiForm.endDate || !Number.isFinite(budgetValue) || budgetValue <= 0) {
            setAiPlanFeedback({ type: "error", text: "Start date, end date, and budget are required." });
            return;
        }

        setAiPlanGenerating(true);
        setAiPlanFeedback(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/ai-trip-plan/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    start_date: aiForm.startDate,
                    end_date: aiForm.endDate,
                    budget: budgetValue,
                    budget_currency: aiForm.budgetCurrency,
                    accommodation_preference: aiForm.accommodationPreference || null,
                    notes: aiForm.notes || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to generate AI plan"));
            }

            setAiTripPlan(data.plan || null);
            setAiPlanSavedAt(data.saved_at || null);
            setAiPlanFeedback({ type: "success", text: "AI trip plan generated and saved." });
        } catch (err) {
            setAiPlanFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to generate AI plan" });
        } finally {
            setAiPlanGenerating(false);
        }
    }

    async function handleSaveAiRecommendation(item: AiPlanItem, section: "destination" | "flight" | "hotel", index: number) {
        const key = `${section}-${index}-${item.title}`;
        setSavingAiKey(key);
        try {
            if (section === "destination") {
                const placeId = String(item.metadata?.place_id || `ai-destination-${toSafeId(item.title)}`);
                const res = await fetch(`/api/groups/${groupId}/shortlist`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        place_id: placeId,
                        name: item.title,
                        address: String(item.metadata?.address || item.summary || ""),
                        rating: typeof item.metadata?.rating === "number" ? item.metadata.rating : null,
                        types: ["ai_recommendation"],
                        estimated_cost: item.estimated_cost ?? null,
                        currency: item.currency || "USD",
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(parseApiError(data, "Failed to save destination"));
            } else if (section === "flight") {
                const offerId = String(item.metadata?.flight_offer_id || `ai-flight-${toSafeId(item.title)}`);
                const res = await fetch(`/api/groups/${groupId}/flight-shortlist`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        flight_offer_id: offerId,
                        airline: String(item.metadata?.airline || item.title),
                        logo_url: item.metadata?.logo_url || null,
                        price: Number(item.estimated_cost || 0),
                        currency: item.currency || "USD",
                        duration: String(item.metadata?.duration || "TBD"),
                        stops: Number(item.metadata?.stops || 0),
                        departure_time: item.metadata?.departure_time || null,
                        arrival_time: item.metadata?.arrival_time || null,
                        departure_airport: String(item.metadata?.departure_airport || "TBD"),
                        arrival_airport: String(item.metadata?.arrival_airport || "TBD"),
                        cabin_class: item.metadata?.cabin_class || null,
                        baggages: Array.isArray(item.metadata?.baggages) ? item.metadata?.baggages : [],
                        slices: Array.isArray(item.metadata?.slices) ? item.metadata?.slices : [],
                        emissions_kg: item.metadata?.emissions_kg || null,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(parseApiError(data, "Failed to save flight"));
            } else {
                const placeId = String(item.metadata?.place_id || `ai-hotel-${toSafeId(item.title)}`);
                const res = await fetch(`/api/groups/${groupId}/hotel-shortlist`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        place_id: placeId,
                        name: item.title,
                        address: String(item.metadata?.address || ""),
                        rating: typeof item.metadata?.rating === "number" ? item.metadata.rating : null,
                        price_level: item.metadata?.price_level || null,
                        currency: item.currency || "USD",
                        price_per_night: item.estimated_cost ?? null,
                        total_price: item.estimated_cost ?? null,
                        nights: typeof item.metadata?.nights === "number" ? item.metadata.nights : null,
                        types: ["ai_recommendation"],
                        amenities: Array.isArray(item.metadata?.amenities) ? item.metadata?.amenities : [],
                        booking_url: item.metadata?.booking_url || null,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(parseApiError(data, "Failed to save hotel"));
            }

            await Promise.all([fetchCostSummary(), fetchDataShortlists()]);
            setAiPlanFeedback({ type: "success", text: `${section[0].toUpperCase() + section.slice(1)} saved to shortlist.` });
        } catch (err) {
            setAiPlanFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to save recommendation" });
        } finally {
            setSavingAiKey(null);
        }
    }

    async function fetchDataShortlists() {
        const [shortlistRes, flightShortlistRes, hotelShortlistRes] = await Promise.all([
            fetch(`/api/groups/${groupId}/shortlist`, { credentials: "include" }),
            fetch(`/api/groups/${groupId}/flight-shortlist`, { credentials: "include" }),
            fetch(`/api/groups/${groupId}/hotel-shortlist`, { credentials: "include" }),
        ]);
        if (shortlistRes.ok) {
            const data = await shortlistRes.json().catch(() => ({ items: [] }));
            setShortlist(data.items || []);
        }
        if (flightShortlistRes.ok) {
            const data = await flightShortlistRes.json().catch(() => ({ items: [] }));
            setFlightShortlist(data.items || []);
        }
        if (hotelShortlistRes.ok) {
            const data = await hotelShortlistRes.json().catch(() => ({ items: [] }));
            setHotelShortlist(data.items || []);
        }
    }

    async function fetchGroupPolls() {
        setPollsLoading(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/polls`, {
                credentials: "include",
            });
            const data = await res.json().catch(() => ({ upcoming: [], previous: [] }));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to load group polls"));
            }

            const nextUpcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
            const nextPrevious = Array.isArray(data.previous) ? data.previous : [];
            setUpcomingPolls(nextUpcoming);
            setPreviousPolls(nextPrevious);
            setSelectedOptionByPollId((prev) => {
                const next = { ...prev };
                for (const poll of [...nextUpcoming, ...nextPrevious]) {
                    if (poll.user_vote_option_id && !next[poll.id]) {
                        next[poll.id] = poll.user_vote_option_id;
                    }
                }
                return next;
            });
        } catch (err) {
            setUpcomingPolls([]);
            setPreviousPolls([]);
            setPollFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to load group polls" });
        } finally {
            setPollsLoading(false);
        }
    }

    async function handleCreatePoll(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const question = pollForm.question.trim();
        const optionLabels = pollForm.optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (!question) {
            setPollFeedback({ type: "error", text: "Poll question is required." });
            return;
        }
        if (optionLabels.length < 2) {
            setPollFeedback({ type: "error", text: "Add at least two options." });
            return;
        }

        const closesAtDate = new Date(pollForm.closesAt);
        if (Number.isNaN(closesAtDate.getTime()) || closesAtDate <= new Date()) {
            setPollFeedback({ type: "error", text: "Set a future close date/time." });
            return;
        }

        setCreatingPoll(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/polls`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    question,
                    decision_type: pollForm.decisionType,
                    closes_at: closesAtDate.toISOString(),
                    allow_vote_update: false,
                    options: optionLabels.map((label) => ({ label })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to create poll"));
            }

            setPollForm({
                question: "",
                decisionType: "destination",
                closesAt: getDefaultPollDeadlineInputValue(),
                optionsText: "",
            });
            setAiSuggestions([]);
            setPollSection("upcoming");
            setPollFeedback({ type: "success", text: "Poll created." });
            await fetchGroupPolls();
        } catch (err) {
            setPollFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to create poll" });
        } finally {
            setCreatingPoll(false);
        }
    }

    async function handleRequestSuggestions() {
        const question = pollForm.question.trim();
        if (!question) {
            setPollFeedback({ type: "error", text: "Enter a poll question before requesting AI suggestions." });
            return;
        }

        const existingOptions = pollForm.optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        setRequestingSuggestions(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/poll-suggestions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    question,
                    decision_type: pollForm.decisionType,
                    existing_options: existingOptions,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to get AI suggestions"));
            }

            const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
            setAiSuggestions(suggestions);
            if (suggestions.length === 0) {
                setPollFeedback({ type: "error", text: "No suggestions returned. Try refining the question." });
            } else {
                setPollFeedback({ type: "success", text: "AI suggestions ready." });
            }
        } catch (err) {
            setPollFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to get AI suggestions" });
        } finally {
            setRequestingSuggestions(false);
        }
    }

    function handleAddSuggestionToForm(suggestion: string) {
        const currentOptions = pollForm.optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (currentOptions.some((option) => option.toLowerCase() === suggestion.toLowerCase())) {
            setPollFeedback({ type: "error", text: "That option is already in your poll form." });
            return;
        }

        const nextOptions = [...currentOptions, suggestion];
        setPollForm((prev) => ({
            ...prev,
            optionsText: nextOptions.join("\n"),
        }));
    }

    async function handleVote(poll: GroupPoll) {
        const selectedOptionId = selectedOptionByPollId[poll.id] || poll.user_vote_option_id;
        if (!selectedOptionId) {
            setPollFeedback({ type: "error", text: "Choose an option before voting." });
            return;
        }

        setSubmittingVoteByPollId((prev) => ({ ...prev, [poll.id]: true }));
        try {
            const res = await fetch(`/api/groups/${groupId}/polls/${poll.id}/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ option_id: selectedOptionId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to submit vote"));
            }

            setPollFeedback({ type: "success", text: "Vote recorded." });
            await fetchGroupPolls();
        } catch (err) {
            setPollFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to submit vote" });
        } finally {
            setSubmittingVoteByPollId((prev) => ({ ...prev, [poll.id]: false }));
        }
    }

    async function handleEndPollEarly(poll: GroupPoll) {
        setEndingPollById((prev) => ({ ...prev, [poll.id]: true }));
        try {
            const res = await fetch(`/api/groups/${groupId}/polls/${poll.id}/end`, {
                method: "PATCH",
                credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseApiError(data, "Failed to end poll"));
            }

            setPollFeedback({ type: "success", text: "Poll closed." });
            await fetchGroupPolls();
        } catch (err) {
            setPollFeedback({ type: "error", text: err instanceof Error ? err.message : "Failed to end poll" });
        } finally {
            setEndingPollById((prev) => ({ ...prev, [poll.id]: false }));
        }
    }

    async function handleRemoveMember(userId: number) {
        try {
            const res = await fetch(`/api/groups/${groupId}/members/${userId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to remove member");
            }
            setMembers((prev) => prev.filter((m) => m.user_id !== userId));
            await fetchCostSummary();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to remove member");
        }
    }

    function toggleSelect(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleInvite() {
        if (selectedIds.size === 0) return;
        setInviting(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ user_ids: Array.from(selectedIds) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to invite members");
            }

            const membersRes = await fetch(`/api/groups/${groupId}/members`, {
                credentials: "include",
            });
            if (membersRes.ok) {
                const data = await membersRes.json();
                setMembers(data.members || []);
            }
            setSelectedIds(new Set());
            await fetchCostSummary();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to invite members");
        } finally {
            setInviting(false);
        }
    }

    async function handleRemoveShortlistedDestination(placeId: string) {
        if (!confirm("Remove this destination from the shortlist?")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/shortlist/${encodeURIComponent(placeId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to remove destination from shortlist");
            }
            setShortlist((prev) => prev.filter((item) => item.place_id !== placeId));
            await fetchCostSummary();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to remove destination from shortlist");
        }
    }

    async function handleRemoveShortlistedFlight(flightOfferId: string) {
        if (!confirm("Remove this flight from the shortlist?")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/flight-shortlist/${encodeURIComponent(flightOfferId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to remove flight from shortlist");
            }
            setFlightShortlist((prev) => prev.filter((item) => item.flight_offer_id !== flightOfferId));
            await fetchCostSummary();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to remove flight from shortlist");
        }
    }

    async function handleRemoveShortlistedHotel(placeId: string) {
        if (!confirm("Remove this hotel from the shortlist?")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/hotel-shortlist/${encodeURIComponent(placeId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to remove hotel from shortlist");
            }
            setHotelShortlist((prev) => prev.filter((item) => item.place_id !== placeId));
            await fetchCostSummary();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to remove hotel from shortlist");
        }
    }

    async function refreshHotelShortlist() {
        try {
            const res = await fetch(`/api/groups/${groupId}/hotel-shortlist`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json().catch(() => ({ items: [] }));
            setHotelShortlist(data.items || []);
            await fetchCostSummary();
        } catch {
            // Keep UI interactive even if refresh fails.
        }
    }

    async function handleLeaveGroup() {
        if (!confirm("Are you sure you want to leave this group?")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/leave`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to leave group");
            }
            router.push("/");
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to leave group");
        }
    }

    async function handleDeleteGroup() {
        if (!confirm("Are you sure you want to delete this group? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to delete group");
            }
            router.push("/");
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete group");
        }
    }

    async function handleRoleChange(userId: number, newRole: string) {
        try {
            const res = await fetch(`/api/groups/${groupId}/members/${userId}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ role: newRole }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to update role");
            }
            setMembers((prev) =>
                prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m))
            );
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update role");
        }
    }

    function startEditing() {
        if (!group) return;
        setEditName(group.name);
        setEditStatus(group.status);
        setEditing(true);
    }

    async function handleSave() {
        if (!editName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/groups/${groupId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: editName.trim(), status: editStatus }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Failed to update group");
            }
            const data = await res.json();
            setGroup(data.group);
            setEditing(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update group");
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        async function fetchData() {
            try {
                const [groupRes, membersRes, shortlistRes, flightShortlistRes, hotelShortlistRes, friendsRes] = await Promise.all([
                    fetch(`/api/groups/${groupId}`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/members`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/shortlist`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/flight-shortlist`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/hotel-shortlist`, { credentials: "include" }),
                    fetch("/api/friends", { credentials: "include" }),
                ]);

                if (!groupRes.ok || !membersRes.ok) {
                    throw new Error("Failed to load group data");
                }

                const groupData = await groupRes.json();
                setGroup(groupData);
                const membersData = await membersRes.json();
                setMembers(membersData.members || []);

                if (shortlistRes.ok) {
                    const shortlistData = await shortlistRes.json();
                    setShortlist(shortlistData.items || []);
                }

                if (flightShortlistRes.ok) {
                    const flightShortlistData = await flightShortlistRes.json();
                    setFlightShortlist(flightShortlistData.items || []);
                }

                if (hotelShortlistRes.ok) {
                    const hotelShortlistData = await hotelShortlistRes.json();
                    setHotelShortlist(hotelShortlistData.items || []);
                }

                if (friendsRes.ok) {
                    const friendsData = await friendsRes.json();
                    setFriends(friendsData.friends || []);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
                setLoading(false);
                fetchTripScore();
                fetchCostSummary();
                fetchGroupPolls();
                fetchSavedAiTripPlan();
            }
        }
        fetchData();
    }, [groupId]);

    useEffect(() => {
        const handlePollRealtime = (event: Event) => {
            const customEvent = event as CustomEvent<{ type?: string; group_id?: number }>;
            const payload = customEvent.detail;
            if (!payload?.type || payload.group_id !== groupId) {
                return;
            }
            void fetchGroupPolls();
        };

        window.addEventListener("poll-realtime", handlePollRealtime as EventListener);
        return () => {
            window.removeEventListener("poll-realtime", handlePollRealtime as EventListener);
        };
    }, [groupId]);

    useEffect(() => {
        if (!pollFeedback) return;
        const timeout = window.setTimeout(() => setPollFeedback(null), 3800);
        return () => window.clearTimeout(timeout);
    }, [pollFeedback]);

    useEffect(() => {
        if (!aiPlanFeedback) return;
        const timeout = window.setTimeout(() => setAiPlanFeedback(null), 4200);
        return () => window.clearTimeout(timeout);
    }, [aiPlanFeedback]);

    // Handle Stripe payment redirect return
    useEffect(() => {
        const paymentStatus = searchParams.get("payment");
        const sessionId = searchParams.get("session_id");

        if (!paymentStatus) return;

        if (paymentStatus === "success" && sessionId) {
            (async () => {
                try {
                    const res = await fetch(`/api/groups/${groupId}/pay-stripe-confirm`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ session_id: sessionId }),
                    });
                    if (res.ok) {
                        setPaymentMessage({ type: "success", text: "Payment successful! Your share has been paid." });
                        fetchCostSummary();
                    } else {
                        const data = await res.json().catch(() => ({ detail: "Confirmation failed" }));
                        setPaymentMessage({ type: "error", text: data.detail || "Payment confirmation failed." });
                    }
                } catch {
                    setPaymentMessage({ type: "error", text: "Could not confirm payment. Please try again." });
                }
            })();
        } else if (paymentStatus === "cancel") {
            setPaymentMessage({ type: "error", text: "Payment was cancelled. No charges were made." });
        }

        // Clean URL params
        router.replace(`/group/${groupId}`, { scroll: false });
    }, [searchParams, groupId, router]);

    function renderPlanSection(
        items: AiPlanItem[],
        section: "destination" | "flight" | "hotel" | "restaurant" | "activity",
    ) {
        if (!items.length) {
            return <p className="group-shortlist-empty">No recommendations generated.</p>;
        }

        return (
            <div className="group-ai-plan-list">
                {items.map((item, index) => {
                    const saveKey = `${section}-${index}-${item.title}`;
                    const canSave = section === "destination" || section === "flight" || section === "hotel";
                    return (
                        <article key={saveKey} className="group-ai-plan-card">
                            <div className="group-ai-plan-card-main">
                                <h4>{item.title}</h4>
                                <p>{item.summary}</p>
                                {item.estimated_cost != null && (
                                    <span className="group-shortlist-type">
                                        {item.currency || "USD"} {item.estimated_cost.toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <div className="group-ai-plan-card-actions">
                                <details>
                                    <summary>Why this recommendation?</summary>
                                    <p>{item.reason}</p>
                                </details>
                                {canSave && (
                                    <button
                                        type="button"
                                        className="group-save-btn"
                                        disabled={savingAiKey === saveKey}
                                        onClick={() => handleSaveAiRecommendation(item, section as "destination" | "flight" | "hotel", index)}
                                    >
                                        {savingAiKey === saveKey ? "Saving..." : "Save to shortlist"}
                                    </button>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        );
    }

    if (loading) return <div className="group-detail-loading">Loading...</div>;
    if (error) return <div className="group-detail-error">{error}</div>;
    if (!group) return null;

    return (
        <div className="group-detail-container">
            <button className="group-back-btn" onClick={() => router.push("/")}>
                &larr; Back to Dashboard
            </button>

            <div className="group-detail-header">
                {editing ? (
                    <div className="group-edit-form">
                        <label htmlFor="edit-name">Group Name</label>
                        <input
                            id="edit-name"
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={255}
                        />
                        <label htmlFor="edit-status">Status</label>
                        <select
                            id="edit-status"
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                        >
                            <option value="planning">Planning</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="finalized">Finalized</option>
                        </select>
                        <div className="group-edit-actions">
                            <button className="group-save-btn" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                            </button>
                            <button className="group-cancel-btn" onClick={() => setEditing(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="group-detail-title-row">
                            <h1 className="group-detail-name">{group.name}</h1>
                            <span className={`group-detail-status status-${group.status}`}>
                                {group.status}
                            </span>
                        </div>
                        {group.description && (
                            <p className="group-detail-desc">{group.description}</p>
                        )}
                        <div className="group-header-actions">
                            {isOwner && (
                                <button className="group-edit-btn" onClick={startEditing}>
                                    Edit Group
                                </button>
                            )}
                            <button
                                className="group-itinerary-btn"
                                onClick={() => router.push(`/group/${groupId}/itinerary`)}
                            >
                                View Itinerary
                            </button>
                            <button
                                className="group-itinerary-btn"
                                onClick={() => router.push(`/group/${groupId}/chat`)}
                            >
                                View Chat
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div
                className="group-hero-banner"
                style={heroBackgroundImage ? { backgroundImage: `url(${heroBackgroundImage})` } : undefined}
            >
                {heroUsesFlightCollage && (
                    <div className="group-hero-flight-collage" aria-hidden="true">
                        {heroFlightLogos.map((item) => (
                            <div key={item.flight_offer_id} className="group-hero-flight-tile">
                                <img
                                    src={item.logo_url || FLIGHT_LOGO_FALLBACK}
                                    alt=""
                                    loading="lazy"
                                    onError={(event) => {
                                        event.currentTarget.src = FLIGHT_LOGO_FALLBACK;
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                )}
                <div className="group-hero-overlay">
                    <h2>{group.name}</h2>
                    <div className="group-hero-stats">
                        <span>{flightShortlist.length} Flights</span>
                        <span>{hotelShortlist.length} Hotels</span>
                        <span>{destinationShortlist.length + restaurantShortlist.length} Activities</span>
                    </div>
                </div>
            </div>

            <div className="group-shortlist-section">
                <div className="group-ai-plan-header">
                    <h2 className="group-shortlist-title">AI Group Trip Assistant</h2>
                    {aiPlanSavedAt && (
                        <span className="group-ai-plan-meta">
                            Last saved: {new Date(aiPlanSavedAt).toLocaleString()}
                        </span>
                    )}
                </div>

                <form className="group-ai-plan-form" onSubmit={handleGenerateAiPlan}>
                    <div className="group-poll-create-grid">
                        <div>
                            <label htmlFor="ai-start-date">Start date</label>
                            <input
                                id="ai-start-date"
                                type="date"
                                value={aiForm.startDate}
                                onChange={(event) => setAiForm((prev) => ({ ...prev, startDate: event.target.value }))}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="ai-end-date">End date</label>
                            <input
                                id="ai-end-date"
                                type="date"
                                value={aiForm.endDate}
                                onChange={(event) => setAiForm((prev) => ({ ...prev, endDate: event.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <div className="group-poll-create-grid">
                        <div>
                            <label htmlFor="ai-budget">Total group budget</label>
                            <input
                                id="ai-budget"
                                type="number"
                                min="1"
                                step="0.01"
                                value={aiForm.budget}
                                onChange={(event) => setAiForm((prev) => ({ ...prev, budget: event.target.value }))}
                                placeholder="3000"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="ai-budget-currency">Currency</label>
                            <input
                                id="ai-budget-currency"
                                type="text"
                                value={aiForm.budgetCurrency}
                                onChange={(event) => setAiForm((prev) => ({ ...prev, budgetCurrency: event.target.value.toUpperCase() }))}
                            />
                        </div>
                    </div>

                    <label htmlFor="ai-accommodation-preference">Accommodation preference (optional)</label>
                    <input
                        id="ai-accommodation-preference"
                        type="text"
                        value={aiForm.accommodationPreference}
                        onChange={(event) => setAiForm((prev) => ({ ...prev, accommodationPreference: event.target.value }))}
                        placeholder="Boutique hotels near city center"
                    />

                    <label htmlFor="ai-plan-notes">Additional constraints (optional)</label>
                    <textarea
                        id="ai-plan-notes"
                        rows={3}
                        value={aiForm.notes}
                        onChange={(event) => setAiForm((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Must be vegetarian-friendly and avoid overnight flights."
                    />

                    <button className="group-save-btn" type="submit" disabled={aiPlanGenerating}>
                        {aiPlanGenerating ? "Generating Plan..." : "Generate Plan"}
                    </button>
                </form>

                {aiPlanFeedback && (
                    <div className={`group-poll-feedback group-poll-feedback-${aiPlanFeedback.type}`}>
                        {aiPlanFeedback.text}
                    </div>
                )}

                {aiPlanLoading ? (
                    <p className="group-shortlist-empty">Loading saved AI plan...</p>
                ) : aiTripPlan ? (
                    <div className="group-ai-plan-results">
                        <h3>Recommended Destination</h3>
                        {renderPlanSection([aiTripPlan.destination], "destination")}
                        <h3>Flights</h3>
                        {renderPlanSection(aiTripPlan.flights, "flight")}
                        <h3>Hotels</h3>
                        {renderPlanSection(aiTripPlan.hotels, "hotel")}
                        <h3>Restaurants</h3>
                        {renderPlanSection(aiTripPlan.restaurants, "restaurant")}
                        <h3>Activities</h3>
                        {renderPlanSection(aiTripPlan.activities, "activity")}
                    </div>
                ) : (
                    <p className="group-shortlist-empty">No saved AI plan yet. Generate one to get complete recommendations.</p>
                )}
            </div>

            <div className="group-shortlist-section group-poll-section">
                <div className="group-poll-header">
                    <h2 className="group-shortlist-title">Group Polls</h2>
                    <div className="group-poll-tabs" role="tablist" aria-label="Poll timeline sections">
                        <button
                            className={`group-poll-tab ${pollSection === "upcoming" ? "is-active" : ""}`}
                            type="button"
                            onClick={() => setPollSection("upcoming")}
                        >
                            Active ({upcomingPolls.length})
                        </button>
                        <button
                            className={`group-poll-tab ${pollSection === "previous" ? "is-active" : ""}`}
                            type="button"
                            onClick={() => setPollSection("previous")}
                        >
                            Closed ({previousPolls.length})
                        </button>
                    </div>
                </div>

                {pollFeedback && (
                    <div className={`group-poll-feedback group-poll-feedback-${pollFeedback.type}`}>
                        {pollFeedback.text}
                    </div>
                )}

                <form className="group-poll-create-form" onSubmit={handleCreatePoll}>
                    <h3>Create A Poll</h3>
                    <label htmlFor="poll-question">Question</label>
                    <input
                        id="poll-question"
                        type="text"
                        value={pollForm.question}
                        onChange={(event) => setPollForm((prev) => ({ ...prev, question: event.target.value }))}
                        placeholder="Where should we go this summer?"
                        maxLength={1000}
                        required
                    />

                    <div className="group-poll-create-grid">
                        <div>
                            <label htmlFor="poll-decision-type">Option Type</label>
                            <select
                                id="poll-decision-type"
                                value={pollForm.decisionType}
                                onChange={(event) => {
                                    setPollForm((prev) => ({ ...prev, decisionType: event.target.value as PollDecisionType }));
                                    setAiSuggestions([]);
                                }}
                            >
                                <option value="destination">Destination</option>
                                <option value="date">Date</option>
                                <option value="flight">Flight</option>
                                <option value="hotel">Hotel</option>
                                <option value="activity">Activity</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="poll-closes-at">Close Date/Time</label>
                            <input
                                id="poll-closes-at"
                                type="datetime-local"
                                value={pollForm.closesAt}
                                onChange={(event) => setPollForm((prev) => ({ ...prev, closesAt: event.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <label htmlFor="poll-options">Options (one per line, minimum two)</label>
                    <textarea
                        id="poll-options"
                        value={pollForm.optionsText}
                        onChange={(event) => setPollForm((prev) => ({ ...prev, optionsText: event.target.value }))}
                        placeholder={`Paris\nTokyo\nLisbon`}
                        rows={5}
                    />

                    <div className="group-poll-ai-row">
                        <button
                            type="button"
                            className="group-itinerary-btn"
                            onClick={handleRequestSuggestions}
                            disabled={requestingSuggestions}
                        >
                            {requestingSuggestions ? "Generating Suggestions..." : "Get AI Suggestions"}
                        </button>
                        <p>Suggestions are based on group shortlist data and member preferences.</p>
                    </div>

                    {aiSuggestions.length > 0 && (
                        <div className="group-poll-suggestions">
                            <h4>AI Suggestions</h4>
                            <div className="group-poll-suggestion-list">
                                {aiSuggestions.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        className="group-poll-suggestion-chip"
                                        onClick={() => handleAddSuggestionToForm(suggestion)}
                                    >
                                        + {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <button className="group-save-btn" type="submit" disabled={creatingPoll}>
                        {creatingPoll ? "Creating Poll..." : "Create Poll"}
                    </button>
                </form>

                {pollsLoading ? (
                    <p className="group-shortlist-empty">Loading polls...</p>
                ) : visiblePolls.length === 0 ? (
                    <p className="group-shortlist-empty">
                        {pollSection === "upcoming" ? "No active polls yet." : "No closed polls yet."}
                    </p>
                ) : (
                    <div className="group-poll-list">
                        {visiblePolls.map((poll) => {
                            const isClosed = poll.status === "closed";
                            const selectedOptionId = selectedOptionByPollId[poll.id] || poll.user_vote_option_id;

                            return (
                                <div key={poll.id} className="group-poll-card">
                                    <div className="group-poll-card-header">
                                        <div>
                                            <h3>{poll.question}</h3>
                                            <p>
                                                {getPollDecisionLabel(poll.decision_type)} . {poll.total_votes}/{poll.member_count} votes .
                                                {" "}
                                                {isClosed
                                                    ? `Closed ${formatPollDateLabel(poll.closed_at)}`
                                                    : `Closes ${formatPollDateLabel(poll.closes_at)}`}
                                            </p>
                                        </div>
                                        {poll.created_by === user?.id && !isClosed && (
                                            <button
                                                type="button"
                                                className="group-poll-close-btn"
                                                onClick={() => handleEndPollEarly(poll)}
                                                disabled={Boolean(endingPollById[poll.id])}
                                            >
                                                {endingPollById[poll.id] ? "Closing..." : "Close Poll"}
                                            </button>
                                        )}
                                    </div>

                                    <div className="group-poll-options">
                                        {poll.options.map((option) => (
                                            <label
                                                key={option.id}
                                                className={`group-poll-option ${option.is_winner ? "is-winner" : ""}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`poll-${poll.id}`}
                                                    value={option.id}
                                                    checked={selectedOptionId === option.id}
                                                    disabled={isClosed}
                                                    onChange={() => {
                                                        setSelectedOptionByPollId((prev) => ({ ...prev, [poll.id]: option.id }));
                                                    }}
                                                />
                                                <span className="group-poll-option-label">{option.label}</span>
                                                <span className="group-poll-option-count">{option.vote_count}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {!isClosed && (
                                        <button
                                            type="button"
                                            className="group-save-btn"
                                            onClick={() => handleVote(poll)}
                                            disabled={Boolean(submittingVoteByPollId[poll.id])}
                                        >
                                            {submittingVoteByPollId[poll.id] ? "Submitting..." : "Submit Vote"}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="group-members-section">
                <h2 className="group-members-title">
                    Members ({members.length})
                </h2>
                <div className="group-members-list">
                    {members.map((m) => (
                        <div key={m.id} className="group-member-row">
                            <div className="group-member-info">
                                <img src={m.avatar_url || "/UserIcon.svg"} alt={m.name} className="group-member-avatar" />
                                <div>
                                    <span className="group-member-name">{m.name}</span>
                                    <span className="group-member-email">{m.email}</span>
                                </div>
                            </div>
                            <div className="group-member-actions">
                                {isOwner && m.role !== "owner" ? (
                                    <>
                                        <select
                                            className="group-role-select"
                                            value={m.role}
                                            onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                                        >
                                            <option value="member">Member</option>
                                            <option value="admin">Admin</option>
                                            <option value="viewer">Viewer</option>
                                        </select>
                                        <button
                                            className="group-remove-btn"
                                            onClick={() => handleRemoveMember(m.user_id)}
                                        >
                                            Remove
                                        </button>
                                    </>
                                ) : (
                                    <span className={`group-member-role ${m.role === "owner" ? "role-owner" : ""}`}>
                                        {m.role}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="group-shortlist-section">
                <HotelSearchPanel
                    title="Search Hotels For This Group"
                    subtitle="Compare hotel options with travel dates, guest count, room count, and sorting."
                    initialDestination={shortlist[0]?.name || ""}
                    groupId={groupId}
                    onShortlistChange={refreshHotelShortlist}
                />
            </div>

            <div className="group-shortlist-section">
                <h2 className="group-shortlist-title">Shortlisted Accommodations ({hotelShortlist.length})</h2>
                {hotelShortlist.length === 0 ? (
                    <p className="group-shortlist-empty">No hotels shortlisted yet.</p>
                ) : (
                    <div className="group-shortlist-list">
                        {hotelShortlist.map((item) => (
                            <div key={item.id} className="group-shortlist-card">
                                <img
                                    src={getShortlistImage(item)}
                                    alt={item.name}
                                    className="group-shortlist-thumb"
                                    loading="lazy"
                                />
                                <div className="group-shortlist-main">
                                    <h3 className="group-shortlist-name">{item.name}</h3>
                                    {item.address && <p className="group-shortlist-address">{item.address}</p>}
                                    <div className="group-shortlist-meta">
                                        {item.rating != null && (
                                            <span className="group-shortlist-rating">★ {item.rating.toFixed(1)}</span>
                                        )}
                                        {item.price_per_night != null && (
                                            <span className="group-shortlist-type">
                                                {item.currency} {item.price_per_night.toFixed(2)} / night
                                            </span>
                                        )}
                                        {item.nights != null && item.total_price != null && (
                                            <span className="group-shortlist-type">
                                                {item.currency} {item.total_price.toFixed(2)} total ({item.nights} night{item.nights === 1 ? "" : "s"})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="group-shortlist-actions">
                                    <button
                                        className="group-shortlist-remove-btn"
                                        onClick={() => handleRemoveShortlistedHotel(item.place_id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="group-shortlist-section">
                <h2 className="group-shortlist-title">Shortlisted Destinations ({destinationShortlist.length})</h2>
                {destinationShortlist.length === 0 ? (
                    <p className="group-shortlist-empty">No destinations shortlisted yet.</p>
                ) : (
                    <div className="group-shortlist-list">
                        {destinationShortlist.map((item) => (
                            <div key={item.id} className="group-shortlist-card">
                                <img
                                    src={getShortlistImage(item)}
                                    alt={item.name}
                                    className="group-shortlist-thumb"
                                    loading="lazy"
                                />
                                <div
                                    className="group-shortlist-main"
                                    onClick={() => router.push(`/destination/${item.place_id}`)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <h3 className="group-shortlist-name">{item.name}</h3>
                                    {item.address && <p className="group-shortlist-address">{item.address}</p>}
                                    <div className="group-shortlist-meta">
                                        {item.rating != null && (
                                            <span className="group-shortlist-rating">★ {item.rating.toFixed(1)}</span>
                                        )}
                                        {item.types?.slice(0, 3).map((type) => (
                                            <span key={`${item.id}-${type}`} className="group-shortlist-type">
                                                {type.replaceAll("_", " ")}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="group-shortlist-actions">
                                    <button
                                        className="group-shortlist-remove-btn"
                                        onClick={() => handleRemoveShortlistedDestination(item.place_id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="group-shortlist-section">
                <h2 className="group-shortlist-title">Shortlisted Restaurants ({restaurantShortlist.length})</h2>
                {restaurantShortlist.length === 0 ? (
                    <p className="group-shortlist-empty">No restaurants shortlisted yet.</p>
                ) : (
                    <div className="group-shortlist-list">
                        {restaurantShortlist.map((item) => (
                            <div key={item.id} className="group-shortlist-card">
                                <img
                                    src={getShortlistImage(item)}
                                    alt={item.name}
                                    className="group-shortlist-thumb"
                                    loading="lazy"
                                />
                                <div className="group-shortlist-main">
                                    <h3 className="group-shortlist-name">{item.name}</h3>
                                    {item.address && <p className="group-shortlist-address">{item.address}</p>}
                                    <div className="group-shortlist-meta">
                                        {item.rating != null && (
                                            <span className="group-shortlist-rating">★ {item.rating.toFixed(1)}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="group-shortlist-actions">
                                    <button
                                        className="group-shortlist-remove-btn"
                                        onClick={() => handleRemoveShortlistedDestination(item.place_id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="group-shortlist-section">
                <h2 className="group-shortlist-title">Shortlisted Flights ({flightShortlist.length})</h2>
                {flightShortlist.length === 0 ? (
                    <p className="group-shortlist-empty">No flights shortlisted yet.</p>
                ) : (
                    <div className="group-shortlist-list">
                        {flightShortlist.map((item) => (
                            <div key={item.id} className="group-shortlist-card">
                                <img
                                    src={item.logo_url || FLIGHT_LOGO_FALLBACK}
                                    alt={`${item.airline} logo`}
                                    className="group-flight-logo"
                                    loading="lazy"
                                    onError={(event) => {
                                        event.currentTarget.src = FLIGHT_LOGO_FALLBACK;
                                    }}
                                />
                                <div className="group-shortlist-main group-flight-shortlist-main">
                                    <h3 className="group-shortlist-name">{item.airline}</h3>
                                    <p className="group-shortlist-address">
                                        {item.departure_airport} {item.departure_time || "--:--"} → {item.arrival_airport} {item.arrival_time || "--:--"}
                                    </p>
                                    <div className="group-shortlist-meta">
                                        <span className="group-shortlist-type">{item.currency} {item.price.toLocaleString()}</span>
                                        <span className="group-shortlist-type">{item.duration}</span>
                                        <span className="group-shortlist-type">{formatStops(item.stops)}</span>
                                        {item.cabin_class && (
                                            <span className="group-shortlist-type">{item.cabin_class.replaceAll("_", " ")}</span>
                                        )}
                                        {item.emissions_kg && (
                                            <span className="group-shortlist-type">{item.emissions_kg} kg CO2</span>
                                        )}
                                    </div>
                                </div>
                                <div className="group-shortlist-actions">
                                    <button
                                        className="group-shortlist-remove-btn"
                                        onClick={() => handleRemoveShortlistedFlight(item.flight_offer_id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {invitableFriends.length > 0 && (
                <div className="group-invite-section">
                    <h2 className="group-invite-title">Invite Friends</h2>
                    <div className="group-invite-list">
                        {invitableFriends.map((f) => (
                            <label key={f.id} className="group-invite-row">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(f.id)}
                                    onChange={() => toggleSelect(f.id)}
                                />
                                <img src={f.avatar_url || "/UserIcon.svg"} alt={f.name} className="group-member-avatar" />
                                <div>
                                    <span className="group-member-name">{f.name}</span>
                                    <span className="group-member-email">{f.email}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                    <button
                        className="group-invite-btn"
                        disabled={selectedIds.size === 0 || inviting}
                        onClick={handleInvite}
                    >
                        {inviting ? "Inviting..." : `Invite (${selectedIds.size})`}
                    </button>
                </div>
            )}

            {/* Cost Summary Section */}
            {costSummary && (
                <div className="group-cost-section">
                    <CostSummaryCard
                        totalCost={costSummary.total_cost}
                        perPersonCost={costSummary.per_person_cost}
                        currency={costSummary.currency}
                        memberCount={costSummary.member_count}
                        itemsWithCost={costSummary.items_with_cost}
                        itemsMissingCost={costSummary.items_missing_cost}
                        hasMissingCosts={costSummary.has_missing_costs}
                    />
                    {costSummary.breakdown.length > 0 && (
                        <CostBreakdownTable
                            items={costSummary.breakdown}
                            currency={costSummary.currency}
                        />
                    )}
                    {costSummary.members_breakdown.length > 0 && (
                        <MemberCostBreakdown
                            members={costSummary.members_breakdown}
                            currency={costSummary.currency}
                            currentUserId={user?.id ?? null}
                            groupId={groupId}
                            onPaymentComplete={() => {
                                fetchCostSummary();
                                setPaymentMessage({ type: "success", text: "Payment successful! Your share has been paid." });
                            }}
                        />
                    )}
                    {paymentMessage && (
                        <div className={`payment-message payment-message-${paymentMessage.type}`}>
                            {paymentMessage.text}
                            <button onClick={() => setPaymentMessage(null)} className="payment-message-close">×</button>
                        </div>
                    )}
                </div>
            )}

            <div className="group-score-section">
                <div className="group-score-header-row">
                    <h2 className="group-score-title">AI Trip Success Score</h2>
                    <button
                        className="group-score-refresh-btn"
                        onClick={fetchTripScore}
                        disabled={scoreLoading}
                    >
                        {scoreLoading ? "Analysing…" : "Refresh Score"}
                    </button>
                </div>

                {scoreLoading && !tripScore && (
                    <p className="group-score-loading">Getting AI analysis…</p>
                )}

                {tripScore && (
                    <div className="group-score-card">
                        {tripScore.fallback ? (
                            <p className="group-score-unavailable">
                                Score temporarily unavailable — try again shortly.
                            </p>
                        ) : (
                            <>
                                <div className="group-score-gauge-row">
                                    <div
                                        className="group-score-gauge"
                                        style={{
                                            background: `conic-gradient(${getScoreColor(tripScore.score!)} 0 ${tripScore.score}%, #e8e8e8 ${tripScore.score}% 100%)`,
                                        }}
                                        aria-label={`Trip success score ${tripScore.score} percent`}
                                    >
                                        <div className="group-score-gauge-inner">
                                            <strong>{tripScore.score}%</strong>
                                            <span>{tripScore.label}</span>
                                        </div>
                                    </div>
                                    <div className="group-score-meta">
                                        <p className="group-score-meta-heading">Chance of a Successful Trip</p>
                                        <p className="group-score-meta-time">
                                            Evaluated at {new Date(tripScore.evaluated_at).toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>

                                {tripScore.reasons.length > 0 && (
                                    <div className="group-score-reasons">
                                        <h4>Positive Factors</h4>
                                        <ul>
                                            {tripScore.reasons.map((r, i) => (
                                                <li key={i} className="group-score-reason-item">{r}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {tripScore.conflicts.length > 0 && (
                                    <div className="group-score-conflicts">
                                        <h4>Conflicts &amp; Risks</h4>
                                        <ul>
                                            {tripScore.conflicts.map((c, i) => (
                                                <li key={i} className="group-score-conflict-item">{c}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="group-danger-zone">
                {isOwner ? (
                    <button className="group-delete-btn" onClick={handleDeleteGroup}>
                        Delete Group
                    </button>
                ) : (
                    <button className="group-leave-btn" onClick={handleLeaveGroup}>
                        Leave Group
                    </button>
                )}
            </div>
        </div>
    );
}
