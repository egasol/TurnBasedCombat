// fileUtilities.js
const fs = require('fs');
const path = require('path');

module.exports = function (app) {
  // Directory where character JSON files will be stored.
  const charactersDir = "characters";
  const terrainsDir = "terrains";

  // Create the directory if it doesn't exist.
  if (!fs.existsSync(charactersDir)) {
    fs.mkdirSync(charactersDir);
  }

  /**
   * POST /save-character
   * Save a character using the provided JSON data.
   * Each character is saved as a separate file named `{characterName}.json`.
   */
  app.post('/save-character', (req, res) => {
    const { name, class: charClass, stats } = req.body;
    if (!name || !charClass || !stats) {
      return res.status(400).send('Invalid character data');
    }

    // Sanitize the character name to allow only letters, numbers, underscore and hyphen.
    const safeName = name.replace(/[^\w\-]/g, '');
    const fileName = `${safeName}.json`;
    const filePath = path.join(charactersDir, fileName);

    // Check if the character already exists.
    if (fs.existsSync(filePath)) {
      return res.status(409).send('Character name already exists');
    }

    const characterData = { name, charClass, stats };

    fs.writeFile(filePath, JSON.stringify(characterData, null, 2), (err) => {
      if (err) {
        console.error('Error saving character:', err);
        return res.status(500).send('Internal server error');
      }
      console.log('Saved character:', characterData);
      res.status(200).send('Character saved successfully');
    });
  });

  /**
   * GET /get-characters
   * Returns the list of saved characters from the privateCharacters directory.
   *
   * For demonstration, we require a query parameter (auth=secret-token) for access.
   * Replace this with your real authentication/authorization strategy.
   */
  app.get('/get-characters', (req, res) => {
    // const { auth } = req.query;
    // // Simple check: requires "secret-token" to be provided.
    // if (auth !== 'secret-token') {
    //   return res.status(403).send('Forbidden');
    // }

    fs.readdir(charactersDir, (err, files) => {
      if (err) {
        console.error('Error reading characters directory:', err);
        return res.status(500).send('Internal server error');
      }
      const characters = [];
      files.forEach((file) => {
        if (path.extname(file) === '.json') {
          const filePath = path.join(charactersDir, file);
          try {
            const fileData = fs.readFileSync(filePath, 'utf8');
            const character = JSON.parse(fileData);
            characters.push(character);
          } catch (error) {
            console.error('Error parsing character file', file, error);
          }
        }
      });
      res.json(characters);
    });
  });

  app.post('/save-terrain', (req, res) => {
    const { filename, data } = req.body;
  
    // Validate request data
    if (!filename || !data) {
      return res.status(400).send('Filename and data are required.');
    }
  
    // Sanitize filename to prevent directory traversal
    const safeFilename = filename.replace(/[^\w\-]/g, '') + '.json';
    const filePath = path.join(terrainsDir, safeFilename);
  
    // Write data to the file
    fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
      if (err) {
        console.error('Error saving terrain:', err);
        return res.status(500).send('Failed to save terrain.');
      }
  
      console.log(`Terrain saved successfully as ${safeFilename}`);
      res.status(200).send('Terrain saved successfully.');
    });
  });

  /**
   * Recursively fetch files from all directories under a root folder.
   * @param {string} dir - The root directory to scan.
   * @param {string} rootDirName - The name of the root folder to include in relative paths.
   * @param {Array<string>} extensions - List of acceptable file extensions.
   * @returns {Object} - An object mapping file names (without extensions) to their relative paths.
   */
   function loadAllSpriteSources(dir, rootDirName, extensions) {
    const spriteSources = {};

    function traverseDirectory(currentDir) {
      const files = fs.readdirSync(currentDir);

      files.forEach((file) => {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Recurse into subdirectories
          traverseDirectory(fullPath);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (extensions.includes(ext)) {
            const name = path.basename(file, ext);
            const relativePath = fullPath.replace("public/", "");
            spriteSources[name] = relativePath
          }
        }
      });
    }

    traverseDirectory(dir);
    return spriteSources;
  }

  app.get('/sprite-sources', (req, res) => {
    const spriteRoot = "public/sprites"
    const acceptedExtensions = ['.png', '.jpg', '.jpeg'];

    try {
      const spriteSources = loadAllSpriteSources(spriteRoot, __dirname, acceptedExtensions);
      res.json(spriteSources);
    } catch (err) {
      console.error('Error loading sprite sources:', err);
      res.status(500).send('Failed to load sprite sources');
    }
  });
};
