"use client";
import React, { useState, useRef, useEffect } from "react";
import './SignInModal.css';

type SignInModalProps = {
    onClose: () => void;
    onSignInSuccess: () => void;
};

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Sign in failed'; }
};

export default function SignInModal({ onClose, onSignInSuccess }: SignInModalProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rememberMe, setRememberMe] = useState(false);

    const isValidEmail = (s: string) => /\S+@\S+\.\S+/.test(s.trim());

    async function handleSignIn() {
        setError(null);
        if (!isValidEmail(email) || !password) {
            setError('Please enter a valid email and password');
            return;
        }
        setBusy(true);
        try {
            const payload = { email: email.trim(), password, rememberMe };
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
            const data = await res.json().catch(() => ({}));
            if (data.token) {
                if (rememberMe) localStorage.setItem('authToken', data.token);
                else sessionStorage.setItem('authToken', data.token);
            }
            onSignInSuccess();
            onClose();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally { setBusy(false); }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !busy) void handleSignIn();
    }

    return (
        <div className="modal-overlay">
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

                    <button className="signin-btn" onClick={handleSignIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>

                    <div className="modal-footer">
                        <button type="button" className="footer-btn">Forgot password?</button>
                        <button type="button" className="footer-btn">Not registered?</button>
                    </div>

                    <button className="google-btn" title="Sign in with Google" disabled={busy} />
                </div>
            </div>
        </div>
    );
}
