"use client";
import React, { useState } from "react";
import "./HelpFeedback.css";

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Request failed'; }
};

export default function HelpFeedbackForm() {
    const [reportType, setReportType] = useState<string>("bug");
    const [title, setTitle] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const validate = () => {
        if (!description || description.trim().length < 5) {
            setError("Please provide a detailed description (at least 5 characters)");
            return false;
        }
        return true;
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!validate()) return;
        setBusy(true);
        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_type: reportType, title: title || null, description: description }),
            });
            if (!res.ok) {
                let msg = 'Submission failed';
                try { const data = await res.json(); msg = data.detail || data.message || msg; } catch { }
                throw new Error(msg);
            }
            setSuccess('Thanks — your report has been submitted. Our team will review it soon.');
            setTitle('');
            setDescription('');
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="help-feedback-card">
            <h2>Help & Feedback</h2>
            <p className="help-sub">Report bugs, flag incorrect data, or send feedback to the team.</p>
            <form onSubmit={handleSubmit} className="help-form">
                <label>Type</label>
                <select value={reportType} onChange={(e) => setReportType(e.target.value)} disabled={busy}>
                    <option value="bug">Bug</option>
                    <option value="data_error">Data error / incorrect data</option>
                    <option value="feedback">General feedback</option>
                </select>

                <label>Title (optional)</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" disabled={busy} />

                <label>Description *</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Describe the issue or feedback in detail" disabled={busy} />

                {error && <div className="help-error">{error}</div>}
                {success && <div className="help-success">{success}</div>}

                <div className="help-actions">
                    <button type="submit" className="help-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Report'}</button>
                </div>
            </form>
        </div>
    );
}
