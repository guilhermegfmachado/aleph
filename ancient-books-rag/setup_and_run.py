#!/usr/bin/env python3
"""
Borges - The Searchable Library

Simple setup script that:
1. Checks if books are in the library
2. If not, downloads classical texts
3. Starts the web server

Just run: python setup_and_run.py
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def check_and_populate():
    """Check if library has books, populate if empty."""
    from src.library import Library

    library = Library()
    stats = library.get_stats()

    if stats['total_books'] > 0:
        print(f"✓ Library has {stats['total_books']} books from {stats['total_authors']} authors")
        return True

    print("\n📚 Library is empty. Let's add some classical texts...")
    print("This will take a few minutes on first run.\n")

    # Run the populate script
    script = Path(__file__).parent / "scripts" / "populate_library.py"
    subprocess.run([sys.executable, str(script), "--source", "mit", "--limit", "100"])

    # Check again
    stats = library.get_stats()
    return stats['total_books'] > 0


def run_server():
    """Start the web server."""
    print("\n" + "=" * 50)
    print("   📚 BORGES - Starting web server...")
    print("=" * 50)
    print("\nOpen your browser and go to:")
    print("\n    http://localhost:8000")
    print("\nPress Ctrl+C to stop.\n")

    import uvicorn
    from web.app import app

    uvicorn.run(app, host="0.0.0.0", port=8000)


def main():
    print("\n" + "=" * 50)
    print("   📚 BORGES - The Searchable Library of Babel")
    print("=" * 50 + "\n")

    # Check/populate library
    if not check_and_populate():
        print("\n⚠ Could not populate library. Check your internet connection.")
        print("You can still run the server and upload books manually.\n")

    # Run server
    run_server()


if __name__ == "__main__":
    main()
