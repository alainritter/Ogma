import { createServer, request } from 'http';
import { getPreviewTarget } from './kanbanTasks.js';

/**
 * Forwards every request to the last started Kanban preview so phones can open it.
 * Targets are loopback only (see startPreview), the proxy binds to loopback only;
 * remote access goes exclusively through Pforte (Authelia, admins).
 * Own port instead of a path prefix: dev servers use absolute paths (/src, /@vite).
 * No WebSocket upgrade, so HMR is off over the proxy.
 */
export function startPreviewProxy(port: number) {
  const server = createServer((req, res) => {
    const target = getPreviewTarget();
    if (!target) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Keine Vorschau aktiv – im Kanban starten');
      return;
    }
    const proxyReq = request(
      {
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      proxyRes => {
        const headers = { ...proxyRes.headers };
        if (headers.location?.startsWith(target.origin)) {
          headers.location = headers.location.slice(target.origin.length) || '/';
        }
        res.writeHead(proxyRes.statusCode ?? 502, headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Vorschau nicht erreichbar');
    });
    req.pipe(proxyReq);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Kanban preview proxy: http://127.0.0.1:${port}`);
  });
  server.on('error', err => console.error('Preview proxy failed:', err));
}
