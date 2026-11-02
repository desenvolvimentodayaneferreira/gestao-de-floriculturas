// Funções usadas por todas as partes do servidor: validação, datas locais, CPF e auditoria.

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const exigir = (condicao, mensagem, status = 400) => {
  if (!condicao) throw new ErroHttp(status, mensagem);
};

const texto = (valor, limite = 300) => String(valor ?? "").trim().slice(0, limite);
const soNumeros = (valor) => String(valor ?? "").replace(/\D/g, "");

// Centavos: aceita número inteiro (já em centavos). Nunca negativo.
function centavos(valor, rotulo = "Valor") {
  if (valor === undefined || valor === null || valor === "") return 0;
  const n = Number(valor);
  exigir(Number.isInteger(n) && n >= 0, `${rotulo} inválido.`);
  exigir(n <= 100000000, `${rotulo} alto demais.`);
  return n;
}

// Quantidade com até 3 casas decimais.
function quantidade(valor, rotulo = "Quantidade", { positiva = true } = {}) {
  const n = Number(valor);
  exigir(Number.isFinite(n), `${rotulo} inválida.`);
  exigir(positiva ? n > 0 : n >= 0, positiva ? `${rotulo} deve ser maior que zero.` : `${rotulo} não pode ser negativa.`);
  exigir(Math.abs(n) <= 1e7, `${rotulo} alta demais.`);
  return arredondar(n);
}
const arredondar = (n) => Math.round(n * 1000) / 1000;

// Datas sempre no horário do computador da loja.
const doisDigitos = (n) => String(n).padStart(2, "0");
function diaLocal(data = new Date()) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}
function somarDias(dia, dias) {
  const [a, m, d] = dia.split("-").map(Number);
  return diaLocal(new Date(a, m - 1, d + dias));
}
// 0 = segunda ... 6 = domingo
function diaDaSemana(dia) {
  const [a, m, d] = dia.split("-").map(Number);
  return (new Date(a, m - 1, d).getDay() + 6) % 7;
}
function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  return data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === d;
}
function dataHoraValida(valor) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(String(valor || ""));
  return Boolean(m && dataValida(m[1]) && Number(m[2]) < 24 && Number(m[3]) < 60);
}

// CPF: 11 números com dígitos verificadores corretos.
function cpfValido(valor) {
  const cpf = soNumeros(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) return false;
  }
  return true;
}

function registrar(banco, sessao, acao, detalhe = "") {
  banco.exec("insert into auditoria (usuario_id, usuario_nome, acao, detalhe, criado_em) values (?, ?, ?, ?, ?)",
    sessao?.usuario.id ?? null, sessao?.usuario.nome ?? "Sistema", acao, String(detalhe).slice(0, 500), Date.now());
}

const umDe = (valor, opcoes, mensagem) => {
  const v = String(valor ?? "").toLowerCase();
  exigir(opcoes.includes(v), mensagem);
  return v;
};

module.exports = {
  ErroHttp, exigir, texto, soNumeros, centavos, quantidade, arredondar,
  diaLocal, somarDias, diaDaSemana, dataValida, dataHoraValida, cpfValido, registrar, umDe,
};
