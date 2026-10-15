import { createServer } from "node:http";

export function createHealthServer({ isReady, ping }) {
  return createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" || !["/", "/health"].includes(req.url)) {
      res.writeHead(404);
      res.end('{"error":"not_found"}');
      return;
    }
    try {
      if (!isReady()) throw new Error("not_ready");
      await ping();
      res.writeHead(200);
      res.end('{"status":"ok","service":"terre-des-noobs"}');
    } catch {
      res.writeHead(503);
      res.end('{"status":"starting_or_unavailable"}');
    }
  });
}
