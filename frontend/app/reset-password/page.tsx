"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import ResetPasswordForm from "../../components/ResetPasswordForm";
import "../globals.css";

export default function ResetPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { logout, isAuthenticated } = useAuth();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [linkStatus, setLinkStatus] = useState<"checking" | "valid" | "expired">("checking");

    const email = searchParams.get("email");
    const code = searchParams.get("code");

    useEffect(() => {
        // If user is logged in, log them out
        if (isAuthenticated && !isLoggingOut) {
            setIsLoggingOut(true);
            logout();
        }
    }, [isAuthenticated, logout, isLoggingOut]);

    // Check if code is expired/used when page loads
    useEffect(() => {
        if (!isLoggingOut && !isAuthenticated && email && code) {
            checkLinkValidity();
        }
    }, [isLoggingOut, isAuthenticated, email, code]);

    async function checkLinkValidity() {
        try {
            const res = await fetch('/api/auth/verify-reset-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email?.trim(), code }),
            });
            if (res.ok) {
                setLinkStatus("valid");
            } else {
                setLinkStatus("expired");
            }
        } catch (err) {
            setLinkStatus("expired");
        }
    }

    async function handleRequestNewLink() {
        if (!email) return;
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            if (res.ok) {
                setLinkStatus("checking");
                setTimeout(() => {
                    router.push('/');
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to request new link:', err);
        }
    }

    // Show loading while logging out
    if (isLoggingOut || isAuthenticated || linkStatus === "checking") {
        return (
            <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh",
                fontSize: "18px",
                color: "#2E6B55"
            }}>
                {linkStatus === "checking" && "Checking reset link..."}
                {(isLoggingOut || isAuthenticated) && "Preparing password reset..."}
            </div>
        );
    }

    // Show expired message
    if (linkStatus === "expired") {
        return (
            <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "100vh",
                paddingTop: "40px",
                paddingBottom: "40px"
            }}>
                <div style={{
                    maxWidth: "500px",
                    textAlign: "center",
                    background: "white",
                    padding: "40px",
                    borderRadius: "12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
                }}>
                    <h2 style={{ color: "#dc2626", marginBottom: "16px" }}>Link Expired</h2>
                    <p style={{ color: "#555", marginBottom: "24px", fontSize: "15px" }}>
                        This password reset link has expired or been used. Please request a new one below.
                    </p>
                    <button
                        onClick={handleRequestNewLink}
                        style={{
                            background: "linear-gradient(135deg, #0E3F2E 0%, #186C50 100%)",
                            color: "white",
                            padding: "12px 24px",
                            borderRadius: "8px",
                            border: "none",
                            fontSize: "16px",
                            fontWeight: "600",
                            cursor: "pointer",
                            boxShadow: "0 4px 12px rgba(14, 63, 46, 0.3)"
                        }}
                    >
                        Request New Reset Link
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            paddingTop: "40px",
            paddingBottom: "40px"
        }}>
            <ResetPasswordForm prefillEmail={email} prefillCode={code} />
        </div>
    );
}
