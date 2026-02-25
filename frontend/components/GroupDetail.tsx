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
};

type GroupInfo = {
    id: number;
    name: string;
    description: string | null;
    member_count: number;
    role: string | null;
};

type Friend = {
    id: number;
    name: string;
    email: string;
};

export default function GroupDetail({ groupId }: { groupId: number }) {
    const router = useRouter();
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [inviting, setInviting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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

    useEffect(() => {
        async function fetchData() {
            try {
                const [groupRes, membersRes, friendsRes] = await Promise.all([
                    fetch("/api/groups", { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/members`, { credentials: "include" }),
                    fetch("/api/friends", { credentials: "include" }),
                ]);

                if (!groupRes.ok || !membersRes.ok) {
                    throw new Error("Failed to load group data");
                }

                const groupData = await groupRes.json();
                const found = groupData.groups?.find((g: GroupInfo) => g.id === groupId);
                if (!found) throw new Error("Group not found");

                setGroup(found);
                const membersData = await membersRes.json();
                setMembers(membersData.members || []);

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
                <h1 className="group-detail-name">{group.name}</h1>
                {group.description && (
                    <p className="group-detail-desc">{group.description}</p>
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
                                <img src="/UserIcon.svg" alt={m.name} className="group-member-avatar" />
                                <div>
                                    <span className="group-member-name">{m.name}</span>
                                    <span className="group-member-email">{m.email}</span>
                                </div>
                            </div>
                            <div className="group-member-actions">
                                <span className={`group-member-role ${m.role === "owner" ? "role-owner" : ""}`}>
                                    {m.role}
                                </span>
                                {isOwner && m.role !== "owner" && (
                                    <button
                                        className="group-remove-btn"
                                        onClick={() => handleRemoveMember(m.user_id)}
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
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
                                <img src="/UserIcon.svg" alt={f.name} className="group-member-avatar" />
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
        </div>
    );
}
