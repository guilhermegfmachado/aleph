// sources.js - References page functionality

// ============ STATE ============
const sourcesState = {
    favorites: [],
    recentlyVisited: [],
    sectionStates: {},
    currentView: 'list',
    networkInitialized: false
};

// D3 Network state
let _sim = null, _svg = null, _g = null;
let _w = 800, _h = 500;
let _allNodes = [], _allLinks = [];
let _expanded = new Set();
let _positions = {};

// ============ INIT ============
function initSources() {
    // Load from localStorage
    sourcesState.favorites = JSON.parse(localStorage.getItem('aleph-favorites') || '[]');
    sourcesState.recentlyVisited = JSON.parse(localStorage.getItem('aleph-recent') || '[]');
    sourcesState.sectionStates = JSON.parse(localStorage.getItem('aleph-section-states') || '{}');

    setupSectionAccordions();
    setupSearch();
    setupToolbar();
    setupFavorites();
    setupKeyboard();

    // Check URL for view parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'network') {
        setView('network');
    }
}

document.addEventListener('DOMContentLoaded', initSources);

// ============ SECTION ACCORDION ============
function setupSectionAccordions() {
    document.querySelectorAll('.source-section').forEach(section => {
        const summary = section.querySelector('summary');
        const sectionId = section.id;

        // Restore state from localStorage
        if (sourcesState.sectionStates[sectionId] !== undefined) {
            section.open = sourcesState.sectionStates[sectionId];
        }

        // Listen for toggle
        section.addEventListener('toggle', () => {
            sourcesState.sectionStates[sectionId] = section.open;
            localStorage.setItem('aleph-section-states', JSON.stringify(sourcesState.sectionStates));
        });
    });
}

// ============ SEARCH ============
function setupSearch() {
    const searchInput = document.getElementById('sourcesSearch');
    if (!searchInput) return;

    // Live filter on every keystroke
    searchInput.addEventListener('input', (e) => {
        filterResources(e.target.value);
    });
}

function filterResources(query) {
    query = query.toLowerCase().trim();
    const listContainer = document.getElementById('sourcesList');
    const networkContainer = document.getElementById('networkContainer');

    // If searching, switch to list view
    if (query.length > 0 && sourcesState.currentView === 'network') {
        setView('list');
    }

    document.querySelectorAll('.source-section').forEach(section => {
        let sectionHasMatch = false;
        const content = section.querySelector('.content');
        if (!content) {
            section.style.display = '';
            return;
        }

        if (!query) {
            // Reset: show everything
            content.querySelectorAll('.resources, h3').forEach(el => el.style.display = '');
            content.querySelectorAll('.resource').forEach(r => r.style.display = '');
            section.style.display = '';
            return;
        }

        // Walk children: H3 then .resources groups
        let h3Active = false;
        Array.from(content.children).forEach(child => {
            if (child.tagName === 'H3') {
                h3Active = child.textContent.toLowerCase().includes(query);
                if (h3Active) sectionHasMatch = true;
                child.style.display = '';
            } else if (child.classList && child.classList.contains('resources')) {
                if (h3Active) {
                    child.style.display = '';
                    child.querySelectorAll('.resource').forEach(r => r.style.display = '');
                } else {
                    let groupHasMatch = false;
                    child.querySelectorAll('.resource').forEach(res => {
                        const text = (res.querySelector('.resource-name')?.textContent || '') +
                                     (res.querySelector('.resource-desc')?.textContent || '');
                        const m = text.toLowerCase().includes(query);
                        res.style.display = m ? '' : 'none';
                        if (m) groupHasMatch = true;
                    });
                    child.style.display = groupHasMatch ? '' : 'none';
                    if (groupHasMatch) sectionHasMatch = true;
                }
            }
        });

        section.style.display = sectionHasMatch ? '' : 'none';
        if (sectionHasMatch) section.open = true;
    });

    updateStats();
}

// ============ TOOLBAR ============
function setupToolbar() {
    const listBtn = document.getElementById('viewListBtn');
    const networkBtn = document.getElementById('viewNetworkBtn');
    const favToggleBtn = document.getElementById('favToggleBtn');

    if (listBtn) {
        listBtn.addEventListener('click', () => setView('list'));
    }
    if (networkBtn) {
        networkBtn.addEventListener('click', () => setView('network'));
    }
    if (favToggleBtn) {
        favToggleBtn.addEventListener('click', toggleFavoritesPanel);
    }
}

function setView(v) {
    const list = document.getElementById('sourcesList');
    const net = document.getElementById('networkContainer');
    const msg = document.querySelector('.network-mobile-msg');

    // Update button states
    document.getElementById('viewListBtn')?.classList.toggle('active', v === 'list');
    document.getElementById('viewNetworkBtn')?.classList.toggle('active', v === 'network');

    sourcesState.currentView = v;

    if (v === 'network') {
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
            // Show message, keep list visible
            if (msg) msg.classList.add('show');
            if (list) list.style.display = 'block';
            if (net) net.style.display = 'none';
            return;
        }
        if (msg) msg.classList.remove('show');
        if (list) list.style.display = 'none';
        if (net) net.style.display = 'block';

        // Initialize network only on first click
        if (!sourcesState.networkInitialized) {
            initNetwork();
            sourcesState.networkInitialized = true;
        }
    } else {
        if (msg) msg.classList.remove('show');
        if (list) list.style.display = 'block';
        if (net) net.style.display = 'none';
    }
}

// ============ FAVORITES ============
function setupFavorites() {
    // Add favorite buttons to all resources
    document.querySelectorAll('.resource').forEach(resource => {
        const link = resource.querySelector('.resource-name a');
        if (link) {
            const btn = document.createElement('button');
            btn.className = 'fav-btn';
            btn.dataset.url = link.href;
            btn.dataset.name = link.textContent;
            btn.textContent = isFavorite(link.href) ? 'favori' : 'ajouter';
            btn.classList.toggle('active', isFavorite(link.href));
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite(link.textContent, link.href);
            });
            resource.querySelector('.resource-name').appendChild(btn);

            // Track visits
            link.addEventListener('click', () => trackVisit(link.textContent, link.href));
        }
    });
}

function isFavorite(url) {
    return sourcesState.favorites.some(f => f.url === url);
}

function toggleFavorite(name, url) {
    const index = sourcesState.favorites.findIndex(f => f.url === url);
    if (index >= 0) {
        sourcesState.favorites.splice(index, 1);
    } else {
        sourcesState.favorites.unshift({ name, url });
    }
    localStorage.setItem('aleph-favorites', JSON.stringify(sourcesState.favorites));
    updateFavoriteButtons();
    renderFavoritesPanel();
}

function updateFavoriteButtons() {
    document.querySelectorAll('.fav-btn').forEach(btn => {
        const url = btn.dataset.url;
        const isFav = isFavorite(url);
        btn.classList.toggle('active', isFav);
        btn.textContent = isFav ? 'favori' : 'ajouter';
    });
}

function toggleFavoritesPanel() {
    const panel = document.getElementById('favoritesPanel');
    if (panel) {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            renderFavoritesPanel();
        }
    }
}

function renderFavoritesPanel() {
    const list = document.getElementById('favoritesList');
    if (!list) return;

    if (sourcesState.favorites.length === 0) {
        list.innerHTML = '<p class="panel-empty">Aucun favori.</p>';
    } else {
        list.innerHTML = sourcesState.favorites.map((f, i) => `
            <div class="panel-item">
                <a href="${escapeHtml(f.url)}" target="_blank">${escapeHtml(f.name)}</a>
                <button class="remove-btn" data-index="${i}">supprimer</button>
            </div>
        `).join('');

        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const idx = parseInt(btn.dataset.index);
                sourcesState.favorites.splice(idx, 1);
                localStorage.setItem('aleph-favorites', JSON.stringify(sourcesState.favorites));
                updateFavoriteButtons();
                renderFavoritesPanel();
            });
        });
    }
}

function trackVisit(name, url) {
    sourcesState.recentlyVisited = sourcesState.recentlyVisited.filter(r => r.url !== url);
    sourcesState.recentlyVisited.unshift({ name, url, time: Date.now() });
    sourcesState.recentlyVisited = sourcesState.recentlyVisited.slice(0, 20);
    localStorage.setItem('aleph-recent', JSON.stringify(sourcesState.recentlyVisited));
}

// ============ KEYBOARD ============
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const panel = document.getElementById('favoritesPanel');
            if (panel && panel.classList.contains('open')) {
                toggleFavoritesPanel();
                return;
            }
            const searchInput = document.getElementById('sourcesSearch');
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                filterResources('');
            }
        }
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            document.getElementById('sourcesSearch')?.focus();
        }
    });
}

// ============ STATS ============
function updateStats() {
    const visible = document.querySelectorAll('.resource:not([style*="display: none"])').length;
    const total = document.querySelectorAll('.resource').length;
    const statsEl = document.getElementById('sourcesStats');
    if (statsEl) {
        statsEl.textContent = `${visible} / ${total} ressources`;
    }
}

// ============ UTILITIES ============
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============ D3 NETWORK ============
function nodeRadius(d) {
    if (d.depth === 0) return 24;
    if (d.depth === 1) return 14;
    if (d.depth === 2) return 9;
    return 5;
}

function buildFullGraph() {
    const nodes = [], links = [];
    let id = 0;
    const root = { id: 'root', name: 'aleph', depth: 0 };
    nodes.push(root);

    document.querySelectorAll('details.source-section').forEach(sec => {
        const catName = sec.querySelector('summary')?.textContent.trim() || '';
        const catId = 'cat_' + id++;
        const cat = { id: catId, name: catName, depth: 1, parent: 'root' };
        nodes.push(cat);
        links.push({ source: 'root', target: catId });

        sec.querySelectorAll('h3').forEach(h3 => {
            const subName = h3.textContent.trim();
            const subId = 'sub_' + id++;
            const sub = { id: subId, name: subName.length > 18 ? subName.slice(0, 16) + '...' : subName, fullName: subName, depth: 2, parent: catId };
            nodes.push(sub);
            links.push({ source: catId, target: subId });

            let el = h3.nextElementSibling;
            while (el && el.tagName !== 'H3') {
                const a = el.querySelector('a');
                if (a) {
                    const leafName = a.textContent.trim();
                    const leafId = 'leaf_' + id++;
                    const leaf = { id: leafId, name: leafName.length > 16 ? leafName.slice(0, 14) + '...' : leafName, fullName: leafName, depth: 3, parent: subId, url: a.href };
                    nodes.push(leaf);
                    links.push({ source: subId, target: leafId });
                }
                el = el.nextElementSibling;
            }
        });
    });
    return { nodes, links };
}

function getVisibleData() {
    const nodes = [], links = [];

    _allNodes.forEach(n => {
        if (n.depth === 0) {
            nodes.push({ ...n });
        } else if (n.parent && _expanded.has(n.parent)) {
            nodes.push({ ...n });
        }
    });

    const visibleIds = new Set(nodes.map(n => n.id));
    _allLinks.forEach(l => {
        if (visibleIds.has(l.source) && visibleIds.has(l.target)) {
            links.push({ ...l });
        }
    });

    return { nodes, links };
}

function hasChildren(nodeId) {
    return _allNodes.some(n => n.parent === nodeId);
}

function toggleExpand(nodeId) {
    if (_expanded.has(nodeId)) {
        _expanded.delete(nodeId);
        const toRemove = [nodeId];
        while (toRemove.length) {
            const id = toRemove.pop();
            _allNodes.filter(n => n.parent === id).forEach(child => {
                _expanded.delete(child.id);
                toRemove.push(child.id);
            });
        }
    } else {
        _expanded.add(nodeId);
    }
    updateNetwork();
}

function initNetwork() {
    const container = document.getElementById('networkContainer');
    if (!container || typeof d3 === 'undefined') return;

    const data = buildFullGraph();
    _allNodes = data.nodes;
    _allLinks = data.links;
    _expanded.clear();
    _positions = {};

    // Use ResizeObserver to get container dimensions
    const ro = new ResizeObserver(entries => {
        ro.disconnect();
        const { width: w, height: h } = entries[0].contentRect;
        _w = w || 800;
        _h = h || 500;
        buildNetworkSVG(container);
    });
    ro.observe(container);
}

function buildNetworkSVG(container) {
    container.innerHTML = '';
    _svg = d3.select(container).append('svg')
        .attr('width', _w)
        .attr('height', _h)
        .attr('viewBox', `0 0 ${_w} ${_h}`);
    _g = _svg.append('g');
    _svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', e => _g.attr('transform', e.transform)));
    updateNetwork();
}

function updateNetwork() {
    if (!_g) return;

    const { nodes, links } = getVisibleData();

    // Seed positions
    nodes.forEach(n => {
        if (n.id === 'root') {
            n.x = _w / 2;
            n.y = _h / 2;
            n.fx = _w / 2;
            n.fy = _h / 2;
        } else if (_positions[n.id]) {
            n.x = _positions[n.id].x;
            n.y = _positions[n.id].y;
        } else {
            const parent = nodes.find(p => p.id === n.parent);
            const px = parent?.x ?? _w / 2;
            const py = parent?.y ?? _h / 2;
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            n.x = px + Math.cos(angle) * dist;
            n.y = py + Math.sin(angle) * dist;
        }
    });

    if (_sim) _sim.stop();

    _sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
            const sr = nodeRadius(d.source);
            return sr >= 13 ? 100 : sr >= 8 ? 70 : 45;
        }).strength(0.5))
        .force('charge', d3.forceManyBody().strength(d => -25 * nodeRadius(d)))
        .force('collide', d3.forceCollide().radius(d => nodeRadius(d) + 6).iterations(2))
        .force('x', d3.forceX(_w / 2).strength(0.04))
        .force('y', d3.forceY(_h / 2).strength(0.04))
        .alphaDecay(0.015)
        .velocityDecay(0.35);

    _g.selectAll('*').remove();

    // Links
    const line = _g.append('g').selectAll('line').data(links).join('line')
        .style('stroke', 'rgba(201,168,76,0.08)')
        .style('stroke-width', 1)
        .style('stroke-opacity', 0.6);

    // Nodes
    const nodeG = _g.append('g').selectAll('g').data(nodes).join('g')
        .style('cursor', 'pointer')
        .call(d3.drag()
            .on('start', (e, d) => {
                if (d.id !== 'root' && !e.active) {
                    _sim.alphaTarget(0.1).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }
            })
            .on('drag', (e, d) => {
                if (d.id !== 'root') {
                    d.fx = e.x;
                    d.fy = e.y;
                }
            })
            .on('end', (e, d) => {
                if (d.id !== 'root') {
                    if (!e.active) _sim.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }
            }));

    // Node circles - accent gold for hubs, dimmed gold for leaves
    nodeG.append('circle')
        .attr('r', d => nodeRadius(d))
        .style('fill', d => {
            if (d.depth === 0) return '#c9a84c'; // Root - accent gold
            if (d.depth === 1) return '#c9a84c'; // Hubs - accent gold
            if (d.depth === 2) return 'rgba(201,168,76,0.5)'; // Dimmed
            return 'rgba(201,168,76,0.3)'; // Leaves - more dimmed
        })
        .attr('stroke', d => _expanded.has(d.id) ? '#fff' : 'none')
        .attr('stroke-width', 2);

    // Show + on expandable nodes
    nodeG.filter(d => hasChildren(d.id) && !_expanded.has(d.id))
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', d => d.depth <= 1 ? '12px' : '9px')
        .attr('font-weight', 'bold')
        .text('+');

    // Labels
    const labels = _g.append('g').selectAll('text').data(nodes).join('text')
        .attr('dx', d => nodeRadius(d) + 5)
        .attr('dy', '0.35em')
        .style('font-size', d => d.depth === 0 ? '14px' : d.depth === 1 ? '11px' : d.depth === 2 ? '9px' : '8px')
        .style('fill', '#8a8880')
        .style('opacity', d => d.depth <= 1 ? 1 : d.depth === 2 ? 0.7 : 0)
        .style('pointer-events', 'none')
        .text(d => d.name);

    // Hover to show leaf labels
    nodeG.on('mouseover', (e, d) => {
        if (d.depth >= 2) labels.filter(l => l.id === d.id).style('opacity', 1);
    }).on('mouseout', (e, d) => {
        if (d.depth >= 2) labels.filter(l => l.id === d.id).style('opacity', d.depth === 2 ? 0.7 : 0);
    });

    // Click: expand or open URL
    nodeG.on('click', (e, d) => {
        e.stopPropagation();
        if (d.url) {
            window.open(d.url, '_blank');
        } else if (hasChildren(d.id)) {
            toggleExpand(d.id);
        }
    });

    _sim.on('tick', () => {
        nodes.forEach(d => {
            _positions[d.id] = { x: d.x, y: d.y };
        });
        line.attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
        labels.attr('x', d => d.x).attr('y', d => d.y);
    });
}

// Handle resize
let _resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimeout);
    _resizeTimeout = setTimeout(() => {
        const c = document.getElementById('networkContainer');
        if (!c || c.style.display === 'none') return;
        _w = c.clientWidth;
        _h = c.clientHeight;
        if (_sim) {
            _sim.force('x', d3.forceX(_w / 2).strength(0.04))
                .force('y', d3.forceY(_h / 2).strength(0.04))
                .alpha(0.3)
                .restart();
        }
        if (_svg) {
            _svg.attr('width', _w).attr('height', _h).attr('viewBox', `0 0 ${_w} ${_h}`);
        }
    }, 150);
});
