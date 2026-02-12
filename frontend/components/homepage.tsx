"use client";
import React, { useState } from "react";
import Search from "./Search";
import "./homepage.css";
import SignInModal from "./SignInModal";
import SignUpModal from "./SignUpModal";

export default function Homepage() {
    const [showSignIn, setShowSignIn] = useState(false);
    const [showSignUp, setShowSignUp] = useState(false);

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
                    </div>
                </div>
            </header>

            <aside className="homepage-sidebar" />
            <main className="homepage-main" />

            {showSignIn && (
                <SignInModal
                    onClose={() => setShowSignIn(false)}
                    onSignInSuccess={() => setShowSignIn(false)}
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