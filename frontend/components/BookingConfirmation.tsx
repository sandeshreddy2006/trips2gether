'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './BookingConfirmation.css';

interface Passenger {
    given_name: string;
    family_name: string;
    email: string;
    phone_number: string;
    born_at: string;
    gender: string;
    title: string;
}

interface Segment {
    departing_at: string | null;
    arriving_at: string | null;
    origin: { iata_code: string } | null;
    destination: { iata_code: string } | null;
    operating_carrier: { iata_code: string; name?: string } | null;
    aircraft: { iata_code: string } | null;
}

interface Slice {
    origin: { iata_code: string } | null;
    destination: { iata_code: string } | null;
    duration: string | null;
    segments: Segment[];
}

interface BookingDetails {
    id: string;
    booking_reference: string;
    passengers: Passenger[];
    slices: Slice[];
    total_amount: string;
    currency: string;
    payment_status: string;
    created_at: string;
}

interface BookingConfirmationProps {
    orderId: string;
    bookingReference: string;
    totalAmount?: string;
    currency?: string;
    remainingBalance?: number;
    onBack?: () => void;
}

export default function BookingConfirmation({
    orderId,
    bookingReference,
    totalAmount,
    currency = 'USD',
    remainingBalance,
    onBack,
}: BookingConfirmationProps) {
    const router = useRouter();
    const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBookingStatus = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch(`/api/bookings/${orderId}/status`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Booking not found');
                    } else if (response.status === 502) {
                        throw new Error('Booking service temporarily unavailable');
                    } else {
                        throw new Error('Failed to fetch booking details');
                    }
                }

                const data = await response.json();
                setBookingDetails(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchBookingStatus();
    }, [orderId]);

    if (loading) {
        return (
            <div className="booking-confirmation">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading booking details...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="booking-confirmation">
                <div className="error-state">
                    <div className="error-icon">⚠️</div>
                    <h2>Booking Details Unavailable</h2>
                    <p>{error}</p>
                    <div className="error-actions">
                        <button className="btn btn-secondary" onClick={onBack || (() => router.back())}>
                            Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const formatDuration = (iso: string | null) => {
        if (!iso) return 'N/A';
        const match = iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
        if (!match) return iso;
        const days = parseInt(match[1] || '0');
        const hours = parseInt(match[2] || '0');
        const mins = parseInt(match[3] || '0');
        const parts = [];
        if (days) parts.push(`${days}d`);
        if (hours) parts.push(`${hours}h`);
        if (mins) parts.push(`${mins}m`);
        return parts.join(' ') || 'N/A';
    };

    return (
        <div className="booking-confirmation">
            <div className="confirmation-header">
                <div className="success-badge">
                    <div className="checkmark">✓</div>
                </div>
                <h1>Booking Confirmed</h1>
                <p className="confirmation-subtitle">Your flight booking has been successfully created</p>
            </div>

            <div className="confirmation-content">
                {/* Booking Reference Card */}
                <div className="reference-card">
                    <div className="reference-item">
                        <label>Booking Reference</label>
                        <div className="reference-value">{bookingReference}</div>
                    </div>
                    <div className="reference-item">
                        <label>Order ID</label>
                        <div className="reference-value font-mono">{orderId}</div>
                    </div>
                    <div className="reference-item">
                        <label>Status</label>
                        <div className={`status-badge status-${bookingDetails?.payment_status?.toLowerCase() || 'pending'}`}>
                            {bookingDetails?.payment_status || 'Pending'}
                        </div>
                    </div>
                </div>

                {/* Passengers Section */}
                {bookingDetails?.passengers && bookingDetails.passengers.length > 0 && (
                    <div className="passengers-section">
                        <h2>Passengers ({bookingDetails.passengers.length})</h2>
                        <div className="passengers-list">
                            {bookingDetails.passengers.map((passenger, idx) => (
                                <div key={idx} className="passenger-item">
                                    <div className="passenger-number">{idx + 1}</div>
                                    <div className="passenger-info">
                                        <div className="passenger-name">
                                            {passenger.title} {passenger.given_name} {passenger.family_name}
                                        </div>
                                        <div className="passenger-contact">
                                            <span>{passenger.email}</span>
                                            <span className="separator">•</span>
                                            <span>{passenger.phone_number}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Flight Segments Section */}
                {bookingDetails?.slices && bookingDetails.slices.length > 0 && (
                    <div className="slices-section">
                        <h2>Flight Itinerary</h2>
                        <div className="slices-list">
                            {bookingDetails.slices.map((slice, idx) => {
                                const firstSeg = slice.segments?.[0];
                                const lastSeg = slice.segments?.[slice.segments.length - 1];
                                return (
                                    <div key={idx} className="slice-card">
                                        <div className="slice-header">
                                            <span className="segment-title">
                                                {slice.origin?.iata_code ?? 'N/A'} → {slice.destination?.iata_code ?? 'N/A'}
                                            </span>
                                            <span className="duration">{formatDuration(slice.duration)}</span>
                                        </div>
                                        <div className="slice-times">
                                            <div className="time-group">
                                                <label>Departure</label>
                                                <div className="time">
                                                    {firstSeg?.departing_at ? new Date(firstSeg.departing_at).toLocaleString() : 'N/A'}
                                                </div>
                                            </div>
                                            <div className="time-group">
                                                <label>Arrival</label>
                                                <div className="time">
                                                    {lastSeg?.arriving_at ? new Date(lastSeg.arriving_at).toLocaleString() : 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                        {slice.segments && slice.segments.length > 0 && (
                                            <div className="slice-airlines">
                                                <label>Airlines</label>
                                                <div className="airlines-list">
                                                    {slice.segments.map((seg, segIdx) => (
                                                        <span key={segIdx} className="airline-badge">
                                                            {seg.operating_carrier?.iata_code ?? 'N/A'} •{' '}
                                                            {seg.aircraft?.iata_code ?? 'Unknown'}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Price Summary */}
                {(bookingDetails?.total_amount || totalAmount) && (
                    <div className="price-summary">
                        <div className="summary-row">
                            <span className="summary-label">Total Amount</span>
                            <span className="summary-price">
                                {bookingDetails?.currency || currency} {bookingDetails?.total_amount || totalAmount}
                            </span>
                        </div>
                        {remainingBalance !== undefined && (
                            <div className="summary-row wallet-deduction">
                                <span className="summary-label">Wallet Balance Remaining</span>
                                <span className="summary-price wallet-remaining">
                                    USD {remainingBalance.toFixed(2)}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="confirmation-actions">
                <button className="btn btn-secondary" onClick={onBack || (() => router.back())}>
                    Back
                </button>
            </div>
        </div>
    );
}
