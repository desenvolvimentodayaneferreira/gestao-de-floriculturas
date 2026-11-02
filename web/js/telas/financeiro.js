"use strict";

// Financeiro: resultado do mês (quanto sobrou), contas a pagar e despesas.
(() => {
  const { $, $$, esc, api, aviso, dinheiro, dinheiroCurto, pct, hoje, data, tabela, formulario, confirmar, NOMES, baixarCsv, csvDinheiro } = FA;
  let mes = null;

  const nomeMes = (m) => {
    const texto = new Date(`${m}-15T12:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto[0].toUpperCase() + texto.slice(1);
  };
  const somarMes = (m, n) => {
    const [a, mm] = m.split("-").map(Number);
    const d = new Date(a, mm - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // Barras agrupadas: faturamento (claro) x lucro (escuro), últimos 6 meses.
  function graficoHistorico(historico) {
    const largura = 1000;
    const altura = 260;
    const m = { topo: 14, base: 30, esq: 90, dir: 10 };
    const maximo = Math.max(1, ...historico.flatMap((h) => [h.receita, h.lucro]));
    const minimo = Math.min(0, ...historico.map((h) => h.lucro));
    const y = (v) => m.topo + (altura - m.topo - m.base) * (1 - (v - minimo) / (maximo - minimo));
    const passo = (largura - m.esq - m.dir) / historico.length;
    const barra = Math.min(46, passo * 0.3);
    const grade = [0, 0.25, 0.5, 0.75, 1].map((f) => minimo + (maximo - minimo) * f)
      .map((v) => `<line x1="${m.esq}" x2="${largura - m.dir}" y1="${y(v)}" y2="${y(v)}" class="grade"/><text x="${m.esq - 8}" y="${y(v) + 4}" class="eixo" text-anchor="end">${esc(dinheiroCurto(v, true))}</text>`).join("");
    const barras = historico.map((h, i) => {
      const x = m.esq + passo * i + passo / 2;
      const ret = (v, dx, classe) => `<rect x="${x + dx}" y="${Math.min(y(v), y(0))}" width="${barra}" height="${Math.abs(y(0) - y(v))}" rx="4" class="${classe}"><title>${esc(h.rotulo)}: ${esc(dinheiro(v))}</title></rect>`;
      return `${ret(h.receita, -barra - 2, "barra")}${ret(h.lucro, 2, h.lucro >= 0 ? "barra destaque" : "barra negativa")}<text x="${x}" y="${altura - 8}" class="eixo" text-anchor="middle">${esc(h.rotulo)}</text>`;
    }).join("");
    return `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" role="img">${grade}${barras}</svg>
      <p class="legenda"><i class="claro"></i> Faturamento <i class="escuro"></i> Lucro</p>`;
  }

  async function abrir(area) {
    if (!mes) mes = hoje().slice(0, 7);
    const [f, despesas] = await Promise.all([api("GET", `/api/financeiro?mes=${mes}`), api("GET", `/api/despesas?mes=${mes}`)]);
    if (!area.isConnected) return;
    const lucroBruto = f.vendas.receita - f.vendas.custo;
    const margem = f.vendas.receita ? (f.lucro / f.vendas.receita) * 100 : 0;
    const linha = (rotulo, valor, classe = "") => `<div class="${classe}"><span>${rotulo}</span><b>${valor < 0 ? "− " : ""}${dinheiro(Math.abs(valor))}</b></div>`;
    area.innerHTML = `
      <div class="barra-acoes">
        <button class="btn-icone" data-mes="-1" aria-label="Mês anterior">‹</button>
        <h2 class="mes-titulo">${esc(nomeMes(mes))}</h2>
        <button class="btn-icone" data-mes="1" aria-label="Próximo mês">›</button>
        <span class="espaco"></span>
        <button class="btn primario" data-nova>+ Nova despesa</button>
        <button class="btn suave" data-csv>Exportar planilha</button>
      </div>

      <section class="grade g4">
        <div class="cartao indicador"><span>Faturamento</span><strong>${dinheiro(f.vendas.receita)}</strong><small>${f.vendas.quantidade} vendas no mês</small></div>
        <div class="cartao indicador"><span>Custo das flores e materiais</span><strong>${dinheiro(f.vendas.custo)}</strong><small>pelas fichas técnicas</small></div>
        <div class="cartao indicador"><span>Despesas da loja e frota</span><strong>${dinheiro(f.total_despesas + f.total_frota)}</strong><small>aluguel, contas, salários, combustível e entregadores</small></div>
        <div class="cartao indicador ${f.lucro < 0 ? "alerta" : "positivo"}"><span>Lucro do mês</span><strong>${dinheiro(f.lucro)}</strong><small>${pct(margem)} do faturamento</small></div>
      </section>

      <section class="grade g-2-1">
        <div class="cartao">
          <div class="cartao-topo"><h3>Últimos 6 meses</h3></div>
          ${graficoHistorico(f.historico)}
        </div>
        <div class="cartao">
          <div class="cartao-topo"><h3>Resultado do mês</h3></div>
          <div class="lista-simples dre">
            ${linha("Vendas", f.vendas.receita)}
            ${linha("(−) Custo das flores e materiais", -f.vendas.custo)}
            ${linha("= Lucro bruto", lucroBruto, "subtotal")}
            ${f.despesas.map((d) => linha(`(−) ${esc(d.categoria)}`, -d.total)).join("")}
            ${f.frota.combustivel ? linha("(−) Combustível", -f.frota.combustivel) : ""}
            ${f.frota.manutencao ? linha("(−) Manutenção de veículos", -f.frota.manutencao) : ""}
            ${f.frota.entregadores ? linha("(−) Entregadores", -f.frota.entregadores) : ""}
            ${linha("= Lucro do mês", f.lucro, "total")}
          </div>
          <div class="lista-simples dre" style="margin-top:10px">
            <div><span>Compras de flores e materiais pagas no mês</span><b>${dinheiro(f.compras)}</b></div>
            <div class="subtotal"><span>Saldo de caixa do mês (entrou − saiu)</span><b>${f.caixa < 0 ? "− " : ""}${dinheiro(Math.abs(f.caixa))}</b></div>
          </div>
          <p class="sutil" style="margin-top:8px">O lucro usa o custo das flores <i>vendidas</i> (fichas técnicas); as compras de mercadoria aparecem no saldo de caixa. Despesas entram no mês em que foram pagas.</p>
        </div>
      </section>

      <section class="cartao">
        <div class="cartao-topo"><div><h3>Contas a pagar</h3><small>Em aberto até o fim de ${esc(nomeMes(mes))}, incluindo as atrasadas.</small></div><b>${dinheiro(f.a_pagar.reduce((s, d) => s + d.valor, 0))}</b></div>
        ${tabela([
          { titulo: "Vencimento", valor: (d) => data(d.vencimento) },
          { titulo: "Conta", valor: (d) => `<b>${esc(d.descricao)}</b><br><small class="sutil">${esc(d.categoria)}${d.fornecedor ? ` · ${esc(d.fornecedor)}` : ""}</small>` },
          { titulo: "Valor", classe: "numero", valor: (d) => dinheiro(d.valor) },
          { titulo: "", valor: (d) => (d.vencida ? '<span class="etiqueta perigo">Vencida</span>' : d.vence_hoje ? '<span class="etiqueta alerta">Vence hoje</span>' : "") },
          { titulo: "", classe: "acoes", valor: (d) => `<button class="btn pequeno primario" data-pagar="${d.id}">Pagar</button>` },
        ], f.a_pagar, { vazio: "Nenhuma conta em aberto. 🎉" })}
      </section>

      <section class="cartao">
        <div class="cartao-topo"><h3>Despesas de ${esc(nomeMes(mes))}</h3></div>
        ${tabela([
          { titulo: "Vencimento", valor: (d) => data(d.vencimento) },
          { titulo: "Despesa", valor: (d) => `<b>${esc(d.descricao)}</b>${d.fornecedor ? `<br><small class="sutil">${esc(d.fornecedor)}</small>` : ""}` },
          { titulo: "Categoria", valor: (d) => esc(d.categoria) },
          { titulo: "Valor", classe: "numero", valor: (d) => dinheiro(d.valor) },
          { titulo: "Situação", valor: (d) => (d.pago_em ? `<span class="etiqueta ok">Paga ${data(d.pago_em).slice(0, 5)}</span>` : d.vencimento < hoje() ? '<span class="etiqueta perigo">Vencida</span>' : '<span class="etiqueta">A pagar</span>') },
        ], despesas, { vazio: "Nenhuma despesa lançada neste mês.", clicavel: true })}
      </section>`;

    const recarregar = () => abrir(area);
    $$("[data-mes]", area).forEach((b) => b.addEventListener("click", () => {
      mes = somarMes(mes, Number(b.dataset.mes));
      recarregar();
    }));
    $("[data-nova]", area).addEventListener("click", () => form(null, f.categorias, recarregar));
    $$("[data-pagar]", area).forEach((b) => b.addEventListener("click", () => {
      const d = f.a_pagar.find((x) => x.id === Number(b.dataset.pagar));
      formulario({
        titulo: `Pagar: ${d.descricao}`,
        intro: `Valor: <b>${dinheiro(d.valor)}</b> · vencimento ${data(d.vencimento)}`,
        valores: { pago_em: hoje(), forma: "pix", valor: d.valor },
        campos: [
          { nome: "pago_em", rotulo: "Pago em", tipo: "data", obrigatorio: true },
          { nome: "forma", rotulo: "Forma", tipo: "select", vazio: false, opcoes: FA.opcoes(NOMES.pagamento) },
          { nome: "valor", rotulo: "Valor pago (R$)", tipo: "dinheiro", obrigatorio: true, largo: true, ajuda: "Ajuste se pagou com juros ou desconto." },
        ],
        botao: "Confirmar pagamento",
        salvar: async (dados) => {
          await api("PUT", `/api/despesas/${d.id}`, dados);
          aviso("Conta paga.");
          recarregar();
        },
      });
    }));
    $$("tbody tr", $$("section.cartao", area).at(-1)).forEach((tr) => tr.addEventListener("click", () => form(despesas[Number(tr.dataset.indice)], f.categorias, recarregar)));
    $("[data-csv]", area).addEventListener("click", () => baixarCsv(`despesas-${mes}.csv`,
      ["Vencimento", "Despesa", "Categoria", "Fornecedor", "Valor", "Pago em", "Forma"],
      despesas.map((d) => [data(d.vencimento), d.descricao, d.categoria, d.fornecedor, csvDinheiro(d.valor), d.pago_em ? data(d.pago_em) : "", d.forma ? NOMES.pagamento[d.forma] : ""])));
  }

  function form(d, categorias, depois) {
    const dialogo = formulario({
      titulo: d ? "Editar despesa" : "Nova despesa",
      valores: d ? { ...d, paga: Boolean(d.pago_em) } : { vencimento: hoje(), categoria: "Outros", forma: "pix", repetir: "0" },
      campos: [
        { nome: "descricao", rotulo: "Descrição", obrigatorio: true, largo: true, max: 150, placeholder: "Ex.: Aluguel da loja, compra no Ceasa" },
        { nome: "categoria", rotulo: "Categoria", tipo: "select", vazio: false, opcoes: categorias.map((c) => ({ valor: c, rotulo: c })) },
        { nome: "fornecedor", rotulo: "Fornecedor / a quem paga", max: 100 },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true },
        { nome: "vencimento", rotulo: "Vencimento", tipo: "data", obrigatorio: true },
        { nome: "pago_em", rotulo: "Pago em (vazio = a pagar)", tipo: "data" },
        { nome: "forma", rotulo: "Forma de pagamento", tipo: "select", vazio: false, opcoes: FA.opcoes(NOMES.pagamento) },
        ...(d ? [] : [{ nome: "repetir", rotulo: "Repetir nos próximos meses", tipo: "select", vazio: false, opcoes: [{ valor: "0", rotulo: "Não repetir" }, ...[2, 3, 5, 11].map((n) => ({ valor: String(n), rotulo: `Mais ${n} meses (conta fixa)` }))] }]),
        { nome: "observacao", rotulo: "Observação", largo: true, max: 300 },
      ],
      salvar: async (dados) => {
        if (d) await api("PUT", `/api/despesas/${d.id}`, dados);
        else await api("POST", "/api/despesas", { ...dados, repetir: Number(dados.repetir) || 0 });
        aviso("Despesa salva.");
        depois();
      },
    });
    if (d) {
      const excluir = document.createElement("button");
      excluir.type = "button";
      excluir.className = "btn perigo";
      excluir.textContent = "Excluir";
      $("footer", dialogo).prepend(excluir);
      excluir.addEventListener("click", async () => {
        if (!(await confirmar(`Excluir a despesa “${d.descricao}”?`, { botao: "Excluir", perigo: true }))) return;
        await api("DELETE", `/api/despesas/${d.id}`);
        dialogo.close();
        depois();
      });
    }
  }

  FA.telas.financeiro = { subtitulo: "Quanto entrou, quanto saiu e quanto sobrou", abrir };
})();
