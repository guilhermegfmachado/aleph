"""Sacred Texts Archive source connector."""

import re
from pathlib import Path
from typing import Iterator
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .base import BaseSource, Document, SourceMetadata


class SacredTextsSource(BaseSource):
    """Connector for Sacred Texts Archive (sacred-texts.com)."""

    name = "sacred_texts"
    description = "Religious, mythological, and esoteric texts"
    base_url = "https://sacred-texts.com"

    # Key sections with classical/ancient content
    SECTIONS = {
        "cla": ("Classical Paganism", "/cla/index.htm"),
        "egy": ("Egyptian", "/egy/index.htm"),
        "ane": ("Ancient Near East", "/ane/index.htm"),
        "gno": ("Gnosticism", "/gno/index.htm"),
        "chr": ("Christianity (Early)", "/chr/index.htm"),
        "jud": ("Judaism", "/jud/index.htm"),
        "isl": ("Islam", "/isl/index.htm"),
        "hin": ("Hinduism", "/hin/index.htm"),
        "bud": ("Buddhism", "/bud/index.htm"),
        "zor": ("Zoroastrianism", "/zor/index.htm"),
        "tao": ("Taoism", "/tao/index.htm"),
        "cfu": ("Confucianism", "/cfu/index.htm"),
    }

    def __init__(self, data_dir: Path | None = None):
        super().__init__(data_dir)
        self._works_cache: list[dict] | None = None

    def list_works(self, sections: list[str] | None = None) -> list[dict]:
        """List available works from specified sections.

        Args:
            sections: List of section codes (e.g., ['cla', 'egy']). Defaults to all.
        """
        if self._works_cache is not None:
            return self._works_cache

        works = []
        target_sections = sections or list(self.SECTIONS.keys())

        for section_code in target_sections:
            if section_code not in self.SECTIONS:
                continue

            section_name, section_path = self.SECTIONS[section_code]
            section_url = f"{self.base_url}{section_path}"

            try:
                response = requests.get(section_url, timeout=30)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "lxml")

                # Find links to texts (usually in tables or lists)
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")

                    # Skip navigation and external links
                    if href.startswith("http") and self.base_url not in href:
                        continue
                    if href.startswith("#") or href.startswith("mailto:"):
                        continue
                    if "index" in href.lower():
                        continue

                    # Get the title
                    title = link.get_text(strip=True)
                    if not title or len(title) < 3:
                        continue

                    # Build full URL
                    full_url = urljoin(section_url, href)

                    # Create work ID from URL
                    work_id = f"{section_code}_{href.replace('/', '_').replace('.htm', '')}"
                    work_id = re.sub(r"[^\w_]", "", work_id)

                    works.append(
                        {
                            "id": work_id,
                            "title": title,
                            "author": "Various",  # Often unknown for sacred texts
                            "section": section_name,
                            "url": full_url,
                        }
                    )

            except requests.RequestException as e:
                print(f"Failed to fetch section {section_code}: {e}")

        # Deduplicate
        seen = set()
        unique_works = []
        for work in works:
            if work["url"] not in seen:
                seen.add(work["url"])
                unique_works.append(work)

        self._works_cache = unique_works
        return unique_works

    def download_work(self, work_id: str) -> Path:
        """Download a specific text."""
        works = self.list_works()
        work = next((w for w in works if w["id"] == work_id), None)

        if not work:
            raise ValueError(f"Work not found: {work_id}")

        # Create section directory
        section_code = work_id.split("_")[0]
        section_dir = self.data_dir / section_code
        section_dir.mkdir(parents=True, exist_ok=True)

        output_path = section_dir / f"{work_id}.html"

        if output_path.exists():
            return output_path

        # Download the page
        response = requests.get(work["url"], timeout=30)
        response.raise_for_status()
        output_path.write_text(response.text, encoding="utf-8")

        return output_path

    def extract_text(self, file_path: Path) -> Iterator[Document]:
        """Extract text from downloaded HTML."""
        html_content = file_path.read_text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(html_content, "lxml")

        # Extract title
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else file_path.stem

        # Remove navigation elements
        for tag in soup.find_all(["script", "style", "nav", "header", "footer"]):
            tag.decompose()

        # Sacred-texts.com often has text in specific divs or the body
        content_parts = []

        # Try to find main content area
        main_content = soup.find("body")
        if main_content:
            # Get paragraphs
            for p in main_content.find_all(["p", "pre", "blockquote"]):
                text = p.get_text(strip=True)
                if text and len(text) > 20:
                    content_parts.append(text)

        content = "\n\n".join(content_parts)

        # Clean up the text
        content = re.sub(r"\s+", " ", content)
        content = content.replace(" .", ".").replace(" ,", ",")

        if content.strip():
            # Determine section from path
            section_code = file_path.parent.name
            section_name = self.SECTIONS.get(section_code, (section_code, ""))[0]

            metadata = SourceMetadata(
                source=self.name,
                author="Various",
                title=title,
                work_id=file_path.stem,
                extra={"section": section_name},
            )

            yield Document(content=content, metadata=metadata)
