"""MIT Internet Classics Archive source connector."""

import re
from pathlib import Path
from typing import Iterator
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .base import BaseSource, Document, SourceMetadata


class MITClassicsSource(BaseSource):
    """Connector for MIT Internet Classics Archive (classics.mit.edu)."""

    name = "mit_classics"
    description = "441 works of classical literature from classics.mit.edu"
    base_url = "https://classics.mit.edu"

    def __init__(self, data_dir: Path | None = None):
        super().__init__(data_dir)
        self._works_cache: list[dict] | None = None

    def list_works(self) -> list[dict]:
        """List all available works from MIT Classics."""
        if self._works_cache is not None:
            return self._works_cache

        works = []
        browse_url = f"{self.base_url}/Browse/index.html"

        try:
            response = requests.get(browse_url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "lxml")

            # Find all author links (they link to browse-AuthorName.html)
            author_links = soup.find_all("a", href=re.compile(r"browse-.*\.html"))

            for author_link in author_links:
                author_name = author_link.get_text(strip=True)
                author_url = urljoin(browse_url, author_link["href"])

                # Fetch author's works page
                try:
                    author_response = requests.get(author_url, timeout=30)
                    author_response.raise_for_status()
                    author_soup = BeautifulSoup(author_response.text, "lxml")

                    # Find work links (they end with .html but not browse-)
                    work_links = author_soup.find_all(
                        "a", href=re.compile(r"^(?!browse-).*\.html$")
                    )

                    for work_link in work_links:
                        href = work_link.get("href", "")
                        if href and not href.startswith("browse-"):
                            title = work_link.get_text(strip=True)
                            work_url = urljoin(author_url, href)
                            work_id = href.replace(".html", "")

                            works.append(
                                {
                                    "id": work_id,
                                    "title": title,
                                    "author": author_name,
                                    "url": work_url,
                                }
                            )
                except requests.RequestException as e:
                    print(f"Failed to fetch works for {author_name}: {e}")

        except requests.RequestException as e:
            print(f"Failed to fetch MIT Classics index: {e}")

        self._works_cache = works
        return works

    def download_work(self, work_id: str) -> Path:
        """Download a specific work."""
        # Find the work in our list
        works = self.list_works()
        work = next((w for w in works if w["id"] == work_id), None)

        if not work:
            raise ValueError(f"Work not found: {work_id}")

        # Create author directory
        author_dir = self.data_dir / self._sanitize_filename(work["author"])
        author_dir.mkdir(parents=True, exist_ok=True)

        # Download the work
        output_path = author_dir / f"{work_id}.html"

        if output_path.exists():
            return output_path

        response = requests.get(work["url"], timeout=30)
        response.raise_for_status()
        output_path.write_text(response.text, encoding="utf-8")

        return output_path

    def extract_text(self, file_path: Path) -> Iterator[Document]:
        """Extract text from a downloaded HTML file."""
        html_content = file_path.read_text(encoding="utf-8")
        soup = BeautifulSoup(html_content, "lxml")

        # Extract metadata from the page
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else file_path.stem

        # Parse title which is usually "Title by Author"
        author = "Unknown"
        if " by " in title:
            parts = title.rsplit(" by ", 1)
            title = parts[0]
            author = parts[1]

        # Find translator info if present
        translator = None
        translator_tag = soup.find(string=re.compile(r"[Tt]ranslated by"))
        if translator_tag:
            translator_match = re.search(r"[Tt]ranslated by\s+(.+?)(?:\.|$)", translator_tag)
            if translator_match:
                translator = translator_match.group(1).strip()

        # Extract the main text content
        # MIT Classics typically has the text in <p> tags or <pre> tags
        content_parts = []

        # Remove navigation and header elements
        for nav in soup.find_all(["nav", "header", "footer"]):
            nav.decompose()

        # Get all paragraph and pre text
        for element in soup.find_all(["p", "pre"]):
            text = element.get_text(strip=True)
            if text and len(text) > 20:  # Filter out very short snippets
                content_parts.append(text)

        if not content_parts:
            # Fallback: get all text from body
            body = soup.find("body")
            if body:
                content_parts = [body.get_text(separator="\n", strip=True)]

        full_text = "\n\n".join(content_parts)

        if full_text.strip():
            metadata = SourceMetadata(
                source=self.name,
                author=author,
                title=title,
                url=f"{self.base_url}/{file_path.stem}.html",
                work_id=file_path.stem,
                translator=translator,
                original_language="greek" if author in self._greek_authors() else "latin",
            )

            yield Document(content=full_text, metadata=metadata)

    def _sanitize_filename(self, name: str) -> str:
        """Convert a name to a safe filename."""
        return re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")

    def _greek_authors(self) -> set[str]:
        """Return set of Greek authors for language detection."""
        return {
            "Homer",
            "Hesiod",
            "Aeschylus",
            "Sophocles",
            "Euripides",
            "Aristophanes",
            "Herodotus",
            "Thucydides",
            "Xenophon",
            "Plato",
            "Aristotle",
            "Epicurus",
            "Epictetus",
            "Plutarch",
            "Apollodorus",
            "Diogenes Laertius",
            "Demosthenes",
            "Aesop",
            "Pindar",
            "Sappho",
        }
