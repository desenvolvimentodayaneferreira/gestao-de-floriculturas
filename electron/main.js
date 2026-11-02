// Programa Gestão de Floriculturas para Windows: liga o servidor local (só neste computador) e abre a janela.
// Sem Docker, sem Python, sem internet: os dados ficam em %APPDATA%\Gestão de Floriculturas\dados.
const { app, BrowserWindow, dialog, shell, ipcMain, Menu, utilityProcess } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const { iniciarServidor } = require("../servidor/app");
const { ehBancoFloricultura } = require("../servidor/banco");
const { diaLocal } = require("../servidor/comum");

const AUTOTESTE = process.env.FLORICULTURA_AUTOTESTE;
const CAPTURAS = process.env.FLORICULTURA_CAPTURAS; // pasta onde salvar imagens das telas (desenvolvimento)
if (AUTOTESTE) app.setPath("userData", path.join(app.getPath("temp"), "floricultura-autoteste"));
else if (process.env.FLORICULTURA_USERDATA) app.setPath("userData", process.env.FLORICULTURA_USERDATA); // testes sem tocar nos dados reais

const PORTAS = [8686, 8687, 8688, 8689, 0];

// Registro de erros (para suporte): arquivo registro.log na pasta de dados do programa (até ~1 MB).
function registrarErro(origem, detalhe) {
  try {
    const arquivo = path.join(app.getPath("userData"), "registro.log");
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).size > 1024 * 1024) fs.renameSync(arquivo, `${arquivo}.antigo`);
    fs.appendFileSync(arquivo, `[${new Date().toLocaleString("pt-BR")}] ${origem}: ${detalhe}
`);
    if (process.env.FLORICULTURA_DEPURAR) console.log(`ERRO ${origem}: ${detalhe}`);
  } catch { /* sem disco: ignora */ }
}
process.on("uncaughtException", (erro) => registrarErro("programa", erro.stack || erro.message));
process.on("unhandledRejection", (erro) => registrarErro("programa", erro?.stack || String(erro)));
let janela = null;
let montagem = null; // processo que está montando a demonstração
let servidor = null;
let porta = null;

// Modo demonstração: dados fictícios numa pasta separada; os dados reais da loja não são tocados.
const arquivoModo = () => path.join(app.getPath("userData"), "modo.json");
function lerModo() {
  try {
    return JSON.parse(fs.readFileSync(arquivoModo(), "utf8"));
  } catch {
    return {};
  }
}
let demonstracao = !AUTOTESTE && !process.env.FLORICULTURA_DADOS && Boolean(lerModo().demonstracao);
const pastaDemonstracao = () => path.join(app.getPath("userData"), "demonstracao");
const pastaDados = () => process.env.FLORICULTURA_DADOS || (demonstracao ? pastaDemonstracao() : path.join(app.getPath("userData"), "dados"));

async function ligarServidor() {
  for (const tentativa of PORTAS) {
    try {
      servidor = iniciarServidor({ pastaDados: pastaDados(), porta: tentativa, copias: !demonstracao });
      porta = await servidor.pronto;
      return;
    } catch (erro) {
      await servidor?.parar().catch(() => {});
      servidor = null;
      if (erro.code !== "EADDRINUSE") throw erro;
    }
  }
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "Gestão de Floriculturas",
    backgroundColor: "#fdfcfe",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "web", "assets", "icone.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  // Links externos (WhatsApp) abrem no navegador; nada de janelas novas dentro do programa.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  janela.webContents.on("will-navigate", (evento, url) => {
    if (!url.startsWith(`http://127.0.0.1:${porta}/`)) evento.preventDefault();
  });
  janela.webContents.on("console-message", (evento) => {
    const nivel = evento.level ?? evento.params?.level;
    if (nivel === "error" || nivel === 3) registrarErro("tela", `${evento.message ?? evento.params?.message} (${evento.sourceId ?? ""}:${evento.lineNumber ?? ""})`);
  });
  janela.webContents.on("render-process-gone", (_e, detalhes) => registrarErro("tela", `processo da tela parou: ${detalhes.reason}`));
  janela.on("unresponsive", () => registrarErro("tela", "a janela parou de responder"));
  janela.once("ready-to-show", () => {
    if (process.env.FLORICULTURA_OCULTO) return; // testes automáticos
    if (!AUTOTESTE && !CAPTURAS) janela.maximize();
    janela.show();
  });
}

function criarMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Gestão de Floriculturas",
      submenu: [
        { label: "Recarregar", accelerator: "F5", click: () => janela?.webContents.reload() },
        { label: "Tela cheia", accelerator: "F11", click: () => janela?.setFullScreen(!janela.isFullScreen()) },
        { type: "separator" },
        { label: "Modo demonstração (dados fictícios)", type: "checkbox", checked: demonstracao, click: (item) => trocarDemonstracao(item.checked) },
        { label: "Recriar a demonstração com a data de hoje", enabled: demonstracao, click: () => trocarDemonstracao(true, { recriar: true }) },
        { type: "separator" },
        { label: "Fazer cópia de segurança agora", click: copiarAgora },
        { label: "Abrir pasta das cópias de segurança", click: abrirPastaCopias },
        { label: "Restaurar uma cópia de segurança…", click: restaurarCopia },
        { type: "separator" },
        { label: "Sair", role: "quit" },
      ],
    },
    { label: "Editar", submenu: [{ role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" }, { type: "separator" }, { role: "cut", label: "Recortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Colar" }, { role: "selectAll", label: "Selecionar tudo" }] },
    { label: "Exibir", submenu: [{ role: "zoomIn", label: "Aumentar letras" }, { role: "zoomOut", label: "Diminuir letras" }, { role: "resetZoom", label: "Tamanho normal" }] },
  ]));
}

function copiarAgora() {
  try {
    const arquivo = servidor.copiarAgora();
    dialog.showMessageBox(janela, { type: "info", title: "Cópia de segurança", message: "Cópia feita.", detail: arquivo });
  } catch (erro) {
    dialog.showErrorBox("Não foi possível fazer a cópia", erro.message);
  }
}

function abrirPastaCopias() {
  fs.mkdirSync(servidor.pastaCopias, { recursive: true });
  shell.openPath(servidor.pastaCopias);
}

// Troca os dados atuais por uma cópia. Antes, guarda uma cópia do estado atual (dá para desfazer).
async function restaurarCopia() {
  if (demonstracao) {
    dialog.showMessageBox(janela, { type: "info", title: "Modo demonstração", message: "Saia do modo demonstração para restaurar cópias dos dados da loja." });
    return;
  }
  const escolha = await dialog.showOpenDialog(janela, {
    title: "Escolha a cópia de segurança",
    defaultPath: servidor.pastaCopias,
    filters: [{ name: "Cópia do sistema", extensions: ["db"] }],
    properties: ["openFile"],
  });
  if (escolha.canceled || !escolha.filePaths[0]) return;
  const origem = escolha.filePaths[0];
  if (!ehBancoFloricultura(origem)) {
    dialog.showErrorBox("Arquivo inválido", "Este arquivo não é uma cópia de segurança do sistema.");
    return;
  }
  const confirmar = dialog.showMessageBoxSync(janela, {
    type: "warning",
    buttons: ["Cancelar", "Restaurar"],
    defaultId: 0,
    cancelId: 0,
    title: "Restaurar cópia",
    message: `Voltar os dados para a cópia “${path.basename(origem)}”?`,
    detail: "Tudo o que foi registrado depois desta cópia deixa de aparecer. Antes de restaurar, o Gestão de Floriculturas guarda uma cópia do estado atual na mesma pasta, para você poder desfazer.",
  });
  if (confirmar !== 1) return;
  const temporaria = path.join(app.getPath("temp"), `floricultura-restaurar-${Date.now()}.db`);
  try {
    fs.copyFileSync(origem, temporaria); // a origem pode estar dentro da pasta de cópias, que continua em uso
    const antes = servidor.copiarAgora();
    const arquivo = servidor.arquivoBanco;
    await servidor.parar();
    servidor = null;
    for (const extra of ["-wal", "-shm"]) fs.rmSync(arquivo + extra, { force: true });
    fs.copyFileSync(temporaria, arquivo);
    await ligarServidor();
    await janela.loadURL(`http://127.0.0.1:${porta}/`);
    dialog.showMessageBox(janela, { type: "info", title: "Cópia restaurada", message: "Dados restaurados. Entre novamente.", detail: `O estado anterior foi guardado em ${path.basename(antes)}.` });
  } catch (erro) {
    dialog.showErrorBox("Não foi possível restaurar", erro.message);
    if (!servidor) await ligarServidor().then(() => janela.loadURL(`http://127.0.0.1:${porta}/`)).catch(() => app.quit());
  } finally {
    fs.rmSync(temporaria, { force: true });
  }
}

// Tela de espera (com barra de andamento quando a demonstração está sendo montada).
const telaEspera = (texto, barra = false) => janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head>
  <body style="margin:0;height:100vh;display:grid;place-items:center;background:#fdfcfe;font:18px 'Segoe UI',sans-serif;color:#3a2160">
  <div style="text-align:center;width:420px"><div style="font:600 32px Georgia,serif;margin-bottom:12px">Gestão de Floriculturas</div>${texto}
  ${barra ? '<div style="margin-top:22px;height:10px;border-radius:99px;background:#f6dcd6;overflow:hidden"><div id="progresso" style="height:100%;width:3%;border-radius:99px;background:linear-gradient(90deg,#552f80,#8a5fc0);transition:width .4s"></div></div><p style="font-size:13px;color:#6f6a78">Isso só acontece uma vez por dia.</p>' : ""}
  </div></body></html>`)}`);

// Monta a demonstração num processo separado e numa pasta nova; só troca a antiga quando terminar.
function montarDemonstracao(destino) {
  return new Promise((resolve, reject) => {
    const nova = `${destino}-nova`;
    const filho = utilityProcess.fork(path.join(__dirname, "..", "servidor", "montar-demonstracao.js"), [nova], { stdio: "pipe" });
    let saida = "";
    let pronto = false;
    montagem = filho;
    filho.stderr?.on("data", (d) => (saida += d));
    filho.on("message", (m) => {
      if (m?.pronto) pronto = true;
      if (typeof m?.progresso === "number" && janela && !janela.isDestroyed()) {
        janela.webContents.executeJavaScript(`(document.getElementById("progresso") || {}).style && (document.getElementById("progresso").style.width = "${Math.max(3, m.progresso)}%")`).catch(() => {});
      }
    });
    filho.on("exit", async (codigo) => {
      montagem = null;
      if (codigo !== 0 || !pronto) {
        registrarErro("demonstração", saida.slice(-1500) || `interrompida (código ${codigo})`);
        return reject(new Error("Não foi possível montar a demonstração."));
      }
      // Troca segura: a antiga só é apagada depois que a nova está no lugar.
      // O Windows pode segurar os arquivos por um instante depois que o processo termina: tenta de novo.
      const antiga = `${destino}-antiga`;
      for (let tentativa = 0; ; tentativa++) {
        try {
          fs.rmSync(antiga, { recursive: true, force: true });
          if (fs.existsSync(destino)) fs.renameSync(destino, antiga);
          try {
            fs.renameSync(nova, destino);
          } catch (erro) {
            if (fs.existsSync(antiga) && !fs.existsSync(destino)) fs.renameSync(antiga, destino);
            throw erro;
          }
          fs.rmSync(antiga, { recursive: true, force: true });
          return resolve();
        } catch (erro) {
          if (tentativa >= 20) {
            registrarErro("demonstração", erro.message);
            return reject(erro);
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    });
  });
}

function demonstracaoDeHoje(arquivo) {
  let db;
  try {
    db = new DatabaseSync(arquivo, { readOnly: true });
    const linha = db.prepare("select valor from config where chave = 'demonstracao'").get();
    return Boolean(linha) && JSON.parse(linha.valor).criada_em === diaLocal();
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

// Liga/desliga o modo demonstração. A demonstração é recriada quando foi montada em outro dia,
// para "hoje", "amanhã" e as encomendas sempre baterem com a data da apresentação.
async function trocarDemonstracao(ligar, { recriar = false } = {}) {
  demonstracao = ligar;
  fs.writeFileSync(arquivoModo(), JSON.stringify({ demonstracao: ligar }));
  try {
    await telaEspera(ligar ? "Abrindo a demonstração…" : "Voltando para os dados da loja…");
    await servidor?.parar().catch(() => {});
    servidor = null;
    await prepararDemonstracao(recriar);
    if (!servidor) await ligarServidor();
    criarMenu();
    janela.setTitle(demonstracao ? "Gestão de Floriculturas — demonstração" : "Gestão de Floriculturas");
    await janela.webContents.session.clearStorageData({ storages: ["localstorage"] });
    await janela.loadURL(`http://127.0.0.1:${porta}/`);
  } catch (erro) {
    dialog.showErrorBox("Não foi possível trocar o modo", erro.message);
  }
}

// Deixa a demonstração pronta (montada hoje) e liga o servidor nela. Chamar com o servidor desligado.
async function prepararDemonstracao(recriar = false) {
  if (!demonstracao) return;
  if (recriar || !demonstracaoDeHoje(path.join(pastaDemonstracao(), "floricultura.db"))) {
    await telaEspera("Preparando a demonstração com as datas de hoje…", true);
    await montarDemonstracao(pastaDemonstracao());
  }
  await ligarServidor();
}

ipcMain.handle("floricultura:demonstracao", (_e, ligar) => trocarDemonstracao(Boolean(ligar)));
ipcMain.handle("floricultura:abrir-pasta-copias", () => abrirPastaCopias());
ipcMain.handle("floricultura:restaurar-copia", () => restaurarCopia());

async function iniciar() {
  criarMenu();
  criarJanela();
  try {
    if (demonstracao) await prepararDemonstracao();
    if (!servidor) await ligarServidor();
  } catch (erro) {
    dialog.showErrorBox("O sistema não pôde iniciar", erro.message);
    app.quit();
    return;
  }
  if (demonstracao) janela.setTitle("Gestão de Floriculturas — demonstração");
  await janela.loadURL(`http://127.0.0.1:${porta}/`);
  if (AUTOTESTE) autoteste();
  if (CAPTURAS) capturas();
}

// Abre o programa com dados temporários, confere servidor, banco e tela, e fecha (npm run autoteste).
async function autoteste() {
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const estado = await (await fetch(`http://127.0.0.1:${porta}/api/estado`)).json();
    const tela = await janela.webContents.executeJavaScript("document.querySelector('.entrada-form h2')?.textContent || document.body.innerText.slice(0, 80)");
    const imagem = await janela.webContents.capturePage();
    const arquivo = path.join(app.getPath("temp"), "floricultura-autoteste.png");
    fs.writeFileSync(arquivo, imagem.toPNG());
    console.log(`AUTOTESTE ${JSON.stringify({ porta, url: janela.webContents.getURL(), estado, tela, perfis: servidor.banco.um("select count(*) as n from perfis").n, copias: fs.readdirSync(servidor.pastaCopias).length, captura: arquivo })}`);
  } catch (erro) {
    console.log(`AUTOTESTE ${JSON.stringify({ falha: erro.message })}`);
  }
  app.quit();
}

// Gera imagens das telas com os dados de exemplo (desenvolvimento): FLORICULTURA_CAPTURAS=pasta FLORICULTURA_DADOS=dados-dev
async function capturas() {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (codigo) => janela.webContents.executeJavaScript(codigo);
  const salvar = async (nome) => {
    await espera(1800);
    fs.writeFileSync(path.join(CAPTURAS, `${nome}.png`), (await janela.webContents.capturePage()).toPNG());
  };
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    janela.setContentSize(1440, 900);
    await js("localStorage.clear(); location.hash = ''; location.reload()");
    await salvar("01-entrada");
    const [usuario, senha] = (process.env.FLORICULTURA_ACESSO || "").split(":");
    await js(`(async () => { const demo = document.querySelector('[data-entrar-demo]'); if (demo) return demo.click(); const f = document.querySelector('form.entrada-form'); f.elements.usuario.value = ${JSON.stringify(usuario || "")}; f.elements.senha.value = ${JSON.stringify(senha || "")}; f.requestSubmit(); })()`);
    await espera(3000);
    janela.webContents.setZoomFactor(0.72); // cabe mais da tela em cada imagem
    const telas = ["vendas", "encomendas", "catalogo", "producao", "painel", "frota", "clientes", "fichas", "estoque", "financeiro", "relatorios", "acessos", "config"];
    let n = 2;
    for (const tela of telas) {
      await js(`location.hash = '#/${tela}'`);
      await salvar(`${String(n++).padStart(2, "0")}-${tela}`);
    }
    await js("location.hash = '#/painel'; window.scrollTo(0, 0)");
    await espera(1500);
    await js("window.scrollTo(0, document.body.scrollHeight)");
    await salvar(`${String(n++).padStart(2, "0")}-painel-parte-de-baixo`);
    await js("location.hash = '#/producao'");
    await espera(1500);
    await js("window.scrollTo(0, document.body.scrollHeight)");
    await salvar(`${String(n++).padStart(2, "0")}-producao-compras-e-roteiro`);
    console.log(`CAPTURAS ${CAPTURAS}`);
  } catch (erro) {
    console.error(erro);
  }
  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });
  app.whenReady().then(iniciar);
  app.on("window-all-closed", async () => {
    montagem?.kill();
    await servidor?.parar().catch(() => {});
    app.quit();
  });
}
