// Servidor local simples para rodar o vídeo da Copa (sem instalar nada além do Node).
// Serve a pasta Projeto_Copa_IA inteira em http://localhost:8000
// Assim o site (em /site) consegue carregar as imagens de /04_Imagens sem
// "sujar" o canvas (o que quebraria a exportação do vídeo).

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = 8000;
const MIME = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png",
  ".webp":"image/webp", ".gif":"image/gif", ".svg":"image/svg+xml",
  ".mp3":"audio/mpeg", ".wav":"audio/wav", ".mp4":"video/mp4", ".webm":"video/webm",
  ".ico":"image/x-icon", ".md":"text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/site/index.html";
    // impede sair da pasta raiz (path traversal)
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("403"); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404, {"Content-Type":"text/plain; charset=utf-8"}); res.end("404 — não encontrado: " + urlPath); return; }
      res.writeHead(200, {"Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream"});
      res.end(data);
    });
  } catch (e) { res.writeHead(500); res.end("500"); }
});

server.listen(PORT, () => {
  const url = "http://localhost:" + PORT + "/site/index.html";
  console.log("\n  ✅ Servidor no ar!  Abra:  " + url + "\n  (Para parar: feche esta janela)\n");
});
