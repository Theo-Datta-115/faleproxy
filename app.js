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

// CHANGE: helper to preserve the casing of the matched word
function yaleToFalePreservingCase(match) {
  if (match === match.toUpperCase()) return 'FALE';       // YALE -> FALE
  if (match[0] === match[0].toUpperCase()) return 'Fale'; // Yale -> Fale
  return 'fale';                                          // yale -> fale
}

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL
    // CHANGE: keep axios call simple; avoid returning/logging complex objects anywhere
    const response = await axios.get(url);
    const html = response.data;

    // Use cheerio to parse HTML and selectively replace text content, not URLs
    const $ = cheerio.load(html);
    
    // CHANGE: Replace in text nodes only, skip script/style/noscript
    $('body *:not(script):not(style):not(noscript)')
      .contents()
      .filter(function() {
        return this.nodeType === 3; // Text nodes only
      })
      .each(function() {
        const text = $(this).text();
        // CHANGE: single regex + callback preserves original casing
        const newText = text.replace(/\bYALE\b/gi, yaleToFalePreservingCase);
        if (text !== newText) {
          $(this).replaceWith(newText);
        }
      });
    
    // CHANGE: Process title with casing-preserving replacement
    const currentTitle = $('title').text();
    if (currentTitle) {
      const newTitle = currentTitle.replace(/\bYALE\b/gi, yaleToFalePreservingCase);
      $('title').text(newTitle);
    }
    
    return res.json({ 
      success: true, 
      content: $.html(),
      // CHANGE: return the (possibly modified) title; null if no title
      title: $('title').text() || null,
      originalUrl: url
    });
  } catch (error) {
    // CHANGE: log only primitives to avoid circular serialization in Jest workers
    const msg = (error && error.message) ? error.message : String(error);
    console.error('Error fetching URL:', msg);
    return res.status(500).json({ 
      error: `Failed to fetch content: ${msg}` 
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