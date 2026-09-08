/** A loopback-only development server with path traversal checks; no dependencies. */
import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('PORT must be 1–65535.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
    try {
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405, { Allow: 'GET, HEAD' });
            res.end();
            return;
        }
        let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\0'))
            throw Error('Bad path');
        const candidate = resolve(root, '.' + path);
        if (candidate !== root && !candidate.startsWith(root + sep))
            throw Error('Path outside root');
        let file = await realpath(candidate);
        if (file !== root && !file.startsWith(root + sep))
            throw Error('Path outside root');
        if ((await stat(file)).isDirectory())
            file = resolve(file, 'index.html');
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': data.length });
        res.end(req.method === 'HEAD' ? undefined : data);
    }
    catch (e) {
        res.writeHead(e.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain' });
        res.end('Not found or invalid request.');
    }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Orbis: http://127.0.0.1:${port}\nCtrl+C to stop.`));
