"use strict";

// Fichas técnicas: o que vai em cada criação, custo, margem e quantas dá para montar com o estoque.
(() => {
  const { $, $$, esc, api, aviso, dinheiro, qtd, pct, formulario, confirmar, pode } = FA;

  async function abrir(area) {
    const [fichas, produtos] = await Promise.all([api("GET", "/api/fichas"), api("GET", "/api/produtos")]);
    if (!area.isConnected) return;
    const editar = pode("catalogo.editar");
    area.innerHTML = `
      <div class="faixa"><div><span>Composição e margem</span><h2>Do caule ao laço, o custo de cada criação</h2><p>Ao vender um produto com ficha técnica, o sistema dá baixa nos materiais automaticamente.</p></div>${FA.icone("fichas", 44)}</div>
      ${editar ? '<div class="barra-acoes"><button class="btn primario" data-adicionar>+ Adicionar componente</button></div>' : ""}
      ${fichas.length ? `<div class="fichas">${fichas.map((f) => `
        <article class="cartao">
          <div class="cartao-topo"><div><small class="sutil">${esc(f.categoria || "Ficha técnica")} · ${esc(f.sku)}</small><h2>${esc(f.nome)}</h2></div>
            <span class="etiqueta ${f.possiveis > 0 ? "ok" : "perigo"}" title="Com o estoque atual dos materiais">Dá para montar: ${f.possiveis}</span></div>
          ${f.itens.map((i) => `
            <div class="ficha-linha">
              <span>${qtd(i.quantidade)} ${esc(i.unidade)} · ${esc(i.nome)}<br><small class="sutil">estoque: ${qtd(i.estoque)} ${esc(i.unidade)}</small></span>
              <span><b>${dinheiro(i.custo_linha)}</b>${editar ? ` <button class="link" data-editar="${f.id}:${i.componente_id}">alterar</button>` : ""}</span>
            </div>`).join("")}
          <div class="ficha-resumo">
            <div><span>Custo</span><strong>${dinheiro(f.custo)}</strong></div>
            <div><span>Preço</span><strong>${dinheiro(f.preco)}</strong></div>
            <div><span>Margem</span><strong>${f.preco ? pct(f.margem) : "—"}</strong></div>
          </div>
        </article>`).join("")}</div>`
        : `<div class="cartao vazio"><b>Nenhuma ficha técnica ainda</b><p>Cadastre as matérias-primas no Catálogo (tipo “Matéria-prima”) e depois monte a ficha de cada buquê, coroa ou arranjo.</p></div>`}`;

    const finais = produtos.filter((p) => p.tipo !== "material");
    const componentes = produtos.filter((p) => p.tipo !== "servico" && !p.ficha_itens);
    $("[data-adicionar]", area)?.addEventListener("click", () => {
      if (!finais.length || !componentes.length) return aviso("Cadastre no Catálogo o produto final e as matérias-primas primeiro.", "erro");
      formulario({
        titulo: "Adicionar componente à ficha",
        intro: "Se o componente já estiver na ficha, a quantidade é atualizada.",
        campos: [
          { nome: "produto", rotulo: "Produto final (buquê, coroa, arranjo…)", tipo: "select", obrigatorio: true, largo: true, opcoes: finais.map((p) => ({ valor: p.id, rotulo: p.nome })) },
          { nome: "componente", rotulo: "Matéria-prima", tipo: "select", obrigatorio: true, largo: true, opcoes: componentes.map((p) => ({ valor: p.id, rotulo: `${p.nome} (${p.unidade} · ${dinheiro(p.custo)})` })) },
          { nome: "quantidade", rotulo: "Quantidade por unidade do produto", tipo: "quantidade", obrigatorio: true, padrao: "1" },
        ],
        botao: "Adicionar",
        salvar: async (d) => {
          await api("PUT", `/api/fichas/${d.produto}/${d.componente}`, { quantidade: d.quantidade });
          aviso("Ficha técnica atualizada.");
          abrir(area);
        },
      });
    });

    $$("[data-editar]", area).forEach((b) => b.addEventListener("click", () => {
      const [produtoId, componenteId] = b.dataset.editar.split(":").map(Number);
      const ficha = fichas.find((f) => f.id === produtoId);
      const item = ficha.itens.find((i) => i.componente_id === componenteId);
      const dialogo = formulario({
        titulo: `${ficha.nome}: ${item.nome}`,
        campos: [{ nome: "quantidade", rotulo: `Quantidade (${item.unidade})`, tipo: "quantidade", obrigatorio: true, largo: true }],
        valores: item,
        salvar: async (d) => {
          await api("PUT", `/api/fichas/${produtoId}/${componenteId}`, { quantidade: d.quantidade });
          aviso("Quantidade atualizada.");
          abrir(area);
        },
      });
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "btn perigo";
      remover.textContent = "Tirar da ficha";
      $("footer", dialogo).prepend(remover);
      remover.addEventListener("click", async () => {
        if (!(await confirmar(`Tirar ${item.nome} da ficha de ${ficha.nome}?`, { botao: "Tirar", perigo: true }))) return;
        await api("DELETE", `/api/fichas/${produtoId}/${componenteId}`);
        dialogo.close();
        aviso("Componente retirado.");
        abrir(area);
      });
    }));
  }

  FA.telas.fichas = { subtitulo: "Composição, custo e margem de cada criação", abrir };
})();
