"""Vector database and embedding management."""

from pathlib import Path
from typing import Iterator

import chromadb
from chromadb.config import Settings as ChromaSettings

from .config import settings
from .sources.base import Document


class VectorStore:
    """ChromaDB-based vector store for document embeddings."""

    def __init__(
        self,
        collection_name: str = "ancient_texts",
        persist_dir: Path | None = None,
        embedding_model: str | None = None,
    ):
        """Initialize the vector store.

        Args:
            collection_name: Name of the ChromaDB collection
            persist_dir: Directory to persist the database
            embedding_model: Sentence transformer model name
        """
        self.collection_name = collection_name
        self.persist_dir = persist_dir or settings.chroma_dir
        self.embedding_model_name = embedding_model or settings.embedding_model

        # Ensure directory exists
        self.persist_dir.mkdir(parents=True, exist_ok=True)

        # Initialize ChromaDB with persistence
        self.client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )

        # Get or create collection with embedding function
        self._embedding_function = self._create_embedding_function()
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self._embedding_function,
            metadata={"description": "Ancient classical texts for RAG"},
        )

    def _create_embedding_function(self):
        """Create the embedding function using sentence-transformers."""
        from chromadb.utils import embedding_functions

        return embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=self.embedding_model_name
        )

    def add_documents(
        self,
        documents: list[Document] | Iterator[Document],
        batch_size: int = 100,
        show_progress: bool = True,
    ) -> int:
        """Add documents to the vector store.

        Args:
            documents: Documents to add
            batch_size: Number of documents to add at once
            show_progress: Whether to show a progress bar

        Returns:
            Number of documents added
        """
        if not isinstance(documents, list):
            documents = list(documents)

        if show_progress:
            from tqdm import tqdm

            documents = tqdm(documents, desc="Adding documents")

        total_added = 0
        batch_docs = []
        batch_ids = []
        batch_metadatas = []

        for doc in documents:
            # Skip if already exists
            if self._document_exists(doc.chunk_id):
                continue

            batch_docs.append(doc.content)
            batch_ids.append(doc.chunk_id)
            batch_metadatas.append(self._metadata_to_dict(doc.metadata))

            if len(batch_docs) >= batch_size:
                self.collection.add(
                    documents=batch_docs,
                    ids=batch_ids,
                    metadatas=batch_metadatas,
                )
                total_added += len(batch_docs)
                batch_docs = []
                batch_ids = []
                batch_metadatas = []

        # Add remaining documents
        if batch_docs:
            self.collection.add(
                documents=batch_docs,
                ids=batch_ids,
                metadatas=batch_metadatas,
            )
            total_added += len(batch_docs)

        return total_added

    def _document_exists(self, doc_id: str) -> bool:
        """Check if a document already exists in the collection."""
        try:
            result = self.collection.get(ids=[doc_id])
            return len(result["ids"]) > 0
        except Exception:
            return False

    def _metadata_to_dict(self, metadata) -> dict:
        """Convert SourceMetadata to a flat dictionary for ChromaDB."""
        result = {
            "source": metadata.source,
            "author": metadata.author,
            "title": metadata.title,
            "work_id": metadata.work_id or "",
        }

        # Add optional fields if present
        if metadata.url:
            result["url"] = metadata.url
        if metadata.translator:
            result["translator"] = metadata.translator
        if metadata.original_language:
            result["original_language"] = metadata.original_language
        if metadata.section:
            result["section"] = metadata.section
        if metadata.date_written:
            result["date_written"] = metadata.date_written

        return result

    def search(
        self,
        query: str,
        n_results: int = 10,
        where: dict | None = None,
        min_score: float | None = None,
    ) -> list[dict]:
        """Search for relevant documents.

        Args:
            query: The search query
            n_results: Maximum number of results
            where: Optional filter conditions (e.g., {"author": "Plato"})
            min_score: Minimum similarity score (0-1, higher is more similar)

        Returns:
            List of result dicts with 'content', 'metadata', 'score', 'id'
        """
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        # Convert ChromaDB results to a cleaner format
        formatted_results = []

        if results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                # ChromaDB returns L2 distance, convert to similarity score
                # Lower distance = higher similarity
                distance = results["distances"][0][i] if results["distances"] else 0
                # Convert L2 distance to a 0-1 similarity score
                # Using a simple transformation: score = 1 / (1 + distance)
                score = 1 / (1 + distance)

                if min_score is not None and score < min_score:
                    continue

                formatted_results.append(
                    {
                        "id": doc_id,
                        "content": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                        "score": score,
                    }
                )

        return formatted_results

    def get_stats(self) -> dict:
        """Get statistics about the vector store."""
        count = self.collection.count()

        # Get unique sources and authors
        all_metadata = self.collection.get(include=["metadatas"])

        sources = set()
        authors = set()
        works = set()

        for meta in all_metadata.get("metadatas", []):
            if meta:
                sources.add(meta.get("source", "unknown"))
                authors.add(meta.get("author", "unknown"))
                works.add(f"{meta.get('author', 'unknown')} - {meta.get('title', 'unknown')}")

        return {
            "total_chunks": count,
            "sources": sorted(sources),
            "authors": sorted(authors),
            "works_count": len(works),
        }

    def delete_by_source(self, source: str) -> int:
        """Delete all documents from a specific source.

        Args:
            source: The source name (e.g., 'mit_classics')

        Returns:
            Number of documents deleted
        """
        # Get IDs of documents to delete
        results = self.collection.get(
            where={"source": source},
            include=[],
        )

        if results["ids"]:
            self.collection.delete(ids=results["ids"])
            return len(results["ids"])

        return 0

    def clear(self) -> None:
        """Clear all documents from the collection."""
        self.client.delete_collection(self.collection_name)
        self.collection = self.client.create_collection(
            name=self.collection_name,
            embedding_function=self._embedding_function,
            metadata={"description": "Ancient classical texts for RAG"},
        )
