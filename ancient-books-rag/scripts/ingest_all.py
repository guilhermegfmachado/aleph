#!/usr/bin/env python3
"""Script to ingest texts from all configured sources."""

import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.chunking import ChunkingConfig, chunk_documents
from src.config import DATA_SOURCES
from src.embeddings import VectorStore
from src.sources import get_source


def main():
    parser = argparse.ArgumentParser(description="Ingest classical texts into the RAG database")
    parser.add_argument(
        "--sources",
        "-s",
        nargs="+",
        default=["mit_classics", "gutenberg"],
        help="Sources to ingest (default: mit_classics gutenberg)",
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=None,
        help="Limit number of works per source (for testing)",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing index before ingesting",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=1000,
        help="Chunk size in characters (default: 1000)",
    )

    args = parser.parse_args()

    print("Ancient Books RAG - Ingestion Script")
    print("=" * 40)

    # Initialize
    vector_store = VectorStore()
    chunking_config = ChunkingConfig(
        chunk_size=args.chunk_size,
        chunk_overlap=200,
    )

    if args.clear:
        print("Clearing existing index...")
        vector_store.clear()

    available_sources = ["mit_classics", "gutenberg", "perseus", "loebolus", "sacred_texts"]

    for source_name in args.sources:
        if source_name not in available_sources:
            print(f"Unknown source: {source_name}")
            print(f"Available: {', '.join(available_sources)}")
            continue

        print(f"\nProcessing {source_name}...")

        try:
            source = get_source(source_name)
            works = source.list_works()

            if args.limit:
                works = works[:args.limit]

            print(f"  Found {len(works)} works to process")

            total_chunks = 0
            for i, work in enumerate(works):
                title = work.get("title", work["id"])[:40]
                print(f"  [{i+1}/{len(works)}] {title}...", end=" ", flush=True)

                try:
                    # Download
                    file_path = source.download_work(work["id"])

                    # Extract and chunk
                    documents = source.extract_text(file_path)
                    chunks = list(chunk_documents(documents, chunking_config))

                    # Add to store
                    if chunks:
                        added = vector_store.add_documents(chunks, show_progress=False)
                        total_chunks += added
                        print(f"({added} chunks)")
                    else:
                        print("(no content)")

                except Exception as e:
                    print(f"Error: {e}")

            print(f"  Added {total_chunks} chunks from {source_name}")

        except Exception as e:
            print(f"Error with {source_name}: {e}")

    # Final stats
    stats = vector_store.get_stats()
    print("\n" + "=" * 40)
    print(f"Total chunks in index: {stats['total_chunks']}")
    print(f"Unique works: {stats['works_count']}")
    print(f"Authors: {len(stats['authors'])}")


if __name__ == "__main__":
    main()
