"use client";
import React, { useState } from "react";
import { useAuth } from "../app/AuthContext";
import { useGoogleLogin } from "@react-oauth/google";
import ReCAPTCHA from "react-google-recaptcha";
import ForgotPasswordModal from "./ForgotPasswordModal";
import LinkAccountModal from "./LinkAccountModal";
import FaceVerificationLogin from "./FaceVerificationLogin";
import './SignInModal.css';

type SignInModalProps = {
    onClose: () => void;
    onSignInSuccess: () => void;
    onOpenSignUp?: () => void;
    isSignUpOpen?: boolean;
};

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Sign in failed'; }
};

export default function SignInModal({ onClose, onSignInSuccess, onOpenSignUp, isSignUpOpen }: SignInModalProps) {
    const { login, locationData } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rememberMe, setRememberMe] = useState(false);
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [showFaceVerification, setShowFaceVerification] = useState(false);
    const [passwordVerified, setPasswordVerified] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);
    const [linkingEmail, setLinkingEmail] = useState<string | null>(null);

    const isValidEmail = (s: string) => /\S+@\S+\.\S+/.test(s.trim());

    async function handleSignIn() {
        setError(null);
        if (!isValidEmail(email) || !password) {
            setError('Please enter a valid email and password');
            return;
        }
        if (!recaptchaToken) {
            setError('Please complete the reCAPTCHA verification');
            return;
        }
        setBusy(true);
        try {
            const payload = {
                email: email.trim(),
                password,
                rememberMe,
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                location: locationData.location,
                recaptchaToken,
            };
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                let msg = 'Sign in failed';
                try { const data = await res.json(); msg = data.detail || data.message || msg; } catch { try { msg = await res.text() } catch { } }
                throw new Error(msg);
            }

            // Password verified - now check if face verification is required
            setPasswordVerified(true);

            // Check if user has face verification enabled
            try {
                const checkRes = await fetch(`/api/face-verification/check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim() }),
                });
                const checkData = await checkRes.json();

                if (checkData.face_verification_enabled) {
                    // Show face verification modal
                    setShowFaceVerification(true);
                    setBusy(false);
                } else {
                    // No face verification needed, proceed with login
                    login();
                    onSignInSuccess();
                    onClose();
                }
            } catch (err) {
                // If check fails, proceed without face verification
                console.error('Face verification check failed:', err);
                login();
                onSignInSuccess();
                onClose();
            }
        } catch (err) {
            setError(getErrorMessage(err));
            setBusy(false);
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !busy) void handleSignIn();
    }

    // Google login handler
    const googleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setBusy(true);
            setError(null);
            try {
                const payload: any = {
                    token: tokenResponse.access_token,
                    rememberMe,
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
                    let msg = 'Google sign-in failed';
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
                    // Show linking modal instead of logging in
                    setPendingGoogleToken(tokenResponse.access_token);
                    setLinkingEmail(data.email);
                    setShowLinkModal(true);
                    setBusy(false);
                } else if (data.ok) {
                    // Account linked or new account, proceed with login
                    login();
                    onSignInSuccess();
                    onClose();
                } else {
                    throw new Error('Sign in failed');
                }
            } catch (err) {
                setError(getErrorMessage(err));
                setBusy(false);
            }
        },
        onError: () => {
            setError('Google sign-in failed');
        },
    });

    return (
        <>
            <div className="modal-overlay" style={{ display: showFaceVerification || isSignUpOpen ? 'none' : 'flex' }}>
                <div className="modal" role="dialog" aria-modal="true">
                    <button className="close-btn" onClick={onClose} aria-label="Close">&times;</button>

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

                        <h2>Password</h2>
                        <input
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={onKeyDown}
                        />

                        <div className="remember-me-container">
                            <input id="rememberMe" className="remember-me-checkbox" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} />
                            <label htmlFor="rememberMe" className="remember-me-label">Remember Me</label>
                        </div>

                        {error && <p className="error-text">{error}</p>}

                        <div>
                            <ReCAPTCHA
                                sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
                                onChange={(token) => setRecaptchaToken(token)}
                                theme="light"
                            />
                        </div>

                        <button className="signin-btn" onClick={handleSignIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>

                        <div className="modal-footer">
                            <button type="button" className="footer-btn" onClick={() => setShowForgotPassword(true)}>Forgot password?</button>
                            <button type="button" className="footer-btn" onClick={onOpenSignUp}>Not registered?</button>
                        </div>

                        <button className="google-btn" title="Sign in with Google" onClick={() => googleLogin()} disabled={busy}>
                            <img src="/google-signin.png" alt="Sign in with Google" />
                        </button>
                    </div>
                </div>
                {showForgotPassword && (
                    <ForgotPasswordModal
                        onClose={() => {
                            setShowForgotPassword(false);
                            onClose();
                        }}
                        onBackToSignIn={() => setShowForgotPassword(false)}
                    />
                )}
            </div>

            {showFaceVerification && (
                <FaceVerificationLogin
                    onSuccess={() => {
                        login();
                        onSignInSuccess();
                        onClose();
                    }}
                    onSkip={() => {
                        login();
                        onSignInSuccess();
                        onClose();
                    }}
                />
            )}

            {showLinkModal && linkingEmail && pendingGoogleToken && (
                <LinkAccountModal
                    email={linkingEmail}
                    onLink={async () => {
                        const payload: any = {
                            token: pendingGoogleToken,
                            rememberMe,
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
                        onSignInSuccess();
                        onClose();
                    }}
                    onCancel={() => {
                        setShowLinkModal(false);
                        setPendingGoogleToken(null);
                        setLinkingEmail(null);
                    }}
                />
            )}
        </>
    );
}
