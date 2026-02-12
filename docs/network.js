// Network visualization for sources
// 4 philosophical categories inspired by Bachelard & Simondon

// Base structure - resources added dynamically from DOM
const baseNodes = [
    // Root - fixed in center
    { id: "root", label: "א", group: "root", fixed: true },

    // 4 main categories
    { id: "archive", label: "L'Archive", group: "category" },
    { id: "atelier", label: "L'Atelier", group: "category" },
    { id: "enquete", label: "L'Enquête", group: "category" },
    { id: "reverie", label: "La Rêverie", group: "category" },

    // L'Archive children
    { id: "textes", label: "Textes", group: "section", parent: "archive" },
    { id: "langues", label: "Langues", group: "section", parent: "archive" },

    // L'Atelier children
    { id: "metiers", label: "Métiers", group: "section", parent: "atelier" },
    { id: "design", label: "Design", group: "section", parent: "atelier" },
    { id: "transport", label: "Transport", group: "section", parent: "atelier" },

    // L'Enquête children
    { id: "informatique", label: "Informatique", group: "section", parent: "enquete" },
    { id: "economie", label: "Économie", group: "section", parent: "enquete" },
    { id: "droit", label: "Droit", group: "section", parent: "enquete" },

    // La Rêverie children
    { id: "arts", label: "Arts", group: "section", parent: "reverie" },
    { id: "musique", label: "Musique", group: "section", parent: "reverie" },
    { id: "humanites", label: "Humanités", group: "section", parent: "reverie" },
];

const baseLinks = [
    // Root to categories
    { source: "root", target: "archive" },
    { source: "root", target: "atelier" },
    { source: "root", target: "enquete" },
    { source: "root", target: "reverie" },

    // Archive children
    { source: "archive", target: "textes" },
    { source: "archive", target: "langues" },

    // Atelier children
    { source: "atelier", target: "metiers" },
    { source: "atelier", target: "design" },
    { source: "atelier", target: "transport" },

    // Enquête children
    { source: "enquete", target: "informatique" },
    { source: "enquete", target: "economie" },
    { source: "enquete", target: "droit" },

    // Rêverie children
    { source: "reverie", target: "arts" },
    { source: "reverie", target: "musique" },
    { source: "reverie", target: "humanites" },
];

let networkData = { nodes: [], links: [] };

function buildNetworkData() {
    const nodes = JSON.parse(JSON.stringify(baseNodes));
    const links = JSON.parse(JSON.stringify(baseLinks));

    // Extract resources from DOM and add as leaf nodes
    const sections = document.querySelectorAll('.source-section');

    sections.forEach(section => {
        const sectionId = section.id;
        if (!sectionId) return;

        let resourceIndex = 0;
        const resources = section.querySelectorAll('.resource');

        resources.forEach(res => {
            const link = res.querySelector('.resource-name a');
            if (link && resourceIndex < 6) { // Limit to 6 per section
                const resourceId = `${sectionId}_r${resourceIndex}`;
                const text = link.textContent.trim();
                nodes.push({
                    id: resourceId,
                    label: text.length > 20 ? text.slice(0, 18) + '…' : text,
                    fullLabel: text,
                    group: "resource",
                    parent: sectionId,
                    url: link.href
                });
                links.push({
                    source: sectionId,
                    target: resourceId
                });
                resourceIndex++;
            }
        });
    });

    networkData = { nodes, links };
}

function initNetwork(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Network container not found:', containerId);
        return;
    }

    // Check if D3 is loaded
    if (typeof d3 === 'undefined') {
        console.error('D3.js not loaded');
        return;
    }

    buildNetworkData();
    console.log('Network data:', networkData.nodes.length, 'nodes,', networkData.links.length, 'links');

    const width = container.clientWidth;
    const height = Math.max(600, window.innerHeight - 250);
    container.innerHTML = '';

    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g");

    svg.call(d3.zoom()
        .scaleExtent([0.3, 3])
        .on("zoom", e => g.attr("transform", e.transform)));

    const colors = {
        root: "#6b4a04",
        category: "#8b6914",
        section: "#a08050",
        resource: "#c4a060"
    };

    const sizes = {
        root: 24,
        category: 18,
        section: 12,
        resource: 6
    };

    // Fix root in center
    networkData.nodes.forEach(n => {
        if (n.fixed) {
            n.fx = width / 2;
            n.fy = height / 2;
        }
    });

    const simulation = d3.forceSimulation(networkData.nodes)
        .force("link", d3.forceLink(networkData.links)
            .id(d => d.id)
            .distance(d => {
                if (d.target.group === "resource") return 50;
                if (d.target.group === "section") return 80;
                return 100;
            })
            .strength(d => d.target.group === "resource" ? 0.8 : 0.5))
        .force("charge", d3.forceManyBody()
            .strength(d => d.group === "resource" ? -30 : -200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => sizes[d.group] + 8))
        .alphaDecay(0.015)
        .velocityDecay(0.4);

    const link = g.append("g")
        .selectAll("line")
        .data(networkData.links)
        .join("line")
        .attr("stroke", d => d.target.group === "resource" ? "#ddd" : "#bbb")
        .attr("stroke-opacity", d => d.target.group === "resource" ? 0.4 : 0.6)
        .attr("stroke-width", d => d.target.group === "resource" ? 0.5 : 1);

    const node = g.append("g")
        .selectAll("g")
        .data(networkData.nodes)
        .join("g")
        .style("cursor", "pointer")
        .call(d3.drag()
            .on("start", dragstart)
            .on("drag", dragging)
            .on("end", dragend));

    node.append("circle")
        .attr("r", d => sizes[d.group])
        .attr("fill", d => colors[d.group])
        .attr("stroke", d => d.group === "resource" ? "none" : "#fff")
        .attr("stroke-width", d => d.group === "resource" ? 0 : 1.5);

    node.append("text")
        .text(d => d.label)
        .attr("x", d => sizes[d.group] + 4)
        .attr("y", 3)
        .attr("font-size", d => {
            if (d.group === "root") return "16px";
            if (d.group === "category") return "12px";
            if (d.group === "section") return "10px";
            return "8px";
        })
        .attr("font-weight", d => (d.group === "root" || d.group === "category") ? "600" : "normal")
        .attr("fill", d => d.group === "resource" ? "#666" : "#2a2a2a")
        .attr("font-family", "'IBM Plex Mono', monospace");

    // Click handlers
    node.on("click", (e, d) => {
        e.stopPropagation();
        if (d.group === "resource" && d.url) {
            window.open(d.url, '_blank');
        } else if (d.group === "section") {
            scrollToSection(d.id);
        }
    });

    // Hover tooltip for resources
    node.filter(d => d.group === "resource")
        .append("title")
        .text(d => d.fullLabel);

    svg.on("click", () => {});

    const padding = 30;
    simulation.on("tick", () => {
        networkData.nodes.forEach(d => {
            if (!d.fixed) {
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

function scrollToSection(sectionId) {
    // Switch to list view
    const network = document.getElementById("network-container");
    const list = document.getElementById("list-container");
    const btn = document.getElementById("view-toggle-btn");

    if (network && !network.classList.contains("hidden")) {
        network.classList.add("hidden");
        list.classList.remove("hidden");
        btn.textContent = "vue réseau";
    }

    // Scroll to section and open it
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

// Initialize network view on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initNetwork("network-container"));
} else {
    // DOM already loaded
    initNetwork("network-container");
}
