"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/AuthContext";
import styles from "./page.module.css";

type AdminReport = {
    id: number;
    user_id: number;
    report_type: string;
    title: string | null;
    description: string;
    status: "open" | "in_progress" | "resolved" | string;
    admin_notes: string | null;
    created_at: string;
    updated_at: string | null;
    reporter_email: string;
    reporter_name: string;
};

type ReportFilters = {
    status: string;
    report_type: string;
    date_from: string;
    date_to: string;
};

const STATUS_OPTIONS = ["", "open", "in_progress", "resolved"] as const;
const TYPE_OPTIONS = ["", "bug", "data_error", "feedback"] as const;

function formatDateTime(value: string | null): string {
    if (!value) return "Unavailable";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unavailable";
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}

function badgeClass(status: string): string {
    if (status === "resolved") return styles.badgeResolved;
    if (status === "in_progress") return styles.badgeProgress;
    return styles.badgeOpen;
}

export default function AdminReportsPage() {
    const router = useRouter();
    const { isAuthenticated, user, isLoading } = useAuth();
    const [reports, setReports] = useState<AdminReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingStatusId, setSavingStatusId] = useState<number | null>(null);
    const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
    const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
    const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
    const [filters, setFilters] = useState<ReportFilters>({
        status: "",
        report_type: "",
        date_from: "",
        date_to: "",
    });

    const isAdmin = !!user?.is_admin;

    useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated) {
            router.replace("/");
            return;
        }
        if (!isAdmin) {
            router.replace("/");
        }
    }, [isAuthenticated, isAdmin, isLoading, router]);

    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.report_type) params.set("report_type", filters.report_type);
        if (filters.date_from) params.set("date_from", filters.date_from);
        if (filters.date_to) params.set("date_to", filters.date_to);
        return params.toString();
    }, [filters]);

    useEffect(() => {
        if (!isAdmin) return;

        let cancelled = false;
        async function loadReports() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/admin/reports${queryString ? `?${queryString}` : ""}`, {
                    credentials: "include",
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.detail || payload?.message || "Failed to load reports");
                }

                const items = Array.isArray(payload?.items) ? payload.items : [];
                if (!cancelled) {
                    setReports(items);
                    setStatusDrafts((current) => {
                        const next = { ...current };
                        for (const report of items) {
                            if (!next[report.id]) {
                                next[report.id] = report.status;
                            }
                        }
                        return next;
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load reports");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadReports();
        return () => {
            cancelled = true;
        };
    }, [isAdmin, queryString]);

    async function saveStatus(reportId: number) {
        const nextStatus = statusDrafts[reportId];
        if (!nextStatus) return;

        setSavingStatusId(reportId);
        setError(null);
        try {
            const response = await fetch(`/api/admin/reports/${reportId}/status`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_status: nextStatus }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.detail || payload?.message || "Failed to update status");
            }
            setReports((current) =>
                current.map((report) =>
                    report.id === reportId
                        ? { ...report, status: nextStatus, updated_at: payload?.report?.updated_at || report.updated_at }
                        : report,
                ),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update status");
        } finally {
            setSavingStatusId(null);
        }
    }

    async function saveNote(reportId: number) {
        const noteText = (noteDrafts[reportId] || "").trim();
        if (!noteText) {
            setError("Enter an internal note before saving.");
            return;
        }

        setSavingNoteId(reportId);
        setError(null);
        try {
            const response = await fetch(`/api/admin/reports/${reportId}/notes`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note_text: noteText }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.detail || payload?.message || "Failed to save note");
            }
            setNoteDrafts((current) => ({ ...current, [reportId]: "" }));
            setReports((current) =>
                current.map((report) =>
                    report.id === reportId
                        ? { ...report, admin_notes: payload?.report?.admin_notes ?? report.admin_notes, updated_at: payload?.report?.updated_at ?? report.updated_at }
                        : report,
                ),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save note");
        } finally {
            setSavingNoteId(null);
        }
    }

    if (isLoading || loading) {
        return (
            <div className={styles.pageShell}>
                <div className={styles.heroCard}>
                    <div className={styles.kicker}>Admin</div>
                    <h1 className={styles.title}>Bug log dashboard</h1>
                    <p className={styles.subtitle}>Loading reports...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated || !isAdmin) {
        return (
            <div className={styles.pageShell}>
                <div className={styles.heroCard}>
                    <div className={styles.kicker}>Access restricted</div>
                    <h1 className={styles.title}>Admin access required</h1>
                    <p className={styles.subtitle}>This dashboard is only available to admins.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.pageShell}>
            <section className={styles.heroCard}>
                <div className={styles.heroCopy}>
                    <div className={styles.kicker}>Admin bug log</div>
                    <h1 className={styles.title}>Reports, triage, and internal notes in one place.</h1>
                    <p className={styles.subtitle}>
                        Track user reports, filter by type or status, and keep private notes without exposing them to reporters.
                    </p>
                </div>
                <div className={styles.heroStats}>
                    <div className={styles.statCard}>
                        <span className={styles.statLabel}>Open</span>
                        <strong>{reports.filter((report) => report.status === "open").length}</strong>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statLabel}>In progress</span>
                        <strong>{reports.filter((report) => report.status === "in_progress").length}</strong>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statLabel}>Resolved</span>
                        <strong>{reports.filter((report) => report.status === "resolved").length}</strong>
                    </div>
                </div>
            </section>

            <section className={styles.panel}>
                <div className={styles.filterBar}>
                    <label className={styles.filterField}>
                        <span>Status</span>
                        <select
                            value={filters.status}
                            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                        >
                            {STATUS_OPTIONS.map((option) => (
                                <option key={option || "all-status"} value={option}>
                                    {option ? option.replace("_", " ") : "All statuses"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={styles.filterField}>
                        <span>Type</span>
                        <select
                            value={filters.report_type}
                            onChange={(event) => setFilters((current) => ({ ...current, report_type: event.target.value }))}
                        >
                            {TYPE_OPTIONS.map((option) => (
                                <option key={option || "all-types"} value={option}>
                                    {option ? option.replace("_", " ") : "All types"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={styles.filterField}>
                        <span>From</span>
                        <input
                            type="date"
                            value={filters.date_from}
                            onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
                        />
                    </label>

                    <label className={styles.filterField}>
                        <span>To</span>
                        <input
                            type="date"
                            value={filters.date_to}
                            onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
                        />
                    </label>

                    <button
                        className={styles.clearButton}
                        onClick={() =>
                            setFilters({
                                status: "",
                                report_type: "",
                                date_from: "",
                                date_to: "",
                            })
                        }
                    >
                        Clear filters
                    </button>
                </div>

                {error && <div className={styles.errorBanner}>{error}</div>}

                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Report</th>
                                <th>Reporter</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className={styles.emptyState}>
                                        No reports match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report) => (
                                    <tr key={report.id}>
                                        <td>
                                            <div className={styles.reportTitle}>{report.title || "Untitled report"}</div>
                                            <div className={styles.reportDescription}>{report.description}</div>
                                            {report.admin_notes && (
                                                <details className={styles.notesDetails}>
                                                    <summary>View internal notes</summary>
                                                    <pre>{report.admin_notes}</pre>
                                                </details>
                                            )}
                                        </td>
                                        <td>
                                            <div className={styles.reporterName}>{report.reporter_name || "Unknown user"}</div>
                                            <div className={styles.reporterEmail}>{report.reporter_email}</div>
                                        </td>
                                        <td className={styles.reportType}>{report.report_type.replace("_", " ")}</td>
                                        <td>
                                            <span className={`${styles.badge} ${badgeClass(report.status)}`}>
                                                {report.status.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td>{formatDateTime(report.created_at)}</td>
                                        <td>
                                            <div className={styles.actionsCell}>
                                                <select
                                                    className={styles.actionSelect}
                                                    value={statusDrafts[report.id] || report.status}
                                                    onChange={(event) =>
                                                        setStatusDrafts((current) => ({
                                                            ...current,
                                                            [report.id]: event.target.value,
                                                        }))
                                                    }
                                                >
                                                    <option value="open">Open</option>
                                                    <option value="in_progress">In progress</option>
                                                    <option value="resolved">Resolved</option>
                                                </select>
                                                <button
                                                    className={styles.primaryButton}
                                                    onClick={() => void saveStatus(report.id)}
                                                    disabled={savingStatusId === report.id}
                                                >
                                                    {savingStatusId === report.id ? "Saving..." : "Update status"}
                                                </button>
                                                <textarea
                                                    className={styles.noteInput}
                                                    placeholder="Add an internal note"
                                                    value={noteDrafts[report.id] || ""}
                                                    onChange={(event) =>
                                                        setNoteDrafts((current) => ({
                                                            ...current,
                                                            [report.id]: event.target.value,
                                                        }))
                                                    }
                                                />
                                                <button
                                                    className={styles.secondaryButton}
                                                    onClick={() => void saveNote(report.id)}
                                                    disabled={savingNoteId === report.id}
                                                >
                                                    {savingNoteId === report.id ? "Saving note..." : "Save note"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
