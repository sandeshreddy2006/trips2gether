"""
Google Places API Wrapper Service
Handles HTTP requests to Google Places (v1) API for destination search
"""

import os
import math
import requests
from urllib.parse import quote_plus
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in km between two lat/lng points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

class GooglePlacesService:
    """
    Service class for interacting with Google Places (v1) API
    """
    
    BASE_URL = "https://places.googleapis.com/v1"
    _PRICE_LEVEL_MAP = {
        "PRICE_LEVEL_FREE": "Free", #lowkey this will never be used
        "PRICE_LEVEL_INEXPENSIVE": "$",
        "PRICE_LEVEL_MODERATE": "$$",
        "PRICE_LEVEL_EXPENSIVE": "$$$",
        "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
    }
    
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_PLACES_API")
        if not self.api_key or self.api_key == "your_google_places_api_here":
            print("[WARNING] Google Places API key not configured. Will use dummy data mode.")
            self.api_key = None
        else:
            print(f"[INFO] Google Places API key loaded. Using Google Places API v1 for destination search.")
        
        # Simple in-memory cache
        self._cache: Dict[str, tuple[List[Dict], datetime]] = {}
        self._cache_ttl = timedelta(hours=1)  # Cache results for 1 hour
    
    def _get_from_cache(self, query: str) -> Optional[List[Dict]]:
        """Get cached results if they exist and aren't expired"""
        if query in self._cache:
            results, timestamp = self._cache[query]
            if datetime.now() - timestamp < self._cache_ttl:
                print(f"[Cache Hit] Returning cached results for query: {query}")
                return results
            else:
                # Cache expired, remove it
                del self._cache[query]
        return None
    
    def _save_to_cache(self, query: str, results: List[Dict]):
        """Save results to cache"""
        self._cache[query] = (results, datetime.now())
    
    def search_destinations(self, query: str) -> Dict[str, Any]:
        """
        Search for destinations using Google Places (v1) API Text Search
        
        Args:
            query: Search query string (e.g., "Paris", "beach destinations", "Tokyo restaurants")
        
        Returns:
            Dict containing status, results, and optional error message
        """
        if not query or not query.strip():
            return {
                "status": "error",
                "message": "Search query cannot be empty",
                "results": []
            }
        
        query = query.strip()
        
        # Check cache first
        cached_results = self._get_from_cache(query)
        if cached_results is not None:
            return {
                "status": "success",
                "results": cached_results,
                "cached": True,
                "message": "Results loaded from cache"
            }
        
        # If no API key, return dummy data for development
        if not self.api_key:
            return self._get_dummy_data(query)
        
        try:
            # Make request to Google Places (v1) API Text Search endpoint
            url = f"{self.BASE_URL}/places:searchText"
            
            headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.id,places.photos,places.types,places.businessStatus"
            }
            
            payload = {
                "textQuery": query,
                "maxResultCount": 10,
                "languageCode": "en"
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            # Check if we got an error response
            if "error" in data:
                error_msg = data["error"].get("message", "Unknown error from Google Places API")
                print(f"[ERROR] API Error: {error_msg}")
                return {
                    "status": "error",
                    "message": f"Google Places API error: {error_msg}",
                    "results": []
                }
            
            # Parse and format results
            places = data.get("places", [])
            
            if not places:
                return {
                    "status": "success",
                    "results": [],
                    "message": "No destinations found"
                }
            
            results = self._format_places(places)
            
            # Cache the results
            self._save_to_cache(query, results)
            
            return {
                "status": "success",
                "results": results,
                "cached": False
            }
            
        except requests.exceptions.Timeout:
            print("[ERROR] API request timed out")
            return {
                "status": "error",
                "message": "Request to Google Places API timed out. Please try again.",
                "results": []
            }
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Failed to connect to Google Places API: {str(e)}")
            return {
                "status": "error",
                "message": f"Failed to connect to Google Places API: {str(e)}",
                "results": []
            }
        except Exception as e:
            print(f"[ERROR] Unexpected error in search_destinations: {str(e)}")
            return {
                "status": "error",
                "message": f"Unexpected error: {str(e)}",
                "results": []
            }

    def search_hotels(
        self,
        destination: str,
        check_in: str,
        check_out: str,
        guests: int,
        rooms: int,
        sort_by: str = "relevance",
    ) -> Dict[str, Any]:
        """Search hotels in a destination and return normalized hotel options."""
        cache_key = (
            f"hotel_search_{destination.lower()}_{check_in}_{check_out}_"
            f"{guests}_{rooms}_{sort_by}"
        )
        cached = self._get_from_cache(cache_key)
        if cached is not None:
            return {
                "status": "success",
                "results": cached,
                "cached": True,
                "message": "Results loaded from cache",
            }

        if not self.api_key:
            return self._get_dummy_hotels(destination, sort_by)

        try:
            url = f"{self.BASE_URL}/places:searchText"
            headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.displayName,places.formattedAddress,"
                    "places.rating,places.userRatingCount,places.location,"
                    "places.photos,places.types,places.businessStatus,"
                    "places.priceLevel,places.websiteUri,places.googleMapsUri"
                ),
            }
            payload = {
                "textQuery": f"hotels in {destination}",
                "maxResultCount": 20,
                "languageCode": "en",
            }

            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()

            if "error" in data:
                error_msg = data["error"].get("message", "Unknown error from Google Places API")
                return {
                    "status": "error",
                    "message": f"Google Places API error: {error_msg}",
                    "results": [],
                }

            places = data.get("places", [])
            hotels = self._format_hotels(places)
            hotels = self._sort_hotels(hotels, sort_by)
            self._save_to_cache(cache_key, hotels)

            return {
                "status": "success",
                "results": hotels,
                "cached": False,
                "message": "No hotels found" if not hotels else None,
            }

        except requests.exceptions.Timeout:
            print("[ERROR] Hotel search timed out")
            return {
                "status": "unavailable",
                "message": "Service unavailable. Hotel provider timed out.",
                "results": [],
            }
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Hotel search failed: {e}")
            return {
                "status": "unavailable",
                "message": "Service unavailable. Could not reach hotel provider.",
                "results": [],
            }
        except Exception as e:
            print(f"[ERROR] Unexpected error in search_hotels: {e}")
            return {
                "status": "error",
                "message": f"Unexpected error: {e}",
                "results": [],
            }

    def _format_hotels(self, places: List[Dict]) -> List[Dict]:
        """Normalize Google Places text search results into hotel options."""
        hotels: List[Dict] = []
        for place in places:
            types = place.get("types", [])
            if "lodging" not in types and "hotel" not in types:
                # Keep the response focused on accommodation options only.
                continue

            photo_url = None
            photo_reference = None
            if place.get("photos"):
                ref = place["photos"][0].get("name")
                if ref:
                    photo_reference = ref
                    photo_url = self.get_photo_url(ref, width=800, height=600)

            lat = place.get("location", {}).get("latitude")
            lng = place.get("location", {}).get("longitude")

            hotels.append(
                {
                    "place_id": place.get("id", ""),
                    "name": place.get("displayName", {}).get("text", ""),
                    "address": place.get("formattedAddress"),
                    "rating": place.get("rating"),
                    "user_ratings_total": place.get("userRatingCount"),
                    "price_level": self._PRICE_LEVEL_MAP.get(place.get("priceLevel")),
                    "types": types,
                    "photo_url": photo_url,
                    "photo_reference": photo_reference,
                    "location": {"lat": lat, "lng": lng},
                    "business_status": place.get("businessStatus"),
                    "website": place.get("websiteUri"),
                    "google_maps_url": place.get("googleMapsUri"),
                }
            )
        return hotels

    @staticmethod
    def _sort_hotels(hotels: List[Dict], sort_by: str) -> List[Dict]:
        if sort_by == "rating_desc":
            return sorted(hotels, key=lambda h: (h.get("rating") or 0, h.get("user_ratings_total") or 0), reverse=True)
        if sort_by == "reviews_desc":
            return sorted(hotels, key=lambda h: h.get("user_ratings_total") or 0, reverse=True)
        return hotels

    def _get_dummy_hotels(self, destination: str, sort_by: str) -> Dict[str, Any]:
        """Return deterministic dummy hotels for local development."""
        city = destination.strip().title() or "Destination"
        dummy_hotels = [
            {
                "place_id": f"dummy_hotel_{city.lower()}_1",
                "name": f"{city} Grand Hotel",
                "address": f"12 Central Ave, {city}",
                "rating": 4.6,
                "user_ratings_total": 2140,
                "price_level": "$$$",
                "types": ["lodging", "hotel"],
                "photo_url": "https://via.placeholder.com/800x600?text=Hotel+1",
                "photo_reference": None,
                "location": {"lat": 40.7128, "lng": -74.0060},
                "business_status": "OPERATIONAL",
                "website": None,
                "google_maps_url": None,
            },
            {
                "place_id": f"dummy_hotel_{city.lower()}_2",
                "name": f"{city} Riverside Inn",
                "address": f"88 River Walk, {city}",
                "rating": 4.3,
                "user_ratings_total": 980,
                "price_level": "$$",
                "types": ["lodging", "inn"],
                "photo_url": "https://via.placeholder.com/800x600?text=Hotel+2",
                "photo_reference": None,
                "location": {"lat": 40.7210, "lng": -74.0019},
                "business_status": "OPERATIONAL",
                "website": None,
                "google_maps_url": None,
            },
            {
                "place_id": f"dummy_hotel_{city.lower()}_3",
                "name": f"{city} Budget Suites",
                "address": f"5 Market Street, {city}",
                "rating": 4.0,
                "user_ratings_total": 420,
                "price_level": "$",
                "types": ["lodging"],
                "photo_url": "https://via.placeholder.com/800x600?text=Hotel+3",
                "photo_reference": None,
                "location": {"lat": 40.7081, "lng": -74.0101},
                "business_status": "OPERATIONAL",
                "website": None,
                "google_maps_url": None,
            },
        ]
        sorted_hotels = self._sort_hotels(dummy_hotels, sort_by)
        return {
            "status": "success",
            "results": sorted_hotels,
            "dummy": True,
            "message": "Using dummy data (Google Places API key not configured)",
        }
    
    def _format_places(self, places: List[Dict]) -> List[Dict]:
        """
        Format raw Google Places (v1) API results into a cleaner structure
        """
        formatted = []
        
        for place in places:
            # Get photo URL and reference if available
            photo_url = None
            photo_reference = None
            if place.get("photos") and len(place["photos"]) > 0:
                photo_ref = place["photos"][0].get("name")
                if photo_ref:
                    photo_reference = photo_ref
                    if self.api_key:
                        # Generate high-quality photo URL for default display (800x600)
                        photo_url = self.get_photo_url(photo_ref, width=800, height=600)
            
            formatted.append({
                "place_id": place.get("id") or place.get("name", ""),
                "name": place.get("displayName", {}).get("text", place.get("name", "")),
                "address": place.get("formattedAddress"),
                "rating": place.get("rating"),
                "user_ratings_total": place.get("userRatingCount"),
                "types": place.get("types", []),
                "photo_url": photo_url,
                "photo_reference": photo_reference,
                "location": {
                    "lat": place.get("location", {}).get("latitude"),
                    "lng": place.get("location", {}).get("longitude")
                },
                "business_status": place.get("businessStatus")
            })
        
        return formatted
    
    def get_photo_url(self, photo_reference: str, width: int = 400, height: int = 400) -> Optional[str]:
        """
        Generate a photo URL with custom dimensions for the given photo reference.
        
        Args:
            photo_reference: Photo reference from Google Places API response
            width: Desired image width in pixels (maxWidthPx)
            height: Desired image height in pixels (maxHeightPx)
        
        Returns:
            Full photo URL with specified dimensions, or None if API key not configured
        """
        if not self.api_key or not photo_reference:
            return None
        
        return f"{self.BASE_URL}/{photo_reference}/media?maxHeightPx={height}&maxWidthPx={width}&key={self.api_key}"
    
    def _get_dummy_data(self, query: str) -> Dict[str, Any]:
        """
        Return dummy data for development when API key is not configured
        """
        query_lower = query.lower()
        
        # Return empty results for some queries to test "no results" scenario
        if "zzz" in query_lower or "test empty" in query_lower:
            return {
                "status": "success",
                "results": [],
                "message": "No destinations found",
                "dummy": True
            }
        
        # Return some dummy destinations
        dummy_destinations = [
            {
                "place_id": f"dummy_1_{query_lower}",
                "name": f"Beautiful {query.title()} Landmark",
                "address": f"123 Main St, {query.title()}, Country",
                "rating": 4.5,
                "user_ratings_total": 1250,
                "types": ["tourist_attraction", "point_of_interest"],
                "photo_url": "https://via.placeholder.com/400x300?text=Destination+1",
                "location": {"lat": 40.7128, "lng": -74.0060},
                "business_status": "OPERATIONAL"
            },
            {
                "place_id": f"dummy_2_{query_lower}",
                "name": f"{query.title()} City Center",
                "address": f"456 Central Ave, {query.title()}, Country",
                "rating": 4.2,
                "user_ratings_total": 890,
                "types": ["locality", "point_of_interest"],
                "photo_url": "https://via.placeholder.com/400x300?text=Destination+2",
                "location": {"lat": 40.7580, "lng": -73.9855},
                "business_status": "OPERATIONAL"
            },
            {
                "place_id": f"dummy_3_{query_lower}",
                "name": f"Historic {query.title()} District",
                "address": f"789 Historic Rd, {query.title()}, Country",
                "rating": 4.7,
                "user_ratings_total": 2100,
                "types": ["tourist_attraction", "point_of_interest"],
                "photo_url": "https://via.placeholder.com/400x300?text=Destination+3",
                "location": {"lat": 40.7489, "lng": -73.9680},
                "business_status": "OPERATIONAL"
            }
        ]
        
        return {
            "status": "success",
            "results": dummy_destinations,
            "dummy": True,
            "message": "Using dummy data (Google Places API key not configured)"
        }
    
    def apply_filters(
        self,
        results: List[Dict],
        min_rating: Optional[float] = None,
        place_types: Optional[List[str]] = None,
        max_results: int = 6
    ) -> List[Dict]:
        """
        Apply filters to destination results.
        
        Args:
            results: List of destination results to filter
            min_rating: Minimum rating threshold (0-5)
            place_types: List of place types to filter by (AND logic - must match at least one)
            max_results: Maximum number of results to return (default 6)
        
        Returns:
            Filtered list of destinations, max max_results items
        """
        filtered = results
        
        # Filter by minimum rating
        if min_rating is not None and min_rating > 0:
            filtered = [d for d in filtered if d.get("rating") and d["rating"] >= min_rating]
        
        # Filter by place types (AND logic - destination must have at least one matching type)
        if place_types and len(place_types) > 0:
            filtered = [
                d for d in filtered
                if any(ptype in d.get("types", []) for ptype in place_types)
            ]
        
        # Return max_results items
        return filtered[:max_results]
    
    def get_popular_destinations(self) -> Dict[str, Any]:
        """
        Get random popular destinations
        Used when no search query is provided
        """
        popular_queries = [
            "Paris tourist attractions",
            "Tokyo landmarks",
            "New York must-see",
            "London historic sites",
            "Barcelona beaches",
            "Dubai attractions"
        ]
        
        import random
        random_query = random.choice(popular_queries)
        return self.search_destinations(random_query)
    
    def get_nearby_destinations(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Get nearby destinations based on user coordinates
        Returns popular destinations as fallback since Nearby Search requires different API setup
        """
        # For now, return popular destinations regardless of coordinates
        # In production, this would use the Nearby Search endpoint
        return self.get_popular_destinations()

    # ------------------------------------------------------------------
    # Destination details
    # ------------------------------------------------------------------

    _DESTINATION_DETAIL_FIELD_MASK = (
        "id,displayName,formattedAddress,rating,userRatingCount,location,types,"
        "businessStatus,primaryTypeDisplayName,websiteUri,internationalPhoneNumber,"
        "editorialSummary,currentOpeningHours"
    )

    def get_destination_details(self, place_id: str) -> Dict[str, Any]:
        """Fetch full details for a destination/place by place ID."""
        cache_key = f"destination_detail_{place_id}"
        cached = self._get_from_cache(cache_key)
        if cached is not None:
            return {"status": "success", "result": cached, "cached": True}

        if not self.api_key:
            return self._get_dummy_destination_detail(place_id)

        try:
            url = f"{self.BASE_URL}/places/{place_id}"
            headers = {
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": self._DESTINATION_DETAIL_FIELD_MASK,
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()

            if "error" in data:
                msg = data["error"].get("message", "Unknown API error")
                return {"status": "error", "message": msg, "result": None}

            result = self._format_destination_detail(data)
            self._save_to_cache(cache_key, result)
            return {"status": "success", "result": result, "cached": False}

        except requests.exceptions.Timeout:
            return {"status": "error", "message": "Request timed out.", "result": None}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e), "result": None}
        except Exception as e:
            return {"status": "error", "message": f"Unexpected error: {e}", "result": None}

    def _format_destination_detail(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform raw Place Details response into our destination detail shape."""
        loc = data.get("location", {})
        primary_type = data.get("primaryTypeDisplayName", {})
        opening = data.get("currentOpeningHours", {})

        return {
            "place_id": data.get("id", ""),
            "name": data.get("displayName", {}).get("text", ""),
            "address": data.get("formattedAddress"),
            "rating": data.get("rating"),
            "user_ratings_total": data.get("userRatingCount"),
            "types": data.get("types", []),
            "business_status": data.get("businessStatus"),
            "primary_type_display_name": primary_type.get("text") if isinstance(primary_type, dict) else None,
            "location": {
                "lat": loc.get("latitude"),
                "lng": loc.get("longitude"),
            },
            "website": data.get("websiteUri"),
            "phone": data.get("internationalPhoneNumber"),
            "editorial_summary": (data.get("editorialSummary") or {}).get("text"),
            "weekday_descriptions": opening.get("weekdayDescriptions", []) if isinstance(opening, dict) else [],
        }

    def _get_dummy_destination_detail(self, place_id: str) -> Dict[str, Any]:
        """Dummy destination detail for local dev without API key."""
        result = {
            "place_id": place_id,
            "name": "Destination",
            "address": None,
            "rating": None,
            "user_ratings_total": None,
            "types": [],
            "business_status": None,
            "primary_type_display_name": None,
            "location": {"lat": None, "lng": None},
            "website": None,
            "phone": None,
            "editorial_summary": None,
            "weekday_descriptions": [],
        }
        return {"status": "success", "result": result, "dummy": True}
    
    # ------------------------------------------------------------------
    # Nearby restaurants
    # ------------------------------------------------------------------

    def search_nearby_restaurants(
        self,
        lat: float,
        lng: float,
        radius_m: int = 1500,
    ) -> Dict[str, Any]:
        """
        Search for restaurants near a given coordinate using the
        Google Places (v1) Nearby Search endpoint.

        Returns a dict with status, results (sorted by distance), and
        metadata about the anchor/radius used.
        """
        cache_key = f"nearby_restaurants_{lat:.5f}_{lng:.5f}_{radius_m}"
        cached = self._get_from_cache(cache_key)
        if cached is not None:
            return {
                "status": "success",
                "results": cached,
                "cached": True,
                "anchor_lat": lat,
                "anchor_lng": lng,
                "radius_m": radius_m,
            }

        if not self.api_key:
            return self._get_dummy_nearby_restaurants(lat, lng, radius_m)

        try:
            url = f"{self.BASE_URL}/places:searchNearby"
            headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": (
                    "places.displayName,places.formattedAddress,places.rating,"
                    "places.userRatingCount,places.location,places.id,"
                    "places.photos,places.priceLevel,places.primaryType"
                ),
            }
            payload = {
                "includedTypes": ["restaurant"],
                "maxResultCount": 20,
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": float(radius_m),
                    }
                },
                "languageCode": "en",
            }

            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()

            if "error" in data:
                msg = data["error"].get("message", "Unknown API error")
                print(f"[ERROR] Nearby restaurants API error: {msg}")
                return {"status": "error", "message": msg, "results": []}

            places = data.get("places", [])
            if not places:
                return {
                    "status": "success",
                    "results": [],
                    "message": "No restaurants found nearby",
                    "anchor_lat": lat,
                    "anchor_lng": lng,
                    "radius_m": radius_m,
                }

            results = self._format_nearby_restaurants(places, lat, lng)
            self._save_to_cache(cache_key, results)

            return {
                "status": "success",
                "results": results,
                "cached": False,
                "anchor_lat": lat,
                "anchor_lng": lng,
                "radius_m": radius_m,
            }

        except requests.exceptions.Timeout:
            print("[ERROR] Nearby restaurants request timed out")
            return {
                "status": "error",
                "message": "Request timed out. Please try again.",
                "results": [],
            }
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Nearby restaurants request failed: {e}")
            return {
                "status": "error",
                "message": f"Failed to reach restaurant service: {e}",
                "results": [],
            }
        except Exception as e:
            print(f"[ERROR] Unexpected error in search_nearby_restaurants: {e}")
            return {
                "status": "error",
                "message": f"Unexpected error: {e}",
                "results": [],
            }

    def _format_nearby_restaurants(
        self, places: List[Dict], anchor_lat: float, anchor_lng: float
    ) -> List[Dict]:
        """Format Nearby Search results and compute distance from anchor."""
        PRICE_MAP = {
            "PRICE_LEVEL_FREE": "Free",
            "PRICE_LEVEL_INEXPENSIVE": "$",
            "PRICE_LEVEL_MODERATE": "$$",
            "PRICE_LEVEL_EXPENSIVE": "$$$",
            "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
        }
        formatted = []
        for place in places:
            photo_url = None
            photo_reference = None
            if place.get("photos"):
                ref = place["photos"][0].get("name")
                if ref:
                    photo_reference = ref
                    if self.api_key:
                        photo_url = self.get_photo_url(ref, width=400, height=300)

            p_lat = place.get("location", {}).get("latitude")
            p_lng = place.get("location", {}).get("longitude")
            dist_km = (
                _haversine_km(anchor_lat, anchor_lng, p_lat, p_lng)
                if p_lat is not None and p_lng is not None
                else None
            )
            if dist_km is not None:
                dist_text = (
                    f"{int(dist_km * 1000)} m"
                    if dist_km < 1
                    else f"{dist_km:.1f} km"
                )
            else:
                dist_text = None

            raw_price = place.get("priceLevel")
            price_level = PRICE_MAP.get(raw_price)

            primary = place.get("primaryType", "")
            cuisine_labels = self._extract_cuisine_types([primary]) if primary else []
            cuisine_type = cuisine_labels[0] if cuisine_labels else None

            formatted.append({
                "place_id": place.get("id", ""),
                "name": place.get("displayName", {}).get("text", ""),
                "address": place.get("formattedAddress"),
                "rating": place.get("rating"),
                "user_ratings_total": place.get("userRatingCount"),
                "price_level": price_level,
                "cuisine_type": cuisine_type,
                "distance_km": round(dist_km, 2) if dist_km is not None else None,
                "distance_text": dist_text,
                "location": {"lat": p_lat, "lng": p_lng},
                "photo_url": photo_url,
                "photo_reference": photo_reference,
            })

        formatted.sort(key=lambda r: r["distance_km"] if r["distance_km"] is not None else 999)
        return formatted

    def _get_dummy_nearby_restaurants(
        self, lat: float, lng: float, radius_m: int
    ) -> Dict[str, Any]:
        """Dummy restaurant data for local dev without an API key."""
        import random
        dummy_items = [
            ("The Golden Fork", "Italian"),
            ("Sakura Sushi", "Japanese"),
            ("Bella Pasta", "Italian"),
            ("Green Leaf Bistro", "Vegan"),
            ("Smoky BBQ Pit", "Barbecue"),
            ("Curry House", "Indian"),
        ]
        prices = ["$", "$$", "$$$"]
        results = []
        for i, (name, cuisine) in enumerate(dummy_items):
            offset_lat = random.uniform(-0.005, 0.005)
            offset_lng = random.uniform(-0.005, 0.005)
            p_lat = lat + offset_lat
            p_lng = lng + offset_lng
            dist = _haversine_km(lat, lng, p_lat, p_lng)
            results.append({
                "place_id": f"dummy_rest_{i}",
                "name": name,
                "address": f"{100 + i * 10} Food Street",
                "rating": round(random.uniform(3.5, 4.9), 1),
                "user_ratings_total": random.randint(50, 2000),
                "price_level": random.choice(prices),
                "cuisine_type": cuisine,
                "distance_km": round(dist, 2),
                "distance_text": f"{int(dist * 1000)} m" if dist < 1 else f"{dist:.1f} km",
                "location": {"lat": p_lat, "lng": p_lng},
                "photo_url": f"https://via.placeholder.com/400x300?text={name.replace(' ', '+')}",
                "photo_reference": None,
            })
        results.sort(key=lambda r: r["distance_km"])
        return {
            "status": "success",
            "results": results,
            "dummy": True,
            "message": "Using dummy data (API key not configured)",
            "anchor_lat": lat,
            "anchor_lng": lng,
            "radius_m": radius_m,
        }

    # ------------------------------------------------------------------
    # Restaurant details
    # ------------------------------------------------------------------

    _DETAIL_FIELD_MASK = (
        "displayName,formattedAddress,rating,userRatingCount,location,photos,"
        "priceLevel,primaryType,primaryTypeDisplayName,types,"
        "currentOpeningHours,regularOpeningHours,websiteUri,"
        "internationalPhoneNumber,editorialSummary,"
        "googleMapsUri,reservable"
    )

    def get_restaurant_details(self, place_id: str) -> Dict[str, Any]:
        """Fetch full details for a single restaurant by place ID."""
        cache_key = f"restaurant_detail_{place_id}"
        cached = self._get_from_cache(cache_key)
        if cached is not None:
            return {"status": "success", "result": cached, "cached": True}

        if not self.api_key:
            return self._get_dummy_restaurant_detail(place_id)

        try:
            url = f"{self.BASE_URL}/places/{place_id}"
            headers = {
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": self._DETAIL_FIELD_MASK,
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()

            if "error" in data:
                msg = data["error"].get("message", "Unknown API error")
                return {"status": "error", "message": msg, "result": None}

            result = self._format_restaurant_detail(data)
            self._save_to_cache(cache_key, result)
            return {"status": "success", "result": result, "cached": False}

        except requests.exceptions.Timeout:
            return {"status": "error", "message": "Request timed out.", "result": None}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e), "result": None}
        except Exception as e:
            return {"status": "error", "message": f"Unexpected error: {e}", "result": None}

    def _format_restaurant_detail(self, data: Dict) -> Dict:
        """Transform raw Place Details response into our schema shape."""
        photo_urls: List[str] = []
        for photo in (data.get("photos") or [])[:3]:
            ref = photo.get("name")
            if ref and self.api_key:
                photo_urls.append(self.get_photo_url(ref, width=600, height=400))

        raw_price = data.get("priceLevel")
        price_level = self._PRICE_LEVEL_MAP.get(raw_price)

        cuisine_types = self._extract_cuisine_types(data.get("types", []))

        opening_hours = self._parse_opening_hours(
            data.get("currentOpeningHours") or data.get("regularOpeningHours")
        )

        loc = data.get("location", {})

        name = data.get("displayName", {}).get("text", "")
        address = data.get("formattedAddress")
        ext_urls = self._build_external_urls(name, address)

        return {
            "place_id": data.get("id", ""),
            "name": name,
            "address": address,
            "rating": data.get("rating"),
            "user_ratings_total": data.get("userRatingCount"),
            "price_level": price_level,
            "cuisine_types": cuisine_types,
            "location": {
                "lat": loc.get("latitude"),
                "lng": loc.get("longitude"),
            },
            "photo_urls": photo_urls,
            "opening_hours": opening_hours,
            "phone": data.get("internationalPhoneNumber"),
            "website": data.get("websiteUri"),
            "editorial_summary": (data.get("editorialSummary") or {}).get("text"),
            "google_maps_url": data.get("googleMapsUri"),
            "reservable": data.get("reservable", False),
            "yelp_url": ext_urls.get("yelp_url"),
            "opentable_url": ext_urls.get("opentable_url"),
        }

    @staticmethod
    def _build_external_urls(name: str, address: Optional[str]) -> Dict[str, Optional[str]]:
        """Construct Yelp and OpenTable search URLs from restaurant name/address."""
        yelp_url = None
        opentable_url = None
        if name:
            opentable_url = f"https://www.opentable.com/s?term={quote_plus(name)}&covers=2"
            if address:
                yelp_url = f"https://www.yelp.com/search?find_desc={quote_plus(name)}&find_loc={quote_plus(address)}"
            else:
                yelp_url = f"https://www.yelp.com/search?find_desc={quote_plus(name)}"
        return {"yelp_url": yelp_url, "opentable_url": opentable_url}

    @staticmethod
    def _extract_cuisine_types(types: List[str]) -> List[str]:
        """Pick human-friendly cuisine/food labels from Place types."""
        skip = {
            "restaurant", "food", "point_of_interest", "establishment",
            "meal_delivery", "meal_takeaway", "store",
        }
        formatted = []
        for t in types:
            if t in skip:
                continue
            label = t.replace("_", " ").title()
            formatted.append(label)
        return formatted[:6]

    @staticmethod
    def _parse_opening_hours(hours_data: Optional[Dict]) -> Optional[Dict]:
        """Parse opening hours into a frontend-friendly structure."""
        if not hours_data:
            return None

        weekday_descriptions = hours_data.get("weekdayDescriptions", [])
        open_now = hours_data.get("openNow")

        periods = []
        for p in hours_data.get("periods", []):
            o = p.get("open", {})
            c = p.get("close", {})
            periods.append({
                "open_day": o.get("day"),
                "open_time": f"{o.get('hour', 0):02d}:{o.get('minute', 0):02d}" if o.get("hour") is not None else None,
                "close_day": c.get("day"),
                "close_time": f"{c.get('hour', 0):02d}:{c.get('minute', 0):02d}" if c.get("hour") is not None else None,
            })

        return {
            "open_now": open_now,
            "weekday_descriptions": weekday_descriptions,
            "periods": periods,
        }

    def _get_dummy_restaurant_detail(self, place_id: str) -> Dict[str, Any]:
        """Dummy restaurant detail for local dev."""
        result = {
            "place_id": place_id,
            "name": "The Golden Fork",
            "address": "123 Food Street, Culinary District",
            "rating": 4.3,
            "user_ratings_total": 874,
            "price_level": "$$",
            "cuisine_types": ["Italian", "Mediterranean", "Pizza"],
            "location": {"lat": 40.7128, "lng": -74.0060},
            "photo_urls": [
                "https://via.placeholder.com/600x400?text=Restaurant+1",
                "https://via.placeholder.com/600x400?text=Restaurant+2",
            ],
            "opening_hours": {
                "open_now": True,
                "weekday_descriptions": [
                    "Monday: 11:00 AM – 10:00 PM",
                    "Tuesday: 11:00 AM – 10:00 PM",
                    "Wednesday: 11:00 AM – 10:00 PM",
                    "Thursday: 11:00 AM – 11:00 PM",
                    "Friday: 11:00 AM – 11:30 PM",
                    "Saturday: 10:00 AM – 11:30 PM",
                    "Sunday: 10:00 AM – 9:00 PM",
                ],
                "periods": [],
            },
            "phone": "+1 555-123-4567",
            "website": "https://example.com",
            "editorial_summary": "A cozy Italian restaurant known for its wood-fired pizzas and fresh pasta.",
            "google_maps_url": "https://maps.google.com/?cid=1234567890",
            "reservable": True,
            "yelp_url": "https://www.yelp.com/search?find_desc=The+Golden+Fork&find_loc=123+Food+Street",
            "opentable_url": "https://www.opentable.com/s?term=The+Golden+Fork&covers=2",
        }
        return {"status": "success", "result": result, "dummy": True}

    def clear_cache(self):
        """Clear all cached results"""
        self._cache.clear()
        print("[Cache] Cleared all cached results")


# Global instance
_places_service = GooglePlacesService()

def get_places_service() -> GooglePlacesService:
    """Get the global GooglePlacesService instance"""
    return _places_service
