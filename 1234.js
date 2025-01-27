const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { Adblocker } = require('@cliqz/adblocker');
const fetch = require('cross-fetch'); // Required for Adblocker

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = '53ea700a6725bc9ce833cea89426c7c8';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const SERVERS = {
  VENUS: 'https://vidsrc.xyz',
  MARS: 'https://vidsrc.me',
  JUPITER: 'https://vidsrc.pm',
  SATURN: 'https://2embed.org',
};

// Initialize Adblocker
let adblocker;
Adblocker.fromPrebuiltAdsAndTracking(fetch).then((engine) => {
  adblocker = engine;
});

// Proxy middleware for all servers
Object.entries(SERVERS).forEach(([serverName, serverUrl]) => {
  app.use(
    `/proxy/${serverName.toLowerCase()}`,
    createProxyMiddleware({
      target: serverUrl,
      changeOrigin: true,
      pathRewrite: {
        [`^/proxy/${serverName.toLowerCase()}`]: '', // Remove the `/proxy/{server}` prefix
      },
      onProxyRes: (proxyRes, req, res) => {
        let data = '';
        proxyRes.on('data', (chunk) => {
          data += chunk;
        });
        proxyRes.on('end', () => {
          // Use Adblocker to filter out ads
          if (adblocker) {
            data = adblocker.filterResponseData(data, {
              url: req.url,
              type: proxyRes.headers['content-type'],
            });
          }
          res.write(data);
          res.end();
        });
      },
    })
  );
});

const getPlayerUrl = (content, server, seasonNumber, episodeNumber) => {
  const type = content.media_type;
  const id = content.id;

  if (type === 'movie') {
    return `/proxy/${server.toLowerCase()}/embed/movie?tmdb=${id}`; // Use the proxy route
  } else if (type === 'tv') {
    const season = seasonNumber || 1;
    const episode = episodeNumber || 1;
    return `/proxy/${server.toLowerCase()}/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`; // Use the proxy route
  }
  return '';
};

app.use(express.static('public'));

app.get('/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  const { season, episode, server = 'VENUS' } = req.query;

  try {
    const response = await axios.get(`${BASE_URL}/movie/${tmdbId}?api_key=${API_KEY}`);
    const content = response.data;

    const playerUrl = getPlayerUrl(content, server, season, episode);
    if (playerUrl) {
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${content.title || content.name}</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              background-color: #000;
            }
            iframe {
              width: 100%;
              height: 100vh;
              border: none;
            }
          </style>
        </head>
        <body>
          <iframe src="${playerUrl}" allowfullscreen></iframe>
        </body>
        </html>
      `);
    } else {
      res.status(404).send('Player URL not found');
    }
  } catch (error) {
    res.status(500).send('Error fetching content from TMDB');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
