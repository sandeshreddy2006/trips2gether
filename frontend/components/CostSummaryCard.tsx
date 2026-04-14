"use client";
import React from "react";
import "./CostSummaryCard.css";

type CostSummaryProps = {
    totalCost: number;
    perPersonCost: number;
    currency: string;
    memberCount: number;
    itemsWithCost: number;
    itemsMissingCost: number;
    hasMissingCosts: boolean;
};

export default function CostSummaryCard({
    totalCost,
    perPersonCost,
    currency,
    memberCount,
    itemsWithCost,
    itemsMissingCost,
    hasMissingCosts,
}: CostSummaryProps) {
    return (
        <div className="cost-summary-card">
            <div className="cost-summary-header">
                <h3>Trip Cost Summary</h3>
                {hasMissingCosts && (
                    <div className="cost-warning-badge">
                        ⚠️ {itemsMissingCost} item{itemsMissingCost !== 1 ? "s" : ""} missing cost data
                    </div>
                )}
            </div>

            <div className="cost-summary-content">
                <div className="cost-item total-cost">
                    <div className="cost-label">Total Estimated Cost</div>
                    <div className="cost-value">
                        {currency} {totalCost.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </div>
                    <div className="cost-detail">
                        {itemsWithCost} item{itemsWithCost !== 1 ? "s" : ""} with cost data
                    </div>
                </div>

                <div className="cost-divider"></div>

                <div className="cost-item per-person-cost">
                    <div className="cost-label">Per Person (÷ {memberCount})</div>
                    <div className="cost-value">
                        {currency} {perPersonCost.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </div>
                    <div className="cost-detail">Your share of the trip</div>
                </div>
            </div>

            {hasMissingCosts && (
                <div className="cost-note">
                    <p>Some items don't have cost estimates. Add costs manually or let AI estimate them when creating new items.</p>
                </div>
            )}
        </div>
    );
}
