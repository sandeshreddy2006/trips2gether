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

type AdvisorScenario = {
    score: number;
    label: string;
    summary: string;
    helperText: string;
    insights: InsightItem[];
};

type TripSuccessAdvisorModalProps = {
    groups: GroupOption[];
    selectedGroupId: string;
    onSelectedGroupIdChange: (value: string) => void;
    onClose: () => void;
};

const ADVISOR_SCENARIOS: AdvisorScenario[] = [
    {
        score: 75,
        label: "Good",
        summary: "Budget alignment is strong, but the plan still has a few coordination risks.",
        helperText: "Here is the current preview score. Later this will refresh from the Claude-backed advisor endpoint.",
        insights: [
            {
                id: "budget",
                title: "Budget Alignment",
                description: "Estimated costs stay within the group's expected spending range.",
                tone: "positive",
            },
            {
                id: "travel-time",
                title: "Travel Time Suitability",
                description: "The current route timing looks convenient for most members.",
                tone: "warning",
            },
            {
                id: "preferences",
                title: "Preference Mismatch",
                description: "The shortlist mixes activity styles that may split votes once booking starts.",
                tone: "negative",
            },
            {
                id: "dates",
                title: "Limited Date Options",
                description: "Calendar overlap is narrow, but there are still workable windows.",
                tone: "warning",
            },
        ],
    },
    {
        score: 84,
        label: "Very Strong",
        summary: "This group looks close to a bookable decision with only minor planning friction left.",
        helperText: "Most signals are aligned in this preview state: destination fit, budget, and availability.",
        insights: [
            {
                id: "budget",
                title: "Budget Confidence",
                description: "Flight, stay, and activity assumptions remain inside the expected per-person budget.",
                tone: "positive",
            },
            {
                id: "consensus",
                title: "Group Consensus",
                description: "Recent poll decisions suggest the group is converging on one trip style.",
                tone: "positive",
            },
            {
                id: "timing",
                title: "Schedule Pressure",
                description: "A few members still need to confirm dates before prices start moving.",
                tone: "warning",
            },
            {
                id: "scope",
                title: "Trip Scope",
                description: "The itinerary is realistic, but adding more stops could reduce reliability.",
                tone: "warning",
            },
        ],
    },
    {
        score: 61,
        label: "Needs Work",
        summary: "The plan is viable, but member preferences and timing are still too fragmented.",
        helperText: "Use this preview state to show how the advisor can flag friction before bookings are made.",
        insights: [
            {
                id: "cost-variance",
                title: "Budget Drift",
                description: "Current choices create a noticeable cost spread between members' expected budgets.",
                tone: "negative",
            },
            {
                id: "dates",
                title: "Date Flexibility",
                description: "Only a small overlap remains across calendars, which weakens confidence.",
                tone: "negative",
            },
            {
                id: "destination-fit",
                title: "Destination Fit",
                description: "The destination still works, but the activity mix needs better alignment.",
                tone: "warning",
            },
            {
                id: "next-step",
                title: "Recommended Next Step",
                description: "Run another group vote on dates or trim the itinerary to recover score.",
                tone: "positive",
            },
        ],
    },
];

function getToneIcon(tone: InsightTone): string {
    if (tone === "positive") return "✓";
    if (tone === "negative") return "!";
    return "•";
}

function getMeterColor(score: number): string {
    if (score >= 80) return "#2e6b55";
    if (score >= 68) return "#d2ab3f";
    return "#c96a61";
}

export default function TripSuccessAdvisorModal({
    groups,
    selectedGroupId,
    onSelectedGroupIdChange,
    onClose,
}: TripSuccessAdvisorModalProps) {
    const [scenarioIndex, setScenarioIndex] = useState(0);

    useEffect(() => {
        if (!selectedGroupId && groups.length > 0) {
            onSelectedGroupIdChange(String(groups[0].id));
        }
    }, [groups, onSelectedGroupIdChange, selectedGroupId]);

    const selectedGroup = groups.find((group) => String(group.id) === selectedGroupId) || groups[0] || null;
    const scenario = ADVISOR_SCENARIOS[scenarioIndex];
    const meterColor = getMeterColor(scenario.score);

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
                                <button type="button" className="trip-success-info" aria-label="Advisor preview information">
                                    i
                                </button>
                            </div>
                            <p>
                                Based on group preferences, budget, and planning constraints, this preview estimates the trip's chance of success.
                            </p>
                        </div>
                    </div>

                    <div className="trip-success-group-row">
                        <label htmlFor="trip-success-group">Preview Group</label>
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
                                <p>{scenario.helperText}</p>
                            </div>

                            <div className="trip-success-insight-list">
                                {scenario.insights.map((insight) => (
                                    <article key={insight.id} className={`trip-success-insight tone-${insight.tone}`}>
                                        <div className={`trip-success-insight-icon tone-${insight.tone}`} aria-hidden="true">
                                            {getToneIcon(insight.tone)}
                                        </div>
                                        <div className="trip-success-insight-copy">
                                            <h4>{insight.title}</h4>
                                            <p>{insight.description}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>

                        <aside className="trip-success-score-panel">
                            <div
                                className="trip-success-gauge"
                                style={{
                                    background: `conic-gradient(${meterColor} 0 ${scenario.score}%, #e9d772 ${scenario.score}% 82%, #f1eee3 82% 100%)`,
                                }}
                                aria-label={`Trip success score ${scenario.score} percent`}
                            >
                                <div className="trip-success-gauge-inner">
                                    <strong>{scenario.score}%</strong>
                                    <span>{scenario.label}</span>
                                </div>
                            </div>

                            <div className="trip-success-score-copy">
                                <p className="trip-success-score-heading">Chance of a Successful Trip</p>
                                <p className="trip-success-score-summary">{scenario.summary}</p>
                                {selectedGroup && <p className="trip-success-group-caption">Previewing {selectedGroup.name}</p>}
                            </div>

                            <div className="trip-success-actions">
                                <button
                                    type="button"
                                    className="trip-success-refresh"
                                    onClick={() => setScenarioIndex((current) => (current + 1) % ADVISOR_SCENARIOS.length)}
                                >
                                    Refresh Score
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