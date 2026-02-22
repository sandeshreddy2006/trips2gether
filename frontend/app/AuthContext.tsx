'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

export type User = {
    id: number;
    email: string;
    name: string;
};

export type LocationData = {
    latitude: number | null;
    longitude: number | null;
    location: string | null;
};

type AuthContextType = {
    isAuthenticated: boolean;
    user: User | null;
    isLoading: boolean;
    locationData: LocationData;
    login: () => void;
    logout: () => void;
    checkAuthStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [locationData, setLocationData] = useState<LocationData>({
        latitude: null,
        longitude: null,
        location: null,
    });

    // Get user's geolocation on app load
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocationData((prev) => ({
                        ...prev,
                        latitude,
                        longitude,
                    }));

                    // Try to get location name from Google Maps reverse geocoding (optional)
                    try {
                        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API;
                        if (!apiKey) {
                            console.log("Google Maps API key not configured");
                        } else {
                            const response = await fetch(
                                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
                            );
                            if (response.ok) {
                                const data = await response.json();
                                if (data.results && data.results.length > 0) {
                                    const address = data.results[0].formatted_address;
                                    setLocationData((prev) => ({
                                        ...prev,
                                        location: address,
                                    }));
                                }
                            }
                        }
                    } catch (err) {
                        console.log("Could not get location name:", err);
                    }
                },
                (error) => {
                    console.log("Location permission denied or unavailable:", error.message);
                }
            );
        }
    }, []);

    // Check if user is authenticated on app load
    const checkAuthStatus = async () => {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include',
            });

            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
                setIsAuthenticated(true);
            } else {
                setUser(null);
                setIsAuthenticated(false);
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            setUser(null);
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    // Check auth status on component mount
    useEffect(() => {
        checkAuthStatus();
    }, []);

    const login = () => {
        setIsAuthenticated(true);
        checkAuthStatus();
    };

    const logout = async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setIsAuthenticated(false);
            setUser(null);
            try { localStorage.removeItem('authToken'); } catch (e) { }
            try { sessionStorage.removeItem('authToken'); } catch (e) { }
            router.push('/');
        }
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, isLoading, locationData, login, logout, checkAuthStatus }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
