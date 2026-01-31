"""Data source connectors for ancient texts."""

from .base import BaseSource, Document, SourceMetadata
from .mit_classics import MITClassicsSource
from .gutenberg import GutenbergSource
from .perseus import PerseusSource
from .loebolus import LoeboluscSource
from .sacred_texts import SacredTextsSource

__all__ = [
    "BaseSource",
    "Document",
    "SourceMetadata",
    "MITClassicsSource",
    "GutenbergSource",
    "PerseusSource",
    "LoeboluscSource",
    "SacredTextsSource",
]


def get_source(source_name: str) -> BaseSource:
    """Get a source connector by name."""
    sources = {
        "mit_classics": MITClassicsSource,
        "gutenberg": GutenbergSource,
        "perseus": PerseusSource,
        "loebolus": LoeboluscSource,
        "sacred_texts": SacredTextsSource,
    }
    if source_name not in sources:
        raise ValueError(f"Unknown source: {source_name}. Available: {list(sources.keys())}")
    return sources[source_name]()
