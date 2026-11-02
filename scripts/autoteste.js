// Autoteste do programa: abre o Gestão de Floriculturas com dados temporários (primeiro acesso), confere servidor, banco e tela, e fecha.
// Uso: npm run autoteste                                  (código-fonte)
//      npm run autoteste -- "caminho\Gestão de Floriculturas.exe"  (programa instalado)
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const alvo = process.argv[2];
fs.rmSync(path.join(os.tmpdir(), "floricultura-autoteste"), { recursive: true, force: true });
const env = { ...process.env, FLORICULTURA_AUTOTESTE: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const filho = spawn(alvo || require("electron"), alvo ? [] : [raiz], { cwd: raiz, env });
let saida = "";
filho.stdout.on("data", (d) => (saida += d));
filho.stderr.on("data", (d) => (saida += d));
const limite = setTimeout(() => {
  filho.kill();
  console.error("ERRO: o programa não respondeu em 90 segundos.");
  process.exit(1);
}, 90000);
filho.on("exit", () => {
  clearTimeout(limite);
  const linha = saida.split(/\r?\n/).find((l) => l.startsWith("AUTOTESTE "));
  if (!linha) {
    console.error(`ERRO: autoteste não terminou.\n${saida.slice(-1500)}`);
    process.exit(1);
  }
  const r = JSON.parse(linha.slice(10));
  console.log(JSON.stringify(r, null, 2));
  const ok = !r.falha && r.porta && r.estado?.configurado === false && r.tela === "Primeiro acesso" && r.perfis === 5 && r.copias >= 1;
  console.log(ok ? "AUTOTESTE OK" : "AUTOTESTE FALHOU");
  process.exit(ok ? 0 : 1);
});
