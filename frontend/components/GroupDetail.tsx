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

export default function GroupDetail({ groupId }: { groupId: number }) {
    const router = useRouter();
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const [groupRes, membersRes] = await Promise.all([
                    fetch("/api/groups", { credentials: "include" }),
                    fetch(`/api/groups/${groupId}/members`, { credentials: "include" }),
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
                            <span className={`group-member-role ${m.role === "owner" ? "role-owner" : ""}`}>
                                {m.role}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
