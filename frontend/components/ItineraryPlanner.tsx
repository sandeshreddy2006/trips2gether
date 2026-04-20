"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./ItineraryPlanner.css";
import CostSummaryCard from "./CostSummaryCard";
import CostBreakdownTable from "./CostBreakdownTable";
import MemberCostBreakdown from "./MemberCostBreakdown";
import { useAuth } from "@/app/AuthContext";

type ItineraryPlan = {
    id: number;
    group_id: number;
    title: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    item_count: number;
    shared_notes: string | null;
    starts_at: string | null;
    ends_at: string | null;
};

type ItineraryItem = {
    id: number;
    trip_plan_id: number;
    item_type: "flight" | "accommodation" | "dining" | "activity" | "transfer" | "other";
    title: string;
    sort_order: number;
    start_at: string;
    end_at: string | null;
    location_name: string | null;
    location_address: string | null;
    notes: string | null;
    source_kind: string | null;
    source_reference: string | null;
    details: Record<string, unknown>;
    created_by: number;
    created_at: string;
    updated_at: string;
    display_date: string;
    display_time: string;
    display_location: string;
};

type ItineraryResponse = {
    trip_plan: ItineraryPlan;
    items: ItineraryItem[];
    is_empty: boolean;
    group_name: string | null;
    group_status: string | null;
    warnings?: string[];
};

type FormState = {
    itemType: ItineraryItem["item_type"];
    title: string;
    date: string;
    startTime: string;
    endDate: string;
    endTime: string;
    locationName: string;
    locationAddress: string;
    notes: string;
    sourceKind: string;
    sourceReference: string;
};

type TimelineSegment = "single" | "start" | "middle" | "end";

type TimelineEntry = {
    dayKey: string;
    sortAt: number;
    sortOrder: number;
    segment: TimelineSegment;
    item: ItineraryItem;
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

const ITEM_LABELS: Record<ItineraryItem["item_type"], string> = {
    flight: "Flight",
    accommodation: "Stay",
    dining: "Dining",
    activity: "Activity",
    transfer: "Transfer",
    other: "Other",
};

const ITEM_ICONS: Record<ItineraryItem["item_type"], string> = {
    flight: "✈",
    accommodation: "◫",
    dining: "☕",
    activity: "★",
    transfer: "↔",
    other: "•",
};

function toDateTimeInputValue(date: string, time: string): string {
    if (!date || !time) return "";
    return `${date}T${time}:00`;
}

function formatTimelineKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function formatTimeLabel(item: ItineraryItem): string {
    const start = new Date(item.start_at);
    const end = item.end_at ? new Date(item.end_at) : null;
    if (Number.isNaN(start.getTime())) return item.display_time;
    const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
    });
    const startLabel = formatter.format(start);
    if (!end || Number.isNaN(end.getTime())) return startLabel;
    const endLabel = formatter.format(end);
    return `${startLabel} - ${endLabel}`;
}

function formatTimeValue(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatDateTimeValue(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function isSameDay(start: Date, end: Date): boolean {
    return (
        start.getFullYear() === end.getFullYear()
        && start.getMonth() === end.getMonth()
        && start.getDate() === end.getDate()
    );
}

function getStartOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function getItemRangeLabel(item: ItineraryItem): string {
    const start = new Date(item.start_at);
    const end = item.end_at ? new Date(item.end_at) : null;

    if (Number.isNaN(start.getTime())) {
        return item.display_time;
    }
    if (!end || Number.isNaN(end.getTime())) {
        return formatDateTimeValue(start);
    }
    if (isSameDay(start, end)) {
        return `${formatDateTimeValue(start)} - ${formatTimeValue(end)}`;
    }

    return `${formatDateTimeValue(start)} -> ${formatDateTimeValue(end)}`;
}

function getSegmentTimeLabel(entry: TimelineEntry): string {
    const start = new Date(entry.item.start_at);
    const end = entry.item.end_at ? new Date(entry.item.end_at) : null;

    if (Number.isNaN(start.getTime())) {
        return entry.item.display_time;
    }

    if (entry.segment === "single") {
        return formatTimeLabel(entry.item);
    }
    if (entry.segment === "start") {
        return `Starts ${formatTimeValue(start)}`;
    }
    if (entry.segment === "middle") {
        return "Continues all day";
    }
    if (end && !Number.isNaN(end.getTime())) {
        return `Ends ${formatTimeValue(end)}`;
    }
    return "Ends";
}

function getSegmentBadge(entry: TimelineEntry): string | null {
    if (entry.segment === "single") return null;
    if (entry.segment === "start") return "Day 1";
    if (entry.segment === "middle") return "Continues";
    return "Final day";
}

function expandTimelineEntries(item: ItineraryItem): TimelineEntry[] {
    const start = new Date(item.start_at);
    const end = item.end_at ? new Date(item.end_at) : null;

    if (Number.isNaN(start.getTime())) {
        return [{
            dayKey: parseDateKey(item.start_at),
            sortAt: new Date(item.created_at).getTime() || 0,
            sortOrder: item.sort_order,
            segment: "single",
            item,
        }];
    }

    if (!end || Number.isNaN(end.getTime()) || end <= start || isSameDay(start, end)) {
        return [{
            dayKey: parseDateKey(item.start_at),
            sortAt: start.getTime(),
            sortOrder: item.sort_order,
            segment: "single",
            item,
        }];
    }

    const entries: TimelineEntry[] = [];
    const startDay = getStartOfDay(start);
    const endDay = getStartOfDay(end);

    let current = startDay;
    let index = 0;
    while (current <= endDay) {
        const dayKey = parseDateKey(current.toISOString());
        const isStart = index === 0;
        const isEnd = isSameDay(current, endDay);

        let segment: TimelineSegment = "middle";
        let sortAt = current.getTime();

        if (isStart) {
            segment = "start";
            sortAt = start.getTime();
        } else if (isEnd) {
            segment = "end";
            sortAt = end.getTime();
        } else {
            sortAt = current.getTime() + (12 * 60 * 60 * 1000);
        }

        entries.push({ dayKey, sortAt, sortOrder: item.sort_order, segment, item });
        current = addDays(current, 1);
        index += 1;
    }

    return entries;
}

function parseDateKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatTimeInputValue(date: Date): string {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

function createEmptyFormState(): FormState {
    return {
        itemType: "activity",
        title: "",
        date: "",
        startTime: "",
        endDate: "",
        endTime: "",
        locationName: "",
        locationAddress: "",
        notes: "",
        sourceKind: "manual",
        sourceReference: "",
    };
}

function createFormStateFromItem(item: ItineraryItem): FormState {
    const start = new Date(item.start_at);
    const end = item.end_at ? new Date(item.end_at) : null;

    return {
        itemType: item.item_type,
        title: item.title,
        date: Number.isNaN(start.getTime()) ? "" : formatDateInputValue(start),
        startTime: Number.isNaN(start.getTime()) ? "" : formatTimeInputValue(start),
        endDate: end && !Number.isNaN(end.getTime()) ? formatDateInputValue(end) : "",
        endTime: end && !Number.isNaN(end.getTime()) ? formatTimeInputValue(end) : "",
        locationName: item.location_name || "",
        locationAddress: item.location_address || "",
        notes: item.notes || "",
        sourceKind: item.source_kind || "manual",
        sourceReference: item.source_reference || "",
    };
}

function overlaps(candidateStart: Date, candidateEnd: Date | null, existingStart: Date, existingEnd: Date | null): boolean {
    const normalizedCandidateEnd = candidateEnd ?? candidateStart;
    const normalizedExistingEnd = existingEnd ?? existingStart;
    return candidateStart <= normalizedExistingEnd && existingStart <= normalizedCandidateEnd;
}

function getConflictWarning(
    items: ItineraryItem[],
    candidateStart: Date,
    candidateEnd: Date | null,
    ignoreItemId: number | null,
): string | null {
    const conflictingTitles = items
        .filter((item) => item.id !== ignoreItemId)
        .filter((item) => {
            const itemStart = new Date(item.start_at);
            const itemEnd = item.end_at ? new Date(item.end_at) : null;
            if (Number.isNaN(itemStart.getTime())) return false;
            if (itemEnd && Number.isNaN(itemEnd.getTime())) return false;
            return overlaps(candidateStart, candidateEnd, itemStart, itemEnd);
        })
        .map((item) => item.title);

    if (conflictingTitles.length === 0) return null;

    const sample = conflictingTitles.slice(0, 3).join(", ");
    const suffix = conflictingTitles.length > 3 ? ", and more" : "";
    return `Time conflict: overlaps with ${sample}${suffix}.`;
}

function getApiErrorMessage(data: unknown, fallback: string): string {
    if (typeof data === "string") {
        return data;
    }

    if (data && typeof data === "object") {
        const detail = (data as { detail?: unknown; message?: unknown }).detail ?? (data as { message?: unknown }).message;
        if (typeof detail === "string") {
            return detail;
        }
        if (Array.isArray(detail)) {
            return detail
                .map((entry) => {
                    if (typeof entry === "string") return entry;
                    if (entry && typeof entry === "object" && "msg" in entry) {
                        return String((entry as { msg?: unknown }).msg ?? "");
                    }
                    return JSON.stringify(entry);
                })
                .filter(Boolean)
                .join(" ") || fallback;
        }
        if (detail && typeof detail === "object") {
            return JSON.stringify(detail);
        }
        if (typeof (data as { message?: unknown }).message === "string") {
            return (data as { message?: string }).message as string;
        }
    }

    return fallback;
}

type WarningModalState = {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    tone: "warning" | "danger";
    onConfirm: () => void;
};

export default function ItineraryPlanner({ groupId }: { groupId: number }) {
    const router = useRouter();
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const historyIdParam = searchParams.get("historyId");
    const parsedHistoryId = historyIdParam ? Number(historyIdParam) : null;
    const historyId = parsedHistoryId && Number.isFinite(parsedHistoryId) ? parsedHistoryId : null;
    const isArchivedSnapshotView = historyId !== null;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [response, setResponse] = useState<ItineraryResponse | null>(null);
    const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [savingNotes, setSavingNotes] = useState(false);
    const [updatingTripState, setUpdatingTripState] = useState(false);
    const [form, setForm] = useState<FormState>(createEmptyFormState());
    const [sharedNotesDraft, setSharedNotesDraft] = useState("");
    const [warningModal, setWarningModal] = useState<WarningModalState | null>(null);

    const items = response?.items || [];
    const groupName = response?.group_name || "Trip";
    const groupStatus = response?.group_status || "planning";
    const effectiveGroupStatus = isArchivedSnapshotView ? "archived" : groupStatus;
    const isTimelineLocked = effectiveGroupStatus === "active" || effectiveGroupStatus === "archived";
    const itemCount = response?.trip_plan.item_count ?? items.length;
    const emptyState = !loading && items.length === 0;
    const editingItem = editingItemId === null ? null : items.find((item) => item.id === editingItemId) || null;

    const draftWarning = useMemo(() => {
        if (!form.date || !form.startTime) return null;

        const startAt = new Date(toDateTimeInputValue(form.date, form.startTime));
        if (Number.isNaN(startAt.getTime())) return null;

        const endAt = form.endDate && form.endTime ? new Date(toDateTimeInputValue(form.endDate, form.endTime)) : null;
        if (endAt && Number.isNaN(endAt.getTime())) return null;
        if (endAt && endAt < startAt) return null;

        return getConflictWarning(items, startAt, endAt, editingItem?.id ?? null);
    }, [editingItem?.id, form.date, form.endDate, form.endTime, form.startTime, items]);

    const groupedItems = useMemo(() => {
        const groups = new Map<string, TimelineEntry[]>();
        for (const item of items) {
            const entries = expandTimelineEntries(item);
            for (const entry of entries) {
                if (!groups.has(entry.dayKey)) {
                    groups.set(entry.dayKey, []);
                }
                groups.get(entry.dayKey)!.push(entry);
            }
        }

        return Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dayKey, entries]) => {
                const sorted = entries.sort((first, second) => {
                    if (first.sortOrder !== second.sortOrder) {
                        return first.sortOrder - second.sortOrder;
                    }
                    if (first.sortAt !== second.sortAt) {
                        return first.sortAt - second.sortAt;
                    }
                    const firstCreated = new Date(first.item.created_at).getTime();
                    const secondCreated = new Date(second.item.created_at).getTime();
                    if (firstCreated !== secondCreated) {
                        return firstCreated - secondCreated;
                    }
                    return first.item.id - second.item.id;
                });
                return [dayKey, sorted] as [string, TimelineEntry[]];
            });
    }, [items]);

    const fetchCostSummary = async () => {
        if (isArchivedSnapshotView || !groupId) {
            return;
        }

        try {
            const costRes = await fetch(`/api/groups/${groupId}/cost-summary`, {
                credentials: "include",
            });
            if (costRes.ok) {
                const costData = await costRes.json();
                setCostSummary(costData as CostSummary);
            }
        } catch (err) {
            console.error("Error fetching cost summary:", err);
        }
    };

    const refreshItinerary = async () => {
        const endpoint = isArchivedSnapshotView
            ? `/api/itinerary/history/${historyId}`
            : `/api/groups/${groupId}/itinerary`;

        const res = await fetch(endpoint, {
            credentials: "include",
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(getApiErrorMessage(data, "Failed to load itinerary"));
        }

        setResponse(data as ItineraryResponse);
        setSharedNotesDraft((data as ItineraryResponse).trip_plan.shared_notes || "");

        await fetchCostSummary();
    };

    useEffect(() => {
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const loadItinerary = async () => {
            setLoading(true);
            setError(null);
            try {
                if (!cancelled) {
                    await refreshItinerary();
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load itinerary");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadItinerary();
        intervalId = setInterval(() => {
            if (!cancelled) {
                void refreshItinerary();
            }
        }, 20000);

        return () => {
            cancelled = true;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [groupId, historyId, isArchivedSnapshotView]);

    function updateFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError(null);
    }

    function resetForm() {
        setEditingItemId(null);
        setForm(createEmptyFormState());
    }

    function startEditingItem(item: ItineraryItem) {
        setEditingItemId(item.id);
        setForm(createFormStateFromItem(item));
        setError(null);
    }

    function openWarningModal(modal: WarningModalState) {
        setWarningModal(modal);
    }

    function closeWarningModal() {
        setWarningModal(null);
    }

    async function updateTripState(nextState: "upcoming" | "active" | "archived") {
        if (isArchivedSnapshotView) return;
        setUpdatingTripState(true);
        setError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/trip-state`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ status: nextState }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(getApiErrorMessage(data, "Failed to update trip state"));
            }
            await refreshItinerary();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update trip state");
        } finally {
            setUpdatingTripState(false);
        }
    }

    async function saveSharedNotes() {
        if (isArchivedSnapshotView) {
            setError("Archived snapshots are read-only.");
            return;
        }
        setSavingNotes(true);
        setError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/itinerary/notes`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ shared_notes: sharedNotesDraft }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(getApiErrorMessage(data, "Failed to save shared notes"));
            }
            setResponse(data as ItineraryResponse);
            setSharedNotesDraft((data as ItineraryResponse).trip_plan.shared_notes || "");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save shared notes");
        } finally {
            setSavingNotes(false);
        }
    }

    async function startNewTrip() {
        if (isArchivedSnapshotView) return;
        setUpdatingTripState(true);
        setError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/itinerary/new-trip`, {
                method: "POST",
                credentials: "include",
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(getApiErrorMessage(data, "Failed to start a new trip"));
            }
            setResponse(data as ItineraryResponse);
            setSharedNotesDraft((data as ItineraryResponse).trip_plan.shared_notes || "");
            resetForm();
            await fetchCostSummary();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start a new trip");
        } finally {
            setUpdatingTripState(false);
        }
    }

    async function performSubmit(allowWarningOverride: boolean) {
        if (!form.title.trim()) {
            setError("Add a title for the itinerary item.");
            return;
        }
        if (!form.date || !form.startTime) {
            setError("Add a date and start time.");
            return;
        }

        const startAt = toDateTimeInputValue(form.date, form.startTime);
        const endAt = form.endDate && form.endTime ? toDateTimeInputValue(form.endDate, form.endTime) : null;

        if (endAt && new Date(endAt) < new Date(startAt)) {
            setError("End time cannot be before start time.");
            return;
        }

        if (!allowWarningOverride && draftWarning) {
            openWarningModal({
                title: "Time conflict detected",
                message: `${draftWarning} Save anyway?`,
                confirmLabel: "Save anyway",
                cancelLabel: "Cancel",
                tone: "warning",
                onConfirm: () => {
                    void performSubmit(true);
                },
            });
            return;
        }

        setSaving(true);
        try {
            const isEditing = editingItemId !== null;
            const res = await fetch(
                isEditing
                    ? `/api/groups/${groupId}/itinerary/items/${editingItemId}`
                    : `/api/groups/${groupId}/itinerary/items`,
                {
                    method: isEditing ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        item_type: form.itemType,
                        title: form.title.trim(),
                        start_at: startAt,
                        end_at: endAt,
                        location_name: form.locationName.trim() || null,
                        location_address: form.locationAddress.trim() || null,
                        notes: form.notes.trim() || null,
                        source_kind: form.sourceKind.trim() || null,
                        source_reference: form.sourceReference.trim() || null,
                        details: {},
                    }),
                },
            );

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(getApiErrorMessage(data, "Failed to save itinerary item"));
            }

            setResponse(data as ItineraryResponse);
            if (isEditing) {
                resetForm();
            } else {
                setForm(createEmptyFormState());
            }
            await fetchCostSummary();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save itinerary item");
        } finally {
            setSaving(false);
        }
    }

    function submitItinerary(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        void performSubmit(false);
    }

    async function deleteItem(item: ItineraryItem) {
        openWarningModal({
            title: "Delete itinerary item",
            message: `Delete ${item.title}? This will remove it from the timeline and backend.`,
            confirmLabel: "Delete item",
            cancelLabel: "Cancel",
            tone: "danger",
            onConfirm: () => {
                void performDelete(item);
            },
        });
    }

    async function performDelete(item: ItineraryItem) {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/itinerary/items/${item.id}`, {
                method: "DELETE",
                credentials: "include",
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(getApiErrorMessage(data, "Failed to delete itinerary item"));
            }

            setResponse(data as ItineraryResponse);
            if (editingItemId === item.id) {
                resetForm();
            }
            await fetchCostSummary();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete itinerary item");
        } finally {
            setSaving(false);
        }
    }

    async function reorderItem(itemId: number, direction: -1 | 1) {
        const currentIndex = items.findIndex((item) => item.id === itemId);
        if (currentIndex < 0) return;

        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= items.length) return;

        const movedItem = items[currentIndex];
        const targetItem = items[nextIndex];
        openWarningModal({
            title: "Reorder itinerary item",
            message: `Move "${movedItem.title}" relative to "${targetItem.title}"? This changes the displayed order and may make the timeline feel less chronological. Continue?`,
            confirmLabel: "Move item",
            cancelLabel: "Cancel",
            tone: "warning",
            onConfirm: () => {
                void performReorder(itemId, direction);
            },
        });
    }

    async function performReorder(itemId: number, direction: -1 | 1) {
        const currentIndex = items.findIndex((item) => item.id === itemId);
        if (currentIndex < 0) return;

        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= items.length) return;

        const reorderedIds = items.map((item) => item.id);
        [reorderedIds[currentIndex], reorderedIds[nextIndex]] = [reorderedIds[nextIndex], reorderedIds[currentIndex]];

        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/itinerary/reorder`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ item_ids: reorderedIds }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(getApiErrorMessage(data, "Failed to reorder itinerary items"));
            }

            setResponse(data as ItineraryResponse);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reorder itinerary items");
        } finally {
            setSaving(false);
        }
    }

    const renderedActionItems = new Set<number>();

    return (
        <div className="itinerary-page">
            <section className="itinerary-hero">
                <div>
                    <p className="itinerary-kicker">Group itinerary</p>
                    <h1>{response?.trip_plan.title || `${groupName} Itinerary`}</h1>
                    <p className="itinerary-subtitle">
                        Keep flights, hotels, dining, and activities in one chronological view for the whole trip.
                    </p>
                    <div className="itinerary-state-row">
                        <span className={`itinerary-state-pill state-${effectiveGroupStatus}`}>{effectiveGroupStatus}</span>
                        {response?.trip_plan.starts_at && response?.trip_plan.ends_at && (
                            <span className="itinerary-state-dates">
                                {new Date(response.trip_plan.starts_at).toLocaleDateString()} - {new Date(response.trip_plan.ends_at).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="itinerary-hero-card">
                    <span className="itinerary-hero-label">Items</span>
                    <strong>{itemCount}</strong>
                </div>
            </section>

            <div className="itinerary-topbar">
                <button className="itinerary-back-btn" onClick={() => router.push(`/group/${groupId}`)}>
                    &larr; Back to Group
                </button>
                <div className="itinerary-tip">
                    {isArchivedSnapshotView
                        ? "Viewing an archived snapshot. Timeline items and shared notes are read-only."
                        : isTimelineLocked
                            ? "This itinerary is finalized. Timeline edits are locked, but shared notes can still be updated."
                            : "Members can add dates, times, and locations, then edit, remove, or reorder items without leaving the page."}
                </div>
            </div>

            {isArchivedSnapshotView && (
                <div className="itinerary-alert itinerary-warning">Viewing archived snapshot for this trip. This view is read-only.</div>
            )}

            {!isArchivedSnapshotView && (
                <div className="itinerary-state-actions">
                    {(groupStatus === "planning" || groupStatus === "confirmed" || groupStatus === "finalized") && (
                        <button
                            className="itinerary-state-btn"
                            disabled={updatingTripState}
                            onClick={() => openWarningModal({
                                title: "Finalize as upcoming",
                                message: "Mark this itinerary as an upcoming trip? You can still edit itinerary items afterwards.",
                                confirmLabel: "Mark upcoming",
                                cancelLabel: "Cancel",
                                tone: "warning",
                                onConfirm: () => { void updateTripState("upcoming"); },
                            })}
                        >
                            {updatingTripState ? "Updating..." : "Finalize Itinerary"}
                        </button>
                    )}
                    {groupStatus === "upcoming" && (
                        <button
                            className="itinerary-state-btn"
                            disabled={updatingTripState}
                            onClick={() => openWarningModal({
                                title: "Start trip",
                                message: "Move this itinerary to active trips now?",
                                confirmLabel: "Mark active",
                                cancelLabel: "Cancel",
                                tone: "warning",
                                onConfirm: () => { void updateTripState("active"); },
                            })}
                        >
                            {updatingTripState ? "Updating..." : "Mark as Active"}
                        </button>
                    )}
                    {groupStatus === "active" && (
                        <button
                            className="itinerary-state-btn danger"
                            disabled={updatingTripState}
                            onClick={() => openWarningModal({
                                title: "Archive trip",
                                message: "Archive this active trip into previous trips?",
                                confirmLabel: "Archive trip",
                                cancelLabel: "Cancel",
                                tone: "danger",
                                onConfirm: () => { void updateTripState("archived"); },
                            })}
                        >
                            {updatingTripState ? "Updating..." : "Archive / Finish Trip"}
                        </button>
                    )}
                    {groupStatus === "archived" && (
                        <button
                            className="itinerary-state-btn"
                            disabled={updatingTripState}
                            onClick={() => openWarningModal({
                                title: "Start a fresh trip",
                                message: "Start a new itinerary cycle? The archived trip remains finalized and a fresh planning itinerary will be created.",
                                confirmLabel: "Start new trip",
                                cancelLabel: "Cancel",
                                tone: "warning",
                                onConfirm: () => { void startNewTrip(); },
                            })}
                        >
                            {updatingTripState ? "Updating..." : "Start New Trip"}
                        </button>
                    )}
                </div>
            )}

            {error && <div className="itinerary-alert">{error}</div>}

            <div className="itinerary-layout">
                <aside className="itinerary-panel itinerary-form-panel">
                    {!isTimelineLocked && (
                        <>
                            <div className="panel-heading">
                                <div>
                                    <p className="panel-eyebrow">{editingItem ? "Edit itinerary" : "Add to plan"}</p>
                                    <h2>{editingItem ? "Update timeline item" : "New timeline item"}</h2>
                                </div>
                                <span className="panel-pill">{editingItem ? "Editing" : "Chronological"}</span>
                            </div>

                            <form className="itinerary-form" onSubmit={submitItinerary}>
                                <label>
                                    Item type
                                    <select
                                        value={form.itemType}
                                        onChange={(e) => updateFormField("itemType", e.target.value as FormState["itemType"])}
                                    >
                                        {Object.entries(ITEM_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label>
                                    Title
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={(e) => updateFormField("title", e.target.value)}
                                        placeholder="e.g. Delta flight to Paris"
                                        maxLength={255}
                                    />
                                </label>

                                <div className="two-column-grid">
                                    <label>
                                        Date
                                        <input
                                            type="date"
                                            value={form.date}
                                            onChange={(e) => updateFormField("date", e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        Start time
                                        <input
                                            type="time"
                                            value={form.startTime}
                                            onChange={(e) => updateFormField("startTime", e.target.value)}
                                        />
                                    </label>
                                </div>

                                <div className="two-column-grid">
                                    <label>
                                        End date
                                        <input
                                            type="date"
                                            value={form.endDate}
                                            onChange={(e) => updateFormField("endDate", e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        End time
                                        <input
                                            type="time"
                                            value={form.endTime}
                                            onChange={(e) => updateFormField("endTime", e.target.value)}
                                        />
                                    </label>
                                </div>

                                <label>
                                    Location name
                                    <input
                                        type="text"
                                        value={form.locationName}
                                        onChange={(e) => updateFormField("locationName", e.target.value)}
                                        placeholder="Airport, hotel, restaurant, or activity venue"
                                        maxLength={255}
                                    />
                                </label>

                                <label>
                                    Location details
                                    <input
                                        type="text"
                                        value={form.locationAddress}
                                        onChange={(e) => updateFormField("locationAddress", e.target.value)}
                                        placeholder="Address or terminal info"
                                    />
                                </label>

                                <label>
                                    Notes
                                    <textarea
                                        value={form.notes}
                                        onChange={(e) => updateFormField("notes", e.target.value)}
                                        placeholder="Gate info, reservation notes, confirmation codes, and reminders"
                                        rows={4}
                                    />
                                </label>

                                <div className="two-column-grid">
                                    <label>
                                        Source
                                        <input
                                            type="text"
                                            value={form.sourceKind}
                                            onChange={(e) => updateFormField("sourceKind", e.target.value)}
                                            placeholder="manual, flight-shortlist, etc."
                                        />
                                    </label>
                                    <label>
                                        Reference
                                        <input
                                            type="text"
                                            value={form.sourceReference}
                                            onChange={(e) => updateFormField("sourceReference", e.target.value)}
                                            placeholder="Optional booking or shortlist ID"
                                        />
                                    </label>
                                </div>

                                <div className="itinerary-form-actions">
                                    {editingItem && (
                                        <button type="button" className="itinerary-secondary-btn" onClick={() => resetForm()} disabled={saving}>
                                            Cancel edit
                                        </button>
                                    )}
                                    <button type="submit" className="itinerary-submit-btn" disabled={saving}>
                                        {saving ? "Saving..." : editingItem ? "Save changes" : "Add to itinerary"}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}

                    <div className="shared-notes-section">
                        <div className="panel-heading shared-notes-heading">
                            <div>
                                <p className="panel-eyebrow">Group collaboration</p>
                                <h2>Shared Notes</h2>
                            </div>
                        </div>
                        <textarea
                            value={sharedNotesDraft}
                            onChange={(event) => setSharedNotesDraft(event.target.value)}
                            placeholder="Add key reminders, meeting points, emergency contacts, and team notes here."
                            rows={5}
                            disabled={isArchivedSnapshotView}
                        />
                        <div className="shared-notes-actions">
                            <button
                                type="button"
                                className="itinerary-secondary-btn"
                                disabled={savingNotes || isArchivedSnapshotView}
                                onClick={() => setSharedNotesDraft(response?.trip_plan.shared_notes || "")}
                            >
                                Reset
                            </button>
                            <button
                                type="button"
                                className="itinerary-submit-btn"
                                disabled={savingNotes || isArchivedSnapshotView}
                                onClick={() => {
                                    if ((response?.trip_plan.shared_notes || "") && !sharedNotesDraft.trim()) {
                                        openWarningModal({
                                            title: "Clear shared notes",
                                            message: "This will remove all shared notes for the group. Continue?",
                                            confirmLabel: "Delete notes",
                                            cancelLabel: "Cancel",
                                            tone: "danger",
                                            onConfirm: () => { void saveSharedNotes(); },
                                        });
                                        return;
                                    }
                                    void saveSharedNotes();
                                }}
                            >
                                {savingNotes ? "Saving..." : "Save Shared Notes"}
                            </button>
                        </div>
                    </div>
                </aside>

                <main className="itinerary-panel itinerary-timeline-panel">
                    <div className="panel-heading timeline-heading">
                        <div>
                            <p className="panel-eyebrow">Timeline</p>
                            <h2>Chronological trip view</h2>
                        </div>
                        <span className="panel-pill">{itemCount} items</span>
                    </div>

                    {/* Cost Summary Section */}
                    {costSummary && !isArchivedSnapshotView && (
                        <div className="itinerary-cost-section">
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
                                    onPaymentComplete={fetchCostSummary}
                                />
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="itinerary-loading">Loading itinerary...</div>
                    ) : emptyState ? (
                        <div className="itinerary-empty-state">
                            <h3>No items yet</h3>
                            <p>
                                Add the first flight, hotel, meal, or activity to build the trip plan.
                            </p>
                        </div>
                    ) : (
                        <div className="timeline-root">
                            {groupedItems.map(([dayKey, dayItems]) => (
                                <section key={dayKey} className="timeline-day-section">
                                    <div className="timeline-day-label">{formatTimelineKey(dayKey)}</div>
                                    <div className="timeline-day-line">
                                        {dayItems.map((entry) => {
                                            const { item } = entry;
                                            const rangeLabel = getItemRangeLabel(item);
                                            const segmentBadge = getSegmentBadge(entry);
                                            const normalizedDisplayLocation = (item.display_location || "").toLowerCase();
                                            const normalizedAddress = (item.location_address || "").toLowerCase();
                                            const showAddress = Boolean(item.location_address) && !normalizedDisplayLocation.includes(normalizedAddress);
                                            const showActions = !isTimelineLocked && !renderedActionItems.has(item.id);

                                            if (showActions) {
                                                renderedActionItems.add(item.id);
                                            }

                                            return (
                                                <article
                                                    key={`${item.id}-${dayKey}-${entry.segment}`}
                                                    className={`timeline-card${editingItem?.id === item.id ? " timeline-card-active" : ""}`}
                                                >
                                                    <div className="timeline-marker">
                                                        <span>{ITEM_ICONS[item.item_type]}</span>
                                                    </div>
                                                    <div className="timeline-card-body">
                                                        <div className="timeline-card-topline">
                                                            <span className="timeline-type">{ITEM_LABELS[item.item_type]}</span>
                                                            <span className="timeline-time">{getSegmentTimeLabel(entry)}</span>
                                                        </div>
                                                        {segmentBadge && <p className="timeline-segment-badge">{segmentBadge}</p>}
                                                        <h3>{item.title}</h3>
                                                        <p className="timeline-range-label">{rangeLabel}</p>
                                                        <p className="timeline-location">{item.display_location}</p>
                                                        {(showAddress || item.notes) && (
                                                            <div className="timeline-meta-block">
                                                                {showAddress && <p>{item.location_address}</p>}
                                                                {item.notes && <p>{item.notes}</p>}
                                                            </div>
                                                        )}
                                                        {showActions && (
                                                            <div className="timeline-card-actions">
                                                                <button type="button" className="timeline-card-action-btn" onClick={() => startEditingItem(item)} disabled={saving}>
                                                                    Edit
                                                                </button>
                                                                <button type="button" className="timeline-card-action-btn danger" onClick={() => deleteItem(item)} disabled={saving}>
                                                                    Delete
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="timeline-card-action-btn secondary"
                                                                    onClick={() => reorderItem(item.id, -1)}
                                                                    disabled={saving || items.findIndex((current) => current.id === item.id) === 0}
                                                                >
                                                                    Move up
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="timeline-card-action-btn secondary"
                                                                    onClick={() => reorderItem(item.id, 1)}
                                                                    disabled={saving || items.findIndex((current) => current.id === item.id) === items.length - 1}
                                                                >
                                                                    Move down
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </main>
            </div>
            {warningModal && (
                <div className="itinerary-modal-overlay" role="presentation" onClick={closeWarningModal}>
                    <div
                        className={`itinerary-modal ${warningModal.tone === "danger" ? "itinerary-modal-danger" : "itinerary-modal-warning"}`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="itinerary-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="itinerary-modal-icon">{warningModal.tone === "danger" ? "!" : "?"}</div>
                        <div className="itinerary-modal-content">
                            <h2 id="itinerary-modal-title">{warningModal.title}</h2>
                            <p>{warningModal.message}</p>
                        </div>
                        <div className="itinerary-modal-actions">
                            <button type="button" className="itinerary-modal-cancel" onClick={closeWarningModal} disabled={saving}>
                                {warningModal.cancelLabel}
                            </button>
                            <button
                                type="button"
                                className="itinerary-modal-confirm"
                                onClick={() => {
                                    const action = warningModal.onConfirm;
                                    closeWarningModal();
                                    action();
                                }}
                                disabled={saving}
                            >
                                {warningModal.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
