const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const DIR = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath;

  // Serve /img/ from parent directory (assets live in CyclingHub/img/)
  if (urlPath.startsWith('/img/')) {
    filePath = path.join(DIR, '..', urlPath);
  } else {
    filePath = path.join(DIR, urlPath === '/' ? 'index.html' : urlPath);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`PromoSite server running at http://localhost:${PORT}`);
});
