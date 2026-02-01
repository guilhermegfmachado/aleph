#!/usr/bin/env python3
"""
Populate the Borges library with texts from ALL available sources.

Sources (12 total):
- MIT Internet Classics Archive (ALL 441 works)
- Project Gutenberg (ALL classical authors)
- Sacred Texts Archive (ALL sections)
- Fordham Internet History Sourcebooks (ALL pages)
- Dante's Divine Comedy (complete)
- Marxists Internet Archive (ALL authors)
- Stanford Encyclopedia of Philosophy (ALL entries)
- Internet Encyclopedia of Philosophy (ALL articles)
- Wikisource (major philosophical works)
- Bartleby (ALL available)
- Loebolus (ALL 277 Loeb Classical Library volumes)
- IQ.wiki (blockchain/crypto encyclopedia)

Run: python scripts/populate_library.py --source all
Run: python scripts/populate_library.py --list  (to see all sources)
"""

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote

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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

    def download_all(self, limit: int | None = None):
        """Download all texts from this source."""
        raise NotImplementedError

    def safe_get(self, url, timeout=30, retries=3):
        """Safe HTTP GET with retries."""
        for i in range(retries):
            try:
                response = self.session.get(url, timeout=timeout)
                response.raise_for_status()
                return response
            except Exception as e:
                if i == retries - 1:
                    raise
                time.sleep(1 + i)
        return None


class MITClassicsDownloader(SourceDownloader):
    """Download ALL works from MIT Internet Classics Archive."""

    name = "mit_classics"
    description = "ALL 441 works of classical literature"
    base_url = "https://classics.mit.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from mit classics...")
        works_added = 0

        # Get the main browse index to find ALL authors
        browse_url = f"{self.base_url}/Browse/index.html"

        try:
            response = self.safe_get(browse_url)
            soup = BeautifulSoup(response.text, "lxml")

            # Find ALL author links (browse-*.html pattern)
            author_links = []
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                if "browse-" in href and href.endswith(".html"):
                    author_name = link.get_text(strip=True)
                    if author_name:
                        author_links.append((author_name, urljoin(browse_url, href)))

            print(f"  found {len(author_links)} authors")

            for author_name, author_url in tqdm(author_links, desc="authors"):
                if limit and works_added >= limit:
                    break

                try:
                    author_resp = self.safe_get(author_url, retries=2)
                    if not author_resp:
                        continue

                    author_soup = BeautifulSoup(author_resp.text, "lxml")

                    # Find ALL work links on this author's page
                    for link in author_soup.find_all("a", href=True):
                        if limit and works_added >= limit:
                            break

                        href = link.get("href", "")
                        title = link.get_text(strip=True)

                        # Skip non-work links
                        if not href.endswith(".html"):
                            continue
                        if "browse" in href.lower() or "index" in href.lower():
                            continue
                        if not title or len(title) < 2:
                            continue
                        if "more info" in title.lower() or "help" in title.lower():
                            continue

                        if self.library.book_exists(title, author_name, self.name):
                            continue

                        work_url = urljoin(author_url, href)

                        try:
                            work_resp = self.safe_get(work_url, retries=2)
                            if not work_resp:
                                continue

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

                            time.sleep(0.2)

                        except Exception:
                            pass

                except Exception as e:
                    print(f"  error with {author_name}: {e}")

        except Exception as e:
            print(f"  error fetching index: {e}")

        print(f"  + added {works_added} works")
        return works_added


class GutenbergDownloader(SourceDownloader):
    """Download ALL classical texts from Project Gutenberg."""

    name = "gutenberg"
    description = "ALL public domain classics"
    api_url = "https://gutendex.com/books"

    # Search terms to find classical works
    SEARCH_TERMS = [
        # Ancient authors
        "Homer", "Plato", "Aristotle", "Sophocles", "Euripides", "Aeschylus",
        "Herodotus", "Thucydides", "Xenophon", "Plutarch", "Virgil", "Ovid",
        "Horace", "Cicero", "Seneca", "Marcus Aurelius", "Epictetus",
        "Tacitus", "Livy", "Suetonius", "Lucretius", "Catullus",
        "Aristophanes", "Plautus", "Terence", "Juvenal", "Martial",
        "Apuleius", "Petronius", "Aesop", "Hesiod", "Pindar",
        "Diogenes Laertius", "Pliny", "Demosthenes", "Isocrates",
        "Lucian", "Plotinus", "Proclus", "Iamblichus", "Porphyry",
        "Julian", "Dio Cassius", "Appian", "Polybius", "Strabo",
        "Pausanias", "Josephus", "Philo", "Sallust", "Caesar",
        "Quintilian", "Boethius", "Augustine", "Confucius", "Lao Tzu",
        "Mencius", "Chuang Tzu", "Sun Tzu",
        # Topics/Categories
        "Greek philosophy", "Roman history", "classical mythology",
        "ancient Greece", "ancient Rome", "Stoic", "Epicurean",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from gutenberg...")
        works_added = 0
        seen_ids = set()

        for term in tqdm(self.SEARCH_TERMS, desc="search terms"):
            if limit and works_added >= limit:
                break

            # Search and get ALL pages of results
            next_url = f"{self.api_url}?search={quote(term)}&languages=en"

            while next_url and (not limit or works_added < limit):
                try:
                    response = self.safe_get(next_url, timeout=60)
                    if not response:
                        break

                    data = response.json()

                    for book_data in data.get("results", []):
                        if limit and works_added >= limit:
                            break

                        book_id = book_data.get("id")
                        if book_id in seen_ids:
                            continue
                        seen_ids.add(book_id)

                        title = book_data.get("title", "Unknown")
                        authors = book_data.get("authors", [])
                        author_name = authors[0]["name"] if authors else "Unknown"

                        if self.library.book_exists(title, author_name, self.name):
                            continue

                        formats = book_data.get("formats", {})

                        # Try to get text content
                        text_url = None
                        for fmt in [
                            "text/plain; charset=utf-8",
                            "text/plain; charset=us-ascii",
                            "text/plain",
                        ]:
                            if fmt in formats:
                                url = formats[fmt]
                                if not url.endswith('.zip'):
                                    text_url = url
                                    break

                        if text_url:
                            try:
                                text_resp = self.safe_get(text_url, timeout=120)
                                if text_resp and len(text_resp.text) > 1000:
                                    book = Book(
                                        id=None,
                                        title=title,
                                        author=author_name,
                                        source=self.name,
                                        language="english",
                                        content=text_resp.text,
                                        url=f"https://www.gutenberg.org/ebooks/{book_id}",
                                    )
                                    self.library.add_book(book)
                                    works_added += 1
                                time.sleep(0.3)
                            except Exception:
                                pass

                    next_url = data.get("next")

                except Exception:
                    break

        print(f"  + added {works_added} works")
        return works_added


class SacredTextsDownloader(SourceDownloader):
    """Download ALL from Sacred Texts Archive."""

    name = "sacred_texts"
    description = "ALL religious and mythological texts"
    base_url = "https://sacred-texts.com"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from sacred texts...")
        works_added = 0

        # Get ALL sections from the main index
        try:
            response = self.safe_get(self.base_url)
            soup = BeautifulSoup(response.text, "lxml")

            # Find all section links
            sections = []
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                if href.startswith("/") and not href.startswith("//"):
                    # Potential section
                    if len(href) > 1 and "/" not in href[1:]:
                        section_code = href.strip("/")
                        if section_code and len(section_code) <= 10:
                            sections.append(section_code)

            # Also add known sections
            known_sections = [
                "cla", "egy", "ane", "bib", "chr", "gno", "hin", "bud",
                "jud", "isl", "zor", "phi", "neu", "pag", "afr", "ame",
                "asia", "aus", "cel", "eng", "eur", "pac", "sym", "mas",
                "eso", "nth", "oto", "ros", "the", "shi", "tao", "con",
                "sro", "sks", "jain", "tantra", "yoga",
            ]
            sections = list(set(sections + known_sections))

            print(f"  found {len(sections)} sections")

            for section_code in tqdm(sections, desc="sections"):
                if limit and works_added >= limit:
                    break

                section_url = f"{self.base_url}/{section_code}/index.htm"

                try:
                    response = self.safe_get(section_url, retries=1)
                    if not response:
                        continue

                    soup = BeautifulSoup(response.text, "lxml")

                    for link in soup.find_all("a", href=True):
                        if limit and works_added >= limit:
                            break

                        href = link.get("href", "")
                        if not href or href.startswith("http") or href.startswith("#"):
                            continue
                        if "index" in href.lower():
                            continue
                        if not (href.endswith(".htm") or href.endswith(".html")):
                            continue

                        title = link.get_text(strip=True)
                        if not title or len(title) < 3:
                            continue

                        if self.library.book_exists(title, section_code.upper(), self.name):
                            continue

                        text_url = urljoin(section_url, href)
                        try:
                            text_resp = self.safe_get(text_url, retries=1)
                            if not text_resp:
                                continue

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
                                        author=section_code.upper(),
                                        source=self.name,
                                        language="english",
                                        content=content,
                                        url=text_url,
                                    )
                                    self.library.add_book(book)
                                    works_added += 1

                            time.sleep(0.1)

                        except Exception:
                            pass

                except Exception:
                    pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class FordhamDownloader(SourceDownloader):
    """Download ALL from Fordham Sourcebooks."""

    name = "fordham"
    description = "ALL history sourcebook texts"
    base_url = "https://sourcebooks.fordham.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from fordham sourcebooks...")
        works_added = 0

        # Get ALL sourcebook index pages
        sourcebooks = [
            ("/ancient/asbook.asp", "Ancient"),
            ("/med/sbook.asp", "Medieval"),
            ("/mod/modsbook.asp", "Modern"),
        ]

        # Discover all sub-pages
        all_pages = []

        for base_path, category in sourcebooks:
            base_url = f"{self.base_url}{base_path}"
            try:
                response = self.safe_get(base_url, retries=2)
                if response:
                    soup = BeautifulSoup(response.text, "lxml")

                    # Find links to other index pages
                    for link in soup.find_all("a", href=True):
                        href = link.get("href", "")
                        if "sbook" in href.lower() or "asbook" in href.lower() or "modsbook" in href.lower():
                            page_url = urljoin(base_url, href)
                            if page_url not in [p[0] for p in all_pages]:
                                all_pages.append((page_url, category))

                    all_pages.append((base_url, category))

            except Exception:
                all_pages.append((base_url, category))

        print(f"  found {len(all_pages)} index pages")

        for section_url, category in tqdm(all_pages, desc="pages"):
            if limit and works_added >= limit:
                break

            try:
                response = self.safe_get(section_url, retries=1)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    if not href or href.startswith("#") or href.startswith("mailto"):
                        continue
                    if "sbook" in href.lower() or "index" in href.lower():
                        continue
                    if not (href.endswith(".asp") or href.endswith(".html") or href.endswith(".htm")):
                        continue

                    title = link.get_text(strip=True)
                    if not title or len(title) < 5:
                        continue

                    if self.library.book_exists(title, category, self.name):
                        continue

                    text_url = urljoin(section_url, href)
                    try:
                        text_resp = self.safe_get(text_url, retries=1)
                        if not text_resp:
                            continue

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
                                    author=category,
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=text_url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.1)

                    except Exception:
                        pass

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class DanteDownloader(SourceDownloader):
    """Download Dante's Divine Comedy - complete."""

    name = "dante"
    description = "Dante's Divine Comedy - complete"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading dante's divine comedy (complete)...")
        works_added = 0

        # Get from Gutenberg - these are the definitive IDs
        gutenberg_ids = [
            ("8800", "Divine Comedy - Complete (Longfellow)"),
            ("1004", "Divine Comedy - Inferno (Longfellow)"),
            ("1005", "Divine Comedy - Purgatorio (Longfellow)"),
            ("1006", "Divine Comedy - Paradiso (Longfellow)"),
            ("8789", "La Divina Commedia (Italian)"),
            ("41537", "Divine Comedy - Inferno (Cary)"),
            ("8795", "Divine Comedy - Purgatory (Cary)"),
            ("8799", "Divine Comedy - Paradise (Cary)"),
        ]

        for ebook_id, title in gutenberg_ids:
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "Dante Alighieri", self.name):
                continue

            urls_to_try = [
                f"https://www.gutenberg.org/cache/epub/{ebook_id}/pg{ebook_id}.txt",
                f"https://www.gutenberg.org/files/{ebook_id}/{ebook_id}-0.txt",
                f"https://www.gutenberg.org/files/{ebook_id}/{ebook_id}.txt",
            ]

            for url in urls_to_try:
                try:
                    response = self.safe_get(url, retries=2, timeout=60)
                    if response and len(response.text) > 1000:
                        book = Book(
                            id=None,
                            title=title,
                            author="Dante Alighieri",
                            source=self.name,
                            language="italian" if "Italian" in title else "english",
                            content=response.text,
                            url=f"https://www.gutenberg.org/ebooks/{ebook_id}",
                        )
                        self.library.add_book(book)
                        works_added += 1
                        break
                except Exception:
                    continue

            time.sleep(0.2)

        print(f"  + added {works_added} works")
        return works_added


class MarxistsDownloader(SourceDownloader):
    """Download ALL from Marxists Internet Archive."""

    name = "marxists"
    description = "ALL Marxist texts"
    base_url = "https://www.marxists.org"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from marxists.org...")
        works_added = 0

        # Get the archive index to find ALL authors
        archive_url = f"{self.base_url}/archive/index.htm"

        authors = []

        try:
            response = self.safe_get(archive_url)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    name = link.get_text(strip=True)

                    if "/archive/" in href and name and len(name) > 2:
                        author_url = urljoin(archive_url, href)
                        if author_url not in [a[1] for a in authors]:
                            authors.append((name, author_url))

        except Exception:
            pass

        # Also add known important authors
        known_authors = [
            ("Marx, Karl", f"{self.base_url}/archive/marx/works"),
            ("Lenin, Vladimir", f"{self.base_url}/archive/lenin/works"),
            ("Trotsky, Leon", f"{self.base_url}/archive/trotsky/works"),
            ("Luxemburg, Rosa", f"{self.base_url}/archive/luxemburg"),
            ("Gramsci, Antonio", f"{self.base_url}/archive/gramsci"),
            ("Kropotkin, Peter", f"{self.base_url}/reference/archive/kropotkin"),
            ("Bakunin, Mikhail", f"{self.base_url}/reference/archive/bakunin"),
        ]

        for name, url in known_authors:
            if url not in [a[1] for a in authors]:
                authors.append((name, url))

        print(f"  found {len(authors)} authors")

        for author_name, author_url in tqdm(authors[:100], desc="authors"):  # Limit to 100 authors
            if limit and works_added >= limit:
                break

            try:
                response = self.safe_get(author_url, retries=1)
                if not response:
                    continue

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
                    if "index" in href.lower() or href == "../":
                        continue

                    if self.library.book_exists(title, author_name, self.name):
                        continue

                    text_url = urljoin(author_url + "/", href)

                    try:
                        text_resp = self.safe_get(text_url, retries=1)
                        if not text_resp:
                            continue

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

                        time.sleep(0.1)

                    except Exception:
                        pass

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class StanfordEncyclopediaDownloader(SourceDownloader):
    """Download ALL from Stanford Encyclopedia of Philosophy."""

    name = "stanford_encyclopedia"
    description = "ALL Stanford Encyclopedia entries"
    base_url = "https://plato.stanford.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from stanford encyclopedia...")
        works_added = 0

        # Get the contents/index page to find ALL entries
        contents_url = f"{self.base_url}/contents.html"

        entries = []

        try:
            response = self.safe_get(contents_url)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if "/entries/" in href and title:
                        entry_url = urljoin(contents_url, href)
                        if entry_url not in [e[1] for e in entries]:
                            entries.append((title, entry_url))

        except Exception as e:
            print(f"  error fetching contents: {e}")

        print(f"  found {len(entries)} entries")

        for title, entry_url in tqdm(entries, desc="entries"):
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "Stanford Encyclopedia", self.name):
                continue

            try:
                response = self.safe_get(entry_url, retries=2)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                # Get main content
                main_content = soup.find("div", {"id": "main-text"})
                if not main_content:
                    main_content = soup.find("div", {"id": "aueditable"})
                if not main_content:
                    main_content = soup.find("article") or soup.find("main")

                if main_content:
                    for tag in main_content.find_all(["script", "style", "nav", "aside"]):
                        tag.decompose()

                    content = main_content.get_text(separator="\n")
                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                    if len(content) > 1000:
                        book = Book(
                            id=None,
                            title=title,
                            author="Stanford Encyclopedia",
                            source=self.name,
                            language="english",
                            content=content,
                            url=entry_url,
                        )
                        self.library.add_book(book)
                        works_added += 1

                time.sleep(0.2)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class IEPDownloader(SourceDownloader):
    """Download ALL from Internet Encyclopedia of Philosophy."""

    name = "iep"
    description = "ALL IEP philosophy articles"
    base_url = "https://iep.utm.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from internet encyclopedia of philosophy...")
        works_added = 0

        # IEP has an A-Z index
        articles = []

        for letter in "abcdefghijklmnopqrstuvwxyz":
            index_url = f"{self.base_url}/{letter}/"

            try:
                response = self.safe_get(index_url, retries=1)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if self.base_url in href and "/about" not in href and title:
                        if href not in [a[1] for a in articles]:
                            articles.append((title, href))

            except Exception:
                pass

        print(f"  found {len(articles)} articles")

        for title, article_url in tqdm(articles, desc="articles"):
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "IEP", self.name):
                continue

            try:
                response = self.safe_get(article_url, retries=2)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                # Get main content
                main_content = soup.find("div", class_="entry-content")
                if not main_content:
                    main_content = soup.find("article") or soup.find("main")

                if main_content:
                    for tag in main_content.find_all(["script", "style", "nav", "aside"]):
                        tag.decompose()

                    content = main_content.get_text(separator="\n")
                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                    if len(content) > 1000:
                        book = Book(
                            id=None,
                            title=title,
                            author="IEP",
                            source=self.name,
                            language="english",
                            content=content,
                            url=article_url,
                        )
                        self.library.add_book(book)
                        works_added += 1

                time.sleep(0.2)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class WikisourceDownloader(SourceDownloader):
    """Download major works from Wikisource."""

    name = "wikisource"
    description = "Major philosophical works"
    base_url = "https://en.wikisource.org"
    api_url = "https://en.wikisource.org/w/api.php"

    # Major philosophical and classical works
    WORKS = [
        # Plato
        "The Republic (Plato)", "Symposium (Plato)", "Apology (Plato)",
        "Phaedo", "Phaedrus (Plato)", "Timaeus (Plato)", "Theaetetus (Plato)",
        "Parmenides (Plato)", "Laws (Plato)", "Meno", "Crito", "Gorgias (Plato)",
        "Protagoras (Plato)", "Sophist (Plato)", "Statesman (Plato)",
        # Aristotle
        "Nicomachean Ethics", "Politics (Aristotle)", "Poetics (Aristotle)",
        "Metaphysics (Aristotle)", "Categories (Aristotle)", "On the Soul",
        "Physics (Aristotle)", "Rhetoric (Aristotle)",
        # Other Ancient
        "Meditations", "Enchiridion (Epictetus)", "Discourses of Epictetus",
        "On the Nature of Things", "The Iliad", "The Odyssey", "Aeneid",
        "Metamorphoses", "Theogony", "Works and Days", "Oedipus Rex",
        "Antigone (Sophocles)", "The Clouds", "The Birds (Aristophanes)",
        # Medieval & Renaissance
        "The Consolation of Philosophy", "The Prince (Machiavelli)",
        "Leviathan", "The City of God", "Confessions (Augustine)",
        "Summa Theologica",
        # Modern
        "Two Treatises of Government", "An Essay Concerning Human Understanding",
        "A Treatise of Human Nature", "Critique of Pure Reason",
        "Critique of Practical Reason", "Critique of Judgment",
        "Ethics (Spinoza)", "Meditations on First Philosophy",
        "Discourse on the Method", "The Social Contract", "Emile, or On Education",
        "On Liberty", "Utilitarianism", "Thus Spake Zarathustra",
        "Beyond Good and Evil", "The Genealogy of Morals",
        "The Communist Manifesto", "Phenomenology of Spirit",
        "The World as Will and Representation", "Fear and Trembling",
        "Either/Or", "Being and Nothingness",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from wikisource...")
        works_added = 0

        for work_title in tqdm(self.WORKS, desc="works"):
            if limit and works_added >= limit:
                break

            try:
                params = {
                    "action": "query",
                    "titles": work_title,
                    "prop": "extracts",
                    "explaintext": "true",
                    "format": "json",
                }

                query_string = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
                response = self.safe_get(f"{self.api_url}?{query_string}")

                if not response:
                    continue

                data = response.json()

                pages = data.get("query", {}).get("pages", {})
                for page_id, page_data in pages.items():
                    if page_id == "-1":
                        continue

                    title = page_data.get("title", work_title)
                    content = page_data.get("extract", "")

                    if not content or len(content) < 500:
                        continue

                    if self.library.book_exists(title, "Various", self.name):
                        continue

                    book = Book(
                        id=None,
                        title=title,
                        author="Various",
                        source=self.name,
                        language="english",
                        content=content,
                        url=f"{self.base_url}/wiki/{quote(work_title.replace(' ', '_'))}",
                    )
                    self.library.add_book(book)
                    works_added += 1

                time.sleep(0.2)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class BartlebyDownloader(SourceDownloader):
    """Download ALL from Bartleby."""

    name = "bartleby"
    description = "ALL Bartleby classics"
    base_url = "https://www.bartleby.com"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from bartleby...")
        works_added = 0

        # Get the lit-hub index
        index_url = f"{self.base_url}/lit-hub/"

        try:
            response = self.safe_get(index_url)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                # Find all author/category pages
                pages = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    if "/lit-hub/" in href and href != "/lit-hub/":
                        page_url = urljoin(self.base_url, href)
                        if page_url not in pages:
                            pages.append(page_url)

                print(f"  found {len(pages)} categories")

                for page_url in tqdm(pages, desc="categories"):
                    if limit and works_added >= limit:
                        break

                    try:
                        page_resp = self.safe_get(page_url, retries=1)
                        if not page_resp:
                            continue

                        page_soup = BeautifulSoup(page_resp.text, "lxml")

                        # Get author from URL
                        author = page_url.split("/")[-2].title() if "/" in page_url else "Unknown"

                        for link in page_soup.find_all("a", href=True):
                            if limit and works_added >= limit:
                                break

                            href = link.get("href", "")
                            title = link.get_text(strip=True)

                            if not title or len(title) < 3:
                                continue
                            if not href or "lit-hub" not in href:
                                continue

                            if self.library.book_exists(title, author, self.name):
                                continue

                            work_url = urljoin(self.base_url, href)

                            try:
                                work_resp = self.safe_get(work_url, retries=1)
                                if not work_resp:
                                    continue

                                work_soup = BeautifulSoup(work_resp.text, "lxml")

                                main = work_soup.find("main") or work_soup.find("article") or work_soup.find("body")

                                if main:
                                    for tag in main.find_all(["script", "style", "nav", "aside", "header", "footer"]):
                                        tag.decompose()

                                    content = main.get_text(separator="\n")
                                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                                    if len(content) > 500:
                                        book = Book(
                                            id=None,
                                            title=title,
                                            author=author,
                                            source=self.name,
                                            language="english",
                                            content=content,
                                            url=work_url,
                                        )
                                        self.library.add_book(book)
                                        works_added += 1

                                time.sleep(0.1)

                            except Exception:
                                pass

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class LoebulusDownloader(SourceDownloader):
    """Download ALL from Loebolus (Loeb Classical Library)."""

    name = "loebolus"
    description = "ALL Loeb Classical Library volumes (references)"
    base_url = "https://ryanfb.xyz/loebolus"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading ALL from loebolus...")
        works_added = 0

        try:
            response = self.safe_get(self.base_url)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                # Find the table with volumes
                table = soup.find("table")
                if table:
                    rows = table.find_all("tr")
                    print(f"  found {len(rows)} rows")

                    for row in rows[1:]:  # Skip header
                        if limit and works_added >= limit:
                            break

                        cells = row.find_all("td")
                        if len(cells) >= 3:
                            vol_num = cells[0].get_text(strip=True)
                            author_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                            title_cell = cells[2].get_text(strip=True) if len(cells) > 2 else ""

                            # Find PDF link
                            pdf_link = row.find("a", href=True)
                            pdf_url = ""
                            if pdf_link:
                                href = pdf_link.get("href", "")
                                if href:
                                    pdf_url = urljoin(self.base_url + "/", href)

                            title = title_cell or f"Loeb Volume {vol_num}"
                            author = author_cell or "Various"

                            full_title = f"[Loeb {vol_num}] {author}: {title}"

                            if self.library.book_exists(full_title, author, self.name):
                                continue

                            content = f"""Loeb Classical Library Volume {vol_num}

Author: {author}
Title: {title}

The Loeb Classical Library presents Greek and Latin texts with facing English translations. This is a reference entry - the full text is available as PDF.

{f'Download PDF: {pdf_url}' if pdf_url else ''}

About the Loeb Classical Library:
Founded in 1911, the Loeb Classical Library is the only existing series of books which, through original text and facing English translation, gives access to all that is important in Greek and Latin literature."""

                            book = Book(
                                id=None,
                                title=full_title,
                                author=author,
                                source=self.name,
                                language="english",
                                content=content,
                                url=pdf_url or self.base_url,
                            )
                            self.library.add_book(book)
                            works_added += 1

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works (references)")
        return works_added


class IQWikiDownloader(SourceDownloader):
    """Download from IQ.wiki (blockchain encyclopedia)."""

    name = "iqwiki"
    description = "IQ.wiki blockchain encyclopedia"
    base_url = "https://iq.wiki"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from iq.wiki...")
        works_added = 0

        # IQ.wiki uses a GraphQL API - let's try the main page and category pages
        category_urls = [
            f"{self.base_url}/categories/cryptocurrencies",
            f"{self.base_url}/categories/defi",
            f"{self.base_url}/categories/nfts",
            f"{self.base_url}/categories/exchanges",
            f"{self.base_url}/categories/people",
            f"{self.base_url}/categories/organizations",
            f"{self.base_url}/categories/blockchains",
            f"{self.base_url}/rank/trending",
        ]

        wikis = []

        for cat_url in category_urls:
            try:
                response = self.safe_get(cat_url, retries=1)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if "/wiki/" in href and title and len(title) > 2:
                        wiki_url = urljoin(self.base_url, href)
                        if wiki_url not in [w[1] for w in wikis]:
                            wikis.append((title, wiki_url))

            except Exception:
                pass

        print(f"  found {len(wikis)} wikis")

        for title, wiki_url in tqdm(wikis[:300], desc="wikis"):  # Limit to 300
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "IQ.wiki", self.name):
                continue

            try:
                wiki_resp = self.safe_get(wiki_url, retries=1)
                if not wiki_resp:
                    continue

                wiki_soup = BeautifulSoup(wiki_resp.text, "lxml")

                # Get main content - IQ.wiki uses article or main tags
                main = wiki_soup.find("article") or wiki_soup.find("main")
                if not main:
                    main = wiki_soup.find("div", {"id": "wiki-content"})
                if not main:
                    main = wiki_soup.find("body")

                if main:
                    for tag in main.find_all(["script", "style", "nav", "aside", "header", "footer"]):
                        tag.decompose()

                    content = main.get_text(separator="\n")
                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                    if len(content) > 300:
                        book = Book(
                            id=None,
                            title=title,
                            author="IQ.wiki",
                            source=self.name,
                            language="english",
                            content=content,
                            url=wiki_url,
                        )
                        self.library.add_book(book)
                        works_added += 1

                time.sleep(0.3)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


# === NEW SOURCES (Round 2) ===

class CantigasDownloader(SourceDownloader):
    """Download Portuguese medieval cantigas."""

    name = "cantigas"
    description = "Portuguese medieval cantigas (songs/poetry)"
    base_url = "https://cantigas.fcsh.unl.pt"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from cantigas (Portuguese medieval)...")
        works_added = 0

        try:
            # Get main index
            response = self.safe_get(f"{self.base_url}/index.asp")
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                # Find cantiga links
                cantigas = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    if "cantiga" in href.lower() or "autor" in href.lower():
                        cantiga_url = urljoin(self.base_url, href)
                        title = link.get_text(strip=True)
                        if title and cantiga_url not in [c[1] for c in cantigas]:
                            cantigas.append((title, cantiga_url))

                print(f"  found {len(cantigas)} entries")

                for title, url in tqdm(cantigas[:200], desc="cantigas"):
                    if limit and works_added >= limit:
                        break

                    if self.library.book_exists(title, "Medieval Portuguese", self.name):
                        continue

                    try:
                        resp = self.safe_get(url, retries=1)
                        if not resp:
                            continue

                        page_soup = BeautifulSoup(resp.text, "lxml")
                        body = page_soup.find("body")

                        if body:
                            for tag in body.find_all(["script", "style", "nav"]):
                                tag.decompose()

                            content = body.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 200:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="Medieval Portuguese",
                                    source=self.name,
                                    language="portuguese",
                                    content=content,
                                    url=url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class PHILatinDownloader(SourceDownloader):
    """Download Latin texts from Packard Humanities Institute."""

    name = "phi_latin"
    description = "PHI Latin Texts (classical Latin)"
    base_url = "https://latin.packhum.org"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from PHI Latin texts...")
        works_added = 0

        try:
            response = self.safe_get(f"{self.base_url}/browse")
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                # Find author/text links
                texts = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if "/loc/" in href and title:
                        text_url = urljoin(self.base_url, href)
                        if text_url not in [t[1] for t in texts]:
                            texts.append((title, text_url))

                print(f"  found {len(texts)} texts")

                for title, url in tqdm(texts[:300], desc="texts"):
                    if limit and works_added >= limit:
                        break

                    if self.library.book_exists(title, "PHI Latin", self.name):
                        continue

                    try:
                        resp = self.safe_get(url, retries=1)
                        if not resp:
                            continue

                        page_soup = BeautifulSoup(resp.text, "lxml")

                        # Get text content
                        main = page_soup.find("div", class_="text") or page_soup.find("pre") or page_soup.find("body")

                        if main:
                            content = main.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 200:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="PHI Latin",
                                    source=self.name,
                                    language="latin",
                                    content=content,
                                    url=url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class EuDocsDownloader(SourceDownloader):
    """Download European historical documents from BYU."""

    name = "eudocs"
    description = "BYU European primary documents"
    base_url = "https://eudocs.lib.byu.edu"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from EuDocs (BYU)...")
        works_added = 0

        try:
            response = self.safe_get(f"{self.base_url}/index.php/Main_Page")
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                # Find document links
                docs = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if "/index.php/" in href and title and len(title) > 5:
                        if "Main_Page" not in href and "Special:" not in href:
                            doc_url = urljoin(self.base_url, href)
                            if doc_url not in [d[1] for d in docs]:
                                docs.append((title, doc_url))

                print(f"  found {len(docs)} documents")

                for title, url in tqdm(docs[:200], desc="documents"):
                    if limit and works_added >= limit:
                        break

                    if self.library.book_exists(title, "EuDocs", self.name):
                        continue

                    try:
                        resp = self.safe_get(url, retries=1)
                        if not resp:
                            continue

                        page_soup = BeautifulSoup(resp.text, "lxml")

                        main = page_soup.find("div", {"id": "mw-content-text"}) or page_soup.find("main") or page_soup.find("body")

                        if main:
                            for tag in main.find_all(["script", "style", "nav"]):
                                tag.decompose()

                            content = main.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 300:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="EuDocs",
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class CTextDownloader(SourceDownloader):
    """Download classical Chinese texts from Chinese Text Project."""

    name = "ctext"
    description = "Chinese Text Project (classical Chinese)"
    base_url = "https://ctext.org"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from Chinese Text Project...")
        works_added = 0

        # Major classical works categories
        categories = [
            "/confucianism", "/daoism", "/mohism", "/legalism",
            "/military", "/pre-qin-and-han", "/histories", "/poetry",
        ]

        texts = []

        for cat in categories:
            try:
                response = self.safe_get(f"{self.base_url}{cat}")
                if response:
                    soup = BeautifulSoup(response.text, "lxml")

                    for link in soup.find_all("a", href=True):
                        href = link.get("href", "")
                        title = link.get_text(strip=True)

                        if href.startswith("/") and title and len(title) > 1:
                            if not any(x in href for x in ["/wiki", "/dictionary", "/user", "/search"]):
                                text_url = urljoin(self.base_url, href)
                                if text_url not in [t[1] for t in texts]:
                                    texts.append((title, text_url))

            except Exception:
                pass

        print(f"  found {len(texts)} texts")

        for title, url in tqdm(texts[:300], desc="texts"):
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "CText", self.name):
                continue

            try:
                resp = self.safe_get(url, retries=1)
                if not resp:
                    continue

                page_soup = BeautifulSoup(resp.text, "lxml")

                # CText uses specific div classes for content
                main = page_soup.find("div", {"id": "content2"}) or page_soup.find("td", class_="ctext")
                if not main:
                    main = page_soup.find("body")

                if main:
                    for tag in main.find_all(["script", "style", "nav"]):
                        tag.decompose()

                    content = main.get_text(separator="\n")
                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                    if len(content) > 200:
                        book = Book(
                            id=None,
                            title=title,
                            author="Classical Chinese",
                            source=self.name,
                            language="chinese",
                            content=content,
                            url=url,
                        )
                        self.library.add_book(book)
                        works_added += 1

                time.sleep(0.3)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class PrussiaDownloader(SourceDownloader):
    """Download Prussian historical documents."""

    name = "prussia"
    description = "Prussian historical documents"
    base_url = "https://prussia.online"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from prussia.online...")
        works_added = 0

        try:
            response = self.safe_get(self.base_url)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                docs = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if title and len(title) > 5:
                        doc_url = urljoin(self.base_url, href)
                        if doc_url not in [d[1] for d in docs] and self.base_url in doc_url:
                            docs.append((title, doc_url))

                print(f"  found {len(docs)} documents")

                for title, url in tqdm(docs[:150], desc="documents"):
                    if limit and works_added >= limit:
                        break

                    if self.library.book_exists(title, "Prussia Online", self.name):
                        continue

                    try:
                        resp = self.safe_get(url, retries=1)
                        if not resp:
                            continue

                        page_soup = BeautifulSoup(resp.text, "lxml")

                        main = page_soup.find("article") or page_soup.find("main") or page_soup.find("body")

                        if main:
                            for tag in main.find_all(["script", "style", "nav", "header", "footer"]):
                                tag.decompose()

                            content = main.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 300:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="Prussia Online",
                                    source=self.name,
                                    language="german",
                                    content=content,
                                    url=url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class GermanHistoryDocsDownloader(SourceDownloader):
    """Download German historical documents."""

    name = "germanhistorydocs"
    description = "German History in Documents and Images"
    base_url = "https://germanhistorydocs.ghi-dc.org"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from German History Docs...")
        works_added = 0

        try:
            response = self.safe_get(f"{self.base_url}/home.cfm")
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                docs = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if ("document" in href.lower() or "sub_document" in href.lower()) and title:
                        doc_url = urljoin(self.base_url, href)
                        if doc_url not in [d[1] for d in docs]:
                            docs.append((title, doc_url))

                print(f"  found {len(docs)} documents")

                for title, url in tqdm(docs[:200], desc="documents"):
                    if limit and works_added >= limit:
                        break

                    if self.library.book_exists(title, "GHI", self.name):
                        continue

                    try:
                        resp = self.safe_get(url, retries=1)
                        if not resp:
                            continue

                        page_soup = BeautifulSoup(resp.text, "lxml")

                        main = page_soup.find("div", {"id": "content"}) or page_soup.find("main") or page_soup.find("body")

                        if main:
                            for tag in main.find_all(["script", "style", "nav"]):
                                tag.decompose()

                            content = main.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 300:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="GHI",
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


class IranicaDownloader(SourceDownloader):
    """Download from Encyclopaedia Iranica."""

    name = "iranica"
    description = "Encyclopaedia Iranica (Persian/Iranian studies)"
    base_url = "https://www.iranicaonline.org"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from Encyclopaedia Iranica...")
        works_added = 0

        # Get articles from A-Z index
        articles = []

        for letter in "abcdefghijklmnopqrstuvwxyz":
            try:
                response = self.safe_get(f"{self.base_url}/articles/search/searchparam/{letter}/searchcategory/name")
                if response:
                    soup = BeautifulSoup(response.text, "lxml")

                    for link in soup.find_all("a", href=True):
                        href = link.get("href", "")
                        title = link.get_text(strip=True)

                        if "/articles/" in href and title and len(title) > 2:
                            article_url = urljoin(self.base_url, href)
                            if article_url not in [a[1] for a in articles]:
                                articles.append((title, article_url))

            except Exception:
                pass

        print(f"  found {len(articles)} articles")

        for title, url in tqdm(articles[:300], desc="articles"):
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "Iranica", self.name):
                continue

            try:
                resp = self.safe_get(url, retries=1)
                if not resp:
                    continue

                page_soup = BeautifulSoup(resp.text, "lxml")

                main = page_soup.find("div", class_="article-body") or page_soup.find("article") or page_soup.find("main")
                if not main:
                    main = page_soup.find("body")

                if main:
                    for tag in main.find_all(["script", "style", "nav", "aside"]):
                        tag.decompose()

                    content = main.get_text(separator="\n")
                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                    if len(content) > 500:
                        book = Book(
                            id=None,
                            title=title,
                            author="Iranica",
                            source=self.name,
                            language="english",
                            content=content,
                            url=url,
                        )
                        self.library.add_book(book)
                        works_added += 1

                time.sleep(0.3)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class WisdomLibDownloader(SourceDownloader):
    """Download Indian texts from Wisdom Library."""

    name = "wisdomlib"
    description = "Wisdom Library (Sanskrit, Pali, Indian texts)"
    base_url = "https://www.wisdomlib.org"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from Wisdom Library...")
        works_added = 0

        # Categories of texts
        categories = [
            "/hinduism", "/buddhism", "/jainism",
            "/sanskrit", "/pali", "/prakrit",
        ]

        texts = []

        for cat in categories:
            try:
                response = self.safe_get(f"{self.base_url}{cat}")
                if response:
                    soup = BeautifulSoup(response.text, "lxml")

                    for link in soup.find_all("a", href=True):
                        href = link.get("href", "")
                        title = link.get_text(strip=True)

                        if title and len(title) > 3 and "/definition/" not in href:
                            text_url = urljoin(self.base_url, href)
                            if text_url not in [t[1] for t in texts] and self.base_url in text_url:
                                texts.append((title, text_url))

            except Exception:
                pass

        print(f"  found {len(texts)} texts")

        for title, url in tqdm(texts[:300], desc="texts"):
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "WisdomLib", self.name):
                continue

            try:
                resp = self.safe_get(url, retries=1)
                if not resp:
                    continue

                page_soup = BeautifulSoup(resp.text, "lxml")

                main = page_soup.find("div", class_="article-content") or page_soup.find("article") or page_soup.find("main")
                if not main:
                    main = page_soup.find("body")

                if main:
                    for tag in main.find_all(["script", "style", "nav", "aside", "header", "footer"]):
                        tag.decompose()

                    content = main.get_text(separator="\n")
                    content = re.sub(r"\n{3,}", "\n\n", content).strip()

                    if len(content) > 500:
                        book = Book(
                            id=None,
                            title=title,
                            author="WisdomLib",
                            source=self.name,
                            language="english",
                            content=content,
                            url=url,
                        )
                        self.library.add_book(book)
                        works_added += 1

                time.sleep(0.2)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class ArlimaDownloader(SourceDownloader):
    """Download French medieval literature references from ARLIMA."""

    name = "arlima"
    description = "Archives de litterature du Moyen Age (French medieval)"
    base_url = "https://www.arlima.net"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from ARLIMA (French medieval)...")
        works_added = 0

        try:
            response = self.safe_get(self.base_url)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                entries = []
                for link in soup.find_all("a", href=True):
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if title and len(title) > 3:
                        entry_url = urljoin(self.base_url, href)
                        if entry_url not in [e[1] for e in entries] and ".net" in entry_url:
                            entries.append((title, entry_url))

                print(f"  found {len(entries)} entries")

                for title, url in tqdm(entries[:200], desc="entries"):
                    if limit and works_added >= limit:
                        break

                    if self.library.book_exists(title, "ARLIMA", self.name):
                        continue

                    try:
                        resp = self.safe_get(url, retries=1)
                        if not resp:
                            continue

                        page_soup = BeautifulSoup(resp.text, "lxml")

                        main = page_soup.find("div", {"id": "content"}) or page_soup.find("article") or page_soup.find("body")

                        if main:
                            for tag in main.find_all(["script", "style", "nav"]):
                                tag.decompose()

                            content = main.get_text(separator="\n")
                            content = re.sub(r"\n{3,}", "\n\n", content).strip()

                            if len(content) > 300:
                                book = Book(
                                    id=None,
                                    title=title,
                                    author="ARLIMA",
                                    source=self.name,
                                    language="french",
                                    content=content,
                                    url=url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

        except Exception as e:
            print(f"  error: {e}")

        print(f"  + added {works_added} works")
        return works_added


# Available sources (23 total)
SOURCES = {
    # Original 12
    "mit": MITClassicsDownloader,
    "gutenberg": GutenbergDownloader,
    "sacred": SacredTextsDownloader,
    "fordham": FordhamDownloader,
    "dante": DanteDownloader,
    "marxists": MarxistsDownloader,
    "stanford": StanfordEncyclopediaDownloader,
    "iep": IEPDownloader,
    "wikisource": WikisourceDownloader,
    "bartleby": BartlebyDownloader,
    "loebolus": LoebulusDownloader,
    "iqwiki": IQWikiDownloader,
    # New 11 sources
    "cantigas": CantigasDownloader,
    "phi_latin": PHILatinDownloader,
    "eudocs": EuDocsDownloader,
    "ctext": CTextDownloader,
    "prussia": PrussiaDownloader,
    "germanhistorydocs": GermanHistoryDocsDownloader,
    "iranica": IranicaDownloader,
    "wisdomlib": WisdomLibDownloader,
    "arlima": ArlimaDownloader,
}


def main():
    parser = argparse.ArgumentParser(
        description="Populate the Borges library with ALL available texts"
    )
    parser.add_argument(
        "--source", "-s",
        choices=["all"] + list(SOURCES.keys()),
        default="all",
        help="Which source to download from"
    )
    parser.add_argument(
        "--limit", "-l",
        type=int,
        default=None,
        help="Limit number of works per source"
    )
    parser.add_argument(
        "--list", "-L",
        action="store_true",
        help="List available sources"
    )

    args = parser.parse_args()

    if args.list:
        print("\nAvailable sources (21 total):")
        for name, cls in SOURCES.items():
            print(f"  {name}: {cls.description}")
        return

    print("=" * 60)
    print("   BORGES - POPULATING COMPLETE LIBRARY")
    print("=" * 60)

    library = Library()

    stats = library.get_stats()
    print(f"\ncurrent: {stats['total_books']} books, {stats['total_authors']} authors")

    downloaders = []

    if args.source == "all":
        for cls in SOURCES.values():
            downloaders.append(cls(library))
    else:
        downloaders.append(SOURCES[args.source](library))

    total_added = 0
    for downloader in downloaders:
        try:
            added = downloader.download_all(limit=args.limit)
            total_added += added
        except Exception as e:
            print(f"error with {downloader.name}: {e}")

    stats = library.get_stats()
    print("\n" + "=" * 60)
    print(f"COMPLETE: added {total_added} new works")
    print(f"LIBRARY NOW HAS: {stats['total_books']} books, {stats['total_authors']} authors")
    print("=" * 60)


if __name__ == "__main__":
    main()
