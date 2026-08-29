import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_FILES = new Set([
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/sw.js",
  "/config.js"
]);
const PUBLIC_PREFIXES = ["/assets/", "/src/", "/vendor/"];
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org https://*.googleapis.com https://*.gstatic.com; script-src 'self' https://maps.googleapis.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://tile.openstreetmap.org https://*.googleapis.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
}

function publicPathname(url = "/") {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname === "/") return "/index.html";
  if (!PUBLIC_FILES.has(pathname) && !PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return pathname;
}

export function createStaticServer({ root = APP_ROOT } = {}) {
  return createServer((request, response) => {
    const headers = securityHeaders();
    if (request.url === "/healthz") {
      response.writeHead(200, { ...headers, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
      response.end();
      return;
    }

    const pathname = publicPathname(request.url);
    if (!pathname) {
      response.writeHead(404, headers);
      response.end("Not Found");
      return;
    }
    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`)) {
      response.writeHead(404, headers);
      response.end("Not Found");
      return;
    }
    try {
      const stats = statSync(filePath);
      if (!stats.isFile()) throw new Error("Not a file");
      const cacheControl = pathname === "/index.html" || pathname === "/sw.js" || pathname === "/config.js"
        ? "no-cache"
        : "public, max-age=3600";
      response.writeHead(200, {
        ...headers,
        "Cache-Control": cacheControl,
        "Content-Length": stats.size,
        "Content-Type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream"
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, headers);
      response.end("Not Found");
    }
  });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);
  createStaticServer().listen(port, "0.0.0.0", () => {
    console.log(`Safety navigation app listening on port ${port}`);
  });
}
