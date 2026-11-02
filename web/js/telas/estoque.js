"use strict";

// Estoque: posição atual, entradas (compras), saídas, perdas, contagem e histórico de movimentos.
(() => {
  const { $, $$, esc, api, aviso, dinheiro, qtd, dataHora, tabela, formulario, janela, normalizar, NOMES, pode } = FA;
  let soBaixo = false;
  let busca = "";

  async function abrir(area) {
    const [produtos, movimentos] = await Promise.all([api("GET", "/api/produtos"), api("GET", "/api/estoque/movimentos?limite=60")]);
    if (!area.isConnected) return;
    const controlados = produtos.filter((p) => p.tipo !== "servico" && !p.ficha_itens);
    const valorTotal = controlados.reduce((s, p) => s + Math.max(0, p.estoque) * p.custo, 0);
    const baixos = controlados.filter((p) => p.estoque <= p.estoque_minimo);
    area.innerHTML = `
      <section class="grade g3">
        <div class="cartao indicador"><span>Itens controlados</span><strong>${controlados.length}</strong><small>matérias-primas e produtos prontos</small></div>
        <div class="cartao indicador ${baixos.length ? "alerta" : ""}"><span>Abaixo do mínimo</span><strong>${baixos.length}</strong><small>${baixos.length ? "precisam de reposição" : "tudo em ordem"}</small></div>
        <div class="cartao indicador"><span>Valor em estoque</span><strong>${dinheiro(valorTotal)}</strong><small>pelo custo de cada item</small></div>
      </section>
      <section class="cartao">
        <div class="barra-acoes" style="margin-bottom:12px">
          <input class="busca" name="busca" value="${esc(busca)}" placeholder="Buscar item" autocomplete="off"/>
          <label class="check"><input type="checkbox" data-baixo ${soBaixo ? "checked" : ""}/> <span>Só abaixo do mínimo</span></label>
          ${pode("estoque.movimentar") ? '<button class="btn primario" data-movimento>Registrar entrada / saída</button>' : ""}
        </div>
        <div data-lista></div>
        <p class="sutil" style="margin-top:10px">Produtos montados pela ficha técnica não têm estoque próprio: a venda tira os materiais. Clique num item para ver o histórico.</p>
      </section>
      <section class="cartao">
        <div class="cartao-topo"><h3>Últimos movimentos</h3></div>
        ${tabelaMovimentos(movimentos, true)}
      </section>`;

    const desenhar = () => {
      const termo = normalizar(busca);
      const lista = controlados.filter((p) => (!soBaixo || p.estoque <= p.estoque_minimo) && (!termo || normalizar(`${p.nome} ${p.sku}`).includes(termo)));
      const alvo = $("[data-lista]", area);
      alvo.innerHTML = tabela([
        { titulo: "Item", valor: (p) => `<b>${esc(p.nome)}</b><br><small class="sutil">${esc(p.sku)} · ${NOMES.tipo[p.tipo]}</small>` },
        { titulo: "Categoria", valor: (p) => esc(p.categoria || "—") },
        { titulo: "Estoque", classe: "numero", valor: (p) => `<b>${qtd(p.estoque)}</b> ${esc(p.unidade)}` },
        { titulo: "Mínimo", classe: "numero", valor: (p) => `${qtd(p.estoque_minimo)} ${esc(p.unidade)}` },
        { titulo: "Custo unit.", classe: "numero", valor: (p) => dinheiro(p.custo) },
        { titulo: "Situação", valor: (p) => (p.estoque <= 0 ? '<span class="etiqueta perigo">Em falta</span>' : p.estoque <= p.estoque_minimo ? '<span class="etiqueta alerta">Repor</span>' : '<span class="etiqueta ok">OK</span>') },
      ], lista, { vazio: controlados.length ? "Nenhum item com esse filtro." : "Nenhum item com estoque cadastrado.", clicavel: true });
      $$("tbody tr", alvo).forEach((tr) => tr.addEventListener("click", () => historico(lista[Number(tr.dataset.indice)].id)));
    };
    desenhar();

    $('[name="busca"]', area).addEventListener("input", (e) => {
      busca = e.target.value;
      desenhar();
    });
    $("[data-baixo]", area).addEventListener("change", (e) => {
      soBaixo = e.target.checked;
      desenhar();
    });
    $("[data-movimento]", area)?.addEventListener("click", () => movimento(controlados, () => abrir(area)));
  }

  function tabelaMovimentos(movimentos, comProduto) {
    return tabela([
      { titulo: "Quando", valor: (m) => dataHora(m.criado_em) },
      ...(comProduto ? [{ titulo: "Item", valor: (m) => esc(m.produto) }] : []),
      { titulo: "Movimento", valor: (m) => `<span class="etiqueta ${m.quantidade > 0 ? "ok" : m.tipo === "perda" ? "perigo" : "info"}">${NOMES.movimento[m.tipo]}</span>` },
      { titulo: "Quantidade", classe: "numero", valor: (m) => `${m.quantidade > 0 ? "+" : ""}${qtd(m.quantidade)}` },
      { titulo: "Saldo", classe: "numero", valor: (m) => qtd(m.saldo) },
      { titulo: "Motivo", valor: (m) => esc(m.motivo || "—") },
      { titulo: "Por", valor: (m) => esc(m.usuario || "—") },
    ], movimentos, { vazio: "Nenhum movimento ainda." });
  }

  async function historico(id) {
    const p = await api("GET", `/api/produtos/${id}`);
    janela(`
      <div class="form-janela larga">
        <header class="janela-topo"><h2>${esc(p.nome)}</h2><button class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        <p class="sutil">Estoque atual: <b>${qtd(p.estoque)} ${esc(p.unidade)}</b> · mínimo ${qtd(p.estoque_minimo)} · custo ${dinheiro(p.custo)}</p>
        ${p.usado_em.length ? `<p class="destaque-texto">Usado nas fichas de: ${p.usado_em.map((u) => `${esc(u.nome)} (${qtd(u.quantidade)} ${esc(p.unidade)})`).join(", ")}</p>` : ""}
        ${tabelaMovimentos(p.movimentos, false)}
        <footer><button class="btn primario" data-fechar>Fechar</button></footer>
      </div>`);
  }

  function movimento(produtos, depois) {
    if (!produtos.length) return aviso("Cadastre os itens no Catálogo primeiro.", "erro");
    const dialogo = formulario({
      titulo: "Registrar movimento de estoque",
      campos: [
        { nome: "produto_id", rotulo: "Item", tipo: "select", obrigatorio: true, largo: true, opcoes: produtos.map((p) => ({ valor: p.id, rotulo: `${p.nome} — ${qtd(p.estoque)} ${p.unidade}` })) },
        { nome: "tipo", rotulo: "Movimento", tipo: "select", vazio: false, opcoes: [
          { valor: "entrada", rotulo: "Entrada (compra, recebimento)" },
          { valor: "saida", rotulo: "Saída (uso interno, doação)" },
          { valor: "perda", rotulo: "Perda (murchou, quebrou)" },
          { valor: "ajuste", rotulo: "Contagem (corrigir para a quantidade real)" },
        ] },
        { nome: "quantidade", rotulo: "Quantidade", tipo: "quantidade", obrigatorio: true, ajuda: "Na contagem, informe quanto há de fato." },
        { nome: "custo_unit", rotulo: "Custo por unidade (R$)", tipo: "dinheiro", ajuda: "Só nas entradas. Atualiza o custo pela média." },
        { nome: "motivo", rotulo: "Motivo / fornecedor", largo: true, max: 200 },
      ],
      botao: "Registrar",
      salvar: async (d) => {
        if (d.tipo !== "entrada") delete d.custo_unit;
        const r = await api("POST", "/api/estoque/movimentos", d);
        const p = produtos.find((x) => x.id === Number(d.produto_id));
        aviso(`${p.nome}: estoque agora ${qtd(r.saldo)} ${p.unidade}.`);
        depois();
      },
    });
    const tipo = $('[name="tipo"]', dialogo);
    const custo = $('[name="custo_unit"]', dialogo).closest("label");
    const alternar = () => custo.classList.toggle("oculto", tipo.value !== "entrada");
    tipo.addEventListener("change", alternar);
    alternar();
  }

  FA.telas.estoque = { subtitulo: "Matérias-primas e produtos prontos", abrir };
})();
