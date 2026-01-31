"""
Web application for the Classical Texts Library.

Simple search and browse - no AI required.
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from src.library import Library
from src.importer import import_file

app = FastAPI(
    title="Classical Texts Library",
    description="Search and browse ancient texts from multiple sources",
)

# Mount static files and templates
web_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=web_dir / "static"), name="static")
templates = Jinja2Templates(directory=web_dir / "templates")

# Initialize library
library = Library()


class SearchQuery(BaseModel):
    query: str
    author: str | None = None
    source: str | None = None
    limit: int = 50


# =============================================================================
# Web Pages
# =============================================================================

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page."""
    stats = library.get_stats()
    return templates.TemplateResponse("index.html", {
        "request": request,
        "stats": stats,
    })


@app.get("/book/{book_id}", response_class=HTMLResponse)
async def view_book(request: Request, book_id: int):
    """View a single book."""
    book = library.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return templates.TemplateResponse("book.html", {
        "request": request,
        "book": book,
    })


@app.get("/browse", response_class=HTMLResponse)
async def browse_page(
    request: Request,
    author: str = None,
    source: str = None,
    page: int = 1
):
    """Browse all books."""
    limit = 50
    offset = (page - 1) * limit
    books = library.browse(author=author, source=source, limit=limit, offset=offset)
    authors = library.get_authors()
    sources = library.get_sources()

    return templates.TemplateResponse("browse.html", {
        "request": request,
        "books": books,
        "authors": authors,
        "sources": sources,
        "current_author": author,
        "current_source": source,
        "page": page,
    })


@app.get("/upload", response_class=HTMLResponse)
async def upload_page(request: Request):
    """Upload page."""
    return templates.TemplateResponse("upload.html", {"request": request})


# =============================================================================
# API Endpoints
# =============================================================================

@app.post("/api/search")
async def search(query: SearchQuery):
    """Search the library."""
    try:
        results = library.search(
            query=query.query,
            author=query.author,
            source=query.source,
            limit=query.limit
        )
        return {
            "results": [
                {
                    "book_id": r.book_id,
                    "title": r.title,
                    "author": r.author,
                    "source": r.source,
                    "snippet": r.snippet,
                }
                for r in results
            ],
            "count": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/book/{book_id}")
async def get_book(book_id: int):
    """Get a book by ID."""
    book = library.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return {
        "id": book.id,
        "title": book.title,
        "author": book.author,
        "source": book.source,
        "language": book.language,
        "content": book.content,
        "year_written": book.year_written,
        "translator": book.translator,
        "url": book.url,
    }


@app.get("/api/authors")
async def get_authors():
    """Get all authors."""
    return {"authors": library.get_authors()}


@app.get("/api/sources")
async def get_sources():
    """Get all sources."""
    return {"sources": library.get_sources()}


@app.get("/api/stats")
async def get_stats():
    """Get library statistics."""
    return library.get_stats()


@app.post("/api/upload")
async def upload_book(
    file: UploadFile = File(...),
    title: str = Form(None),
    author: str = Form(None),
):
    """Upload a book file."""
    # Save to temp file
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # Import the file
        book = import_file(
            tmp_path,
            title=title or None,
            author=author or None,
            source="uploaded"
        )

        # Check if already exists
        if library.book_exists(book.title, book.author, book.source):
            return {"success": False, "error": "Book already exists"}

        # Add to library
        book_id = library.add_book(book)

        return {
            "success": True,
            "book_id": book_id,
            "title": book.title,
            "author": book.author,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        # Cleanup
        tmp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
