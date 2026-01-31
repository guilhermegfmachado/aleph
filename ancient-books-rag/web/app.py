"""Web application for Ancient Books RAG."""

import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

app = FastAPI(
    title="Ancient Books",
    description="Search and ask questions about classical texts",
)

# Mount static files and templates
web_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=web_dir / "static"), name="static")
templates = Jinja2Templates(directory=web_dir / "templates")

# Initialize RAG engine (lazy loading)
_rag_engine = None


def get_rag_engine():
    """Get or create the RAG engine."""
    global _rag_engine
    if _rag_engine is None:
        from src.rag import RAGEngine
        _rag_engine = RAGEngine()
    return _rag_engine


class Question(BaseModel):
    """A question to ask."""
    query: str
    author_filter: str | None = None
    source_filter: str | None = None
    num_sources: int = 8


class SearchQuery(BaseModel):
    """A search query."""
    query: str
    author_filter: str | None = None
    limit: int = 20


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Render the home page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/ask")
async def ask_question(question: Question):
    """Ask a question and get an answer with citations."""
    try:
        rag = get_rag_engine()

        response = rag.query(
            question=question.query,
            n_sources=question.num_sources,
            author_filter=question.author_filter,
            source_filter=question.source_filter,
        )

        # Format citations for the frontend
        citations = []
        for i, citation in enumerate(response.citations, 1):
            citations.append({
                "number": i,
                "author": citation.author,
                "title": citation.title,
                "section": citation.section,
                "passage": citation.passage,
                "score": round(citation.score, 3),
                "url": citation.url,
            })

        return {
            "answer": response.answer,
            "citations": citations,
            "sources_used": response.sources_used,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search")
async def search_texts(search: SearchQuery):
    """Search for passages in the texts."""
    try:
        rag = get_rag_engine()

        where = {}
        if search.author_filter:
            where["author"] = search.author_filter

        results = rag.vector_store.search(
            query=search.query,
            n_results=search.limit,
            where=where if where else None,
        )

        # Format results
        formatted = []
        for result in results:
            formatted.append({
                "author": result["metadata"].get("author", "Unknown"),
                "title": result["metadata"].get("title", "Unknown"),
                "passage": result["content"],
                "score": round(result["score"], 3),
                "source": result["metadata"].get("source", "unknown"),
            })

        return {"results": formatted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats():
    """Get statistics about indexed texts."""
    try:
        rag = get_rag_engine()
        stats = rag.vector_store.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/authors")
async def get_authors():
    """Get list of all indexed authors."""
    try:
        rag = get_rag_engine()
        stats = rag.vector_store.get_stats()
        return {"authors": stats["authors"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
