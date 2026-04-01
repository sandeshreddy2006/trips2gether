'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BookingForm from './BookingForm';
import BookingConfirmation from './BookingConfirmation';
import './BookingPage.css';

interface PassengerData {
    given_name: string;
    family_name: string;
    email: string;
    phone_number: string;
    born_at: string;
    gender: string;
    title: string;
}

interface BookingCreateResponse {
    order_id: string;
    booking_reference: string;
    total_amount: string;
    currency: string;
    remaining_balance: number;
}

type BookingStep = 'form' | 'confirmation';

export default function BookingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const offerId = searchParams.get('offer_id') || '';
    const numberOfPassengers = parseInt(searchParams.get('passengers') || '1');
    const totalAmount = searchParams.get('amount') || '0';
    const currency = searchParams.get('currency') || 'USD';

    const [currentStep, setCurrentStep] = useState<BookingStep>('form');
    const [bookingData, setBookingData] = useState<BookingCreateResponse | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);

    const deductionAmount = Number(totalAmount) || 0;
    const projectedBalance = walletBalance !== null ? walletBalance - deductionAmount : null;

    useEffect(() => {
        const loadWalletBalance = async () => {
            try {
                const response = await fetch('/api/profile/get', {
                    method: 'GET',
                    credentials: 'include',
                });
                if (!response.ok) return;

                const data = await response.json();
                const balance = Number(data?.wallet_balance);
                if (Number.isFinite(balance)) {
                    setWalletBalance(balance);
                }
            } catch {
                // Keep fallback UI values when profile fetch fails.
            }
        };

        void loadWalletBalance();
    }, []);

    const handleFormSubmit = async (passengers: PassengerData[]) => {
        try {
            setIsSubmitting(true);
            setError(null);

            // Normalise born_at to YYYY-MM-DD in case the browser returns another format
            const normalisedPassengers = passengers.map((p) => ({
                ...p,
                born_at: p.born_at.includes('/')
                    ? p.born_at.split('/').reverse().join('-') // MM/DD/YYYY → YYYY-DD-MM fallback
                    : p.born_at,
            }));

            const payload = {
                offer_id: offerId,
                passengers: normalisedPassengers,
                payment_type: 'balance',
                total_amount: totalAmount,
                currency: currency,
            };

            const response = await fetch('/api/bookings/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                let errorMessage = 'Failed to create booking';

                if (response.status === 400) {
                    errorMessage = errorData.detail || 'Invalid booking data';
                } else if (response.status === 402) {
                    errorMessage = errorData.detail || 'Insufficient wallet balance. Please top up and try again.';
                } else if (response.status === 401) {
                    errorMessage = 'Please log in to continue';
                    // Redirect to login
                    router.push('/login');
                    return;
                } else if (response.status === 404) {
                    errorMessage = 'Offer not found';
                } else if (response.status === 504) {
                    errorMessage = 'Request timeout. Please try again.';
                } else if (response.status === 502) {
                    errorMessage = 'Booking service is temporarily unavailable';
                }

                throw new Error(errorMessage);
            }

            const data: BookingCreateResponse = await response.json();
            setBookingData(data);
            setCurrentStep('confirmation');

            // Store order ID in sessionStorage for session persistence
            sessionStorage.setItem('currentOrderId', data.order_id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBack = () => {
        if (currentStep === 'confirmation') {
            setCurrentStep('form');
            setBookingData(null);
            setError(null);
        } else {
            router.back();
        }
    };

    return (
        <div className="booking-page">
            <div className="booking-container">
                {/* Progress Indicator */}
                <div className="progress-indicator">
                    <div className={`progress-step active`}>
                        <div className="step-number">1</div>
                        <div className="step-label">Passenger Info</div>
                    </div>
                    <div className={`progress-line ${currentStep === 'confirmation' ? 'complete' : ''}`}></div>
                    <div className={`progress-step ${currentStep === 'confirmation' ? 'active' : ''}`}>
                        <div className="step-number">2</div>
                        <div className="step-label">Confirmed</div>
                    </div>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="alert alert-error">
                        <div className="alert-icon">⚠️</div>
                        <div className="alert-content">
                            <h3>Error</h3>
                            <p>{error}</p>
                        </div>
                        <button
                            className="alert-close"
                            onClick={() => setError(null)}
                            aria-label="Close alert"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Step Content */}
                <div className="step-content">
                    {currentStep === 'form' && (
                        <>
                            <div className={`wallet-preview ${projectedBalance !== null && projectedBalance < 0 ? 'wallet-preview-warning' : ''}`}>
                                <div className="wallet-preview-row">
                                    <span>Current Balance</span>
                                    <strong>USD {walletBalance !== null ? walletBalance.toFixed(2) : '--'}</strong>
                                </div>
                                <div className="wallet-preview-row">
                                    <span>Amount To Be Deducted</span>
                                    <strong>USD {deductionAmount.toFixed(2)}</strong>
                                </div>
                                <div className="wallet-preview-row wallet-preview-total">
                                    <span>Balance After Booking</span>
                                    <strong>
                                        {projectedBalance !== null ? `USD ${projectedBalance.toFixed(2)}` : '--'}
                                    </strong>
                                </div>
                            </div>

                            <BookingForm
                                offerId={offerId}
                                numberOfPassengers={numberOfPassengers}
                                onSubmit={handleFormSubmit}
                                isLoading={isSubmitting}
                                onCancel={handleBack}
                            />
                        </>
                    )}

                    {currentStep === 'confirmation' && bookingData && (
                        <BookingConfirmation
                            orderId={bookingData.order_id}
                            bookingReference={bookingData.booking_reference}
                            totalAmount={bookingData.total_amount}
                            currency={bookingData.currency}
                            remainingBalance={bookingData.remaining_balance}
                            onBack={handleBack}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
