#!/usr/bin/env node
/** Static gallery for public/office assets — does not touch the live CLARMY server. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.OFFICE_GALLERY_PORT ?? 3011);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public", "office");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".js": "text/javascript",
};

const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/sprites.html" : req.url?.split("?")[0] ?? "/";
  const file = join(ROOT, path.replace(/^\//, ""));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/sprites.html`;
  console.log(`office gallery → ${url}`);
});