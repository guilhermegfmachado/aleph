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
- Stanford Encyclopedia of Philosophy
- Wikisource
- Bartleby

Run: python scripts/populate_library.py --source all
"""

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

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
                time.sleep(1)
        return None


class MITClassicsDownloader(SourceDownloader):
    """Download from MIT Internet Classics Archive."""

    name = "mit_classics"
    description = "441 works of classical literature"
    base_url = "https://classics.mit.edu"

    # Known authors and their works from MIT Classics
    AUTHORS = [
        "Aeschines", "Aeschylus", "Apollodorus", "Apollonius", "Appian",
        "Apuleius", "Aristophanes", "Aristotle", "Arrian", "Athenaeus",
        "Caesar", "Cato", "Catullus", "Cicero", "Confucius", "Demosthenes",
        "Diodorus", "Epictetus", "Euclid", "Euripides", "Galen",
        "Herodotus", "Hesiod", "Hippocrates", "Homer", "Horace",
        "Josephus", "Laotzu", "Livy", "Longus", "Lucian", "Lucretius",
        "Marcus Aurelius", "Mencius", "Ovid", "Pausanias", "Petronius",
        "Pindar", "Plato", "Plautus", "Pliny", "Plutarch", "Procopius",
        "Sallust", "Seneca", "Sextus", "Sophocles", "Strabo", "Suetonius",
        "Tacitus", "Thucydides", "Vergil", "Xenophon"
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from mit classics...")
        works_added = 0

        for author in tqdm(self.AUTHORS, desc="authors"):
            if limit and works_added >= limit:
                break

            # Try to get the author's browse page
            browse_url = f"{self.base_url}/Browse/browse-{author}.html"

            try:
                response = self.safe_get(browse_url, retries=2)
                soup = BeautifulSoup(response.text, "lxml")

                # Find all work links - they typically go to /{Author}/work.html
                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")

                    # Work links typically contain the author name and end in .html
                    if not href.endswith(".html"):
                        continue
                    if "browse" in href.lower() or "index" in href.lower():
                        continue
                    if "Help" in href or "Search" in href:
                        continue

                    title = link.get_text(strip=True)
                    if not title or len(title) < 2:
                        continue

                    if self.library.book_exists(title, author, self.name):
                        continue

                    work_url = urljoin(browse_url, href)

                    try:
                        work_resp = self.safe_get(work_url, retries=2)
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
                                    author=author,
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=work_url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.3)

                    except Exception:
                        pass

            except Exception as e:
                # Author page might not exist, skip silently
                pass

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
        "Diogenes Laertius", "Pliny", "Demosthenes", "Isocrates",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from gutenberg...")
        works_added = 0

        for author in tqdm(self.CLASSICAL_AUTHORS, desc="authors"):
            if limit and works_added >= limit:
                break

            try:
                response = self.safe_get(
                    f"{self.api_url}?search={author}&languages=en",
                    timeout=60
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
                    # Try multiple text formats
                    text_url = None
                    for fmt in [
                        "text/plain; charset=utf-8",
                        "text/plain; charset=us-ascii",
                        "text/plain",
                    ]:
                        if fmt in formats:
                            text_url = formats[fmt]
                            break

                    if text_url and not text_url.endswith('.zip'):
                        try:
                            text_resp = self.safe_get(text_url, timeout=120)
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

                            time.sleep(0.5)

                        except Exception:
                            pass  # Skip failed downloads

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
        "hin": "Hinduism",
        "bud": "Buddhism",
    }

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from sacred texts...")
        works_added = 0

        for section_code, section_name in self.SECTIONS.items():
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}/{section_code}/index.htm"

            try:
                response = self.safe_get(section_url)
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
                        text_resp = self.safe_get(text_url)
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

                        time.sleep(0.3)

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

    # Multiple sections and URL patterns to try
    SECTIONS = [
        "/ancient/asbook.asp",
        "/ancient/asbookfull.asp",
        "/ancient/",
        "/med/sbook.asp",
        "/med/sbookfull.asp",
        "/med/",
        "/mod/modsbook.asp",
        "/mod/",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from fordham sourcebooks...")
        works_added = 0

        for section_path in self.SECTIONS:
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}{section_path}"

            try:
                response = self.safe_get(section_url)
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
                        text_resp = self.safe_get(text_url)
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

                        time.sleep(0.3)

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

        # Try to get canto summaries page which has all canto links
        summary_url = f"{self.base_url}/pdp/summary.html"

        try:
            response = self.safe_get(summary_url)
            soup = BeautifulSoup(response.text, "lxml")

            # Find all links to cantos
            for link in soup.find_all("a", href=True):
                if limit and works_added >= limit:
                    break

                href = link.get("href", "")
                text = link.get_text(strip=True)

                # Look for canto-related links
                if not text or len(text) < 3:
                    continue

                # Build title from link text
                title = f"Divine Comedy - {text}"

                if self.library.book_exists(title, "Dante Alighieri", self.name):
                    continue

                canto_url = urljoin(summary_url, href)

                try:
                    text_resp = self.safe_get(canto_url, retries=1)
                    text_soup = BeautifulSoup(text_resp.text, "lxml")

                    for tag in text_soup.find_all(["script", "style", "nav"]):
                        tag.decompose()

                    # Try to find main content
                    main = text_soup.find("main") or text_soup.find("article")
                    if not main:
                        main = text_soup.find("body")

                    if main:
                        content = main.get_text(separator="\n")
                        content = re.sub(r"\n{3,}", "\n\n", content).strip()

                        if len(content) > 200:
                            book = Book(
                                id=None,
                                title=title,
                                author="Dante Alighieri",
                                source=self.name,
                                language="english",
                                content=content,
                                url=canto_url,
                            )
                            self.library.add_book(book)
                            works_added += 1

                    time.sleep(0.3)

                except Exception:
                    pass

        except Exception as e:
            print(f"  error fetching summary: {e}")

        # Also try the main commedia page
        commedia_url = f"{self.base_url}/dante/pdp/commedia.html"
        try:
            response = self.safe_get(commedia_url)
            soup = BeautifulSoup(response.text, "lxml")

            for link in soup.find_all("a", href=True):
                if limit and works_added >= limit:
                    break

                href = link.get("href", "")
                text = link.get_text(strip=True)

                if not text or "canto" not in text.lower():
                    continue

                title = f"Divine Comedy - {text}"

                if self.library.book_exists(title, "Dante Alighieri", self.name):
                    continue

                canto_url = urljoin(commedia_url, href)

                try:
                    text_resp = self.safe_get(canto_url, retries=1)
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
                                title=title,
                                author="Dante Alighieri",
                                source=self.name,
                                language="english",
                                content=content,
                                url=canto_url,
                            )
                            self.library.add_book(book)
                            works_added += 1

                    time.sleep(0.3)

                except Exception:
                    pass

        except Exception:
            pass

        print(f"  + added {works_added} works")
        return works_added


class MarxistsDownloader(SourceDownloader):
    """Download from Marxists Internet Archive."""

    name = "marxists"
    description = "Marxist texts and philosophy"
    base_url = "https://www.marxists.org"

    # (path, name, url_patterns to try)
    AUTHORS = [
        ("marx", "Marx, Karl", ["/archive/marx/works", "/archive/marx"]),
        ("engels", "Engels, Friedrich", ["/archive/marx/works", "/archive/engels"]),
        ("lenin", "Lenin, Vladimir", ["/archive/lenin/works", "/archive/lenin"]),
        ("luxemburg", "Luxemburg, Rosa", ["/archive/luxemburg", "/archive/luxemburg/works"]),
        ("gramsci", "Gramsci, Antonio", ["/archive/gramsci", "/archive/gramsci/works"]),
        ("trotsky", "Trotsky, Leon", ["/archive/trotsky/works", "/archive/trotsky"]),
        ("plekhanov", "Plekhanov, Georgi", ["/archive/plekhanov"]),
        ("kautsky", "Kautsky, Karl", ["/archive/kautsky"]),
        ("bukharin", "Bukharin, Nikolai", ["/archive/bukharin"]),
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from marxists.org...")
        works_added = 0

        for author_path, author_name, url_patterns in self.AUTHORS:
            if limit and works_added >= limit:
                break

            for pattern in url_patterns:
                archive_url = f"{self.base_url}{pattern}"

                try:
                    response = self.safe_get(archive_url, retries=1)
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
                            text_resp = self.safe_get(text_url)
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

                            time.sleep(0.3)

                        except Exception:
                            pass

                    # If we got here without exception, we found a working URL
                    break

                except Exception:
                    # Try next URL pattern
                    continue

        print(f"  + added {works_added} works")
        return works_added


class StanfordEncyclopediaDownloader(SourceDownloader):
    """Download from Stanford Encyclopedia of Philosophy."""

    name = "stanford_encyclopedia"
    description = "Stanford Encyclopedia of Philosophy"
    base_url = "https://plato.stanford.edu"

    # Key philosophy entries to download
    ENTRIES = [
        "plato", "aristotle", "socrates", "stoicism", "epicurus",
        "ancient-ethics", "presocratics", "pythagoras", "heraclitus",
        "parmenides", "democritus", "sophists", "cynics", "skepticism-ancient",
        "neoplatonism", "plotinus", "augustine", "aquinas", "kant",
        "hegel", "nietzsche", "heidegger", "wittgenstein", "marx",
        "existentialism", "phenomenology", "hermeneutics", "ethics",
        "metaphysics", "epistemology", "logic", "aesthetics", "political-philosophy",
        "philosophy-religion", "free-will", "personal-identity", "consciousness",
        "time", "causation", "truth", "meaning", "knowledge", "justification",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from stanford encyclopedia...")
        works_added = 0

        for entry in tqdm(self.ENTRIES, desc="entries"):
            if limit and works_added >= limit:
                break

            entry_url = f"{self.base_url}/entries/{entry}/"

            try:
                response = self.safe_get(entry_url)
                soup = BeautifulSoup(response.text, "lxml")

                # Get title
                title_elem = soup.find("h1")
                title = title_elem.get_text(strip=True) if title_elem else entry.replace("-", " ").title()

                if self.library.book_exists(title, "Stanford Encyclopedia", self.name):
                    continue

                # Get main content
                main_content = soup.find("div", {"id": "main-text"})
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

                time.sleep(0.5)

            except Exception as e:
                pass

        print(f"  + added {works_added} works")
        return works_added


class WikisourceDownloader(SourceDownloader):
    """Download from Wikisource."""

    name = "wikisource"
    description = "Wikisource public domain texts"
    base_url = "https://en.wikisource.org"
    api_url = "https://en.wikisource.org/w/api.php"

    # Classical and philosophical works on Wikisource
    WORKS = [
        "The Republic (Plato)",
        "The Symposium (Plato)",
        "Apology (Plato)",
        "Phaedo",
        "Nicomachean Ethics",
        "Politics (Aristotle)",
        "Meditations",
        "The Iliad",
        "The Odyssey",
        "Aeneid",
        "Metamorphoses",
        "The Consolation of Philosophy",
        "The Prince (Machiavelli)",
        "Leviathan",
        "Two Treatises of Government",
        "An Essay Concerning Human Understanding",
        "A Treatise of Human Nature",
        "Critique of Pure Reason",
        "The Social Contract",
        "On Liberty",
        "Utilitarianism",
        "Thus Spake Zarathustra",
        "Beyond Good and Evil",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from wikisource...")
        works_added = 0

        for work_title in tqdm(self.WORKS, desc="works"):
            if limit and works_added >= limit:
                break

            try:
                # Use API to get page content
                params = {
                    "action": "query",
                    "titles": work_title,
                    "prop": "extracts",
                    "explaintext": True,
                    "format": "json",
                }

                response = self.safe_get(f"{self.api_url}?{self._build_query(params)}")
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
                        url=f"{self.base_url}/wiki/{work_title.replace(' ', '_')}",
                    )
                    self.library.add_book(book)
                    works_added += 1

                time.sleep(0.5)

            except Exception as e:
                pass

        print(f"  + added {works_added} works")
        return works_added

    def _build_query(self, params):
        return "&".join(f"{k}={v}" for k, v in params.items())


class BartlebyDownloader(SourceDownloader):
    """Download from Bartleby.com."""

    name = "bartleby"
    description = "Bartleby classics and reference"
    base_url = "https://www.bartleby.com"

    # Key works available on Bartleby
    PATHS = [
        "/lit-hub/aristotle/",
        "/lit-hub/plato/",
        "/lit-hub/homer/",
        "/lit-hub/virgil/",
        "/lit-hub/dante/",
        "/lit-hub/shakespeare/",
        "/lit-hub/milton/",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from bartleby...")
        works_added = 0

        for path in self.PATHS:
            if limit and works_added >= limit:
                break

            try:
                index_url = f"{self.base_url}{path}"
                response = self.safe_get(index_url)
                soup = BeautifulSoup(response.text, "lxml")

                # Find work links
                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if not title or len(title) < 3:
                        continue
                    if not href or "lit-hub" not in href:
                        continue

                    # Get author from path
                    author = path.split("/")[-2].title() if "/" in path else "Unknown"

                    if self.library.book_exists(title, author, self.name):
                        continue

                    work_url = urljoin(self.base_url, href)

                    try:
                        work_resp = self.safe_get(work_url)
                        work_soup = BeautifulSoup(work_resp.text, "lxml")

                        # Find main content
                        main = work_soup.find("main") or work_soup.find("article")
                        if not main:
                            main = work_soup.find("div", class_=re.compile(r"content|text|body"))

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

                        time.sleep(0.3)

                    except Exception:
                        pass

            except Exception as e:
                print(f"  error: {path}: {e}")

        print(f"  + added {works_added} works")
        return works_added


# Available sources
SOURCES = {
    "mit": MITClassicsDownloader,
    "gutenberg": GutenbergDownloader,
    "sacred": SacredTextsDownloader,
    "fordham": FordhamDownloader,
    "dante": DanteDownloader,
    "marxists": MarxistsDownloader,
    "stanford": StanfordEncyclopediaDownloader,
    "wikisource": WikisourceDownloader,
    "bartleby": BartlebyDownloader,
}


def main():
    parser = argparse.ArgumentParser(
        description="Populate the Borges library"
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
        print("\nAvailable sources:")
        for name, cls in SOURCES.items():
            print(f"  {name}: {cls.description}")
        return

    print("=" * 50)
    print("   borges - populating library")
    print("=" * 50)

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
    print("\n" + "=" * 50)
    print(f"+ added {total_added} new works")
    print(f"library: {stats['total_books']} books, {stats['total_authors']} authors")
    print("=" * 50)


if __name__ == "__main__":
    main()
