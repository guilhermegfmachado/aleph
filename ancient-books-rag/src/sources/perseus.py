"""Perseus Digital Library source connector."""

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterator

import requests

from .base import BaseSource, Document, SourceMetadata


class PerseusSource(BaseSource):
    """Connector for Perseus Digital Library (perseus.tufts.edu)."""

    name = "perseus"
    description = "Greek and Latin texts with scholarly apparatus"

    # Perseus uses CTS URNs (Canonical Text Services)
    # We'll use their GitHub repositories for easier access
    GREEK_REPO = "https://api.github.com/repos/PerseusDL/canonical-greekLit/contents/data"
    LATIN_REPO = "https://api.github.com/repos/PerseusDL/canonical-latinLit/contents/data"

    def __init__(self, data_dir: Path | None = None):
        super().__init__(data_dir)
        self._works_cache: list[dict] | None = None

    def list_works(self) -> list[dict]:
        """List available works from Perseus GitHub repos."""
        if self._works_cache is not None:
            return self._works_cache

        works = []

        for repo_url, language in [(self.GREEK_REPO, "greek"), (self.LATIN_REPO, "latin")]:
            try:
                # Get top-level directories (author URNs)
                response = requests.get(repo_url, timeout=30)
                if response.status_code == 403:
                    # Rate limited - use alternative approach
                    print(f"GitHub API rate limited for {language} texts")
                    continue
                response.raise_for_status()

                for item in response.json():
                    if item["type"] == "dir":
                        author_urn = item["name"]
                        # Parse URN to get author name
                        # Format: tlg0001 (Greek) or phi0474 (Latin)
                        works.append(
                            {
                                "id": author_urn,
                                "title": f"{author_urn} collection",
                                "author": self._urn_to_author(author_urn),
                                "language": language,
                                "url": item["html_url"],
                                "api_url": item["url"],
                            }
                        )

            except requests.RequestException as e:
                print(f"Failed to fetch Perseus {language} index: {e}")

        self._works_cache = works
        return works

    def download_work(self, work_id: str) -> Path:
        """Download texts for a given author URN."""
        works = self.list_works()
        work = next((w for w in works if w["id"] == work_id), None)

        if not work:
            raise ValueError(f"Work not found: {work_id}")

        output_dir = self.data_dir / work_id
        output_dir.mkdir(parents=True, exist_ok=True)

        # Fetch the directory contents
        try:
            response = requests.get(work["api_url"], timeout=30)
            response.raise_for_status()

            for item in response.json():
                if item["type"] == "dir":
                    # This is a work directory, look for XML files inside
                    work_response = requests.get(item["url"], timeout=30)
                    work_response.raise_for_status()

                    for file_item in work_response.json():
                        if file_item["name"].endswith(".xml"):
                            self._download_file(
                                file_item["download_url"],
                                output_dir / file_item["name"],
                            )

        except requests.RequestException as e:
            print(f"Failed to download {work_id}: {e}")

        return output_dir

    def _download_file(self, url: str, path: Path) -> None:
        """Download a single file."""
        if path.exists():
            return

        response = requests.get(url, timeout=30)
        response.raise_for_status()
        path.write_bytes(response.content)

    def extract_text(self, file_path: Path) -> Iterator[Document]:
        """Extract text from Perseus TEI XML files."""
        if file_path.is_dir():
            # Process all XML files in the directory
            for xml_file in file_path.glob("**/*.xml"):
                yield from self._extract_from_xml(xml_file)
        else:
            yield from self._extract_from_xml(file_path)

    def _extract_from_xml(self, xml_path: Path) -> Iterator[Document]:
        """Extract text from a single TEI XML file."""
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()

            # Handle TEI namespace
            ns = {"tei": "http://www.tei-c.org/ns/1.0"}

            # Try to find title and author
            title = "Unknown"
            author = "Unknown"

            title_elem = root.find(".//tei:title", ns) or root.find(".//title")
            if title_elem is not None and title_elem.text:
                title = title_elem.text.strip()

            author_elem = root.find(".//tei:author", ns) or root.find(".//author")
            if author_elem is not None and author_elem.text:
                author = author_elem.text.strip()

            # Extract text from body
            body = root.find(".//tei:body", ns) or root.find(".//body")
            if body is None:
                return

            # Get all text content, preserving structure somewhat
            text_parts = []

            for elem in body.iter():
                if elem.text:
                    text_parts.append(elem.text.strip())
                if elem.tail:
                    text_parts.append(elem.tail.strip())

            content = " ".join(filter(None, text_parts))
            content = re.sub(r"\s+", " ", content).strip()

            if content:
                # Determine language from path
                language = "greek" if "greekLit" in str(xml_path) else "latin"

                metadata = SourceMetadata(
                    source=self.name,
                    author=author,
                    title=title,
                    url=f"https://github.com/PerseusDL/canonical-{language}Lit",
                    work_id=xml_path.stem,
                    original_language=language,
                )

                yield Document(content=content, metadata=metadata)

        except ET.ParseError as e:
            print(f"Failed to parse XML {xml_path}: {e}")

    def _urn_to_author(self, urn: str) -> str:
        """Convert a Perseus URN to an author name."""
        # Common URN mappings
        urn_map = {
            # Greek (TLG)
            "tlg0001": "Apollonius Rhodius",
            "tlg0003": "Thucydides",
            "tlg0006": "Euripides",
            "tlg0007": "Isocrates",
            "tlg0008": "Aeschines",
            "tlg0010": "Isaeus",
            "tlg0011": "Sophocles",
            "tlg0012": "Homer",
            "tlg0013": "Homeric Hymns",
            "tlg0014": "Demosthenes",
            "tlg0016": "Herodotus",
            "tlg0017": "Lysias",
            "tlg0019": "Aristophanes",
            "tlg0020": "Hesiod",
            "tlg0026": "Aeschylus",
            "tlg0028": "Antiphon",
            "tlg0029": "Andocides",
            "tlg0030": "Lycurgus",
            "tlg0032": "Xenophon",
            "tlg0033": "Pindar",
            "tlg0034": "Dinarchus",
            "tlg0035": "Hyperides",
            "tlg0059": "Plato",
            "tlg0060": "Diodorus Siculus",
            "tlg0062": "Lucian",
            "tlg0084": "Josephus",
            "tlg0085": "Plutarch",
            "tlg0086": "Aristotle",
            "tlg0099": "Apollodorus",
            # Latin (PHI)
            "phi0448": "Caesar",
            "phi0474": "Cicero",
            "phi0620": "Horace",
            "phi0690": "Livy",
            "phi0893": "Ovid",
            "phi0917": "Petronius",
            "phi0959": "Plautus",
            "phi0972": "Pliny the Elder",
            "phi1017": "Seneca",
            "phi1221": "Suetonius",
            "phi1351": "Tacitus",
            "phi1254": "Terence",
            "phi0119": "Vergil",
        }
        return urn_map.get(urn.lower(), urn)
