"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "../app/AuthContext";
import FaceVerificationSetup from "./FaceVerificationSetup";
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
    const [showFaceSetup, setShowFaceSetup] = useState(false);
    const [faceVerificationEnabled, setFaceVerificationEnabled] = useState(false);
    const [faceVerificationLoading, setFaceVerificationLoading] = useState(false);

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
    const [editingSection, setEditingSection] = useState<string | null>(null);
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);

    // Mock profile data - replace with API call once endpoints are ready
    const [profile, setProfile] = useState({
        username: user?.name || "User",
        email: user?.email || "",
        avatar_url: "/UserIcon.svg",
        bio: "Travel enthusiast and foodie. Love exploring new destinations and meeting new people!",
        budget_min: 1000,
        budget_max: 3000,
        travel_mode: "Adventure",
        preferred_destination: "Southeast Asia",
        travel_pace: "Moderate",
        hotel_type: "Mid-range",
        room_sharing: "Open",
        cuisine_preference: "Italian, Asian, Mediterranean",
        dietary_restrictions: "Vegetarian friendly",
    });

    const [editData, setEditData] = useState({ ...profile });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [bioError, setBioError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

    // for account deletion
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Load profile from API on component mount
    useEffect(() => {
        const loadProfile = async () => {
            try {
                const response = await fetch("/api/profile/get", {
                    method: "GET",
                    credentials: "include",
                });

                if (response.ok) {
                    const profileData = await response.json();
                    setProfile(profileData);
                    setEditData(profileData);
                } else {
                    // If profile doesn't exist, create one
                    const createResponse = await fetch("/api/profile/create", {
                        method: "POST",
                        credentials: "include",
                    });

                    if (createResponse.ok) {
                        const newProfile = await createResponse.json();
                        setProfile(newProfile);
                        setEditData(newProfile);
                    }
                }
            } catch (error) {
                console.error("Error loading profile:", error);
                // Continue with mock data if API fails
            }
        };

        if (user) {
            loadProfile();
        }
    }, [user]);

    // Load face verification status
    useEffect(() => {
        const loadFaceVerificationStatus = async () => {
            try {
                setFaceVerificationLoading(true);
                const response = await fetch(`/api/face-verification/check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: user?.email }),
                });

                if (response.ok) {
                    const data = await response.json();
                    setFaceVerificationEnabled(data.face_verification_enabled);
                }
            } catch (error) {
                console.error('Failed to load face verification status:', error);
            } finally {
                setFaceVerificationLoading(false);
            }
        };

        if (user?.email) {
            loadFaceVerificationStatus();
        }
    }, [user?.email]);

    async function handleDisableFaceVerification() {
        try {
            const response = await fetch(`/api/face-verification/disable`, {
                method: 'POST',
                credentials: 'include',
            });

            if (response.ok) {
                setFaceVerificationEnabled(false);
                // Reload page to reflect updated status
                window.location.reload();
            }
        } catch (error) {
            console.error('Failed to disable face verification:', error);
        }
    }

    if (!user) {
        return <div className="profile-loading">Loading profile...</div>;
    }

    const handleEditStart = (section: string) => {
        setEditingSection(section);
        setEditData({ ...profile });
        setBioError(null);
    };

    const handleEditCancel = () => {
        setEditingSection(null);
        setEditData({ ...profile });
        setBioError(null);
    };

    const handleEditSave = async () => {
        setIsSaving(true);
        setSaveError(null);

        try {
            // Determine which section is being edited and only send those fields
            const fieldsToUpdate: any = {};

            if (editingSection === "overview") {
                // Validate username
                if (!editData.username || editData.username.trim().length === 0) {
                    throw new Error("Username cannot be empty");
                }
                if (editData.username.length > 100) {
                    throw new Error("Username must be 100 characters or less");
                }
                // Validate email - basic email format check
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!editData.email || !emailRegex.test(editData.email)) {
                    throw new Error("Please enter a valid email address");
                }
                // Validate bio
                if (editData.bio && editData.bio.length > 500) {
                    throw new Error("Bio must be 500 characters or less");
                }
                fieldsToUpdate.username = editData.username;
                fieldsToUpdate.email = editData.email;
                fieldsToUpdate.bio = editData.bio;
            } else if (editingSection === "travel") {
                // Validate budget values
                if (editData.budget_min !== undefined && editData.budget_min < 0) {
                    throw new Error("Minimum budget cannot be negative");
                }
                if (editData.budget_max !== undefined && editData.budget_max < 0) {
                    throw new Error("Maximum budget cannot be negative");
                }
                if (
                    editData.budget_min !== undefined &&
                    editData.budget_max !== undefined &&
                    editData.budget_min > editData.budget_max
                ) {
                    throw new Error("Minimum budget cannot be greater than maximum budget");
                }
                if (editData.budget_min !== undefined && editData.budget_min > 1000000) {
                    throw new Error("Budget cannot exceed $1,000,000");
                }
                if (editData.budget_max !== undefined && editData.budget_max > 1000000) {
                    throw new Error("Budget cannot exceed $1,000,000");
                }
                // Validate travel pace
                const validPaces = ["Slow", "Moderate", "Fast", "Very Fast"];
                if (editData.travel_pace && !validPaces.includes(editData.travel_pace)) {
                    throw new Error("Invalid travel pace. Must be: Slow, Moderate, Fast, or Very Fast");
                }
                fieldsToUpdate.budget_min = editData.budget_min;
                fieldsToUpdate.budget_max = editData.budget_max;
                fieldsToUpdate.travel_mode = editData.travel_mode;
                fieldsToUpdate.preferred_destination = editData.preferred_destination;
                fieldsToUpdate.travel_pace = editData.travel_pace;
            } else if (editingSection === "accommodation") {
                fieldsToUpdate.hotel_type = editData.hotel_type;
                fieldsToUpdate.room_sharing = editData.room_sharing;
            } else if (editingSection === "dining") {
                fieldsToUpdate.cuisine_preference = editData.cuisine_preference;
                fieldsToUpdate.dietary_restrictions = editData.dietary_restrictions;
            }

            const response = await fetch("/api/profile/update", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify(fieldsToUpdate),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Failed to save preferences");
            }

            const updatedProfile = await response.json();
            setProfile(updatedProfile);
            setEditingSection(null);
            setSuccessMessage("Changes saved successfully!");
            // Auto-clear success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error: any) {
            setSaveError(error.message || "Failed to save changes");
            console.error("Error saving profile:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field: string, value: string | number) => {
        setEditData({ ...editData, [field]: value });
    };

    const handleDeleteAccount = async () => {
        setDeleteError("");

        if (!deleteConfirmEmail.trim()) {
            setDeleteError("Please enter your email to confirm.");
            return;
        }

        if (deleteConfirmEmail.trim().toLowerCase() !== (profile.email || user?.email || "").toLowerCase()) {
            setDeleteError("Email does not match your account email.");
            return;
        }

        setDeleteLoading(true);
        try {
            const res = await fetch(`/api/auth/delete-account`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!res.ok) {
                const data = await res.json();
                setDeleteError(data.detail || "Failed to delete account.");
                setDeleteLoading(false);
                return;
            }

            // Session is invalidated server-side; redirect to landing page
            window.location.href = "/";
        } catch {
            setDeleteError("Network error. Please try again.");
            setDeleteLoading(false);
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploadingAvatar(true);
            setSaveError(null);
            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch("/api/profile/upload-avatar", {
                    method: "POST",
                    credentials: "include",
                    body: formData,
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || "Failed to upload avatar");
                }

                const data = await response.json();
                setProfile({ ...profile, avatar_url: data.avatar_url });
                setIsEditingAvatar(false);
            } catch (error: any) {
                setSaveError(error.message || "Failed to upload avatar");
                console.error("Error uploading avatar:", error);
            } finally {
                setIsUploadingAvatar(false);
            }
        }
    };

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
                            <div className="avatar-container">
                                <img src={profile.avatar_url || "/UserIcon.svg"} alt={profile.username} className="profile-photo" />
                                {isEditingAvatar && (
                                    <div className="avatar-overlay">
                                        {isUploadingAvatar ? (
                                            <div className="avatar-loading">Uploading...</div>
                                        ) : (
                                            <>
                                                <label className="avatar-upload-label">
                                                    <span>Change Photo</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleAvatarChange}
                                                        className="avatar-file-input"
                                                        disabled={isUploadingAvatar}
                                                    />
                                                </label>
                                                <button
                                                    className="avatar-cancel-btn"
                                                    onClick={() => setIsEditingAvatar(false)}
                                                    disabled={isUploadingAvatar}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="profile-meta">
                                <h1 className="profile-name">{profile.username}</h1>
                                <p className="profile-location">{locationData.location || "Location not set"}</p>
                                {saveError && <p className="avatar-error">{saveError}</p>}
                            </div>
                        </div>
                        <button className="edit-profile-btn" onClick={() => {
                            setIsEditingAvatar(true);
                            setSaveError(null);
                        }}>
                            ✏️ Edit Avatar
                        </button>
                    </div>

                    <p className="profile-bio">{profile.bio}</p>

                    <div className="profile-tabs">
                        <button
                            className={`tab ${activeTab === "overview" ? "active" : ""}`}
                            onClick={() => onTabClick("overview")}
                        >
                            Overview
                        </button>
                        <button
                            className={`tab ${activeTab === "preferences" ? "active" : ""}`}
                            onClick={() => setActiveTab("preferences")}
                        >
                            Preferences
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
                {successMessage && (
                    <div className="form-success">
                        <span className="success-icon">✓</span>
                        {successMessage}
                    </div>
                )}
                <div className="profile-main">
                    {activeTab === "overview" && (
                        <>
                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>About Me</h2>
                                    {editingSection !== "overview" && (
                                        <a href="#" className="edit-link" onClick={(e) => {
                                            e.preventDefault();
                                            handleEditStart("overview");
                                        }}>Edit</a>
                                    )}
                                </div>
                                {editingSection === "overview" ? (
                                    <div className="about-content edit-form">
                                        <div className="form-group">
                                            <label className="form-label">Email</label>
                                            <input
                                                type="email"
                                                value={editData.email}
                                                onChange={(e) => handleInputChange("email", e.target.value)}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Username</label>
                                            <input
                                                type="text"
                                                value={editData.username}
                                                onChange={(e) => handleInputChange("username", e.target.value)}
                                                maxLength={100}
                                                className="form-input"
                                                required
                                            />
                                            <small className="form-hint">{editData.username?.length || 0}/100 characters</small>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Bio</label>
                                            <textarea
                                                value={editData.bio}
                                                onChange={(e) => {
                                                    handleInputChange("bio", e.target.value);
                                                    if (e.target.value.length > 500) {
                                                        setBioError("Bio cannot exceed 500 characters");
                                                    } else {
                                                        setBioError(null);
                                                    }
                                                }}
                                                className="form-input form-textarea"
                                            />
                                            {bioError && <div className="form-error">{bioError}</div>}
                                            <small className="form-hint">{editData.bio?.length || 0}/500 characters</small>
                                        </div>
                                        {saveError && <div className="form-error">{saveError}</div>}
                                        <div className="form-actions">
                                            <button
                                                onClick={handleEditSave}
                                                disabled={isSaving}
                                                className="btn btn-primary"
                                            >
                                                {isSaving ? "Saving..." : "Save Changes"}
                                            </button>
                                            <button
                                                onClick={handleEditCancel}
                                                disabled={isSaving}
                                                className="btn btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="about-content">
                                        <div className="about-item">
                                            <span className="about-label">Email:</span>
                                            <span className="about-value">{profile.email || user.email}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Username:</span>
                                            <span className="about-value">{profile.username}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Location:</span>
                                            <span className="about-value">{locationData.location || "Not specified"}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Bio:</span>
                                            <span className="about-value">{profile.bio}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Security Section */}
                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>Security</h2>
                                </div>
                                <div className="security-content">
                                    <div className="security-item">
                                        <div className="security-info">
                                            <h3>Face Verification</h3>
                                            <p className="security-description">
                                                Add biometric authentication to your account for extra security
                                            </p>
                                            <p className="security-status">
                                                Status: {faceVerificationLoading ? 'Loading...' : faceVerificationEnabled ? '✓ Enabled' : 'Disabled'}
                                            </p>
                                        </div>
                                        <div className="security-actions">
                                            {!faceVerificationEnabled ? (
                                                <button
                                                    onClick={() => setShowFaceSetup(true)}
                                                    className="btn btn-primary"
                                                    disabled={faceVerificationLoading}
                                                >
                                                    Enable Face Verification
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleDisableFaceVerification}
                                                    className="btn btn-secondary"
                                                    disabled={faceVerificationLoading}
                                                >
                                                    Disable Face Verification
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "preferences" && (
                        <>
                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>Travel Preferences</h2>
                                    {editingSection !== "travel" && (
                                        <a href="#" className="edit-link" onClick={(e) => {
                                            e.preventDefault();
                                            handleEditStart("travel");
                                        }}>Edit</a>
                                    )}
                                </div>
                                {editingSection === "travel" ? (
                                    <div className="about-content edit-form">
                                        <div className="form-group">
                                            <label className="form-label">Budget Min</label>
                                            <input
                                                type="number"
                                                value={editData.budget_min}
                                                onChange={(e) => handleInputChange("budget_min", parseInt(e.target.value) || 0)}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Budget Max</label>
                                            <input
                                                type="number"
                                                value={editData.budget_max}
                                                onChange={(e) => handleInputChange("budget_max", parseInt(e.target.value) || 0)}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Travel Mode</label>
                                            <input
                                                type="text"
                                                value={editData.travel_mode}
                                                onChange={(e) => handleInputChange("travel_mode", e.target.value)}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Preferred Destination</label>
                                            <input
                                                type="text"
                                                value={editData.preferred_destination}
                                                onChange={(e) => handleInputChange("preferred_destination", e.target.value)}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Travel Pace</label>
                                            <select
                                                value={editData.travel_pace || ""}
                                                onChange={(e) => handleInputChange("travel_pace", e.target.value)}
                                                className="form-input"
                                            >
                                                <option value="">Select travel pace...</option>
                                                <option value="Slow">Slow</option>
                                                <option value="Moderate">Moderate</option>
                                                <option value="Fast">Fast</option>
                                                <option value="Very Fast">Very Fast</option>
                                            </select>
                                        </div>
                                        {saveError && <div className="form-error">{saveError}</div>}
                                        <div className="form-actions">
                                            <button
                                                onClick={handleEditSave}
                                                disabled={isSaving}
                                                className="btn btn-primary"
                                            >
                                                {isSaving ? "Saving..." : "Save Changes"}
                                            </button>
                                            <button
                                                onClick={handleEditCancel}
                                                disabled={isSaving}
                                                className="btn btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="about-content">
                                        <div className="about-item">
                                            <span className="about-label">Budget:</span>
                                            <span className="about-value">${profile.budget_min} - ${profile.budget_max}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Travel Mode:</span>
                                            <span className="about-value">{profile.travel_mode}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Preferred Destination:</span>
                                            <span className="about-value">{profile.preferred_destination}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Travel Pace:</span>
                                            <span className="about-value">{profile.travel_pace}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>Accommodation Preferences</h2>
                                    {editingSection !== "accommodation" && (
                                        <a href="#" className="edit-link" onClick={(e) => {
                                            e.preventDefault();
                                            handleEditStart("accommodation");
                                        }}>Edit</a>
                                    )}
                                </div>
                                {editingSection === "accommodation" ? (
                                    <div className="about-content edit-form">
                                        <div className="form-group">
                                            <label className="form-label">Hotel Type</label>
                                            <input
                                                type="text"
                                                value={editData.hotel_type}
                                                onChange={(e) => handleInputChange("hotel_type", e.target.value)}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Room Sharing</label>
                                            <input
                                                type="text"
                                                value={editData.room_sharing}
                                                onChange={(e) => handleInputChange("room_sharing", e.target.value)}
                                                className="form-input"
                                            />
                                        </div>
                                        {saveError && <div className="form-error">{saveError}</div>}
                                        <div className="form-actions">
                                            <button
                                                onClick={handleEditSave}
                                                disabled={isSaving}
                                                className="btn btn-primary"
                                            >
                                                {isSaving ? "Saving..." : "Save Changes"}
                                            </button>
                                            <button
                                                onClick={handleEditCancel}
                                                disabled={isSaving}
                                                className="btn btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="about-content">
                                        <div className="about-item">
                                            <span className="about-label">Hotel Type:</span>
                                            <span className="about-value">{profile.hotel_type}</span>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Room Sharing:</span>
                                            <span className="about-value">{profile.room_sharing}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>Dining Preferences</h2>
                                    {editingSection !== "dining" && (
                                        <a href="#" className="edit-link" onClick={(e) => {
                                            e.preventDefault();
                                            handleEditStart("dining");
                                        }}>Edit</a>
                                    )}
                                </div>
                                {editingSection === "dining" ? (
                                    <div className="about-content edit-form">
                                        <div className="form-group">
                                            <label className="form-label">Cuisine Preferences</label>
                                            <div className="checkbox-grid">
                                                {["Italian", "Asian", "Mediterranean", "Mexican", "Indian", "French", "Japanese", "Thai"].map((cuisine) => (
                                                    <label key={cuisine} className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={(editData.cuisine_preference || "").split(", ").includes(cuisine)}
                                                            onChange={(e) => {
                                                                const selected = (editData.cuisine_preference || "").split(", ").filter(c => c);
                                                                if (e.target.checked) {
                                                                    selected.push(cuisine);
                                                                } else {
                                                                    selected.splice(selected.indexOf(cuisine), 1);
                                                                }
                                                                handleInputChange("cuisine_preference", selected.join(", "));
                                                            }}
                                                            className="checkbox-input"
                                                        />
                                                        <span className="checkbox-custom"></span>
                                                        {cuisine}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Dietary Restrictions</label>
                                            <div className="checkbox-grid">
                                                {["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Nut-Free", "Halal", "Kosher"].map((restriction) => (
                                                    <label key={restriction} className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={(editData.dietary_restrictions || "").split(", ").includes(restriction)}
                                                            onChange={(e) => {
                                                                const selected = (editData.dietary_restrictions || "").split(", ").filter(r => r);
                                                                if (e.target.checked) {
                                                                    selected.push(restriction);
                                                                } else {
                                                                    selected.splice(selected.indexOf(restriction), 1);
                                                                }
                                                                handleInputChange("dietary_restrictions", selected.join(", "));
                                                            }}
                                                            className="checkbox-input"
                                                        />
                                                        <span className="checkbox-custom"></span>
                                                        {restriction}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        {saveError && <div className="form-error">{saveError}</div>}
                                        <div className="form-actions">
                                            <button
                                                onClick={handleEditSave}
                                                disabled={isSaving}
                                                className="btn btn-primary"
                                            >
                                                {isSaving ? "Saving..." : "Save Changes"}
                                            </button>
                                            <button
                                                onClick={handleEditCancel}
                                                disabled={isSaving}
                                                className="btn btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="about-content">
                                        <div className="about-item">
                                            <span className="about-label">Cuisine Preference:</span>
                                            <div className="chip-container">
                                                {(profile.cuisine_preference || "").split(", ").filter(c => c).map((cuisine) => (
                                                    <span key={cuisine} className="chip">{cuisine}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="about-item">
                                            <span className="about-label">Dietary Restrictions:</span>
                                            <div className="chip-container">
                                                {(profile.dietary_restrictions || "").split(", ").filter(r => r).map((restriction) => (
                                                    <span key={restriction} className="chip">{restriction}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                </div>

                <div className="profile-sidebar">
                    <div className="sidebar-section">
                        <h3>Recent Activity</h3>
                        <p className="placeholder-text">No recent activity</p>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="danger-zone-section">
                <h3 className="danger-zone-title">Danger Zone</h3>
                <p className="danger-zone-description">
                    Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                    className="delete-account-btn"
                    onClick={() => {
                        setShowDeleteModal(true);
                        setDeleteConfirmEmail("");
                        setDeleteError("");
                    }}
                >
                    Delete My Account
                </button>
            </div>

            {/* Delete Account Confirmation Modal */}
            {showDeleteModal && (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <h2 className="modal-title">Delete Account</h2>
                        <p className="modal-body-text">
                            This will <strong>permanently delete</strong> your account, profile, and all associated data.
                            You will receive a confirmation email. This cannot be undone.
                        </p>
                        <p className="modal-body-text">
                            To confirm, type your account email: <strong>{profile.email || user?.email}</strong>
                        </p>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="Enter your email"
                            value={deleteConfirmEmail}
                            onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                        />
                        {deleteError && <p className="form-error">{deleteError}</p>}
                        <div className="modal-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </button>
                            <button
                                className="delete-account-btn"
                                onClick={handleDeleteAccount}
                                disabled={deleteLoading}
                            >
                                {deleteLoading ? "Deleting..." : "Yes, Delete My Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {showFaceSetup && (
                <FaceVerificationSetup
                    onSuccess={() => {
                        setShowFaceSetup(false);
                        setFaceVerificationEnabled(true);
                    }}
                    onCancel={() => setShowFaceSetup(false)}
                />
            )}
        </div>
    );
}
