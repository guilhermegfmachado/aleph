#!/usr/bin/env python3
"""
Build static site data for GitHub Pages.

This script:
1. Exports library index to docs/data/library-index.json (metadata only)
2. Exports individual book texts to docs/data/texts/{id}.json
3. Supports lazy loading - index is small, texts load on demand

Run after populating the library:
  python scripts/build_static.py
  python scripts/build_static.py --db-path ../docs/data/library.db
"""

import argparse
import json
import gzip
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.library import Library


def build_static(db_path: str = "data/library.db"):
    print("=" * 50)
    print("   borges - building static site data")
    print("=" * 50)

    library = Library(db_path=db_path)
    stats = library.get_stats()

    print(f"\nlibrary: {stats['total_books']} books, {stats['total_authors']} authors")

    # Get all books
    books = library.get_all_books()

    # Create docs/data directory
    data_dir = Path(__file__).parent.parent / "docs" / "data"
    texts_dir = data_dir / "texts"
    data_dir.mkdir(parents=True, exist_ok=True)
    texts_dir.mkdir(parents=True, exist_ok=True)

    # Build index (metadata + snippet for search/preview)
    index_data = []
    for book in books:
        # Create a snippet for search (first 1000 chars, cleaned)
        snippet = ""
        if book.content:
            snippet = book.content[:1000].replace("\n", " ").strip()

        index_data.append({
            "id": book.id,
            "title": book.title,
            "author": book.author,
            "source": book.source,
            "language": book.language,
            "url": book.url,
            "snippet": snippet,
            "length": len(book.content) if book.content else 0
        })

    # Write index
    index_file = data_dir / "library-index.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump({"books": index_data, "total": len(index_data)}, f, ensure_ascii=False)

    index_size = index_file.stat().st_size / (1024 * 1024)
    print(f"\n+ exported index: {len(index_data)} books ({index_size:.2f} MB)")

    # Write individual text files
    print(f"+ exporting individual text files...")

    for book in books:
        text_file = texts_dir / f"{book.id}.json"
        book_data = {
            "id": book.id,
            "title": book.title,
            "author": book.author,
            "source": book.source,
            "language": book.language,
            "content": book.content,
            "url": book.url
        }
        with open(text_file, "w", encoding="utf-8") as f:
            json.dump(book_data, f, ensure_ascii=False)

    print(f"  + wrote {len(books)} text files to docs/data/texts/")

    # Calculate total size
    total_size = sum(f.stat().st_size for f in texts_dir.glob("*.json"))
    total_size_mb = total_size / (1024 * 1024)
    print(f"  + total texts size: {total_size_mb:.2f} MB")

    # Also create a compressed version of the index for faster loading
    index_gz = data_dir / "library-index.json.gz"
    with gzip.open(index_gz, "wt", encoding="utf-8") as f:
        json.dump({"books": index_data, "total": len(index_data)}, f, ensure_ascii=False)

    gz_size = index_gz.stat().st_size / (1024 * 1024)
    print(f"  + compressed index: {gz_size:.2f} MB")

    print("\n" + "=" * 50)
    print("  static site ready in docs/")
    print("  index loads first, texts load on demand")
    print("=" * 50)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build static site data from library")
    parser.add_argument(
        "--db-path",
        default="data/library.db",
        help="Path to the SQLite database"
    )
    args = parser.parse_args()
    build_static(db_path=args.db_path)
