"use client";
import React from "react";
import { useAuth } from "../app/AuthContext";
import "./dashboard.css";
import Dashboard from "./dashboard";

export default function Homepage() {
    const { isAuthenticated } = useAuth();

    return (
        <>
            {isAuthenticated ? (
                <Dashboard />
            ) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
                    <h2>Welcome to Trips2gether</h2>
                    <p>Sign in or register to start planning your next adventure with friends!</p>
                </div>
            )}
        </>
    );
}