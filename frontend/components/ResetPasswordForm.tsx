"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import "./ResetPasswordForm.css";

type ResetPasswordFormProps = {
    prefillEmail?: string | null;
    prefillCode?: string | null;
};

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Request failed'; }
};

export default function ResetPasswordForm({ prefillEmail, prefillCode }: ResetPasswordFormProps) {
    const router = useRouter();
    const [step, setStep] = useState<"verify" | "reset">(prefillCode ? "reset" : "verify");
    const [email, setEmail] = useState(prefillEmail || '');
    const [code, setCode] = useState(prefillCode || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const isValidEmail = (s: string) => /\S+@\S+\.\S+/.test(s.trim());

    async function handleVerifyCode() {
        setError(null);
        if (!isValidEmail(email) || code.length !== 6) {
            setError('Please enter a valid email and 6-digit code');
            return;
        }
        setBusy(true);
        try {
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
            setStep("reset");
        } catch (err) {
            setError(getErrorMessage(err));
        } finally { setBusy(false); }
    }

    async function handleResetPassword() {
        setError(null);
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setBusy(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                    code,
                    new_password: newPassword
                }),
            });
            if (!res.ok) {
                let msg = 'Password reset failed';
                try { const data = await res.json(); msg = data.detail || msg; } catch { }
                throw new Error(msg);
            }
            setSuccess(true);
            setTimeout(() => {
                router.push('/');
            }, 2000);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally { setBusy(false); }
    }

    function getPasswordStrength(p: string) {
        let score = 0;
        if (p.length >= 8) score++;
        if (/[A-Z]/.test(p)) score++;
        if (/[a-z]/.test(p)) score++;
        if (/\d/.test(p)) score++;
        if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/'~`]/.test(p)) score++;
        const pct = (score / 5) * 100;
        if (score <= 2) return { color: "red", label: "Weak", pct };
        if (score === 3 || score === 4) return { color: "goldenrod", label: "Medium", pct };
        if (score === 5) return { color: "green", label: "Strong", pct };
        return { color: "gray", label: "", pct };
    }

    return (
        <div className="reset-password-container">
            <div className="reset-password-card">
                <img src="/logo.png" alt="Logo" className="reset-logo" />
                <h1 className="reset-title">Reset Your Password</h1>

                {step === "verify" ? (
                    <>
                        <p className="reset-subtitle">Enter your email and the 6-digit code from your email</p>

                        <div className="reset-form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={busy}
                            />
                        </div>

                        <div className="reset-form-group">
                            <label>Verification Code</label>
                            <input
                                type="text"
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.slice(0, 6))}
                                maxLength={6}
                                disabled={busy}
                                style={{ letterSpacing: '2px', fontSize: '18px' }}
                            />
                        </div>

                        {error && <p className="reset-error">{error}</p>}

                        <button
                            className="reset-btn"
                            onClick={handleVerifyCode}
                            disabled={busy || !isValidEmail(email) || code.length !== 6}
                        >
                            {busy ? 'Verifying…' : 'Verify Code'}
                        </button>

                        <p className="reset-footer-link">
                            <a href="/">Back to Home</a>
                        </p>
                    </>
                ) : (
                    <>
                        <p className="reset-subtitle">Create a new password for your account</p>

                        <div className="reset-form-group">
                            <label>New Password</label>
                            <input
                                type="password"
                                placeholder="Enter new password (min 8 chars)"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={busy}
                            />
                            {newPassword && (
                                <div className="reset-password-strength">
                                    <div className="strength-bar-wrapper">
                                        <div
                                            className="strength-bar"
                                            style={{
                                                background: getPasswordStrength(newPassword).color,
                                                width: `${getPasswordStrength(newPassword).pct}%`
                                            }}
                                        />
                                    </div>
                                    <p style={{ color: getPasswordStrength(newPassword).color, fontSize: '12px', margin: '4px 0 0 0' }}>
                                        {getPasswordStrength(newPassword).label}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="reset-form-group">
                            <label>Confirm Password</label>
                            <input
                                type="password"
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={busy}
                            />
                        </div>

                        {newPassword !== "" && newPassword.length < 8 && (
                            <p className="hint-warn" style={{ color: '#186C50' }}>Password should be at least 8 characters.</p>
                        )}
                        {confirmPassword !== "" && newPassword !== confirmPassword && (
                            <p className="hint-warn" style={{ color: '#186C50' }}>Passwords do not match.</p>
                        )}

                        {error && <p className="reset-error">{error}</p>}

                        <button
                            className="reset-btn"
                            onClick={handleResetPassword}
                            disabled={busy || newPassword.length < 8 || newPassword !== confirmPassword}
                        >
                            {busy ? 'Resetting…' : 'Reset Password'}
                        </button>

                        {success && (
                            <div className="reset-success">
                                ✓ Password reset successful! Redirecting...
                            </div>
                        )}

                        <p className="reset-footer-link">
                            <a href="/">Back to Home</a>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
