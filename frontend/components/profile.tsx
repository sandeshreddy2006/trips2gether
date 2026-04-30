"use client";
import React, { useCallback, useEffect, useState } from "react";
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

type ProfileVisibility = "public" | "friends_only" | "private";
type FriendStatus = "self" | "none" | "pending" | "accepted";

type UserSearchResult = {
    id: number;
    name: string;
    avatar_url?: string | null;
    friend_status: FriendStatus;
};

type ProfileView = {
    id: number;
    user_id: number;
    username: string;
    avatar_url?: string | null;
    bio?: string | null;
    visibility: ProfileVisibility;
    friend_status: FriendStatus;
    can_view: boolean;
    budget_min?: number | null;
    budget_max?: number | null;
    travel_mode?: string | null;
    preferred_destination?: string | null;
    travel_pace?: string | null;
    hotel_type?: string | null;
    room_sharing?: string | null;
    cuisine_preference?: string | null;
    dietary_restrictions?: string | null;
};

type ProfileData = {
    username: string;
    email: string;
    avatar_url: string;
    bio: string;
    budget_min: number;
    budget_max: number;
    wallet_balance: number;
    travel_mode: string;
    preferred_destination: string;
    travel_pace: string;
    hotel_type: string;
    room_sharing: string;
    cuisine_preference: string;
    dietary_restrictions: string;
    visibility: ProfileVisibility;
};

type ApiMessage = {
    detail?: string;
    message?: string;
};

type TravelBooking = {
    id: number;
    order_id: string;
    booking_reference: string;
    total_amount: string;
    currency: string;
    payment_status: string;
    offer_id?: string | null;
    created_at: string;
    updated_at: string;
};

type TravelGroup = {
    id: number;
    name: string;
    description?: string | null;
    status: string;
    created_by: number;
    created_at?: string | null;
    joined_at?: string | null;
    member_count: number;
    role?: string | null;
    trip_item_count?: number;
    trip_start_at?: string | null;
    trip_end_at?: string | null;
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
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
    const [userSearchLoading, setUserSearchLoading] = useState(false);
    const [userSearchHasSearched, setUserSearchHasSearched] = useState(false);
    const [userSearchError, setUserSearchError] = useState<string | null>(null);
    const [viewedProfile, setViewedProfile] = useState<ProfileView | null>(null);
    const [profileLookupLoading, setProfileLookupLoading] = useState<number | null>(null);
    const [profileLookupError, setProfileLookupError] = useState<string | null>(null);
    const [showFaceSetup, setShowFaceSetup] = useState(false);
    const [faceVerificationEnabled, setFaceVerificationEnabled] = useState(false);
    const [faceVerificationLoading, setFaceVerificationLoading] = useState(false);
    const [travelBookings, setTravelBookings] = useState<TravelBooking[]>([]);
    const [travelGroups, setTravelGroups] = useState<TravelGroup[]>([]);
    const [travelHistoryLoading, setTravelHistoryLoading] = useState(false);
    const [travelHistoryLoaded, setTravelHistoryLoaded] = useState(false);
    const [travelHistoryError, setTravelHistoryError] = useState<string | null>(null);

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

    async function handleUserSearch() {
        const query = userSearchQuery.trim();
        if (!query) {
            setUserSearchResults([]);
            setUserSearchHasSearched(false);
            setUserSearchError("Enter a username or email to search");
            return;
        }

        setUserSearchLoading(true);
        setUserSearchError(null);
        setProfileLookupError(null);
        try {
            const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
                credentials: "include",
            });
            if (!res.ok) {
                let msg = "Failed to search users";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }

            const data = await res.json();
            setUserSearchResults(Array.isArray(data.users) ? data.users : []);
            setUserSearchHasSearched(true);
        } catch (err) {
            setUserSearchError(err instanceof Error ? err.message : "Failed to search users");
            setUserSearchHasSearched(false);
        } finally {
            setUserSearchLoading(false);
        }
    }

    async function handleViewUserProfile(userId: number) {
        setProfileLookupLoading(userId);
        setProfileLookupError(null);
        try {
            const res = await fetch(`/api/users/${userId}/profile`, {
                credentials: "include",
            });
            if (!res.ok) {
                let msg = "Failed to load profile";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }

            const data = await res.json();
            setViewedProfile(data);
        } catch (err) {
            setProfileLookupError(err instanceof Error ? err.message : "Failed to load profile");
        } finally {
            setProfileLookupLoading(null);
        }
    }

    const loadTravelHistory = useCallback(async () => {
        if (travelHistoryLoading || travelHistoryLoaded) {
            return;
        }

        setTravelHistoryLoading(true);
        setTravelHistoryError(null);
        try {
            const [bookingsRes, groupsRes] = await Promise.all([
                fetch("/api/bookings", { credentials: "include" }),
                fetch("/api/groups", { credentials: "include" }),
            ]);

            if (!bookingsRes.ok) {
                let msg = "Failed to load past bookings";
                try {
                    const data = await bookingsRes.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }

            if (!groupsRes.ok) {
                let msg = "Failed to load groups";
                try {
                    const data = await groupsRes.json();
                    msg = data.detail || data.message || msg;
                } catch (_) {
                    // keep default message
                }
                throw new Error(msg);
            }

            const [bookingsData, groupsData] = await Promise.all([
                bookingsRes.json(),
                groupsRes.json(),
            ]);

            setTravelBookings(Array.isArray(bookingsData.bookings) ? bookingsData.bookings : []);
            setTravelGroups(Array.isArray(groupsData.groups) ? groupsData.groups : []);
            setTravelHistoryLoaded(true);
        } catch (err) {
            setTravelHistoryError(err instanceof Error ? err.message : "Failed to load travel history");
        } finally {
            setTravelHistoryLoading(false);
        }
    }, [travelHistoryLoaded, travelHistoryLoading]);

    useEffect(() => {
        void loadFriendRequests(true);
    }, []);

    useEffect(() => {
        void loadTravelHistory();
    }, [loadTravelHistory]);

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
            let payload: ApiMessage | null = null;
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
        if (tab === "trips") {
            void loadTravelHistory();
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
    const [profile, setProfile] = useState<ProfileData>({
        username: user?.name || "User",
        email: user?.email || "",
        avatar_url: "/UserIcon.svg",
        bio: "Travel enthusiast and foodie. Love exploring new destinations and meeting new people!",
        budget_min: 1000,
        budget_max: 3000,
        wallet_balance: 0,
        travel_mode: "Adventure",
        preferred_destination: "Southeast Asia",
        travel_pace: "Moderate",
        hotel_type: "Mid-range",
        room_sharing: "Open",
        cuisine_preference: "Italian, Asian, Mediterranean",
        dietary_restrictions: "Vegetarian friendly",
        visibility: "public" as ProfileVisibility,
    });

    const [editData, setEditData] = useState({ ...profile });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [walletError, setWalletError] = useState<string | null>(null);
    const [bioError, setBioError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [walletTopUpLoading, setWalletTopUpLoading] = useState(false);
    const [customTopUpAmount, setCustomTopUpAmount] = useState<string>("");

    const clearWalletTopUpParams = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("wallet_topup");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
    };

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

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const topupStatus = params.get("wallet_topup");
        const sessionId = params.get("session_id");

        const confirmCheckoutTopUp = async (sid: string) => {
            setWalletTopUpLoading(true);
            setWalletError(null);
            try {
                const response = await fetch("/api/wallet/top-up-confirm", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({ session_id: sid }),
                });

                const rawText = await response.text();
                const data = rawText ? JSON.parse(rawText) : {};

                if (!response.ok) {
                    throw new Error(data.detail || "Failed to confirm checkout payment");
                }

                setProfile((prev) => ({ ...prev, wallet_balance: data.wallet_balance }));
                setEditData((prev) => ({ ...prev, wallet_balance: data.wallet_balance }));

                if (data.already_processed) {
                    setSuccessMessage("Wallet top-up was already confirmed.");
                } else {
                    setSuccessMessage(
                        `Wallet topped up by ${data.currency} ${Number(data.amount_added).toFixed(2)} after secure Stripe checkout.`
                    );
                }
                setTimeout(() => setSuccessMessage(null), 3000);
            } catch (error: unknown) {
                const message = error instanceof SyntaxError
                    ? "Backend returned a non-JSON error. Check backend logs and retry."
                    : error instanceof Error ? error.message : "Failed to confirm checkout payment";
                setWalletError(message);
            } finally {
                setWalletTopUpLoading(false);
                clearWalletTopUpParams();
            }
        };

        if (topupStatus === "success" && sessionId) {
            void confirmCheckoutTopUp(sessionId);
        } else if (topupStatus === "cancel") {
            setWalletError("Stripe checkout was cancelled.");
            clearWalletTopUpParams();
        }
    }, []);

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
            const fieldsToUpdate: Partial<ProfileData> = {};

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
            } else if (editingSection === "privacy") {
                fieldsToUpdate.visibility = editData.visibility;
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
        } catch (error: unknown) {
            setSaveError(error instanceof Error ? error.message : "Failed to save changes");
            console.error("Error saving profile:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field: string, value: string | number) => {
        setEditData({ ...editData, [field]: value });
    };

    const handleWalletTopUp = async (amount: number) => {
        setWalletTopUpLoading(true);
        setWalletError(null);

        try {
            const response = await fetch("/api/wallet/top-up-checkout-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({ amount, currency: "USD" }),
            });

            const rawText = await response.text();
            const data = rawText ? JSON.parse(rawText) : {};
            if (!response.ok) {
                throw new Error(data.detail || "Failed to create Stripe checkout session");
            }

            if (!data.checkout_url) {
                throw new Error("Stripe checkout URL not returned");
            }

            window.location.href = data.checkout_url;
        } catch (error: unknown) {
            const message = error instanceof SyntaxError
                ? "Backend returned a non-JSON error. Check the backend logs and restart the server."
                : error instanceof Error ? error.message : "Failed to top up wallet";
            setWalletError(message);
        } finally {
            setWalletTopUpLoading(false);
        }
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
            } catch (error: unknown) {
                setSaveError(error instanceof Error ? error.message : "Failed to upload avatar");
                console.error("Error uploading avatar:", error);
            } finally {
                setIsUploadingAvatar(false);
            }
        }
    };

    const formatBookingDate = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const formatBookingAmount = (booking: TravelBooking) => {
        const amount = Number(booking.total_amount);
        if (Number.isNaN(amount)) {
            return `${booking.currency} ${booking.total_amount}`;
        }

        return `${booking.currency} ${amount.toFixed(2)}`;
    };

    const formatStatusLabel = (status: string) => {
        if (!status) {
            return "Unknown";
        }

        return status
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    };

    const getStatusPillClass = (status: string) => {
        const normalizedStatus = status
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        return `booking-status-pill status-${normalizedStatus || "unknown"}`;
    };

    const formatVisibilityLabel = (visibility: ProfileVisibility) => {
        if (visibility === "friends_only") {
            return "Friends only";
        }
        return visibility.charAt(0).toUpperCase() + visibility.slice(1);
    };

    const formatFriendStatus = (status: FriendStatus) => {
        if (status === "accepted") {
            return "Friend";
        }
        if (status === "pending") {
            return "Request pending";
        }
        if (status === "self") {
            return "You";
        }
        return "Not friends";
    };

    const recentActivities = [
        ...travelBookings.map((booking) => ({
            id: `booking-${booking.id}`,
            type: "Booking",
            title: `Flight booked ${booking.booking_reference || booking.order_id}`,
            detail: `${formatBookingAmount(booking)} - ${formatStatusLabel(booking.payment_status)}`,
            date: booking.created_at,
        })),
        ...travelGroups.map((group) => ({
            id: `group-${group.id}`,
            type: "Group",
            title: `Joined ${group.name}`,
            detail: `${group.member_count} ${group.member_count === 1 ? "member" : "members"} - ${formatStatusLabel(group.role || "member")}`,
            date: group.joined_at || group.created_at || "",
        })),
    ]
        .filter((activity) => activity.date && !Number.isNaN(new Date(activity.date).getTime()))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

    return (
        <div className="profile-container">
            <div className="profile-header">
                <div className="profile-banner">
                    <img src="/banner.png" alt="Banner" className="banner-image" onError={(e) => {
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
                            Travel History
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

                            <div className="profile-card">
                                <div className="section-header">
                                    <h2>Wallet</h2>
                                </div>
                                <div className="wallet-panel">
                                    <div className="wallet-balance-item">
                                        <span className="wallet-balance-label">Available Balance</span>
                                        <span className="wallet-balance-value">
                                            USD {Number(profile.wallet_balance ?? 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="wallet-topup-actions">
                                        <input
                                            type="number"
                                            min="1"
                                            max="5000"
                                            step="1"
                                            placeholder="Enter amount (USD)"
                                            value={customTopUpAmount}
                                            onChange={(e) => setCustomTopUpAmount(e.target.value)}
                                            disabled={walletTopUpLoading}
                                            className="wallet-topup-input"
                                        />
                                        <button
                                            onClick={() => {
                                                const amt = parseFloat(customTopUpAmount);
                                                if (!amt || amt < 1 || amt > 5000) {
                                                    setWalletError("Please enter an amount between USD 1 and USD 5000.");
                                                    return;
                                                }
                                                handleWalletTopUp(amt);
                                            }}
                                            disabled={walletTopUpLoading || !customTopUpAmount}
                                            className="btn btn-primary wallet-topup-btn"
                                        >
                                            {walletTopUpLoading ? "Processing..." : "Top Up"}
                                        </button>
                                    </div>
                                    {walletError && <div className="form-error wallet-error">{walletError}</div>}
                                </div>
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
                                    <h2>Profile Visibility</h2>
                                    {editingSection !== "privacy" && (
                                        <a href="#" className="edit-link" onClick={(e) => {
                                            e.preventDefault();
                                            handleEditStart("privacy");
                                        }}>Edit</a>
                                    )}
                                </div>
                                {editingSection === "privacy" ? (
                                    <div className="about-content edit-form">
                                        <div className="form-group">
                                            <label className="form-label">Who can view your travel profile?</label>
                                            <select
                                                value={editData.visibility || "public"}
                                                onChange={(e) => handleInputChange("visibility", e.target.value)}
                                                className="form-input"
                                            >
                                                <option value="public">Public - anyone can view it</option>
                                                <option value="friends_only">Friends only - accepted friends can view it</option>
                                                <option value="private">Private - only you can view it</option>
                                            </select>
                                            <small className="form-hint">
                                                This controls what other users see when they open your profile from search.
                                            </small>
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
                                            <span className="about-label">Visibility:</span>
                                            <span className="about-value">
                                                {formatVisibilityLabel((profile.visibility || "public") as ProfileVisibility)}
                                            </span>
                                        </div>
                                        <p className="privacy-helper">
                                            {profile.visibility === "private"
                                                ? "Only you can view your full profile."
                                                : profile.visibility === "friends_only"
                                                    ? "Only accepted friends can view your full profile."
                                                    : "Anyone who finds you in search can view your full profile."}
                                        </p>
                                    </div>
                                )}
                            </div>

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
                        <div className="profile-card travel-history-card">
                            <div className="section-header">
                                <h2>Travel History</h2>
                            </div>
                            {travelHistoryLoading ? (
                                <p className="placeholder-text">Loading your travel history...</p>
                            ) : travelHistoryError ? (
                                <p className="friends-error">{travelHistoryError}</p>
                            ) : travelHistoryLoaded && travelBookings.length === 0 && travelGroups.length === 0 ? (
                                <div className="travel-history-empty">
                                    <h3>No travel history yet</h3>
                                    <p>Your past flight bookings and group travel plans will show up here once you start planning.</p>
                                </div>
                            ) : (
                                <>
                                    <section className="travel-history-section">
                                        <div className="travel-history-subheader">
                                            <div>
                                                <h3>Past Bookings</h3>
                                                <p>Review your previous flight purchases and payment details.</p>
                                            </div>
                                            {travelHistoryLoaded && (
                                                <span className="travel-history-count">
                                                    {travelBookings.length} {travelBookings.length === 1 ? "booking" : "bookings"}
                                                </span>
                                            )}
                                        </div>

                                        {!travelHistoryLoaded ? (
                                            <p className="placeholder-text">Open Travel History to load your previous bookings.</p>
                                        ) : travelBookings.length === 0 ? (
                                            <p className="placeholder-text">No previous flight bookings yet.</p>
                                        ) : (
                                            <div className="booking-history-list">
                                                {travelBookings.map((booking) => (
                                                    <article key={booking.id} className="booking-history-card">
                                                        <div className="booking-history-main">
                                                            <span className="booking-history-label">Booking Reference</span>
                                                            <strong className="booking-history-reference">
                                                                {booking.booking_reference || "Reference pending"}
                                                            </strong>
                                                            <span className="booking-history-order">Order {booking.order_id}</span>
                                                        </div>
                                                        <div className="booking-history-detail">
                                                            <span className="booking-history-label">Amount</span>
                                                            <strong>{formatBookingAmount(booking)}</strong>
                                                        </div>
                                                        <div className="booking-history-detail">
                                                            <span className="booking-history-label">Payment Status</span>
                                                            <span className={getStatusPillClass(booking.payment_status)}>
                                                                {formatStatusLabel(booking.payment_status)}
                                                            </span>
                                                        </div>
                                                        <div className="booking-history-detail">
                                                            <span className="booking-history-label">Booked On</span>
                                                            <strong>{formatBookingDate(booking.created_at)}</strong>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="travel-history-section">
                                        <div className="travel-history-subheader">
                                            <div>
                                                <h3>My Groups</h3>
                                                <p>Jump back into the group trips you belong to.</p>
                                            </div>
                                            {travelHistoryLoaded && (
                                                <span className="travel-history-count">
                                                    {travelGroups.length} {travelGroups.length === 1 ? "group" : "groups"}
                                                </span>
                                            )}
                                        </div>

                                        {!travelHistoryLoaded ? (
                                            <p className="placeholder-text">Open Travel History to load your groups.</p>
                                        ) : travelGroups.length === 0 ? (
                                            <p className="placeholder-text">You are not a member of any groups yet.</p>
                                        ) : (
                                            <div className="group-history-list">
                                                {travelGroups.map((group) => (
                                                    <article key={group.id} className="group-history-card">
                                                        <div className="group-history-main">
                                                            <span className="booking-history-label">Group</span>
                                                            <strong>{group.name}</strong>
                                                            {group.description && (
                                                                <span className="group-history-description">{group.description}</span>
                                                            )}
                                                        </div>
                                                        <div className="group-history-detail">
                                                            <span className="booking-history-label">Members</span>
                                                            <strong>
                                                                {group.member_count} {group.member_count === 1 ? "member" : "members"}
                                                            </strong>
                                                        </div>
                                                        <div className="group-history-detail">
                                                            <span className="booking-history-label">Role</span>
                                                            <strong>{formatStatusLabel(group.role || "member")}</strong>
                                                        </div>
                                                        <div className="group-history-detail">
                                                            <span className="booking-history-label">Status</span>
                                                            <span className={getStatusPillClass(group.status)}>
                                                                {formatStatusLabel(group.status)}
                                                            </span>
                                                        </div>
                                                        <a className="group-history-link" href={`/group/${group.id}`}>
                                                            View Group
                                                        </a>
                                                    </article>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
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
                            {profileLookupError && <p className="friends-error">{profileLookupError}</p>}

                            <div className="user-search-panel">
                                <div className="user-search-copy">
                                    <h3>Find Travelers</h3>
                                    <p>Search for a user, open their profile, and see only what their visibility setting allows.</p>
                                </div>
                                <div className="user-search-form">
                                    <input
                                        className="friends-modal-input user-search-input"
                                        type="text"
                                        placeholder="Search by username or email"
                                        value={userSearchQuery}
                                        onChange={(e) => {
                                            setUserSearchQuery(e.target.value);
                                            setUserSearchHasSearched(false);
                                            if (userSearchError) setUserSearchError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !userSearchLoading) {
                                                void handleUserSearch();
                                            }
                                        }}
                                    />
                                    <button
                                        className="friends-modal-submit user-search-submit"
                                        onClick={handleUserSearch}
                                        disabled={userSearchLoading}
                                    >
                                        {userSearchLoading ? "Searching..." : "Search"}
                                    </button>
                                </div>
                                {userSearchError && <p className="friends-error user-search-message">{userSearchError}</p>}
                                {userSearchResults.length > 0 && (
                                    <div className="user-search-results">
                                        {userSearchResults.map((result) => (
                                            <div key={result.id} className="friend-row search-result-row">
                                                <div className="friend-main">
                                                    <img
                                                        src={result.avatar_url || "/UserIcon.svg"}
                                                        alt={result.name}
                                                        className="friend-avatar"
                                                    />
                                                    <div className="friend-meta">
                                                        <span className="friend-name">{result.name}</span>
                                                        <span className="friend-sub">{formatFriendStatus(result.friend_status)}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    className="accept-friend-btn"
                                                    onClick={() => handleViewUserProfile(result.id)}
                                                    disabled={profileLookupLoading === result.id}
                                                >
                                                    {profileLookupLoading === result.id ? "Opening..." : "View Profile"}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {!userSearchLoading && userSearchHasSearched && userSearchResults.length === 0 && !userSearchError && (
                                    <p className="placeholder-text search-empty-state">No matching users found.</p>
                                )}
                            </div>

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
                                            <div className="friend-actions">
                                                <button
                                                    className="accept-friend-btn"
                                                    onClick={() => handleViewUserProfile(friend.id)}
                                                    disabled={profileLookupLoading === friend.id}
                                                >
                                                    {profileLookupLoading === friend.id ? "Opening..." : "View Profile"}
                                                </button>
                                                <button
                                                    className="remove-friend-btn"
                                                    onClick={() => handleRemoveFriend(friend.id)}
                                                    disabled={removeFriendId === friend.id}
                                                >
                                                    {removeFriendId === friend.id ? "Removing..." : "Remove"}
                                                </button>
                                            </div>
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
                        {travelHistoryLoading ? (
                            <p className="placeholder-text">Loading recent activity...</p>
                        ) : travelHistoryError ? (
                            <p className="recent-activity-error">Unable to load recent activity</p>
                        ) : recentActivities.length === 0 ? (
                            <p className="placeholder-text">No recent activity</p>
                        ) : (
                            <div className="recent-activity-list">
                                {recentActivities.map((activity) => (
                                    <div key={activity.id} className="recent-activity-item">
                                        <div className="recent-activity-topline">
                                            <span className="recent-activity-type">{activity.type}</span>
                                            <span className="recent-activity-date">{formatBookingDate(activity.date)}</span>
                                        </div>
                                        <strong>{activity.title}</strong>
                                        <span>{activity.detail}</span>
                                    </div>
                                ))}
                            </div>
                        )}
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

            {viewedProfile && (
                <div className="friends-modal-overlay" role="dialog" aria-modal="true">
                    <div className="friends-modal profile-view-modal">
                        <div className="friends-modal-header">
                            <h3>{viewedProfile.username}</h3>
                            <button className="friends-modal-close" onClick={() => setViewedProfile(null)} aria-label="Close">
                                &times;
                            </button>
                        </div>
                        <div className="profile-view-header">
                            <img
                                src={viewedProfile.avatar_url || "/UserIcon.svg"}
                                alt={viewedProfile.username}
                                className="profile-view-avatar"
                            />
                            <div>
                                <p className="profile-view-status">{formatFriendStatus(viewedProfile.friend_status)}</p>
                                <p className="profile-view-visibility">
                                    Visibility: {formatVisibilityLabel(viewedProfile.visibility)}
                                </p>
                            </div>
                        </div>

                        {!viewedProfile.can_view ? (
                            <div className="restricted-profile-message">
                                This traveler has limited their profile visibility. Send or accept a friend request to view more if their profile is friends-only.
                            </div>
                        ) : (
                            <div className="profile-view-details">
                                <div className="profile-view-section">
                                    <span className="profile-view-label">Bio</span>
                                    <p>{viewedProfile.bio || "No bio added yet."}</p>
                                </div>
                                <div className="profile-view-grid">
                                    <div>
                                        <span className="profile-view-label">Budget</span>
                                        <p>
                                            ${viewedProfile.budget_min ?? "?"} - ${viewedProfile.budget_max ?? "?"}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Travel Mode</span>
                                        <p>{viewedProfile.travel_mode || "Not specified"}</p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Preferred Destination</span>
                                        <p>{viewedProfile.preferred_destination || "Not specified"}</p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Travel Pace</span>
                                        <p>{viewedProfile.travel_pace || "Not specified"}</p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Hotel Type</span>
                                        <p>{viewedProfile.hotel_type || "Not specified"}</p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Room Sharing</span>
                                        <p>{viewedProfile.room_sharing || "Not specified"}</p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Cuisine</span>
                                        <p>{viewedProfile.cuisine_preference || "Not specified"}</p>
                                    </div>
                                    <div>
                                        <span className="profile-view-label">Dietary Restrictions</span>
                                        <p>{viewedProfile.dietary_restrictions || "Not specified"}</p>
                                    </div>
                                </div>
                            </div>
                        )}
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
