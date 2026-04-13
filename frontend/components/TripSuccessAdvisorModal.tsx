"use client";

import React, { useEffect, useState } from "react";
import "./TripSuccessAdvisorModal.css";

type GroupOption = {
    id: number;
    name: string;
};

type InsightTone = "positive" | "warning" | "negative";

type InsightItem = {
    id: string;
    title: string;
    description: string;
    tone: InsightTone;
};

type ScoreData = {
    score: number | null;
    label: string;
    reasons: string[];
    conflicts: string[];
    evaluated_at: string;
    fallback: boolean;
};

type TripSuccessAdvisorModalProps = {
    groups: GroupOption[];
    selectedGroupId: string;
    onSelectedGroupIdChange: (value: string) => void;
    onClose: () => void;
};

function getToneFromIndex(i: number, total: number): InsightTone {
    if (i < total / 2) return "positive";
    if (i < total * 0.8) return "warning";
    return "negative";
}

function getMeterColor(score: number): string {
    if (score >= 80) return "#2e6b55";
    if (score >= 60) return "#d2ab3f";
    return "#c96a61";
}

export default function TripSuccessAdvisorModal({
    groups,
    selectedGroupId,
    onSelectedGroupIdChange,
    onClose,
}: TripSuccessAdvisorModalProps) {
    const [scoreData, setScoreData] = useState<ScoreData | null>(null);
    const [loading, setLoading] = useState(false);

    async function fetchScore(groupId: string) {
        if (!groupId) return;
        setLoading(true);
        setScoreData(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/trip-success-score`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("Request failed");
            const data: ScoreData = await res.json();
            setScoreData(data);
        } catch {
            setScoreData({
                score: null,
                label: "Unavailable",
                reasons: [],
                conflicts: [],
                evaluated_at: new Date().toISOString(),
                fallback: true,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!selectedGroupId && groups.length > 0) {
            onSelectedGroupIdChange(String(groups[0].id));
        }
    }, [groups, onSelectedGroupIdChange, selectedGroupId]);

    useEffect(() => {
        if (selectedGroupId) {
            fetchScore(selectedGroupId);
        }
    }, [selectedGroupId]);

    const selectedGroup = groups.find((group) => String(group.id) === selectedGroupId) || groups[0] || null;

    const score = scoreData?.score ?? null;
    const label = scoreData?.label ?? "";
    const meterColor = score !== null ? getMeterColor(score) : "#e0e0e0";

    const allInsights: InsightItem[] = [
        ...((scoreData?.reasons ?? []).map((r, i) => ({
            id: `reason-${i}`,
            title: "Positive Factor",
            description: r,
            tone: "positive" as InsightTone,
        }))),
        ...((scoreData?.conflicts ?? []).map((c, i) => ({
            id: `conflict-${i}`,
            title: "Conflict / Risk",
            description: c,
            tone: "negative" as InsightTone,
        }))),
    ];

    return (
        <div className="trip-success-modal-overlay" onClick={onClose}>
            <div
                className="trip-success-modal"
                role="dialog"
                aria-modal="true"
                aria-label="AI Trip Success Advisor"
                onClick={(event) => event.stopPropagation()}
            >
                <button type="button" className="trip-success-close" onClick={onClose} aria-label="Close advisor">
                    ×
                </button>

                <div className="trip-success-shell">
                    <div className="trip-success-header">
                        <div className="trip-success-badge" aria-hidden="true">
                            <span>AI</span>
                        </div>
                        <div className="trip-success-heading">
                            <div className="trip-success-title-row">
                                <h2>AI Trip Success Advisor</h2>
                            </div>
                            <p>
                                Based on group preferences, budget, poll outcomes, and planning constraints, the AI estimates the trip&apos;s chance of success.
                            </p>
                        </div>
                    </div>

                    <div className="trip-success-group-row">
                        <label htmlFor="trip-success-group">Select Group</label>
                        <select
                            id="trip-success-group"
                            value={selectedGroup ? String(selectedGroup.id) : ""}
                            onChange={(event) => onSelectedGroupIdChange(event.target.value)}
                            disabled={groups.length === 0}
                        >
                            {groups.length === 0 ? (
                                <option value="">No groups available</option>
                            ) : (
                                groups.map((group) => (
                                    <option key={group.id} value={group.id}>{group.name}</option>
                                ))
                            )}
                        </select>
                    </div>

                    <div className="trip-success-card">
                        <div className="trip-success-insights">
                            <div className="trip-success-insights-header">
                                <h3>Insights</h3>
                                {loading && <p>Analysing your trip…</p>}
                                {!loading && scoreData?.fallback && (
                                    <p>Score temporarily unavailable — try again shortly.</p>
                                )}
                                {!loading && scoreData && !scoreData.fallback && allInsights.length === 0 && (
                                    <p>No specific issues detected. The trip looks well-planned!</p>
                                )}
                            </div>

                            {!loading && allInsights.length > 0 && (
                                <div className="trip-success-insight-list">
                                    {allInsights.map((insight) => (
                                        <article key={insight.id} className={`trip-success-insight tone-${insight.tone}`}>
                                            <div className={`trip-success-insight-icon tone-${insight.tone}`} aria-hidden="true">
                                                {insight.tone === "positive" ? "✓" : insight.tone === "negative" ? "!" : "•"}
                                            </div>
                                            <div className="trip-success-insight-copy">
                                                <h4>{insight.title}</h4>
                                                <p>{insight.description}</p>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>

                        <aside className="trip-success-score-panel">
                            {loading ? (
                                <div className="trip-success-gauge-loading" aria-label="Loading score">
                                    <div className="trip-success-gauge-inner">
                                        <span style={{ fontSize: "0.8rem", color: "#888" }}>Loading…</span>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="trip-success-gauge"
                                    style={score !== null ? {
                                        background: `conic-gradient(${meterColor} 0 ${score}%, #e9d772 ${score}% 82%, #f1eee3 82% 100%)`,
                                    } : { background: "#f1eee3" }}
                                    aria-label={score !== null ? `Trip success score ${score} percent` : "Score unavailable"}
                                >
                                    <div className="trip-success-gauge-inner">
                                        {score !== null ? (
                                            <>
                                                <strong>{score}%</strong>
                                                <span>{label}</span>
                                            </>
                                        ) : (
                                            <span style={{ fontSize: "0.75rem", color: "#aaa" }}>N/A</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="trip-success-score-copy">
                                <p className="trip-success-score-heading">Chance of a Successful Trip</p>
                                {scoreData && !scoreData.fallback && score !== null && (
                                    <p className="trip-success-score-summary">
                                        {score >= 85 ? "The group is well-aligned and the plan looks realistic." :
                                            score >= 70 ? "Mostly aligned with some minor planning gaps." :
                                                score >= 50 ? "Notable conflicts or gaps need addressing." :
                                                    "Significant issues detected — more planning needed."}
                                    </p>
                                )}
                                {selectedGroup && <p className="trip-success-group-caption">Analysing {selectedGroup.name}</p>}
                                {scoreData && !scoreData.fallback && (
                                    <p style={{ fontSize: "0.75rem", color: "#aaa", margin: "0.25rem 0 0" }}>
                                        Evaluated at {new Date(scoreData.evaluated_at).toLocaleTimeString()}
                                    </p>
                                )}
                            </div>

                            <div className="trip-success-actions">
                                <button
                                    type="button"
                                    className="trip-success-refresh"
                                    onClick={() => fetchScore(selectedGroupId)}
                                    disabled={loading}
                                >
                                    {loading ? "Analysing…" : "Refresh Score"}
                                </button>
                                <button type="button" className="trip-success-secondary" onClick={onClose}>
                                    Close
                                </button>
                            </div>
                        </aside>
                    </div>

                    <div className="trip-success-footer">
                        <span className="trip-success-footer-dot" aria-hidden="true" />
                        <p>Need help? Adjust trip choices, dates, or budget ranges to improve the projected score.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

