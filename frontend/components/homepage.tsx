"use client";
import React, { useState } from "react";
import { useAuth } from "../app/AuthContext";
import Search from "./Search";
import "./homepage.css";
import SignInModal from "./SignInModal";
import SignUpModal from "./SignUpModal";

export default function Homepage() {
    const { isAuthenticated, user, logout, locationData } = useAuth();
    const [showSignIn, setShowSignIn] = useState(false);
    const [showSignUp, setShowSignUp] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="homepage-root">
            <header className="homepage-header">
                <div className="header-left">
                    <a href="/" className="logo-link" aria-label="Trips2gether Home">
                        <img src="/logo-main.png" alt="Trips2gether Logo" className="logo-img" />
                    </a>
                </div>

                <div className="header-center">
                    <div className="search-container">
                        <div className="search-inner">
                            <Search placeholder="Search for destinations, flights or plans" />
                        </div>
                    </div>
                </div>

                <div className="header-right">
                    <div className="auth">
                        {isAuthenticated && user ? (
                            <div className="user-section">
                                <div className="user-info">
                                    <div className="user-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                            <circle cx="12" cy="7" r="4"></circle>
                                        </svg>
                                    </div>
                                    <span className="username">{user.name}</span>
                                </div>
                                {locationData.location && (
                                    <div className="location-info">
                                        <span className="location-icon">📍</span>
                                        <span className="location-text">{locationData.location}</span>
                                    </div>
                                )}
                                <button
                                    className="logout-btn"
                                    onClick={logout}
                                    title="Logout"
                                >
                                    Log Out
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    className="signin"
                                    onClick={() => {
                                        setShowSignUp(false);
                                        setShowSignIn(true);
                                    }}
                                >
                                    Sign in
                                </button>

                                <button
                                    className="register"
                                    onClick={() => {
                                        setShowSignIn(false);
                                        setShowSignUp(true);
                                    }}
                                >
                                    Register
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle sidebar"
                aria-expanded={sidebarOpen}
            >
                <span className="arrow-icon">›</span>
            </button>

            <aside className={`homepage-sidebar ${sidebarOpen ? 'open' : ''}`} />
            <main className="homepage-main" />

            {showSignIn && (
                <SignInModal
                    onClose={() => setShowSignIn(false)}
                    onSignInSuccess={() => setShowSignIn(false)}
                    onOpenSignUp={() => {
                        setShowSignIn(false);
                        setShowSignUp(true);
                    }}
                />
            )}

            {showSignUp && (
                <SignUpModal
                    onClose={() => setShowSignUp(false)}
                    onBackToSignIn={() => {
                        setShowSignUp(false);
                        setShowSignIn(true);
                    }}
                />
            )}
        </div>
    );
}