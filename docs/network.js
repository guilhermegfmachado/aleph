// Network visualization for sources
// Collapsible tree — root → category → section → subtopic → resource

const allNodes = [
    { id: "root",       label: "א",          group: "root",     depth: 0, fixed: true },
    { id: "archive",    label: "L'Archive",  group: "category", depth: 1, parent: "root" },
    { id: "atelier",    label: "L'Atelier",  group: "category", depth: 1, parent: "root" },
    { id: "enquete",    label: "L'Enquête",  group: "category", depth: 1, parent: "root" },
    { id: "reverie",    label: "La Rêverie", group: "category", depth: 1, parent: "root" },
    { id: "textes",     label: "Textes",     group: "section",  depth: 2, parent: "archive" },
    { id: "langues",    label: "Langues",    group: "section",  depth: 2, parent: "archive" },
    { id: "metiers",    label: "Métiers",    group: "section",  depth: 2, parent: "atelier" },
    { id: "design",     label: "Design",     group: "section",  depth: 2, parent: "atelier" },
    { id: "transport",  label: "Transport",  group: "section",  depth: 2, parent: "atelier" },
    { id: "informatique",   label: "Informatique", group: "section", depth: 2, parent: "enquete" },
    { id: "economie",      label: "Économie",     group: "section", depth: 2, parent: "enquete" },
    { id: "droit",         label: "Droit",        group: "section", depth: 2, parent: "enquete" },
    { id: "biotechnologie", label: "Sciences",    group: "section", depth: 2, parent: "enquete" },
    { id: "arts",       label: "Arts",       group: "section",  depth: 2, parent: "reverie" },
    { id: "musique",    label: "Musique",    group: "section",  depth: 2, parent: "reverie" },
    { id: "humanites",  label: "Humanités",  group: "section",  depth: 2, parent: "reverie" },
];

// Pre-defined angles for the 4 categories so they spread into 4 quadrants
const categoryAngles = {
    archive:  -Math.PI * 0.75, // top-left
    atelier:  -Math.PI * 0.25, // top-right
    enquete:   Math.PI * 0.25, // bottom-right
    reverie:   Math.PI * 0.75  // bottom-left
};

// Position cache — preserves node positions across expand/collapse
const nodePositions = {};

let expandedNodes = new Set();
let subtopicNodes = [];
let resourceNodes = [];
let _simulation = null;
let _svg = null;
let _zoom = null;
let g = null;
let _width = 0;
let _height = 0;
let _container = null;

// Node radius function based on depth
function nodeRadius(d) {
    if (d.depth === 0) return 26;    // centre node (aleph)
    if (d.depth === 1) return 16;    // category (Archive, Atelier, etc.)
    if (d.depth === 2) return 10;    // section (h3 labels)
    return 6;                         // leaf (individual resource)
}

function extractResources() {
    subtopicNodes = [];
    resourceNodes = [];

    document.querySelectorAll('.source-section').forEach(section => {
        const sectionId = section.id;
        if (!sectionId) return;

        const content = section.querySelector('.content');
        if (!content) return;

        const h3s = content.querySelectorAll('h3');

        if (h3s.length > 0) {
            // Section has subtopics: H3 → resources
            let stIdx = 0;
            let currentStId = null;

            Array.from(content.children).forEach(child => {
                if (child.tagName === 'H3') {
                    const label = child.textContent.trim();
                    currentStId = `${sectionId}_st${stIdx++}`;
                    subtopicNodes.push({
                        id: currentStId,
                        label: label.length > 20 ? label.slice(0, 18) + '…' : label,
                        fullLabel: label,
                        group: 'subtopic',
                        depth: 2,
                        parent: sectionId
                    });
                } else if (child.classList?.contains('resources') && currentStId) {
                    child.querySelectorAll('.resource').forEach(res => {
                        const link = res.querySelector('.resource-name a');
                        if (!link) return;
                        const text = link.textContent.trim();
                        const rIdx = resourceNodes.filter(r => r.parent === currentStId).length;
                        resourceNodes.push({
                            id: `${currentStId}_r${rIdx}`,
                            label: text.length > 18 ? text.slice(0, 16) + '…' : text,
                            fullLabel: text,
                            group: 'resource',
                            depth: 3,
                            parent: currentStId,
                            url: link.href
                        });
                    });
                }
            });
        } else {
            // No H3s: resources hang directly off the section
            let i = 0;
            content.querySelectorAll('.resource').forEach(res => {
                const link = res.querySelector('.resource-name a');
                if (!link) return;
                const text = link.textContent.trim();
                resourceNodes.push({
                    id: `${sectionId}_r${i++}`,
                    label: text.length > 18 ? text.slice(0, 16) + '…' : text,
                    fullLabel: text,
                    group: 'resource',
                    depth: 3,
                    parent: sectionId,
                    url: link.href
                });
            });
        }
    });
}

function getVisibleData() {
    const nodes = [];
    const links = [];
    const visibleIds = new Set();

    // Root always visible
    nodes.push({ ...allNodes.find(n => n.id === "root") });
    visibleIds.add("root");

    // Category and section nodes (children of expanded parents)
    allNodes.forEach(node => {
        if (node.parent && expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    // Subtopic nodes (children of expanded sections)
    subtopicNodes.forEach(node => {
        if (expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    // Resource nodes (children of expanded subtopics or sections)
    resourceNodes.forEach(node => {
        if (expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    return { nodes, links };
}

function initNetwork(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof d3 === 'undefined') return;

    _container = container;
    expandedNodes.clear(); // Start collapsed - only root visible
    extractResources();
    Object.keys(nodePositions).forEach(k => delete nodePositions[k]);

    // Use ResizeObserver to wait for real painted dimensions
    const ro = new ResizeObserver(entries => {
        ro.disconnect();
        const rect = entries[0].contentRect;
        const w = rect.width || 800;
        const h = rect.height || 500;
        _buildNetwork(container, w, h);
    });
    ro.observe(container);
}

function _buildNetwork(container, width, height) {
    _width = width;
    _height = Math.max(500, height);
    container.innerHTML = '';

    _svg = d3.select(container)
        .append("svg")
        .attr("width", _width)
        .attr("height", _height)
        .attr("viewBox", `0 0 ${_width} ${_height}`);

    g = _svg.append("g");

    _zoom = d3.zoom()
        .scaleExtent([0.2, 4])
        .on("zoom", e => g.attr("transform", e.transform));
    _svg.call(_zoom);

    updateNetwork();
}

function updateNetwork() {
    if (!_width || !_height) return;

    const data = getVisibleData();
    const isDark = document.body.classList.contains('dark-mode');

    const colors = {
        root:     isDark ? "#c4a060" : "#6b4a04",
        category: isDark ? "#a08050" : "#8b6914",
        section:  isDark ? "#8b7040" : "#a08050",
        subtopic: isDark ? "#756535" : "#b09060",
        resource: isDark ? "#606030" : "#c8b080"
    };

    if (_simulation) _simulation.stop();

    // Seed positions
    data.nodes.forEach(n => {
        if (n.id === "root") {
            n.fx = _width / 2;
            n.fy = _height / 2;
            n.x  = _width / 2;
            n.y  = _height / 2;
            return;
        }
        if (nodePositions[n.id]) {
            n.x = nodePositions[n.id].x;
            n.y = nodePositions[n.id].y;
        } else if (n.group === "category" && categoryAngles[n.id] !== undefined) {
            const angle = categoryAngles[n.id];
            n.x = _width  / 2 + Math.cos(angle) * 100;
            n.y = _height / 2 + Math.sin(angle) * 100;
        } else {
            const parent = data.nodes.find(p => p.id === n.parent);
            const px = parent?.x ?? _width  / 2;
            const py = parent?.y ?? _height / 2;
            n.x = px + (Math.random() - 0.5) * 50;
            n.y = py + (Math.random() - 0.5) * 50;
        }
    });

    // Natural-feeling physics
    _simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links)
            .id(d => d.id)
            .distance(d => {
                const sr = nodeRadius(d.source);
                const tr = nodeRadius(d.target);
                if (sr >= 13 || tr >= 13) return 100;
                if (sr >= 8  || tr >= 8)  return 60;
                return 35;
            })
            .strength(0.4))
        .force("charge", d3.forceManyBody().strength(d => -22 * nodeRadius(d)))
        .force("collide", d3.forceCollide().radius(d => nodeRadius(d) + 4).iterations(3))
        .force("x", d3.forceX(_width / 2).strength(0.04))
        .force("y", d3.forceY(_height / 2).strength(0.04))
        .alphaDecay(0.012)
        .velocityDecay(0.35);

    g.selectAll("*").remove();

    const link = g.append("g")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("stroke", isDark ? "#555" : "#ccc")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", d => {
            if (d.target.depth >= 3) return 0.5;
            if (d.target.depth === 2) return 0.75;
            return 1;
        });

    const node = g.append("g")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .style("cursor", "pointer")
        .call(d3.drag()
            .clickDistance(5)
            .on("start", dragstart)
            .on("drag",  dragging)
            .on("end",   dragend));

    node.append("circle")
        .attr("r", d => nodeRadius(d))
        .attr("fill", d => colors[d.group])
        .attr("stroke", d => expandedNodes.has(d.id) ? "#fff" : "none")
        .attr("stroke-width", 2);

    // Expand indicator
    node.filter(d => hasChildren(d.id) && !expandedNodes.has(d.id))
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#fff")
        .attr("font-size", d => d.depth <= 1 ? "10px" : "7px")
        .attr("font-weight", "bold")
        .text("+");

    // Labels - inline next to nodes
    const labels = g.append("g").attr("class", "labels")
        .selectAll("text")
        .data(data.nodes)
        .join("text")
        .attr("class", "node-label")
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "central")
        .attr("dx", d => nodeRadius(d) + 4)
        .attr("dy", 0)
        .style("font-size", d => {
            if (d.depth === 0) return "13px";
            if (d.depth === 1) return "11px";
            if (d.depth === 2) return "9px";
            return "8px";
        })
        .style("fill", isDark ? "var(--text, #d0d0d0)" : "var(--text, #2d2d2d)")
        .style("opacity", d => {
            if (d.depth <= 1) return 1;        // centre and categories always visible
            if (d.depth === 2) return 0.7;     // sections visible but softer
            return 0;                           // leaves: hidden by default
        })
        .style("pointer-events", "none")
        .style("font-family", "'IBM Plex Mono', monospace")
        .text(d => d.label);

    // Show leaf labels on hover
    node.on("mouseover", (event, d) => {
        if (d.depth >= 2) {
            labels.filter(l => l === d)
                .style("opacity", 1)
                .style("font-weight", d.depth === 3 ? "400" : "600");
        }
    })
    .on("mouseout", (event, d) => {
        if (d.depth >= 2) {
            labels.filter(l => l === d)
                .style("opacity", d.depth === 2 ? 0.7 : 0)
                .style("font-weight", "400");
        }
    });

    // Click
    node.on("click", (e, d) => {
        e.stopPropagation();
        if (d.group === "resource" && d.url) {
            window.open(d.url, '_blank');
        } else if (hasChildren(d.id)) {
            toggleNode(d.id);
        } else if (d.group === "section") {
            scrollToSection(d.id);
        }
    });

    const padding = 30;
    _simulation.on("tick", () => {
        data.nodes.forEach(d => {
            if (!d.fx) {
                const r = nodeRadius(d);
                d.x = Math.max(r + padding, Math.min(_width - r - padding, d.x));
                d.y = Math.max(r + padding, Math.min(_height - r - padding, d.y));
            }
            nodePositions[d.id] = { x: d.x, y: d.y };
        });

        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);

        labels.attr("x", d => d.x)
              .attr("y", d => d.y);
    });

    function dragstart(e) {
        if (e.subject.id === "root") return;
        if (!e.active) _simulation.alphaTarget(0.1).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
    }

    function dragging(e) {
        if (e.subject.id === "root") return;
        const r = nodeRadius(e.subject);
        e.subject.fx = Math.max(r + padding, Math.min(_width - r - padding, e.x));
        e.subject.fy = Math.max(r + padding, Math.min(_height - r - padding, e.y));
    }

    function dragend(e) {
        if (e.subject.id === "root") return;
        if (!e.active) _simulation.alphaTarget(0);
        e.subject.fx = null;
        e.subject.fy = null;
    }
}

function hasChildren(nodeId) {
    if (allNodes.some(n => n.parent === nodeId))     return true;
    if (subtopicNodes.some(n => n.parent === nodeId)) return true;
    if (resourceNodes.some(n => n.parent === nodeId)) return true;
    return false;
}

function toggleNode(nodeId) {
    if (expandedNodes.has(nodeId)) {
        expandedNodes.delete(nodeId);
        collapseDescendants(nodeId);
    } else {
        expandedNodes.add(nodeId);
    }
    updateNetwork();
}

function collapseDescendants(nodeId) {
    allNodes.filter(n => n.parent === nodeId).forEach(child => {
        expandedNodes.delete(child.id);
        collapseDescendants(child.id);
    });
    subtopicNodes.filter(n => n.parent === nodeId).forEach(child => {
        expandedNodes.delete(child.id);
        collapseDescendants(child.id);
    });
}

function scrollToSection(sectionId) {
    const network = document.getElementById("network-container");
    const list    = document.getElementById("list-container");
    const btn     = document.getElementById("view-toggle-btn");

    if (network && !network.classList.contains("hidden")) {
        network.classList.add("hidden");
        list.classList.remove("hidden");
        btn.textContent = "vue réseau";
    }

    const section = document.getElementById(sectionId);
    if (section) {
        section.open = true;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function resetNetwork() {
    // Clear expanded nodes and position cache
    expandedNodes.clear();
    Object.keys(nodePositions).forEach(k => delete nodePositions[k]);

    // Reset zoom
    if (_svg && _zoom) {
        _svg.transition().duration(500).call(
            _zoom.transform,
            d3.zoomIdentity
        );
    }

    // Re-render network from initial state
    updateNetwork();
}

function zoomIn() {
    if (_svg && _zoom) {
        _svg.transition().duration(300).call(_zoom.scaleBy, 1.3);
    }
}

function zoomOut() {
    if (_svg && _zoom) {
        _svg.transition().duration(300).call(_zoom.scaleBy, 0.7);
    }
}

function toggleNetworkView() {
    const network = document.getElementById("network-container");
    const list    = document.getElementById("list-container");
    const btn     = document.getElementById("view-toggle-btn");

    if (network.classList.contains("hidden")) {
        network.classList.remove("hidden");
        list.classList.add("hidden");
        btn.textContent = "vue liste";
        initNetwork("network-container");
    } else {
        network.classList.add("hidden");
        list.classList.remove("hidden");
        btn.textContent = "vue réseau";
    }
}

// Handle resize
let _resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
        if (!_container) return;
        const w = _container.clientWidth;
        const h = _container.clientHeight || 500;
        if (_simulation) {
            _width = w;
            _height = h;
            _simulation
                .force('x', d3.forceX(w / 2).strength(0.04))
                .force('y', d3.forceY(h / 2).strength(0.04))
                .alpha(0.3)
                .restart();
        }
        if (_svg) {
            _svg.attr('width', w).attr('height', h)
                .attr('viewBox', `0 0 ${w} ${h}`);
        }
    }, 150);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initNetwork("network-container"));
} else {
    initNetwork("network-container");
}
