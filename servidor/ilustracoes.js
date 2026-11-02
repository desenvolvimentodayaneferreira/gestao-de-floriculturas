// Ilustrações (SVG) dos produtos da demonstração: buquês, coroas, arranjos e matérias-primas.
// Desenhos próprios, no estilo da marca, para o catálogo não ficar sem imagem antes das fotos reais.

const CORES = {
  vermelha: { base: "#c0392b", claro: "#e35d4f", escuro: "#7f1d17" },
  rose: { base: "#e6a3a0", claro: "#f6c9c3", escuro: "#b8706b" },
  branca: { base: "#f7f1ea", claro: "#ffffff", escuro: "#d8cbbd" },
  lilas: { base: "#b48ac8", claro: "#d5b6e2", escuro: "#7d5591" },
  amarela: { base: "#f1c232", claro: "#f9dc74", escuro: "#b8860b" },
};
const VERDE = "#5f8a55";
const VERDE_ESCURO = "#3f6b3a";

// Sorteio repetível (cada ilustração sai igual sempre).
function sorteador(semente) {
  let s = semente;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const n = (v) => Math.round(v * 10) / 10;

function rosa(cx, cy, r, cor) {
  const c = CORES[cor];
  return `<g>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${c.escuro}"/>
    <circle cx="${n(cx)}" cy="${n(cy - r * 0.04)}" r="${n(r * 0.9)}" fill="${c.base}"/>
    <path d="M${n(cx - r * 0.62)},${n(cy + r * 0.1)} A${n(r * 0.62)},${n(r * 0.6)} 0 1 1 ${n(cx + r * 0.5)},${n(cy + r * 0.42)}" fill="none" stroke="${c.escuro}" stroke-width="${n(r * 0.08)}" stroke-linecap="round" opacity=".7"/>
    <path d="M${n(cx - r * 0.36)},${n(cy + r * 0.08)} A${n(r * 0.38)},${n(r * 0.36)} 0 1 1 ${n(cx + r * 0.3)},${n(cy + r * 0.22)}" fill="none" stroke="${c.escuro}" stroke-width="${n(r * 0.07)}" stroke-linecap="round" opacity=".75"/>
    <path d="M${n(cx - r * 0.14)},${n(cy)} A${n(r * 0.16)},${n(r * 0.15)} 0 1 1 ${n(cx + r * 0.1)},${n(cy + r * 0.08)}" fill="none" stroke="${c.escuro}" stroke-width="${n(r * 0.06)}" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="${n(cx - r * 0.35)}" cy="${n(cy - r * 0.45)}" rx="${n(r * 0.28)}" ry="${n(r * 0.14)}" fill="${c.claro}" opacity=".55" transform="rotate(-30 ${n(cx - r * 0.35)} ${n(cy - r * 0.45)})"/>
  </g>`;
}

function girassol(cx, cy, r) {
  const petalas = Array.from({ length: 16 }, (_, i) => {
    const a = (i * 360) / 16;
    return `<ellipse cx="${n(cx)}" cy="${n(cy - r * 0.62)}" rx="${n(r * 0.2)}" ry="${n(r * 0.42)}" fill="${i % 2 ? "#f1c232" : "#e8a90f"}" transform="rotate(${a} ${n(cx)} ${n(cy)})"/>`;
  }).join("");
  const sementes = Array.from({ length: 14 }, (_, i) => {
    const a = i * 2.4;
    const d = Math.sqrt(i + 0.5) * r * 0.1;
    return `<circle cx="${n(cx + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(r * 0.035)}" fill="#3b2412" opacity=".7"/>`;
  }).join("");
  return `<g>${petalas}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.42)}" fill="#6b3e1e"/>${sementes}</g>`;
}

function lirio(cx, cy, r, girar = 0) {
  const petala = (a, cor) => `<path d="M0,0 C${n(r * 0.3)},${n(-r * 0.35)} ${n(r * 0.18)},${n(-r * 0.85)} 0,${n(-r)} C${n(-r * 0.18)},${n(-r * 0.85)} ${n(-r * 0.3)},${n(-r * 0.35)} 0,0Z" fill="${cor}" stroke="#e7d9cc" stroke-width="1.5" transform="translate(${n(cx)} ${n(cy)}) rotate(${a + girar})"/>`;
  const petalas = [0, 120, 240].map((a) => petala(a + 60, "#f3ece4")).join("") + [0, 120, 240].map((a) => petala(a, "#ffffff")).join("");
  const veios = [0, 120, 240].map((a) => `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx)}" y2="${n(cy - r * 0.55)}" stroke="#e7a8a2" stroke-width="2" transform="rotate(${a + girar} ${n(cx)} ${n(cy)})"/>`).join("");
  const estames = [30, 90, 150, 210, 270, 330].map((a) => {
    const rad = ((a + girar) * Math.PI) / 180;
    return `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx + Math.sin(rad) * r * 0.42)}" y2="${n(cy - Math.cos(rad) * r * 0.42)}" stroke="#a7b56a" stroke-width="1.5"/><circle cx="${n(cx + Math.sin(rad) * r * 0.42)}" cy="${n(cy - Math.cos(rad) * r * 0.42)}" r="${n(r * 0.05)}" fill="#c0702a"/>`;
  }).join("");
  return `<g>${petalas}${veios}${estames}</g>`;
}

function crisantemo(cx, cy, r, cor = "#f2e6c9") {
  const camadas = [[1, 22, cor], [0.7, 18, "#fbf3df"], [0.42, 12, "#f6e7b5"]];
  const petalas = camadas.map(([fator, qtd, c]) => Array.from({ length: qtd }, (_, i) =>
    `<ellipse cx="${n(cx)}" cy="${n(cy - r * fator * 0.62)}" rx="${n(r * 0.09)}" ry="${n(r * fator * 0.4)}" fill="${c}" stroke="#e0d1ad" stroke-width="1" transform="rotate(${(i * 360) / qtd + fator * 7} ${n(cx)} ${n(cy)})"/>`).join("")).join("");
  return `<g>${petalas}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.14)}" fill="#e2c36b"/></g>`;
}

function orquidea(cx, cy, r) {
  const petala = (a, rx, ry, cor) => `<ellipse cx="${n(cx)}" cy="${n(cy - ry * 0.8)}" rx="${n(rx)}" ry="${n(ry)}" fill="${cor}" transform="rotate(${a} ${n(cx)} ${n(cy)})"/>`;
  return `<g>${[0, 72, 144, 216, 288].map((a, i) => petala(a, r * (i % 2 ? 0.42 : 0.3), r * 0.55, i % 2 ? "#c58fd0" : "#d9aee0")).join("")}
    <ellipse cx="${n(cx)}" cy="${n(cy + r * 0.25)}" rx="${n(r * 0.22)}" ry="${n(r * 0.28)}" fill="#8e3c8f"/>
    <circle cx="${n(cx)}" cy="${n(cy - r * 0.05)}" r="${n(r * 0.1)}" fill="#f6e27a"/></g>`;
}

function gipsofila(cx, cy, raio, quantidade, sorteio) {
  return Array.from({ length: quantidade }, () => {
    const a = sorteio() * Math.PI * 2;
    const d = Math.sqrt(sorteio()) * raio;
    return `<circle cx="${n(cx + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(3 + sorteio() * 3)}" fill="#ffffff" stroke="#e8e2da" stroke-width="1"/>`;
  }).join("");
}

function folha(x, y, angulo, comprimento, largura, cor = VERDE) {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angulo)})">
    <path d="M0,0 Q${n(largura)},${n(-comprimento * 0.5)} 0,${n(-comprimento)} Q${n(-largura)},${n(-comprimento * 0.5)} 0,0Z" fill="${cor}"/>
    <line x1="0" y1="0" x2="0" y2="${n(-comprimento * 0.92)}" stroke="${VERDE_ESCURO}" stroke-width="1.6" opacity=".6"/></g>`;
}

function laco(cx, cy, cor, tamanho = 1) {
  const t = tamanho;
  return `<g fill="${cor}" stroke="rgba(0,0,0,.12)" stroke-width="1.5">
    <path d="M${cx},${cy} C${cx - 70 * t},${cy - 45 * t} ${cx - 85 * t},${cy + 25 * t} ${cx},${cy}Z"/>
    <path d="M${cx},${cy} C${cx + 70 * t},${cy - 45 * t} ${cx + 85 * t},${cy + 25 * t} ${cx},${cy}Z"/>
    <path d="M${cx - 6 * t},${cy + 4 * t} L${cx - 38 * t},${cy + 70 * t} L${cx - 22 * t},${cy + 64 * t} L${cx - 14 * t},${cy + 78 * t} L${cx + 2 * t},${cy + 8 * t}Z"/>
    <path d="M${cx + 6 * t},${cy + 4 * t} L${cx + 34 * t},${cy + 72 * t} L${cx + 18 * t},${cy + 66 * t} L${cx + 8 * t},${cy + 80 * t} L${cx - 2 * t},${cy + 8 * t}Z"/>
    <circle cx="${cx}" cy="${cy}" r="${10 * t}"/></g>`;
}

const flor = (tipo, x, y, r, cor, girar) => (tipo === "rosa" ? rosa(x, y, r, cor)
  : tipo === "girassol" ? girassol(x, y, r)
    : tipo === "lirio" ? lirio(x, y, r, girar)
      : tipo === "crisantemo" ? crisantemo(x, y, r)
        : orquidea(x, y, r));

// Posições em círculos concêntricos para um maço de flores.
function maco(cx, cy, quantidade, raioFlor, sorteio) {
  const pontos = [[cx, cy]];
  let anel = 1;
  while (pontos.length < quantidade) {
    const cabem = Math.floor((2 * Math.PI * anel * raioFlor * 1.55) / (raioFlor * 1.6));
    for (let i = 0; i < cabem && pontos.length < quantidade; i++) {
      const a = (i / cabem) * Math.PI * 2 + anel * 0.5;
      pontos.push([cx + Math.cos(a) * anel * raioFlor * 1.55 + (sorteio() - 0.5) * 8, cy + Math.sin(a) * anel * raioFlor * 1.3 + (sorteio() - 0.5) * 8]);
    }
    anel++;
  }
  return pontos.sort((a, b) => a[1] - b[1]);
}

function moldura(conteudo, fundo = "#fdeeea") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <rect width="600" height="600" fill="#fffaf8"/>
    <circle cx="300" cy="300" r="250" fill="${fundo}"/>
    <ellipse cx="300" cy="560" rx="170" ry="16" fill="#000" opacity=".06"/>
    ${conteudo}</svg>`;
}

// ---------- Composições ----------
function buque({ flores, cor = "vermelha", papel = "#f2c7c0", fita = "#b8706b", quantidade = 9, extra = "", semente = 1 }) {
  const sorteio = sorteador(semente);
  const r = quantidade > 9 ? 40 : 46;
  const pontos = maco(300, 215, quantidade, r, sorteio);
  const folhas = Array.from({ length: 9 }, (_, i) => folha(300 + (i - 4) * 22, 320, (i - 4) * 11, 190 + sorteio() * 40, 26)).join("");
  const papelTras = `<path d="M150,190 L300,520 L450,190 Q300,150 150,190Z" fill="${papel}" opacity=".85"/>`;
  const papelFrente = `<path d="M175,300 L300,525 L425,300 Q300,350 175,300Z" fill="${papel}"/><path d="M175,300 L300,525 L240,330Z" fill="#000" opacity=".06"/>`;
  const floresSvg = pontos.map(([x, y], i) => flor(Array.isArray(flores) ? flores[i % flores.length] : flores, x, y, r * (0.9 + sorteio() * 0.2), cor, sorteio() * 60)).join("");
  return moldura(`${papelTras}${folhas}${extra === "gipsofila" ? gipsofila(300, 215, 150, 60, sorteio) : ""}${floresSvg}${papelFrente}${laco(300, 445, fita)}`);
}

function coroa({ semente = 3, grande = false }) {
  const sorteio = sorteador(semente);
  const raio = 175;
  const folhas = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * 360;
    const rad = (a * Math.PI) / 180;
    return folha(300 + Math.cos(rad) * (raio + 25), 290 + Math.sin(rad) * (raio + 25), a + 90 + (i % 2 ? 25 : -25), 70, 18, i % 3 ? VERDE : VERDE_ESCURO);
  }).join("");
  const qtd = grande ? 16 : 13;
  const flores = Array.from({ length: qtd }, (_, i) => {
    const rad = (i / qtd) * Math.PI * 2;
    const tipo = i % 3 === 0 ? "lirio" : i % 3 === 1 ? "crisantemo" : "rosa";
    return flor(tipo, 300 + Math.cos(rad) * raio, 290 + Math.sin(rad) * raio, 38, "branca", sorteio() * 60);
  }).join("");
  const faixa = `<path d="M330,390 L455,560 L420,565 L300,420Z" fill="#7d5591"/><path d="M270,390 L150,560 L185,565 L300,420Z" fill="#8e65a3"/>`;
  return moldura(`${faixa}<circle cx="300" cy="290" r="${raio}" fill="none" stroke="#7b5a36" stroke-width="40" opacity=".25"/>${folhas}${flores}${laco(300, 430, "#7d5591", 0.9)}`, "#efe9f2");
}

function vasoArranjo({ semente = 5 }) {
  const sorteio = sorteador(semente);
  const caules = [250, 280, 300, 320, 350].map((x) => `<line x1="${x}" y1="250" x2="${300 + (x - 300) * 0.3}" y2="540" stroke="${VERDE_ESCURO}" stroke-width="5" opacity=".75"/>`).join("");
  const vaso = `<rect x="235" y="370" width="130" height="185" rx="14" fill="#cfe6ef" opacity=".55" stroke="#9fc4d3" stroke-width="3"/><rect x="235" y="440" width="130" height="115" rx="12" fill="#a9d2e2" opacity=".45"/>`;
  const folhas = [-60, -30, 30, 60].map((a) => folha(300, 330, a, 140, 24)).join("");
  const flores = [[300, 170], [235, 215], [365, 215], [265, 285], [340, 290]].map(([x, y], i) => lirio(x, y, 62, i * 25 + sorteio() * 20)).join("");
  return moldura(`${folhas}${caules}${flores}${vaso}`, "#eef3f4");
}

function cachepo({ cor = "#d98e86", flores = [["rosa", "rose"], ["rosa", "rose"]], semente = 7, baixo = false }) {
  const sorteio = sorteador(semente);
  const pote = baixo
    ? `<path d="M150,400 L450,400 L410,520 Q300,545 190,520Z" fill="${cor}"/><ellipse cx="300" cy="400" rx="150" ry="22" fill="#000" opacity=".1"/>`
    : `<path d="M215,400 L385,400 L365,540 L235,540Z" fill="${cor}"/><rect x="205" y="388" width="190" height="30" rx="8" fill="${cor}" stroke="rgba(0,0,0,.08)" stroke-width="3"/>`;
  const qtd = flores.length;
  const pontos = baixo ? maco(300, 300, qtd, 44, sorteio) : flores.map((_, i) => [300 + (i - (qtd - 1) / 2) * 80, 300 - (i % 2) * 40]);
  const folhas = [-50, -20, 20, 50].map((a) => folha(300, 395, a, 120, 22)).join("");
  return moldura(`${folhas}${gipsofila(300, baixo ? 320 : 290, baixo ? 170 : 120, baixo ? 50 : 35, sorteio)}${pontos.map(([x, y], i) => flor(flores[i][0], x, y, baixo ? 44 : 58, flores[i][1], sorteio() * 40)).join("")}${pote}`);
}

function orquideaVaso() {
  const haste = `<path d="M300,470 C300,330 330,230 430,190" fill="none" stroke="#6b7d3a" stroke-width="6"/><line x1="320" y1="300" x2="290" y2="470" stroke="#8a7a52" stroke-width="4"/>`;
  const flores = [[340, 245, 46], [385, 205, 42], [425, 190, 36], [305, 300, 48]].map(([x, y, r]) => orquidea(x, y, r)).join("");
  const folhas = [folha(300, 470, -70, 150, 40, "#4f7a46"), folha(300, 470, 75, 160, 42, "#5d8a52"), folha(300, 470, -20, 110, 34, "#4f7a46")].join("");
  const pote = `<path d="M225,460 L375,460 L355,550 L245,550Z" fill="#f4f1ec" stroke="#ddd4c8" stroke-width="3"/>`;
  return moldura(`${haste}${folhas}${flores}${pote}`, "#f3ecf5");
}

function solitaria(cor = "vermelha") {
  const celofane = `<path d="M200,120 L300,470 L400,120Z" fill="#e8f2f6" opacity=".55" stroke="#c9dde6" stroke-width="2"/>`;
  return moldura(`${celofane}<line x1="300" y1="200" x2="300" y2="520" stroke="${VERDE_ESCURO}" stroke-width="7"/>${folha(300, 360, -50, 90, 22)}${folha(300, 330, 55, 80, 20)}${rosa(300, 190, 70, cor)}${laco(300, 430, "#c0392b", 0.7)}`);
}

function cartao() {
  return moldura(`<g transform="rotate(-8 300 300)">
    <rect x="160" y="190" width="280" height="200" rx="10" fill="#ffffff" stroke="#e5cbc4" stroke-width="3"/>
    <path d="M300,330 C230,280 250,230 285,245 C295,250 300,262 300,262 C300,262 305,250 315,245 C350,230 370,280 300,330Z" fill="#da9589"/>
    <line x1="200" y1="360" x2="400" y2="360" stroke="#e5cbc4" stroke-width="3"/></g>
    ${rosa(420, 400, 45, "vermelha")}${folha(390, 430, -60, 60, 16)}`);
}

function noiva() {
  const sorteio = sorteador(11);
  const pontos = maco(300, 250, 19, 36, sorteio);
  return moldura(`<path d="M270,330 L285,520 L315,520 L330,330Z" fill="#f4ede3" stroke="#e2d6c6" stroke-width="2"/>
    ${[-55, -25, 25, 55].map((a) => folha(300, 330, a, 110, 18, "#7c9a6e")).join("")}
    ${gipsofila(300, 250, 150, 70, sorteio)}${pontos.map(([x, y]) => rosa(x, y, 36, "branca")).join("")}${laco(300, 420, "#e6a3a0", 0.9)}`, "#f6e1dc");
}

// ---------- Matérias-primas ----------
function haste(tipo, cor) {
  const cabeca = tipo === "rosa" ? rosa(300, 190, 72, cor) : tipo === "girassol" ? girassol(300, 200, 105) : tipo === "lirio" ? lirio(300, 200, 110, 15) : crisantemo(300, 200, 100);
  return moldura(`<line x1="300" y1="210" x2="300" y2="540" stroke="${VERDE_ESCURO}" stroke-width="8"/>${folha(300, 400, -55, 110, 26)}${folha(300, 350, 50, 100, 24)}${cabeca}`);
}

function ruscus() {
  const folhas = Array.from({ length: 12 }, (_, i) => folha(300 + (i % 2 ? 6 : -6), 520 - i * 30, i % 2 ? 50 : -50, 70 - i * 2, 18, i % 3 ? VERDE : VERDE_ESCURO)).join("");
  return moldura(`<path d="M300,540 C300,400 290,250 300,140" stroke="${VERDE_ESCURO}" stroke-width="6" fill="none"/>${folhas}`, "#eef3ea");
}

function gipsofilaMaco() {
  const sorteio = sorteador(13);
  const galhos = Array.from({ length: 14 }, (_, i) => `<line x1="300" y1="520" x2="${180 + i * 18}" y2="${180 + sorteio() * 60}" stroke="#8aa070" stroke-width="2"/>`).join("");
  return moldura(`${galhos}${gipsofila(300, 220, 150, 160, sorteio)}`);
}

function papel() {
  return moldura(`<g transform="rotate(-12 300 300)"><rect x="150" y="170" width="300" height="230" rx="6" fill="#f2c7c0"/><rect x="170" y="190" width="300" height="230" rx="6" fill="#f6d4ce"/><rect x="190" y="210" width="300" height="230" rx="6" fill="#fae3df"/></g>`);
}
function fita() {
  return moldura(`<ellipse cx="300" cy="300" rx="130" ry="130" fill="#c0392b"/><ellipse cx="300" cy="300" rx="55" ry="55" fill="#f6efe8"/><circle cx="300" cy="300" r="130" fill="none" stroke="#7f1d17" stroke-width="4" opacity=".4"/><path d="M420,350 C470,420 430,480 500,520" stroke="#c0392b" stroke-width="22" fill="none" stroke-linecap="round"/>`);
}
function espuma() {
  const furos = Array.from({ length: 15 }, (_, i) => `<circle cx="${210 + (i % 5) * 45}" cy="${255 + Math.floor(i / 5) * 40}" r="5" fill="#3f6b3a" opacity=".5"/>`).join("");
  return moldura(`<path d="M170,250 L300,200 L430,250 L300,300Z" fill="#7bb36d"/><path d="M170,250 L300,300 L300,440 L170,390Z" fill="#5f9a52"/><path d="M430,250 L300,300 L300,440 L430,390Z" fill="#4f8744"/>${furos}`, "#eef3ea");
}
function aro() {
  return moldura(`<circle cx="300" cy="300" r="170" fill="none" stroke="#b08d5a" stroke-width="46"/><circle cx="300" cy="300" r="170" fill="none" stroke="#8a6a3d" stroke-width="46" stroke-dasharray="6 14" opacity=".5"/>`);
}
function vaso() {
  return moldura(`<rect x="220" y="170" width="160" height="330" rx="18" fill="#cfe6ef" opacity=".6" stroke="#9fc4d3" stroke-width="4"/><rect x="220" y="360" width="160" height="140" rx="16" fill="#a9d2e2" opacity=".5"/><rect x="240" y="190" width="18" height="280" rx="9" fill="#ffffff" opacity=".6"/>`, "#eef3f4");
}
function potinho() {
  return moldura(`<path d="M200,270 L400,270 L370,480 L230,480Z" fill="#d98e86"/><rect x="185" y="250" width="230" height="40" rx="10" fill="#e3a49c"/>`);
}

const ILUSTRACOES = {
  "BUQ-12V": () => buque({ flores: "rosa", cor: "vermelha", quantidade: 12, papel: "#f6d4ce", fita: "#c0392b", semente: 2 }),
  "BUQ-PRIM": () => buque({ flores: "rosa", cor: "rose", quantidade: 8, papel: "#fbe3df", fita: "#b8706b", extra: "gipsofila", semente: 4 }),
  "BUQ-GIRA": () => buque({ flores: "girassol", quantidade: 5, papel: "#e9d8c0", fita: "#6b3e1e", semente: 6 }),
  "BUQ-NOIVA": noiva,
  "COR-M": () => coroa({ semente: 3 }),
  "COR-G": () => coroa({ semente: 8, grande: true }),
  "ARR-LIR": () => vasoArranjo({ semente: 5 }),
  "ARR-MESA": () => cachepo({ cor: "#d9c7b4", baixo: true, flores: Array.from({ length: 7 }, (_, i) => ["rosa", i % 2 ? "rose" : "branca"]), semente: 9 }),
  "ARR-MINI": () => cachepo({ cor: "#d98e86", flores: [["rosa", "rose"], ["rosa", "rose"]], semente: 7 }),
  "SOL-01": () => solitaria("vermelha"),
  "ORQ-01": orquideaVaso,
  "SRV-CARTAO": cartao,
  "MAT-ROSA-V": () => haste("rosa", "vermelha"),
  "MAT-ROSA-R": () => haste("rosa", "rose"),
  "MAT-ROSA-B": () => haste("rosa", "branca"),
  "MAT-GIRA": () => haste("girassol"),
  "MAT-LIRIO": () => haste("lirio"),
  "MAT-CRIS": () => haste("crisantemo"),
  "MAT-FOLHA": ruscus,
  "MAT-GIPSO": gipsofilaMaco,
  "MAT-PAPEL": papel,
  "MAT-FITA": fita,
  "MAT-ESPUMA": espuma,
  "MAT-ARO": aro,
  "MAT-VASO": vaso,
  "MAT-CACHE": potinho,
};

// SVG do produto pelo código (SKU), ou null se não houver ilustração.
function ilustracao(sku) {
  const desenho = ILUSTRACOES[String(sku).toUpperCase()];
  return desenho ? desenho().replace(/\s+/g, " ") : null;
}

module.exports = { ilustracao, SKUS_ILUSTRADOS: Object.keys(ILUSTRACOES) };
