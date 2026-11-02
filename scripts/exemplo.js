// Preenche ./dados-dev com a floricultura de demonstração (testes visuais com `npm run servidor`).
// Uso: npm run exemplo            (só cria se a pasta estiver vazia)
//      npm run exemplo -- --apagar (apaga ./dados-dev antes)
// Acesso: botão "Entrar na demonstração" na tela de entrada, ou o usuário de scripts/dados-de-teste.md
const fs = require("node:fs");
const path = require("node:path");
const { iniciarServidor } = require("../servidor/app");
const { preencherDemonstracao } = require("../servidor/demonstracao");

const pasta = process.env.FLORICULTURA_DADOS || path.join(__dirname, "..", "dados-dev");
if (process.argv.includes("--apagar")) fs.rmSync(pasta, { recursive: true, force: true });
if (fs.existsSync(path.join(pasta, "floricultura.db"))) {
  console.error(`Já existem dados em ${pasta}. Use "npm run exemplo -- --apagar" para recriar.`);
  process.exit(1);
}

(async () => {
  const app = iniciarServidor({ pastaDados: pasta, porta: 0, copias: false });
  const inicio = Date.now();
  await preencherDemonstracao({ base: `http://127.0.0.1:${await app.pronto}`, banco: app.banco, usuario: "dayane", senha: "Flores2026" });
  await app.parar();
  console.log(`Exemplo criado em ${pasta} (${((Date.now() - inicio) / 1000).toFixed(1)} s).`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
