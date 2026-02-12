// Network visualization for sources
// Collapsible tree - click to expand/collapse

// All nodes and their relationships
const allNodes = [
    { id: "root", label: "א", group: "root", fixed: true },
    { id: "archive", label: "L'Archive", group: "category", parent: "root" },
    { id: "atelier", label: "L'Atelier", group: "category", parent: "root" },
    { id: "enquete", label: "L'Enquête", group: "category", parent: "root" },
    { id: "reverie", label: "La Rêverie", group: "category", parent: "root" },
    { id: "textes", label: "Textes", group: "section", parent: "archive" },
    { id: "langues", label: "Langues", group: "section", parent: "archive" },
    { id: "metiers", label: "Métiers", group: "section", parent: "atelier" },
    { id: "design", label: "Design", group: "section", parent: "atelier" },
    { id: "transport", label: "Transport", group: "section", parent: "atelier" },
    { id: "informatique", label: "Informatique", group: "section", parent: "enquete" },
    { id: "economie", label: "Économie", group: "section", parent: "enquete" },
    { id: "droit", label: "Droit", group: "section", parent: "enquete" },
    { id: "arts", label: "Arts", group: "section", parent: "reverie" },
    { id: "musique", label: "Musique", group: "section", parent: "reverie" },
    { id: "humanites", label: "Humanités", group: "section", parent: "reverie" },
];

// Track expanded nodes - start with nothing expanded (only root shows)
let expandedNodes = new Set();
let resourceNodes = [];
let simulation = null;
let svg = null;
let g = null;
let width = 0;
let height = 0;

function extractResources() {
    resourceNodes = [];
    document.querySelectorAll('.source-section').forEach(section => {
        const sectionId = section.id;
        if (!sectionId) return;
        let i = 0;
        section.querySelectorAll('.resource').forEach(res => {
            const link = res.querySelector('.resource-name a');
            if (link && i < 8) {
                const text = link.textContent.trim();
                resourceNodes.push({
                    id: `${sectionId}_r${i}`,
                    label: text.length > 18 ? text.slice(0, 16) + '…' : text,
                    fullLabel: text,
                    group: "resource",
                    parent: sectionId,
                    url: link.href
                });
                i++;
            }
        });
    });
}

function getVisibleData() {
    const nodes = [];
    const links = [];
    const visibleIds = new Set();

    // Always show root
    const root = allNodes.find(n => n.id === "root");
    nodes.push({ ...root });
    visibleIds.add("root");

    // Show children of expanded nodes
    allNodes.forEach(node => {
        if (node.parent && expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    // Show resources for expanded sections
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

    width = container.clientWidth;
    height = Math.max(550, window.innerHeight - 280);
    container.innerHTML = '';

    svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    g = svg.append("g");

    svg.call(d3.zoom()
        .scaleExtent([0.3, 3])
        .on("zoom", e => g.attr("transform", e.transform)));

    updateNetwork();
}

function updateNetwork() {
    const data = getVisibleData();
    const isDark = document.body.classList.contains('dark-mode');

    const colors = {
        root: isDark ? "#c4a060" : "#6b4a04",
        category: isDark ? "#a08050" : "#8b6914",
        section: isDark ? "#8b7040" : "#a08050",
        resource: isDark ? "#706030" : "#c4a060"
    };

    const sizes = {
        root: 26,
        category: 18,
        section: 12,
        resource: 5
    };

    // Stop old simulation
    if (simulation) simulation.stop();

    // Fix root position
    data.nodes.forEach(n => {
        if (n.id === "root") {
            n.fx = width / 2;
            n.fy = height / 2;
        }
    });

    // Create simulation
    simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links)
            .id(d => d.id)
            .distance(d => {
                if (d.target.group === "resource") return 40;
                if (d.target.group === "section") return 70;
                return 90;
            })
            .strength(0.7))
        .force("charge", d3.forceManyBody()
            .strength(d => d.group === "resource" ? -20 : -150))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
        .force("collision", d3.forceCollide().radius(d => sizes[d.group] + 5))
        .alphaDecay(0.03);

    // Clear and redraw
    g.selectAll("*").remove();

    const link = g.append("g")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("stroke", d => d.target.group === "resource" ? "#ddd" : "#bbb")
        .attr("stroke-opacity", 0.5)
        .attr("stroke-width", d => d.target.group === "resource" ? 0.5 : 1);

    const node = g.append("g")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .style("cursor", "pointer")
        .call(d3.drag()
            .on("start", dragstart)
            .on("drag", dragging)
            .on("end", dragend));

    // Circle for each node
    node.append("circle")
        .attr("r", d => sizes[d.group])
        .attr("fill", d => colors[d.group])
        .attr("stroke", d => expandedNodes.has(d.id) ? "#fff" : "none")
        .attr("stroke-width", 2);

    // Expand indicator for expandable nodes
    node.filter(d => hasChildren(d.id) && !expandedNodes.has(d.id))
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#fff")
        .attr("font-size", d => d.group === "category" ? "12px" : "10px")
        .attr("font-weight", "bold")
        .text("+");

    // Labels
    node.append("text")
        .text(d => d.label)
        .attr("x", d => sizes[d.group] + 5)
        .attr("y", 4)
        .attr("font-size", d => {
            if (d.group === "root") return "18px";
            if (d.group === "category") return "12px";
            if (d.group === "section") return "10px";
            return "8px";
        })
        .attr("font-weight", d => (d.group === "root" || d.group === "category") ? "600" : "normal")
        .attr("fill", d => {
            if (isDark) return d.group === "resource" ? "#888" : "#d0d0d0";
            return d.group === "resource" ? "#666" : "#2a2a2a";
        })
        .attr("font-family", "'IBM Plex Mono', monospace");

    // Click handler
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

    // Tooltip for resources
    node.filter(d => d.group === "resource")
        .append("title")
        .text(d => d.fullLabel);

    // Tick
    const padding = 30;
    simulation.on("tick", () => {
        data.nodes.forEach(d => {
            if (!d.fx) {
                d.x = Math.max(padding, Math.min(width - padding, d.x));
                d.y = Math.max(padding, Math.min(height - padding, d.y));
            }
        });

        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstart(e) {
        if (e.subject.fixed) return;
        if (!e.active) simulation.alphaTarget(0.1).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
    }

    function dragging(e) {
        if (e.subject.fixed) return;
        e.subject.fx = Math.max(padding, Math.min(width - padding, e.x));
        e.subject.fy = Math.max(padding, Math.min(height - padding, e.y));
    }

    function dragend(e) {
        if (e.subject.fixed) return;
        if (!e.active) simulation.alphaTarget(0);
        e.subject.fx = null;
        e.subject.fy = null;
    }
}

function hasChildren(nodeId) {
    if (allNodes.some(n => n.parent === nodeId)) return true;
    if (resourceNodes.some(n => n.parent === nodeId)) return true;
    return false;
}

function toggleNode(nodeId) {
    if (expandedNodes.has(nodeId)) {
        // Collapse: remove this node and all descendants
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
}

function scrollToSection(sectionId) {
    const network = document.getElementById("network-container");
    const list = document.getElementById("list-container");
    const btn = document.getElementById("view-toggle-btn");

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

function toggleNetworkView() {
    const network = document.getElementById("network-container");
    const list = document.getElementById("list-container");
    const btn = document.getElementById("view-toggle-btn");

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

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initNetwork("network-container"));
} else {
    initNetwork("network-container");
}
