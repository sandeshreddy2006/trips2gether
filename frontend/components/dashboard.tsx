"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CreateGroupModal from "./CreateGroupModal";

type Group = {
    id: number;
    name: string;
    description: string | null;
    created_by: number;
    created_at: string | null;
    member_count: number;
    role: string | null;
};

export default function Dashboard() {
    const router = useRouter();
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [groups, setGroups] = useState<Group[]>([]);

    useEffect(() => {
        fetch("/api/groups", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { groups: [] }))
            .then((data) => setGroups(data.groups || []))
            .catch(() => {});
    }, []);

    return (
        <div className="dashboard-container">
            {/* Welcome Section */}
            <div className="welcome-section">
                <h1 className="welcome-title">Welcome, Alex!</h1>
                <div className="action-buttons">
                    <button className="action-btn dashboard-btn">
                        <span className="btn-icon">D</span>
                        <div className="btn-content">
                            <div className="btn-title">Dashboard</div>
                            <div className="btn-subtitle">View Organise</div>
                        </div>
                    </button>
                    <button className="action-btn create-poll-btn">
                        <span className="btn-icon">+</span>
                        Create Poll
                    </button>
                    <button className="action-btn create-poll-btn" onClick={() => setShowCreateGroup(true)}>
                        <span className="btn-icon">+</span>
                        Create Group
                    </button>
                    <button className="action-btn search-flights-btn">
                        Search Flights
                    </button>
                    <button className="action-btn explore-hotels-btn">
                        <span className="btn-icon">H</span>
                        Explore Hotels
                    </button>
                    <button className="action-btn more-recommend-btn">
                        More Recommend
                    </button>
                    <button className="action-btn filter-btn">
                        <span className="btn-icon">≡</span>
                    </button>
                </div>
            </div>

            {/* Active Trips (real groups from API) */}
            {groups.length > 0 && (
                <div className="active-trips-section">
                    <h2 className="active-trips-title">Active Trips</h2>
                    <div className="active-trips-grid">
                        {groups.map((g) => (
                            <div key={g.id} className="active-trip-card" onClick={() => router.push(`/group/${g.id}`)} style={{ cursor: "pointer" }}>
                                <div className="active-trip-info">
                                    <h3 className="active-trip-name">{g.name}</h3>
                                    {g.description && (
                                        <p className="active-trip-desc">{g.description}</p>
                                    )}
                                </div>
                                <div className="active-trip-meta">
                                    <span className="active-trip-role">{g.role}</span>
                                    <span className="active-trip-members">
                                        {g.member_count} {g.member_count === 1 ? "member" : "members"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Grid */}
            <div className="dashboard-grid">
                {/* Left Column */}
                <div className="dashboard-main">
                    {/* Trip Cards */}
                    <div className="trip-card large-card">
                        <div className="trip-image" style={{ backgroundImage: "url('/trip-marseille.jpg')" }}>
                            <div className="trip-overlay" />
                        </div>
                        <div className="trip-content">
                            <h3 className="trip-title">Marseille Adventure with Friends</h3>
                            <p className="trip-dates">May 15, 2024 - May 21, 2024 | 5 days left</p>
                        </div>
                    </div>

                    {/* Finalizing Trip Section */}
                    <div className="finalizing-section">
                        <h3 className="finalizing-title">Finalizing Trip...</h3>
                        <div className="finalizing-avatars">
                            <img src="/avatar1.jpg" alt="User 1" className="avatar" />
                            <img src="/avatar2.jpg" alt="User 2" className="avatar" />
                            <img src="/avatar3.jpg" alt="User 3" className="avatar" />
                            <img src="/avatar4.jpg" alt="User 4" className="avatar" />
                            <span className="more-avatars">+3</span>
                        </div>
                        <button className="view-plan-btn">View Plan</button>
                    </div>

                    {/* Trips Grid */}
                    <div className="trips-grid">
                        <div className="trip-card">
                            <div className="trip-image" style={{ backgroundImage: "url('/trip-weekend.jpg')" }}>
                                <div className="trip-overlay" />
                            </div>
                            <div className="trip-content">
                                <h3 className="trip-title">Planning Weekend Getaway</h3>
                                <p className="trip-dates">May 31, 2024 - Jun 2, 2024</p>
                                <div className="trip-meta">
                                    <span className="trip-suggestion">Suggestions Ready</span>
                                    <span className="trip-percentage">70%</span>
                                </div>
                            </div>
                        </div>

                        <div className="trip-card">
                            <div className="trip-image" style={{ backgroundImage: "url('/trip-thailand.jpg')" }}>
                                <div className="trip-overlay" />
                            </div>
                            <div className="trip-content">
                                <h3 className="trip-title">Thailand Adventure</h3>
                                <p className="trip-dates">Jun 15, 2024 - Jun 25, 2024</p>
                                <div className="trip-meta">
                                    <span className="trip-status">Plan Expired</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Upcoming Polls Section */}
                    <div className="upcoming-polls">
                        <h3 className="polls-title">Upcoming Polls</h3>
                        <div className="polls-grid">
                            <div className="poll-card">
                                <h4 className="poll-question">Vote on Marseille Flights</h4>
                                <div className="poll-time">4 hours</div>
                                <div className="poll-options">
                                    <label className="poll-option">
                                        <input type="radio" name="marseille" />
                                        <span>Delta Airlines</span>
                                    </label>
                                    <label className="poll-option">
                                        <input type="radio" name="marseille" />
                                        <span>Air France</span>
                                    </label>
                                </div>
                                <button className="vote-btn">Vote Now</button>
                            </div>

                            <div className="poll-card">
                                <h4 className="poll-question">Vote on Hotel for London Trip</h4>
                                <div className="poll-time">Tomorrow</div>
                                <div className="poll-options">
                                    <label className="poll-option">
                                        <input type="radio" name="london" />
                                        <span>Hotel One Hundred Shoreditch</span>
                                    </label>
                                    <label className="poll-option">
                                        <input type="radio" name="london" />
                                        <span>The Westminster London</span>
                                    </label>
                                </div>
                                <button className="vote-btn">Vote</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar */}
                <aside className="dashboard-sidebar">
                    {/* Suggested Trips */}
                    <div className="suggested-section">
                        <h3 className="sidebar-title">Suggested Trips for Your Group</h3>
                        <div className="suggested-trips">
                            <div className="suggested-trip">
                                <div className="trip-image" style={{ backgroundImage: "url('/trip-santorini.jpg')" }}>
                                    <div className="trip-overlay" />
                                    <span className="trip-percentage">85%</span>
                                </div>
                                <h4 className="trip-name">Santorini</h4>
                            </div>

                            <div className="suggested-trip">
                                <div className="trip-image" style={{ backgroundImage: "url('/trip-kyoto.jpg')" }}>
                                    <div className="trip-overlay" />
                                    <span className="trip-percentage">81%</span>
                                </div>
                                <h4 className="trip-name">Kyoto</h4>
                            </div>

                            <div className="suggested-trip">
                                <div className="trip-image" style={{ backgroundImage: "url('/trip-prague.jpg')" }}>
                                    <div className="trip-overlay" />
                                    <span className="trip-percentage">79%</span>
                                </div>
                                <h4 className="trip-name">Prague</h4>
                            </div>
                        </div>
                    </div>

                    {/* My Bookings */}
                    <div className="bookings-section">
                        <h3 className="sidebar-title">My Bookings</h3>
                        <div className="booking-card">
                            <div className="booking-image" style={{ backgroundImage: "url('/booking-marseille.jpg')" }} />
                            <div className="booking-content">
                                <h4 className="booking-title">Marseille Adventure</h4>
                                <p className="booking-dates">May 15 - May 21</p>
                                <p className="booking-info">5.4 Days</p>
                                <button className="view-details-btn">View Details</button>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            {showCreateGroup && (
                <CreateGroupModal
                    onClose={() => setShowCreateGroup(false)}
                    onGroupCreated={(group) => {
                        setGroups((prev) => [group, ...prev]);
                    }}
                />
            )}
        </div>
    );
}
