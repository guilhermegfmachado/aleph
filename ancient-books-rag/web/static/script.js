// Ancient Books - Frontend JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const queryInput = document.getElementById('query-input');
    const submitBtn = document.getElementById('submit-btn');
    const resultsDiv = document.getElementById('results');
    const authorFilter = document.getElementById('author-filter');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const statsDisplay = document.getElementById('stats-display');

    let currentMode = 'ask';

    // Load initial data
    loadAuthors();
    loadStats();

    // Mode toggle
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;

            // Update placeholder and button text
            if (currentMode === 'ask') {
                queryInput.placeholder = 'Example: What did Homer write about love?';
                submitBtn.querySelector('.btn-text').textContent = 'Ask';
            } else {
                queryInput.placeholder = 'Search for: love, war, justice, death...';
                submitBtn.querySelector('.btn-text').textContent = 'Search';
            }
        });
    });

    // Submit handler
    submitBtn.addEventListener('click', handleSubmit);

    // Enter key handler (Cmd/Ctrl + Enter to submit)
    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
    });

    // Example query handlers
    document.querySelectorAll('.example-query').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Remove quotes from the text
            const query = link.textContent.replace(/"/g, '');
            queryInput.value = query;
            handleSubmit();
        });
    });

    async function handleSubmit() {
        const query = queryInput.value.trim();
        if (!query) return;

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').style.display = 'none';
        submitBtn.querySelector('.btn-loading').style.display = 'inline';

        resultsDiv.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-secondary);">
                    Searching through ancient texts...
                </p>
            </div>
        `;

        try {
            if (currentMode === 'ask') {
                await askQuestion(query);
            } else {
                await searchTexts(query);
            }
        } catch (error) {
            showError(error.message);
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').style.display = 'inline';
            submitBtn.querySelector('.btn-loading').style.display = 'none';
        }
    }

    async function askQuestion(query) {
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                author_filter: authorFilter.value || null,
                num_sources: 8
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get answer');
        }

        const data = await response.json();
        displayAnswer(data);
    }

    async function searchTexts(query) {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                author_filter: authorFilter.value || null,
                limit: 20
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Search failed');
        }

        const data = await response.json();
        displaySearchResults(data.results);
    }

    function displayAnswer(data) {
        let html = `
            <div class="answer-container">
                <h2>Answer</h2>
                <div class="answer-text">${formatText(data.answer)}</div>
            </div>
        `;

        if (data.citations && data.citations.length > 0) {
            html += `
                <div class="citations-container">
                    <h3>Sources (${data.citations.length} passages)</h3>
            `;

            data.citations.forEach(citation => {
                const source = citation.section
                    ? `${citation.author}, <em>${citation.title}</em>, ${citation.section}`
                    : `${citation.author}, <em>${citation.title}</em>`;

                html += `
                    <div class="citation">
                        <div class="citation-header">
                            <span class="citation-source">${source}</span>
                            <span class="citation-number">[${citation.number}]</span>
                        </div>
                        <div class="citation-passage">${truncateText(citation.passage, 400)}</div>
                    </div>
                `;
            });

            html += '</div>';
        }

        resultsDiv.innerHTML = html;
    }

    function displaySearchResults(results) {
        if (results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="welcome">
                    <h2>No Results</h2>
                    <p>No passages found matching your search. Try different keywords.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="search-results">
                <h3 style="margin-bottom: 1rem; color: var(--text-secondary);">
                    Found ${results.length} passages
                </h3>
        `;

        results.forEach(result => {
            html += `
                <div class="search-result">
                    <div class="search-result-header">
                        ${result.author}, <em>${result.title}</em>
                    </div>
                    <div class="search-result-text">${truncateText(result.passage, 300)}</div>
                </div>
            `;
        });

        html += '</div>';
        resultsDiv.innerHTML = html;
    }

    function showError(message) {
        resultsDiv.innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    async function loadAuthors() {
        try {
            const response = await fetch('/api/authors');
            if (response.ok) {
                const data = await response.json();
                data.authors.forEach(author => {
                    const option = document.createElement('option');
                    option.value = author;
                    option.textContent = author;
                    authorFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load authors:', error);
        }
    }

    async function loadStats() {
        try {
            const response = await fetch('/api/stats');
            if (response.ok) {
                const data = await response.json();
                statsDisplay.textContent = `${data.total_chunks.toLocaleString()} passages from ${data.works_count} works by ${data.authors.length} authors`;
            }
        } catch (error) {
            statsDisplay.textContent = 'Classical texts library';
        }
    }

    function formatText(text) {
        // Convert markdown-style formatting to HTML
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
    }

    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }
});
