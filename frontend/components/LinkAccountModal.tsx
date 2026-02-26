"use client";
import React, { useState } from "react";
import './SignInModal.css';

type LinkAccountModalProps = {
    email: string;
    onLink: () => Promise<void>;
    onCancel: () => void;
};

export default function LinkAccountModal({ email, onLink, onCancel }: LinkAccountModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLink = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await onLink();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to link account');
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal" role="dialog" aria-modal="true">
                <button className="close-btn" onClick={onCancel} aria-label="Close" disabled={isLoading}>&times;</button>

                <img src="/logo.png" alt="Logo" className="logo" />

                <div className="modal-body">
                    <h2>Link Account?</h2>
                    <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '16px', lineHeight: '1.5' }}>
                        An account with email <strong>{email}</strong> already exists on Trips2gether.
                    </p>
                    <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '20px', lineHeight: '1.5' }}>
                        Would you like to link your Google account to this existing account? You'll then be able to sign in with either your email/password or Google.
                    </p>

                    {error && <p className="error-text">{error}</p>}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                        <button
                            className="signin-btn"
                            onClick={handleLink}
                            disabled={isLoading}
                            style={{ flex: 1 }}
                        >
                            {isLoading ? 'Linking…' : 'Link Account'}
                        </button>
                        <button
                            type="button"
                            className="footer-btn"
                            onClick={onCancel}
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                padding: '10px',
                                marginTop: 0,
                                background: '#f0f0f0',
                                border: '1px solid #ccc',
                                borderRadius: '5px',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                opacity: isLoading ? 0.5 : 1,
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
