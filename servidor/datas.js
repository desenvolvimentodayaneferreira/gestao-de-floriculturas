// Datas comemorativas que movimentam uma floricultura no Brasil, com dica de preparo.
const { diaLocal } = require("./comum");

// n-ésimo domingo do mês (mês 1–12)
function domingo(ano, mes, n) {
  const primeiro = new Date(ano, mes - 1, 1);
  const deslocamento = (7 - primeiro.getDay()) % 7;
  return diaLocal(new Date(ano, mes - 1, 1 + deslocamento + (n - 1) * 7));
}

const DATAS = [
  { nome: "Dia Internacional da Mulher", quando: (a) => `${a}-03-08`, dica: "Rosas avulsas e mini buquês: deixe opções prontas para vender rápido no balcão." },
  { nome: "Dia das Mães", quando: (a) => domingo(a, 5, 2), dica: "A data mais forte do ano: reforce rosas, orquídeas e cestas; abra encomendas com 2 semanas de antecedência." },
  { nome: "Dia dos Namorados", quando: (a) => `${a}-06-12`, dica: "Buquês de rosas vermelhas e cartões: confirme o estoque de rosas e a escala de entregas." },
  { nome: "Dia dos Avós", quando: (a) => `${a}-07-26`, dica: "Arranjos delicados e plantas em vaso costumam sair bem." },
  { nome: "Dia dos Pais", quando: (a) => domingo(a, 8, 2), dica: "Plantas, suculentas e kits presenteáveis." },
  { nome: "Dia da Secretária", quando: (a) => `${a}-09-30`, dica: "Pedidos corporativos: ofereça às empresas clientes com antecedência." },
  { nome: "Dia dos Professores", quando: (a) => `${a}-10-15`, dica: "Flores avulsas e mini arranjos para escolas e pais de alunos." },
  { nome: "Finados", quando: (a) => `${a}-11-02`, dica: "Coroas, crisântemos e arranjos para túmulos: reforce bases, crisântemos e fitas." },
  { nome: "Natal", quando: (a) => `${a}-12-25`, dica: "Arranjos natalinos, bico-de-papagaio e presentes corporativos." },
];

// Próximas datas dentro de `dias` dias, com a contagem regressiva.
function proximasDatas(hoje = diaLocal(), dias = 45) {
  const ano = Number(hoje.slice(0, 4));
  const base = new Date(`${hoje}T12:00:00`);
  return [ano, ano + 1]
    .flatMap((a) => DATAS.map((d) => ({ nome: d.nome, dica: d.dica, dia: d.quando(a) })))
    .map((d) => ({ ...d, faltam: Math.round((new Date(`${d.dia}T12:00:00`) - base) / 864e5) }))
    .filter((d) => d.faltam >= 0 && d.faltam <= dias)
    .sort((a, b) => a.faltam - b.faltam);
}

module.exports = { proximasDatas };
