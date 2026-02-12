// Network visualization for sources
// 4 philosophical categories inspired by Bachelard & Simondon

const networkData = {
    nodes: [
        // Root - fixed in center
        { id: "root", label: "א", group: "root", fixed: true },

        // 4 main categories
        { id: "archive", label: "L'Archive", group: "category" },
        { id: "atelier", label: "L'Atelier", group: "category" },
        { id: "enquete", label: "L'Enquête", group: "category" },
        { id: "reverie", label: "La Rêverie", group: "category" },

        // L'Archive children - accumulated memory
        { id: "textes", label: "Textes", group: "section", parent: "archive", href: "#textes" },
        { id: "langues", label: "Langues", group: "section", parent: "archive", href: "#langues" },

        // L'Atelier children - technical milieu
        { id: "metiers", label: "Métiers", group: "section", parent: "atelier", href: "#metiers" },
        { id: "design", label: "Design", group: "section", parent: "atelier", href: "#design" },
        { id: "transport", label: "Transport", group: "section", parent: "atelier", href: "#transport" },

        // L'Enquête children - investigation
        { id: "informatique", label: "Informatique", group: "section", parent: "enquete", href: "#informatique" },
        { id: "economie", label: "Économie", group: "section", parent: "enquete", href: "#economie" },
        { id: "droit", label: "Droit", group: "section", parent: "enquete", href: "#droit" },

        // La Rêverie children - imagination
        { id: "arts", label: "Arts", group: "section", parent: "reverie", href: "#arts" },
        { id: "musique", label: "Musique", group: "section", parent: "reverie", href: "#musique" },
        { id: "humanites", label: "Humanités", group: "section", parent: "reverie", href: "#humanites" },
    ],
    links: [
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

        // Cross-connections
        { source: "informatique", target: "textes", type: "related" },
        { source: "economie", target: "droit", type: "related" },
        { source: "arts", target: "textes", type: "related" },
        { source: "langues", target: "humanites", type: "related" },
    ]
};

// Resources cache
let sectionResources = {};

function extractResourcesFromDOM() {
    sectionResources = {};
    document.querySelectorAll('.source-section').forEach(section => {
        const id = section.id;
        const resources = [];
        section.querySelectorAll('.resource').forEach(res => {
            const link = res.querySelector('.resource-name a');
            if (link) {
                resources.push({
                    name: link.textContent,
                    url: link.href
                });
            }
        });
        sectionResources[id] = resources;
    });
}

function initNetwork(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    extractResourcesFromDOM();

    const width = container.clientWidth;
    const height = Math.max(500, window.innerHeight - 300);
    container.innerHTML = '';

    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g");

    svg.call(d3.zoom()
        .scaleExtent([0.5, 3])
        .on("zoom", e => g.attr("transform", e.transform)));

    const colors = {
        root: "#6b4a04",
        category: "#8b6914",
        section: "#a08050"
    };

    const sizes = {
        root: 22,
        category: 16,
        section: 10
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
            .distance(d => d.type === "related" ? 150 : 90)
            .strength(d => d.type === "related" ? 0.05 : 0.5))
        .force("charge", d3.forceManyBody().strength(-250))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => sizes[d.group] + 15))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

    const link = g.append("g")
        .selectAll("line")
        .data(networkData.links)
        .join("line")
        .attr("stroke", d => d.type === "related" ? "#ddd" : "#bbb")
        .attr("stroke-opacity", d => d.type === "related" ? 0.3 : 0.6)
        .attr("stroke-dasharray", d => d.type === "related" ? "3,3" : "none");

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
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);

    node.append("text")
        .text(d => d.label)
        .attr("x", d => sizes[d.group] + 5)
        .attr("y", 4)
        .attr("font-size", d => d.group === "root" ? "14px" : d.group === "category" ? "12px" : "10px")
        .attr("font-weight", d => d.group !== "section" ? "600" : "normal")
        .attr("fill", "#2a2a2a")
        .attr("font-family", "'IBM Plex Mono', monospace");

    node.on("click", (e, d) => {
        e.stopPropagation();
        if (d.href && sectionResources[d.id]) {
            showPanel(d, sectionResources[d.id], e);
        } else if (d.group === "category") {
            const children = networkData.nodes.filter(n => n.parent === d.id);
            showCategoryPanel(d, children, e);
        }
    });

    svg.on("click", hidePanel);

    const padding = 40;
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
        hidePanel();
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

    createPanel(container);
}

function createPanel(container) {
    if (document.getElementById('resources-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'resources-panel';
    panel.className = 'resources-panel hidden';
    panel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"></span>
            <button class="panel-close" onclick="hidePanel()">×</button>
        </div>
        <div class="panel-content"></div>
    `;
    container.appendChild(panel);
}

let panelTimeout = null;

function showPanel(node, resources, e) {
    const panel = document.getElementById('resources-panel');
    if (!panel) return;

    // Clear any existing timeout
    if (panelTimeout) clearTimeout(panelTimeout);

    panel.querySelector('.panel-title').textContent = node.label;
    const content = panel.querySelector('.panel-content');
    const items = resources.slice(0, 8);
    content.innerHTML = items.map(r =>
        `<a href="${r.url}" target="_blank" class="panel-resource" onclick="hidePanel()">${r.name}</a>`
    ).join('') + (resources.length > 8 ?
        `<a href="#" class="panel-more" onclick="scrollToSection('${node.id}'); return false;">voir tout →</a>` : '');

    panel.classList.remove('hidden');
    positionPanel(panel, e);

    // Auto-close after 8 seconds
    panelTimeout = setTimeout(hidePanel, 8000);
}

function showCategoryPanel(node, children, e) {
    const panel = document.getElementById('resources-panel');
    if (!panel) return;

    // Clear any existing timeout
    if (panelTimeout) clearTimeout(panelTimeout);

    panel.querySelector('.panel-title').textContent = node.label;
    const content = panel.querySelector('.panel-content');
    content.innerHTML = children.map(c =>
        `<a href="#" class="panel-resource" onclick="scrollToSection('${c.id}'); return false;">${c.label}</a>`
    ).join('');

    panel.classList.remove('hidden');
    positionPanel(panel, e);

    // Auto-close after 8 seconds
    panelTimeout = setTimeout(hidePanel, 8000);
}

function positionPanel(panel, e) {
    const svg = e.target.closest('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    panel.style.left = Math.min(e.clientX - rect.left + 10, rect.width - 220) + 'px';
    panel.style.top = Math.min(e.clientY - rect.top + 10, rect.height - 200) + 'px';
}

function hidePanel() {
    if (panelTimeout) clearTimeout(panelTimeout);
    const panel = document.getElementById('resources-panel');
    if (panel) panel.classList.add('hidden');
}

function scrollToSection(sectionId) {
    hidePanel();
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
        hidePanel();
    }
}
