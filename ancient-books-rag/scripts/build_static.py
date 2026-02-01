#!/usr/bin/env python3
"""
Build static site data for GitHub Pages.

This script:
1. Exports the library database to JSON
2. Creates the docs/data/library.json file

Run after populating the library:
  python scripts/build_static.py
"""

import json
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.library import Library


def build_static():
    print("=" * 50)
    print("   borges - building static site data")
    print("=" * 50)

    library = Library()
    stats = library.get_stats()

    print(f"\nlibrary: {stats['total_books']} books, {stats['total_authors']} authors")

    # Get all books
    books = library.get_all_books()

    # Convert to JSON-serializable format
    books_data = []
    for book in books:
        books_data.append({
            "id": book.id,
            "title": book.title,
            "author": book.author,
            "source": book.source,
            "language": book.language,
            "content": book.content,
            "url": book.url
        })

    # Create docs/data directory
    data_dir = Path(__file__).parent.parent / "docs" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    # Write JSON
    output_file = data_dir / "library.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({"books": books_data}, f, ensure_ascii=False)

    # Calculate file size
    file_size = output_file.stat().st_size
    size_mb = file_size / (1024 * 1024)

    print(f"\n+ exported {len(books_data)} books to docs/data/library.json")
    print(f"  file size: {size_mb:.2f} MB")

    if size_mb > 50:
        print("\n  warning: file is large (>50MB)")
        print("  github pages has a 100MB limit per file")
        print("  consider splitting the data or using compression")

    print("\n" + "=" * 50)
    print("  static site ready in docs/")
    print("  push to github and enable pages from /docs folder")
    print("=" * 50)


if __name__ == "__main__":
    build_static()
