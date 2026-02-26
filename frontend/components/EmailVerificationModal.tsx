"use client";
import React, { useState, useEffect } from "react";
import './SignInModal.css';

type EmailVerificationModalProps = {
    email: string;
    onVerificationSuccess: () => void;
    onClose: () => void;
};

export default function EmailVerificationModal({
    email,
    onVerificationSuccess,
    onClose
}: EmailVerificationModalProps) {
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Cooldown timer for resend button
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (resendCooldown > 0) {
            timer = setInterval(() => {
                setResendCooldown(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [resendCooldown]);

    async function handleVerify() {
        setError(null);
        if (!code.trim()) {
            setError("Please enter the verification code");
            return;
        }

        if (code.length !== 6) {
            setError("Code must be 6 digits");
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/verify-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    email: email.trim(),
                    code: code.trim(),
                }),
            });

            if (!res.ok) {
                let msg = 'Verification failed';
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch {
                    try { msg = await res.text() } catch { }
                }
                throw new Error(msg);
            }

            setCode("");
            onVerificationSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification failed');
            setIsLoading(false);
        }
    }

    async function handleResend() {
        setError(null);
        setResendSuccess(false);
        setResendLoading(true);

        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                }),
            });

            if (!res.ok) {
                let msg = 'Failed to resend code';
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch {
                    try { msg = await res.text() } catch { }
                }
                throw new Error(msg);
            }

            setResendSuccess(true);
            setResendCooldown(60); // 60 second cooldown
            setTimeout(() => setResendSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to resend code');
        } finally {
            setResendLoading(false);
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !isLoading && code.length === 6) {
            void handleVerify();
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal" role="dialog" aria-modal="true">
                <button
                    className="close-btn"
                    onClick={onClose}
                    disabled={isLoading}
                    aria-label="Close"
                >
                    &times;
                </button>

                <img src="/logo.png" alt="Logo" className="logo" />

                <div className="modal-body">
                    <h2>Verify Your Email</h2>

                    <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '20px', lineHeight: '1.5' }}>
                        We sent a verification code to <strong>{email}</strong>
                    </p>

                    <input
                        type="text"
                        placeholder="Enter 6-digit code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.slice(0, 6))}
                        onKeyDown={onKeyDown}
                        disabled={isLoading}
                        maxLength={6}
                        style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '1.2rem' }}
                    />

                    {error && <p className="error-text">{error}</p>}
                    {resendSuccess && (
                        <p style={{ color: '#4CAF50', fontSize: '0.9rem', textAlign: 'center', marginTop: '8px' }}>
                            Code sent! Check your email.
                        </p>
                    )}

                    <button
                        className="signin-btn"
                        onClick={handleVerify}
                        disabled={isLoading || code.length !== 6}
                        style={{ width: '100%' }}
                    >
                        {isLoading ? 'Verifying…' : 'Verify Email'}
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '16px' }}>
                        <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: '8px' }}>
                            Didn't receive the code?
                        </p>
                        <button
                            type="button"
                            className="footer-btn"
                            onClick={handleResend}
                            disabled={resendLoading || resendCooldown > 0}
                            style={{
                                padding: '8px 16px',
                                fontSize: '0.9rem',
                                opacity: resendLoading || resendCooldown > 0 ? 0.5 : 1,
                                cursor: resendLoading || resendCooldown > 0 ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
