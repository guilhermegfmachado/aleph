"""
Import books from various file formats.

Supports: TXT, PDF, EPUB, HTML
"""

import re
from pathlib import Path

from .library import Book


def import_file(
    file_path: Path | str,
    title: str | None = None,
    author: str | None = None,
    source: str = "uploaded"
) -> Book:
    """
    Import a book from a file.

    Args:
        file_path: Path to the file
        title: Book title (auto-detected from filename if not provided)
        author: Author name (defaults to "Unknown" if not provided)
        source: Source identifier

    Returns:
        Book object ready to add to library
    """
    file_path = Path(file_path)
    suffix = file_path.suffix.lower()

    # Auto-detect title from filename
    if not title:
        title = file_path.stem.replace('_', ' ').replace('-', ' ').title()

    if not author:
        author = "Unknown"

    # Extract content based on file type
    if suffix == '.txt':
        content = import_txt(file_path)
    elif suffix == '.pdf':
        content = import_pdf(file_path)
    elif suffix == '.epub':
        content = import_epub(file_path)
    elif suffix in ['.html', '.htm']:
        content = import_html(file_path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    return Book(
        id=None,
        title=title,
        author=author,
        source=source,
        language="english",  # Default, could be auto-detected
        content=content,
    )


def import_txt(file_path: Path) -> str:
    """Import a plain text file."""
    # Try different encodings
    for encoding in ['utf-8', 'latin-1', 'cp1252']:
        try:
            return file_path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Could not decode {file_path}")


def import_pdf(file_path: Path) -> str:
    """Import a PDF file."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ImportError("pypdf is required for PDF import. Run: pip install pypdf")

    reader = PdfReader(file_path)
    text_parts = []

    for page in reader.pages:
        text = page.extract_text()
        if text:
            text_parts.append(text)

    return '\n\n'.join(text_parts)


def import_epub(file_path: Path) -> str:
    """Import an EPUB file."""
    try:
        import ebooklib
        from ebooklib import epub
        from bs4 import BeautifulSoup
    except ImportError:
        raise ImportError("ebooklib is required for EPUB import. Run: pip install ebooklib")

    book = epub.read_epub(file_path)
    text_parts = []

    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            soup = BeautifulSoup(item.get_content(), 'lxml')
            text = soup.get_text(separator='\n')
            if text.strip():
                text_parts.append(text)

    return '\n\n'.join(text_parts)


def import_html(file_path: Path) -> str:
    """Import an HTML file."""
    from bs4 import BeautifulSoup

    html = file_path.read_text(encoding='utf-8', errors='replace')
    soup = BeautifulSoup(html, 'lxml')

    # Remove scripts, styles, nav elements
    for tag in soup.find_all(['script', 'style', 'nav', 'header', 'footer']):
        tag.decompose()

    return soup.get_text(separator='\n')


def clean_text(text: str) -> str:
    """Clean up extracted text."""
    # Normalize whitespace
    text = re.sub(r'[ \t]+', ' ', text)
    # Normalize line breaks
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove leading/trailing whitespace from lines
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(lines).strip()
