"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../AuthContext";
import "./history.css";

type Booking = {
    id: number;
    order_id: string;
    booking_reference: string;
    total_amount: string;
    currency: string;
    payment_status: string;
    offer_id?: string | null;
    created_at: string;
    updated_at: string;
};

export default function BookingHistoryPage() {
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();

    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isLoading || !isAuthenticated) return;

        const loadBookings = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch("/api/bookings", {
                    method: "GET",
                    credentials: "include",
                });

                if (!response.ok) {
                    throw new Error("Unable to load previous bookings right now.");
                }

                const data = await response.json();
                setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to load previous bookings right now.");
            } finally {
                setLoading(false);
            }
        };

        loadBookings();
    }, [isAuthenticated, isLoading]);

    if (isLoading) {
        return <div className="booking-history-page"><p className="history-message">Checking your session...</p></div>;
    }

    if (!isAuthenticated) {
        return <div className="booking-history-page"><p className="history-message">Please log in to view previous bookings.</p></div>;
    }

    return (
        <div className="booking-history-page">
            <div className="booking-history-wrap">
                <div className="history-header">
                    <h1>Previous Bookings</h1>
                    <button className="history-book-btn" onClick={() => router.push("/bookings")}>Book New Flight</button>
                </div>

                {loading ? (
                    <p className="history-message">Loading your bookings...</p>
                ) : error ? (
                    <p className="history-message history-error">{error}</p>
                ) : bookings.length === 0 ? (
                    <p className="history-message">No bookings yet.</p>
                ) : (
                    <div className="history-list">
                        {bookings.map((booking) => (
                            <article key={booking.id} className="history-card">
                                <div>
                                    <p className="history-label">Booking Reference</p>
                                    <p className="history-value">{booking.booking_reference}</p>
                                </div>
                                <div>
                                    <p className="history-label">Order ID</p>
                                    <p className="history-mono">{booking.order_id}</p>
                                </div>
                                <div>
                                    <p className="history-label">Amount</p>
                                    <p className="history-value">{booking.currency} {booking.total_amount}</p>
                                </div>
                                <div>
                                    <p className="history-label">Status</p>
                                    <p className="history-status">{booking.payment_status}</p>
                                </div>
                                <div>
                                    <p className="history-label">Booked On</p>
                                    <p className="history-value">{new Date(booking.created_at).toLocaleString()}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
