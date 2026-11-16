// Servidor local (solo para desarrollo). En Vercel NO se usa.
// Ejecuta:  node server.js   y abre http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/analizar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga .env sin dependencias
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };

http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/analizar")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        // Adaptador mínimo a la interfaz req/res de Vercel
        res.status = (c) => ((res.statusCode = c), res);
        res.json = (o) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(o));
        };
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
        handler(req, res);
      });
      return;
    }
    const file = path.join(__dirname, "public", req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(path.join(__dirname, "public")) || !fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end("No encontrado");
    }
    res.setHeader("Content-Type", TIPOS[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  })
  .listen(3000, () => console.log("Listo → http://localhost:3000"));
