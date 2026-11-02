"use strict";

// Catálogo: vitrine com fotos (buquês, coroas, arranjos), matérias-primas e serviços; categorias.
(() => {
  const { $, $$, esc, api, aviso, dinheiro, qtd, pct, tabela, formulario, janela, confirmar, normalizar, NOMES, pode, baixarCsv, csvDinheiro, imagemProduto, reduzirFoto } = FA;
  const filtro = { tipo: "produto", categoria: "", busca: "", inativos: false, modo: "vitrine" };

  function situacao(p) {
    if (!p.ativo) return '<span class="etiqueta">Desativado</span>';
    if (p.tipo === "servico") return '<span class="etiqueta info">Serviço</span>';
    if (p.ficha_itens) return '<span class="etiqueta rosa">Feito na hora</span>';
    if (p.estoque <= 0) return '<span class="etiqueta perigo">Em falta</span>';
    if (p.estoque <= p.estoque_minimo) return `<span class="etiqueta alerta">Repor · ${qtd(p.estoque)} ${esc(p.unidade)}</span>`;
    return `<span class="etiqueta ok">${qtd(p.estoque)} ${esc(p.unidade)}</span>`;
  }

  async function abrir(area) {
    const [produtos, categorias] = await Promise.all([api("GET", `/api/produtos${filtro.inativos ? "?inativos=1" : ""}`), api("GET", "/api/categorias")]);
    if (!area.isConnected) return;
    const editar = pode("catalogo.editar");
    area.innerHTML = `
      <section class="cartao">
        <div class="barra-acoes" style="margin-bottom:12px">
          <input class="busca" name="busca" value="${esc(filtro.busca)}" placeholder="Buscar pelo nome ou código" autocomplete="off"/>
          <select name="categoria" style="width:auto"><option value="">Todas as categorias</option>${categorias.map((c) => `<option value="${c.id}" ${String(c.id) === filtro.categoria ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
          ${editar ? '<button class="btn primario" data-novo>+ Novo produto</button><button class="btn" data-categorias>Categorias</button>' : ""}
        </div>
        <div class="barra-acoes">
          <div class="chips">${[["produto", "Produtos à venda"], ["material", "Matérias-primas"], ["servico", "Serviços"], ["", "Todos"]]
            .map(([v, r]) => `<button class="chip ${filtro.tipo === v ? "ativo" : ""}" data-tipo="${v}">${r}</button>`).join("")}</div>
          <span class="espaco"></span>
          <label class="check"><input type="checkbox" data-inativos ${filtro.inativos ? "checked" : ""}/> <span>Mostrar desativados</span></label>
          <div class="chips">${[["vitrine", "Vitrine"], ["lista", "Lista"]].map(([v, r]) => `<button class="chip ${filtro.modo === v ? "ativo" : ""}" data-modo="${v}">${r}</button>`).join("")}</div>
          <button class="btn pequeno suave" data-imprimir>Imprimir catálogo</button>
          <button class="btn pequeno suave" data-csv>Planilha</button>
        </div>
      </section>
      <section data-lista></section>`;

    let lista = [];
    const desenhar = () => {
      const termo = normalizar(filtro.busca);
      lista = produtos.filter((p) => (!filtro.tipo || p.tipo === filtro.tipo)
        && (!filtro.categoria || String(p.categoria_id) === filtro.categoria)
        && (!termo || normalizar(`${p.nome} ${p.sku}`).includes(termo)));
      const alvo = $("[data-lista]", area);
      const vazio = produtos.length ? "Nenhum produto com esses filtros." : "Nenhum produto cadastrado. Comece pelo botão “Novo produto”.";
      if (filtro.modo === "vitrine") {
        alvo.className = "";
        alvo.innerHTML = lista.length ? `<div class="vitrine">${lista.map((p, i) => `
          <article class="vitrine-item ${p.ativo ? "" : "inativo"}" data-indice="${i}" ${editar ? 'tabindex="0" role="button"' : ""}>
            ${imagemProduto(p)}
            <div class="vitrine-texto">
              <small>${esc(p.categoria || NOMES.tipo[p.tipo])}</small>
              <b>${esc(p.nome)}</b>
              <div class="vitrine-preco"><span>${p.tipo === "material" && !p.preco ? `custo ${dinheiro(p.custo_estimado)}` : dinheiro(p.preco)}</span>${situacao(p)}</div>
              ${p.descricao ? `<p>${esc(p.descricao)}</p>` : ""}
            </div>
          </article>`).join("")}</div>` : `<div class="cartao vazio-linha">${vazio}</div>`;
        if (editar) $$(".vitrine-item", alvo).forEach((el) => el.addEventListener("click", () => form(lista[Number(el.dataset.indice)], categorias, () => abrir(area))));
      } else {
        alvo.className = "cartao";
        alvo.innerHTML = tabela([
          { titulo: "", valor: (p) => imagemProduto(p, "miniatura") },
          { titulo: "Produto", valor: (p) => `<b>${esc(p.nome)}</b><br><small class="sutil">${esc(p.sku)}</small>` },
          { titulo: "Categoria", valor: (p) => esc(p.categoria || "—") },
          { titulo: "Tipo", valor: (p) => `${NOMES.tipo[p.tipo]}${p.ficha_itens ? '<br><small class="sutil">com ficha técnica</small>' : ""}` },
          { titulo: "Preço", classe: "numero", valor: (p) => (p.tipo === "material" && !p.preco ? "—" : dinheiro(p.preco)) },
          { titulo: "Custo", classe: "numero", valor: (p) => dinheiro(p.custo_estimado) },
          { titulo: "Margem", classe: "numero", valor: (p) => (p.preco ? pct(((p.preco - p.custo_estimado) / p.preco) * 100) : "—") },
          { titulo: "Situação", valor: situacao },
        ], lista, { vazio, clicavel: editar });
        if (editar) $$("tbody tr", alvo).forEach((tr) => tr.addEventListener("click", () => form(lista[Number(tr.dataset.indice)], categorias, () => abrir(area))));
      }
    };
    desenhar();

    $('[name="busca"]', area).addEventListener("input", (e) => {
      filtro.busca = e.target.value;
      desenhar();
    });
    $('[name="categoria"]', area).addEventListener("change", (e) => {
      filtro.categoria = e.target.value;
      desenhar();
    });
    $$("[data-tipo]", area).forEach((b) => b.addEventListener("click", () => {
      filtro.tipo = b.dataset.tipo;
      $$("[data-tipo]", area).forEach((x) => x.classList.toggle("ativo", x === b));
      desenhar();
    }));
    $$("[data-modo]", area).forEach((b) => b.addEventListener("click", () => {
      filtro.modo = b.dataset.modo;
      $$("[data-modo]", area).forEach((x) => x.classList.toggle("ativo", x === b));
      desenhar();
    }));
    $("[data-inativos]", area).addEventListener("change", (e) => {
      filtro.inativos = e.target.checked;
      abrir(area);
    });
    $("[data-imprimir]", area).addEventListener("click", () => {
      const anterior = filtro.modo;
      filtro.modo = "vitrine";
      desenhar();
      document.body.classList.add("imprimir-catalogo");
      window.print();
      setTimeout(() => {
        document.body.classList.remove("imprimir-catalogo");
        filtro.modo = anterior;
        desenhar();
      }, 500);
    });
    $("[data-novo]", area)?.addEventListener("click", () => form(null, categorias, () => abrir(area)));
    $("[data-categorias]", area)?.addEventListener("click", () => gerirCategorias(() => abrir(area)));
    $("[data-csv]", area).addEventListener("click", () => baixarCsv("catalogo.csv",
      ["Código", "Produto", "Categoria", "Tipo", "Unidade", "Preço", "Custo", "Estoque", "Estoque mínimo", "Ativo"],
      produtos.map((p) => [p.sku, p.nome, p.categoria, NOMES.tipo[p.tipo], p.unidade, csvDinheiro(p.preco), csvDinheiro(p.custo_estimado),
        String(p.estoque).replace(".", ","), String(p.estoque_minimo).replace(".", ","), p.ativo ? "Sim" : "Não"])));
  }

  function form(p, categorias, depois) {
    const campos = [
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true, max: 120, placeholder: "Ex.: Buquê 12 rosas vermelhas" },
      { nome: "sku", rotulo: "Código (SKU)", obrigatorio: true, max: 40, placeholder: "Ex.: BUQ-012", ajuda: "Código curto e único." },
      { nome: "categoria_id", rotulo: "Categoria", tipo: "select", opcoes: categorias.map((c) => ({ valor: c.id, rotulo: c.nome })) },
      { nome: "tipo", rotulo: "Tipo", tipo: "select", vazio: false, opcoes: FA.opcoes(NOMES.tipo), ajuda: "Matéria-prima entra nas fichas técnicas. Serviço não tem estoque." },
      { nome: "unidade", rotulo: "Unidade", lista: FA.estado.sistema.unidades, padrao: "un", max: 20 },
      { nome: "preco", rotulo: "Preço de venda (R$)", tipo: "dinheiro" },
      { nome: "custo", rotulo: "Custo (R$)", tipo: "dinheiro", ajuda: "Produtos com ficha técnica usam o custo dos materiais." },
      ...(p ? [] : [{ nome: "estoque", rotulo: "Estoque inicial", tipo: "quantidade", ajuda: "Para produtos com ficha técnica, deixe zero." }]),
      { nome: "estoque_minimo", rotulo: "Estoque mínimo", tipo: "quantidade", ajuda: "Avisa no painel quando chegar neste ponto." },
      { nome: "descricao", rotulo: "Descrição (aparece na vitrine)", tipo: "textarea", largo: true },
      ...(p ? [{ nome: "ativo", rotulo: "Ativo (aparece nas vendas)", tipo: "checkbox", largo: true }] : []),
    ];
    let novaFoto = null; // data URL da foto escolhida (já reduzida)
    let tirarFoto = false;
    const dialogo = formulario({
      titulo: p ? `Editar: ${p.nome}` : "Novo produto",
      largo: true,
      campos,
      valores: p ? { ...p, ativo: Boolean(p.ativo) } : { tipo: "produto", unidade: "un" },
      botao: p ? "Salvar" : "Cadastrar",
      salvar: async (d) => {
        let id = p?.id;
        if (p) await api("PUT", `/api/produtos/${p.id}`, d);
        else id = (await api("POST", "/api/produtos", d)).id;
        if (novaFoto) await api("PUT", `/api/produtos/${id}/foto`, { imagem: novaFoto });
        else if (tirarFoto && p?.foto) await api("DELETE", `/api/produtos/${id}/foto`);
        aviso(p ? "Produto atualizado." : "Produto cadastrado.");
        depois();
      },
    });
    // Foto: escolher um arquivo (ou tirar com a câmera do notebook, pelo seletor do Windows).
    const bloco = document.createElement("div");
    bloco.className = "foto-produto";
    bloco.innerHTML = `
      <div class="foto-previa">${p ? imagemProduto(p) : imagemProduto({ nome: "?" })}</div>
      <div>
        <b>Foto do produto</b>
        <p class="sutil">Aparece na vitrine, na tela de venda e no catálogo impresso. Use foto quadrada e bem iluminada; o sistema reduz o tamanho sozinho.</p>
        <div class="barra-acoes">
          <label class="btn pequeno">Escolher foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-arquivo/></label>
          ${p?.foto ? '<button type="button" class="btn pequeno perigo" data-tirar-foto>Remover foto</button>' : ""}
        </div>
      </div>`;
    $(".campos", dialogo).before(bloco);
    $("[data-arquivo]", bloco).addEventListener("change", async (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      try {
        novaFoto = await reduzirFoto(arquivo);
        tirarFoto = false;
        $(".foto-previa", bloco).innerHTML = `<img class="foto" src="${novaFoto}" alt="Prévia da foto"/>`;
      } catch (erro) {
        aviso(erro.message, "erro");
      }
    });
    $("[data-tirar-foto]", bloco)?.addEventListener("click", () => {
      novaFoto = null;
      tirarFoto = true;
      $(".foto-previa", bloco).innerHTML = imagemProduto({ nome: $('[name="nome"]', dialogo).value || "?" });
    });
  }

  async function gerirCategorias(depois) {
    const categorias = await api("GET", "/api/categorias");
    const dialogo = janela(`
      <div class="form-janela">
        <header class="janela-topo"><h2>Categorias</h2><button class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        <p class="intro">As categorias <b>Buquês</b> e <b>Coroas</b> alimentam os indicadores do painel. Se renomear, os indicadores passam a ficar zerados.</p>
        ${tabela([
          { titulo: "Categoria", valor: (c) => esc(c.nome) },
          { titulo: "Produtos", classe: "numero", valor: (c) => c.produtos },
          { titulo: "", classe: "acoes", valor: (c) => `<button class="btn pequeno" data-renomear="${c.id}">Renomear</button> <button class="btn pequeno perigo" data-excluir="${c.id}">Excluir</button>` },
        ], categorias)}
        <form class="barra-acoes" data-nova><input name="nome" placeholder="Nova categoria" maxlength="60" class="busca" autocomplete="off"/><button class="btn primario">Adicionar</button></form>
        <footer><button class="btn" data-fechar>Fechar</button></footer>
      </div>`, { aoFechar: depois });
    const reabrir = () => {
      dialogo.close();
      gerirCategorias(depois);
    };
    $("[data-nova]", dialogo).addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("POST", "/api/categorias", { nome: e.target.elements.nome.value });
        reabrir();
      } catch (erro) {
        aviso(erro.message, "erro");
      }
    });
    $$("[data-renomear]", dialogo).forEach((b) => b.addEventListener("click", () => {
      const c = categorias.find((x) => x.id === Number(b.dataset.renomear));
      formulario({
        titulo: "Renomear categoria", campos: [{ nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true, max: 60 }], valores: c,
        salvar: async (d) => {
          await api("PUT", `/api/categorias/${c.id}`, d);
          reabrir();
        },
      });
    }));
    $$("[data-excluir]", dialogo).forEach((b) => b.addEventListener("click", async () => {
      const c = categorias.find((x) => x.id === Number(b.dataset.excluir));
      if (!(await confirmar(`Excluir a categoria “${c.nome}”?`, { botao: "Excluir", perigo: true }))) return;
      try {
        await api("DELETE", `/api/categorias/${c.id}`);
        reabrir();
      } catch (erro) {
        aviso(erro.message, "erro");
      }
    }));
  }

  FA.telas.catalogo = { subtitulo: "Produtos, matérias-primas e serviços", abrir };
})();
