"""Command-line interface for Ancient Books RAG."""

import sys

import click
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.prompt import Prompt
from rich.table import Table

console = Console()


@click.group()
@click.version_option(version="0.1.0")
def main():
    """Ancient Books RAG - Query classical texts with AI-powered research."""
    pass


@main.command()
@click.argument("question", nargs=-1, required=False)
@click.option("--author", "-a", help="Filter by author name")
@click.option("--source", "-s", help="Filter by source (mit_classics, gutenberg, etc.)")
@click.option("--sources", "-n", default=10, help="Number of source passages to retrieve")
@click.option("--stream", is_flag=True, help="Stream the response")
@click.option("--show-passages", is_flag=True, help="Show full passages in citations")
def ask(question, author, source, sources, stream, show_passages):
    """Ask a question about classical texts.

    If no question is provided, enters interactive mode.
    """
    from .rag import RAGEngine

    # Check for API key
    from .config import settings

    if not settings.anthropic_api_key:
        console.print(
            "[red]Error:[/red] ANTHROPIC_API_KEY not set. "
            "Please set it in your environment or .env file."
        )
        sys.exit(1)

    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            progress.add_task("Loading RAG engine...", total=None)
            rag = RAGEngine()

        # Check if we have any indexed documents
        stats = rag.vector_store.get_stats()
        if stats["total_chunks"] == 0:
            console.print(
                "[yellow]Warning:[/yellow] No documents indexed yet. "
                "Run 'ancient-rag ingest' first to add texts."
            )
            sys.exit(1)

    except Exception as e:
        console.print(f"[red]Error initializing RAG engine:[/red] {e}")
        sys.exit(1)

    if question:
        # Single question mode
        question_text = " ".join(question)
        _ask_question(rag, question_text, author, source, sources, stream, show_passages)
    else:
        # Interactive mode
        _interactive_mode(rag, author, source, sources, show_passages)


def _ask_question(rag, question, author, source, sources, stream, show_passages):
    """Ask a single question and display the response."""
    console.print(f"\n[bold]Question:[/bold] {question}\n")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        progress.add_task("Searching sources and generating response...", total=None)

        if stream:
            console.print("[bold]Answer:[/bold]")
            for chunk in rag.query(
                question,
                n_sources=sources,
                author_filter=author,
                source_filter=source,
                stream=True,
            ):
                console.print(chunk, end="")
            console.print()
        else:
            response = rag.query(
                question,
                n_sources=sources,
                author_filter=author,
                source_filter=source,
            )

            # Display answer
            console.print(Panel(Markdown(response.answer), title="Answer", border_style="green"))

            # Display citations
            console.print("\n[bold]Sources:[/bold]")
            for i, citation in enumerate(response.citations, 1):
                console.print(f"  [{i}] {citation.format(include_passage=show_passages)}")


def _interactive_mode(rag, author, source, sources, show_passages):
    """Run interactive chat mode."""
    from .rag import ConversationalRAG

    console.print(
        Panel(
            "Welcome to Ancient Books RAG!\n"
            "Ask questions about classical texts and get grounded answers.\n\n"
            "Commands:\n"
            "  /sources - Show available sources\n"
            "  /filter author <name> - Filter by author\n"
            "  /filter source <name> - Filter by source\n"
            "  /clear - Clear conversation history\n"
            "  /quit or /exit - Exit\n",
            title="Interactive Mode",
            border_style="blue",
        )
    )

    conv_rag = ConversationalRAG(rag)
    current_author = author
    current_source = source

    while True:
        try:
            question = Prompt.ask("\n[bold cyan]You[/bold cyan]")
        except (KeyboardInterrupt, EOFError):
            console.print("\nGoodbye!")
            break

        question = question.strip()
        if not question:
            continue

        # Handle commands
        if question.startswith("/"):
            if question in ("/quit", "/exit", "/q"):
                console.print("Goodbye!")
                break
            elif question == "/sources":
                console.print(rag.get_sources_summary())
                continue
            elif question == "/clear":
                conv_rag.clear_history()
                console.print("[green]Conversation history cleared.[/green]")
                continue
            elif question.startswith("/filter author "):
                current_author = question[15:].strip() or None
                console.print(f"[green]Author filter: {current_author or 'None'}[/green]")
                continue
            elif question.startswith("/filter source "):
                current_source = question[15:].strip() or None
                console.print(f"[green]Source filter: {current_source or 'None'}[/green]")
                continue
            elif question == "/filter":
                console.print(f"Current filters: author={current_author}, source={current_source}")
                continue
            else:
                console.print("[yellow]Unknown command. Type /help for available commands.[/yellow]")
                continue

        # Ask the question
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            progress.add_task("Thinking...", total=None)
            response = conv_rag.chat(
                question,
                author_filter=current_author,
                source_filter=current_source,
            )

        console.print(f"\n[bold green]Assistant:[/bold green]")
        console.print(Markdown(response.answer))

        if response.citations:
            console.print("\n[dim]Sources:[/dim]")
            for i, citation in enumerate(response.citations[:5], 1):  # Show top 5
                console.print(f"  [dim][{i}] {citation.author} - {citation.title}[/dim]")


@main.command()
@click.option("--source", "-s", multiple=True, help="Sources to ingest (can specify multiple)")
@click.option("--limit", "-l", type=int, help="Limit number of works per source")
@click.option("--clear", is_flag=True, help="Clear existing index before ingesting")
def ingest(source, limit, clear):
    """Ingest texts from data sources into the vector database."""
    from .chunking import ChunkingConfig, chunk_documents
    from .embeddings import VectorStore
    from .sources import get_source

    available_sources = ["mit_classics", "gutenberg", "perseus", "loebolus", "sacred_texts"]

    if not source:
        console.print("[yellow]No sources specified. Available sources:[/yellow]")
        for s in available_sources:
            console.print(f"  - {s}")
        console.print("\nExample: ancient-rag ingest -s mit_classics -s gutenberg")
        return

    # Validate sources
    for s in source:
        if s not in available_sources:
            console.print(f"[red]Unknown source: {s}[/red]")
            console.print(f"Available: {', '.join(available_sources)}")
            return

    # Initialize vector store
    vector_store = VectorStore()

    if clear:
        console.print("[yellow]Clearing existing index...[/yellow]")
        vector_store.clear()

    chunking_config = ChunkingConfig()
    total_added = 0

    for source_name in source:
        console.print(f"\n[bold]Processing {source_name}...[/bold]")

        try:
            source_connector = get_source(source_name)

            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
            ) as progress:
                # List works
                task = progress.add_task(f"Listing works from {source_name}...", total=None)
                works = source_connector.list_works()
                progress.remove_task(task)

                console.print(f"  Found {len(works)} works")

                if limit:
                    works = works[:limit]
                    console.print(f"  (Limited to {limit})")

                # Download and process each work
                for work in works:
                    try:
                        task = progress.add_task(
                            f"Processing: {work.get('title', work['id'])[:50]}...", total=None
                        )

                        # Download
                        file_path = source_connector.download_work(work["id"])

                        # Extract text
                        documents = list(source_connector.extract_text(file_path))

                        # Chunk documents
                        chunks = list(chunk_documents(iter(documents), chunking_config))

                        # Add to vector store
                        if chunks:
                            added = vector_store.add_documents(chunks, show_progress=False)
                            total_added += added

                        progress.remove_task(task)

                    except Exception as e:
                        console.print(f"  [red]Error processing {work['id']}: {e}[/red]")

        except Exception as e:
            console.print(f"[red]Error with source {source_name}: {e}[/red]")

    console.print(f"\n[green]Done! Added {total_added} chunks to the index.[/green]")

    # Show stats
    stats = vector_store.get_stats()
    console.print(f"Total chunks in index: {stats['total_chunks']}")


@main.command()
def stats():
    """Show statistics about the indexed texts."""
    from .embeddings import VectorStore

    vector_store = VectorStore()
    stats = vector_store.get_stats()

    table = Table(title="Index Statistics")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Total Chunks", str(stats["total_chunks"]))
    table.add_row("Unique Works", str(stats["works_count"]))
    table.add_row("Sources", ", ".join(stats["sources"]) or "None")
    table.add_row("Authors", str(len(stats["authors"])))

    console.print(table)

    if stats["authors"]:
        console.print("\n[bold]Sample Authors:[/bold]")
        for author in stats["authors"][:15]:
            console.print(f"  - {author}")
        if len(stats["authors"]) > 15:
            console.print(f"  ... and {len(stats['authors']) - 15} more")


@main.command()
def sources():
    """List available data sources."""
    from .config import DATA_SOURCES

    table = Table(title="Available Data Sources")
    table.add_column("ID", style="cyan")
    table.add_column("Name", style="green")
    table.add_column("Type", style="yellow")
    table.add_column("Description")

    for source_id, info in DATA_SOURCES.items():
        table.add_row(
            source_id,
            info["name"],
            info["type"],
            info["description"][:60] + "..." if len(info["description"]) > 60 else info["description"],
        )

    console.print(table)


if __name__ == "__main__":
    main()
