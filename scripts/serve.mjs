import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.SERVE_DIST === "1" ? "dist" : ".");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      // Local owner credentials and checkout metadata are never preview assets.
      if (pathname.split(/[\\/]/).some((segment) => segment.startsWith(".")))
        throw new Error("Hidden path");
      let file = path.resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(`${root}${path.sep}`))
        throw new Error("Outside root");
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Local: http://localhost:${port}`),
  );
