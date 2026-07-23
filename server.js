const { createServer } = require('http');
const { parse } = require('url');
const { readFile, stat } = require('fs').promises;
const { join } = require('path');

const PORT = 3000;
const NEXT_DIR = join(__dirname, '.next');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function handleRequest(req, res) {
  const parsedUrl = parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Remove trailing slash
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Default to index.html for root
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Handle _next/static files
  if (pathname.startsWith('/_next/static/')) {
    const filePath = join(NEXT_DIR, pathname);
    await serveFile(filePath, req, res);
    return;
  }

  // Handle other static files
  const filePath = join(NEXT_DIR, 'static', pathname.slice(1));
  await serveFile(filePath, req, res);
}

async function serveFile(filePath, req, res) {
  try {
    const ext = filePath.match(/\.[^.]+$/)?.[0] || '.html';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Try index.html for SPA routing
      try {
        const indexPath = join(NEXT_DIR, 'server', 'app', 'index.html');
        const content = await readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
      }
    } else {
      res.writeHead(500);
      res.end('Server Error');
    }
  }
}

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`CRM System running at http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
});
