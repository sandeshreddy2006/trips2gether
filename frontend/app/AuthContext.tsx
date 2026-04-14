'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { useRouter } from "next/navigation";

export type User = {
    id: number;
    email: string;
    name: string;
    avatar_url?: string | null;
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
    const lastSyncedLocationRef = useRef<string | null>(null);
    const lastGeocodeCoordsRef = useRef<string | null>(null);
    const ipFallbackAttemptedRef = useRef(false);
    const geolocationErrorCountRef = useRef(0);

    // Get user's geolocation on app load
    useEffect(() => {
        if (!navigator.geolocation) {
            return;
        }

        let cancelled = false;
        let watchId: number | null = null;

        const tryIpLocationFallback = async () => {
            if (cancelled || ipFallbackAttemptedRef.current) {
                return;
            }
            ipFallbackAttemptedRef.current = true;

            try {
                const response = await fetch("https://ipapi.co/json/");
                if (!response.ok) {
                    console.log("IP fallback HTTP error:", response.status, response.statusText);
                    return;
                }

                const data = await response.json();
                const latitude = typeof data.latitude === "number" ? data.latitude : null;
                const longitude = typeof data.longitude === "number" ? data.longitude : null;
                const parts = [data.city, data.region, data.country_name].filter(Boolean);
                const locationLabel = parts.length > 0 ? parts.join(", ") : null;

                if (!cancelled) {
                    setLocationData((prev) => ({
                        latitude: prev.latitude ?? latitude,
                        longitude: prev.longitude ?? longitude,
                        location: prev.location ?? locationLabel,
                    }));
                }
            } catch (err) {
                console.log("IP fallback location failed:", err);
            }
        };

        const reverseGeocode = async (latitude: number, longitude: number) => {
            const coordsKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
            if (lastGeocodeCoordsRef.current === coordsKey) {
                return;
            }
            lastGeocodeCoordsRef.current = coordsKey;

            try {
                const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API;
                if (!apiKey) {
                    console.log("Google Maps API key not configured");
                    return;
                }

                const response = await fetch(
                    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
                );
                if (!response.ok) {
                    console.log("Geocoding HTTP error:", response.status, response.statusText);
                    return;
                }

                const data = await response.json();
                if (data.status === "OK" && data.results && data.results.length > 0) {
                    const address = data.results[0].formatted_address;
                    if (!cancelled) {
                        setLocationData((prev) => ({
                            ...prev,
                            location: address,
                        }));
                    }
                } else {
                    console.log("Geocoding API error:", data.status, data.error_message || "Unknown error");
                }
            } catch (err) {
                console.log("Could not get location name:", err);
            }
        };

        const onPosition = (position: GeolocationPosition) => {
            if (cancelled) return;
            const { latitude, longitude } = position.coords;
            setLocationData((prev) => ({
                ...prev,
                latitude,
                longitude,
            }));
            void reverseGeocode(latitude, longitude);
        };

        const onLocationError = (error: GeolocationPositionError) => {
            geolocationErrorCountRef.current += 1;
            const codeLabel =
                error.code === 1 ? "PERMISSION_DENIED" : error.code === 2 ? "POSITION_UNAVAILABLE" : "TIMEOUT";
            if (geolocationErrorCountRef.current <= 2) {
                console.log("Location permission denied or unavailable:", codeLabel, error.message);
            }

            void tryIpLocationFallback();

            if (watchId !== null && (error.code === 1 || geolocationErrorCountRef.current >= 3)) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
        };

        // First fast attempt.
        navigator.geolocation.getCurrentPosition(onPosition, onLocationError, {
            enableHighAccuracy: false,
            timeout: 12000,
            maximumAge: 300000,
        });

        // Fallback watcher helps on macOS where first lookup can return kCLErrorLocationUnknown.
        watchId = navigator.geolocation.watchPosition(onPosition, onLocationError, {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 300000,
        });

        return () => {
            cancelled = true;
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, []);

    // Check if user is authenticated on app load
    const checkAuthStatus = async () => {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include',
            });

            if (response.ok) {
                const userData = await response.json();

                // Try to load user's profile to get avatar
                try {
                    const profileResponse = await fetch('/api/profile/get', {
                        credentials: 'include',
                    });
                    if (profileResponse.ok) {
                        const profileData = await profileResponse.json();
                        userData.avatar_url = profileData.avatar_url;
                    }
                } catch (err) {
                    console.log("Could not load profile avatar:", err);
                }

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

    // Sync location to backend after login without blocking auth flow.
    useEffect(() => {
        if (!isAuthenticated) return;

        const hasLocationData =
            locationData.latitude !== null ||
            locationData.longitude !== null ||
            (locationData.location !== null && locationData.location.trim() !== "");

        if (!hasLocationData) return;

        const signature = JSON.stringify({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            location: locationData.location,
        });

        if (lastSyncedLocationRef.current === signature) return;
        lastSyncedLocationRef.current = signature;

        void fetch('/api/auth/location', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                location: locationData.location,
            }),
        }).catch((err) => {
            console.log('Background location sync failed:', err);
        });
    }, [isAuthenticated, locationData]);

    useEffect(() => {
        if (!isAuthenticated || !user || typeof window === "undefined") {
            return;
        }

        let cancelled = false;
        let socket: WebSocket | null = null;
        let reconnectTimer: number | null = null;

        const connect = () => {
            if (cancelled) return;

            const wsBaseUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL
                || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8000`;
            socket = new WebSocket(`${wsBaseUrl}/ws/polls`);

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data as string);
                    window.dispatchEvent(new CustomEvent("poll-realtime", { detail: data }));
                } catch {
                    // Ignore malformed websocket payloads.
                }
            };

            socket.onclose = () => {
                if (cancelled) return;
                reconnectTimer = window.setTimeout(() => {
                    connect();
                }, 3000);
            };

            socket.onerror = () => {
                try {
                    socket?.close();
                } catch {
                    // Ignore close errors.
                }
            };
        };

        connect();

        return () => {
            cancelled = true;
            if (reconnectTimer) {
                window.clearTimeout(reconnectTimer);
            }
            try {
                socket?.close();
            } catch {
                // Ignore close errors.
            }
        };
    }, [isAuthenticated, user]);

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
