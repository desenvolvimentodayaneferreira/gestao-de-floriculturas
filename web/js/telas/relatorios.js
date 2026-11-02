"use strict";

// Relatórios: faturamento, margem estimada, formas de pagamento, canais, categorias e produtos mais vendidos.
(() => {
  const { $, $$, esc, api, dinheiro, dinheiroCurto, qtd, pct, hoje, somarDias, data, dataCurta, grafico, tabela, NOMES, baixarCsv, csvDinheiro } = FA;
  let periodo = null;

  function atalhos() {
    const h = hoje();
    const inicioMes = `${h.slice(0, 7)}-01`;
    const fimMesPassado = somarDias(inicioMes, -1);
    return {
      hoje: ["Hoje", h, h],
      semana: ["7 dias", somarDias(h, -6), h],
      mes: ["Este mês", inicioMes, h],
      passado: ["Mês passado", `${fimMesPassado.slice(0, 7)}-01`, fimMesPassado],
      ano: ["Este ano", `${h.slice(0, 4)}-01-01`, h],
    };
  }

  const barrasH = (linhas, nomes) => {
    if (!linhas.length) return '<div class="vazio-linha">Sem vendas no período.</div>';
    const maximo = Math.max(...linhas.map((l) => l.total));
    return `<div class="barras-h">${linhas.map((l) => `<div><span>${esc(nomes ? nomes[l.chave] || l.chave : l.chave)}</span><i style="width:${Math.max(1, (l.total / maximo) * 100)}%"></i><b>${dinheiro(l.total)}</b></div>`).join("")}</div>`;
  };

  async function abrir(area) {
    if (!periodo) periodo = { de: atalhos().mes[1], ate: atalhos().mes[2] };
    const r = await api("GET", `/api/relatorios/vendas?de=${periodo.de}&ate=${periodo.ate}`);
    if (!area.isConnected) return;
    const t = r.totais;
    const receitaProdutos = t.produtos - t.descontos;
    area.innerHTML = `
      <section class="cartao">
        <div class="barra-acoes">
          <div class="chips">${Object.entries(atalhos()).map(([id, [rotulo, de, ate]]) => `<button class="chip ${periodo.de === de && periodo.ate === ate ? "ativo" : ""}" data-atalho="${id}">${rotulo}</button>`).join("")}</div>
          <span class="espaco"></span>
          <label>De<input type="date" name="de" value="${periodo.de}"/></label>
          <label>Até<input type="date" name="ate" value="${periodo.ate}"/></label>
          <button class="btn" data-aplicar style="align-self:flex-end">Ver</button>
          <button class="btn suave" data-imprimir style="align-self:flex-end">Imprimir</button>
        </div>
      </section>
      <p class="sutil">Período: <b>${data(r.de)}</b> a <b>${data(r.ate)}</b>. Vendas canceladas não entram nos totais.</p>
      <section class="grade g4">
        <div class="cartao indicador"><span>Faturamento</span><strong>${dinheiro(t.total)}</strong><small>${t.quantidade} vendas · ticket médio ${dinheiro(t.ticket)}</small></div>
        <div class="cartao indicador"><span>Custo dos produtos</span><strong>${dinheiro(t.custo)}</strong><small>pelas fichas técnicas e custos cadastrados</small></div>
        <div class="cartao indicador"><span>Margem estimada</span><strong>${dinheiro(t.margem)}</strong><small>${receitaProdutos ? pct((t.margem / receitaProdutos) * 100) : "—"} da venda dos produtos</small></div>
        <div class="cartao indicador"><span>Descontos e taxas</span><strong>${dinheiro(t.descontos)}</strong><small>em descontos · ${dinheiro(t.taxas)} em taxas de entrega</small></div>
      </section>
      ${r.canceladas.quantidade ? `<p class="destaque-texto">${r.canceladas.quantidade} venda(s) cancelada(s) no período, somando ${dinheiro(r.canceladas.total)}.</p>` : ""}
      <section class="cartao">
        <div class="cartao-topo"><h3>Vendas por dia</h3></div>
        ${r.por_dia.length ? grafico(r.por_dia.map((d) => ({ rotulo: dataCurta(d.dia), valor: d.total })), { formato: dinheiroCurto }) : '<div class="vazio-linha">Sem vendas no período.</div>'}
      </section>
      <section class="grade g3">
        <div class="cartao"><div class="cartao-topo"><h3>Formas de pagamento</h3></div>${barrasH(r.por_pagamento, NOMES.pagamento)}</div>
        <div class="cartao"><div class="cartao-topo"><h3>Canais de atendimento</h3></div>${barrasH(r.por_canal, NOMES.canal)}<br>${barrasH(r.por_recebimento, NOMES.recebimento)}</div>
        <div class="cartao"><div class="cartao-topo"><h3>Categorias</h3></div>${barrasH(r.por_categoria)}</div>
      </section>
      <section class="cartao">
        <div class="cartao-topo"><h3>Produtos mais vendidos</h3><button class="btn pequeno suave" data-csv>Exportar planilha</button></div>
        ${tabela([
          { titulo: "Produto", valor: (p) => esc(p.nome) },
          { titulo: "Quantidade", classe: "numero", valor: (p) => qtd(p.quantidade) },
          { titulo: "Vendido", classe: "numero", valor: (p) => dinheiro(p.total) },
          { titulo: "Custo", classe: "numero", valor: (p) => dinheiro(p.custo) },
          { titulo: "Margem", classe: "numero", valor: (p) => (p.total ? pct(((p.total - p.custo) / p.total) * 100) : "—") },
        ], r.produtos, { vazio: "Sem vendas no período." })}
      </section>`;

    $$("[data-atalho]", area).forEach((b) => b.addEventListener("click", () => {
      const [, de, ate] = atalhos()[b.dataset.atalho];
      periodo = { de, ate };
      abrir(area);
    }));
    $("[data-aplicar]", area).addEventListener("click", () => {
      periodo = { de: $('[name="de"]', area).value, ate: $('[name="ate"]', area).value };
      abrir(area).catch((erro) => FA.aviso(erro.message, "erro"));
    });
    $("[data-imprimir]", area).addEventListener("click", () => window.print());
    $("[data-csv]", area).addEventListener("click", () => baixarCsv(`produtos-vendidos-${r.de}-a-${r.ate}.csv`,
      ["Produto", "Quantidade", "Vendido", "Custo", "Margem"],
      r.produtos.map((p) => [p.nome, String(p.quantidade).replace(".", ","), csvDinheiro(p.total), csvDinheiro(p.custo), csvDinheiro(p.total - p.custo)])));
  }

  FA.telas.relatorios = { subtitulo: "Faturamento, margem e o que mais vende", abrir };
})();
