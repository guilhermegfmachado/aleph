"""Text chunking for RAG pipeline."""

import re
from dataclasses import dataclass
from typing import Iterator

from .sources.base import Document, SourceMetadata


@dataclass
class ChunkingConfig:
    """Configuration for text chunking."""

    chunk_size: int = 1000  # Target chunk size in characters
    chunk_overlap: int = 200  # Overlap between chunks
    min_chunk_size: int = 100  # Minimum chunk size
    respect_sentences: bool = True  # Try to break at sentence boundaries
    respect_paragraphs: bool = True  # Try to break at paragraph boundaries


def chunk_text(
    text: str,
    config: ChunkingConfig | None = None,
) -> Iterator[tuple[str, int, int]]:
    """Split text into overlapping chunks.

    Args:
        text: The text to chunk
        config: Chunking configuration

    Yields:
        Tuples of (chunk_text, start_position, end_position)
    """
    if config is None:
        config = ChunkingConfig()

    if len(text) <= config.chunk_size:
        yield text, 0, len(text)
        return

    # Split into paragraphs first if configured
    if config.respect_paragraphs:
        paragraphs = re.split(r"\n\n+", text)
    else:
        paragraphs = [text]

    current_chunk = ""
    current_start = 0
    position = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            position += 2  # Account for \n\n
            continue

        # If adding this paragraph would exceed chunk size
        if len(current_chunk) + len(para) + 2 > config.chunk_size:
            # If we have content, yield it
            if len(current_chunk) >= config.min_chunk_size:
                yield current_chunk.strip(), current_start, position

                # Start new chunk with overlap
                if config.chunk_overlap > 0:
                    overlap_text = _get_overlap(current_chunk, config.chunk_overlap)
                    current_chunk = overlap_text + "\n\n" + para
                    current_start = position - len(overlap_text)
                else:
                    current_chunk = para
                    current_start = position
            else:
                # Current chunk too small, keep adding
                current_chunk = current_chunk + "\n\n" + para if current_chunk else para

        else:
            current_chunk = current_chunk + "\n\n" + para if current_chunk else para

        position += len(para) + 2

    # Yield final chunk
    if current_chunk and len(current_chunk) >= config.min_chunk_size:
        yield current_chunk.strip(), current_start, position


def _get_overlap(text: str, overlap_size: int) -> str:
    """Get the last overlap_size characters, respecting sentence boundaries."""
    if len(text) <= overlap_size:
        return text

    # Get the last overlap_size characters
    overlap = text[-overlap_size:]

    # Try to start at a sentence boundary
    sentence_starts = list(re.finditer(r"(?<=[.!?])\s+", overlap))
    if sentence_starts:
        # Start from the first sentence boundary
        start = sentence_starts[0].end()
        return overlap[start:]

    # Fall back to word boundary
    word_start = overlap.find(" ")
    if word_start != -1:
        return overlap[word_start + 1 :]

    return overlap


def chunk_document(
    document: Document,
    config: ChunkingConfig | None = None,
) -> Iterator[Document]:
    """Chunk a document into smaller pieces, preserving metadata.

    Args:
        document: The document to chunk
        config: Chunking configuration

    Yields:
        Document objects for each chunk
    """
    if config is None:
        config = ChunkingConfig()

    for i, (chunk_text, start, end) in enumerate(chunk_text(document.content, config)):
        # Create new metadata with section info
        new_metadata = SourceMetadata(
            source=document.metadata.source,
            author=document.metadata.author,
            title=document.metadata.title,
            url=document.metadata.url,
            work_id=document.metadata.work_id,
            translator=document.metadata.translator,
            original_language=document.metadata.original_language,
            date_written=document.metadata.date_written,
            date_published=document.metadata.date_published,
            section=f"{document.metadata.section or ''} (chunk {i + 1})".strip(),
            extra={
                **document.metadata.extra,
                "chunk_index": i,
                "char_start": start,
                "char_end": end,
            },
        )

        # Create chunk ID
        chunk_id = f"{document.metadata.work_id}_chunk_{i:04d}"

        yield Document(
            content=chunk_text,
            metadata=new_metadata,
            chunk_id=chunk_id,
        )


def chunk_documents(
    documents: Iterator[Document],
    config: ChunkingConfig | None = None,
) -> Iterator[Document]:
    """Chunk multiple documents.

    Args:
        documents: Iterator of documents to chunk
        config: Chunking configuration

    Yields:
        Document objects for each chunk
    """
    for doc in documents:
        yield from chunk_document(doc, config)


def estimate_chunks(text: str, config: ChunkingConfig | None = None) -> int:
    """Estimate the number of chunks for a text without actually chunking.

    Args:
        text: The text to estimate chunks for
        config: Chunking configuration

    Returns:
        Estimated number of chunks
    """
    if config is None:
        config = ChunkingConfig()

    if len(text) <= config.chunk_size:
        return 1

    # Rough estimate considering overlap
    effective_chunk = config.chunk_size - config.chunk_overlap
    return max(1, (len(text) - config.chunk_overlap) // effective_chunk + 1)
