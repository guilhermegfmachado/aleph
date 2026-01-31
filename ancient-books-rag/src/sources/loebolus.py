"""Loebolus (Loeb Classical Library) source connector."""

import json
import re
from pathlib import Path
from typing import Iterator

import requests

from .base import BaseSource, Document, SourceMetadata


class LoeboluscSource(BaseSource):
    """Connector for Loebolus Loeb Classical Library PDFs."""

    name = "loebolus"
    description = "Public domain Loeb Classical Library volumes"

    # GitHub repo with the data
    DATA_REPO = "https://api.github.com/repos/ryanfb/loebolus-data/contents"
    RAW_BASE = "https://raw.githubusercontent.com/ryanfb/loebolus-data/master"

    # Archive.org has a more complete collection
    ARCHIVE_URL = "https://archive.org/download/lcl-loeb-classical-library-complete-545-vols"

    def __init__(self, data_dir: Path | None = None):
        super().__init__(data_dir)
        self._works_cache: list[dict] | None = None
        self._catalog: dict | None = None

    def _load_catalog(self) -> dict:
        """Load the Loebolus catalog from GitHub."""
        if self._catalog is not None:
            return self._catalog

        catalog_url = f"{self.RAW_BASE}/catalog.json"
        try:
            response = requests.get(catalog_url, timeout=30)
            response.raise_for_status()
            self._catalog = response.json()
        except requests.RequestException:
            # Fallback to empty catalog
            self._catalog = {"volumes": []}

        return self._catalog

    def list_works(self) -> list[dict]:
        """List available Loeb volumes."""
        if self._works_cache is not None:
            return self._works_cache

        works = []
        catalog = self._load_catalog()

        for volume in catalog.get("volumes", []):
            vol_num = volume.get("number", "")
            title = volume.get("title", "Unknown")
            author = volume.get("author", "Unknown")

            # Construct the PDF URL
            pdf_name = f"L{vol_num:0>3}.pdf" if vol_num else None

            works.append(
                {
                    "id": f"L{vol_num:0>3}" if vol_num else title.replace(" ", "_"),
                    "title": title,
                    "author": author,
                    "volume": vol_num,
                    "url": f"{self.ARCHIVE_URL}/{pdf_name}" if pdf_name else None,
                    "translator": volume.get("translator"),
                    "date": volume.get("date"),
                }
            )

        # If catalog is empty, try to list from archive.org
        if not works:
            works = self._list_from_archive()

        self._works_cache = works
        return works

    def _list_from_archive(self) -> list[dict]:
        """List works directly from Archive.org."""
        works = []

        try:
            # Get the file listing from Archive.org
            meta_url = f"{self.ARCHIVE_URL}/lcl-loeb-classical-library-complete-545-vols_files.xml"
            response = requests.get(meta_url, timeout=60)
            response.raise_for_status()

            # Parse the XML to find PDF files
            import xml.etree.ElementTree as ET

            root = ET.fromstring(response.text)

            for file_elem in root.findall(".//file"):
                name = file_elem.get("name", "")
                if name.endswith(".pdf"):
                    vol_id = name.replace(".pdf", "")
                    works.append(
                        {
                            "id": vol_id,
                            "title": vol_id,  # We don't have title info
                            "author": "Unknown",
                            "url": f"{self.ARCHIVE_URL}/{name}",
                        }
                    )

        except (requests.RequestException, ET.ParseError) as e:
            print(f"Failed to list from Archive.org: {e}")

        return works

    def download_work(self, work_id: str) -> Path:
        """Download a Loeb volume PDF."""
        works = self.list_works()
        work = next((w for w in works if w["id"] == work_id), None)

        if not work or not work.get("url"):
            raise ValueError(f"Work not found or no URL: {work_id}")

        output_path = self.data_dir / f"{work_id}.pdf"

        if output_path.exists():
            return output_path

        print(f"Downloading {work_id}...")
        response = requests.get(work["url"], timeout=120, stream=True)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Save metadata
        meta_path = self.data_dir / f"{work_id}.meta.json"
        meta_path.write_text(json.dumps(work, indent=2))

        return output_path

    def extract_text(self, file_path: Path) -> Iterator[Document]:
        """Extract text from a Loeb PDF."""
        try:
            from pypdf import PdfReader
        except ImportError:
            print("pypdf not installed, cannot extract PDF text")
            return

        # Load metadata if available
        meta_path = file_path.with_suffix(".meta.json")
        metadata_dict = {}
        if meta_path.exists():
            metadata_dict = json.loads(meta_path.read_text())

        try:
            reader = PdfReader(file_path)
            text_parts = []

            for page_num, page in enumerate(reader.pages):
                try:
                    text = page.extract_text()
                    if text:
                        text_parts.append(f"[Page {page_num + 1}]\n{text}")
                except Exception as e:
                    print(f"Failed to extract page {page_num}: {e}")

            content = "\n\n".join(text_parts)

            # Clean up common OCR artifacts
            content = self._clean_pdf_text(content)

            if content.strip():
                metadata = SourceMetadata(
                    source=self.name,
                    author=metadata_dict.get("author", "Unknown"),
                    title=metadata_dict.get("title", file_path.stem),
                    url=metadata_dict.get("url"),
                    work_id=file_path.stem,
                    translator=metadata_dict.get("translator"),
                    date_published=metadata_dict.get("date"),
                )

                yield Document(content=content, metadata=metadata)

        except Exception as e:
            print(f"Failed to read PDF {file_path}: {e}")

    def _clean_pdf_text(self, text: str) -> str:
        """Clean up common PDF extraction artifacts."""
        # Remove excessive whitespace
        text = re.sub(r" +", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Remove page headers/footers (common patterns)
        text = re.sub(r"\n\d+\s*\n", "\n", text)  # Standalone page numbers

        return text.strip()
