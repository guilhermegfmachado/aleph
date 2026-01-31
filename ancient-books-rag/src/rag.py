"""RAG (Retrieval-Augmented Generation) engine with Claude integration."""

from dataclasses import dataclass, field
from typing import Iterator

import anthropic

from .config import settings
from .embeddings import VectorStore


@dataclass
class Citation:
    """A citation to a source passage."""

    author: str
    title: str
    section: str | None
    source: str
    passage: str
    score: float
    url: str | None = None

    def format(self, include_passage: bool = False) -> str:
        """Format the citation as a string."""
        parts = [self.author, self.title]
        if self.section:
            parts.append(self.section)
        citation = ", ".join(filter(None, parts))
        if self.source:
            citation += f" [{self.source}]"
        if self.url:
            citation += f" <{self.url}>"
        if include_passage:
            # Truncate passage for display
            passage = self.passage[:200] + "..." if len(self.passage) > 200 else self.passage
            citation += f'\n  "{passage}"'
        return citation


@dataclass
class RAGResponse:
    """Response from the RAG engine."""

    answer: str
    citations: list[Citation]
    query: str
    model: str
    sources_used: int

    def format(self, show_passages: bool = False) -> str:
        """Format the response for display."""
        output = [self.answer, "", "---", "Sources:"]
        for i, citation in enumerate(self.citations, 1):
            output.append(f"  [{i}] {citation.format(include_passage=show_passages)}")
        return "\n".join(output)


class RAGEngine:
    """RAG engine that combines retrieval with Claude for grounded answers."""

    SYSTEM_PROMPT = """You are a classical scholar assistant with expertise in ancient Greek, Roman, and other classical texts. Your role is to provide accurate, well-researched answers based ONLY on the source passages provided.

CRITICAL RULES:
1. ONLY use information from the provided source passages. Do not use any other knowledge.
2. If the passages don't contain enough information to answer the question, say so clearly.
3. Always cite your sources using [1], [2], etc. corresponding to the passage numbers.
4. Quote relevant passages directly when appropriate.
5. If passages seem to contradict each other, note this and explain the different perspectives.
6. Be precise about what the sources actually say vs. your interpretation.
7. If asked about something not covered in the passages, explicitly state that the provided sources don't address this topic.

Your goal is to be a trustworthy research assistant - never hallucinate or make up information."""

    def __init__(
        self,
        vector_store: VectorStore | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ):
        """Initialize the RAG engine.

        Args:
            vector_store: Vector store for retrieval (creates default if None)
            api_key: Anthropic API key (uses settings if None)
            model: Claude model to use (uses settings if None)
        """
        self.vector_store = vector_store or VectorStore()
        self.model = model or settings.claude_model

        api_key = api_key or settings.anthropic_api_key
        if not api_key:
            raise ValueError(
                "Anthropic API key required. Set ANTHROPIC_API_KEY environment variable."
            )

        self.client = anthropic.Anthropic(api_key=api_key)

    def query(
        self,
        question: str,
        n_sources: int = 10,
        author_filter: str | None = None,
        source_filter: str | None = None,
        min_relevance: float = 0.3,
        stream: bool = False,
    ) -> RAGResponse | Iterator[str]:
        """Query the RAG system.

        Args:
            question: The question to answer
            n_sources: Number of source passages to retrieve
            author_filter: Filter results to a specific author
            source_filter: Filter results to a specific source
            min_relevance: Minimum relevance score for passages
            stream: If True, yields response tokens as they're generated

        Returns:
            RAGResponse with answer and citations, or token iterator if streaming
        """
        # Build filter conditions
        where = {}
        if author_filter:
            where["author"] = author_filter
        if source_filter:
            where["source"] = source_filter

        # Retrieve relevant passages
        results = self.vector_store.search(
            query=question,
            n_results=n_sources,
            where=where if where else None,
            min_score=min_relevance,
        )

        if not results:
            no_sources_response = RAGResponse(
                answer="I couldn't find any relevant passages in the indexed texts to answer your question. Try rephrasing your question or check if the relevant texts have been indexed.",
                citations=[],
                query=question,
                model=self.model,
                sources_used=0,
            )
            if stream:
                yield no_sources_response.answer
                return
            return no_sources_response

        # Build context from retrieved passages
        context = self._build_context(results)

        # Build the user message
        user_message = f"""Based on the following passages from classical texts, please answer this question:

QUESTION: {question}

SOURCE PASSAGES:
{context}

Please provide a well-reasoned answer citing the relevant passages. Remember to only use information from these passages."""

        # Generate response with Claude
        if stream:
            return self._stream_response(user_message, question, results)
        else:
            return self._generate_response(user_message, question, results)

    def _build_context(self, results: list[dict]) -> str:
        """Build context string from search results."""
        passages = []
        for i, result in enumerate(results, 1):
            metadata = result["metadata"]
            header = f"[{i}] {metadata.get('author', 'Unknown')} - {metadata.get('title', 'Unknown')}"
            if metadata.get("section"):
                header += f", {metadata['section']}"
            if metadata.get("translator"):
                header += f" (trans. {metadata['translator']})"

            passages.append(f"{header}\n{result['content']}")

        return "\n\n---\n\n".join(passages)

    def _generate_response(
        self, user_message: str, question: str, results: list[dict]
    ) -> RAGResponse:
        """Generate a response using Claude."""
        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        answer = message.content[0].text

        # Build citations
        citations = self._build_citations(results)

        return RAGResponse(
            answer=answer,
            citations=citations,
            query=question,
            model=self.model,
            sources_used=len(results),
        )

    def _stream_response(
        self, user_message: str, question: str, results: list[dict]
    ) -> Iterator[str]:
        """Stream a response using Claude."""
        with self.client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            full_response = ""
            for text in stream.text_stream:
                full_response += text
                yield text

            # Yield citations at the end
            yield "\n\n---\nSources:\n"
            for i, citation in enumerate(self._build_citations(results), 1):
                yield f"  [{i}] {citation.format()}\n"

    def _build_citations(self, results: list[dict]) -> list[Citation]:
        """Build Citation objects from search results."""
        citations = []
        for result in results:
            metadata = result["metadata"]
            citations.append(
                Citation(
                    author=metadata.get("author", "Unknown"),
                    title=metadata.get("title", "Unknown"),
                    section=metadata.get("section"),
                    source=metadata.get("source", "unknown"),
                    passage=result["content"],
                    score=result["score"],
                    url=metadata.get("url"),
                )
            )
        return citations

    def get_sources_summary(self) -> str:
        """Get a summary of available sources."""
        stats = self.vector_store.get_stats()

        lines = [
            f"Total indexed chunks: {stats['total_chunks']}",
            f"Works: {stats['works_count']}",
            "",
            "Sources:",
        ]
        for source in stats["sources"]:
            lines.append(f"  - {source}")

        lines.append("")
        lines.append("Authors (sample):")
        for author in stats["authors"][:20]:  # Show first 20
            lines.append(f"  - {author}")
        if len(stats["authors"]) > 20:
            lines.append(f"  ... and {len(stats['authors']) - 20} more")

        return "\n".join(lines)


class ConversationalRAG:
    """Conversational wrapper for RAG with memory."""

    def __init__(self, rag_engine: RAGEngine | None = None):
        """Initialize conversational RAG.

        Args:
            rag_engine: The underlying RAG engine
        """
        self.rag = rag_engine or RAGEngine()
        self.history: list[dict] = []
        self.context_window: int = 5  # Number of previous exchanges to include

    def chat(
        self,
        message: str,
        author_filter: str | None = None,
        source_filter: str | None = None,
    ) -> RAGResponse:
        """Send a message and get a response with conversation context.

        Args:
            message: The user's message
            author_filter: Optional author filter
            source_filter: Optional source filter

        Returns:
            RAGResponse with answer and citations
        """
        # Build context from history
        history_context = ""
        if self.history:
            recent = self.history[-self.context_window :]
            history_lines = []
            for exchange in recent:
                history_lines.append(f"User: {exchange['question']}")
                history_lines.append(f"Assistant: {exchange['answer'][:500]}...")
            history_context = (
                "\n\nPrevious conversation:\n" + "\n".join(history_lines) + "\n\n"
            )

        # Augment the question with context
        augmented_question = history_context + message if history_context else message

        # Get response
        response = self.rag.query(
            question=augmented_question,
            author_filter=author_filter,
            source_filter=source_filter,
        )

        # Store in history
        self.history.append(
            {
                "question": message,
                "answer": response.answer,
                "citations": response.citations,
            }
        )

        return response

    def clear_history(self) -> None:
        """Clear conversation history."""
        self.history = []
