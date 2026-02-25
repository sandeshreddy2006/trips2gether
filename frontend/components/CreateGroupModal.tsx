"use client";
import React, { useState } from "react";
import "./CreateGroupModal.css";

type CreateGroupModalProps = {
    onClose: () => void;
    onGroupCreated: (group: any) => void;
};

export default function CreateGroupModal({ onClose, onGroupCreated }: CreateGroupModalProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const trimmed = name.trim();
        if (!trimmed) {
            setError("Group name is required");
            return;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: trimmed,
                    description: description.trim() || null,
                }),
            });

            if (!res.ok) {
                let msg = "Failed to create group";
                try {
                    const data = await res.json();
                    msg = data.detail || data.message || msg;
                } catch {}
                throw new Error(msg);
            }

            const data = await res.json();
            onGroupCreated(data.group);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create group");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="create-group-overlay" onClick={onClose}>
            <div
                className="create-group-modal"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <button className="close-btn" onClick={onClose} aria-label="Close">
                    &times;
                </button>

                <h2>Create Travel Group</h2>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="group-name">Group Name *</label>
                    <input
                        id="group-name"
                        type="text"
                        placeholder="e.g. Summer Europe Trip"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={255}
                        autoFocus
                    />

                    <label htmlFor="group-desc" style={{ marginTop: 12 }}>
                        Description (optional)
                    </label>
                    <textarea
                        id="group-desc"
                        placeholder="What's this trip about?"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />

                    {error && <p className="create-group-error">{error}</p>}

                    <button type="submit" className="create-group-submit" disabled={busy}>
                        {busy ? "Creating..." : "Create Group"}
                    </button>
                </form>
            </div>
        </div>
    );
}
