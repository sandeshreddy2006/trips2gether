"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Search({ placeholder }: { placeholder?: string }) {
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/explore?query=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <form onSubmit={handleSearch} className="app-search-form" role="search">
            <input
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="app-search-input"
            />
            <button
                type="submit"
                disabled={!searchQuery.trim()}
                className="app-search-button"
            >
                Search
            </button>
        </form>
    );
}
