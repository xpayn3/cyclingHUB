/**
 * Local dev proxy for the cycling app (Node.js — no dependencies).
 * - Serves static files from this directory at http://localhost:8080/
 * - Proxies /icu-internal/*     -> https://intervals.icu/api/*
 * - Proxies /strava-internal/*  -> https://www.strava.com/api/v3/*
 * - Proxies /strava-auth/*      -> https://www.strava.com/oauth/*   (POST)
 *
 * Usage:  node proxy.js
 * Then open: http://localhost:8080
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/** Forward a request to an upstream HTTPS server and pipe the response back. */
function proxyRequest(method, targetUrl, headers, body, res) {
  const url = new URL(targetUrl);
  const opts = {
    hostname: url.hostname,
    port:     443,
    path:     url.pathname + url.search,
    method:   method,
    headers:  headers,
    timeout:  30000,
  };
  const upstream = https.request(opts, (upRes) => {
    const chunks = [];
    upRes.on('data', c => chunks.push(c));
    upRes.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.writeHead(upRes.statusCode, Object.assign({
        'Content-Type':   upRes.headers['content-type'] || 'application/json',
        'Content-Length':  buf.length,
      }, CORS));
      res.end(buf);
    });
  });
  upstream.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, CORS);
      res.end();
    }
  });
  upstream.on('timeout', () => { upstream.destroy(); });
  if (body) upstream.write(body);
  upstream.end();
}

/** Collect the full request body as a Buffer. */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const fullUrl = req.url;

  // --- CORS preflight ---
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // --- Proxy: /icu-internal/* -> intervals.icu ---
  if (fullUrl.startsWith('/icu-internal/')) {
    const tail   = fullUrl.slice('/icu-internal/'.length);
    const target = 'https://intervals.icu/api/' + tail;
    proxyRequest('GET', target, {
      'Authorization': req.headers['authorization'] || '',
      'Accept': 'application/json',
    }, null, res);
    return;
  }

  // --- Proxy: /strava-internal/* -> Strava API (GET) ---
  if (fullUrl.startsWith('/strava-internal/')) {
    const tail   = fullUrl.slice('/strava-internal/'.length);
    const target = 'https://www.strava.com/api/v3/' + tail;
    proxyRequest('GET', target, {
      'Authorization': req.headers['authorization'] || '',
      'Accept': 'application/json',
    }, null, res);
    return;
  }

  // --- Strava Auth: POST /strava-auth/* -> Strava OAuth ---
  if (fullUrl.startsWith('/strava-auth/') && req.method === 'POST') {
    const tail   = fullUrl.slice('/strava-auth/'.length);
    const target = 'https://www.strava.com/oauth/' + tail;
    const body   = await readBody(req);
    proxyRequest('POST', target, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Content-Length': body.length,
    }, body, res);
    return;
  }

  // --- Static file serving ---
  let filePath = urlPath === '/' ? path.join(ROOT, 'index.html')
                                 : path.join(ROOT, urlPath.replace(/^\//, ''));

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const ct  = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct, 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Prevent server crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught:', err.message);
});

server.listen(PORT, () => {
  console.log(`Cycling app running at  http://localhost:${PORT}/`);
  console.log(`Proxying /icu-internal/*     -> https://intervals.icu/api/*`);
  console.log(`Proxying /strava-internal/*  -> https://www.strava.com/api/v3/*`);
  console.log(`Proxying /strava-auth/*      -> https://www.strava.com/oauth/*`);
  console.log('Press Ctrl+C to stop.\n');
});
