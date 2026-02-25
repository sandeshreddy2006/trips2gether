"use client";
import React, { useEffect, useState } from "react";
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
    const [incomingRequests, setIncomingRequests] = useState<Friend[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsError, setFriendsError] = useState<string | null>(null);
    const [friendsNotice, setFriendsNotice] = useState<string | null>(null);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [friendLookup, setFriendLookup] = useState("");
    const [addFriendError, setAddFriendError] = useState<string | null>(null);
    const [addFriendBusy, setAddFriendBusy] = useState(false);
    const [removeFriendId, setRemoveFriendId] = useState<number | null>(null);
    const [requestActionUserId, setRequestActionUserId] = useState<number | null>(null);

    async function loadFriends(keepFeedback = true) {
        setFriendsLoading(true);
        if (!keepFeedback) {
            setFriendsError(null);
            setFriendsNotice(null);
        }
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

    async function loadFriendRequests(keepFeedback = true) {
        if (!keepFeedback) {
            setFriendsError(null);
            setFriendsNotice(null);
        }
        try {
            const res = await fetch("/api/friends/requests", { credentials: "include" });
            if (!res.ok) {
                let msg = "Failed to load friend requests";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }
            const data = await res.json();
            setIncomingRequests(Array.isArray(data.incoming) ? data.incoming : []);
            setOutgoingRequests(Array.isArray(data.outgoing) ? data.outgoing : []);
        } catch (err) {
            setFriendsError(err instanceof Error ? err.message : "Failed to load friend requests");
        }
    }

    async function refreshFriendsTab(keepFeedback = true) {
        await Promise.all([loadFriends(keepFeedback), loadFriendRequests(keepFeedback)]);
    }

    useEffect(() => {
        void loadFriendRequests(true);
    }, []);

    async function handleAddFriend() {
        const identifier = friendLookup.trim();
        if (!identifier) {
            setAddFriendError("Please enter a username or email");
            return;
        }

        setAddFriendBusy(true);
        setAddFriendError(null);
        try {
            const res = await fetch("/api/friends/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ identifier }),
            });
            let payload: any = null;
            try {
                payload = await res.json();
            } catch (_) {
                payload = null;
            }
            if (!res.ok) {
                let msg = "Could not add friend";
                if (payload) msg = payload.detail || payload.message || msg;
                throw new Error(msg);
            }
            setFriendLookup("");
            setAddModalOpen(false);
            setFriendsNotice(payload?.message || "Friend request sent");
            await refreshFriendsTab(true);
        } catch (err) {
            setAddFriendError(err instanceof Error ? err.message : "Could not add friend");
        } finally {
            setAddFriendBusy(false);
        }
    }

    async function handleRemoveFriend(friendId: number, mode: "remove" | "decline" | "cancel" = "remove") {
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
            const messageByMode = {
                remove: "Friend removed",
                decline: "Friend request declined",
                cancel: "Friend request canceled",
            };
            setFriendsNotice(messageByMode[mode]);
            await refreshFriendsTab(true);
        } catch (err) {
            setFriendsError(err instanceof Error ? err.message : "Failed to remove friend");
        } finally {
            setRemoveFriendId(null);
        }
    }

    async function handleAcceptRequest(requesterId: number) {
        setRequestActionUserId(requesterId);
        setFriendsError(null);
        try {
            const res = await fetch(`/api/friends/accept/${requesterId}`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                let msg = "Failed to accept friend request";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }
            setFriendsNotice("Friend request accepted");
            await refreshFriendsTab(true);
        } catch (err) {
            setFriendsError(err instanceof Error ? err.message : "Failed to accept friend request");
        } finally {
            setRequestActionUserId(null);
        }
    }

    function onTabClick(tab: string) {
        setActiveTab(tab);
        if (tab === "friends" && !friendsLoading && friends.length === 0) {
            void refreshFriendsTab(false);
        }
    }

    function openAddFriendModal() {
        setFriendLookup("");
        setAddFriendError(null);
        setAddModalOpen(true);
    }

    function closeAddFriendModal() {
        setAddModalOpen(false);
        setFriendLookup("");
        setAddFriendError(null);
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
                            {incomingRequests.length > 0 && (
                                <span className="friends-tab-badge">{incomingRequests.length}</span>
                            )}
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
                                <button className="add-friend-btn" onClick={openAddFriendModal}>
                                    + Add Friend
                                </button>
                            </div>

                            {friendsError && <p className="friends-error">{friendsError}</p>}
                            {friendsNotice && <p className="friends-notice">{friendsNotice}</p>}

                            {incomingRequests.length > 0 && (
                                <div className="friend-requests-group">
                                    <h3 className="requests-title">Incoming Requests</h3>
                                    <div className="friends-list">
                                        {incomingRequests.map((req) => (
                                            <div key={req.id} className="friend-row">
                                                <div className="friend-main">
                                                    <img
                                                        src={req.avatar_url || "/UserIcon.svg"}
                                                        alt={req.name}
                                                        className="friend-avatar"
                                                    />
                                                    <div className="friend-meta">
                                                        <span className="friend-name">{req.name}</span>
                                                        <span className="friend-sub">{req.email}</span>
                                                    </div>
                                                </div>
                                                <div className="friend-actions">
                                                    <button
                                                        className="accept-friend-btn"
                                                        onClick={() => handleAcceptRequest(req.id)}
                                                        disabled={requestActionUserId === req.id || removeFriendId === req.id}
                                                    >
                                                        {requestActionUserId === req.id ? "Accepting..." : "Accept"}
                                                    </button>
                                                    <button
                                                        className="remove-friend-btn"
                                                        onClick={() => handleRemoveFriend(req.id, "decline")}
                                                        disabled={requestActionUserId === req.id || removeFriendId === req.id}
                                                    >
                                                        {removeFriendId === req.id ? "Declining..." : "Decline"}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {outgoingRequests.length > 0 && (
                                <div className="friend-requests-group">
                                    <h3 className="requests-title">Sent Requests</h3>
                                    <div className="friends-list">
                                        {outgoingRequests.map((req) => (
                                            <div key={req.id} className="friend-row">
                                                <div className="friend-main">
                                                    <img
                                                        src={req.avatar_url || "/UserIcon.svg"}
                                                        alt={req.name}
                                                        className="friend-avatar"
                                                    />
                                                    <div className="friend-meta">
                                                        <span className="friend-name">{req.name}</span>
                                                        <span className="friend-sub">{req.email}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    className="remove-friend-btn"
                                                    onClick={() => handleRemoveFriend(req.id, "cancel")}
                                                    disabled={removeFriendId === req.id}
                                                >
                                                    {removeFriendId === req.id ? "Canceling..." : "Cancel"}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                            <button className="friends-modal-close" onClick={closeAddFriendModal} aria-label="Close">
                                &times;
                            </button>
                        </div>
                        <p className="friends-modal-helper">Search by username or email.</p>
                        <input
                            className="friends-modal-input"
                            type="text"
                            placeholder="e.g. alex or alex@example.com"
                            value={friendLookup}
                            onChange={(e) => {
                                setFriendLookup(e.target.value);
                                if (addFriendError) setAddFriendError(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !addFriendBusy) {
                                    void handleAddFriend();
                                }
                            }}
                        />
                        {addFriendError && <p className="friends-error">{addFriendError}</p>}
                        <button className="friends-modal-submit" onClick={handleAddFriend} disabled={addFriendBusy}>
                            {addFriendBusy ? "Adding..." : "Add Friend"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
