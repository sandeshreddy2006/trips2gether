'use client';

import React, { useState } from 'react';
import './BookingForm.css';

interface Passenger {
    given_name: string;
    family_name: string;
    email: string;
    phone_number: string;
    born_at: string;
    gender: 'male' | 'female' | 'other';
    title: 'mr' | 'ms' | 'mrs' | 'mx';
}

interface BookingFormProps {
    offerId: string;
    numberOfPassengers: number;
    onSubmit: (passengers: Passenger[]) => Promise<void>;
    isLoading: boolean;
    onCancel: () => void;
}

export default function BookingForm({
    offerId,
    numberOfPassengers,
    onSubmit,
    isLoading,
    onCancel,
}: BookingFormProps) {
    const COUNTRY_CODES = [
        { code: '+1', label: '🇺🇸 +1 (US/CA)' },
        { code: '+44', label: '🇬🇧 +44 (UK)' },
        { code: '+91', label: '🇮🇳 +91 (IN)' },
        { code: '+61', label: '🇦🇺 +61 (AU)' },
        { code: '+49', label: '🇩🇪 +49 (DE)' },
        { code: '+33', label: '🇫🇷 +33 (FR)' },
        { code: '+81', label: '🇯🇵 +81 (JP)' },
        { code: '+86', label: '🇨🇳 +86 (CN)' },
        { code: '+55', label: '🇧🇷 +55 (BR)' },
        { code: '+52', label: '🇲🇽 +52 (MX)' },
        { code: '+39', label: '🇮🇹 +39 (IT)' },
        { code: '+34', label: '🇪🇸 +34 (ES)' },
        { code: '+82', label: '🇰🇷 +82 (KR)' },
        { code: '+65', label: '🇸🇬 +65 (SG)' },
        { code: '+971', label: '🇦🇪 +971 (AE)' },
        { code: '+27', label: '🇿🇦 +27 (ZA)' },
        { code: '+966', label: '🇸🇦 +966 (SA)' },
        { code: '+20', label: '🇪🇬 +20 (EG)' },
        { code: '+62', label: '🇮🇩 +62 (ID)' },
        { code: '+60', label: '🇲🇾 +60 (MY)' },
    ];

    const [passengers, setPassengers] = useState<Passenger[]>(
        Array(numberOfPassengers).fill(null).map(() => ({
            given_name: '',
            family_name: '',
            email: '',
            phone_number: '',
            born_at: '',
            gender: 'male',
            title: 'mr',
        }))
    );

    const [phoneCodes, setPhoneCodes] = useState<string[]>(
        Array(numberOfPassengers).fill('+1')
    );
    const [phoneDigits, setPhoneDigits] = useState<string[]>(
        Array(numberOfPassengers).fill('')
    );

    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const handlePassengerChange = (
        index: number,
        field: keyof Passenger,
        value: string
    ) => {
        const updated = [...passengers];
        updated[index] = { ...updated[index], [field]: value };
        setPassengers(updated);
        // Clear error for this field
        setErrors({
            ...errors,
            [`${index}-${field}`]: '',
        });
    };

    const validatePassengers = (): boolean => {
        const newErrors: { [key: string]: string } = {};
        let isValid = true;

        passengers.forEach((p, idx) => {
            if (!p.given_name.trim()) {
                newErrors[`${idx}-given_name`] = 'First name required';
                isValid = false;
            }
            if (!p.family_name.trim()) {
                newErrors[`${idx}-family_name`] = 'Last name required';
                isValid = false;
            }
            if (!p.email.trim() || !p.email.includes('@')) {
                newErrors[`${idx}-email`] = 'Valid email required';
                isValid = false;
            }
            const digits = phoneDigits[idx].replace(/\D/g, '');
            if (digits.length !== 10) {
                newErrors[`${idx}-phone_number`] = 'Enter exactly 10 digits';
                isValid = false;
            }
            if (!p.born_at || new Date(p.born_at) > new Date()) {
                newErrors[`${idx}-born_at`] = 'Valid DOB required';
                isValid = false;
            }
        });

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validatePassengers()) return;

        try {
            const passengersWithPhone = passengers.map((p, idx) => ({
                ...p,
                phone_number: phoneCodes[idx] + phoneDigits[idx].replace(/\D/g, ''),
            }));
            await onSubmit(passengersWithPhone);
        } catch (error) {
            console.error('Form submission error:', error);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="booking-form">
            <h2>Passenger Information</h2>
            <p className="form-subtitle">Enter details for all {numberOfPassengers} passenger(s)</p>

            <div className="passengers-container">
                {passengers.map((passenger, idx) => (
                    <div key={idx} className="passenger-card">
                        <div className="passenger-header">
                            <h3>Passenger {idx + 1}</h3>
                        </div>

                        <div className="form-grid">
                            <div className="form-group">
                                <label>Title *</label>
                                <select
                                    value={passenger.title}
                                    onChange={(e) =>
                                        handlePassengerChange(idx, 'title', e.target.value as any)
                                    }
                                    className="form-input"
                                >
                                    <option value="mr">Mr.</option>
                                    <option value="ms">Ms.</option>
                                    <option value="mrs">Mrs.</option>
                                    <option value="mx">Mx.</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>First Name *</label>
                                <input
                                    type="text"
                                    value={passenger.given_name}
                                    onChange={(e) =>
                                        handlePassengerChange(idx, 'given_name', e.target.value)
                                    }
                                    className={`form-input ${errors[`${idx}-given_name`] ? 'error' : ''
                                        }`}
                                    placeholder="John"
                                />
                                {errors[`${idx}-given_name`] && (
                                    <span className="error-text">{errors[`${idx}-given_name`]}</span>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Last Name *</label>
                                <input
                                    type="text"
                                    value={passenger.family_name}
                                    onChange={(e) =>
                                        handlePassengerChange(idx, 'family_name', e.target.value)
                                    }
                                    className={`form-input ${errors[`${idx}-family_name`] ? 'error' : ''
                                        }`}
                                    placeholder="Doe"
                                />
                                {errors[`${idx}-family_name`] && (
                                    <span className="error-text">{errors[`${idx}-family_name`]}</span>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Email *</label>
                                <input
                                    type="email"
                                    value={passenger.email}
                                    onChange={(e) =>
                                        handlePassengerChange(idx, 'email', e.target.value)
                                    }
                                    className={`form-input ${errors[`${idx}-email`] ? 'error' : ''
                                        }`}
                                    placeholder="john@example.com"
                                />
                                {errors[`${idx}-email`] && (
                                    <span className="error-text">{errors[`${idx}-email`]}</span>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Phone Number *</label>
                                <div className={`phone-input-group ${errors[`${idx}-phone_number`] ? 'error' : ''}`}>
                                    <select
                                        value={phoneCodes[idx]}
                                        onChange={(e) => {
                                            const updated = [...phoneCodes];
                                            updated[idx] = e.target.value;
                                            setPhoneCodes(updated);
                                        }}
                                        className="form-input phone-code-select"
                                    >
                                        {COUNTRY_CODES.map(({ code, label }) => (
                                            <option key={code} value={code}>{label}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="tel"
                                        value={phoneDigits[idx]}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            const updated = [...phoneDigits];
                                            updated[idx] = val;
                                            setPhoneDigits(updated);
                                            setErrors({ ...errors, [`${idx}-phone_number`]: '' });
                                        }}
                                        className="form-input phone-digits-input"
                                        placeholder="10-digit number"
                                        maxLength={10}
                                    />
                                </div>
                                {errors[`${idx}-phone_number`] && (
                                    <span className="error-text">{errors[`${idx}-phone_number`]}</span>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Date of Birth *</label>
                                <input
                                    type="date"
                                    value={passenger.born_at}
                                    onChange={(e) =>
                                        handlePassengerChange(idx, 'born_at', e.target.value)
                                    }
                                    className={`form-input ${errors[`${idx}-born_at`] ? 'error' : ''
                                        }`}
                                    max={new Date(Date.now() - 567648000000).toISOString().split('T')[0]}
                                />
                                {errors[`${idx}-born_at`] && (
                                    <span className="error-text">{errors[`${idx}-born_at`]}</span>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Gender *</label>
                                <select
                                    value={passenger.gender}
                                    onChange={(e) =>
                                        handlePassengerChange(idx, 'gender', e.target.value as any)
                                    }
                                    className="form-input"
                                >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="form-actions">
                <button
                    type="button"
                    onClick={onCancel}
                    className="btn btn-secondary"
                    disabled={isLoading}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isLoading}
                >
                    {isLoading ? 'Processing...' : 'Proceed to Payment'}
                </button>
            </div>
        </form>
    );
}
