"""Project Gutenberg source connector."""

import re
from pathlib import Path
from typing import Iterator

import requests

from .base import BaseSource, Document, SourceMetadata


class GutenbergSource(BaseSource):
    """Connector for Project Gutenberg (gutenberg.org)."""

    name = "gutenberg"
    description = "Public domain ebooks including classical translations"
    api_url = "https://gutendex.com/books"

    # Classical subjects to search for
    CLASSICAL_SUBJECTS = [
        "Classical literature",
        "Greek literature",
        "Latin literature",
        "Ancient history",
        "Philosophy, Ancient",
        "Mythology, Greek",
        "Mythology, Roman",
    ]

    # Known classical authors on Gutenberg
    CLASSICAL_AUTHORS = [
        "Homer",
        "Plato",
        "Aristotle",
        "Virgil",
        "Ovid",
        "Cicero",
        "Seneca",
        "Marcus Aurelius",
        "Plutarch",
        "Herodotus",
        "Thucydides",
        "Sophocles",
        "Euripides",
        "Aeschylus",
        "Aristophanes",
        "Xenophon",
        "Livy",
        "Tacitus",
        "Julius Caesar",
        "Epictetus",
        "Lucretius",
        "Horace",
        "Juvenal",
        "Suetonius",
        "Apollodorus",
        "Hesiod",
        "Diogenes Laertius",
        "Aesop",
    ]

    def __init__(self, data_dir: Path | None = None):
        super().__init__(data_dir)
        self._works_cache: list[dict] | None = None

    def list_works(self, authors: list[str] | None = None) -> list[dict]:
        """List classical works from Gutenberg.

        Args:
            authors: List of author names to search for (defaults to CLASSICAL_AUTHORS)
        """
        if self._works_cache is not None:
            return self._works_cache

        works = []
        search_authors = authors or self.CLASSICAL_AUTHORS

        for author in search_authors:
            try:
                # Search by author name
                response = requests.get(
                    self.api_url, params={"search": author}, timeout=30
                )
                response.raise_for_status()
                data = response.json()

                for book in data.get("results", []):
                    # Check if this is actually by the author we searched for
                    book_authors = [a.get("name", "") for a in book.get("authors", [])]
                    if not any(author.lower() in a.lower() for a in book_authors):
                        continue

                    # Get text download URL (prefer plain text)
                    formats = book.get("formats", {})
                    text_url = None
                    for fmt_key in [
                        "text/plain; charset=utf-8",
                        "text/plain",
                        "text/plain; charset=us-ascii",
                    ]:
                        if fmt_key in formats:
                            text_url = formats[fmt_key]
                            break

                    if text_url:
                        works.append(
                            {
                                "id": str(book["id"]),
                                "title": book.get("title", "Unknown"),
                                "author": ", ".join(book_authors),
                                "url": text_url,
                                "subjects": book.get("subjects", []),
                                "languages": book.get("languages", ["en"]),
                            }
                        )

            except requests.RequestException as e:
                print(f"Failed to search for {author}: {e}")

        # Deduplicate by ID
        seen_ids = set()
        unique_works = []
        for work in works:
            if work["id"] not in seen_ids:
                seen_ids.add(work["id"])
                unique_works.append(work)

        self._works_cache = unique_works
        return unique_works

    def download_work(self, work_id: str) -> Path:
        """Download a specific work by Gutenberg ID."""
        works = self.list_works()
        work = next((w for w in works if w["id"] == work_id), None)

        if not work:
            # Try to fetch directly from API
            try:
                response = requests.get(f"{self.api_url}/{work_id}", timeout=30)
                response.raise_for_status()
                book = response.json()

                formats = book.get("formats", {})
                text_url = None
                for fmt_key in [
                    "text/plain; charset=utf-8",
                    "text/plain",
                    "text/plain; charset=us-ascii",
                ]:
                    if fmt_key in formats:
                        text_url = formats[fmt_key]
                        break

                if not text_url:
                    raise ValueError(f"No plain text available for {work_id}")

                work = {
                    "id": work_id,
                    "title": book.get("title", "Unknown"),
                    "author": ", ".join(a.get("name", "") for a in book.get("authors", [])),
                    "url": text_url,
                }
            except requests.RequestException as e:
                raise ValueError(f"Failed to fetch work {work_id}: {e}")

        # Create output path
        output_path = self.data_dir / f"{work_id}.txt"

        if output_path.exists():
            return output_path

        # Download the text
        response = requests.get(work["url"], timeout=60)
        response.raise_for_status()
        output_path.write_text(response.text, encoding="utf-8")

        # Also save metadata
        meta_path = self.data_dir / f"{work_id}.meta.json"
        import json

        meta_path.write_text(json.dumps(work, indent=2), encoding="utf-8")

        return output_path

    def extract_text(self, file_path: Path) -> Iterator[Document]:
        """Extract text from a downloaded Gutenberg file."""
        import json

        content = file_path.read_text(encoding="utf-8", errors="replace")

        # Load metadata if available
        meta_path = file_path.with_suffix(".meta.json")
        metadata_dict = {}
        if meta_path.exists():
            metadata_dict = json.loads(meta_path.read_text())

        # Remove Gutenberg header and footer
        content = self._strip_gutenberg_boilerplate(content)

        if not content.strip():
            return

        work_id = file_path.stem

        metadata = SourceMetadata(
            source=self.name,
            author=metadata_dict.get("author", "Unknown"),
            title=metadata_dict.get("title", work_id),
            url=f"https://www.gutenberg.org/ebooks/{work_id}",
            work_id=work_id,
            extra={"subjects": metadata_dict.get("subjects", [])},
        )

        yield Document(content=content, metadata=metadata)

    def _strip_gutenberg_boilerplate(self, text: str) -> str:
        """Remove Project Gutenberg header and footer."""
        # Find start of actual content
        start_markers = [
            r"\*\*\* START OF (THE|THIS) PROJECT GUTENBERG",
            r"\*\*\*START OF (THE|THIS) PROJECT GUTENBERG",
            r"START OF (THE|THIS) PROJECT GUTENBERG",
        ]

        for marker in start_markers:
            match = re.search(marker, text, re.IGNORECASE)
            if match:
                # Find end of the header line
                end_of_line = text.find("\n", match.end())
                if end_of_line != -1:
                    text = text[end_of_line + 1 :]
                break

        # Find end of actual content
        end_markers = [
            r"\*\*\* END OF (THE|THIS) PROJECT GUTENBERG",
            r"\*\*\*END OF (THE|THIS) PROJECT GUTENBERG",
            r"END OF (THE|THIS) PROJECT GUTENBERG",
        ]

        for marker in end_markers:
            match = re.search(marker, text, re.IGNORECASE)
            if match:
                text = text[: match.start()]
                break

        return text.strip()
