"use client";
import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import Search from "../components/Search";
import SignInModal from "../components/SignInModal";
import SignUpModal from "../components/SignUpModal";
import { useRouter } from "next/navigation";
import "../components/homepage.css";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { isAuthenticated, user, logout, locationData } = useAuth();
    const [showSignIn, setShowSignIn] = useState(false);
    const [showSignUp, setShowSignUp] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const dropdown = document.querySelector(".profile-dropdown-container");
            if (dropdown && !dropdown.contains(event.target as Node)) {
                setProfileDropdownOpen(false);
            }
        };
        if (profileDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [profileDropdownOpen]);

    return (
        <div className="homepage-root">
            <header className="homepage-header">
                <div className="header-left">
                    <a href="/" className="logo-link" aria-label="Trips2gether Home">
                        <img
                            src="/logo-main.png"
                            alt="Trips2gether Logo"
                            className="logo-img"
                        />
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
                            <div className="profile-dropdown-container">
                                <button
                                    className="profile-btn"
                                    onClick={() =>
                                        setProfileDropdownOpen(!profileDropdownOpen)
                                    }
                                    aria-label="Profile menu"
                                >
                                    <img
                                        src={user?.avatar_url || "/UserIcon.svg"}
                                        alt="Profile"
                                        className="profile-icon"
                                    />
                                </button>
                                {profileDropdownOpen && (
                                    <div className="profile-dropdown">
                                        <div className="dropdown-user-name">{user.name}</div>
                                        {locationData.location && (
                                            <div className="dropdown-location">
                                                <img
                                                    src="/location.svg"
                                                    alt="Location"
                                                    className="dropdown-icon"
                                                />
                                                <span>{locationData.location}</span>
                                            </div>
                                        )}
                                        <button
                                            className="dropdown-view-profile-link"
                                            onClick={() => {
                                                router.push("/profile");
                                                setProfileDropdownOpen(false);
                                            }}
                                        >
                                            View Profile
                                        </button>
                                        <button
                                            className="dropdown-logout-btn"
                                            onClick={() => {
                                                logout();
                                                setProfileDropdownOpen(false);
                                            }}
                                        >
                                            Log Out
                                        </button>
                                    </div>
                                )}
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

            <aside className={`homepage-sidebar ${sidebarOpen ? "open" : ""}`}>
                <nav className="sidebar-nav">
                    {isAuthenticated && user && (
                        <div className="nav-section profile-section">
                            <button
                                className="nav-item profile-item"
                                onClick={() => router.push("/profile")}
                            >
                                <img
                                    src={user?.avatar_url || "/UserIcon.svg"}
                                    alt="Profile"
                                    className="profile-sidebar-icon"
                                />
                                <span className="profile-sidebar-name">{user.name}</span>
                            </button>
                        </div>
                    )}

                    <div className="nav-section">
                        <a href="/" className="nav-item home-item">
                            <img src="/home.svg" alt="Home" className="nav-icon home-icon" />
                            <span>Home</span>
                        </a>
                    </div>

                    <div className="nav-section">
                        <a href="/explore" className="nav-item">
                            <img src="/magnifying-glass.svg" alt="Explore" className="nav-icon" />
                            <span>Explore Destinations</span>
                        </a>
                        <a href="#" className="nav-item">
                            <img src="/flight.svg" alt="My Trips" className="nav-icon" />
                            <span>My Trips</span>
                        </a>
                        <a href="#" className="nav-item">
                            <img
                                src="/polls.png"
                                alt="Polls & Planning"
                                className="nav-icon"
                            />
                            <span>Polls & Planning</span>
                        </a>
                        <a href="#" className="nav-item">
                            <img
                                src="/bookings.svg"
                                alt="Previous Bookings"
                                className="nav-icon"
                            />
                            <span>Previous Bookings</span>
                        </a>
                        <a href="#" className="nav-item">
                            <img
                                src="/location.svg"
                                alt="Saved Locations"
                                className="nav-icon"
                            />
                            <span>Saved Locations</span>
                        </a>
                        <a href="#" className="nav-item">
                            <img
                                src="/ai.png"
                                alt="AI Travel Assistant"
                                className="nav-icon"
                            />
                            <span>AI Travel Assistant</span>
                        </a>
                    </div>

                    <div className="nav-section">
                        <a href="#" className="nav-item balance-item">
                            <span className="nav-icon">$</span>
                            <span className="balance-text">
                                <span className="balance-label">Balance</span>
                                <span className="balance-amount">$85.20</span>
                            </span>
                        </a>
                    </div>
                </nav>
            </aside>

            <main className="homepage-main">{children}</main>

            {showSignIn && (
                <SignInModal
                    onClose={() => setShowSignIn(false)}
                    onSignInSuccess={() => setShowSignIn(false)}
                    onOpenSignUp={() => {
                        setShowSignIn(false);
                        setShowSignUp(true);
                    }}
                    isSignUpOpen={showSignUp}
                />
            )}

            {showSignUp && (
                <SignUpModal
                    onClose={() => setShowSignUp(false)}
                    onBackToSignIn={() => {
                        setShowSignUp(false);
                        setShowSignIn(true);
                    }}
                    onSignUpSuccess={() => setShowSignUp(false)}
                />
            )}
        </div>
    );
}
