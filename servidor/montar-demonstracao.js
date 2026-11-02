// Monta a floricultura de demonstração numa pasta, em um processo separado (a janela do programa não trava).
// Uso: node servidor/montar-demonstracao.js <pasta>   — avisa o andamento (0–100) ao processo que o chamou.
const fs = require("node:fs");
const { iniciarServidor } = require("./app");
const { preencherDemonstracao } = require("./demonstracao");

const pasta = process.argv[2];
const avisar = (mensagem) => {
  if (process.parentPort) process.parentPort.postMessage(mensagem); // processo auxiliar do Electron
  else if (process.send) process.send(mensagem);
};

(async () => {
  if (!pasta) throw new Error("Informe a pasta.");
  fs.rmSync(pasta, { recursive: true, force: true });
  const app = iniciarServidor({ pastaDados: pasta, porta: 0, copias: false });
  const porta = await app.pronto;
  await preencherDemonstracao({ base: `http://127.0.0.1:${porta}`, banco: app.banco, progresso: (p) => avisar({ progresso: p }) });
  await app.parar();
  avisar({ progresso: 100, pronto: true });
  setTimeout(() => process.exit(0), 300); // dá tempo de a mensagem chegar
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
