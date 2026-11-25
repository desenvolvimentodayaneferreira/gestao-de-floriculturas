// Gera build/icon.ico, build/icon.png e web/assets/icone.png (ícone do programa).
// Uso: npm run icone
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const logo = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, "..", "web", "assets", "logo-esmerarse.png")).toString("base64")}`;

// Ícone da Esmerarse: o E dourado sobre quadrado verde-escuro (#123028) de cantos arredondados.
const pagina = (s) => `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;background:#123028;display:flex;align-items:center;justify-content:center">
      <img src="${logo}" style="height:${s * 0.66}px">
    </div></body></html>`;

async function desenhar(s) {
  const win = new BrowserWindow({ width: s, height: s, useContentSize: true, show: false, frame: false, transparent: true });
  await win.loadURL(`data:text/html;base64,${Buffer.from(pagina(s)).toString("base64")}`);
  await new Promise((r) => setTimeout(r, 400));
  let imagem = await win.webContents.capturePage({ x: 0, y: 0, width: s, height: s });
  win.destroy();
  if (imagem.getSize().width !== s) imagem = imagem.resize({ width: s, height: s, quality: "best" });
  return imagem;
}

// Entrada clássica (bitmap 32 bits) para tamanhos pequenos; PNG para 256.
function bitmapIco(imagem) {
  const { width, height } = imagem.getSize();
  const bgra = imagem.toBitmap();
  const cabecalho = Buffer.alloc(40);
  cabecalho.writeUInt32LE(40, 0);
  cabecalho.writeInt32LE(width, 4);
  cabecalho.writeInt32LE(height * 2, 8);
  cabecalho.writeUInt16LE(1, 12);
  cabecalho.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) bgra.copy(pixels, (height - 1 - y) * width * 4, y * width * 4, (y + 1) * width * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a > 0 && a < 255) for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round((pixels[i + c] * 255) / a));
  }
  return Buffer.concat([cabecalho, pixels, Buffer.alloc(Math.ceil(width / 32) * 4 * height)]);
}

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const entradas = [];
  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    const imagem = await desenhar(s);
    entradas.push({ s, dados: s >= 256 ? imagem.toPNG() : bitmapIco(imagem) });
  }
  const cabecalho = Buffer.alloc(6 + entradas.length * 16);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(entradas.length, 4);
  let deslocamento = cabecalho.length;
  entradas.forEach(({ s, dados }, i) => {
    const o = 6 + i * 16;
    cabecalho[o] = s >= 256 ? 0 : s;
    cabecalho[o + 1] = s >= 256 ? 0 : s;
    cabecalho.writeUInt16LE(1, o + 4);
    cabecalho.writeUInt16LE(32, o + 6);
    cabecalho.writeUInt32LE(dados.length, o + 8);
    cabecalho.writeUInt32LE(deslocamento, o + 12);
    deslocamento += dados.length;
  });
  fs.writeFileSync(path.join(__dirname, "icon.ico"), Buffer.concat([cabecalho, ...entradas.map((e) => e.dados)]));
  fs.writeFileSync(path.join(__dirname, "icon.png"), (await desenhar(512)).toPNG());
  fs.writeFileSync(path.join(__dirname, "..", "web", "assets", "icone.png"), (await desenhar(192)).toPNG());
  console.log("Ícones gerados em build/ e web/assets/icone.png");
  app.quit();
}).catch((erro) => {
  console.error(erro);
  app.exit(1);
});
