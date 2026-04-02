"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./ItineraryPlanner.css";

type ItineraryPlan = {
    id: number;
    group_id: number;
    title: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    item_count: number;
};

type ItineraryItem = {
    id: number;
    trip_plan_id: number;
    item_type: "flight" | "accommodation" | "dining" | "activity" | "transfer" | "other";
    title: string;
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

function parseDateKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function ItineraryPlanner({ groupId }: { groupId: number }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [response, setResponse] = useState<ItineraryResponse | null>(null);
    const [form, setForm] = useState<FormState>({
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
    });

    const items = response?.items || [];
    const groupName = response?.group_name || "Trip";
    const itemCount = response?.trip_plan.item_count ?? 0;
    const emptyState = !loading && items.length === 0;

    const groupedItems = useMemo(() => {
        const groups = new Map<string, ItineraryItem[]>();
        for (const item of items) {
            const key = parseDateKey(item.start_at);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(item);
        }
        return Array.from(groups.entries());
    }, [items]);

    const refreshItinerary = async () => {
        const res = await fetch(`/api/groups/${groupId}/itinerary`, {
            credentials: "include",
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.detail || data?.message || "Failed to load itinerary");
        }

        setResponse(data as ItineraryResponse);
    };

    useEffect(() => {
        let cancelled = false;

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

        return () => {
            cancelled = true;
        };
    }, [groupId]);

    const resetForm = () => {
        setForm({
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
        });
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

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

        setSaving(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/itinerary/items`, {
                method: "POST",
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
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.detail || data?.message || "Failed to add itinerary item");
            }

            await refreshItinerary();
            resetForm();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add itinerary item");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="itinerary-page">
            <section className="itinerary-hero">
                <div>
                    <p className="itinerary-kicker">Group itinerary</p>
                    <h1>{response?.trip_plan.title || `${groupName} Itinerary`}</h1>
                    <p className="itinerary-subtitle">
                        Keep flights, hotels, dining, and activities in one chronological view for the whole trip.
                    </p>
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
                    Members can add dates, times, and locations so the plan stays easy to scan.
                </div>
            </div>

            {error && <div className="itinerary-alert">{error}</div>}

            <div className="itinerary-layout">
                <aside className="itinerary-panel itinerary-form-panel">
                    <div className="panel-heading">
                        <div>
                            <p className="panel-eyebrow">Add to plan</p>
                            <h2>New timeline item</h2>
                        </div>
                        <span className="panel-pill">Chronological</span>
                    </div>

                    <form className="itinerary-form" onSubmit={handleSubmit}>
                        <label>
                            Item type
                            <select
                                value={form.itemType}
                                onChange={(e) => setForm((prev) => ({ ...prev, itemType: e.target.value as FormState["itemType"] }))}
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
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
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
                                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                                />
                            </label>
                            <label>
                                Start time
                                <input
                                    type="time"
                                    value={form.startTime}
                                    onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                                />
                            </label>
                        </div>

                        <div className="two-column-grid">
                            <label>
                                End date
                                <input
                                    type="date"
                                    value={form.endDate}
                                    onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                                />
                            </label>
                            <label>
                                End time
                                <input
                                    type="time"
                                    value={form.endTime}
                                    onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                                />
                            </label>
                        </div>

                        <label>
                            Location name
                            <input
                                type="text"
                                value={form.locationName}
                                onChange={(e) => setForm((prev) => ({ ...prev, locationName: e.target.value }))}
                                placeholder="Airport, hotel, restaurant, or activity venue"
                                maxLength={255}
                            />
                        </label>

                        <label>
                            Location details
                            <input
                                type="text"
                                value={form.locationAddress}
                                onChange={(e) => setForm((prev) => ({ ...prev, locationAddress: e.target.value }))}
                                placeholder="Address or terminal info"
                            />
                        </label>

                        <label>
                            Notes
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
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
                                    onChange={(e) => setForm((prev) => ({ ...prev, sourceKind: e.target.value }))}
                                    placeholder="manual, flight-shortlist, etc."
                                />
                            </label>
                            <label>
                                Reference
                                <input
                                    type="text"
                                    value={form.sourceReference}
                                    onChange={(e) => setForm((prev) => ({ ...prev, sourceReference: e.target.value }))}
                                    placeholder="Optional booking or shortlist ID"
                                />
                            </label>
                        </div>

                        <button type="submit" className="itinerary-submit-btn" disabled={saving}>
                            {saving ? "Saving..." : "Add to itinerary"}
                        </button>
                    </form>
                </aside>

                <main className="itinerary-panel itinerary-timeline-panel">
                    <div className="panel-heading timeline-heading">
                        <div>
                            <p className="panel-eyebrow">Timeline</p>
                            <h2>Chronological trip view</h2>
                        </div>
                        <span className="panel-pill">{itemCount} items</span>
                    </div>

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
                                    <div className="timeline-day-label">{formatTimelineKey(dayItems[0].start_at)}</div>
                                    <div className="timeline-day-line">
                                        {dayItems.map((item) => (
                                            <article key={item.id} className="timeline-card">
                                                <div className="timeline-marker">
                                                    <span>{ITEM_ICONS[item.item_type]}</span>
                                                </div>
                                                <div className="timeline-card-body">
                                                    <div className="timeline-card-topline">
                                                        <span className="timeline-type">{ITEM_LABELS[item.item_type]}</span>
                                                        <span className="timeline-time">{formatTimeLabel(item)}</span>
                                                    </div>
                                                    <h3>{item.title}</h3>
                                                    <p className="timeline-location">{item.display_location}</p>
                                                    {(item.location_address || item.notes) && (
                                                        <div className="timeline-meta-block">
                                                            {item.location_address && <p>{item.location_address}</p>}
                                                            {item.notes && <p>{item.notes}</p>}
                                                        </div>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
