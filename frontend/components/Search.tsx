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
        <form onSubmit={handleSearch} className="relative w-[420px]">
            <input
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-gray-200 px-4 py-2"
            />
            <button
                type="submit"
                disabled={!searchQuery.trim()}
                className="absolute right-1 top-1/2 -translate-y-1/2 bg-emerald-600 text-white px-4 py-1.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Search
            </button>
        </form>
    );
}
