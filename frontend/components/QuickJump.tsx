"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./QuickJump.css";

interface QuickJumpGroup {
    id: number;
    name: string;
    status: string;
    member_count: number;
}

interface QuickJumpBooking {
    id: number;
    booking_reference: string;
    status: string;
    total_amount: string;
    currency: string;
}

interface QuickJumpDestination {
    id: number;
    name: string;
    place_id: string;
    group_id: number;
    group_name: string;
    rating?: number;
}

interface QuickJumpChat {
    group_id: number;
    group_name: string;
    latest_message: string;
    unread_count: number;
}

interface QuickJumpResults {
    groups: QuickJumpGroup[];
    bookings: QuickJumpBooking[];
    destinations: QuickJumpDestination[];
    chats: QuickJumpChat[];
}

type ResultItem =
    | { type: "group"; data: QuickJumpGroup }
    | { type: "booking"; data: QuickJumpBooking }
    | { type: "destination"; data: QuickJumpDestination }
    | { type: "chat"; data: QuickJumpChat };

export default function QuickJump() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<QuickJumpResults | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Flatten results into a single list for keyboard navigation
    const flattenedResults: ResultItem[] = results
        ? [
            ...results.groups.map(g => ({ type: "group" as const, data: g })),
            ...results.bookings.map(b => ({ type: "booking" as const, data: b })),
            ...results.destinations.map(d => ({ type: "destination" as const, data: d })),
            ...results.chats.map(c => ({ type: "chat" as const, data: c })),
        ]
        : [];

    // Fetch quick-jump results
    useEffect(() => {
        if (!isOpen && !query) {
            setResults(null);
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(async () => {
            if (!query || query.length < 2) {
                // Fetch recent items if query is empty or too short
                setIsLoading(true);
                try {
                    const response = await fetch(`/api/search/quick-jump`, {
                        signal: controller.signal,
                        credentials: "include",
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setResults(data);
                    }
                } catch (error) {
                    if (error instanceof Error && error.name !== "AbortError") {
                        console.error("Failed to fetch recent items:", error);
                    }
                } finally {
                    setIsLoading(false);
                }
            } else {
                // Search with query
                setIsLoading(true);
                try {
                    const response = await fetch(`/api/search/quick-jump?query=${encodeURIComponent(query)}`, {
                        signal: controller.signal,
                        credentials: "include",
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setResults(data);
                    }
                } catch (error) {
                    if (error instanceof Error && error.name !== "AbortError") {
                        console.error("Failed to fetch search results:", error);
                    }
                } finally {
                    setIsLoading(false);
                }
            }
        }, 300); // Debounce for 300ms

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [query, isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) {
            if (e.key === "Enter") {
                if (query.trim().length >= 2) {
                    router.push(`/explore?query=${encodeURIComponent(query.trim())}`);
                } else {
                    setIsOpen(true);
                    setSelectedIndex(-1);
                }
            }
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < flattenedResults.length - 1 ? prev + 1 : 0
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev > 0 ? prev - 1 : flattenedResults.length - 1
                );
                break;
            case "Enter":
                e.preventDefault();
                if (selectedIndex >= 0 && flattenedResults[selectedIndex]) {
                    navigateToResult(flattenedResults[selectedIndex]);
                } else if (query.trim().length >= 2) {
                    router.push(`/explore?query=${encodeURIComponent(query.trim())}`);
                    setIsOpen(false);
                }
                break;
            case "Escape":
                e.preventDefault();
                setIsOpen(false);
                setSelectedIndex(-1);
                break;
            default:
                break;
        }
    };

    const navigateToResult = (item: ResultItem) => {
        setIsOpen(false);
        setQuery("");
        setSelectedIndex(-1);

        switch (item.type) {
            case "group":
                router.push(`/group/${item.data.id}`);
                break;
            case "booking":
                router.push(`/bookings`);
                break;
            case "destination":
                router.push(`/destination/${item.data.place_id}`);
                break;
            case "chat":
                router.push(`/group/${item.data.group_id}`);
                break;
        }
    };

    const handleResultClick = (item: ResultItem) => {
        navigateToResult(item);
    };

    // Scroll selected item into view
    useEffect(() => {
        if (selectedIndex >= 0 && dropdownRef.current) {
            const selectedElement = dropdownRef.current.querySelector(
                `[data-result-index="${selectedIndex}"]`
            );
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }
    }, [selectedIndex]);

    const hasResults =
        (results?.groups.length || 0) +
        (results?.bookings.length || 0) +
        (results?.destinations.length || 0) +
        (results?.chats.length || 0) > 0;

    return (
        <div className="quick-jump-container">
            <div className="quick-jump-input-wrapper">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Quick jump... (Groups, Bookings, Destinations, Chats)"
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value);
                        setSelectedIndex(-1);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    className="quick-jump-input"
                    aria-label="Quick jump search"
                    aria-expanded={isOpen}
                    aria-controls="quick-jump-dropdown"
                />
                {isLoading && <span className="quick-jump-loading">...</span>}
            </div>

            {isOpen && (
                <div
                    ref={dropdownRef}
                    id="quick-jump-dropdown"
                    className="quick-jump-dropdown"
                    role="listbox"
                >
                    {!hasResults && !isLoading && (
                        <div className="quick-jump-empty">
                            <p>
                                {query && query.length >= 2
                                    ? "No results found"
                                    : "Focus to see recent items"}
                            </p>
                            {query && query.length >= 2 && (
                                <div
                                    className="quick-jump-result-item"
                                    onClick={() => {
                                        router.push(`/explore?query=${encodeURIComponent(query.trim())}`);
                                        setIsOpen(false);
                                    }}
                                    role="option"
                                    aria-selected={false}
                                >
                                    <div className="result-icon">🔎</div>
                                    <div className="result-content">
                                        <div className="result-title">Search all destinations for "{query}"</div>
                                        <div className="result-meta">Open destination explorer</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {hasResults && query && query.length >= 2 && (
                        <div className="quick-jump-section">
                            <div className="quick-jump-section-title">Explore</div>
                            <div
                                className="quick-jump-result-item"
                                onClick={() => {
                                    router.push(`/explore?query=${encodeURIComponent(query.trim())}`);
                                    setIsOpen(false);
                                }}
                                role="option"
                                aria-selected={false}
                            >
                                <div className="result-icon">🔎</div>
                                <div className="result-content">
                                    <div className="result-title">Search all destinations for "{query}"</div>
                                    <div className="result-meta">Open destination explorer</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasResults && (
                        <div className="quick-jump-results">
                            {/* Groups Section */}
                            {results?.groups && results.groups.length > 0 && (
                                <div className="quick-jump-section">
                                    <div className="quick-jump-section-title">Groups</div>
                                    {results.groups.map((group, idx) => {
                                        const globalIdx = flattenedResults.findIndex(
                                            r => r.type === "group" && r.data.id === group.id
                                        );
                                        return (
                                            <div
                                                key={`group-${group.id}`}
                                                data-result-index={globalIdx}
                                                className={`quick-jump-result-item ${selectedIndex === globalIdx ? "selected" : ""
                                                    }`}
                                                onClick={() =>
                                                    handleResultClick({
                                                        type: "group",
                                                        data: group,
                                                    })
                                                }
                                                role="option"
                                                aria-selected={selectedIndex === globalIdx}
                                            >
                                                <div className="result-icon">👥</div>
                                                <div className="result-content">
                                                    <div className="result-title">{group.name}</div>
                                                    <div className="result-meta">
                                                        {group.member_count} members •{" "}
                                                        <span className="result-status">
                                                            {group.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Bookings Section */}
                            {results?.bookings && results.bookings.length > 0 && (
                                <div className="quick-jump-section">
                                    <div className="quick-jump-section-title">Bookings</div>
                                    {results.bookings.map((booking, idx) => {
                                        const globalIdx = flattenedResults.findIndex(
                                            r => r.type === "booking" && r.data.id === booking.id
                                        );
                                        return (
                                            <div
                                                key={`booking-${booking.id}`}
                                                data-result-index={globalIdx}
                                                className={`quick-jump-result-item ${selectedIndex === globalIdx ? "selected" : ""
                                                    }`}
                                                onClick={() =>
                                                    handleResultClick({
                                                        type: "booking",
                                                        data: booking,
                                                    })
                                                }
                                                role="option"
                                                aria-selected={selectedIndex === globalIdx}
                                            >
                                                <div className="result-icon">✈️</div>
                                                <div className="result-content">
                                                    <div className="result-title">
                                                        {booking.booking_reference}
                                                    </div>
                                                    <div className="result-meta">
                                                        {booking.total_amount} {booking.currency} •{" "}
                                                        <span className="result-status">
                                                            {booking.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Destinations Section */}
                            {results?.destinations && results.destinations.length > 0 && (
                                <div className="quick-jump-section">
                                    <div className="quick-jump-section-title">Destinations</div>
                                    {results.destinations.map((dest, idx) => {
                                        const globalIdx = flattenedResults.findIndex(
                                            r =>
                                                r.type === "destination" &&
                                                r.data.id === dest.id
                                        );
                                        return (
                                            <div
                                                key={`dest-${dest.id}`}
                                                data-result-index={globalIdx}
                                                className={`quick-jump-result-item ${selectedIndex === globalIdx ? "selected" : ""
                                                    }`}
                                                onClick={() =>
                                                    handleResultClick({
                                                        type: "destination",
                                                        data: dest,
                                                    })
                                                }
                                                role="option"
                                                aria-selected={selectedIndex === globalIdx}
                                            >
                                                <div className="result-icon">📍</div>
                                                <div className="result-content">
                                                    <div className="result-title">{dest.name}</div>
                                                    <div className="result-meta">
                                                        {dest.group_name}
                                                        {dest.rating && (
                                                            <>
                                                                {" "}
                                                                • ⭐ {dest.rating.toFixed(1)}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Chats Section */}
                            {results?.chats && results.chats.length > 0 && (
                                <div className="quick-jump-section">
                                    <div className="quick-jump-section-title">Chats</div>
                                    {results.chats.map((chat, idx) => {
                                        const globalIdx = flattenedResults.findIndex(
                                            r =>
                                                r.type === "chat" &&
                                                r.data.group_id === chat.group_id
                                        );
                                        return (
                                            <div
                                                key={`chat-${chat.group_id}`}
                                                data-result-index={globalIdx}
                                                className={`quick-jump-result-item ${selectedIndex === globalIdx ? "selected" : ""
                                                    }`}
                                                onClick={() =>
                                                    handleResultClick({
                                                        type: "chat",
                                                        data: chat,
                                                    })
                                                }
                                                role="option"
                                                aria-selected={selectedIndex === globalIdx}
                                            >
                                                <div className="result-icon">💬</div>
                                                <div className="result-content">
                                                    <div className="result-title">
                                                        {chat.group_name}
                                                    </div>
                                                    <div className="result-meta">
                                                        {chat.latest_message}
                                                        {chat.unread_count > 0 && (
                                                            <span className="unread-badge">
                                                                {chat.unread_count}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
