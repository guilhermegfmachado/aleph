"""Configuration for data sources and application settings."""

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Anthropic API
    anthropic_api_key: str = Field(default="", description="Anthropic API key for Claude")

    # Model settings
    claude_model: str = Field(default="claude-sonnet-4-20250514", description="Claude model to use")
    embedding_model: str = Field(
        default="all-MiniLM-L6-v2", description="Sentence transformer model for embeddings"
    )

    # Paths
    data_dir: Path = Field(default=Path("data"), description="Base data directory")
    chroma_dir: Path = Field(default=Path("data/chroma"), description="ChromaDB storage directory")

    # Chunking settings
    chunk_size: int = Field(default=1000, description="Target chunk size in characters")
    chunk_overlap: int = Field(default=200, description="Overlap between chunks")

    # Retrieval settings
    top_k: int = Field(default=10, description="Number of passages to retrieve")
    min_relevance_score: float = Field(
        default=0.3, description="Minimum similarity score for retrieval"
    )

    @property
    def raw_data_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def processed_data_dir(self) -> Path:
        return self.data_dir / "processed"


# Data source configurations
DATA_SOURCES = {
    "mit_classics": {
        "name": "MIT Internet Classics Archive",
        "url": "https://classics.mit.edu/",
        "github": "https://github.com/TheMITTech/classics",
        "type": "html",
        "description": "441 works of classical literature (Greek, Roman, Chinese, Persian)",
        "languages": ["english"],
    },
    "loebolus": {
        "name": "Loebolus (Loeb Classical Library)",
        "url": "https://ryanfb.xyz/loebolus/",
        "github_data": "https://github.com/ryanfb/loebolus-data",
        "archive_url": "https://archive.org/download/lcl-loeb-classical-library-complete-545-vols",
        "type": "pdf",
        "description": "277+ public domain Loeb Classical Library volumes with Greek/Latin + English",
        "languages": ["english", "greek", "latin"],
    },
    "perseus": {
        "name": "Perseus Digital Library",
        "url": "https://www.perseus.tufts.edu/hopper/",
        "github": "https://github.com/PerseusDL/canonical-greekLit",
        "type": "xml",
        "description": "Greek and Latin texts with morphological analysis",
        "languages": ["english", "greek", "latin"],
    },
    "gutenberg": {
        "name": "Project Gutenberg",
        "url": "https://www.gutenberg.org/",
        "api": "https://gutendex.com/",
        "type": "txt",
        "description": "Public domain ebooks including many classical translations",
        "languages": ["english"],
    },
    "sacred_texts": {
        "name": "Sacred Texts Archive",
        "url": "https://sacred-texts.com/",
        "type": "html",
        "description": "Religious, mythological, and esoteric texts from many traditions",
        "languages": ["english"],
    },
    "internet_archive": {
        "name": "Internet Archive",
        "url": "https://archive.org/",
        "api": "https://archive.org/advancedsearch.php",
        "type": "mixed",
        "description": "Massive digital library with many ancient text collections",
        "languages": ["english", "greek", "latin", "various"],
    },
    "open_library": {
        "name": "Open Library",
        "url": "https://openlibrary.org/",
        "api": "https://openlibrary.org/api/",
        "type": "mixed",
        "description": "Part of Internet Archive, catalog of books with some full texts",
        "languages": ["english", "various"],
    },
}

# Predefined collections for common use cases
COLLECTIONS = {
    "greek_philosophy": {
        "description": "Greek philosophical texts (Plato, Aristotle, Stoics, etc.)",
        "authors": [
            "Plato",
            "Aristotle",
            "Epictetus",
            "Marcus Aurelius",
            "Seneca",
            "Epicurus",
            "Diogenes Laertius",
        ],
    },
    "greek_drama": {
        "description": "Greek tragedies and comedies",
        "authors": ["Aeschylus", "Sophocles", "Euripides", "Aristophanes", "Menander"],
    },
    "roman_literature": {
        "description": "Roman poetry, prose, and history",
        "authors": ["Virgil", "Ovid", "Horace", "Cicero", "Livy", "Tacitus", "Suetonius"],
    },
    "greek_history": {
        "description": "Greek historical texts",
        "authors": ["Herodotus", "Thucydides", "Xenophon", "Plutarch", "Polybius"],
    },
    "homer_hesiod": {
        "description": "Epic poetry and mythology",
        "authors": ["Homer", "Hesiod", "Apollodorus"],
    },
    "religious_texts": {
        "description": "Religious and sacred texts",
        "works": ["Bible", "Quran", "Vedas", "Upanishads", "Tao Te Ching", "Confucian Analects"],
    },
}


settings = Settings()
