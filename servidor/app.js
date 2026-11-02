// Monta o servidor do sistema: banco de dados, rotas e cópias de segurança automáticas.
const fs = require("node:fs");
const path = require("node:path");
const { abrir } = require("./banco");
const { criarServidor } = require("./http");
const { criarAcesso, prepararBase } = require("./acesso");
const { criarCatalogo, UNIDADES } = require("./catalogo");
const { criarVendas } = require("./vendas");
const { criarFrota } = require("./frota");
const { criarPainel } = require("./painel");
const { criarFinanceiro } = require("./financeiro");
const { texto, registrar } = require("./comum");

const VERSAO = require("../package.json").version;
const BACKUPS_MANTIDOS = 60;
const PADRAO_BACKUP = /^floricultura-\d{4}-\d{2}-\d{2}(-\d{6})?\.db$/;

function listarCopias(pasta) {
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta).filter((nome) => PADRAO_BACKUP.test(nome)).sort().reverse()
    .map((nome) => ({ nome, tamanho: fs.statSync(path.join(pasta, nome)).size }));
}

// Uma cópia por dia (guardadas por 60 dias) + cópias feitas na hora pelo botão.
function copiar(banco, pasta, { agora = false } = {}) {
  fs.mkdirSync(pasta, { recursive: true });
  const d = new Date();
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hora = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
  const destino = path.join(pasta, agora ? `floricultura-${dia}-${hora}.db` : `floricultura-${dia}.db`);
  if (!fs.existsSync(destino)) banco.copiar(destino);
  const antigas = fs.readdirSync(pasta).filter((nome) => PADRAO_BACKUP.test(nome)).sort();
  antigas.slice(0, Math.max(0, antigas.length - BACKUPS_MANTIDOS)).forEach((nome) => fs.unlinkSync(path.join(pasta, nome)));
  return destino;
}

function iniciarServidor({ pastaDados, porta = 8686, host = "127.0.0.1", copias = true }) {
  fs.mkdirSync(pastaDados, { recursive: true });
  const banco = abrir(path.join(pastaDados, "floricultura.db"));
  prepararBase(banco);

  const acesso = criarAcesso(banco);
  const { servidor, rota } = criarServidor({ pastaWeb: path.join(__dirname, "..", "web"), autenticar: acesso.autenticar });
  const catalogo = criarCatalogo(banco);

  acesso.rotas(rota);
  catalogo.rotas(rota);
  criarVendas(banco, catalogo).rotas(rota);
  criarFrota(banco).rotas(rota);
  criarPainel(banco).rotas(rota);
  criarFinanceiro(banco).rotas(rota);

  const pastaCopias = path.join(pastaDados, "copias-de-seguranca");

  rota("GET", "/api/sistema", () => ({
    versao: VERSAO,
    loja: banco.config("loja", { nome: "Floricultura Exemplo" }),
    exigir_cpf: banco.config("exigir_cpf", true),
    demonstracao: Boolean(banco.config("demonstracao")),
    unidades: UNIDADES,
  }));

  rota("PUT", "/api/sistema", { perm: "sistema.configurar" }, ({ corpo, sessao }) => {
    if (corpo.loja !== undefined) {
      const nome = texto(corpo.loja, 80);
      if (nome) banco.salvarConfig("loja", { nome });
    }
    if (corpo.exigir_cpf !== undefined) banco.salvarConfig("exigir_cpf", Boolean(corpo.exigir_cpf));
    registrar(banco, sessao, "Configurações alteradas", JSON.stringify(corpo).slice(0, 200));
  });

  rota("GET", "/api/copias", { perm: "sistema.configurar" }, () => ({ pasta: pastaCopias, copias: listarCopias(pastaCopias) }));

  rota("POST", "/api/copias", { perm: "sistema.configurar" }, ({ sessao }) => {
    const destino = copiar(banco, pastaCopias, { agora: true });
    registrar(banco, sessao, "Cópia de segurança", path.basename(destino));
    return { arquivo: path.basename(destino) };
  });

  let temporizador = null;
  if (copias) {
    copiar(banco, pastaCopias);
    temporizador = setInterval(() => {
      try {
        copiar(banco, pastaCopias);
      } catch (erro) {
        console.error("Falha na cópia de segurança:", erro.message);
      }
    }, 60 * 60 * 1000);
  }

  const pronto = new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(porta, host, () => resolve(servidor.address().port));
  });

  return {
    pronto,
    banco,
    pastaCopias,
    arquivoBanco: path.join(pastaDados, "floricultura.db"),
    copiarAgora: () => copiar(banco, pastaCopias, { agora: true }),
    async parar() {
      clearInterval(temporizador);
      await new Promise((resolve) => {
        servidor.closeAllConnections?.();
        servidor.close(() => resolve());
      });
      banco.fechar();
    },
  };
}

module.exports = { iniciarServidor, listarCopias };
