"use client";
import React, { useState } from "react";
import "./MemberCostBreakdown.css";

type MemberCostBreakdownItem = {
    member_id: number;
    member_name: string;
    member_email: string;
    individual_share: number;
    amount_paid?: number;
    payment_status?: string; // "unpaid" | "paid" | "partial"
};

type MemberCostBreakdownProps = {
    members: MemberCostBreakdownItem[];
    currency: string;
    currentUserId?: number | null;
    groupId?: number | null;
    onPaymentComplete?: () => void;
};

export default function MemberCostBreakdown({
    members,
    currency,
    currentUserId = null,
    groupId = null,
    onPaymentComplete,
}: MemberCostBreakdownProps) {
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    if (!members || members.length === 0) {
        return null;
    }

    const currentMember = members.find((m) => m.member_id === currentUserId);
    const canPay =
        groupId &&
        currentMember &&
        currentMember.individual_share > 0 &&
        currentMember.payment_status !== "paid";

    async function handlePayWallet() {
        if (!groupId) return;
        setPaying(true);
        setPayError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/pay-wallet`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ detail: "Payment failed" }));
                throw new Error(data.detail || "Payment failed");
            }
            onPaymentComplete?.();
        } catch (err: unknown) {
            setPayError(err instanceof Error ? err.message : "Payment failed");
        } finally {
            setPaying(false);
        }
    }

    async function handlePayStripe() {
        if (!groupId) return;
        setPaying(true);
        setPayError(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/pay-stripe`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ detail: "Checkout failed" }));
                throw new Error(data.detail || "Checkout failed");
            }
            const data = await res.json();
            window.location.href = data.checkout_url;
        } catch (err: unknown) {
            setPayError(err instanceof Error ? err.message : "Checkout failed");
            setPaying(false);
        }
    }

    function getStatusBadge(status?: string) {
        if (!status || status === "unpaid") return <span className="payment-badge payment-unpaid">Unpaid</span>;
        if (status === "paid") return <span className="payment-badge payment-paid">Paid</span>;
        return <span className="payment-badge payment-partial">Partial</span>;
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
                            <th>Paid / Owed</th>
                            <th>Status</th>
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
                                <td className="member-paid-col">
                                    {(member.amount_paid ?? 0) > 0 && (
                                        <span className="member-paid-amount">
                                            {currency} {(member.amount_paid ?? 0).toLocaleString("en-US", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })} paid
                                        </span>
                                    )}
                                    {member.payment_status === "partial" && (
                                        <span className="member-remaining-amount">
                                            {currency} {(member.individual_share - (member.amount_paid ?? 0)).toLocaleString("en-US", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })} remaining
                                        </span>
                                    )}
                                    {(!member.payment_status || member.payment_status === "unpaid") && (
                                        <span className="member-remaining-amount">
                                            {currency} {member.individual_share.toLocaleString("en-US", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })} owed
                                        </span>
                                    )}
                                </td>
                                <td>{getStatusBadge(member.payment_status)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {canPay && (
                <div className="member-pay-section">
                    <p className="member-pay-label">
                        Your share: <strong>{currency} {currentMember.individual_share.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </p>
                    {payError && <p className="member-pay-error">{payError}</p>}
                    <div className="member-pay-buttons">
                        <button
                            className="member-pay-btn member-pay-wallet"
                            onClick={handlePayWallet}
                            disabled={paying}
                        >
                            {paying ? "Processing…" : "Pay with Wallet"}
                        </button>
                        <button
                            className="member-pay-btn member-pay-stripe"
                            onClick={handlePayStripe}
                            disabled={paying}
                        >
                            {paying ? "Processing…" : "Pay with Card (Stripe)"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}