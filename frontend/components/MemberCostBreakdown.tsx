"use client";
import React from "react";
import "./MemberCostBreakdown.css";

type MemberCostBreakdownItem = {
    member_id: number;
    member_name: string;
    member_email: string;
    individual_share: number;
};

type MemberCostBreakdownProps = {
    members: MemberCostBreakdownItem[];
    currency: string;
    currentUserId?: number | null;
};

export default function MemberCostBreakdown({
    members,
    currency,
    currentUserId = null,
}: MemberCostBreakdownProps) {
    if (!members || members.length === 0) {
        return null;
    }

    return (
        <div className="member-cost-breakdown-card">
            <div className="member-cost-breakdown-header">
                <h4>Per-Member Split</h4>
                <p>Each person&apos;s share of the current estimated total</p>
            </div>
            <div className="member-cost-breakdown-table-wrap">
                <table className="member-cost-breakdown-table">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Email</th>
                            <th className="share-column">Individual Share</th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((member) => (
                            <tr key={member.member_id}>
                                <td className="member-name">
                                    <span>{member.member_name}</span>
                                    {currentUserId === member.member_id && (
                                        <span className="member-you-badge">You</span>
                                    )}
                                </td>
                                <td className="member-email">{member.member_email}</td>
                                <td className="member-share">
                                    {currency} {member.individual_share.toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}