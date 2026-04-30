"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";
import styles from "./page.module.css";

type ModelCard = {
    id: string;
    name: string;
    caption: string;
    description: string;
};

const modelCards: ModelCard[] = [
    {
        id: "trip-optimizer",
        name: "Trip Optimizer",
        caption: "Best for budgets",
        description: "Balances flights, hotels, and activities with your group constraints.",
    },
    {
        id: "group-vibe",
        name: "Group Vibe",
        caption: "Best for groups",
        description: "Resolves preference conflicts and proposes consensus-friendly plans.",
    },
    {
        id: "explorer",
        name: "Explorer",
        caption: "Best for discovery",
        description: "Finds hidden gems and top spots with practical route sequencing.",
    },
    {
        id: "advisor",
        name: "Travel Advisor",
        caption: "Best for quick answers",
        description: "Fast conversational assistant for itinerary tweaks and trip decisions.",
    },
];

const quickActions = [
    "Help me draft a 4-day plan",
    "Compare two destinations",
    "Optimize this itinerary",
    "Summarize group poll outcomes",
];

type AssistantResponse = {
    reply: string;
    suggestions: string[];
    model?: string | null;
    assistantLabel?: string;
    fallback?: boolean;
};

const RECENT_PROMPTS_KEY = "ai-assistant-recent-prompts";

export default function AiAssistantPage() {
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();
    const [prompt, setPrompt] = useState("");
    const [selectedModel, setSelectedModel] = useState(modelCards[0].id);
    const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
    const [loadingResponse, setLoadingResponse] = useState(false);
    const [response, setResponse] = useState<AssistantResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/");
        }
    }, [isAuthenticated, isLoading, router]);

    const selectedModelName = useMemo(
        () => modelCards.find((model) => model.id === selectedModel)?.name ?? "Travel Advisor",
        [selectedModel]
    );

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(RECENT_PROMPTS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setRecentPrompts(parsed.filter((item) => typeof item === "string").slice(0, 12));
            }
        } catch {
            // ignore localStorage parse issues
        }
    }, []);

    function pushRecentPrompt(value: string) {
        const clean = value.trim();
        if (!clean) return;
        setRecentPrompts((prev) => {
            const next = [clean, ...prev.filter((item) => item !== clean)].slice(0, 12);
            try {
                window.localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(next));
            } catch {
                // ignore storage failures
            }
            return next;
        });
    }

    async function handleSend() {
        const clean = prompt.trim();
        if (!clean) {
            setError("Please enter a prompt.");
            return;
        }

        setLoadingResponse(true);
        setError(null);
        try {
            const res = await fetch("/api/ai-assistant/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    prompt: clean,
                    mode: selectedModel,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const detail = typeof data?.detail === "string" ? data.detail : "Could not generate suggestion right now.";
                throw new Error(detail);
            }

            setResponse({
                reply: typeof data?.reply === "string" ? data.reply : "No response generated.",
                suggestions: Array.isArray(data?.suggestions) ? data.suggestions.filter((s: unknown) => typeof s === "string") : [],
                model: typeof data?.model === "string" ? data.model : null,
                assistantLabel: selectedModelName,
                fallback: Boolean(data?.fallback),
            });
            pushRecentPrompt(clean);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not generate suggestion right now.");
            setResponse(null);
        } finally {
            setLoadingResponse(false);
        }
    }

    function handleNewChat() {
        setPrompt("");
        setResponse(null);
        setError(null);
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <section className={styles.pageShell}>
            <div className={styles.noiseOverlay} />

            <aside className={styles.leftPanel}>
                <div className={styles.brand}>Trips2gether AI</div>

                <button type="button" className={styles.primaryRailButton} onClick={handleNewChat}>
                    + New chat
                </button>

                <button type="button" className={styles.railButton}>
                    Search chats
                </button>
                <button type="button" className={styles.railButton}>
                    Saved prompts
                </button>

                <div className={styles.historyTitle}>Recent</div>
                <div className={styles.historyList}>
                    {recentPrompts.length === 0 ? (
                        <p className={styles.historyEmpty}>No recent prompts yet</p>
                    ) : (
                        recentPrompts.map((item) => (
                            <button
                                key={item}
                                type="button"
                                className={styles.historyItem}
                                onClick={() => setPrompt(item)}
                            >
                                {item}
                            </button>
                        ))
                    )}
                </div>
            </aside>

            <main className={styles.mainPanel}>
                <header className={styles.hero}>
                    <p className={styles.kicker}>AI assistant</p>
                    <h1>Plan smarter with your group in one place.</h1>
                    <p>
                        Draft itineraries, compare destination trade-offs, and get instant suggestions that
                        match your group style.
                    </p>
                </header>

                <div className={styles.composerCard}>
                    <textarea
                        className={styles.composerInput}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Ask anything: build a 5-day Kyoto plan with food spots under $80/day..."
                        aria-label="Assistant prompt"
                    />

                    <div className={styles.composerFooter}>
                        <div className={styles.chips}>
                            {quickActions.map((action) => (
                                <button
                                    key={action}
                                    type="button"
                                    className={styles.chip}
                                    onClick={() => setPrompt(action)}
                                >
                                    {action}
                                </button>
                            ))}
                        </div>

                        <div className={styles.controls}>
                            <label className={styles.modelSelectWrap}>
                                <span>Model</span>
                                <select
                                    className={styles.modelSelect}
                                    value={selectedModel}
                                    onChange={(event) => setSelectedModel(event.target.value)}
                                >
                                    {modelCards.map((model) => (
                                        <option key={model.id} value={model.id}>
                                            {model.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <button type="button" className={styles.sendButton} onClick={handleSend} disabled={loadingResponse}>
                                {loadingResponse ? "Thinking..." : `Start with ${selectedModelName}`}
                            </button>
                        </div>
                    </div>
                </div>

                <section className={styles.responseSection}>
                    <div className={styles.sectionHeader}>
                        <h2>Assistant response</h2>
                    </div>

                    {error && <div className={styles.responseError}>{error}</div>}

                    {!error && !response && !loadingResponse && (
                        <div className={styles.responsePlaceholder}>
                            Ask for destination ideas, budget-friendly itineraries, route optimization, or activity recommendations.
                        </div>
                    )}

                    {loadingResponse && <div className={styles.responsePlaceholder}>Generating suggestions...</div>}

                    {response && !loadingResponse && (
                        <article className={styles.responseCard}>
                            <p className={styles.responseText}>{response.reply}</p>
                            {response.suggestions.length > 0 && (
                                <ul className={styles.responseSuggestions}>
                                    {response.suggestions.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            )}
                            <div className={styles.responseMeta}>
                                {response.assistantLabel ? `Assistant: ${response.assistantLabel}` : `Assistant: ${selectedModelName}`}
                                {response.model ? ` | Engine: ${response.model}` : ""}
                                {response.fallback ? " | Fallback response" : ""}
                            </div>
                        </article>
                    )}
                </section>

                <section className={styles.modelsSection}>
                    <div className={styles.sectionHeader}>
                        <h2>Available assistants</h2>
                        <button type="button" className={styles.seeAllBtn}>
                            See all
                        </button>
                    </div>

                    <div className={styles.modelsGrid}>
                        {modelCards.map((model, index) => (
                            <article
                                key={model.id}
                                className={`${styles.modelCard} ${selectedModel === model.id ? styles.modelCardActive : ""}`}
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <p className={styles.modelCaption}>{model.caption}</p>
                                <h3>{model.name}</h3>
                                <p>{model.description}</p>
                                <button
                                    type="button"
                                    className={styles.modelChooseButton}
                                    onClick={() => setSelectedModel(model.id)}
                                >
                                    Use this assistant
                                </button>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </section>
    );
}
