"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./GroupDetail.css";
import HotelSearchPanel from "./HotelSearchPanel";

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

export default function GroupDetail({ groupId }: { groupId: number }) {
    const router = useRouter();
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
    const [scoreLoading, setScoreLoading] = useState(false);
    const isOwner = group?.role === "owner";

    const memberUserIds = new Set(members.map((m) => m.user_id));
    const invitableFriends = friends.filter((f) => !memberUserIds.has(f.id));
    const destinationShortlist = shortlist.filter((item) => !item.types.some((type) => type.toLowerCase() === "restaurant"));
    const restaurantShortlist = shortlist.filter((item) => item.types.some((type) => type.toLowerCase() === "restaurant"));

    function getShortlistImage(item: { photo_reference: string | null; photo_url: string | null }): string {
        if (item.photo_reference) {
            return `/api/destinations/image?photo_reference=${encodeURIComponent(item.photo_reference)}&width=640&height=420`;
        }
        return item.photo_url || "/trip-marseille.jpg";
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
            }
        }
        fetchData();
    }, [groupId]);

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
                        </div>
                    </>
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
