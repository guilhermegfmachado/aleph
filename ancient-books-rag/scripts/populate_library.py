#!/usr/bin/env python3
"""
Populate the Borges library with texts from all sources.

Sources:
- MIT Internet Classics Archive
- Project Gutenberg (classics section)
- Sacred Texts Archive
- Fordham Medieval Sourcebook
- Princeton Dante Project
- Marxists Internet Archive

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
        print(f"\n>> downloading from mit classics...")

        browse_url = f"{self.base_url}/Browse/index.html"
        response = self.session.get(browse_url, timeout=30)
        soup = BeautifulSoup(response.text, "lxml")

        author_links = soup.find_all("a", href=re.compile(r"browse-.*\.html"))
        works_added = 0

        for author_link in tqdm(author_links, desc="authors"):
            author_name = author_link.get_text(strip=True)
            author_url = urljoin(browse_url, author_link["href"])

            try:
                author_resp = self.session.get(author_url, timeout=30)
                author_soup = BeautifulSoup(author_resp.text, "lxml")

                for link in author_soup.find_all("a", href=True):
                    href = link.get("href", "")
                    if href.endswith(".html") and not href.startswith("browse-"):
                        title = link.get_text(strip=True)
                        if not title or len(title) < 2:
                            continue

                        if self.library.book_exists(title, author_name, self.name):
                            continue

                        work_url = urljoin(author_url, href)
                        try:
                            work_resp = self.session.get(work_url, timeout=30)
                            work_soup = BeautifulSoup(work_resp.text, "lxml")

                            for tag in work_soup.find_all(["script", "style", "nav"]):
                                tag.decompose()

                            body = work_soup.find("body")
                            if body:
                                content = body.get_text(separator="\n")
                                content = re.sub(r"\n{3,}", "\n\n", content).strip()

                                if len(content) > 500:
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
                                        print(f"  + added {works_added} works (limit)")
                                        return works_added

                            time.sleep(0.5)

                        except Exception as e:
                            print(f"  error: {title}: {e}")

            except Exception as e:
                print(f"  error: {author_name}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class GutenbergDownloader(SourceDownloader):
    """Download classics from Project Gutenberg via Gutendex API."""

    name = "gutenberg"
    description = "Public domain classics"
    api_url = "https://gutendex.com/books"

    CLASSICAL_AUTHORS = [
        "Homer", "Plato", "Aristotle", "Sophocles", "Euripides", "Aeschylus",
        "Herodotus", "Thucydides", "Xenophon", "Plutarch", "Virgil", "Ovid",
        "Horace", "Cicero", "Seneca", "Marcus Aurelius", "Epictetus",
        "Tacitus", "Livy", "Suetonius", "Lucretius", "Catullus",
        "Aristophanes", "Plautus", "Terence", "Juvenal", "Martial",
        "Apuleius", "Petronius", "Aesop", "Hesiod", "Pindar",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from gutenberg...")
        works_added = 0

        for author in tqdm(self.CLASSICAL_AUTHORS, desc="authors"):
            if limit and works_added >= limit:
                break

            try:
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

                    if self.library.book_exists(title, author_name, self.name):
                        continue

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

                            time.sleep(1)

                        except Exception as e:
                            print(f"  error: {title}: {e}")

            except Exception as e:
                print(f"  error: {author}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class SacredTextsDownloader(SourceDownloader):
    """Download from Sacred Texts Archive."""

    name = "sacred_texts"
    description = "Religious and mythological texts"
    base_url = "https://sacred-texts.com"

    SECTIONS = {
        "cla": "Classical Paganism",
        "egy": "Egyptian",
        "ane": "Ancient Near East",
        "bib": "Bible",
        "chr": "Christianity",
        "gno": "Gnosticism",
    }

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from sacred texts...")
        works_added = 0

        for section_code, section_name in self.SECTIONS.items():
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}/{section_code}/index.htm"

            try:
                response = self.session.get(section_url, timeout=30)
                soup = BeautifulSoup(response.text, "lxml")

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

                    if self.library.book_exists(title, "Various", self.name):
                        continue

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

                    except Exception:
                        pass

            except Exception as e:
                print(f"  error: {section_name}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class FordhamDownloader(SourceDownloader):
    """Download from Fordham Medieval Sourcebook."""

    name = "fordham"
    description = "Medieval and ancient history sourcebook"
    base_url = "https://sourcebooks.fordham.edu"

    SECTIONS = [
        "/ancient/asbook.asp",
        "/med/sbook.asp",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from fordham sourcebooks...")
        works_added = 0

        for section_path in self.SECTIONS:
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}{section_path}"

            try:
                response = self.session.get(section_url, timeout=30)
                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    if not href or href.startswith("#") or href.startswith("mailto"):
                        continue
                    if "sbook" in href.lower() or "index" in href.lower():
                        continue
                    if not href.endswith(".asp") and not href.endswith(".html"):
                        continue

                    title = link.get_text(strip=True)
                    if not title or len(title) < 5:
                        continue

                    if self.library.book_exists(title, "Various", self.name):
                        continue

                    text_url = urljoin(section_url, href)
                    try:
                        text_resp = self.session.get(text_url, timeout=30)
                        text_soup = BeautifulSoup(text_resp.text, "lxml")

                        for tag in text_soup.find_all(["script", "style", "nav"]):
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

                    except Exception:
                        pass

            except Exception as e:
                print(f"  error: {section_path}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class DanteDownloader(SourceDownloader):
    """Download from Princeton Dante Project."""

    name = "dante"
    description = "Dante's Divine Comedy with commentary"
    base_url = "https://dante.princeton.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from princeton dante project...")
        works_added = 0

        # The Divine Comedy sections
        sections = [
            ("/pdp/canto1.html", "Inferno"),
            ("/pdp/canto2.html", "Purgatorio"),
            ("/pdp/canto3.html", "Paradiso"),
        ]

        for path, section in sections:
            if limit and works_added >= limit:
                break

            try:
                # Try to get main text pages
                url = f"{self.base_url}{path}"
                response = self.session.get(url, timeout=30)
                soup = BeautifulSoup(response.text, "lxml")

                # Find canto links
                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if "canto" in href.lower() and title:
                        full_title = f"Divine Comedy - {section} - {title}"

                        if self.library.book_exists(full_title, "Dante Alighieri", self.name):
                            continue

                        text_url = urljoin(url, href)
                        try:
                            text_resp = self.session.get(text_url, timeout=30)
                            text_soup = BeautifulSoup(text_resp.text, "lxml")

                            for tag in text_soup.find_all(["script", "style"]):
                                tag.decompose()

                            body = text_soup.find("body")
                            if body:
                                content = body.get_text(separator="\n")
                                content = re.sub(r"\n{3,}", "\n\n", content).strip()

                                if len(content) > 200:
                                    book = Book(
                                        id=None,
                                        title=full_title,
                                        author="Dante Alighieri",
                                        source=self.name,
                                        language="english",
                                        content=content,
                                        url=text_url,
                                    )
                                    self.library.add_book(book)
                                    works_added += 1

                            time.sleep(0.5)

                        except Exception:
                            pass

            except Exception as e:
                print(f"  error: {section}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class MarxistsDownloader(SourceDownloader):
    """Download from Marxists Internet Archive."""

    name = "marxists"
    description = "Marxist texts and philosophy"
    base_url = "https://www.marxists.org"

    # Key authors and their archive paths
    AUTHORS = {
        "marx": "Marx, Karl",
        "engels": "Engels, Friedrich",
        "lenin": "Lenin, Vladimir",
        "luxemburg": "Luxemburg, Rosa",
        "gramsci": "Gramsci, Antonio",
        "trotsky": "Trotsky, Leon",
    }

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from marxists.org...")
        works_added = 0

        for author_path, author_name in self.AUTHORS.items():
            if limit and works_added >= limit:
                break

            archive_url = f"{self.base_url}/archive/{author_path}/works"

            try:
                response = self.session.get(archive_url, timeout=30)
                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if not href or not title or len(title) < 3:
                        continue
                    if href.startswith("#") or href.startswith("mailto"):
                        continue
                    if "index" in href.lower():
                        continue

                    if self.library.book_exists(title, author_name, self.name):
                        continue

                    text_url = urljoin(archive_url + "/", href)
                    try:
                        text_resp = self.session.get(text_url, timeout=30)
                        text_soup = BeautifulSoup(text_resp.text, "lxml")

                        for tag in text_soup.find_all(["script", "style", "nav"]):
                            tag.decompose()

                        body = text_soup.find("body")
                        if body:
                            content = body.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 500:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author=author_name,
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=text_url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.5)

                    except Exception:
                        pass

            except Exception as e:
                print(f"  error: {author_name}: {e}")

        print(f"  + added {works_added} works")
        return works_added


def main():
    parser = argparse.ArgumentParser(
        description="Populate the Borges library"
    )
    parser.add_argument(
        "--source", "-s",
        choices=["all", "mit", "gutenberg", "sacred", "fordham", "dante", "marxists"],
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
    print("   borges - populating library")
    print("=" * 50)

    library = Library()

    stats = library.get_stats()
    print(f"\ncurrent: {stats['total_books']} books, {stats['total_authors']} authors")

    downloaders = []

    if args.source in ["all", "mit"]:
        downloaders.append(MITClassicsDownloader(library))
    if args.source in ["all", "gutenberg"]:
        downloaders.append(GutenbergDownloader(library))
    if args.source in ["all", "sacred"]:
        downloaders.append(SacredTextsDownloader(library))
    if args.source in ["all", "fordham"]:
        downloaders.append(FordhamDownloader(library))
    if args.source in ["all", "dante"]:
        downloaders.append(DanteDownloader(library))
    if args.source in ["all", "marxists"]:
        downloaders.append(MarxistsDownloader(library))

    total_added = 0
    for downloader in downloaders:
        try:
            added = downloader.download_all(limit=args.limit)
            total_added += added
        except Exception as e:
            print(f"error with {downloader.name}: {e}")

    stats = library.get_stats()
    print("\n" + "=" * 50)
    print(f"+ added {total_added} new works")
    print(f"library: {stats['total_books']} books, {stats['total_authors']} authors")
    print("=" * 50)


if __name__ == "__main__":
    main()
