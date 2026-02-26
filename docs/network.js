// Network visualization for sources
// Collapsible tree — root → category → section → subtopic → resource

const allNodes = [
    { id: "root",       label: "א",          group: "root",     fixed: true },
    { id: "archive",    label: "L'Archive",  group: "category", parent: "root" },
    { id: "atelier",    label: "L'Atelier",  group: "category", parent: "root" },
    { id: "enquete",    label: "L'Enquête",  group: "category", parent: "root" },
    { id: "reverie",    label: "La Rêverie", group: "category", parent: "root" },
    { id: "textes",     label: "Textes",     group: "section",  parent: "archive" },
    { id: "langues",    label: "Langues",    group: "section",  parent: "archive" },
    { id: "metiers",    label: "Métiers",    group: "section",  parent: "atelier" },
    { id: "design",     label: "Design",     group: "section",  parent: "atelier" },
    { id: "transport",  label: "Transport",  group: "section",  parent: "atelier" },
    { id: "informatique",   label: "Informatique", group: "section", parent: "enquete" },
    { id: "economie",      label: "Économie",     group: "section", parent: "enquete" },
    { id: "droit",         label: "Droit",        group: "section", parent: "enquete" },
    { id: "biotechnologie", label: "Sciences",    group: "section", parent: "enquete" },
    { id: "arts",       label: "Arts",       group: "section",  parent: "reverie" },
    { id: "musique",    label: "Musique",    group: "section",  parent: "reverie" },
    { id: "humanites",  label: "Humanités",  group: "section",  parent: "reverie" },
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
let simulation = null;
let svg = null;
let g = null;
let width = 0;
let height = 0;

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

    extractResources();
    Object.keys(nodePositions).forEach(k => delete nodePositions[k]);

    width  = container.clientWidth;
    height = Math.max(650, window.innerHeight - 200);
    container.innerHTML = '';

    svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    g = svg.append("g");

    svg.call(d3.zoom()
        .scaleExtent([0.2, 4])
        .on("zoom", e => g.attr("transform", e.transform)));

    updateNetwork();
}

function updateNetwork() {
    const data = getVisibleData();
    const isDark = document.body.classList.contains('dark-mode');

    const colors = {
        root:     isDark ? "#c4a060" : "#6b4a04",
        category: isDark ? "#a08050" : "#8b6914",
        section:  isDark ? "#8b7040" : "#a08050",
        subtopic: isDark ? "#756535" : "#b09060",
        resource: isDark ? "#606030" : "#c8b080"
    };

    const sizes = {
        root:     38,
        category: 28,
        section:  22,
        subtopic: 16,
        resource: 11
    };

    if (simulation) simulation.stop();

    // Seed positions
    data.nodes.forEach(n => {
        if (n.id === "root") {
            n.fx = width / 2;
            n.fy = height / 2;
            n.x  = width / 2;
            n.y  = height / 2;
            return;
        }
        if (nodePositions[n.id]) {
            n.x = nodePositions[n.id].x;
            n.y = nodePositions[n.id].y;
        } else if (n.group === "category" && categoryAngles[n.id] !== undefined) {
            const angle = categoryAngles[n.id];
            n.x = width  / 2 + Math.cos(angle) * 120;
            n.y = height / 2 + Math.sin(angle) * 120;
        } else {
            const parent = data.nodes.find(p => p.id === n.parent);
            const px = parent?.x ?? width  / 2;
            const py = parent?.y ?? height / 2;
            n.x = px + (Math.random() - 0.5) * 50;
            n.y = py + (Math.random() - 0.5) * 50;
        }
    });

    simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links)
            .id(d => d.id)
            .distance(d => {
                if (d.target.group === "resource") return 45;
                if (d.target.group === "subtopic") return 70;
                if (d.target.group === "section")  return 100;
                return 130;
            })
            .strength(d => {
                if (d.target.group === "resource") return 0.9;
                if (d.target.group === "subtopic") return 0.7;
                return 0.4;
            }))
        .force("charge", d3.forceManyBody()
            .strength(d => {
                if (d.group === "resource") return -25;
                if (d.group === "subtopic") return -80;
                return -300;
            }))
        .force("x", d3.forceX(width / 2).strength(0.08))
        .force("y", d3.forceY(height / 2).strength(0.08))
        .force("collision", d3.forceCollide().radius(d => sizes[d.group] + 18).strength(0.9))
        .alphaDecay(0.015)
        .velocityDecay(0.35);

    g.selectAll("*").remove();

    const link = g.append("g")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("stroke", d => {
            if (d.target.group === "resource") return "#ddd";
            if (d.target.group === "subtopic")  return "#ccc";
            return "#bbb";
        })
        .attr("stroke-opacity", 0.5)
        .attr("stroke-width", d => {
            if (d.target.group === "resource") return 0.5;
            if (d.target.group === "subtopic")  return 0.75;
            return 1;
        });

    const node = g.append("g")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .style("cursor", "pointer")
        .call(d3.drag()
            .on("start", dragstart)
            .on("drag",  dragging)
            .on("end",   dragend));

    node.append("circle")
        .attr("r", d => sizes[d.group])
        .attr("fill", d => colors[d.group])
        .attr("stroke", d => expandedNodes.has(d.id) ? "#fff" : "none")
        .attr("stroke-width", 2);

    // Expand indicator
    node.filter(d => hasChildren(d.id) && !expandedNodes.has(d.id))
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#fff")
        .attr("font-size", d => d.group === "category" ? "12px" : "9px")
        .attr("font-weight", "bold")
        .text("+");

    // Labels — only show for root, category, section (not subtopic/resource)
    node.filter(d => d.group === "root" || d.group === "category" || d.group === "section")
        .append("text")
        .text(d => d.label)
        .attr("x", d => sizes[d.group] + 4)
        .attr("y", "0.35em")
        .attr("font-size", d => {
            if (d.group === "root")     return "20px";
            if (d.group === "category") return "13px";
            return "11px";
        })
        .attr("font-weight", d => (d.group === "root" || d.group === "category") ? "600" : "400")
        .attr("fill", d => {
            if (isDark) return d.group === "section" ? "#bbb" : "#d0d0d0";
            return d.group === "section" ? "#555" : "#2a2a2a";
        })
        .attr("font-family", "'IBM Plex Mono', monospace");

    // Floating tooltip for subtopic/resource nodes
    const existingTip = document.getElementById('net-tooltip');
    if (existingTip) existingTip.remove();
    const tipEl = document.createElement('div');
    tipEl.id = 'net-tooltip';
    tipEl.style.cssText = 'position:absolute;pointer-events:none;opacity:0;background:var(--bg-card,#fff);border:1px solid var(--border,#ddd);padding:3px 8px;font-size:0.72rem;font-family:IBM Plex Mono,monospace;max-width:200px;border-radius:2px;transition:opacity 0.1s;z-index:100';
    document.getElementById('network-container').appendChild(tipEl);
    const tip = d3.select('#net-tooltip');

    node.filter(d => d.group === "subtopic" || d.group === "resource")
        .on("mouseover.tip", (event, d) => {
            tip.style("opacity", "1").html(d.fullLabel || d.label);
        })
        .on("mousemove.tip", (event) => {
            const rect = document.getElementById('network-container').getBoundingClientRect();
            tip.style("left", (event.clientX - rect.left + 10) + "px")
               .style("top",  (event.clientY - rect.top  - 28) + "px");
        })
        .on("mouseout.tip", () => tip.style("opacity", "0"));

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

    const padding = 50;
    simulation.on("tick", () => {
        data.nodes.forEach(d => {
            if (!d.fx) {
                const r = sizes[d.group] || 10;
                d.x = Math.max(r + padding, Math.min(width - r - padding, d.x));
                d.y = Math.max(r + padding, Math.min(height - r - padding, d.y));
            }
            nodePositions[d.id] = { x: d.x, y: d.y };
        });

        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstart(e) {
        if (e.subject.id === "root") return;
        if (!e.active) simulation.alphaTarget(0.1).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
    }

    function dragging(e) {
        if (e.subject.id === "root") return;
        const r = sizes[e.subject.group] || 10;
        e.subject.fx = Math.max(r + padding, Math.min(width - r - padding, e.x));
        e.subject.fy = Math.max(r + padding, Math.min(height - r - padding, e.y));
    }

    function dragend(e) {
        if (e.subject.id === "root") return;
        if (!e.active) simulation.alphaTarget(0);
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
    if (svg && g) {
        svg.transition().duration(500).call(
            d3.zoom().transform,
            d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
        );
    }

    // Re-render network from initial state
    updateNetwork();
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initNetwork("network-container"));
} else {
    initNetwork("network-container");
}
