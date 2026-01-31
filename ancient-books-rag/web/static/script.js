// Borges - Frontend JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const authorFilter = document.getElementById('author-filter');
    const sourceFilter = document.getElementById('source-filter');
    const resultsDiv = document.getElementById('results');

    let currentQuery = '';

    // Load filters
    loadFilters();

    // Search handlers
    if (searchBtn) {
        searchBtn.addEventListener('click', doSearch);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                doSearch();
            }
        });
    }

    // Quick search links
    document.querySelectorAll('.quick-search').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const query = link.dataset.query;
            searchInput.value = query;
            doSearch();
        });
    });

    async function loadFilters() {
        try {
            const authorsRes = await fetch('/api/authors');
            const authorsData = await authorsRes.json();
            if (authorFilter && authorsData.authors) {
                authorsData.authors.forEach(author => {
                    const option = document.createElement('option');
                    option.value = author;
                    option.textContent = author.toLowerCase();
                    authorFilter.appendChild(option);
                });
            }

            const sourcesRes = await fetch('/api/sources');
            const sourcesData = await sourcesRes.json();
            if (sourceFilter && sourcesData.sources) {
                sourcesData.sources.forEach(source => {
                    const option = document.createElement('option');
                    option.value = source;
                    option.textContent = source;
                    sourceFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('failed to load filters:', error);
        }
    }

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        currentQuery = query;

        resultsDiv.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>searching...</p>
            </div>
        `;

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    author: authorFilter?.value || null,
                    source: sourceFilter?.value || null,
                    limit: 50
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'search failed');
            }

            const data = await response.json();
            displayResults(data.results, query);

        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="error">
                    <p>error: ${error.message}</p>
                </div>
            `;
        }
    }

    function displayResults(results, query) {
        if (results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="no-results">
                    <p>no results for "${query}"</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="results-header">
                <h3>found ${results.length} results for "${query}"</h3>
            </div>
            <div class="results-list">
        `;

        results.forEach(result => {
            // Pass query to book page for highlighting
            const bookUrl = `/book/${result.book_id}?q=${encodeURIComponent(query)}`;

            html += `
                <div class="result-card">
                    <div class="result-header">
                        <a href="${bookUrl}" class="result-title">${result.title.toLowerCase()}</a>
                        <span class="result-author">— ${result.author.toLowerCase()}</span>
                    </div>
                    <div class="result-snippet">${result.snippet}</div>
                    <div class="result-meta">
                        <span class="result-source">[${result.source}]</span>
                        <a href="${bookUrl}" class="read-more">read →</a>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        resultsDiv.innerHTML = html;
    }
});
