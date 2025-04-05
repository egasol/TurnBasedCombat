const spriteSources = {
	// This should be dynamically loaded from the server in production
	rock: "sprites/terrain/rock.png",
	tree: "sprites/terrain/tree.png",
	bush: "sprites/terrain/bush.png",
};

const grid = document.getElementById("grid");
const spritesDiv = document.getElementById("sprites");
const setGridButton = document.getElementById("setGridButton");
const saveButton = document.getElementById("saveButton");
const loadFileInput = document.getElementById("loadFile");
let selectedSprite = null;
let gridData = [];
let gridWidth = 25, gridHeight = 25;

// Populate the sprite selector
Object.entries(spriteSources).forEach(([key, src]) => {
  const img = document.createElement("img");
  img.src = src;
  img.alt = key;
  img.title = key;
  console.log(`src: ${src}`);
  img.classList.add("sprite-option");
  img.addEventListener("click", () => {
    selectedSprite = key;
    document.querySelectorAll(".sprite-option").forEach(el => el.classList.remove("selected"));
    img.classList.add("selected");
  });
  spritesDiv.appendChild(img);
});

// Set grid size and render grid
setGridButton.addEventListener("click", () => {
  gridWidth = parseInt(document.getElementById("gridWidth").value);
  gridHeight = parseInt(document.getElementById("gridHeight").value);
  renderGrid();
});

function renderGrid() {
  grid.innerHTML = ""; // Clear the grid

  // Define the CSS grid structure based on fixed tile size
  grid.style.gridTemplateColumns = `repeat(${gridWidth}, 32px)`;
  grid.style.gridTemplateRows = `repeat(${gridHeight}, 32px)`;

  // Reset the grid data
  gridData = Array.from({ length: gridHeight }, () =>
    Array.from({ length: gridWidth }, () => null)
  );

  // Populate the grid with cells
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const cell = document.createElement("div");
      cell.classList.add("grid-cell");
      cell.addEventListener("click", () => {
        if (selectedSprite) {
          cell.style.backgroundImage = `url(${spriteSources[selectedSprite]})`;
          gridData[y][x] = { x, y, type: selectedSprite, blocksVision: false };
        }
      });
      grid.appendChild(cell);
    }
  }
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
  const reader = new FileReader();
  reader.onload = (e) => {
    const mapData = JSON.parse(e.target.result);
    gridWidth = mapData.gridWidth;
    gridHeight = mapData.gridHeight;
    gridData = Array.from({ length: gridHeight }, (_, y) =>
    Array.from({ length: gridWidth }, (_, x) => mapData.terrain.find(t => t.x === x && t.y === y) || null)
    );
    renderGrid();
    // Populate the grid based on loaded data
    mapData.terrain.forEach(t => {
    const cell = grid.children[t.y * gridWidth + t.x];
    cell.style.backgroundImage = `url(${spriteSources[t.type]})`;
    });
  };
  reader.readAsText(file);
});

// Initial render
renderGrid();
