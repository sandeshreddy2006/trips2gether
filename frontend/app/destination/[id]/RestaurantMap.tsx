"use client";

import React, { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Location {
    lat: number | null;
    lng: number | null;
}

interface Restaurant {
    place_id: string;
    name: string;
    rating?: number;
    distance_text?: string;
    price_level?: string;
    location?: Location;
}

interface RestaurantMapProps {
    anchorLat: number;
    anchorLng: number;
    anchorName: string;
    restaurants: Restaurant[];
    selectedId: string | null;
    onSelectRestaurant: (id: string | null) => void;
}

const anchorIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

const restaurantIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

const selectedIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

function FlyToSelected({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([lat, lng], map.getZoom(), { duration: 0.5 });
    }, [lat, lng, map]);
    return null;
}

export default function RestaurantMap({
    anchorLat,
    anchorLng,
    anchorName,
    restaurants,
    selectedId,
    onSelectRestaurant,
}: RestaurantMapProps) {
    const selectedRestaurant = selectedId
        ? restaurants.find((r) => r.place_id === selectedId)
        : null;
    const flyLat = selectedRestaurant?.location?.lat ?? anchorLat;
    const flyLng = selectedRestaurant?.location?.lng ?? anchorLng;

    return (
        <MapContainer
            center={[anchorLat, anchorLng]}
            zoom={15}
            className="restaurant-map-container"
            scrollWheelZoom={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {selectedId && <FlyToSelected lat={flyLat} lng={flyLng} />}

            <Marker position={[anchorLat, anchorLng]} icon={anchorIcon}>
                <Popup>{anchorName} (destination)</Popup>
            </Marker>

            {restaurants.map((r) => {
                if (r.location?.lat == null || r.location?.lng == null) return null;
                const isSelected = r.place_id === selectedId;
                return (
                    <Marker
                        key={r.place_id}
                        position={[r.location.lat, r.location.lng]}
                        icon={isSelected ? selectedIcon : restaurantIcon}
                        eventHandlers={{
                            click: () => onSelectRestaurant(isSelected ? null : r.place_id),
                        }}
                    >
                        <Popup>
                            <strong>{r.name}</strong>
                            {r.rating && <span> — ★ {r.rating}</span>}
                            {r.distance_text && <><br />{r.distance_text}</>}
                            {r.price_level && <> · {r.price_level}</>}
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
