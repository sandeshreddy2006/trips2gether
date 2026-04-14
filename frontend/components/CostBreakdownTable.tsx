"use client";
import React, { useState } from "react";
import "./CostBreakdownTable.css";

type BreakdownItem = {
    item_id: number;
    item_type: string;
    title: string;
    estimated_cost: number | null;
    currency: string;
    is_missing: boolean;
};

type CostBreakdownTableProps = {
    items: BreakdownItem[];
    currency?: string;
};

export default function CostBreakdownTable({
    items,
    currency = "USD",
}: CostBreakdownTableProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!items || items.length === 0) {
        return (
            <div className="cost-breakdown-empty">
                <p>No items added yet. Start adding flights, hotels, and activities to see the cost breakdown.</p>
            </div>
        );
    }

    const itemsWithCost = items.filter((item) => !item.is_missing);
    const itemsMissingCost = items.filter((item) => item.is_missing);

    const formatItemType = (type: string): string => {
        return type
            .replace("itinerary_", "")
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    return (
        <div className="cost-breakdown-wrapper">
            <button
                className="cost-breakdown-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span>📋 Cost Breakdown ({items.length} items)</span>
                <span className={`toggle-icon ${isExpanded ? "expanded" : ""}`}>▼</span>
            </button>

            {isExpanded && (
                <div className="cost-breakdown-content">
                    {itemsWithCost.length > 0 && (
                        <div className="breakdown-section">
                            <h4>Items with Cost Data ({itemsWithCost.length})</h4>
                            <table className="breakdown-table">
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Item Name</th>
                                        <th className="cost-column">Estimated Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {itemsWithCost.map((item) => (
                                        <tr key={`${item.item_type}-${item.item_id}`}>
                                            <td className="type-cell">
                                                <span className="item-type-badge">
                                                    {formatItemType(item.item_type)}
                                                </span>
                                            </td>
                                            <td className="title-cell">{item.title}</td>
                                            <td className="cost-cell">
                                                <span className="cost-amount">
                                                    {item.currency} {item.estimated_cost?.toLocaleString("en-US", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {itemsMissingCost.length > 0 && (
                        <div className="breakdown-section missing-section">
                            <h4>Items Missing Cost Data ({itemsMissingCost.length})</h4>
                            <div className="missing-items-list">
                                {itemsMissingCost.map((item) => (
                                    <div
                                        key={`${item.item_type}-${item.item_id}`}
                                        className="missing-item"
                                    >
                                        <span className="item-type-badge secondary">
                                            {formatItemType(item.item_type)}
                                        </span>
                                        <span className="title">{item.title}</span>
                                        <span className="tbd-label">TBD</span>
                                    </div>
                                ))}
                            </div>
                            <p className="missing-note">
                                💡 Tip: Add estimated costs to these items to get a more accurate trip budget. You can edit items to add costs manually.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
