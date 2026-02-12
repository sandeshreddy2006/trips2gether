"use client";
import React, { useEffect, useState } from "react";
import "./SignInModal.css";

type SignUpModalProps = {
    onClose: () => void;
    onBackToSignIn: () => void;
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

export default function SignUpModal({ onClose, onBackToSignIn }: SignUpModalProps) {
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const isValidEmail = (s: string) => /\S+@\S+\.\S+/.test(s.trim());
    const canSubmit =
        !busy &&
        isValidEmail(email) &&
        username.trim().length > 0 &&
        pw.length >= 6 &&
        pw === pw2;

    useEffect(() => {
        if (!success) return;
        const t = setTimeout(() => onBackToSignIn(), 1200);
        return () => clearTimeout(t);
    }, [success, onBackToSignIn]);

    async function handleSignUp(): Promise<void> {
        setError(null);
        if (!canSubmit) {
            if (!isValidEmail(email)) return setError("Please enter a valid email.");
            if (!username.trim()) return setError("Please enter a username.");
            if (pw.length < 6) return setError("Password should be at least 6 characters.");
            if (pw !== pw2) return setError("Passwords do not match.");
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

            setSuccess(true);
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
        if (score <= 2) return { color: "red", label: "Weak" };
        if (score === 3 || score === 4) return { color: "goldenrod", label: "Medium" };
        if (score === 5) return { color: "green", label: "Strong" };
        return { color: "gray", label: "" };
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
                        placeholder="Enter your password (min 6 chars)"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={onKeyDown}
                    />

                    {pw && (
                        <div className="pw-strength-bar-wrapper" aria-label="Password strength">
                            <div
                                className="pw-strength-bar"
                                style={{ background: getPasswordStrength(pw).color }}
                            />
                        </div>
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
                        <p className="hint-warn">Please enter a valid email.</p>
                    )}
                    {pw !== "" && pw.length < 6 && (
                        <p className="hint-warn">Password should be at least 6 characters.</p>
                    )}
                    {pw2 !== "" && pw !== pw2 && (
                        <p className="hint-warn">Passwords do not match.</p>
                    )}

                    {error && <p className="error-text">{error}</p>}

                    <button className="signin-btn" onClick={handleSignUp} disabled={!canSubmit}>
                        {busy ? "Creating…" : "Create Account"}
                    </button>

                    <div className="modal-footer">
                        <button type="button" className="footer-btn" onClick={onBackToSignIn}>
                            Back to Sign In
                        </button>
                    </div>
                </div>

                {success && (
                    <div
                        className="toast success"
                        role="alert"
                        aria-live="assertive"
                        style={{ color: "#082D57" }}
                    >
                        🎉 Account created! Please sign in.
                    </div>
                )}
            </div>
        </div>
    );
}