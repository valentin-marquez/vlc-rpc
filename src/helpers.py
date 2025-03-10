import os
import shutil
import struct


class Image:
	"""A minimal class that mimics the PIL.Image.Image interface needed by pystray"""

	def __init__(self, width, height, color=(90, 0, 175), source_path=None):
		self.width = width
		self.height = height
		self.color = color
		self.mode = "RGBA"
		self._data = bytes([color[0], color[1], color[2], 255] * (width * height))
		self._source_path = source_path
		self._temp_path = None

	def tobytes(self):
		"""Return raw bytes representing the image"""
		return self._data

	def save(self, fp, format=None):
		"""Save the image to a file or file-like object"""
		if format == "ICO" and self._source_path and os.path.exists(self._source_path):
			# If we have an original source ICO file, copy it directly
			if hasattr(fp, "write"):
				with open(self._source_path, "rb") as src_file:
					fp.write(src_file.read())
			else:
				shutil.copy2(self._source_path, fp)
		else:
			# Fall back to generating a basic ICO
			if format == "ICO":
				width = self.width
				height = self.height

				header = bytes(
					[
						0,
						0,  # Reserved
						1,
						0,  # Image type: 1 = ICO
						1,
						0,  # Number of images
					]
				)

				directory = bytes(
					[
						width if width < 256 else 0,  # Width
						height if height < 256 else 0,  # Height
						0,  # Color count
						0,  # Reserved
						1,
						0,  # Color planes
						32,
						0,  # Bits per pixel
						(40 + (width * height * 4)) & 0xFF,  # Size of bitmap data
						((40 + (width * height * 4)) >> 8) & 0xFF,
						((40 + (width * height * 4)) >> 16) & 0xFF,
						((40 + (width * height * 4)) >> 24) & 0xFF,
						22,
						0,
						0,
						0,  # Offset to bitmap data
					]
				)

				bmp_header = struct.pack(
					"<IIIHHIIIIII",
					40,  # biSize
					width,  # biWidth
					height * 2,  # biHeight (doubled for ICO format)
					1,  # biPlanes
					32,  # biBitCount
					0,  # biCompression
					width * height * 4,  # biSizeImage
					0,  # biXPelsPerMeter
					0,  # biYPelsPerMeter
					0,  # biClrUsed
					0,  # biClrImportant
				)

				bitmap_data = bytearray()
				r, g, b = self.color
				for y in range(height - 1, -1, -1):  # Bottom-up
					for x in range(width):
						bitmap_data.extend([b, g, r, 255])  # BGRA

				if hasattr(fp, "write"):
					fp.write(header + directory + bmp_header + bitmap_data)
				else:
					with open(fp, "wb") as f:
						f.write(header + directory + bmp_header + bitmap_data)
			else:
				# For other formats, write RGB data
				if hasattr(fp, "write"):
					fp.write(self._data)
				else:
					with open(fp, "wb") as f:
						f.write(self._data)

	@staticmethod
	def open(path):
		"""Open an image file and return an Image object"""
		try:
			if not os.path.exists(path):
				return Image(64, 64)

			with open(path, "rb") as f:
				# Try to detect the format
				header = f.read(24)

				if header.startswith(b"\x89PNG\r\n\x1a\n"):
					width = int.from_bytes(header[16:20], byteorder="big")
					height = int.from_bytes(header[20:24], byteorder="big")
					return Image(width, height, source_path=path)

				if header.startswith(b"\x00\x00\x01\x00"):
					width = header[6]
					width = 256 if width == 0 else width
					height = header[7]
					height = 256 if height == 0 else height
					# Store the original path in the image object
					return Image(width, height, source_path=path)

				return Image(64, 64)
		except (IOError, OSError):
			return Image(64, 64)

	@staticmethod
	def new(mode, size, color=(90, 0, 175)):
		"""Mock Image.new method"""
		width, height = size if isinstance(size, tuple) else (size, size)
		return Image(width, height, color)
