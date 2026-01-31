#!/usr/bin/env python3
"""
Populate the Borges library with texts from all sources.

Sources:
- MIT Internet Classics Archive (441 works)
- Project Gutenberg (classics section)
- Perseus Digital Library
- Loeb Classical Library (via archive.org)
- Sacred Texts Archive

Run: python scripts/populate_library.py --source all
"""

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.library import Library, Book


class SourceDownloader:
    """Base class for source downloaders."""

    name = "base"
    description = ""

    def __init__(self, library: Library):
        self.library = library
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Borges Library Bot (educational use)"
        })

    def download_all(self, limit: int | None = None):
        """Download all texts from this source."""
        raise NotImplementedError


class MITClassicsDownloader(SourceDownloader):
    """Download from MIT Internet Classics Archive."""

    name = "mit_classics"
    description = "441 works of classical literature"
    base_url = "https://classics.mit.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n📚 Downloading from MIT Classics...")

        # Get list of authors
        browse_url = f"{self.base_url}/Browse/index.html"
        response = self.session.get(browse_url, timeout=30)
        soup = BeautifulSoup(response.text, "lxml")

        author_links = soup.find_all("a", href=re.compile(r"browse-.*\.html"))
        works_added = 0

        for author_link in tqdm(author_links, desc="Authors"):
            author_name = author_link.get_text(strip=True)
            author_url = urljoin(browse_url, author_link["href"])

            try:
                # Get author's works
                author_resp = self.session.get(author_url, timeout=30)
                author_soup = BeautifulSoup(author_resp.text, "lxml")

                # Find work links
                for link in author_soup.find_all("a", href=True):
                    href = link.get("href", "")
                    if href.endswith(".html") and not href.startswith("browse-"):
                        title = link.get_text(strip=True)
                        if not title or len(title) < 2:
                            continue

                        # Check if already exists
                        if self.library.book_exists(title, author_name, self.name):
                            continue

                        # Download the work
                        work_url = urljoin(author_url, href)
                        try:
                            work_resp = self.session.get(work_url, timeout=30)
                            work_soup = BeautifulSoup(work_resp.text, "lxml")

                            # Extract text
                            for tag in work_soup.find_all(["script", "style", "nav"]):
                                tag.decompose()

                            body = work_soup.find("body")
                            if body:
                                content = body.get_text(separator="\n")
                                content = re.sub(r"\n{3,}", "\n\n", content).strip()

                                if len(content) > 500:  # Skip very short pages
                                    book = Book(
                                        id=None,
                                        title=title,
                                        author=author_name,
                                        source=self.name,
                                        language="english",
                                        content=content,
                                        url=work_url,
                                    )
                                    self.library.add_book(book)
                                    works_added += 1

                                    if limit and works_added >= limit:
                                        print(f"  ✓ Added {works_added} works (limit reached)")
                                        return works_added

                            time.sleep(0.5)  # Be nice to the server

                        except Exception as e:
                            print(f"  Error downloading {title}: {e}")

            except Exception as e:
                print(f"  Error with author {author_name}: {e}")

        print(f"  ✓ Added {works_added} works from MIT Classics")
        return works_added


class GutenbergDownloader(SourceDownloader):
    """Download classics from Project Gutenberg via Gutendex API."""

    name = "gutenberg"
    description = "Public domain classics from Project Gutenberg"
    api_url = "https://gutendex.com/books"

    # Classical authors to search for
    CLASSICAL_AUTHORS = [
        "Homer", "Plato", "Aristotle", "Sophocles", "Euripides", "Aeschylus",
        "Herodotus", "Thucydides", "Xenophon", "Plutarch", "Virgil", "Ovid",
        "Horace", "Cicero", "Seneca", "Marcus Aurelius", "Epictetus",
        "Tacitus", "Livy", "Suetonius", "Lucretius", "Catullus",
        "Aristophanes", "Plautus", "Terence", "Juvenal", "Martial",
        "Apuleius", "Petronius", "Aesop", "Hesiod", "Pindar",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n📚 Downloading from Project Gutenberg...")
        works_added = 0

        for author in tqdm(self.CLASSICAL_AUTHORS, desc="Authors"):
            if limit and works_added >= limit:
                break

            try:
                # Search for author
                response = self.session.get(
                    self.api_url,
                    params={"search": author, "languages": "en"},
                    timeout=30
                )
                data = response.json()

                for book_data in data.get("results", []):
                    if limit and works_added >= limit:
                        break

                    title = book_data.get("title", "Unknown")
                    authors = book_data.get("authors", [])
                    author_name = authors[0]["name"] if authors else author

                    # Check if exists
                    if self.library.book_exists(title, author_name, self.name):
                        continue

                    # Get text URL (prefer plain text)
                    formats = book_data.get("formats", {})
                    text_url = (
                        formats.get("text/plain; charset=utf-8") or
                        formats.get("text/plain") or
                        formats.get("text/plain; charset=us-ascii")
                    )

                    if text_url:
                        try:
                            text_resp = self.session.get(text_url, timeout=60)
                            content = text_resp.text

                            if len(content) > 1000:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author=author_name,
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=f"https://www.gutenberg.org/ebooks/{book_data['id']}",
                                )
                                self.library.add_book(book)
                                works_added += 1

                            time.sleep(1)  # Rate limit

                        except Exception as e:
                            print(f"  Error downloading {title}: {e}")

            except Exception as e:
                print(f"  Error searching {author}: {e}")

        print(f"  ✓ Added {works_added} works from Project Gutenberg")
        return works_added


class SacredTextsDownloader(SourceDownloader):
    """Download from Sacred Texts Archive."""

    name = "sacred_texts"
    description = "Religious and mythological texts"
    base_url = "https://sacred-texts.com"

    # Key sections with ancient content
    SECTIONS = {
        "cla": "Classical Paganism",
        "egy": "Egyptian",
        "ane": "Ancient Near East",
    }

    def download_all(self, limit: int | None = None):
        print(f"\n📚 Downloading from Sacred Texts Archive...")
        works_added = 0

        for section_code, section_name in self.SECTIONS.items():
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}/{section_code}/index.htm"

            try:
                response = self.session.get(section_url, timeout=30)
                soup = BeautifulSoup(response.text, "lxml")

                # Find links to texts
                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    if not href or href.startswith("http") or href.startswith("#"):
                        continue
                    if "index" in href.lower():
                        continue

                    title = link.get_text(strip=True)
                    if not title or len(title) < 3:
                        continue

                    # Check if exists
                    if self.library.book_exists(title, "Various", self.name):
                        continue

                    # Download
                    text_url = urljoin(section_url, href)
                    try:
                        text_resp = self.session.get(text_url, timeout=30)
                        text_soup = BeautifulSoup(text_resp.text, "lxml")

                        for tag in text_soup.find_all(["script", "style"]):
                            tag.decompose()

                        body = text_soup.find("body")
                        if body:
                            content = body.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 500:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="Various",
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=text_url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.5)

                    except Exception as e:
                        pass  # Skip errors silently

            except Exception as e:
                print(f"  Error with section {section_name}: {e}")

        print(f"  ✓ Added {works_added} works from Sacred Texts")
        return works_added


def main():
    parser = argparse.ArgumentParser(
        description="Populate the Borges library with classical texts"
    )
    parser.add_argument(
        "--source", "-s",
        choices=["all", "mit", "gutenberg", "sacred"],
        default="all",
        help="Which source to download from"
    )
    parser.add_argument(
        "--limit", "-l",
        type=int,
        default=None,
        help="Limit number of works per source"
    )

    args = parser.parse_args()

    print("=" * 50)
    print("   📚 BORGES - Populating the Library")
    print("=" * 50)

    library = Library()

    # Show current stats
    stats = library.get_stats()
    print(f"\nCurrent library: {stats['total_books']} books, {stats['total_authors']} authors")

    downloaders = []

    if args.source in ["all", "mit"]:
        downloaders.append(MITClassicsDownloader(library))
    if args.source in ["all", "gutenberg"]:
        downloaders.append(GutenbergDownloader(library))
    if args.source in ["all", "sacred"]:
        downloaders.append(SacredTextsDownloader(library))

    total_added = 0
    for downloader in downloaders:
        try:
            added = downloader.download_all(limit=args.limit)
            total_added += added
        except Exception as e:
            print(f"Error with {downloader.name}: {e}")

    # Final stats
    stats = library.get_stats()
    print("\n" + "=" * 50)
    print(f"✓ Done! Added {total_added} new works")
    print(f"Library now has: {stats['total_books']} books from {stats['total_authors']} authors")
    print("=" * 50)


if __name__ == "__main__":
    main()
