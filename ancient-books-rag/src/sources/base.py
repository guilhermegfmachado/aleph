"""Base classes for data source connectors."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterator


@dataclass
class SourceMetadata:
    """Metadata about a document's source."""

    source: str  # e.g., "mit_classics", "loebolus"
    author: str
    title: str
    url: str | None = None
    work_id: str | None = None  # Unique identifier within the source
    translator: str | None = None
    original_language: str | None = None
    date_written: str | None = None  # Approximate date of original composition
    date_published: str | None = None  # Date of this translation/edition
    section: str | None = None  # Book, chapter, or section name
    line_numbers: str | None = None  # Line number range if applicable
    extra: dict = field(default_factory=dict)  # Additional source-specific metadata


@dataclass
class Document:
    """A document or text passage with metadata."""

    content: str
    metadata: SourceMetadata
    chunk_id: str | None = None  # Set during chunking

    def __post_init__(self):
        if self.chunk_id is None:
            # Generate a unique ID based on source and content
            import hashlib

            content_hash = hashlib.md5(self.content.encode()).hexdigest()[:8]
            self.chunk_id = f"{self.metadata.source}_{self.metadata.work_id}_{content_hash}"

    @property
    def citation(self) -> str:
        """Generate a citation string for this document."""
        parts = [self.metadata.author, self.metadata.title]
        if self.metadata.section:
            parts.append(self.metadata.section)
        if self.metadata.translator:
            parts.append(f"(trans. {self.metadata.translator})")
        citation = ", ".join(filter(None, parts))
        if self.metadata.url:
            citation += f" [{self.metadata.source}]"
        return citation


class BaseSource(ABC):
    """Base class for all data source connectors."""

    name: str = "base"
    description: str = "Base source connector"

    def __init__(self, data_dir: Path | None = None):
        from ..config import settings

        self.data_dir = data_dir or settings.raw_data_dir / self.name
        self.data_dir.mkdir(parents=True, exist_ok=True)

    @abstractmethod
    def list_works(self) -> list[dict]:
        """List available works from this source.

        Returns:
            List of dicts with at least 'id', 'title', 'author' keys
        """
        pass

    @abstractmethod
    def download_work(self, work_id: str) -> Path:
        """Download a specific work.

        Args:
            work_id: Unique identifier for the work

        Returns:
            Path to the downloaded file
        """
        pass

    @abstractmethod
    def extract_text(self, file_path: Path) -> Iterator[Document]:
        """Extract text content from a downloaded file.

        Args:
            file_path: Path to the downloaded file

        Yields:
            Document objects with content and metadata
        """
        pass

    def download_all(self, limit: int | None = None) -> list[Path]:
        """Download all available works.

        Args:
            limit: Maximum number of works to download (for testing)

        Returns:
            List of paths to downloaded files
        """
        works = self.list_works()
        if limit:
            works = works[:limit]

        paths = []
        for work in works:
            try:
                path = self.download_work(work["id"])
                paths.append(path)
            except Exception as e:
                print(f"Failed to download {work.get('title', work['id'])}: {e}")
        return paths

    def ingest_all(self, limit: int | None = None) -> Iterator[Document]:
        """Download and extract all works.

        Args:
            limit: Maximum number of works to process

        Yields:
            Document objects from all works
        """
        paths = self.download_all(limit=limit)
        for path in paths:
            try:
                yield from self.extract_text(path)
            except Exception as e:
                print(f"Failed to extract text from {path}: {e}")
