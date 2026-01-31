"""
Database models and search for the classical texts library.

Uses SQLite with FTS5 for fast full-text search.
No AI, no external services - everything runs locally.
"""

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass
class Book:
    """A book/work in the library."""
    id: int | None
    title: str
    author: str
    source: str  # e.g., "mit_classics", "gutenberg", "uploaded"
    language: str  # e.g., "english", "greek", "latin"
    content: str  # Full text content
    year_written: str | None = None
    translator: str | None = None
    url: str | None = None
    added_at: datetime | None = None

    def snippet(self, length: int = 500) -> str:
        """Get a short snippet of the content."""
        if len(self.content) <= length:
            return self.content
        return self.content[:length].rsplit(' ', 1)[0] + '...'


@dataclass
class SearchResult:
    """A search result with highlighted matches."""
    book_id: int
    title: str
    author: str
    source: str
    snippet: str  # Text snippet with matches
    rank: float  # Relevance score


class Library:
    """The classical texts library with full-text search."""

    def __init__(self, db_path: str | Path = "data/library.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _get_conn(self):
        """Get a database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        """Initialize the database schema."""
        with self._get_conn() as conn:
            # Main books table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS books (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    author TEXT NOT NULL,
                    source TEXT NOT NULL,
                    language TEXT DEFAULT 'english',
                    content TEXT NOT NULL,
                    year_written TEXT,
                    translator TEXT,
                    url TEXT,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Full-text search index
            conn.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
                    title,
                    author,
                    content,
                    content='books',
                    content_rowid='id'
                )
            ''')

            # Triggers to keep FTS in sync
            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
                    INSERT INTO books_fts(rowid, title, author, content)
                    VALUES (new.id, new.title, new.author, new.content);
                END
            ''')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
                    INSERT INTO books_fts(books_fts, rowid, title, author, content)
                    VALUES('delete', old.id, old.title, old.author, old.content);
                END
            ''')

            conn.execute('''
                CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
                    INSERT INTO books_fts(books_fts, rowid, title, author, content)
                    VALUES('delete', old.id, old.title, old.author, old.content);
                    INSERT INTO books_fts(rowid, title, author, content)
                    VALUES (new.id, new.title, new.author, new.content);
                END
            ''')

            conn.commit()

    def add_book(self, book: Book) -> int:
        """Add a book to the library. Returns the book ID."""
        with self._get_conn() as conn:
            cursor = conn.execute('''
                INSERT INTO books (title, author, source, language, content,
                                   year_written, translator, url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (book.title, book.author, book.source, book.language,
                  book.content, book.year_written, book.translator, book.url))
            conn.commit()
            return cursor.lastrowid

    def get_book(self, book_id: int) -> Book | None:
        """Get a book by ID."""
        with self._get_conn() as conn:
            row = conn.execute(
                'SELECT * FROM books WHERE id = ?', (book_id,)
            ).fetchone()
            if row:
                return self._row_to_book(row)
        return None

    def search(
        self,
        query: str,
        author: str | None = None,
        source: str | None = None,
        limit: int = 50
    ) -> list[SearchResult]:
        """
        Search the library.

        Args:
            query: Search terms (supports AND, OR, NOT, "phrases")
            author: Filter by author name
            source: Filter by source
            limit: Maximum results

        Returns:
            List of search results with snippets
        """
        with self._get_conn() as conn:
            # Build the query
            sql = '''
                SELECT
                    books.id,
                    books.title,
                    books.author,
                    books.source,
                    snippet(books_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
                    bm25(books_fts) as rank
                FROM books_fts
                JOIN books ON books.id = books_fts.rowid
                WHERE books_fts MATCH ?
            '''
            params = [query]

            if author:
                sql += ' AND books.author LIKE ?'
                params.append(f'%{author}%')

            if source:
                sql += ' AND books.source = ?'
                params.append(source)

            sql += ' ORDER BY rank LIMIT ?'
            params.append(limit)

            rows = conn.execute(sql, params).fetchall()

            return [
                SearchResult(
                    book_id=row['id'],
                    title=row['title'],
                    author=row['author'],
                    source=row['source'],
                    snippet=row['snippet'],
                    rank=row['rank']
                )
                for row in rows
            ]

    def browse(
        self,
        author: str | None = None,
        source: str | None = None,
        limit: int = 100,
        offset: int = 0
    ) -> list[Book]:
        """Browse books with optional filters."""
        with self._get_conn() as conn:
            sql = 'SELECT * FROM books WHERE 1=1'
            params = []

            if author:
                sql += ' AND author LIKE ?'
                params.append(f'%{author}%')

            if source:
                sql += ' AND source = ?'
                params.append(source)

            sql += ' ORDER BY author, title LIMIT ? OFFSET ?'
            params.extend([limit, offset])

            rows = conn.execute(sql, params).fetchall()
            return [self._row_to_book(row) for row in rows]

    def get_authors(self) -> list[str]:
        """Get list of all authors."""
        with self._get_conn() as conn:
            rows = conn.execute(
                'SELECT DISTINCT author FROM books ORDER BY author'
            ).fetchall()
            return [row['author'] for row in rows]

    def get_sources(self) -> list[str]:
        """Get list of all sources."""
        with self._get_conn() as conn:
            rows = conn.execute(
                'SELECT DISTINCT source FROM books ORDER BY source'
            ).fetchall()
            return [row['source'] for row in rows]

    def get_stats(self) -> dict:
        """Get library statistics."""
        with self._get_conn() as conn:
            total = conn.execute('SELECT COUNT(*) as count FROM books').fetchone()['count']
            authors = conn.execute('SELECT COUNT(DISTINCT author) as count FROM books').fetchone()['count']
            sources = conn.execute('SELECT COUNT(DISTINCT source) as count FROM books').fetchone()['count']

            return {
                'total_books': total,
                'total_authors': authors,
                'total_sources': sources,
            }

    def delete_book(self, book_id: int) -> bool:
        """Delete a book by ID."""
        with self._get_conn() as conn:
            cursor = conn.execute('DELETE FROM books WHERE id = ?', (book_id,))
            conn.commit()
            return cursor.rowcount > 0

    def delete_by_source(self, source: str) -> int:
        """Delete all books from a source. Returns count deleted."""
        with self._get_conn() as conn:
            cursor = conn.execute('DELETE FROM books WHERE source = ?', (source,))
            conn.commit()
            return cursor.rowcount

    def book_exists(self, title: str, author: str, source: str) -> bool:
        """Check if a book already exists."""
        with self._get_conn() as conn:
            row = conn.execute(
                'SELECT 1 FROM books WHERE title = ? AND author = ? AND source = ?',
                (title, author, source)
            ).fetchone()
            return row is not None

    def _row_to_book(self, row: sqlite3.Row) -> Book:
        """Convert a database row to a Book object."""
        return Book(
            id=row['id'],
            title=row['title'],
            author=row['author'],
            source=row['source'],
            language=row['language'],
            content=row['content'],
            year_written=row['year_written'],
            translator=row['translator'],
            url=row['url'],
            added_at=row['added_at'],
        )
