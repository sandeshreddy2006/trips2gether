"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AIRPORTS, Airport } from "./airportData";
import "./bookings.css";

interface Props {
    id: string;
    label: string;
    value: string; // IATA code stored in form state
    onChange: (iata: string) => void;
    placeholder?: string;
    error?: string;
}

function matchAirports(query: string): Airport[] {
    const q = query.trim();
    if (!q) return [];

    const upper = q.toUpperCase();
    const lower = q.toLowerCase();

    // Exact IATA match first
    const exact = AIRPORTS.filter((a) => a.iata === upper);
    if (exact.length > 0) return exact;

    // IATA prefix
    const iataPrefix = AIRPORTS.filter((a) => a.iata.startsWith(upper) && a.iata !== upper);

    // City / name substring matches (case-insensitive)
    const textMatch = AIRPORTS.filter(
        (a) =>
            !a.iata.startsWith(upper) &&
            (a.city.toLowerCase().includes(lower) ||
                a.name.toLowerCase().includes(lower) ||
                a.country.toLowerCase() === lower)
    );

    return [...iataPrefix, ...textMatch].slice(0, 8);
}

export default function AirportAutocomplete({ id, label, value, onChange, placeholder, error }: Props) {
    const [inputText, setInputText] = useState<string>(() => {
        if (!value) return "";
        const found = AIRPORTS.find((a) => a.iata === value);
        return found ? `${found.iata} – ${found.city} ${found.name}` : value;
    });
    const [suggestions, setSuggestions] = useState<Airport[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync display text if value is cleared externally
    useEffect(() => {
        if (!value) {
            setInputText("");
        }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const text = e.target.value;
        setInputText(text);
        const matches = matchAirports(text);
        setSuggestions(matches);
        setIsOpen(matches.length > 0);
        setActiveIndex(-1);
        if (!text.trim()) {
            onChange("");
        }
    };

    const selectAirport = useCallback(
        (airport: Airport) => {
            setInputText(`${airport.iata} – ${airport.city}, ${airport.name}`);
            setSuggestions([]);
            setIsOpen(false);
            setActiveIndex(-1);
            onChange(airport.iata);
        },
        [onChange]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            if (activeIndex >= 0 && suggestions[activeIndex]) {
                e.preventDefault();
                selectAirport(suggestions[activeIndex]);
            }
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    return (
        <div className={`field-wrap airport-autocomplete-wrap${error ? " has-error" : ""}`} ref={containerRef}>
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="text"
                placeholder={placeholder}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (suggestions.length > 0) setIsOpen(true);
                }}
                autoComplete="off"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            />
            {error && <p className="field-error">{error}</p>}
            {isOpen && suggestions.length > 0 && (
                <ul className="airport-dropdown" role="listbox" aria-label={`${label} suggestions`}>
                    {suggestions.map((airport, index) => (
                        <li
                            key={airport.iata}
                            id={`${id}-option-${index}`}
                            role="option"
                            aria-selected={index === activeIndex}
                            className={`airport-option${index === activeIndex ? " airport-option-active" : ""}`}
                            onMouseDown={(e) => {
                                // Prevent input blur before the click is registered
                                e.preventDefault();
                                selectAirport(airport);
                            }}
                        >
                            <span className="airport-iata">{airport.iata}</span>
                            <span className="airport-details">
                                <span className="airport-name">{airport.name}</span>
                                <span className="airport-location">
                                    {airport.city}, {airport.country}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
