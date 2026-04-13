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

const historyItems = [
    "Draft itinerary for Bali trip",
    "Hotel shortlist for Barcelona",
    "Flight timing comparison",
    "Weather-aware packing list",
];

export default function AiAssistantPage() {
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();
    const [prompt, setPrompt] = useState("");
    const [selectedModel, setSelectedModel] = useState(modelCards[0].id);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/");
        }
    }, [isAuthenticated, isLoading, router]);

    const selectedModelName = useMemo(
        () => modelCards.find((model) => model.id === selectedModel)?.name ?? "Travel Advisor",
        [selectedModel]
    );

    if (!isAuthenticated) {
        return null;
    }

    return (
        <section className={styles.pageShell}>
            <div className={styles.noiseOverlay} />

            <aside className={styles.leftPanel}>
                <div className={styles.brand}>Trips2gether AI</div>

                <button type="button" className={styles.primaryRailButton}>
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
                    {historyItems.map((item) => (
                        <button key={item} type="button" className={styles.historyItem}>
                            {item}
                        </button>
                    ))}
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

                            <button type="button" className={styles.sendButton}>
                                Start with {selectedModelName}
                            </button>
                        </div>
                    </div>
                </div>

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
