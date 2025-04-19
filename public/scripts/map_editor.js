let spriteSources = {};

getSprites()

const grid = document.getElementById("grid");
const spritesDiv = document.getElementById("sprites");
const setGridButton = document.getElementById("setGridButton");
const saveButton = document.getElementById("saveButton");
const loadFileInput = document.getElementById("loadFile");
const terrainModeButton = document.getElementById("terrainModeButton");
const backgroundModeButton = document.getElementById("backgroundModeButton");

let selectedSprite = null;
let gridData = [];
let gridWidth = 25
let gridHeight = 25;
let mode = 'terrain';

function getSprites() {
  fetch('/sprite-sources')
    .then((response) => response.json())
    .then((data) => {
      spriteSources = data;
      populateSpriteSelector();
    })
    .catch((error) => {
      console.error('Error fetching sprite sources:', error);
    });

  spriteSources;
}

function populateSpriteSelector() {
  const spritesDiv = document.getElementById("sprites");
  spritesDiv.innerHTML = ""; // Clear existing sprites

  Object.entries(spriteSources).forEach(([key, src]) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = key;
    img.title = key;
    img.classList.add("sprite-option");
    img.addEventListener("click", () => {
      selectedSprite = key;
      document.querySelectorAll(".sprite-option").forEach(el => el.classList.remove("selected"));
      img.classList.add("selected");
    });
    spritesDiv.appendChild(img);
  });
}


// Set grid size and render grid
setGridButton.addEventListener("click", () => {
  gridWidth = parseInt(document.getElementById("gridWidth").value);
  gridHeight = parseInt(document.getElementById("gridHeight").value);
  initGridData();
  renderGrid();
});

// --- Mode controls ---
terrainModeButton.addEventListener("click", () => {
  mode = 'terrain';
  terrainModeButton.classList.add("active");
  backgroundModeButton.classList.remove("active");
});

backgroundModeButton.addEventListener("click", () => {
  mode = 'background';
  backgroundModeButton.classList.add("active");
  terrainModeButton.classList.remove("active");
});

function initGridData() {
  gridData = Array.from({ length: gridHeight }, () =>
    Array.from({ length: gridWidth }, () => ({ terrain: null, background: "grass" }))
  );
}

// Render grid function adjusted to use nested layers per cell
function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = ""; // Clear existing grid

  // Set up grid dimensions (using CSS grid layout)
  grid.style.gridTemplateColumns = `repeat(${gridWidth}, 32px)`;
  grid.style.gridTemplateRows = `repeat(${gridHeight}, 32px)`;

  // Create grid cells
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const cell = createCell();

      // Update the cell display based on current gridData properties
      updateCellDisplay(cell, gridData[y][x]);

      // When clicking, update the appropriate layer
      cell.addEventListener("click", () => {
        if (!selectedSprite) return; // nothing selected

        if (mode === 'terrain') {
          gridData[y][x].terrain = {
            sprite: selectedSprite,
            properties: { blockingVision: true }
          };
        } else if (mode === 'background') {
          gridData[y][x].background = selectedSprite;
        }
        updateCellDisplay(cell, gridData[y][x]);
      });

      grid.appendChild(cell);
    }
  }
}

// Helper function to create a grid cell with two layers
function createCell() {
  const cell = document.createElement("div");
  cell.classList.add("grid-cell");

  // Create the background layer div
  const bgDiv = document.createElement("div");
  bgDiv.classList.add("cell-background");

  // Create the terrain layer div
  const terrainDiv = document.createElement("div");
  terrainDiv.classList.add("cell-terrain");

  // Append both layers to the cell container
  cell.appendChild(bgDiv);
  cell.appendChild(terrainDiv);
  return cell;
}

// Function to update a cell's visual appearance
function updateCellDisplay(cell, cellData) {
  // Each cell is assumed to have two child nodes:
  // first child: .cell-background, second child: .cell-terrain
  const bgDiv = cell.querySelector(".cell-background");
  const terrainDiv = cell.querySelector(".cell-terrain");

  // Update background layer — if a background sprite is set, otherwise blank
  bgDiv.style.backgroundImage = cellData.background ? `url(${spriteSources[cellData.background]})` : "";
  // Update terrain layer similarly
  terrainDiv.style.backgroundImage = cellData.terrain ? `url(${spriteSources[cellData.terrain.sprite]})` : "";
}

// Save the map to a file
saveButton.addEventListener("click", () => {
  const filename = prompt("Enter filename (without extension):", "new_terrain");
  if (!filename) {
    alert("Filename is required!");
    return;
  }

  const mapData = {
    gridWidth,
    gridHeight,
    terrain: gridData.flat().filter(cell => cell !== null)
  };

  // Send the map data to the server
  fetch("/save-terrain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, data: mapData })
  })
    .then((response) => {
      if (response.ok) {
        alert("Terrain saved successfully!");
      } else {
        alert("Failed to save terrain.");
      }
    })
    .catch((err) => {
      console.error("Error saving terrain:", err);
      alert("An error occurred while saving the terrain.");
    });
});


// Load a map from a file
loadFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const mapData = JSON.parse(e.target.result);

      gridWidth = mapData.gridWidth;
      gridHeight = mapData.gridHeight;

      initGridData();

      gridData = Array.from({ length: gridHeight }, (_, y) =>
        Array.from({ length: gridWidth }, (_, x) =>
          mapData.terrain[y * gridWidth + x]
        )
      );

      renderGrid();

      console.log("Loaded map successfully:", mapData);
    } catch (err) {
      console.error("Error loading map file:", err);
    }
  };
  reader.readAsText(file);
});

// Initial render
initGridData();
renderGrid();
