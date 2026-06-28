const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8443;
const ROOT = path.join(__dirname, 'dist');
const BASE_URL = `http://localhost:${PORT}`;
const PREVIEW_SW = `
self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(
        self.registration.unregister().then(() => self.clients.matchAll({ type: 'window' })).then(clients => {
            clients.forEach(client => client.navigate(client.url));
        })
    );
});
`;

const MIME_TYPES = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.cur': 'application/octet-stream',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8',
};

const sendFile = (response, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    response.writeHead(200, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': contentType,
        Pragma: 'no-cache',
    });

    fs.createReadStream(filePath).pipe(response);
};

const sendText = (response, content, contentType) => {
    response.writeHead(200, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': contentType,
        Pragma: 'no-cache',
    });
    response.end(content);
};

const sendNotFound = response => {
    response.writeHead(404, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end('Not found');
};

const resolveRequestPath = requestUrl => {
    const url = new URL(requestUrl, BASE_URL);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/') {
        pathname = '/index.html';
    }

    const absolutePath = path.normalize(path.join(ROOT, pathname));
    if (!absolutePath.startsWith(ROOT)) {
        return null;
    }

    return { absolutePath, pathname };
};

const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', BASE_URL);

    if (requestUrl.pathname === '/api/deriv/options/contracts-for') {
        request.query = Object.fromEntries(requestUrl.searchParams.entries());
        require('./api/deriv/options/contracts-for')(request, response);
        return;
    }

    const resolved = resolveRequestPath(request.url || '/');
    if (!resolved) {
        sendNotFound(response);
        return;
    }

    const { absolutePath, pathname } = resolved;

    if (pathname === '/sw.js') {
        sendText(response, PREVIEW_SW, 'application/javascript; charset=utf-8');
        return;
    }

    fs.stat(absolutePath, (fileError, stats) => {
        if (!fileError && stats.isFile()) {
            sendFile(response, absolutePath);
            return;
        }

        const looksLikeAsset = path.extname(pathname) !== '';
        const fallbackPath = path.join(ROOT, 'index.html');

        if (looksLikeAsset) {
            sendNotFound(response);
            return;
        }

        fs.stat(fallbackPath, (fallbackError, fallbackStats) => {
            if (fallbackError || !fallbackStats.isFile()) {
                sendNotFound(response);
                return;
            }

            sendFile(response, fallbackPath);
        });
    });
});

server.listen(PORT, () => {
    process.stdout.write(`Preview server running at http://localhost:${PORT}\n`);
});
