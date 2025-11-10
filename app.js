const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper: casing-preserving replacement for the standalone word "Yale"
function yaleToFalePreservingCase(match) {
  // match is the exact substring that matched the regex (YALE|Yale|yale)
  if (match === match.toUpperCase()) return 'FALE';   // YALE -> FALE
  if (match[0] === match[0].toUpperCase()) return 'Fale'; // Yale -> Fale
  return 'fale'; // yale -> fale
}

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL
    const response = await axios.get(url);
    const html = response.data;

    const $ = cheerio.load(html);

    // Replace in <title> (if present)
    const oldTitle = $('title').text();
    if (oldTitle) {
      const newTitle = oldTitle.replace(/\bYALE\b/gi, yaleToFalePreservingCase);
      $('title').text(newTitle);
    }

    // Replace in BODY text nodes, skipping script/style/noscript
    $('body *:not(script):not(style):not(noscript)')
      .contents()
      .filter(function () {
        return this.nodeType === 3; // text nodes
      })
      .each(function () {
        const text = $(this).text();
        const newText = text.replace(/\bYALE\b/gi, yaleToFalePreservingCase);
        if (text !== newText) {
          $(this).replaceWith(newText);
        }
      });

    return res.json({
      success: true,
      content: $.html(),
      // return the modified title for convenience/clarity in tests
      title: $('title').text() || null,
      originalUrl: url,
    });
  } catch (error) {
    // Keep logs primitive to avoid any circular JSON issues
    const msg = error && error.message ? error.message : String(error);
    console.error('Error fetching URL:', msg);
    return res.status(500).json({
      error: `Failed to fetch content: ${msg}`,
    });
  }
});

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
