// Servidor HTTP mínimo: rotas da API e arquivos da interface. Atende só o próprio computador.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { ErroHttp } = require("./comum");

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2",
};

function criarServidor({ pastaWeb, autenticar }) {
  const rotas = [];

  // opcoes: { publica: true } ou { perm: "codigo" | ["um", "ou outro"] }
  function rota(metodo, padrao, opcoes, manipulador) {
    if (typeof opcoes === "function") [manipulador, opcoes] = [opcoes, {}];
    const nomes = [];
    const regex = new RegExp(`^${padrao.replace(/:(\w+)/g, (_, nome) => { nomes.push(nome); return "([^/]+)"; })}$`);
    rotas.push({ metodo, regex, nomes, opcoes, manipulador });
  }

  function lerCorpo(req) {
    return new Promise((resolve, reject) => {
      let tamanho = 0;
      const partes = [];
      req.on("data", (parte) => {
        tamanho += parte.length;
        if (tamanho > 2 * 1024 * 1024) {
          reject(new ErroHttp(413, "Requisição grande demais."));
          req.destroy();
        } else partes.push(parte);
      });
      req.on("end", () => {
        if (!partes.length) return resolve({});
        try {
          const corpo = JSON.parse(Buffer.concat(partes).toString("utf8"));
          resolve(corpo && typeof corpo === "object" ? corpo : {});
        } catch {
          reject(new ErroHttp(400, "Dados inválidos."));
        }
      });
      req.on("error", reject);
    });
  }

  function responder(res, status, corpo) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(corpo));
  }

  function arquivoEstatico(res, caminho) {
    let relativo;
    try {
      relativo = caminho === "/" ? "index.html" : decodeURIComponent(caminho).replace(/^\/+/, "");
    } catch {
      relativo = "index.html";
    }
    const arquivo = path.resolve(pastaWeb, relativo);
    if (!arquivo.startsWith(pastaWeb + path.sep) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      res.writeHead(200, { "Content-Type": TIPOS[".html"], "Cache-Control": "no-store" });
      return fs.createReadStream(path.join(pastaWeb, "index.html")).pipe(res);
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arquivo)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(arquivo).pipe(res);
  }

  const servidor = http.createServer(async (req, res) => {
    // Só aceita o endereço do próprio computador (evita que páginas da internet conversem com o sistema).
    const host = String(req.headers.host || "").replace(/:\d+$/, "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
      res.writeHead(403);
      return res.end();
    }
    const url = new URL(req.url, "http://floricultura");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!url.pathname.startsWith("/api/")) return arquivoEstatico(res, url.pathname);

    const encontrada = rotas.find((r) => r.metodo === req.method && r.regex.test(url.pathname));
    if (!encontrada) return responder(res, 404, { erro: "Recurso não encontrado." });
    try {
      const valores = encontrada.regex.exec(url.pathname).slice(1);
      const params = Object.fromEntries(encontrada.nomes.map((nome, i) => [nome, decodeURIComponent(valores[i])]));
      let sessao = null;
      if (!encontrada.opcoes.publica) {
        const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        sessao = autenticar(token);
        if (!sessao) throw new ErroHttp(401, "Sessão expirada. Entre novamente.");
        const exigidas = [].concat(encontrada.opcoes.perm || []);
        if (exigidas.length && !exigidas.some((p) => sessao.permissoes.includes(p))) throw new ErroHttp(403, "Seu perfil não tem acesso a esta função.");
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !/^application\/json/i.test(req.headers["content-type"] || "")) {
        throw new ErroHttp(415, "Envie os dados em JSON.");
      }
      const corpo = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? await lerCorpo(req) : {};
      const resultado = await encontrada.manipulador({ params, query: url.searchParams, corpo, sessao, req });
      // Arquivo (ex.: foto de produto): { arquivo: Buffer, tipo }. Nunca executa scripts, mesmo se aberto direto.
      if (Buffer.isBuffer(resultado?.arquivo)) {
        res.writeHead(200, {
          "Content-Type": resultado.tipo, "Content-Length": resultado.arquivo.length, "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "Cache-Control": "private, max-age=31536000, immutable",
        });
        return res.end(resultado.arquivo);
      }
      responder(res, 200, resultado ?? { ok: true });
    } catch (erro) {
      let status = erro.status || 500;
      let mensagem = erro.message;
      if (status === 500 && /UNIQUE constraint failed/.test(erro.message)) [status, mensagem] = [409, "Já existe um cadastro com esse dado."];
      if (status === 500) console.error(erro);
      responder(res, status, { erro: status === 500 ? "Erro interno. Tente novamente." : mensagem });
    }
  });

  return { servidor, rota };
}

module.exports = { criarServidor };
