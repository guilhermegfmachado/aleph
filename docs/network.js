// Network visualization for sources
// Uses D3.js force-directed graph

const networkData = {
    nodes: [
        // Root - fixed in center
        { id: "root", label: "א", group: "root", level: 0, fixed: true },

        // Main categories (level 1)
        { id: "savoir", label: "Savoir", group: "category", level: 1 },
        { id: "culture", label: "Culture", group: "category", level: 1 },
        { id: "industrie", label: "Industrie", group: "category", level: 1 },
        { id: "pratique", label: "Pratique", group: "category", level: 1 },
        { id: "juridique", label: "Juridique", group: "category", level: 1 },

        // Savoir children (level 2) - now just Textes and Langues
        { id: "textes", label: "Textes & Archives", group: "section", level: 2, parent: "savoir", href: "#textes" },
        { id: "langues", label: "Langues", group: "section", level: 2, parent: "savoir", href: "#langues" },

        // Culture children
        { id: "arts", label: "Arts Visuels", group: "section", level: 2, parent: "culture", href: "#arts" },
        { id: "musique", label: "Musique", group: "section", level: 2, parent: "culture", href: "#musique" },
        { id: "sciences-humaines", label: "Sciences Humaines", group: "section", level: 2, parent: "culture", href: "#sciences-humaines" },

        // Industrie children - now includes OSINT/Recherche
        { id: "economie", label: "Économie & Finance", group: "section", level: 2, parent: "industrie", href: "#economie" },
        { id: "informatique", label: "Informatique & OSINT", group: "section", level: 2, parent: "industrie", href: "#informatique" },
        { id: "metiers", label: "Métiers & Artisanat", group: "section", level: 2, parent: "industrie", href: "#metiers" },

        // Pratique children
        { id: "design", label: "Design & Objets", group: "section", level: 2, parent: "pratique", href: "#design" },
        { id: "transport", label: "Transport", group: "section", level: 2, parent: "pratique", href: "#transport" },
        { id: "education", label: "Éducation", group: "section", level: 2, parent: "pratique", href: "#education" },

        // Juridique children
        { id: "international", label: "Droit International", group: "section", level: 2, parent: "juridique", href: "#international" },
        { id: "regional", label: "Ressources Régionales", group: "section", level: 2, parent: "juridique", href: "#regional" },
    ],
    links: [
        // Root to categories
        { source: "root", target: "savoir" },
        { source: "root", target: "culture" },
        { source: "root", target: "industrie" },
        { source: "root", target: "pratique" },
        { source: "root", target: "juridique" },

        // Savoir to children
        { source: "savoir", target: "textes" },
        { source: "savoir", target: "langues" },

        // Culture to children
        { source: "culture", target: "arts" },
        { source: "culture", target: "musique" },
        { source: "culture", target: "sciences-humaines" },

        // Industrie to children
        { source: "industrie", target: "economie" },
        { source: "industrie", target: "informatique" },
        { source: "industrie", target: "metiers" },

        // Pratique to children
        { source: "pratique", target: "design" },
        { source: "pratique", target: "transport" },
        { source: "pratique", target: "education" },

        // Juridique to children
        { source: "juridique", target: "international" },
        { source: "juridique", target: "regional" },

        // Cross-connections (related topics)
        { source: "economie", target: "informatique", type: "related" },
        { source: "langues", target: "informatique", type: "related" },
        { source: "arts", target: "textes", type: "related" },
        { source: "sciences-humaines", target: "textes", type: "related" },
        { source: "informatique", target: "textes", type: "related" },
    ]
};

// Store resources by section for popup display
const sectionResources = {};

function extractResourcesFromDOM() {
    document.querySelectorAll('.source-section').forEach(section => {
        const id = section.id;
        const resources = [];
        section.querySelectorAll('.resource').forEach(res => {
            const nameEl = res.querySelector('.resource-name a');
            const descEl = res.querySelector('.resource-desc');
            if (nameEl) {
                resources.push({
                    name: nameEl.textContent,
                    url: nameEl.href,
                    desc: descEl ? descEl.textContent : ''
                });
            }
        });
        sectionResources[id] = resources;
    });
}

function initNetwork(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Extract resources from DOM
    extractResourcesFromDOM();

    const width = container.clientWidth;
    const height = Math.max(600, window.innerHeight - 250);

    // Clear previous
    container.innerHTML = '';

    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Add zoom behavior
    const g = svg.append("g");

    svg.call(d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.5, 3])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        }));

    // Color scale
    const color = d3.scaleOrdinal()
        .domain(["root", "category", "section"])
        .range(["#6b4a04", "#8b6914", "#a08050"]);

    // Node size scale
    const nodeSize = d3.scaleOrdinal()
        .domain(["root", "category", "section"])
        .range([20, 14, 10]);

    // Fix root node in center
    networkData.nodes.forEach(n => {
        if (n.fixed) {
            n.fx = width / 2;
            n.fy = height / 2;
        }
    });

    // Create force simulation - gentler forces for smoother movement
    const simulation = d3.forceSimulation(networkData.nodes)
        .force("link", d3.forceLink(networkData.links)
            .id(d => d.id)
            .distance(d => d.type === "related" ? 180 : 100)
            .strength(d => d.type === "related" ? 0.05 : 0.4))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => nodeSize(d.group) + 20))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

    // Draw links
    const link = g.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(networkData.links)
        .join("line")
        .attr("stroke", d => d.type === "related" ? "#ddd" : "#bbb")
        .attr("stroke-opacity", d => d.type === "related" ? 0.4 : 0.6)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", d => d.type === "related" ? "4,4" : "none");

    // Draw nodes
    const node = g.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(networkData.nodes)
        .join("g")
        .attr("class", "node")
        .style("cursor", "pointer")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Node circles
    node.append("circle")
        .attr("r", d => nodeSize(d.group))
        .attr("fill", d => color(d.group))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);

    // Node labels
    node.append("text")
        .text(d => d.label)
        .attr("x", d => nodeSize(d.group) + 6)
        .attr("y", 4)
        .attr("font-size", d => d.group === "root" ? "14px" : d.group === "category" ? "11px" : "10px")
        .attr("font-weight", d => d.level <= 1 ? "600" : "normal")
        .attr("fill", "#2a2a2a")
        .attr("font-family", "'IBM Plex Mono', monospace");

    // Click handler - show resources panel
    node.on("click", (event, d) => {
        event.stopPropagation();
        if (d.href && sectionResources[d.id]) {
            showResourcesPanel(d, sectionResources[d.id], event);
        } else if (d.group === "category") {
            // For categories, show children sections
            const children = networkData.nodes.filter(n => n.parent === d.id);
            showCategoryPanel(d, children, event);
        }
    });

    // Close panel on background click
    svg.on("click", () => {
        hideResourcesPanel();
    });

    // Simulation tick with bounding box
    const padding = 50;
    simulation.on("tick", () => {
        // Keep nodes within bounds
        networkData.nodes.forEach(d => {
            if (!d.fixed) {
                d.x = Math.max(padding, Math.min(width - padding, d.x));
                d.y = Math.max(padding, Math.min(height - padding, d.y));
            }
        });

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event) {
        // Don't allow dragging fixed nodes (root)
        if (event.subject.fixed) return;
        if (!event.active) simulation.alphaTarget(0.1).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
        hideResourcesPanel();
    }

    function dragged(event) {
        if (event.subject.fixed) return;
        // Keep within bounds while dragging
        event.subject.fx = Math.max(padding, Math.min(width - padding, event.x));
        event.subject.fy = Math.max(padding, Math.min(height - padding, event.y));
    }

    function dragended(event) {
        if (event.subject.fixed) return;
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    // Create resources panel
    createResourcesPanel(container);
}

function createResourcesPanel(container) {
    const panel = document.createElement('div');
    panel.id = 'resources-panel';
    panel.className = 'resources-panel hidden';
    panel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"></span>
            <button class="panel-close" onclick="hideResourcesPanel()">×</button>
        </div>
        <div class="panel-content"></div>
    `;
    container.appendChild(panel);
}

function showResourcesPanel(node, resources, event) {
    const panel = document.getElementById('resources-panel');
    if (!panel) return;

    panel.querySelector('.panel-title').textContent = node.label;

    const content = panel.querySelector('.panel-content');
    content.innerHTML = resources.slice(0, 8).map(r => `
        <a href="${r.url}" target="_blank" class="panel-resource">
            <span class="resource-title">${r.name}</span>
        </a>
    `).join('') + (resources.length > 8 ? `<a href="${node.href}" class="panel-more">voir tout →</a>` : '');

    panel.classList.remove('hidden');

    // Position panel
    const rect = event.target.closest('svg').getBoundingClientRect();
    panel.style.left = Math.min(event.clientX - rect.left + 10, rect.width - 220) + 'px';
    panel.style.top = Math.min(event.clientY - rect.top + 10, rect.height - 200) + 'px';
}

function showCategoryPanel(node, children, event) {
    const panel = document.getElementById('resources-panel');
    if (!panel) return;

    panel.querySelector('.panel-title').textContent = node.label;

    const content = panel.querySelector('.panel-content');
    content.innerHTML = children.map(c => `
        <a href="${c.href || '#'}" class="panel-resource">
            <span class="resource-title">${c.label}</span>
        </a>
    `).join('');

    panel.classList.remove('hidden');

    const rect = event.target.closest('svg').getBoundingClientRect();
    panel.style.left = Math.min(event.clientX - rect.left + 10, rect.width - 220) + 'px';
    panel.style.top = Math.min(event.clientY - rect.top + 10, rect.height - 200) + 'px';
}

function hideResourcesPanel() {
    const panel = document.getElementById('resources-panel');
    if (panel) panel.classList.add('hidden');
}

// Toggle between network and list view
function toggleNetworkView() {
    const networkContainer = document.getElementById("network-container");
    const listContainer = document.getElementById("list-container");
    const toggleBtn = document.getElementById("view-toggle-btn");

    if (networkContainer.classList.contains("hidden")) {
        networkContainer.classList.remove("hidden");
        listContainer.classList.add("hidden");
        toggleBtn.textContent = "vue liste";
        initNetwork("network-container");
    } else {
        networkContainer.classList.add("hidden");
        listContainer.classList.remove("hidden");
        toggleBtn.textContent = "vue réseau";
        hideResourcesPanel();
    }
}
