"use client";

import React, { useRef } from "react";

interface OpeningHours {
    open_now?: boolean | null;
    weekday_descriptions: string[];
    periods: any[];
}

interface RestaurantDetailData {
    place_id: string;
    name: string;
    address?: string | null;
    rating?: number | null;
    user_ratings_total?: number | null;
    price_level?: string | null;
    cuisine_types: string[];
    location?: { lat: number | null; lng: number | null } | null;
    photo_urls: string[];
    opening_hours?: OpeningHours | null;
    phone?: string | null;
    website?: string | null;
    editorial_summary?: string | null;
}

interface RestaurantDetailProps {
    detail: RestaurantDetailData;
    loading: boolean;
    error: string | null;
    onClose: () => void;
    onRetry: () => void;
}

function NotAvailable() {
    return <span className="detail-na">Not available</span>;
}

export default function RestaurantDetail({
    detail,
    loading,
    error,
    onClose,
    onRetry,
}: RestaurantDetailProps) {
    const photosRef = useRef<HTMLDivElement>(null);

    return (
        <div className="detail-panel-overlay" onClick={onClose}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
                <button className="detail-close" onClick={onClose}>✕</button>

                {loading && (
                    <div className="detail-loading">
                        <div className="loading-spinner-small"></div>
                        <p>Loading restaurant details...</p>
                    </div>
                )}

                {error && (
                    <div className="detail-error">
                        <p>{error}</p>
                        <button className="btn btn-retry" onClick={onRetry}>Retry</button>
                    </div>
                )}

                {!loading && !error && detail && (
                    <>
                        {/* Photo carousel */}
                        {detail.photo_urls.length > 0 && (
                            <div className="detail-photos" ref={photosRef}>
                                {detail.photo_urls.map((url, i) => (
                                    <img
                                        key={i}
                                        src={url}
                                        alt={`${detail.name} photo ${i + 1}`}
                                        className="detail-photo"
                                        onError={(e) => {
                                            e.currentTarget.src = "https://via.placeholder.com/600x400?text=Photo";
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="detail-body">
                            <h2 className="detail-name">{detail.name}</h2>

                            {/* Cuisine tags */}
                            <div className="detail-cuisines">
                                {detail.cuisine_types.length > 0
                                    ? detail.cuisine_types.map((c, i) => (
                                          <span key={i} className="cuisine-tag">{c}</span>
                                      ))
                                    : <NotAvailable />}
                            </div>

                            {/* Summary */}
                            {detail.editorial_summary && (
                                <p className="detail-summary">{detail.editorial_summary}</p>
                            )}

                            {/* Info grid */}
                            <div className="detail-info-grid">
                                <div className="detail-info-item">
                                    <span className="detail-label">Rating</span>
                                    <span className="detail-value">
                                        {detail.rating != null
                                            ? <>★ {detail.rating.toFixed(1)} {detail.user_ratings_total != null && <small>({detail.user_ratings_total.toLocaleString()})</small>}</>
                                            : <NotAvailable />}
                                    </span>
                                </div>
                                <div className="detail-info-item">
                                    <span className="detail-label">Price</span>
                                    <span className="detail-value">
                                        {detail.price_level ?? <NotAvailable />}
                                    </span>
                                </div>
                                <div className="detail-info-item">
                                    <span className="detail-label">Address</span>
                                    <span className="detail-value">
                                        {detail.address ?? <NotAvailable />}
                                    </span>
                                </div>
                                <div className="detail-info-item">
                                    <span className="detail-label">Phone</span>
                                    <span className="detail-value">
                                        {detail.phone
                                            ? <a href={`tel:${detail.phone}`}>{detail.phone}</a>
                                            : <NotAvailable />}
                                    </span>
                                </div>
                                <div className="detail-info-item">
                                    <span className="detail-label">Website</span>
                                    <span className="detail-value">
                                        {detail.website
                                            ? <a href={detail.website} target="_blank" rel="noopener noreferrer">Visit website</a>
                                            : <NotAvailable />}
                                    </span>
                                </div>
                            </div>

                            {/* Opening hours */}
                            <div className="detail-hours-section">
                                <div className="detail-hours-header">
                                    <span className="detail-label">Opening Hours</span>
                                    {detail.opening_hours?.open_now != null && (
                                        <span className={`open-badge ${detail.opening_hours.open_now ? "open-badge-open" : "open-badge-closed"}`}>
                                            {detail.opening_hours.open_now ? "Open now" : "Closed now"}
                                        </span>
                                    )}
                                </div>
                                {detail.opening_hours && detail.opening_hours.weekday_descriptions.length > 0 ? (
                                    <ul className="detail-hours-list">
                                        {detail.opening_hours.weekday_descriptions.map((desc, i) => (
                                            <li key={i}>{desc}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <NotAvailable />
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
