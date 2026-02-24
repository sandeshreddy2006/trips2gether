"use client";
import React, { useState } from "react";
import { useAuth } from "../app/AuthContext";
import "./profile.css";

export default function Profile() {
    const { user, locationData } = useAuth();
    const [activeTab, setActiveTab] = useState("overview");

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
                            onClick={() => setActiveTab("overview")}
                        >
                            Overview
                        </button>
                        <button
                            className={`tab ${activeTab === "trips" ? "active" : ""}`}
                            onClick={() => setActiveTab("trips")}
                        >
                            Upcoming Trips
                        </button>
                        <button
                            className={`tab ${activeTab === "friends" ? "active" : ""}`}
                            onClick={() => setActiveTab("friends")}
                        >
                            Friends
                        </button>
                        <button
                            className={`tab ${activeTab === "wishlist" ? "active" : ""}`}
                            onClick={() => setActiveTab("wishlist")}
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
                            <div className="profile-section">
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

                            <div className="profile-section">
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
                        <div className="profile-section">
                            <h2>Upcoming Trips</h2>
                            <p className="placeholder-text">No upcoming trips scheduled</p>
                        </div>
                    )}

                    {activeTab === "friends" && (
                        <div className="profile-section">
                            <h2>Friends</h2>
                            <p className="placeholder-text">No friends added yet</p>
                        </div>
                    )}

                    {activeTab === "wishlist" && (
                        <div className="profile-section">
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
        </div>
    );
}
