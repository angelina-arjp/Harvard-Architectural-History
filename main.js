const dataPath = "data/properties.geojson";
const otherPath = "data/other_geoms.geojson";

const HARVARD_CENTER = [-71.1167, 42.3770];
const INITIAL_ZOOM = 14;
const CURRENT_COLOR = "#a51c30";
const FORMER_COLOR = "#111111";

let map;
let popup;

function propertyFilter(year) {
  return [
    "any",
    [
      "all",
      ["<=", ["get", "year_start"], year],
      [">", ["get", "year_end"], year]
    ],
    [
      "all",
      ["<=", ["get", "year_end"], year],
      ["==", ["get", "currently_exists"], true]
    ]
  ];
}

function propertyColorExpression(year) {
  return [
    "case",
    [
      "all",
      ["<", ["get", "year_end"], year],
      ["==", ["get", "currently_owned"], false]
    ],
    FORMER_COLOR,
    CURRENT_COLOR
  ];
}

function setYear(year) {
  document.getElementById("slider-year").textContent = year;
  map.setFilter("buildings-fill", propertyFilter(year));
  map.setPaintProperty("buildings-fill", "fill-color", propertyColorExpression(year));
}

function buildNarrative() {
  const container = document.getElementById("chapters-container");

  config.forEach((chapter) => {
    const chapterCard = document.createElement("section");
    chapterCard.className = "chapter-card";
    chapterCard.innerHTML = `
      <h2>${chapter.chapterTitle}</h2>
      <div class="chapter-years">${chapter.chapterYears}</div>
    `;
    container.appendChild(chapterCard);

    chapter.subsections.forEach((subsection) => {
      const step = document.createElement("section");
      step.className = "subsection-card";
      step.id = subsection.id;

      let html = `<p>${subsection.text}</p>`;
      if (subsection.quote) {
        html += `
          <div class="quote">
            <div>${subsection.quote}</div>
            ${subsection.quoteAuthor ? `<div class="credit">— ${subsection.quoteAuthor}</div>` : ""}
            ${subsection.quoteSource ? `<div class="credit">${subsection.quoteSource}</div>` : ""}
          </div>
        `;
      }

      step.innerHTML = html;
      container.appendChild(step);
    });
  });
}

function setupObserver() {
  const options = {
    root: null,
    rootMargin: "-20% 0px -55% 0px",
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      document.querySelectorAll(".subsection-card.active").forEach((node) => {
        node.classList.remove("active");
      });
      entry.target.classList.add("active");

      const subsection = findSubsection(entry.target.id);
      if (subsection?.timeline_year) {
        const year = Number(subsection.timeline_year);
        setYear(year);
        document.getElementById("map-slider").value = year;
      }
    });
  }, options);

  document.querySelectorAll(".subsection-card").forEach((node) => observer.observe(node));
}

function findSubsection(id) {
  for (const chapter of config) {
    for (const subsection of chapter.subsections) {
      if (subsection.id === id) return subsection;
    }
  }
  return null;
}

async function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors"
        }
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm"
        }
      ]
    },
    center: HARVARD_CENTER,
    zoom: INITIAL_ZOOM
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  map.on("load", async () => {
    const [properties, otherGeoms] = await Promise.all([
      fetch(dataPath).then((r) => r.json()),
      fetch(otherPath).then((r) => r.json()).catch(() => ({ type: "FeatureCollection", features: [] }))
    ]);

    map.addSource("buildings", {
      type: "geojson",
      data: properties
    });

    map.addLayer({
      id: "buildings-fill",
      type: "fill",
      source: "buildings",
      paint: {
        "fill-color": CURRENT_COLOR,
        "fill-opacity": 0.55,
        "fill-outline-color": "#ffffff"
      }
    });

    map.addLayer({
      id: "buildings-line",
      type: "line",
      source: "buildings",
      paint: {
        "line-color": "#ffffff",
        "line-width": 1
      }
    });

    if (otherGeoms.features?.length) {
      map.addSource("other", {
        type: "geojson",
        data: otherGeoms
      });

      map.addLayer({
        id: "other-lines",
        type: "line",
        source: "other",
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#2b6cb0"],
          "line-width": 3,
          "line-opacity": 0.65
        }
      });
    }

    map.on("mousemove", "buildings-fill", (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const p = feature.properties;
      const html = `
        <strong>${p.name || "Untitled parcel"}</strong><br />
        ${p.address ? `${p.address}<br />` : ""}
        ${p.year_start ? `Start: ${p.year_start}<br />` : ""}
        ${p.year_end ? `End: ${p.year_end}<br />` : ""}
        ${p.currently_owned !== undefined ? `Currently owned: ${p.currently_owned}` : ""}
      `;
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "buildings-fill", () => {
      popup.remove();
      map.getCanvas().style.cursor = "";
    });

    const initialYear = Number(document.getElementById("map-slider").value);
    setYear(initialYear);
  });
}

document.getElementById("map-slider").addEventListener("input", (e) => {
  setYear(Number(e.target.value));
});

buildNarrative();
setupObserver();
initMap();
