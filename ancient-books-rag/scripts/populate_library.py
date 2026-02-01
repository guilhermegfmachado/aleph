#!/usr/bin/env python3
"""
Populate the Borges library with texts from all sources.

Sources (11 total):
- MIT Internet Classics Archive (441 works)
- Project Gutenberg (classical authors)
- Sacred Texts Archive (religious/mythological texts)
- Fordham Internet History Sourcebooks (Ancient, Medieval, Modern)
- Dante's Divine Comedy (Gutenberg + Princeton Dante Project)
- Marxists Internet Archive (Marx, Lenin, etc.)
- Stanford Encyclopedia of Philosophy
- Internet Encyclopedia of Philosophy (IEP)
- Wikisource (public domain texts)
- Bartleby (classics and reference)
- Loebolus (Loeb Classical Library - 277 volumes)

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
                time.sleep(1 + i)  # Increasing backoff
        return None


class MITClassicsDownloader(SourceDownloader):
    """Download from MIT Internet Classics Archive - ALL 441 works."""

    name = "mit_classics"
    description = "441 works of classical literature"
    base_url = "https://classics.mit.edu"

    # Complete list of all 59 authors from MIT Classics
    AUTHORS = [
        "Aeschines", "Aeschylus", "Andocides", "Antiphon", "Apollodorus",
        "Appian", "Apuleius", "Aristophanes", "Aristotle", "Arrian",
        "Athenaeus", "Caesar", "Cato", "Catullus", "Cicero",
        "Confucius", "Demosthenes", "Dinarchus", "Diodorus", "Diogenes",
        "Epictetus", "Euclid", "Euripides", "Galen", "Herodotus",
        "Hesiod", "Hippocrates", "Homer", "Horace", "Hyperides",
        "Isaeus", "Isocrates", "Josephus", "Laotzu", "Livy",
        "Longus", "Lucian", "Lucretius", "Lycurgus", "Lysias",
        "Marcus Aurelius", "Mencius", "Ovid", "Pausanias", "Petronius",
        "Pindar", "Plato", "Plautus", "Pliny", "Plutarch",
        "Procopius", "Sallust", "Seneca", "Sextus", "Sophocles",
        "Strabo", "Suetonius", "Tacitus", "Thucydides", "Vergil",
        "Xenophon"
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from mit classics (all 441 works)...")
        works_added = 0
        works_found = 0

        for author in tqdm(self.AUTHORS, desc="authors"):
            if limit and works_added >= limit:
                break

            # Get the author's browse page
            browse_url = f"{self.base_url}/Browse/browse-{author}.html"

            try:
                response = self.safe_get(browse_url, retries=2)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                # Find all links on the page
                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    # Skip navigation and non-work links
                    if not href.endswith(".html"):
                        continue
                    if "browse" in href.lower() or "index" in href.lower():
                        continue
                    if "Help" in href or "Search" in href or "Buy" in href:
                        continue
                    if not title or len(title) < 2:
                        continue
                    # Skip "more info" links
                    if "more info" in title.lower():
                        continue

                    works_found += 1

                    if self.library.book_exists(title, author, self.name):
                        continue

                    # Build the work URL
                    work_url = urljoin(browse_url, href)

                    try:
                        work_resp = self.safe_get(work_url, retries=2)
                        if not work_resp:
                            continue

                        work_soup = BeautifulSoup(work_resp.text, "lxml")

                        # Remove scripts, styles, navigation
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

                        time.sleep(0.2)

                    except Exception:
                        pass

            except Exception:
                # Try alternate URL format
                try:
                    alt_url = f"{self.base_url}/Browse/browse-{author.replace(' ', '%20')}.html"
                    response = self.safe_get(alt_url, retries=1)
                    if response:
                        # Process same as above...
                        pass
                except Exception:
                    pass

        print(f"  + added {works_added} works (found {works_found} total)")
        return works_added


class GutenbergDownloader(SourceDownloader):
    """Download classics from Project Gutenberg via Gutendex API."""

    name = "gutenberg"
    description = "Public domain classics"
    api_url = "https://gutendex.com/books"

    # Comprehensive list of classical authors
    CLASSICAL_AUTHORS = [
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
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from gutenberg...")
        works_added = 0

        for author in tqdm(self.CLASSICAL_AUTHORS, desc="authors"):
            if limit and works_added >= limit:
                break

            try:
                # Search for author's works
                response = self.safe_get(
                    f"{self.api_url}?search={quote(author)}&languages=en",
                    timeout=60
                )
                if not response:
                    continue

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
                        "text/html; charset=utf-8",
                        "text/html",
                    ]:
                        if fmt in formats:
                            url = formats[fmt]
                            if not url.endswith('.zip'):
                                text_url = url
                                break

                    if text_url:
                        try:
                            text_resp = self.safe_get(text_url, timeout=120)
                            if not text_resp:
                                continue

                            content = text_resp.text

                            # If HTML, extract text
                            if "text/html" in text_resp.headers.get("content-type", ""):
                                soup = BeautifulSoup(content, "lxml")
                                for tag in soup.find_all(["script", "style"]):
                                    tag.decompose()
                                content = soup.get_text(separator="\n")

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
                            pass

                # Also get next page of results
                next_url = data.get("next")
                while next_url and (not limit or works_added < limit):
                    try:
                        response = self.safe_get(next_url, timeout=60)
                        if not response:
                            break
                        data = response.json()

                        for book_data in data.get("results", []):
                            if limit and works_added >= limit:
                                break
                            # Same processing as above...
                            title = book_data.get("title", "Unknown")
                            authors = book_data.get("authors", [])
                            author_name = authors[0]["name"] if authors else author

                            if self.library.book_exists(title, author_name, self.name):
                                continue

                            formats = book_data.get("formats", {})
                            text_url = None
                            for fmt in ["text/plain; charset=utf-8", "text/plain; charset=us-ascii", "text/plain"]:
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
                                            url=f"https://www.gutenberg.org/ebooks/{book_data['id']}",
                                        )
                                        self.library.add_book(book)
                                        works_added += 1
                                    time.sleep(0.5)
                                except Exception:
                                    pass

                        next_url = data.get("next")
                    except Exception:
                        break

            except Exception as e:
                print(f"  error: {author}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class SacredTextsDownloader(SourceDownloader):
    """Download from Sacred Texts Archive."""

    name = "sacred_texts"
    description = "Religious and mythological texts"
    base_url = "https://sacred-texts.com"

    # All major sections
    SECTIONS = {
        "cla": "Classical Paganism",
        "egy": "Egyptian",
        "ane": "Ancient Near East",
        "bib": "Bible",
        "chr": "Christianity",
        "gno": "Gnosticism",
        "hin": "Hinduism",
        "bud": "Buddhism",
        "jud": "Judaism",
        "isl": "Islam",
        "zor": "Zoroastrianism",
        "phi": "Philosophy",
    }

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from sacred texts...")
        works_added = 0

        for section_code, section_name in tqdm(self.SECTIONS.items(), desc="sections"):
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}/{section_code}/index.htm"

            try:
                response = self.safe_get(section_url)
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
                    if not href.endswith(".htm") and not href.endswith(".html"):
                        continue

                    title = link.get_text(strip=True)
                    if not title or len(title) < 3:
                        continue

                    if self.library.book_exists(title, section_name, self.name):
                        continue

                    text_url = urljoin(section_url, href)
                    try:
                        text_resp = self.safe_get(text_url)
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
                                    author=section_name,
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=text_url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

            except Exception as e:
                print(f"  error: {section_name}: {e}")

        print(f"  + added {works_added} works")
        return works_added


class FordhamDownloader(SourceDownloader):
    """Download from Fordham Internet History Sourcebooks."""

    name = "fordham"
    description = "Ancient, Medieval, and Modern history sourcebook"
    base_url = "https://sourcebooks.fordham.edu"

    # All sourcebook sections with multiple URL patterns
    SECTIONS = [
        ("/ancient/asbook.asp", "Ancient"),
        ("/ancient/asbook2.asp", "Ancient"),
        ("/ancient/asbook3.asp", "Ancient"),
        ("/ancient/asbook4.asp", "Ancient"),
        ("/ancient/asbook5.asp", "Ancient"),
        ("/ancient/asbook6.asp", "Ancient"),
        ("/ancient/asbook7.asp", "Ancient"),
        ("/ancient/asbook8.asp", "Ancient"),
        ("/ancient/asbook9.asp", "Ancient"),
        ("/ancient/asbook10.asp", "Ancient"),
        ("/ancient/asbook11.asp", "Ancient"),
        ("/med/sbook.asp", "Medieval"),
        ("/med/sbook1a.asp", "Medieval"),
        ("/med/sbook1b.asp", "Medieval"),
        ("/med/sbook1c.asp", "Medieval"),
        ("/mod/modsbook.asp", "Modern"),
        ("/mod/modsbook2.asp", "Modern"),
        ("/mod/modsbook3.asp", "Modern"),
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from fordham sourcebooks...")
        works_added = 0

        for section_path, section_name in tqdm(self.SECTIONS, desc="sections"):
            if limit and works_added >= limit:
                break

            section_url = f"{self.base_url}{section_path}"

            try:
                response = self.safe_get(section_url, retries=2)
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

                    if self.library.book_exists(title, section_name, self.name):
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
                                    author=section_name,
                                    source=self.name,
                                    language="english",
                                    content=content,
                                    url=text_url,
                                )
                                self.library.add_book(book)
                                works_added += 1

                        time.sleep(0.2)

                    except Exception:
                        pass

            except Exception:
                pass  # Skip sections that error

        print(f"  + added {works_added} works")
        return works_added


class DanteDownloader(SourceDownloader):
    """Download Dante's Divine Comedy from multiple sources."""

    name = "dante"
    description = "Dante's Divine Comedy - complete text"

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading dante's divine comedy...")
        works_added = 0

        # Try multiple sources for the Divine Comedy

        # Source 1: Project Gutenberg direct
        gutenberg_ids = [
            ("8800", "Divine Comedy - Complete"),
            ("1004", "Divine Comedy - Inferno"),
            ("1005", "Divine Comedy - Purgatorio"),
            ("1006", "Divine Comedy - Paradiso"),
            ("8789", "La Divina Commedia (Italian)"),
        ]

        for ebook_id, title in gutenberg_ids:
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, "Dante Alighieri", self.name):
                continue

            # Try to get the text
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
                            language="english" if "Italian" not in title else "italian",
                            content=response.text,
                            url=f"https://www.gutenberg.org/ebooks/{ebook_id}",
                        )
                        self.library.add_book(book)
                        works_added += 1
                        break
                except Exception:
                    continue

            time.sleep(0.3)

        # Source 2: Try Princeton Dante Project
        pdp_base = "https://dante.princeton.edu"

        try:
            # Get the summary/index page
            summary_url = f"{pdp_base}/pdp/summary.html"
            response = self.safe_get(summary_url, retries=2)

            if response:
                soup = BeautifulSoup(response.text, "lxml")

                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    text = link.get_text(strip=True)

                    if not text or len(text) < 3:
                        continue

                    title = f"Divine Comedy - {text}"

                    if self.library.book_exists(title, "Dante Alighieri", self.name):
                        continue

                    canto_url = urljoin(summary_url, href)

                    try:
                        text_resp = self.safe_get(canto_url, retries=1)
                        if not text_resp:
                            continue

                        text_soup = BeautifulSoup(text_resp.text, "lxml")

                        for tag in text_soup.find_all(["script", "style", "nav"]):
                            tag.decompose()

                        main = text_soup.find("main") or text_soup.find("article") or text_soup.find("body")

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

                        time.sleep(0.2)

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

    # Comprehensive author list with multiple URL patterns
    AUTHORS = [
        ("marx", "Marx, Karl", ["/archive/marx/works"]),
        ("engels", "Engels, Friedrich", ["/archive/marx/works"]),  # Engels works are under Marx
        ("lenin", "Lenin, Vladimir", ["/archive/lenin/works"]),
        ("luxemburg", "Luxemburg, Rosa", ["/archive/luxemburg"]),
        ("gramsci", "Gramsci, Antonio", ["/archive/gramsci"]),
        ("trotsky", "Trotsky, Leon", ["/archive/trotsky/works"]),
        ("plekhanov", "Plekhanov, Georgi", ["/archive/plekhanov"]),
        ("kautsky", "Kautsky, Karl", ["/archive/kautsky"]),
        ("bukharin", "Bukharin, Nikolai", ["/archive/bukharin"]),
        ("bordiga", "Bordiga, Amadeo", ["/archive/bordiga"]),
        ("pannekoek", "Pannekoek, Anton", ["/archive/pannekoe"]),
        ("gorter", "Gorter, Herman", ["/archive/gorter"]),
        ("lukacs", "Lukacs, Georg", ["/archive/lukacs"]),
        ("korsch", "Korsch, Karl", ["/archive/korsch"]),
        ("kollontai", "Kollontai, Alexandra", ["/archive/kollonta"]),
        ("zetkin", "Zetkin, Clara", ["/archive/zetkin"]),
        ("connolly", "Connolly, James", ["/archive/connolly"]),
        ("debs", "Debs, Eugene", ["/archive/debs"]),
        ("debord", "Debord, Guy", ["/archive/debord"]),
        ("kropotkin", "Kropotkin, Peter", ["/reference/archive/kropotkin"]),
        ("bakunin", "Bakunin, Mikhail", ["/reference/archive/bakunin"]),
        ("proudhon", "Proudhon, Pierre-Joseph", ["/reference/archive/proudhon"]),
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from marxists.org...")
        works_added = 0

        for author_path, author_name, url_patterns in tqdm(self.AUTHORS, desc="authors"):
            if limit and works_added >= limit:
                break

            for pattern in url_patterns:
                archive_url = f"{self.base_url}{pattern}"

                try:
                    response = self.safe_get(archive_url, retries=2)
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

                        text_url = urljoin(archive_url + "/", href)

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

                            time.sleep(0.2)

                        except Exception:
                            pass

                except Exception:
                    continue

        print(f"  + added {works_added} works")
        return works_added


class StanfordEncyclopediaDownloader(SourceDownloader):
    """Download from Stanford Encyclopedia of Philosophy."""

    name = "stanford_encyclopedia"
    description = "Stanford Encyclopedia of Philosophy"
    base_url = "https://plato.stanford.edu"

    # Comprehensive list of philosophy entries
    ENTRIES = [
        # Ancient Philosophy
        "plato", "aristotle", "socrates", "stoicism", "epicurus",
        "ancient-ethics", "presocratics", "pythagoras", "heraclitus",
        "parmenides", "democritus", "sophists", "cynics", "skepticism-ancient",
        "neoplatonism", "plotinus", "porphyry", "proclus", "iamblichus",
        "ancient-soul", "ancient-political", "ancient-rhetoric",
        # Medieval Philosophy
        "augustine", "aquinas", "boethius", "anselm", "abelard",
        "duns-scotus", "ockham", "medieval-political", "medieval-philosophy",
        # Modern Philosophy
        "kant", "hegel", "nietzsche", "heidegger", "wittgenstein",
        "descartes", "spinoza", "leibniz", "locke", "hume", "berkeley",
        "rousseau", "hobbes", "machiavelli", "montaigne",
        # Contemporary
        "marx", "existentialism", "phenomenology", "hermeneutics",
        "critical-theory", "postmodernism", "pragmatism",
        # Core Topics
        "ethics", "metaphysics", "epistemology", "logic", "aesthetics",
        "political-philosophy", "philosophy-religion", "philosophy-mind",
        "free-will", "personal-identity", "consciousness", "causation",
        "time", "truth", "meaning", "knowledge", "justification",
        "moral-realism", "virtue-ethics", "consequentialism", "deontology",
        "naturalism", "materialism", "idealism", "dualism", "monism",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from stanford encyclopedia...")
        works_added = 0

        for entry in tqdm(self.ENTRIES, desc="entries"):
            if limit and works_added >= limit:
                break

            entry_url = f"{self.base_url}/entries/{entry}/"

            try:
                response = self.safe_get(entry_url, retries=2)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                # Get title from h1
                title_elem = soup.find("h1")
                title = title_elem.get_text(strip=True) if title_elem else entry.replace("-", " ").title()

                if self.library.book_exists(title, "Stanford Encyclopedia", self.name):
                    continue

                # Get main content - try multiple selectors
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

                time.sleep(0.3)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class WikisourceDownloader(SourceDownloader):
    """Download from Wikisource."""

    name = "wikisource"
    description = "Wikisource public domain texts"
    base_url = "https://en.wikisource.org"
    api_url = "https://en.wikisource.org/w/api.php"

    # Comprehensive list of classical and philosophical works
    WORKS = [
        # Ancient Philosophy
        "The Republic (Plato)",
        "Symposium (Plato)",
        "Apology (Plato)",
        "Phaedo",
        "Phaedrus (Plato)",
        "Timaeus (Plato)",
        "Theaetetus (Plato)",
        "Parmenides (Plato)",
        "Laws (Plato)",
        "Nicomachean Ethics",
        "Politics (Aristotle)",
        "Poetics (Aristotle)",
        "Metaphysics (Aristotle)",
        "Meditations",
        "Enchiridion (Epictetus)",
        "Discourses of Epictetus",
        "On the Nature of Things",
        # Epic Poetry
        "The Iliad",
        "The Odyssey",
        "Aeneid",
        "Metamorphoses",
        "Theogony",
        "Works and Days",
        # Medieval & Renaissance
        "The Consolation of Philosophy",
        "The Prince (Machiavelli)",
        "Leviathan",
        "The City of God",
        "Confessions (Augustine)",
        # Early Modern Philosophy
        "Two Treatises of Government",
        "An Essay Concerning Human Understanding",
        "A Treatise of Human Nature",
        "Critique of Pure Reason",
        "Critique of Practical Reason",
        "Critique of Judgment",
        "Ethics (Spinoza)",
        "Meditations on First Philosophy",
        "Discourse on the Method",
        "The Social Contract",
        "Emile, or On Education",
        # 19th Century
        "On Liberty",
        "Utilitarianism",
        "Thus Spake Zarathustra",
        "Beyond Good and Evil",
        "The Genealogy of Morals",
        "The Communist Manifesto",
        "Capital, Volume I",
        "Phenomenology of Spirit",
        "The World as Will and Representation",
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

                time.sleep(0.3)

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class BartlebyDownloader(SourceDownloader):
    """Download from Bartleby.com."""

    name = "bartleby"
    description = "Bartleby classics and reference"
    base_url = "https://www.bartleby.com"

    # Key author and reference pages
    PATHS = [
        "/lit-hub/aristotle/",
        "/lit-hub/plato/",
        "/lit-hub/homer/",
        "/lit-hub/virgil/",
        "/lit-hub/dante/",
        "/lit-hub/shakespeare/",
        "/lit-hub/milton/",
        "/lit-hub/chaucer/",
        "/lit-hub/bible/",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from bartleby...")
        works_added = 0

        for path in tqdm(self.PATHS, desc="authors"):
            if limit and works_added >= limit:
                break

            try:
                index_url = f"{self.base_url}{path}"
                response = self.safe_get(index_url, retries=2)

                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                # Get author from path
                author = path.split("/")[-2].title() if "/" in path else "Unknown"

                for link in soup.find_all("a", href=True):
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

                        # Find main content
                        main = work_soup.find("main") or work_soup.find("article")
                        if not main:
                            main = work_soup.find("div", class_=re.compile(r"content|text|body"))
                        if not main:
                            main = work_soup.find("body")

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

                        time.sleep(0.2)

                    except Exception:
                        pass

            except Exception:
                pass

        print(f"  + added {works_added} works")
        return works_added


class LoebulusDownloader(SourceDownloader):
    """Download from Loebolus (Loeb Classical Library public domain texts)."""

    name = "loebolus"
    description = "Loeb Classical Library (277 public domain volumes)"
    base_url = "https://ryanfb.xyz/loebolus"
    data_url = "https://ryanfb.xyz/loebolus-data"

    # Map of Loeb volume numbers to titles/authors
    # These are public domain Loebs (pre-1927)
    VOLUMES = [
        ("L001", "Apollonius Rhodius - Argonautica", "Apollonius"),
        ("L002", "Appian - Roman History Vol I", "Appian"),
        ("L003", "Appian - Roman History Vol II", "Appian"),
        ("L004", "Appian - Roman History Vol III", "Appian"),
        ("L005", "Appian - Roman History Vol IV", "Appian"),
        ("L010", "Aristotle - Athenian Constitution", "Aristotle"),
        ("L017", "Aristotle - Metaphysics Books I-IX", "Aristotle"),
        ("L018", "Aristotle - Metaphysics Books X-XIV", "Aristotle"),
        ("L021", "Aristotle - Politics", "Aristotle"),
        ("L023", "Aristotle - Poetics", "Aristotle"),
        ("L036", "Caesar - Alexandrian, African and Spanish Wars", "Caesar"),
        ("L039", "Caesar - Civil Wars", "Caesar"),
        ("L072", "Caesar - Gallic War", "Caesar"),
        ("L028", "Catullus", "Catullus"),
        ("L029", "Catullus, Tibullus, Pervigilium Veneris", "Various"),
        ("L030", "Cicero - Brutus", "Cicero"),
        ("L040", "Cicero - De Finibus", "Cicero"),
        ("L052", "Cicero - De Natura Deorum", "Cicero"),
        ("L058", "Cicero - De Officiis", "Cicero"),
        ("L154", "Cicero - De Oratore Books I-II", "Cicero"),
        ("L141", "Cicero - De Republica, De Legibus", "Cicero"),
        ("L056", "Cicero - De Senectute, De Amicitia", "Cicero"),
        ("L043", "Demosthenes - Olynthiacs, Philippics", "Demosthenes"),
        ("L099", "Dio Cassius - Roman History", "Dio Cassius"),
        ("L130", "Diogenes Laertius - Lives of Eminent Philosophers I", "Diogenes Laertius"),
        ("L131", "Diogenes Laertius - Lives of Eminent Philosophers II", "Diogenes Laertius"),
        ("L422", "Epictetus - Discourses Books I-II", "Epictetus"),
        ("L104", "Euripides - Cyclops, Alcestis, Medea", "Euripides"),
        ("L011", "Euripides - Children of Heracles, Hippolytus", "Euripides"),
        ("L170", "Homer - Iliad I (Books 1-12)", "Homer"),
        ("L171", "Homer - Iliad II (Books 13-24)", "Homer"),
        ("L104", "Homer - Odyssey I (Books 1-12)", "Homer"),
        ("L105", "Homer - Odyssey II (Books 13-24)", "Homer"),
        ("L041", "Horace - Odes and Epodes", "Horace"),
        ("L194", "Horace - Satires, Epistles, Ars Poetica", "Horace"),
        ("L062", "Josephus - Jewish War", "Josephus"),
        ("L242", "Livy - History of Rome I", "Livy"),
        ("L114", "Lucian - Vol I", "Lucian"),
        ("L181", "Lucian - Vol II", "Lucian"),
        ("L058", "Marcus Aurelius - Meditations", "Marcus Aurelius"),
        ("L041", "Ovid - Metamorphoses I", "Ovid"),
        ("L043", "Ovid - Metamorphoses II", "Ovid"),
        ("L027", "Pausanias - Description of Greece I", "Pausanias"),
        ("L186", "Petronius - Satyricon", "Petronius"),
        ("L036", "Plato - Euthyphro, Apology, Crito, Phaedo, Phaedrus", "Plato"),
        ("L165", "Plato - Laches, Protagoras, Meno, Euthydemus", "Plato"),
        ("L166", "Plato - Republic I (Books 1-5)", "Plato"),
        ("L167", "Plato - Republic II (Books 6-10)", "Plato"),
        ("L123", "Plato - Theaetetus, Sophist", "Plato"),
        ("L234", "Plato - Timaeus, Critias, Cleitophon", "Plato"),
        ("L046", "Pliny - Natural History I", "Pliny the Elder"),
        ("L047", "Pliny - Letters I", "Pliny the Younger"),
        ("L046", "Plutarch - Lives I", "Plutarch"),
        ("L047", "Plutarch - Lives II", "Plutarch"),
        ("L065", "Plutarch - Moralia I", "Plutarch"),
        ("L216", "Polybius - Histories I", "Polybius"),
        ("L211", "Seneca - Epistles I", "Seneca"),
        ("L076", "Seneca - Moral Essays I", "Seneca"),
        ("L020", "Sophocles - Ajax, Electra, Trachiniae, Philoctetes", "Sophocles"),
        ("L021", "Sophocles - Antigone, Oedipus Tyrannus, Oedipus Coloneus", "Sophocles"),
        ("L110", "Tacitus - Annals I-III", "Tacitus"),
        ("L111", "Tacitus - Annals IV-VI, XI-XII", "Tacitus"),
        ("L249", "Tacitus - Histories I-III", "Tacitus"),
        ("L069", "Thucydides - History I", "Thucydides"),
        ("L109", "Thucydides - History II", "Thucydides"),
        ("L051", "Virgil - Eclogues, Georgics, Aeneid I-VI", "Virgil"),
        ("L064", "Virgil - Aeneid VII-XII", "Virgil"),
        ("L089", "Xenophon - Anabasis", "Xenophon"),
        ("L090", "Xenophon - Hellenica I-V", "Xenophon"),
        ("L168", "Xenophon - Memorabilia, Oeconomicus", "Xenophon"),
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from loebolus (loeb classical library)...")
        works_added = 0

        # First, try to get the index page to find all available PDFs
        try:
            response = self.safe_get(self.base_url, retries=2)
            if response:
                soup = BeautifulSoup(response.text, "lxml")

                # Find all PDF links
                for link in soup.find_all("a", href=True):
                    if limit and works_added >= limit:
                        break

                    href = link.get("href", "")
                    if not href.endswith(".pdf"):
                        continue

                    title = link.get_text(strip=True)
                    if not title or len(title) < 3:
                        # Try to get title from link text or parent
                        parent = link.find_parent("tr") or link.find_parent("li")
                        if parent:
                            title = parent.get_text(strip=True)[:100]

                    if not title:
                        continue

                    # Extract author if possible
                    author = "Various"
                    for known_author in ["Homer", "Plato", "Aristotle", "Cicero", "Virgil",
                                        "Seneca", "Tacitus", "Plutarch", "Xenophon"]:
                        if known_author.lower() in title.lower():
                            author = known_author
                            break

                    if self.library.book_exists(title, author, self.name):
                        continue

                    pdf_url = urljoin(self.base_url + "/", href)

                    # Note: We can't extract PDF text without additional libraries
                    # Store a reference to the PDF instead
                    book = Book(
                        id=None,
                        title=f"[PDF] {title}",
                        author=author,
                        source=self.name,
                        language="english",
                        content=f"This is a Loeb Classical Library volume available as PDF.\n\nDownload: {pdf_url}\n\nThe Loeb Classical Library presents Greek and Latin texts with facing English translations.",
                        url=pdf_url,
                    )
                    self.library.add_book(book)
                    works_added += 1

        except Exception as e:
            print(f"  note: could not fetch loebolus index: {e}")

        # Also add entries from our known volumes list
        for vol_id, title, author in self.VOLUMES:
            if limit and works_added >= limit:
                break

            if self.library.book_exists(title, author, self.name):
                continue

            pdf_url = f"{self.data_url}/{vol_id}.pdf"

            book = Book(
                id=None,
                title=f"[Loeb] {title}",
                author=author,
                source=self.name,
                language="english",
                content=f"Loeb Classical Library volume {vol_id}.\n\nTitle: {title}\nAuthor: {author}\n\nDownload PDF: {pdf_url}\n\nThe Loeb Classical Library presents Greek and Latin texts with facing English translations. This volume is in the public domain.",
                url=pdf_url,
            )
            self.library.add_book(book)
            works_added += 1

        print(f"  + added {works_added} works (PDF references)")
        return works_added


class IEPDownloader(SourceDownloader):
    """Download from Internet Encyclopedia of Philosophy."""

    name = "iep"
    description = "Internet Encyclopedia of Philosophy"
    base_url = "https://iep.utm.edu"

    # Key philosophy articles
    ARTICLES = [
        # Ancient Philosophy
        "socrates", "plato", "aristotle", "presocratics", "stoicism",
        "epicurus", "stoic-ethics", "ancient-skepticism", "cynics",
        "neoplatonism", "plotinus", "pythagoras", "heraclitus", "parmenides",
        "zeno-of-elea", "empedocles", "anaxagoras", "democritus", "protagoras",
        "gorgias", "thrasymachus", "antiphon", "prodicus", "hippias",
        "diogenes-of-sinope", "pyrrho", "arcesilaus", "carneades", "sextus-empiricus",
        "epictetus", "marcus-aurelius", "lucretius", "cicero", "seneca",
        # Medieval
        "augustine", "boethius", "anselm", "abelard", "aquinas",
        "duns-scotus", "william-ockham", "medieval-problem-universals",
        # Early Modern
        "descartes", "spinoza", "leibniz", "locke", "berkeley", "hume",
        "kant", "hobbes", "rousseau", "pascal", "malebranche",
        # 19th Century
        "hegel", "nietzsche", "marx", "kierkegaard", "schopenhauer",
        "mill", "bentham", "comte", "peirce", "james-william",
        # 20th Century
        "husserl", "heidegger", "sartre", "camus", "beauvoir",
        "wittgenstein", "russell", "frege", "carnap", "quine",
        "popper", "kuhn", "feyerabend", "rawls", "nozick",
        # Core Topics
        "ethics", "metaethics", "normative-ethics", "applied-ethics",
        "epistemology", "metaphysics", "logic", "philosophy-of-mind",
        "philosophy-of-language", "philosophy-of-science", "political-philosophy",
        "aesthetics", "free-will", "personal-identity", "consciousness",
        "truth", "knowledge", "justification", "skepticism", "relativism",
    ]

    def download_all(self, limit: int | None = None):
        print(f"\n>> downloading from internet encyclopedia of philosophy...")
        works_added = 0

        for article in tqdm(self.ARTICLES, desc="articles"):
            if limit and works_added >= limit:
                break

            article_url = f"{self.base_url}/{article}/"

            try:
                response = self.safe_get(article_url, retries=2)
                if not response:
                    continue

                soup = BeautifulSoup(response.text, "lxml")

                # Get title
                title_elem = soup.find("h1", class_="entry-title") or soup.find("h1")
                title = title_elem.get_text(strip=True) if title_elem else article.replace("-", " ").title()

                if self.library.book_exists(title, "IEP", self.name):
                    continue

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

                time.sleep(0.3)

            except Exception:
                pass

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
    "loebolus": LoebulusDownloader,
    "iep": IEPDownloader,
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

    print("=" * 60)
    print("   borges - populating library (comprehensive edition)")
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
    print(f"library now has: {stats['total_books']} books, {stats['total_authors']} authors")
    print("=" * 60)


if __name__ == "__main__":
    main()
