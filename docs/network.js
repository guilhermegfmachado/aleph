// Network visualization for sources
// Uses D3.js force-directed graph

const networkData = {
    nodes: [
        // Root
        { id: "root", label: "א", group: "root", level: 0 },

        // Main categories (level 1)
        { id: "savoir", label: "Savoir", group: "category", level: 1 },
        { id: "culture", label: "Culture", group: "category", level: 1 },
        { id: "industrie", label: "Industrie", group: "category", level: 1 },
        { id: "pratique", label: "Pratique", group: "category", level: 1 },
        { id: "juridique", label: "Juridique", group: "category", level: 1 },

        // Savoir children (level 2)
        { id: "textes", label: "Textes & Archives", group: "section", level: 2, parent: "savoir", href: "#textes" },
        { id: "recherche", label: "Recherche & OSINT", group: "section", level: 2, parent: "savoir", href: "#recherche" },
        { id: "langues", label: "Langues", group: "section", level: 2, parent: "savoir", href: "#langues" },

        // Culture children
        { id: "arts", label: "Arts Visuels", group: "section", level: 2, parent: "culture", href: "#arts" },
        { id: "musique", label: "Musique", group: "section", level: 2, parent: "culture", href: "#musique" },
        { id: "sciences-humaines", label: "Sciences Humaines", group: "section", level: 2, parent: "culture", href: "#sciences-humaines" },

        // Industrie children
        { id: "economie", label: "Économie & Finance", group: "section", level: 2, parent: "industrie", href: "#economie" },
        { id: "informatique", label: "Informatique", group: "section", level: 2, parent: "industrie", href: "#informatique" },
        { id: "metiers", label: "Métiers & Artisanat", group: "section", level: 2, parent: "industrie", href: "#metiers" },

        // Pratique children
        { id: "design", label: "Design & Objets", group: "section", level: 2, parent: "pratique", href: "#design" },
        { id: "transport", label: "Transport", group: "section", level: 2, parent: "pratique", href: "#transport" },
        { id: "education", label: "Éducation", group: "section", level: 2, parent: "pratique", href: "#education" },

        // Juridique children
        { id: "international", label: "Droit International", group: "section", level: 2, parent: "juridique", href: "#international" },
        { id: "regional", label: "Ressources Régionales", group: "section", level: 2, parent: "juridique", href: "#regional" },

        // Level 3 - Subsections (examples)
        // Textes subsections
        { id: "classiques", label: "Classiques", group: "subsection", level: 3, parent: "textes" },
        { id: "bibliotheques", label: "Bibliothèques", group: "subsection", level: 3, parent: "textes" },
        { id: "manuscrits", label: "Manuscrits", group: "subsection", level: 3, parent: "textes" },
        { id: "litterature", label: "Littérature", group: "subsection", level: 3, parent: "textes" },

        // Économie subsections
        { id: "data-eco", label: "Données", group: "subsection", level: 3, parent: "economie" },
        { id: "crypto", label: "Crypto & DeFi", group: "subsection", level: 3, parent: "economie" },
        { id: "commodites", label: "Commodités", group: "subsection", level: 3, parent: "economie" },
        { id: "vc", label: "VC & PE", group: "subsection", level: 3, parent: "economie" },

        // Informatique subsections
        { id: "hacker", label: "Culture Hacker", group: "subsection", level: 3, parent: "informatique" },
        { id: "deep-tech", label: "Deep Technical", group: "subsection", level: 3, parent: "informatique" },
        { id: "math-theory", label: "Math & Théorie", group: "subsection", level: 3, parent: "informatique" },

        // Design subsections
        { id: "japan-design", label: "Design Japonais", group: "subsection", level: 3, parent: "design" },
        { id: "euro-design", label: "Design Européen", group: "subsection", level: 3, parent: "design" },
        { id: "vintage", label: "Vintage", group: "subsection", level: 3, parent: "design" },
        { id: "velos-instruments", label: "Vélos & Instruments", group: "subsection", level: 3, parent: "design" },

        // Arts subsections
        { id: "musees", label: "Musées", group: "subsection", level: 3, parent: "arts" },
        { id: "contemporain", label: "Contemporain", group: "subsection", level: 3, parent: "arts" },

        // Sciences humaines subsections
        { id: "psycho", label: "Psychologie", group: "subsection", level: 3, parent: "sciences-humaines" },
        { id: "anthropo", label: "Anthropologie", group: "subsection", level: 3, parent: "sciences-humaines" },
        { id: "politique", label: "Archives Politiques", group: "subsection", level: 3, parent: "sciences-humaines" },
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
        { source: "savoir", target: "recherche" },
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

        // Textes to subsections
        { source: "textes", target: "classiques" },
        { source: "textes", target: "bibliotheques" },
        { source: "textes", target: "manuscrits" },
        { source: "textes", target: "litterature" },

        // Économie to subsections
        { source: "economie", target: "data-eco" },
        { source: "economie", target: "crypto" },
        { source: "economie", target: "commodites" },
        { source: "economie", target: "vc" },

        // Informatique to subsections
        { source: "informatique", target: "hacker" },
        { source: "informatique", target: "deep-tech" },
        { source: "informatique", target: "math-theory" },

        // Design to subsections
        { source: "design", target: "japan-design" },
        { source: "design", target: "euro-design" },
        { source: "design", target: "vintage" },
        { source: "design", target: "velos-instruments" },

        // Arts to subsections
        { source: "arts", target: "musees" },
        { source: "arts", target: "contemporain" },

        // Sciences humaines to subsections
        { source: "sciences-humaines", target: "psycho" },
        { source: "sciences-humaines", target: "anthropo" },
        { source: "sciences-humaines", target: "politique" },

        // Cross-connections (related topics)
        { source: "crypto", target: "informatique", type: "related" },
        { source: "data-eco", target: "recherche", type: "related" },
        { source: "math-theory", target: "langues", type: "related" },
        { source: "manuscrits", target: "arts", type: "related" },
        { source: "politique", target: "textes", type: "related" },
    ]
};

function initNetwork(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const width = container.clientWidth;
    const height = Math.max(500, window.innerHeight - 200);

    // Clear previous
    container.innerHTML = '';

    // Create SVG
    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

    // Add zoom behavior
    const g = svg.append("g");

    svg.call(d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        }));

    // Color scale
    const color = d3.scaleOrdinal()
        .domain(["root", "category", "section", "subsection"])
        .range(["#c9a227", "#6b4a04", "#8b6914", "#a08050"]);

    // Node size scale
    const nodeSize = d3.scaleOrdinal()
        .domain(["root", "category", "section", "subsection"])
        .range([25, 18, 12, 8]);

    // Create force simulation
    const simulation = d3.forceSimulation(networkData.nodes)
        .force("link", d3.forceLink(networkData.links)
            .id(d => d.id)
            .distance(d => {
                if (d.type === "related") return 150;
                const sourceLevel = d.source.level || 0;
                return 60 + (sourceLevel * 20);
            })
            .strength(d => d.type === "related" ? 0.1 : 0.8))
        .force("charge", d3.forceManyBody()
            .strength(d => -200 - (d.level * 50)))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => nodeSize(d.group) + 10));

    // Draw links
    const link = g.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(networkData.links)
        .join("line")
        .attr("stroke", d => d.type === "related" ? "#ddd" : "#999")
        .attr("stroke-opacity", d => d.type === "related" ? 0.3 : 0.6)
        .attr("stroke-width", d => d.type === "related" ? 1 : 1.5)
        .attr("stroke-dasharray", d => d.type === "related" ? "3,3" : "none");

    // Draw nodes
    const node = g.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(networkData.nodes)
        .join("g")
        .attr("class", "node")
        .style("cursor", d => d.href ? "pointer" : "grab")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Node circles
    node.append("circle")
        .attr("r", d => nodeSize(d.group))
        .attr("fill", d => color(d.group))
        .attr("stroke", "#fff")
        .attr("stroke-width", d => d.group === "root" ? 3 : 1.5);

    // Node labels
    node.append("text")
        .text(d => d.label)
        .attr("x", d => nodeSize(d.group) + 5)
        .attr("y", 4)
        .attr("font-size", d => d.group === "root" ? "14px" : d.group === "category" ? "12px" : "10px")
        .attr("font-weight", d => d.level <= 1 ? "bold" : "normal")
        .attr("fill", "#2a2a2a")
        .attr("font-family", "'IBM Plex Mono', monospace");

    // Click handler for navigation
    node.on("click", (event, d) => {
        if (d.href) {
            // Scroll to section
            const element = document.querySelector(d.href);
            if (element) {
                element.scrollIntoView({ behavior: "smooth" });
                element.setAttribute("open", "");
            }
        }
    });

    // Hover effects
    node.on("mouseenter", function(event, d) {
        d3.select(this).select("circle")
            .transition()
            .duration(200)
            .attr("r", nodeSize(d.group) * 1.3);

        // Highlight connected links
        link.attr("stroke-opacity", l =>
            (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.1);

        // Highlight connected nodes
        node.attr("opacity", n => {
            if (n.id === d.id) return 1;
            const connected = networkData.links.some(l =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id));
            return connected ? 1 : 0.3;
        });
    });

    node.on("mouseleave", function(event, d) {
        d3.select(this).select("circle")
            .transition()
            .duration(200)
            .attr("r", nodeSize(d.group));

        link.attr("stroke-opacity", l => l.type === "related" ? 0.3 : 0.6);
        node.attr("opacity", 1);
    });

    // Simulation tick
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    // Handle resize
    window.addEventListener("resize", () => {
        const newWidth = container.clientWidth;
        const newHeight = Math.max(500, window.innerHeight - 200);
        svg.attr("width", newWidth).attr("height", newHeight);
        simulation.force("center", d3.forceCenter(newWidth / 2, newHeight / 2));
        simulation.alpha(0.3).restart();
    });
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
    }
}
