"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "../app/AuthContext";
import { useGoogleLogin } from "@react-oauth/google";
import ReCAPTCHA from "react-google-recaptcha";
import LinkAccountModal from "./LinkAccountModal";
import EmailVerificationModal from "./EmailVerificationModal";
import "./SignInModal.css";

type SignUpModalProps = {
    onClose: () => void;
    onBackToSignIn: () => void;
    onSignUpSuccess: () => void;
};

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
        return JSON.stringify(err);
    } catch {
        return "Sign up failed";
    }
};

export default function SignUpModal({ onClose, onBackToSignIn, onSignUpSuccess }: SignUpModalProps) {
    const { login, locationData } = useAuth();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);
    const [linkingEmail, setLinkingEmail] = useState<string | null>(null);
    const [showVerification, setShowVerification] = useState(false);
    const [pendingEmail, setPendingEmail] = useState<string | null>(null);

    const isValidEmail = (s: string) => /\S+@\S+\.\S+/.test(s.trim());
    const canSubmit =
        !busy &&
        isValidEmail(email) &&
        username.trim().length > 0 &&
        pw.length >= 8 &&
        pw === pw2;

    // Google login handler
    const googleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setBusy(true);
            setError(null);
            try {
                const payload: any = {
                    token: tokenResponse.access_token,
                };
                if (locationData.latitude !== null) payload.latitude = locationData.latitude;
                if (locationData.longitude !== null) payload.longitude = locationData.longitude;
                if (locationData.location) payload.location = locationData.location;

                const res = await fetch('/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload),
                });

                if (!res.ok) {
                    let msg = 'Google sign-up failed';
                    try {
                        const data = await res.json();
                        msg = data.detail || data.message || msg;
                    } catch {
                        try { msg = await res.text() } catch { }
                    }
                    throw new Error(msg);
                }

                const data = await res.json();

                // Check if account linking is needed
                if (data.needs_linking) {
                    // Show linking modal instead of signing up
                    setPendingGoogleToken(tokenResponse.access_token);
                    setLinkingEmail(data.email);
                    setShowLinkModal(true);
                    setBusy(false);
                } else if (data.ok) {
                    // Account linked or new account, proceed
                    login();
                    onSignUpSuccess();
                } else {
                    throw new Error('Sign up failed');
                }
            } catch (err) {
                setError(getErrorMessage(err));
            } finally {
                setBusy(false);
            }
        },
        onError: () => {
            setError('Google sign-up failed');
        },
    });

    async function handleSignUp(): Promise<void> {
        setError(null);
        if (!canSubmit) {
            if (!isValidEmail(email)) return setError("Please enter a valid email.");
            if (!username.trim()) return setError("Please enter a username.");
            if (pw.length < 8) return setError("Password should be at least 8 characters.");
            if (pw !== pw2) return setError("Passwords do not match.");
            return;
        }
        if (!recaptchaToken) {
            setError("Please complete the reCAPTCHA verification");
            return;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    email: email.trim(),
                    password: pw,
                    name: username.trim(),
                    latitude: locationData.latitude,
                    longitude: locationData.longitude,
                    location: locationData.location,
                    recaptchaToken,
                }),
            });

            if (!res.ok) {
                let msg = "Sign up failed";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch {
                    try {
                        msg = (await res.text()) || msg;
                    } catch { }
                }
                throw new Error(msg);
            }

            // Show verification modal instead of auto-login
            setPendingEmail(email.trim());
            setShowVerification(true);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && canSubmit) void handleSignUp();
    }

    function getPasswordStrength(p: string) {
        let score = 0;
        if (p.length >= 8) score++;
        if (/[A-Z]/.test(p)) score++;
        if (/[a-z]/.test(p)) score++;
        if (/\d/.test(p)) score++;
        if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/'~`]/.test(p)) score++;
        const pct = (score / 5) * 100;
        if (score <= 2) return { color: "red", label: "Weak", pct, score };
        if (score === 3 || score === 4) return { color: "goldenrod", label: "Medium", pct, score };
        if (score === 5) return { color: "green", label: "Strong", pct, score };
        return { color: "gray", label: "", pct, score };
    }

    return (
        <div className="modal-overlay">
            <div className="modal" role="dialog" aria-modal="true">
                <button className="close-btn" onClick={onClose} aria-label="Close">
                    &times;
                </button>

                <img src="/logo.png" alt="Logo" className="logo" />

                <div className="modal-body">
                    <h2>Email</h2>
                    <input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={onKeyDown}
                    />

                    <h2>Username</h2>
                    <input
                        type="text"
                        placeholder="Enter your username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={onKeyDown}
                    />

                    <h2>Password</h2>
                    <input
                        type="password"
                        placeholder="Enter your password (min 8 chars)"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={onKeyDown}
                    />

                    {pw && (
                        <div className="pw-strength-bar-wrapper" aria-label="Password strength">
                            <div
                                className="pw-strength-bar"
                                style={{
                                    background: getPasswordStrength(pw).color,
                                    width: `${getPasswordStrength(pw).pct}%`
                                }}
                            />
                        </div>
                    )}
                    {pw && (
                        <p className="pw-strength-label" style={{ color: getPasswordStrength(pw).color }}>
                            {getPasswordStrength(pw).label}
                        </p>
                    )}

                    <h2>Confirm Password</h2>
                    <input
                        type="password"
                        placeholder="Confirm your password"
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        onKeyDown={onKeyDown}
                    />

                    {!isValidEmail(email) && email !== "" && (
                        <p className="hint-warn" style={{ color: '#186C50' }}>Please enter a valid email.</p>
                    )}
                    {pw !== "" && pw.length < 8 && (
                        <p className="hint-warn" style={{ color: '#186C50' }}>Password should be at least 8 characters.</p>
                    )}
                    {pw2 !== "" && pw !== pw2 && (
                        <p className="hint-warn" style={{ color: '#186C50' }}>Passwords do not match.</p>
                    )}

                    {error && <p className="error-text">{error}</p>}

                    <div>
                        <ReCAPTCHA
                            sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
                            onChange={(token) => setRecaptchaToken(token)}
                            theme="light"
                        />
                    </div>

                    <button className="signin-btn" onClick={handleSignUp} disabled={!canSubmit}>
                        {busy ? "Creating…" : "Create Account"}
                    </button>

                    <div className="modal-footer" style={{ justifyContent: 'center' }}>
                        <button type="button" className="footer-btn" onClick={onBackToSignIn}>
                            Back to Sign In
                        </button>
                    </div>
                    <button className="google-btn" title="Sign in with Google" onClick={() => googleLogin()} disabled={busy}>
                        <img src="/google-signin.png" alt="Sign in with Google" />
                    </button>
                </div>
            </div>

            {showVerification && pendingEmail && (
                <EmailVerificationModal
                    email={pendingEmail}
                    onVerificationSuccess={() => {
                        // After verification, auto-login and close
                        login();
                        setShowVerification(false);
                        setPendingEmail(null);
                        onSignUpSuccess();
                    }}
                    onClose={() => {
                        setShowVerification(false);
                        setPendingEmail(null);
                    }}
                />
            )}

            {showLinkModal && linkingEmail && pendingGoogleToken && (
                <LinkAccountModal
                    email={linkingEmail}
                    onLink={async () => {
                        const payload: any = {
                            token: pendingGoogleToken,
                        };
                        if (locationData.latitude !== null) payload.latitude = locationData.latitude;
                        if (locationData.longitude !== null) payload.longitude = locationData.longitude;
                        if (locationData.location) payload.location = locationData.location;

                        const res = await fetch('/api/auth/google/merge', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify(payload),
                        });

                        if (!res.ok) {
                            let msg = 'Failed to link account';
                            try {
                                const data = await res.json();
                                msg = data.detail || data.message || msg;
                            } catch {
                                try { msg = await res.text() } catch { }
                            }
                            throw new Error(msg);
                        }

                        // Success - proceed with login
                        login();
                        setShowLinkModal(false);
                        setPendingGoogleToken(null);
                        setLinkingEmail(null);
                        onSignUpSuccess();
                    }}
                    onCancel={() => {
                        setShowLinkModal(false);
                        setPendingGoogleToken(null);
                        setLinkingEmail(null);
                    }}
                />
            )}
        </div>
    );
}