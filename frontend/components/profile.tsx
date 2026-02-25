"use client";
import React, { useState } from "react";
import { useAuth } from "../app/AuthContext";
import "./profile.css";

type Friend = {
    id: number;
    email: string;
    name: string;
    avatar_url?: string | null;
    status: string;
};

export default function Profile() {
    const { user, locationData } = useAuth();
    const [activeTab, setActiveTab] = useState("overview");
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsError, setFriendsError] = useState<string | null>(null);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [friendLookup, setFriendLookup] = useState("");
    const [addFriendBusy, setAddFriendBusy] = useState(false);
    const [removeFriendId, setRemoveFriendId] = useState<number | null>(null);

    async function loadFriends() {
        setFriendsLoading(true);
        setFriendsError(null);
        try {
            const res = await fetch("/api/friends", { credentials: "include" });
            if (!res.ok) {
                let msg = "Failed to load friends";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }
            const data = await res.json();
            setFriends(Array.isArray(data.friends) ? data.friends : []);
        } catch (err) {
            setFriendsError(err instanceof Error ? err.message : "Failed to load friends");
        } finally {
            setFriendsLoading(false);
        }
    }

    async function handleAddFriend() {
        const identifier = friendLookup.trim();
        if (!identifier) {
            setFriendsError("Please enter a username or email");
            return;
        }

        setAddFriendBusy(true);
        setFriendsError(null);
        try {
            const res = await fetch("/api/friends/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ identifier }),
            });
            if (!res.ok) {
                let msg = "Could not add friend";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }
            setFriendLookup("");
            setAddModalOpen(false);
            await loadFriends();
        } catch (err) {
            setFriendsError(err instanceof Error ? err.message : "Could not add friend");
        } finally {
            setAddFriendBusy(false);
        }
    }

    async function handleRemoveFriend(friendId: number) {
        setRemoveFriendId(friendId);
        setFriendsError(null);
        try {
            const res = await fetch(`/api/friends/${friendId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                let msg = "Failed to remove friend";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }
            setFriends((prev) => prev.filter((f) => f.id !== friendId));
        } catch (err) {
            setFriendsError(err instanceof Error ? err.message : "Failed to remove friend");
        } finally {
            setRemoveFriendId(null);
        }
    }

    function onTabClick(tab: string) {
        setActiveTab(tab);
        if (tab === "friends" && !friendsLoading && friends.length === 0) {
            void loadFriends();
        }
    }

    if (!user) {
        return <div className="profile-loading">Loading profile...</div>;
    }

    return (
        <div className="profile-container">
            <div className="profile-header">
                <div className="profile-banner">
                    <img src="/profile-banner.jpg" alt="Banner" className="banner-image" onError={(e) => {
                        (e.target as HTMLImageElement).style.background = "linear-gradient(135deg, #2E6B55, #186C50)";
                    }} />
                </div>

                <div className="profile-content">
                    <div className="profile-info-header">
                        <div className="profile-left">
                            <img src="/UserIcon.svg" alt={user.name} className="profile-photo" />
                            <div className="profile-meta">
                                <h1 className="profile-name">{user.name}</h1>
                                <p className="profile-location">{locationData.location || "Location not set"}</p>
                            </div>
                        </div>
                        <button className="edit-profile-btn">
                            ✏️ Edit Profile
                        </button>
                    </div>

                    <p className="profile-bio">Travel enthusiast and foodie. Love exploring new destination and meeting new people!</p>

                    <div className="profile-stats">
                        <div className="stat">
                            <span className="stat-number">150</span>
                            <span className="stat-label">Followers</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">108</span>
                            <span className="stat-label">Following</span>
                        </div>
                    </div>

                    <div className="profile-tabs">
                        <button
                            className={`tab ${activeTab === "overview" ? "active" : ""}`}
                            onClick={() => onTabClick("overview")}
                        >
                            Overview
                        </button>
                        <button
                            className={`tab ${activeTab === "trips" ? "active" : ""}`}
                            onClick={() => onTabClick("trips")}
                        >
                            Upcoming Trips
                        </button>
                        <button
                            className={`tab ${activeTab === "friends" ? "active" : ""}`}
                            onClick={() => onTabClick("friends")}
                        >
                            Friends
                        </button>
                        <button
                            className={`tab ${activeTab === "wishlist" ? "active" : ""}`}
                            onClick={() => onTabClick("wishlist")}
                        >
                            Wishlist
                        </button>
                    </div>
                </div>
            </div>

            <div className="profile-body">
                <div className="profile-main">
                    {activeTab === "overview" && (
                        <>
                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>About Me</h2>
                                    <a href="#" className="edit-link">Edit</a>
                                </div>
                                <div className="about-content">
                                    <div className="about-item">
                                        <span className="about-label">Email:</span>
                                        <span className="about-value">{user.email}</span>
                                    </div>
                                    <div className="about-item">
                                        <span className="about-label">Phone:</span>
                                        <span className="about-value">+1-415-123-4567</span>
                                    </div>
                                    <div className="about-item">
                                        <span className="about-label">Location:</span>
                                        <span className="about-value">{locationData.location || "Not specified"}</span>
                                    </div>
                                    <div className="about-item">
                                        <span className="about-label">Interests:</span>
                                        <span className="about-value">Hiking, Sushi, Beach Resorts</span>
                                    </div>
                                    <div className="about-item">
                                        <span className="about-label">Joined:</span>
                                        <span className="about-value">August 2022</span>
                                    </div>
                                </div>
                            </div>

                            <div className="profile-card">
                                <h2>Photos</h2>
                                <div className="photos-grid">
                                    <div className="photo-item placeholder">
                                        <span>No photos yet</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "trips" && (
                        <div className="profile-card">
                            <h2>Upcoming Trips</h2>
                            <p className="placeholder-text">No upcoming trips scheduled</p>
                        </div>
                    )}

                    {activeTab === "friends" && (
                        <div className="profile-card">
                            <div className="section-header">
                                <h2>Friends</h2>
                                <button className="add-friend-btn" onClick={() => setAddModalOpen(true)}>
                                    + Add Friend
                                </button>
                            </div>

                            {friendsError && <p className="friends-error">{friendsError}</p>}

                            {friendsLoading ? (
                                <p className="placeholder-text">Loading friends...</p>
                            ) : friends.length === 0 ? (
                                <p className="placeholder-text">No friends yet. Add your first friend.</p>
                            ) : (
                                <div className="friends-list">
                                    {friends.map((friend) => (
                                        <div key={friend.id} className="friend-row">
                                            <div className="friend-main">
                                                <img
                                                    src={friend.avatar_url || "/UserIcon.svg"}
                                                    alt={friend.name}
                                                    className="friend-avatar"
                                                />
                                                <div className="friend-meta">
                                                    <span className="friend-name">{friend.name}</span>
                                                    <span className="friend-sub">{friend.email}</span>
                                                </div>
                                            </div>
                                            <button
                                                className="remove-friend-btn"
                                                onClick={() => handleRemoveFriend(friend.id)}
                                                disabled={removeFriendId === friend.id}
                                            >
                                                {removeFriendId === friend.id ? "Removing..." : "Remove"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "wishlist" && (
                        <div className="profile-card">
                            <h2>Wishlist</h2>
                            <p className="placeholder-text">No wishlist items yet</p>
                        </div>
                    )}
                </div>

                <div className="profile-sidebar">
                    <div className="sidebar-section">
                        <h3>Recent Activity</h3>
                        <p className="placeholder-text">No recent activity</p>
                    </div>
                </div>
            </div>

            {addModalOpen && (
                <div className="friends-modal-overlay" role="dialog" aria-modal="true">
                    <div className="friends-modal">
                        <div className="friends-modal-header">
                            <h3>Add Friend</h3>
                            <button className="friends-modal-close" onClick={() => setAddModalOpen(false)} aria-label="Close">
                                &times;
                            </button>
                        </div>
                        <p className="friends-modal-helper">Search by username or email.</p>
                        <input
                            className="friends-modal-input"
                            type="text"
                            placeholder="e.g. alex or alex@example.com"
                            value={friendLookup}
                            onChange={(e) => setFriendLookup(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !addFriendBusy) {
                                    void handleAddFriend();
                                }
                            }}
                        />
                        <button className="friends-modal-submit" onClick={handleAddFriend} disabled={addFriendBusy}>
                            {addFriendBusy ? "Adding..." : "Add Friend"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
