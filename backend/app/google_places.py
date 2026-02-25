"""
Google Places API Wrapper Service
Handles HTTP requests to Google Places (v1) API for destination search
"""

import os
import requests
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

class GooglePlacesService:
    """
    Service class for interacting with Google Places (v1) API
    """
    
    BASE_URL = "https://places.googleapis.com/v1"
    
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_MAPS_API")
        if not self.api_key or self.api_key == "your_google_maps_api_here":
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
                "X-Goog-Api-Key": self.api_key
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
    
    def _format_places(self, places: List[Dict]) -> List[Dict]:
        """
        Format raw Google Places (v1) API results into a cleaner structure
        """
        formatted = []
        
        for place in places:
            # Get photo URL if available
            photo_url = None
            if place.get("photos") and len(place["photos"]) > 0:
                photo_ref = place["photos"][0].get("name")
                if photo_ref and self.api_key:
                    # New API uses a different photo endpoint
                    photo_url = f"{self.BASE_URL}/{photo_ref}/media?maxHeightPx=400&maxWidthPx=400&key={self.api_key}"
            
            formatted.append({
                "place_id": place.get("id") or place.get("name", ""),
                "name": place.get("displayName", {}).get("text", place.get("name", "")),
                "address": place.get("formattedAddress"),
                "rating": place.get("rating"),
                "user_ratings_total": place.get("userRatingCount"),
                "types": place.get("types", []),
                "photo_url": photo_url,
                "location": {
                    "lat": place.get("location", {}).get("latitude"),
                    "lng": place.get("location", {}).get("longitude")
                },
                "business_status": place.get("businessStatus")
            })
        
        return formatted
    
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
    
    def clear_cache(self):
        """Clear all cached results"""
        self._cache.clear()
        print("[Cache] Cleared all cached results")


# Global instance
_places_service = GooglePlacesService()

def get_places_service() -> GooglePlacesService:
    """Get the global GooglePlacesService instance"""
    return _places_service
