// Classical Texts Library - Frontend JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const authorFilter = document.getElementById('author-filter');
    const sourceFilter = document.getElementById('source-filter');
    const resultsDiv = document.getElementById('results');

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
            // Load authors
            const authorsRes = await fetch('/api/authors');
            const authorsData = await authorsRes.json();
            if (authorFilter && authorsData.authors) {
                authorsData.authors.forEach(author => {
                    const option = document.createElement('option');
                    option.value = author;
                    option.textContent = author;
                    authorFilter.appendChild(option);
                });
            }

            // Load sources
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
            console.error('Failed to load filters:', error);
        }
    }

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        // Show loading
        resultsDiv.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Searching...</p>
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
                throw new Error(error.detail || 'Search failed');
            }

            const data = await response.json();
            displayResults(data.results, query);

        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="error">
                    <p>Error: ${error.message}</p>
                    <p>Try a simpler search term or check if the library has been populated.</p>
                </div>
            `;
        }
    }

    function displayResults(results, query) {
        if (results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="no-results">
                    <h3>No results found for "${query}"</h3>
                    <p>Try different keywords or check spelling.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="results-header">
                <h3>Found ${results.length} passages matching "${query}"</h3>
            </div>
            <div class="results-list">
        `;

        results.forEach(result => {
            html += `
                <div class="result-card">
                    <div class="result-header">
                        <a href="/book/${result.book_id}" class="result-title">${result.title}</a>
                        <span class="result-author">by ${result.author}</span>
                    </div>
                    <div class="result-snippet">${result.snippet}</div>
                    <div class="result-meta">
                        <span class="result-source">${result.source}</span>
                        <a href="/book/${result.book_id}" class="read-more">Read full text →</a>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        resultsDiv.innerHTML = html;
    }
});
