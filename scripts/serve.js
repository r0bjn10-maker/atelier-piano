import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
// Test the same URL shape as GitHub Pages without copying the project.
const basePath = `/${(process.env.BASE_PATH || '').split('/').filter(Boolean).join('/')}/`.replace('//', '/');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (basePath !== '/' && pathname === basePath.slice(0, -1)) { res.writeHead(301, { Location:basePath }).end(); return; }
    if (!pathname.startsWith(basePath)) { res.writeHead(404).end(); return; }
    let path = resolve(root, pathname.slice(basePath.length) || '.');
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Atelier piano: http://localhost:${port}${basePath}\nOn iPad, use this computer's LAN IP on the same Wi-Fi. Use HTTPS for offline/PWA installation.`));
