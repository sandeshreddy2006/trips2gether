"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./GroupDetail.css";

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
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [inviting, setInviting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editStatus, setEditStatus] = useState("");
    const [saving, setSaving] = useState(false);
    const isOwner = group?.role === "owner";

    const memberUserIds = new Set(members.map((m) => m.user_id));
    const invitableFriends = friends.filter((f) => !memberUserIds.has(f.id));

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
                const [groupRes, membersRes, shortlistRes, flightShortlistRes, friendsRes] = await Promise.all([
                    fetch(`/api/groups/${groupId}`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/members`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/shortlist`, { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/flight-shortlist`, { credentials: "include" }),
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

                if (friendsRes.ok) {
                    const friendsData = await friendsRes.json();
                    setFriends(friendsData.friends || []);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
                setLoading(false);
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
                        {isOwner && (
                            <button className="group-edit-btn" onClick={startEditing}>
                                Edit Group
                            </button>
                        )}
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
                <h2 className="group-shortlist-title">Shortlisted Destinations ({shortlist.length})</h2>
                {shortlist.length === 0 ? (
                    <p className="group-shortlist-empty">No destinations shortlisted yet.</p>
                ) : (
                    <div className="group-shortlist-list">
                        {shortlist.map((item) => (
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
                                <button
                                    className="group-shortlist-remove-btn"
                                    onClick={() => handleRemoveShortlistedDestination(item.place_id)}
                                >
                                    Remove
                                </button>
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
                                <button
                                    className="group-shortlist-remove-btn"
                                    onClick={() => handleRemoveShortlistedFlight(item.flight_offer_id)}
                                >
                                    Remove
                                </button>
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
