import hashlib
import re
import time

import requests

from config import Config


class CoverArt:
    def __init__(self):
        self.config = Config()
        self.cache = {}  # Memory cache for recently fetched cover art URLs
        self.cache_ttl = 3600  # Cache TTL in seconds (1 hour)

    def fetch(self, media_info):
        """Fetch cover art URL using all available media information

        Args:
            media_info: Dictionary containing media metadata (can be the full media dict or just media section)

        Returns:
            str: URL to cover art or None if not found
        """
        # Extract media data from input
        media = self._extract_media_data(media_info)
        if not media:
            return None

        # Create a cache key for this request
        cache_key = self._create_cache_key(media)
        if cache_key in self.cache:
            cached_result = self.cache[cache_key]
            if time.time() - cached_result["timestamp"] < self.cache_ttl:
                self.config.logger.debug(
                    f"Using cached cover art URL: {cached_result['url']}"
                )
                return cached_result["url"]

        # Try to fetch from MusicBrainz
        cover_url = self._fetch_from_musicbrainz(media)

        # Cache the result (even if None, to avoid repeated failed lookups)
        if cache_key:
            self.cache[cache_key] = {"url": cover_url, "timestamp": time.time()}

        return cover_url

    def _extract_media_data(self, media_info):
        """Extract media data from the input dictionary"""
        if not media_info or not isinstance(media_info, dict):
            self.config.logger.debug("No valid media info provided for cover art")
            return None

        # Handle both full status object or just the media section
        if "media" in media_info:
            return media_info["media"]
        return media_info

    def _create_cache_key(self, media):
        """Create a unique cache key based on media information"""
        if not media:
            return None

        key_parts = []

        # Use the most identifying fields for the cache key
        for field in ["artist", "album", "title"]:
            if field in media and media[field]:
                key_parts.append(f"{field}:{media[field]}")

        if not key_parts:
            return None

        # Create a hash of the key parts
        return hashlib.md5("|".join(key_parts).encode("utf-8")).hexdigest()

    def _build_query(self, media):
        """Build the optimal MusicBrainz query based on available information"""
        # Case 1: We have artist, title and album - most specific search
        if media.get("artist") and media.get("title") and media.get("album"):
            return f'{media["title"]} AND artist:{media["artist"]} AND release:"{media["album"]}"'

        # Case 2: We have artist and title - good for recording search
        if media.get("artist") and media.get("title"):
            return f'{media["title"]} AND artist:{media["artist"]}'

        # Case 3: We have artist and album - good for release search
        if media.get("artist") and media.get("album"):
            return f'artist:"{media["artist"]}" AND release:"{media["album"]}"'

        # Case 4: We have just album
        if media.get("album"):
            return f'release:"{media["album"]}"'

        # Case 5: We have just artist
        if media.get("artist"):
            return f'artist:"{media["artist"]}"'

        # Case 6: We have just title
        if media.get("title"):
            return f'recording:"{media["title"]}"'

        # No useful information
        self.config.logger.debug("Insufficient media information for cover art search")
        return None

    def _fetch_from_musicbrainz(self, media):
        """Fetch cover art from MusicBrainz using multiple strategies"""
        try:
            # Build the query
            query = self._build_query(media)
            if not query:
                return None

            # Strategy 1: Try the most specific endpoint based on available data
            if media.get("album") and (media.get("artist") or media.get("title")):
                # If we have album info, prioritize release search
                url = self._search_releases(query, media)
                if url:
                    return url

            # Strategy 2: If we have title and artist but no album match, try recordings
            if media.get("title") and media.get("artist"):
                url = self._search_recordings(query, media)
                if url:
                    return url

            # Strategy 3: If all else fails, try a more generic search
            fallback_query = self._build_fallback_query(media)
            if fallback_query and fallback_query != query:
                self.config.logger.debug(f"Trying fallback search: {fallback_query}")
                url = self._search_releases(fallback_query, media)
                if url:
                    return url

            return None

        except Exception as e:
            self.config.logger.error(f"Error in MusicBrainz lookup: {e}", exc_info=True)
            return None

    def _build_fallback_query(self, media):
        """Build a fallback query with less constraints"""
        if media.get("artist") and media.get("title"):
            # Just use artist without title constraints
            return f'artist:"{media["artist"]}"'
        return None

    def _search_releases(self, query, media):
        """Search for releases and get the best match"""
        self.config.logger.debug(f"Searching MusicBrainz releases with: {query}")

        search_url = "https://musicbrainz.org/ws/2/release"
        params = {"query": query, "fmt": "json", "limit": 10}

        response = self._make_request(search_url, params)
        if not response:
            return None

        return self._process_release_response(response, media)

    def _search_recordings(self, query, media):
        """Search for recordings and get the best match"""
        self.config.logger.debug(f"Searching MusicBrainz recordings with: {query}")

        search_url = "https://musicbrainz.org/ws/2/recording"
        params = {"query": query, "fmt": "json", "limit": 10}

        response = self._make_request(search_url, params)
        if not response:
            return None

        return self._process_recording_response(response, media)

    def _process_recording_response(self, response, media):
        """Process MusicBrainz recording response and extract cover URL"""
        try:
            data = response.json()

            if not data.get("recordings") or len(data["recordings"]) == 0:
                self.config.logger.debug("No recordings found in MusicBrainz response")
                return None

            # Score and sort recordings
            scored_releases = []

            for recording in data["recordings"]:
                if not recording.get("releases") or len(recording["releases"]) == 0:
                    continue

                # Calculate match score for each release of this recording
                for release in recording["releases"]:
                    score = self._calculate_release_score(recording, release, media)
                    scored_releases.append(
                        {
                            "score": score,
                            "release_id": release["id"],
                            "release_title": release.get("title", ""),
                            "artist": recording.get("artist-credit", [{}])[0].get(
                                "name", ""
                            ),
                        }
                    )

            # Sort by score (highest first)
            scored_releases.sort(key=lambda x: x["score"], reverse=True)

            # Try releases in order until we find cover art
            for release_info in scored_releases:
                if release_info["score"] < 30:  # Skip low-quality matches
                    continue

                self.config.logger.debug(
                    f"Trying release: '{release_info['release_title']}' by '{release_info['artist']}' (score: {release_info['score']})"
                )

                cover_url = f"https://coverartarchive.org/release/{release_info['release_id']}/front-500"
                head_response = self._make_request(cover_url, {}, method="HEAD")

                if head_response:
                    self.config.logger.debug(f"Found cover art: {cover_url}")
                    return cover_url

            self.config.logger.debug("No suitable cover art found for recording")
            return None

        except Exception as e:
            self.config.logger.error(f"Error processing recording response: {e}")
            return None

    def _process_release_response(self, response, media):
        """Process MusicBrainz release response and extract cover URL"""
        try:
            data = response.json()

            if not data.get("releases") or len(data["releases"]) == 0:
                self.config.logger.debug("No releases found in MusicBrainz response")
                return None

            # Score and sort releases
            scored_releases = []

            for release in data["releases"]:
                score = self._calculate_release_score(None, release, media)
                scored_releases.append(
                    {
                        "score": score,
                        "release_id": release["id"],
                        "release_title": release.get("title", ""),
                        "artist": release.get("artist-credit", [{}])[0].get("name", ""),
                    }
                )

            # Sort by score (highest first)
            scored_releases.sort(key=lambda x: x["score"], reverse=True)

            # Try releases in order until we find cover art
            for release_info in scored_releases:
                if release_info["score"] < 30:  # Skip low-quality matches
                    continue

                self.config.logger.debug(
                    f"Trying release: '{release_info['release_title']}' by '{release_info['artist']}' (score: {release_info['score']})"
                )

                cover_url = f"https://coverartarchive.org/release/{release_info['release_id']}/front-500"
                head_response = self._make_request(cover_url, {}, method="HEAD")

                if head_response:
                    self.config.logger.debug(f"Found cover art: {cover_url}")
                    return cover_url

            self.config.logger.debug("No suitable cover art found for releases")
            return None

        except Exception as e:
            self.config.logger.error(f"Error processing release response: {e}")
            return None

    def _calculate_release_score(self, recording, release, media):
        """Calculate a match score for a release based on our metadata"""
        score = 0

        # Basic score from API
        base_score = recording.get("score", release.get("score", 0))
        score += min(base_score, 100)  # Cap at 100 to avoid overweighting

        # Artist matching (up to 100 points)
        if media.get("artist"):
            artist_names = []
            for artist_credit in release.get("artist-credit", []):
                if isinstance(artist_credit, dict) and "artist" in artist_credit:
                    artist_names.append(artist_credit.get("name", "").lower())
                    # Also check aliases
                    for alias in artist_credit.get("artist", {}).get("aliases", []):
                        if isinstance(alias, dict):
                            artist_names.append(alias.get("name", "").lower())

            media_artist = media["artist"].lower()
            if any(self._fuzzy_match(media_artist, name) for name in artist_names):
                score += 100
            elif any(
                media_artist in name or name in media_artist for name in artist_names
            ):
                score += 70

        # Album matching (up to 100 points)
        if media.get("album") and release.get("title"):
            media_album = media["album"].lower()
            release_title = release["title"].lower()

            if self._fuzzy_match(media_album, release_title):
                score += 100
            elif media_album in release_title or release_title in media_album:
                score += 70

        # Title matching for recordings (up to 80 points)
        if media.get("title") and recording and recording.get("title"):
            media_title = media["title"].lower()
            recording_title = recording["title"].lower()

            if self._fuzzy_match(media_title, recording_title):
                score += 80
            elif media_title in recording_title or recording_title in media_title:
                score += 50

        # Match on date/year (up to 40 points)
        if media.get("date") or media.get("year"):
            media_year = str(media.get("date") or media.get("year"))
            if len(media_year) >= 4:
                media_year = media_year[:4]  # First 4 chars

                release_date = release.get("date", "")
                if release_date and release_date.startswith(media_year):
                    score += 40

        # Prefer official releases over bootlegs, live albums, etc. (up to 30 points)
        if release.get("status") == "Official":
            score += 30

        # Penalize secondary release types like compilations, live albums when we're looking for studio
        secondary_types = []
        if release.get("release-group", {}).get("secondary-types"):
            secondary_types = release["release-group"]["secondary-types"]
        elif release.get("release-group", {}).get("secondary-type-ids"):
            # We have the IDs but not the names
            has_secondary = bool(release["release-group"]["secondary-type-ids"])
            if has_secondary:
                score -= 20

        # Specific penalties
        if "Compilation" in secondary_types:
            score -= 15
        if "Live" in secondary_types:
            score -= 25
        if "Remix" in secondary_types:
            score -= 20

        return max(0, score)  # Ensure non-negative

    def _fuzzy_match(self, str1, str2):
        """Simple fuzzy matching for strings"""
        # Convert to lowercase and remove special chars for comparison
        s1 = re.sub(r"[^\w\s]", "", str1.lower())
        s2 = re.sub(r"[^\w\s]", "", str2.lower())

        # Exact match
        if s1 == s2:
            return True

        # Check for substring (with some flexibility)
        if len(s1) > 5 and len(s2) > 5:
            if s1 in s2 or s2 in s1:
                return True

        return False

    def _make_request(self, url, params, method="GET"):
        """Make an HTTP request with proper error handling"""
        try:
            response = requests.request(
                method,
                url,
                params=params,
                headers={
                    "User-Agent": "VLC-Discord-RP/1.0 (https://github.com/valeriko777/vlc-discord-rp)"
                },
                timeout=3,
            )

            if response.status_code == 200:
                return response
            else:
                self.config.logger.debug(
                    f"API request failed: {url} - Status {response.status_code}"
                )
                return None

        except requests.RequestException as e:
            self.config.logger.debug(f"Request failed: {e}")
            return None


if __name__ == "__main__":
    # Test with minimal information
    cover = CoverArt()

    # Test with artist and title
    print("Testing with artist and title:")
    url = cover.fetch({"artist": "Andy Montañez", "title": "Milonga para una niña"})
    print(f"Result: {url}")

    # Test with full media object
    print("\nTesting with full media object:")
    media_info = {
        "media": {
            "artist": "Pink Floyd",
            "album": "The Dark Side of the Moon",
            "title": "Money",
            "date": "1973",
        }
    }
    url = cover.fetch(media_info)
    print(f"Result: {url}")
