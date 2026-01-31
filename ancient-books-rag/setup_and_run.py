#!/usr/bin/env python3
"""
Simple setup script for Ancient Books.

This script:
1. Checks if texts are already indexed
2. If not, downloads and indexes classical texts
3. Starts the web server

Just run: python setup_and_run.py
"""

import os
import sys
from pathlib import Path

# Add the project to the path
sys.path.insert(0, str(Path(__file__).parent))


def check_api_key():
    """Check if the Anthropic API key is set."""
    from dotenv import load_dotenv
    load_dotenv()

    key = os.getenv("ANTHROPIC_API_KEY")
    if not key or key == "your-api-key-here":
        print("\n" + "=" * 60)
        print("SETUP REQUIRED: Anthropic API Key")
        print("=" * 60)
        print("\n1. Go to: https://console.anthropic.com/settings/keys")
        print("2. Create a new API key")
        print("3. Open the file '.env' in this folder")
        print("4. Replace 'your-api-key-here' with your actual key")
        print("5. Save and run this script again")
        print("\n" + "=" * 60 + "\n")
        return False
    return True


def check_and_setup_texts():
    """Check if texts are indexed, if not, download and index them."""
    from src.embeddings import VectorStore

    print("Checking indexed texts...")
    store = VectorStore()
    stats = store.get_stats()

    if stats["total_chunks"] > 0:
        print(f"Found {stats['total_chunks']} passages from {stats['works_count']} works.")
        return True

    print("\nNo texts indexed yet. Let's download some classical texts...")
    print("This will take a few minutes on first run.\n")

    # Import and run ingestion
    from src.sources import get_source
    from src.chunking import ChunkingConfig, chunk_documents

    config = ChunkingConfig()
    total_added = 0

    # Start with MIT Classics - most reliable and fastest
    print("Downloading from MIT Internet Classics Archive...")
    try:
        source = get_source("mit_classics")
        works = source.list_works()
        print(f"Found {len(works)} works available.")

        # Download first 50 works for initial setup
        for i, work in enumerate(works[:50], 1):
            try:
                print(f"  [{i}/50] {work.get('title', work['id'])}...")
                file_path = source.download_work(work["id"])
                documents = list(source.extract_text(file_path))
                chunks = list(chunk_documents(iter(documents), config))
                if chunks:
                    added = store.add_documents(chunks, show_progress=False)
                    total_added += added
            except Exception as e:
                print(f"    (skipped: {e})")

    except Exception as e:
        print(f"Error with MIT Classics: {e}")

    print(f"\nDone! Indexed {total_added} passages.")
    return total_added > 0


def run_server():
    """Start the web server."""
    print("\n" + "=" * 60)
    print("Starting Ancient Books web server...")
    print("=" * 60)
    print("\nOpen your browser and go to:")
    print("\n    http://localhost:8000")
    print("\nPress Ctrl+C to stop the server.\n")

    import uvicorn
    from web.app import app

    uvicorn.run(app, host="0.0.0.0", port=8000)


def main():
    print("\n" + "=" * 60)
    print("       ANCIENT BOOKS - Classical Texts Research")
    print("=" * 60 + "\n")

    # Step 1: Check API key
    if not check_api_key():
        return

    # Step 2: Check/setup texts
    if not check_and_setup_texts():
        print("Failed to set up texts. Please check your internet connection.")
        return

    # Step 3: Run server
    run_server()


if __name__ == "__main__":
    main()
