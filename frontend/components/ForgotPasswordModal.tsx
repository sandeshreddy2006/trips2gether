"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import './SignInModal.css';

type ForgotPasswordModalProps = {
    onClose: () => void;
    onBackToSignIn: () => void;
};

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Request failed'; }
};

export default function ForgotPasswordModal({ onClose, onBackToSignIn }: ForgotPasswordModalProps) {
    const router = useRouter();
    const [step, setStep] = useState<"email" | "code">("email");
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isValidEmail = (s: string) => /\S+@\S+\.\S+/.test(s.trim());

    async function handleEmailSubmit() {
        setError(null);
        if (!isValidEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }
        setBusy(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            if (!res.ok) {
                let msg = 'Failed to send reset email';
                try { const data = await res.json(); msg = data.detail || msg; } catch { }
                throw new Error(msg);
            }
            setStep("code");
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function handleCodeSubmit() {
        setError(null);
        if (code.length !== 6) {
            setError('Please enter the 6-digit code');
            return;
        }
        setBusy(true);
        try {
            // Verify the code first
            const res = await fetch('/api/auth/verify-reset-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), code }),
            });
            if (!res.ok) {
                let msg = 'Verification failed';
                try { const data = await res.json(); msg = data.detail || msg; } catch { }
                throw new Error(msg);
            }
            // Code verified - navigate to reset password page
            onClose();
            router.push(`/reset-password?email=${encodeURIComponent(email)}&code=${code}`);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !busy) {
            if (step === "email" && isValidEmail(email)) {
                handleEmailSubmit();
            } else if (step === "code" && code.length === 6) {
                handleCodeSubmit();
            }
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal" role="dialog" aria-modal="true">
                <button className="close-btn" onClick={onClose} aria-label="Close">&times;</button>

                <img src="/logo.png" alt="Logo" className="logo" />

                <div className="modal-body">
                    {step === "email" ? (
                        <>
                            <h2>Reset Your Password</h2>
                            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '16px' }}>
                                Enter your email address and we'll send you a link to reset your password.
                            </p>

                            <h2>Email</h2>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={onKeyDown}
                                disabled={busy}
                            />

                            {error && <p className="error-text">{error}</p>}

                            <button
                                className="signin-btn"
                                onClick={handleEmailSubmit}
                                disabled={busy || !isValidEmail(email)}
                                style={{ marginTop: '16px' }}
                            >
                                {busy ? 'Sending…' : 'Send Reset Link'}
                            </button>

                            <div className="modal-footer" style={{ justifyContent: 'center', marginTop: '16px' }}>
                                <button type="button" className="footer-btn" onClick={onBackToSignIn}>
                                    Back to Sign In
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h2>Enter Verification Code</h2>
                            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '16px' }}>
                                We sent a 6-digit code to <strong>{email}</strong>. Enter it below to continue.
                            </p>

                            <h2>Verification Code</h2>
                            <input
                                type="text"
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.slice(0, 6))}
                                onKeyDown={onKeyDown}
                                disabled={busy}
                                maxLength={6}
                                style={{ letterSpacing: '2px', fontSize: '18px' }}
                            />

                            {error && <p className="error-text">{error}</p>}

                            <button
                                className="signin-btn"
                                onClick={handleCodeSubmit}
                                disabled={busy || code.length !== 6}
                                style={{ marginTop: '16px' }}
                            >
                                {busy ? 'Verifying…' : 'Continue'}
                            </button>

                            <div className="modal-footer" style={{ justifyContent: 'center', marginTop: '16px' }}>
                                <button type="button" className="footer-btn" onClick={() => setStep("email")}>
                                    Back
                                </button>
                            </div>

                            <p style={{ color: '#999', fontSize: '0.8rem', textAlign: 'center', marginTop: '12px' }}>
                                Didn't receive the code? Check your spam folder or request a new one.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
