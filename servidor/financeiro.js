// Financeiro: despesas e contas a pagar, e o resultado do mês (vendas − custo das flores − despesas − frota).
const { exigir, texto, centavos, diaLocal, dataValida, registrar, umDe } = require("./comum");
const { PAGAMENTOS } = require("./vendas");

const CATEGORIAS = ["Flores e plantas (fornecedor)", "Embalagens e materiais", "Aluguel", "Energia e água", "Internet e telefone", "Salários e comissões", "Impostos e taxas", "Marketing", "Manutenção da loja", "Outros"];
// Compras de mercadoria: o custo delas já entra no resultado pelas fichas técnicas (custo das flores vendidas),
// então não são descontadas de novo no lucro; aparecem no fluxo de caixa.
const MERCADORIA = CATEGORIAS.slice(0, 2);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const mesValido = (mes) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ""));
function somarMeses(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Mesmo dia em outro mês (31/01 + 1 mês = 28/02).
function mesmoDia(dia, meses) {
  const [a, m, d] = dia.split("-").map(Number);
  const ultimo = new Date(a, m - 1 + meses + 1, 0).getDate();
  return diaLocal(new Date(a, m - 1 + meses, Math.min(d, ultimo)));
}

function criarFinanceiro(banco) {
  function resultado(mes) {
    const filtro = `${mes}-%`;
    const vendas = banco.um(`select count(*) as quantidade, coalesce(sum(total), 0) as receita, coalesce(sum(subtotal - desconto), 0) as produtos,
        coalesce(sum(taxa_entrega), 0) as taxas, coalesce(sum(custo), 0) as custo from vendas where status = 'finalizada' and dia like ?`, filtro);
    const despesas = banco.todos("select categoria, sum(valor) as total from despesas where pago_em like ? group by categoria order by total desc", filtro);
    const frota = {
      combustivel: banco.um("select coalesce(sum(valor), 0) as v from abastecimentos where data like ?", filtro).v,
      manutencao: banco.um("select coalesce(sum(valor), 0) as v from manutencoes where status = 'realizada' and data like ?", filtro).v,
      entregadores: banco.um("select coalesce(sum(total), 0) as v from fechamentos_entrega where data like ?", filtro).v,
    };
    const operacionais = despesas.filter((d) => !MERCADORIA.includes(d.categoria));
    const compras = despesas.filter((d) => MERCADORIA.includes(d.categoria)).reduce((s, d) => s + d.total, 0);
    const totalDespesas = operacionais.reduce((s, d) => s + d.total, 0);
    const totalFrota = frota.combustivel + frota.manutencao + frota.entregadores;
    return {
      mes, vendas, despesas: operacionais, frota, compras,
      total_despesas: totalDespesas,
      total_frota: totalFrota,
      lucro: vendas.receita - vendas.custo - totalDespesas - totalFrota,
      // Dinheiro que entrou menos tudo o que saiu (inclui as compras de flores e materiais).
      caixa: vendas.receita - totalDespesas - compras - totalFrota,
    };
  }

  function dadosDespesa(corpo, atual = {}) {
    const descricao = texto(corpo.descricao ?? atual.descricao, 150);
    exigir(descricao, "Descreva a despesa (ex.: Aluguel da loja).");
    const valor = centavos(corpo.valor ?? atual.valor, "Valor");
    exigir(valor > 0, "Informe o valor.");
    const vencimento = corpo.vencimento ?? atual.vencimento;
    exigir(dataValida(vencimento), "Informe a data de vencimento.");
    const pagoEm = corpo.pago_em === undefined ? atual.pago_em ?? null : corpo.pago_em || null;
    exigir(!pagoEm || dataValida(pagoEm), "Data de pagamento inválida.");
    return {
      descricao, valor, vencimento, pago_em: pagoEm,
      categoria: texto(corpo.categoria ?? atual.categoria, 60) || "Outros",
      fornecedor: texto(corpo.fornecedor ?? atual.fornecedor, 100),
      forma: pagoEm ? umDe(corpo.forma ?? atual.forma ?? "pix", PAGAMENTOS, "Forma de pagamento inválida.") : null,
      observacao: texto(corpo.observacao ?? atual.observacao, 300),
    };
  }

  function rotas(rota) {
    rota("GET", "/api/financeiro", { perm: "financeiro.gerenciar" }, ({ query }) => {
      const hoje = diaLocal();
      const mes = mesValido(query.get("mes")) ? query.get("mes") : hoje.slice(0, 7);
      const fimMes = `${mes}-31`;
      const historico = [];
      for (let i = 5; i >= 0; i--) {
        const r = resultado(somarMeses(mes, -i));
        const [a, m] = r.mes.split("-");
        historico.push({ mes: r.mes, rotulo: `${MESES[Number(m) - 1]}/${a.slice(2)}`, receita: r.vendas.receita, lucro: r.lucro, gastos: r.vendas.custo + r.total_despesas + r.total_frota });
      }
      return {
        ...resultado(mes),
        historico,
        a_pagar: banco.todos("select * from despesas where pago_em is null and vencimento <= ? order by vencimento", fimMes)
          .map((d) => ({ ...d, vencida: d.vencimento < hoje, vence_hoje: d.vencimento === hoje })),
        categorias: CATEGORIAS,
      };
    });

    rota("GET", "/api/despesas", { perm: "financeiro.gerenciar" }, ({ query }) => {
      const mes = mesValido(query.get("mes")) ? query.get("mes") : diaLocal().slice(0, 7);
      return banco.todos(`select d.*, u.nome as usuario from despesas d left join usuarios u on u.id = d.usuario_id
        where d.vencimento like ? or d.pago_em like ? order by d.vencimento, d.id`, `${mes}-%`, `${mes}-%`);
    });

    // repetir: cria a mesma conta nos próximos meses (aluguel, internet...).
    rota("POST", "/api/despesas", { perm: "financeiro.gerenciar" }, ({ corpo, sessao }) => {
      const d = dadosDespesa(corpo);
      const repetir = Math.max(0, Math.min(11, Number(corpo.repetir) || 0));
      const ids = banco.transacao(() => {
        const criados = [];
        for (let i = 0; i <= repetir; i++) {
          const r = banco.exec(`insert into despesas (descricao, categoria, fornecedor, valor, vencimento, pago_em, forma, observacao, usuario_id, criado_em)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, d.descricao, d.categoria, d.fornecedor, d.valor, mesmoDia(d.vencimento, i),
          i === 0 ? d.pago_em : null, i === 0 ? d.forma : null, d.observacao, sessao.usuario.id, Date.now());
          criados.push(Number(r.lastInsertRowid));
        }
        return criados;
      });
      registrar(banco, sessao, "Nova despesa", `${d.descricao} · R$ ${(d.valor / 100).toFixed(2)}${repetir ? ` · ${repetir + 1} meses` : ""}`);
      return { ids };
    });

    rota("PUT", "/api/despesas/:id", { perm: "financeiro.gerenciar" }, ({ params, corpo, sessao }) => {
      const atual = banco.um("select * from despesas where id = ?", Number(params.id));
      exigir(atual, "Despesa não encontrada.", 404);
      const d = dadosDespesa(corpo, atual);
      banco.exec("update despesas set descricao = ?, categoria = ?, fornecedor = ?, valor = ?, vencimento = ?, pago_em = ?, forma = ?, observacao = ? where id = ?",
        d.descricao, d.categoria, d.fornecedor, d.valor, d.vencimento, d.pago_em, d.forma, d.observacao, atual.id);
      registrar(banco, sessao, d.pago_em && !atual.pago_em ? "Conta paga" : "Despesa alterada", `${d.descricao} · R$ ${(d.valor / 100).toFixed(2)}`);
    });

    rota("DELETE", "/api/despesas/:id", { perm: "financeiro.gerenciar" }, ({ params, sessao }) => {
      const atual = banco.um("select * from despesas where id = ?", Number(params.id));
      exigir(atual, "Despesa não encontrada.", 404);
      banco.exec("delete from despesas where id = ?", atual.id);
      registrar(banco, sessao, "Despesa excluída", `${atual.descricao} · R$ ${(atual.valor / 100).toFixed(2)}`);
    });
  }

  return { rotas, resultado };
}

module.exports = { criarFinanceiro, CATEGORIAS };
