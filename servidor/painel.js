// Painel do dia e relatórios de vendas.
const { exigir, diaLocal, somarDias, diaDaSemana, dataValida } = require("./comum");
const { proximasDatas } = require("./datas");

const SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function criarPainel(banco) {
  const somaVendas = (de, ate) => banco.um(`select coalesce(sum(total), 0) as total, count(*) as quantidade
    from vendas where status = 'finalizada' and dia between ? and ?`, de, ate);

  // Unidades vendidas de uma categoria (pelo nome, ex.: "Buquês") num período.
  const unidadesCategoria = (nome, de, ate) => banco.um(`select coalesce(sum(i.quantidade), 0) as q from venda_itens i
    join vendas v on v.id = i.venda_id join categorias c on c.id = i.categoria_id
    where v.status = 'finalizada' and c.nome = ? and v.dia between ? and ?`, nome, de, ate).q;

  function serie(periodo, hoje) {
    if (periodo === "ano") {
      const ano = hoje.slice(0, 4);
      const linhas = banco.todos(`select substr(dia, 6, 2) as mes, sum(total) as total, count(*) as quantidade from vendas
        where status = 'finalizada' and dia like ? group by mes`, `${ano}-%`);
      return MESES.map((rotulo, i) => {
        const l = linhas.find((x) => Number(x.mes) === i + 1);
        return { rotulo, total: l?.total ?? 0, quantidade: l?.quantidade ?? 0 };
      });
    }
    const inicio = `${hoje.slice(0, 7)}-01`;
    const linhas = banco.todos(`select dia, sum(total) as total, count(*) as quantidade from vendas
      where status = 'finalizada' and dia between ? and ? group by dia`, inicio, hoje);
    const pontos = [];
    for (let dia = inicio; dia <= hoje; dia = somarDias(dia, 1)) {
      const l = linhas.find((x) => x.dia === dia);
      pontos.push({ rotulo: dia.slice(8), total: l?.total ?? 0, quantidade: l?.quantidade ?? 0 });
    }
    return pontos;
  }

  function rotas(rota) {
    rota("GET", "/api/painel", { perm: "painel.ver" }, ({ query, sessao }) => {
      const hoje = diaLocal();
      const inicioMes = `${hoje.slice(0, 7)}-01`;
      const inicioSemana = somarDias(hoje, -diaDaSemana(hoje));
      const mes = somaVendas(inicioMes, hoje);
      // Mesmo período do mês anterior (1º até o mesmo dia), para comparar.
      const [ano, numMes, numDia] = hoje.split("-").map(Number);
      const inicioAnterior = diaLocal(new Date(ano, numMes - 2, 1));
      const fimAnterior = diaLocal(new Date(ano, numMes - 2, Math.min(numDia, new Date(ano, numMes - 1, 0).getDate())));
      const anterior = somaVendas(inicioAnterior, fimAnterior);

      const coroasDe = somarDias(hoje, -89);
      const coroas = SEMANA.map((dia) => ({ dia, quantidade: 0 }));
      for (const l of banco.todos(`select v.dia, sum(i.quantidade) as q from venda_itens i join vendas v on v.id = i.venda_id
          join categorias c on c.id = i.categoria_id where v.status = 'finalizada' and c.nome = 'Coroas' and v.dia between ? and ? group by v.dia`, coroasDe, hoje)) {
        coroas[diaDaSemana(l.dia)].quantidade += l.q;
      }
      const melhor = coroas.reduce((a, b) => (b.quantidade > a.quantidade ? b : a), coroas[0]);

      const entregas = banco.um("select coalesce(sum(quantidade), 0) as quantidade, coalesce(sum(total), 0) as total from fechamentos_entrega where data = ?", hoje);
      const agora = new Date();
      const agoraTexto = `${hoje}T${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
      const limiteAgenda = `${somarDias(hoje, 7)}T23:59`;
      const agenda = [
        ...banco.todos(`select 'encomenda' as origem, e.id, e.entrega_em as quando, c.nome as cliente, e.ocasiao as descricao, e.status, e.endereco
          from encomendas e join clientes c on c.id = e.cliente_id where e.status not in ('entregue', 'cancelada') and e.entrega_em <= ? order by e.entrega_em`, limiteAgenda),
        ...banco.todos(`select 'venda' as origem, v.id, v.combinado_para as quando, v.cliente_nome as cliente, v.recebimento as descricao, v.status, v.endereco_entrega as endereco
          from vendas v where v.status = 'finalizada' and v.combinado_para between ? and ?
            and v.id not in (select venda_id from encomendas where venda_id is not null)`, agoraTexto, limiteAgenda),
      ].sort((a, b) => a.quando.localeCompare(b.quando)).slice(0, 12);

      const mmdd = hoje.slice(5);
      const aniversariantes = banco.todos("select id, nome, telefone, aniversario from clientes where aniversario is not null")
        .map((c) => {
          const proximo = c.aniversario.slice(5) >= mmdd ? `${hoje.slice(0, 4)}-${c.aniversario.slice(5)}` : `${Number(hoje.slice(0, 4)) + 1}-${c.aniversario.slice(5)}`;
          return { ...c, proximo };
        })
        .filter((c) => c.proximo <= somarDias(hoje, 30))
        .sort((a, b) => a.proximo.localeCompare(b.proximo))
        .slice(0, 8);

      const estoqueBaixo = banco.todos(`select p.id, p.nome, p.unidade, p.estoque, p.estoque_minimo from produtos p
        where p.ativo = 1 and p.tipo <> 'servico' and not exists (select 1 from ficha_itens f where f.produto_id = p.id)
        and p.estoque <= p.estoque_minimo order by (p.estoque - p.estoque_minimo), p.nome`);

      return {
        hoje: { dia: hoje, ...somaVendas(hoje, hoje) },
        mes: { ...mes, ticket: mes.quantidade ? Math.round(mes.total / mes.quantidade) : 0, anterior: anterior.total },
        produtos: banco.um("select count(*) as n from produtos where ativo = 1 and tipo <> 'material'").n,
        estoque_baixo: estoqueBaixo,
        buques: {
          hoje: unidadesCategoria("Buquês", hoje, hoje),
          semana: unidadesCategoria("Buquês", inicioSemana, hoje),
          mes: unidadesCategoria("Buquês", inicioMes, hoje),
        },
        coroas: { dias: 90, por_dia: coroas, melhor: melhor.quantidade > 0 ? melhor : null },
        serie: serie(query.get("periodo") === "ano" ? "ano" : "mes", hoje),
        entregas_hoje: { ...entregas, valor_medio: entregas.quantidade ? Math.round(entregas.total / entregas.quantidade) : 0 },
        frota_mes: {
          combustivel: banco.um("select coalesce(sum(valor), 0) as v from abastecimentos where data >= ?", inicioMes).v,
          manutencao: banco.um("select coalesce(sum(valor), 0) as v from manutencoes where status = 'realizada' and data >= ?", inicioMes).v,
        },
        agenda: agenda.map((a) => ({ ...a, atrasada: a.origem === "encomenda" && a.quando < agoraTexto })),
        aniversariantes,
        datas: proximasDatas(hoje, 45),
        contas: sessao.permissoes.includes("financeiro.gerenciar")
          ? banco.um("select count(*) as quantidade, coalesce(sum(valor), 0) as total, coalesce(sum(vencimento < ?), 0) as vencidas from despesas where pago_em is null and vencimento <= ?", hoje, somarDias(hoje, 7))
          : null,
      };
    });

    rota("GET", "/api/relatorios/vendas", { perm: "vendas.ver" }, ({ query }) => {
      const hoje = diaLocal();
      const de = query.get("de") || `${hoje.slice(0, 7)}-01`;
      const ate = query.get("ate") || hoje;
      exigir(dataValida(de) && dataValida(ate), "Período inválido.");
      exigir(de <= ate, "A data inicial deve ser antes da final.");
      const filtro = "v.status = 'finalizada' and v.dia between ? and ?";
      const totais = banco.um(`select count(*) as quantidade, coalesce(sum(total), 0) as total, coalesce(sum(subtotal), 0) as produtos,
          coalesce(sum(desconto), 0) as descontos, coalesce(sum(taxa_entrega), 0) as taxas, coalesce(sum(custo), 0) as custo
        from vendas v where ${filtro}`, de, ate);
      const agrupar = (campo) => banco.todos(`select ${campo} as chave, count(*) as quantidade, sum(total) as total from vendas v where ${filtro} group by ${campo} order by total desc`, de, ate);
      return {
        de, ate,
        totais: {
          ...totais,
          ticket: totais.quantidade ? Math.round(totais.total / totais.quantidade) : 0,
          margem: totais.produtos - totais.descontos - totais.custo,
        },
        canceladas: banco.um("select count(*) as quantidade, coalesce(sum(total), 0) as total from vendas v where v.status = 'cancelada' and v.dia between ? and ?", de, ate),
        por_pagamento: agrupar("pagamento"),
        por_canal: agrupar("canal"),
        por_recebimento: agrupar("recebimento"),
        por_categoria: banco.todos(`select coalesce(c.nome, 'Sem categoria') as chave, sum(i.quantidade) as quantidade, sum(round(i.quantidade * i.preco_unit)) as total
          from venda_itens i join vendas v on v.id = i.venda_id left join categorias c on c.id = i.categoria_id where ${filtro} group by chave order by total desc`, de, ate),
        produtos: banco.todos(`select i.produto_id, i.nome, sum(i.quantidade) as quantidade, sum(round(i.quantidade * i.preco_unit)) as total,
            sum(round(i.quantidade * i.custo_unit)) as custo
          from venda_itens i join vendas v on v.id = i.venda_id where ${filtro} group by i.produto_id, i.nome order by total desc limit 30`, de, ate),
        por_dia: banco.todos(`select dia, count(*) as quantidade, sum(total) as total from vendas v where ${filtro} group by dia order by dia`, de, ate),
      };
    });
  }

  return { rotas };
}

module.exports = { criarPainel };
