"""
VideoDetector Module
===================

This module provides functionality to analyze video filenames and detect content type and metadata.
It attempts to identify if a file is a TV show, movie, anime, or generic video based on filename
patterns and then fetches appropriate cover images from search engines.

Key features:
- Content type detection using regex patterns in filenames
- Metadata extraction (show name, season, episode, movie name, year, etc.)
- Title cleaning to improve detection accuracy
- Cover image retrieval from Google Images
- Support for various video formats and naming conventions

The main class VideoDetector handles the analysis process:
1. Extracts the video title from media information
2. Detects content type and metadata using regex patterns
3. Fetches an appropriate cover image based on the detected content
4. Returns enhanced media information with content type, metadata, and image URL

Usage example:
    detector = VideoDetector()
    result = detector.analyze({"media": {"title": "The.Office.S03E10.720p.HDTV.x264-DIMENSION.mkv"}})
"""

import re
import urllib.parse

import requests
from bs4 import BeautifulSoup

from config import Config


class VideoDetector:
	def __init__(self):
		self.config = Config()

	def analyze(self, media_info):
		"""
		Analyze video content and fetch an appropriate cover image

		Args:
		    media_info: Dictionary containing video metadata

		Returns:
		    dict: Enhanced media info with content type and image URL
		"""
		if not media_info:
			return media_info

		enhanced_info = dict(media_info)
		if not enhanced_info.get("media"):
			enhanced_info["media"] = {}

		media = enhanced_info.get("media", {})
		title = media.get("title", "")
		if not title:
			return enhanced_info

		content_type, metadata = self._detect_content_type(title)
		enhanced_info["content_type"] = content_type
		enhanced_info["content_metadata"] = metadata

		image_url = self._fetch_content_image(title, content_type, metadata)
		if image_url:
			enhanced_info["content_image_url"] = image_url

		return enhanced_info

	def _detect_content_type(self, title):
		"""
		Detect what type of content this video is based on filename patterns

		Returns:
		    tuple: (content_type, metadata_dict)
		"""
		clean_title = self._clean_title(title)
		metadata = {"original_title": title, "clean_title": clean_title}

		tv_patterns = [
			r"(.*?)[\.\s_-]*S(\d{1,2})[\.\s_-]*E(\d{1,2})",
			r"(.*?)[\.\s_-]*(\d{1,2})x(\d{1,2})",
			r"(.*?)[\.\s_-]*Season[\.\s_-]*(\d{1,2})[\.\s_-]*Episode[\.\s_-]*(\d{1,2})",
		]

		for pattern in tv_patterns:
			match = re.search(pattern, clean_title, re.IGNORECASE)
			if match:
				show_name = re.sub(r"[\._\-]", " ", match.group(1)).strip()
				metadata["show_name"] = show_name
				metadata["season"] = int(match.group(2))
				metadata["episode"] = int(match.group(3))
				return "tv_show", metadata

		movie_pattern = r"(.+?)[\.\s\[\(_-]+(19\d{2}|20\d{2})[\]\)\._\s-]"
		match = re.search(movie_pattern, clean_title)
		if match:
			movie_name = re.sub(r"[\._\-]", " ", match.group(1)).strip()
			metadata["movie_name"] = movie_name
			metadata["year"] = match.group(2)
			return "movie", metadata

		if "[" in clean_title and "]" in clean_title or re.search(r"\.(sub|dub)\.", clean_title, re.IGNORECASE):
			ep_match = re.search(r"[-\s\.\_](\d{1,3})[-\s\.\_]", clean_title)
			if ep_match:
				metadata["episode"] = int(ep_match.group(1))
				name_part = clean_title.split(ep_match.group(0))[0]
				anime_name = re.sub(r"\[.*?\]|\(.*?\)|[\._\-]", " ", name_part).strip()
				metadata["anime_name"] = anime_name
				return "anime", metadata

			anime_name = re.sub(r"\[.*?\]|\(.*?\)|[\._\-]", " ", clean_title).strip()
			metadata["anime_name"] = anime_name
			return "anime", metadata

		generic_name = re.sub(r"\[.*?\]|\(.*?\)|\.mkv|\.mp4|\.avi|[\._\-]", " ", clean_title).strip()
		metadata["title"] = generic_name
		return "video", metadata

	def _clean_title(self, title):
		title = re.sub(r"\.(mkv|mp4|avi|mov|wmv|flv|webm)$", "", title, flags=re.IGNORECASE)
		title = re.sub(r"(-[A-Za-z0-9]+|\d{3,4}p|x264|x265|HEVC|WEB-DL|BluRay|WEBRip)$", "", title)
		return title

	def _fetch_content_image(self, title, content_type, metadata):
		if content_type == "tv_show" and metadata.get("show_name"):
			search_term = f"{metadata['show_name']} tv show poster"
		elif content_type == "movie" and metadata.get("movie_name"):
			if metadata.get("year"):
				search_term = f"{metadata['movie_name']} {metadata['year']} movie poster"
			else:
				search_term = f"{metadata['movie_name']} movie poster"
		elif content_type == "anime" and metadata.get("anime_name"):
			search_term = f"{metadata['anime_name']} anime cover"
		else:
			search_term = f"{title} cover"

		return self._fetch_image_from_google(search_term)

	def _fetch_image_from_google(self, search_term):
		try:
			self.config.logger.debug(f"Searching Google Images for: {search_term}")
			encoded_query = urllib.parse.quote_plus(search_term)
			search_url = f"https://www.google.com/search?q={encoded_query}&tbm=isch"

			response = requests.get(
				search_url,
				headers={
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
					"Accept": "text/html,application/xhtml+xml",
				},
				timeout=5,
			)

			if not response.ok:
				return None

			soup = BeautifulSoup(response.text, "html.parser")

			for img in soup.select("img"):
				src = img.get("src", "")
				if src.startswith("http") and not src.endswith(".gif"):
					if "gstatic.com" in src:
						return src

			for script in soup.find_all("script"):
				if script.string and "AF_initDataCallback" in script.string:
					img_matches = re.findall(r"https?://\S+?\.(?:jpg|jpeg|png)", script.string)
					for img_url in img_matches:
						if not any(x in img_url.lower() for x in ["icon", "emoji", "favicon"]):
							return img_url

			return None

		except Exception as e:
			self.config.logger.error(f"Error fetching image: {e}")
			return None


if __name__ == "__main__":
	detector = VideoDetector()

	tv_show = {"media": {"title": "The.Office.S03E10.720p.HDTV.x264-DIMENSION.mkv"}}
	result = detector.analyze(tv_show)
	print(f"TV Show: {result.get('content_type')} - {result.get('content_metadata', {}).get('show_name')}")
	print(f"Image URL: {result.get('content_image_url')}")
	print()

	movie = {"media": {"title": "Inception.2010.1080p.BluRay.x264-SPARKS.mkv"}}
	result = detector.analyze(movie)
	print(
		f"Movie: {result.get('content_type')} - {result.get('content_metadata', {}).get('movie_name')} ({result.get('content_metadata', {}).get('year')})"
	)
	print(f"Image URL: {result.get('content_image_url')}")
	print()

	anime = {"media": {"title": "[HorribleSubs] Attack on Titan - 03 [1080p].mkv"}}
	result = detector.analyze(anime)
	print(f"Anime: {result.get('content_type')} - {result.get('content_metadata', {}).get('anime_name')}")
	print(f"Image URL: {result.get('content_image_url')}")
