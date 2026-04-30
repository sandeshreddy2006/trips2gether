"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/AuthContext";
import "./GroupChatThread.css";

type ChatMessage = {
    id: number;
    group_id: number;
    sender_id: number;
    sender_name: string;
    body: string;
    created_at: string;
    updated_at?: string | null;
};

type ChatThreadResponse = {
    group_id: number;
    group_name: string;
    unread_count: number;
    messages: ChatMessage[];
};

function formatChatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString();
}

export default function GroupChatThread({ groupId }: { groupId: number }) {
    const router = useRouter();
    const { user } = useAuth();
    const [thread, setThread] = useState<ChatThreadResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [messageBody, setMessageBody] = useState("");
    const [sending, setSending] = useState(false);

    const messages = useMemo(() => thread?.messages || [], [thread]);

    useEffect(() => {
        let cancelled = false;

        async function loadThread() {
            try {
                setLoading(true);
                setError(null);
                const response = await fetch(`/api/groups/${groupId}/chat/messages`, { credentials: "include" });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error((data as { detail?: string }).detail || "Failed to load chat thread");
                }

                if (!cancelled) {
                    setThread({
                        group_id: Number(data.group_id),
                        group_name: String(data.group_name || "Group Chat"),
                        unread_count: Number(data.unread_count) || 0,
                        messages: Array.isArray(data.messages) ? data.messages : [],
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load chat thread");
                    setThread(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadThread();
        return () => {
            cancelled = true;
        };
    }, [groupId]);

    async function handleSendMessage() {
        const trimmed = messageBody.trim();
        if (!trimmed) return;

        try {
            setSending(true);
            const response = await fetch(`/api/groups/${groupId}/chat/messages`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: trimmed }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error((data as { detail?: string }).detail || "Failed to send message");
            }

            setMessageBody("");
            const nextMessage = data.message as ChatMessage | undefined;
            setThread((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    unread_count: 0,
                    messages: nextMessage ? [...prev.messages, nextMessage] : prev.messages,
                };
            });
            // Reload so the read-state stays in sync with the latest message order.
            const refreshResponse = await fetch(`/api/groups/${groupId}/chat/messages`, { credentials: "include" });
            const refreshData = await refreshResponse.json().catch(() => ({}));
            if (refreshResponse.ok) {
                setThread({
                    group_id: Number(refreshData.group_id),
                    group_name: String(refreshData.group_name || thread?.group_name || "Group Chat"),
                    unread_count: Number(refreshData.unread_count) || 0,
                    messages: Array.isArray(refreshData.messages) ? refreshData.messages : [],
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send message");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="chat-thread-page">
            <header className="chat-thread-header">
                <div>
                    <p className="chat-thread-kicker">Group chat</p>
                    <h1>{thread?.group_name || "Chat thread"}</h1>
                    <p className="chat-thread-subtitle">Keep trip updates and decisions in one place.</p>
                </div>
                <div className="chat-thread-actions">
                    <button type="button" className="chat-thread-btn secondary" onClick={() => router.push(`/group/${groupId}`)}>
                        Back to Group
                    </button>
                    <button type="button" className="chat-thread-btn" onClick={() => router.push(`/group/${groupId}/itinerary`)}>
                        View Itinerary
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="chat-thread-empty">Loading chat thread...</div>
            ) : error ? (
                <div className="chat-thread-empty chat-thread-error">{error}</div>
            ) : (
                <div className="chat-thread-panel">
                    <div className="chat-thread-messages">
                        {messages.length === 0 ? (
                            <div className="chat-thread-empty">No messages yet. Start the conversation.</div>
                        ) : (
                            messages.map((message) => {
                                const isOwnMessage = user?.id === message.sender_id;
                                return (
                                    <article key={message.id} className={`chat-message ${isOwnMessage ? "own" : "other"}`}>
                                        <div className="chat-message-meta">
                                            <strong>{message.sender_name}</strong>
                                            <span>{formatChatTime(message.created_at)}</span>
                                        </div>
                                        <p className="chat-message-body">{message.body}</p>
                                    </article>
                                );
                            })
                        )}
                    </div>

                    <form
                        className="chat-thread-composer"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleSendMessage();
                        }}
                    >
                        <textarea
                            className="chat-thread-input"
                            rows={3}
                            value={messageBody}
                            onChange={(event) => setMessageBody(event.target.value)}
                            placeholder="Write a message to your group..."
                        />
                        <div className="chat-thread-composer-actions">
                            <span className="chat-thread-hint">Messages are visible to all members in this group.</span>
                            <button type="submit" className="chat-thread-btn" disabled={sending || !messageBody.trim()}>
                                {sending ? "Sending..." : "Send Message"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
