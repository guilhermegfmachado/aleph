#!/usr/bin/env python3
"""Quick test script to verify the RAG system is working."""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def main():
    print("Ancient Books RAG - Quick Test")
    print("=" * 40)

    # Check environment
    print("\n1. Checking environment...")
    from src.config import settings

    if not settings.anthropic_api_key:
        print("   ERROR: ANTHROPIC_API_KEY not set")
        print("   Please set it in your .env file or environment")
        return False
    print("   OK: API key configured")

    # Check vector store
    print("\n2. Checking vector store...")
    try:
        from src.embeddings import VectorStore

        store = VectorStore()
        stats = store.get_stats()
        print(f"   OK: {stats['total_chunks']} chunks indexed")

        if stats["total_chunks"] == 0:
            print("   WARNING: No documents indexed. Run ingest_all.py first.")
            return False

    except Exception as e:
        print(f"   ERROR: {e}")
        return False

    # Test RAG
    print("\n3. Testing RAG query...")
    try:
        from src.rag import RAGEngine

        rag = RAGEngine()
        response = rag.query(
            "What does Plato say about justice?",
            n_sources=3,
        )

        print(f"   OK: Got response with {len(response.citations)} citations")
        print(f"\n   Answer preview:")
        print(f"   {response.answer[:300]}...")

    except Exception as e:
        print(f"   ERROR: {e}")
        return False

    print("\n" + "=" * 40)
    print("All tests passed! The system is ready to use.")
    print("\nTry: python -m src.cli ask 'What did Aristotle say about virtue?'")
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
