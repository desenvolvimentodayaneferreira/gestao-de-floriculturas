"use strict";

// Vendas: nova venda (cliente pelo CPF, atendimento, entrega, carrinho) e histórico com cancelamento e comprovante.
(() => {
  const {
    $, $$, esc, api, aviso, dinheiro, lerDinheiro, lerNumero, qtd, cpf, telefone, soNumeros, dataHora, hoje, agoraCampo,
    tabela, confirmar, janela, normalizar, baixarCsv, csvDinheiro, NOMES, pode, quandoTexto,
  } = FA;

  let aba = null;
  let produtos = [];
  let categorias = [];
  let carrinho = [];
  let filtroCategoria = "";
  let historico = { de: FA.somarDias(hoje(), -30), ate: hoje(), busca: "" };

  async function abrir(area) {
    if (!aba) aba = pode("vendas.registrar") ? "nova" : "historico";
    area.innerHTML = `
      <div class="chips">
        ${pode("vendas.registrar") ? `<button class="chip ${aba === "nova" ? "ativo" : ""}" data-aba="nova">Nova venda</button>` : ""}
        ${pode("vendas.ver") ? `<button class="chip ${aba === "historico" ? "ativo" : ""}" data-aba="historico">Vendas registradas</button>` : ""}
      </div>
      <div data-corpo></div>`;
    $$("[data-aba]", area).forEach((b) => b.addEventListener("click", () => {
      aba = b.dataset.aba;
      abrir(area);
    }));
    const corpo = $("[data-corpo]", area);
    if (aba === "nova") await novaVenda(corpo);
    else await listar(corpo);
  }

  // ---------- Nova venda ----------
  async function novaVenda(corpo) {
    [produtos, categorias] = await Promise.all([api("GET", "/api/produtos"), api("GET", "/api/categorias")]);
    produtos = produtos.filter((p) => p.tipo !== "material" || p.preco > 0);
    const exigeCpf = FA.estado.sistema.exigir_cpf;
    corpo.innerHTML = `
      <div class="venda-grade">
        <div class="tela">
          <section class="cartao">
            <div class="cartao-topo"><h3>Cliente</h3><span class="cliente-encontrado" data-encontrado></span></div>
            <div class="campos c3">
              <label><span>CPF${exigeCpf ? ' <em class="obrig">*</em>' : " (opcional)"}</span><input name="cpf" inputmode="numeric" data-mascara="cpf" maxlength="14" placeholder="000.000.000-00" autocomplete="off"/><small>Um cadastro por pessoa: o CPF encontra o cliente.</small></label>
              <label>Nome completo<input name="nome" maxlength="120" autocomplete="off"/></label>
              <label>Telefone / WhatsApp<input name="telefone" type="tel" data-mascara="telefone" maxlength="16" autocomplete="off"/></label>
            </div>
          </section>

          <section class="cartao">
            <div class="cartao-topo"><h3>Atendimento e recebimento</h3></div>
            <div class="campos c3">
              <label>Canal<select name="canal">${FA.opcoes(NOMES.canal).map((o) => `<option value="${o.valor}">${o.rotulo}</option>`).join("")}</select></label>
              <label>Recebimento<select name="recebimento">${FA.opcoes(NOMES.recebimento).map((o) => `<option value="${o.valor}">${o.rotulo}</option>`).join("")}</select></label>
              <label>Data e horário combinados<input name="combinado" type="datetime-local"/></label>
              <label class="largo" data-entrega>Endereço de entrega<input name="endereco" maxlength="250" autocomplete="off" placeholder="Rua, número, bairro, referência"/></label>
              <label data-entrega>Taxa de entrega (R$)<input name="taxa" inputmode="decimal" placeholder="0,00"/></label>
              <label>Pagamento<select name="pagamento">${FA.opcoes(NOMES.pagamento).map((o) => `<option value="${o.valor}">${o.rotulo}</option>`).join("")}</select></label>
              <label class="largo">Observação (mensagem do cartão, cor das flores…)<input name="observacao" maxlength="500" autocomplete="off"/></label>
            </div>
          </section>

          <section class="cartao">
            <div class="cartao-topo"><h3>Produtos</h3><input class="busca" name="busca" placeholder="Buscar produto pelo nome ou código" style="max-width:320px" autocomplete="off"/></div>
            <div class="chips" data-categorias style="margin-bottom:12px"></div>
            <div class="produtos-busca" data-produtos></div>
          </section>
        </div>

        <aside class="cartao carrinho">
          <h3>Carrinho</h3>
          <div data-itens></div>
          <div class="carrinho-total">
            <div><span>Produtos</span><b data-subtotal>R$ 0,00</b></div>
            <div><label style="flex-direction:row;align-items:center;gap:8px">Desconto (R$)<input name="desconto" inputmode="decimal" placeholder="0,00" style="width:110px;min-height:34px"/></label></div>
            <div data-entrega><span>Taxa de entrega</span><b data-taxa>R$ 0,00</b></div>
            <div class="total"><span>Total</span><span data-total>R$ 0,00</span></div>
          </div>
          <p class="erro" data-erro></p>
          <button class="btn primario grande largo" data-finalizar>Finalizar venda</button>
          <button class="btn largo" data-limpar>Limpar</button>
        </aside>
      </div>`;

    const campo = (n) => $(`[name="${n}"]`, corpo);
    // Balcão: primeiro os produtos, depois cliente e entrega.
    const secaoProdutos = $("[data-produtos]", corpo).closest("section");
    secaoProdutos.parentElement.prepend(secaoProdutos);
    campo("combinado").value = agoraCampo();

    // Cliente pelo CPF
    campo("cpf").addEventListener("input", async () => {
      const numeros = soNumeros(campo("cpf").value);
      $("[data-encontrado]", corpo).textContent = "";
      if (numeros.length !== 11) return;
      try {
        const c = await api("GET", `/api/clientes/cpf/${numeros}`);
        if (c.id && soNumeros(campo("cpf").value) === numeros) {
          campo("nome").value = c.nome;
          campo("telefone").value = telefone(c.telefone);
          if (c.endereco && !campo("endereco").value) campo("endereco").value = c.endereco;
          $("[data-encontrado]", corpo).textContent = `✓ Cliente já cadastrado: ${c.nome}`;
        }
      } catch { /* sem cliente */ }
    });

    const atualizarEntrega = () => {
      const entrega = campo("recebimento").value === "entrega";
      $$("[data-entrega]", corpo).forEach((el) => el.classList.toggle("oculto", !entrega));
      atualizarTotais(corpo);
    };
    campo("recebimento").addEventListener("change", atualizarEntrega);
    campo("taxa").addEventListener("input", () => atualizarTotais(corpo));
    campo("desconto").addEventListener("input", () => atualizarTotais(corpo));
    campo("busca").addEventListener("input", () => desenharProdutos(corpo));
    atualizarEntrega();

    const cats = categorias.filter((c) => produtos.some((p) => p.categoria_id === c.id));
    $("[data-categorias]", corpo).innerHTML = [["", "Todos"], ...cats.map((c) => [c.id, c.nome])]
      .map(([id, nome]) => `<button class="chip ${String(filtroCategoria) === String(id) ? "ativo" : ""}" data-cat="${id}">${esc(nome)}</button>`).join("");
    $$("[data-cat]", corpo).forEach((b) => b.addEventListener("click", () => {
      filtroCategoria = b.dataset.cat;
      $$("[data-cat]", corpo).forEach((x) => x.classList.toggle("ativo", x === b));
      desenharProdutos(corpo);
    }));
    desenharProdutos(corpo);
    desenharCarrinho(corpo);

    $("[data-limpar]", corpo).addEventListener("click", () => {
      carrinho = [];
      novaVenda(corpo);
    });
    $("[data-finalizar]", corpo).addEventListener("click", () => finalizar(corpo));
  }

  function disponibilidade(p) {
    if (p.tipo === "servico") return "serviço";
    if (p.ficha_itens) return "feito na hora";
    return `estoque: ${qtd(p.estoque)} ${p.unidade}`;
  }

  function desenharProdutos(corpo) {
    const termo = normalizar($('[name="busca"]', corpo).value);
    const lista = produtos.filter((p) => (!filtroCategoria || String(p.categoria_id) === String(filtroCategoria))
      && (!termo || normalizar(`${p.nome} ${p.sku}`).includes(termo)));
    const alvo = $("[data-produtos]", corpo);
    if (!produtos.length) {
      alvo.innerHTML = `<div class="vazio-linha" style="grid-column:1/-1">Nenhum produto cadastrado. ${pode("catalogo.editar") ? 'Cadastre em <a href="#/catalogo">Catálogo</a>.' : ""}</div>`;
      return;
    }
    alvo.innerHTML = lista.length ? lista.map((p) => `
      <button class="produto-botao ${p.tipo === "produto" && !p.ficha_itens && p.estoque <= 0 ? "sem-estoque" : ""}" data-produto="${p.id}">
        ${FA.imagemProduto(p)}
        <b>${esc(p.nome)}</b><span>${dinheiro(p.preco)}</span><small>${esc(disponibilidade(p))}</small>
      </button>`).join("") : '<div class="vazio-linha" style="grid-column:1/-1">Nenhum produto encontrado.</div>';
    $$("[data-produto]", alvo).forEach((b) => b.addEventListener("click", () => {
      const p = produtos.find((x) => x.id === Number(b.dataset.produto));
      const linha = carrinho.find((l) => l.produto.id === p.id);
      if (linha) linha.quantidade += 1;
      else carrinho.push({ produto: p, quantidade: 1 });
      desenharCarrinho(corpo);
    }));
  }

  function desenharCarrinho(corpo) {
    const alvo = $("[data-itens]", corpo);
    alvo.innerHTML = carrinho.length ? carrinho.map((l, i) => `
      <div class="carrinho-linha">
        <b>${esc(l.produto.nome)}</b><b class="numero">${dinheiro(Math.round(l.produto.preco * l.quantidade))}</b>
        <div class="controles"><input value="${String(l.quantidade).replace(".", ",")}" inputmode="decimal" data-qtd="${i}" aria-label="Quantidade"/><small class="sutil">× ${dinheiro(l.produto.preco)}</small></div>
        <button class="link" data-remover="${i}">remover</button>
      </div>`).join("") : '<div class="vazio-linha">Toque nos produtos para adicionar.</div>';
    $$("[data-qtd]", alvo).forEach((input) => input.addEventListener("change", () => {
      const n = lerNumero(input.value);
      const linha = carrinho[Number(input.dataset.qtd)];
      if (Number.isFinite(n) && n > 0) linha.quantidade = Math.round(n * 1000) / 1000;
      desenharCarrinho(corpo);
    }));
    $$("[data-remover]", alvo).forEach((b) => b.addEventListener("click", () => {
      carrinho.splice(Number(b.dataset.remover), 1);
      desenharCarrinho(corpo);
    }));
    atualizarTotais(corpo);
  }

  function totais(corpo) {
    const subtotal = carrinho.reduce((s, l) => s + Math.round(l.produto.preco * l.quantidade), 0);
    const desconto = lerDinheiro($('[name="desconto"]', corpo).value) || 0;
    const entrega = $('[name="recebimento"]', corpo).value === "entrega";
    const taxa = entrega ? lerDinheiro($('[name="taxa"]', corpo).value) || 0 : 0;
    return { subtotal, desconto, taxa, total: Math.max(0, subtotal - desconto + taxa) };
  }

  function atualizarTotais(corpo) {
    if (!$("[data-subtotal]", corpo)) return;
    const t = totais(corpo);
    $("[data-subtotal]", corpo).textContent = dinheiro(t.subtotal);
    $("[data-taxa]", corpo).textContent = dinheiro(t.taxa);
    $("[data-total]", corpo).textContent = dinheiro(t.total);
  }

  async function finalizar(corpo) {
    const erro = $("[data-erro]", corpo);
    erro.textContent = "";
    const v = (n) => $(`[name="${n}"]`, corpo).value.trim();
    if (!carrinho.length) return (erro.textContent = "Inclua ao menos um produto.");
    const t = totais(corpo);
    if (Number.isNaN(lerDinheiro(v("desconto"))) || Number.isNaN(lerDinheiro(v("taxa")))) return (erro.textContent = "Confira os valores de desconto e taxa.");
    const botao = $("[data-finalizar]", corpo);
    botao.disabled = true;
    try {
      const r = await api("POST", "/api/vendas", {
        cliente_cpf: soNumeros(v("cpf")),
        cliente_nome: v("nome"),
        cliente_telefone: v("telefone"),
        canal: v("canal"),
        recebimento: v("recebimento"),
        combinado_para: v("combinado") || null,
        endereco_entrega: v("endereco"),
        taxa_entrega: t.taxa,
        desconto: t.desconto,
        pagamento: v("pagamento"),
        observacao: v("observacao"),
        itens: carrinho.map((l) => ({ produto_id: l.produto.id, quantidade: l.quantidade })),
      });
      carrinho = [];
      aviso(`Venda nº ${r.id} registrada: ${dinheiro(r.total)}.`);
      await novaVenda(corpo);
      detalhe(r.id, { aposVenda: true });
    } catch (problema) {
      erro.textContent = problema.message;
    } finally {
      botao.disabled = false;
    }
  }

  // ---------- Histórico ----------
  async function listar(corpo) {
    corpo.innerHTML = `
      <section class="cartao">
        <div class="barra-acoes" style="margin-bottom:14px">
          <label>De<input type="date" name="de" value="${historico.de}"/></label>
          <label>Até<input type="date" name="ate" value="${historico.ate}"/></label>
          <label class="busca">Buscar<input name="busca" value="${esc(historico.busca)}" placeholder="Cliente, CPF ou nº da venda" autocomplete="off"/></label>
          <button class="btn" data-filtrar style="align-self:flex-end">Filtrar</button>
          <button class="btn suave" data-csv style="align-self:flex-end">Exportar planilha</button>
        </div>
        <div data-lista><div class="carregando">Carregando…</div></div>
      </section>`;
    const carregar = async () => {
      historico = { de: $('[name="de"]', corpo).value, ate: $('[name="ate"]', corpo).value, busca: $('[name="busca"]', corpo).value.trim() };
      const params = new URLSearchParams({ de: historico.de, ate: historico.ate, busca: historico.busca, limite: 2000 });
      const vendas = await api("GET", `/api/vendas?${params}`);
      const validas = vendas.filter((x) => x.status === "finalizada");
      const alvo = $("[data-lista]", corpo);
      alvo.innerHTML = `<p class="sutil" style="margin-bottom:8px">${validas.length} vendas · ${dinheiro(validas.reduce((s, x) => s + x.total, 0))}${vendas.length > validas.length ? ` · ${vendas.length - validas.length} cancelada(s)` : ""}</p>` + tabela([
        { titulo: "Nº", valor: (x) => x.id },
        { titulo: "Data", valor: (x) => dataHora(x.criado_em) },
        { titulo: "Cliente", valor: (x) => `${esc(x.cliente_nome)}${x.cliente_cpf ? `<br><small class="sutil">${cpf(x.cliente_cpf)}</small>` : ""}` },
        { titulo: "Itens", valor: (x) => `<small>${esc(x.resumo || "")}</small>` },
        { titulo: "Recebimento", valor: (x) => `${NOMES.recebimento[x.recebimento]}${x.combinado_para ? `<br><small class="sutil">${quandoTexto(x.combinado_para)}</small>` : ""}` },
        { titulo: "Canal", valor: (x) => NOMES.canal[x.canal] },
        { titulo: "Pagamento", valor: (x) => NOMES.pagamento[x.pagamento] },
        { titulo: "Total", classe: "numero", valor: (x) => dinheiro(x.total) },
        { titulo: "Situação", valor: (x) => (x.status === "cancelada" ? '<span class="etiqueta perigo">Cancelada</span>' : '<span class="etiqueta ok">Finalizada</span>') },
      ], vendas, { vazio: "Nenhuma venda no período.", clicavel: true });
      $$("tbody tr", alvo).forEach((tr) => tr.addEventListener("click", () => detalhe(vendas[Number(tr.dataset.indice)].id, { aoMudar: carregar })));
      $("[data-csv]", corpo).onclick = () => baixarCsv(`vendas-${historico.de}-a-${historico.ate}.csv`,
        ["Nº", "Data", "Cliente", "CPF", "Telefone", "Itens", "Canal", "Recebimento", "Combinado para", "Endereço", "Pagamento", "Produtos", "Desconto", "Taxa de entrega", "Total", "Situação"],
        vendas.map((x) => [x.id, dataHora(x.criado_em), x.cliente_nome, cpf(x.cliente_cpf), x.cliente_telefone, x.resumo, NOMES.canal[x.canal], NOMES.recebimento[x.recebimento],
          x.combinado_para ? dataHora(x.combinado_para) : "", x.endereco_entrega, NOMES.pagamento[x.pagamento], csvDinheiro(x.subtotal), csvDinheiro(x.desconto),
          csvDinheiro(x.taxa_entrega), csvDinheiro(x.total), x.status === "cancelada" ? "Cancelada" : "Finalizada"]));
    };
    $("[data-filtrar]", corpo).addEventListener("click", carregar);
    $('[name="busca"]', corpo).addEventListener("keydown", (e) => e.key === "Enter" && carregar());
    await carregar();
  }

  // Detalhe da venda: comprovante para imprimir e cancelamento.
  async function detalhe(id, { aoMudar, aposVenda } = {}) {
    const v = await api("GET", `/api/vendas/${id}`);
    const loja = FA.estado.sistema.loja.nome;
    const dialogo = janela(`
      <div class="form-janela comprovante">
        <header class="janela-topo"><h2>Venda nº ${v.id}</h2><button type="button" class="btn-icone nao-imprimir" data-fechar aria-label="Fechar">✕</button></header>
        <p class="sutil">${esc(loja)} · ${dataHora(v.criado_em)}${v.vendedor ? ` · atendido por ${esc(v.vendedor)}` : ""}</p>
        ${v.status === "cancelada" ? `<p class="etiqueta perigo">Cancelada em ${dataHora(v.cancelada_em)}: ${esc(v.cancelada_motivo)}</p>` : ""}
        <div class="lista-simples">
          <div><span>Cliente</span><b>${esc(v.cliente_nome)}${v.cliente_cpf ? ` · CPF ${cpf(v.cliente_cpf)}` : ""}</b></div>
          ${v.cliente_telefone ? `<div><span>Telefone</span><b>${esc(telefone(v.cliente_telefone))}</b></div>` : ""}
          <div><span>Recebimento</span><b>${NOMES.recebimento[v.recebimento]}${v.combinado_para ? ` · ${dataHora(v.combinado_para)}` : ""}</b></div>
          ${v.endereco_entrega ? `<div><span>Endereço</span><b>${esc(v.endereco_entrega)}</b></div>` : ""}
          <div><span>Atendimento</span><b>${NOMES.canal[v.canal]} · ${NOMES.pagamento[v.pagamento]}</b></div>
          ${v.observacao ? `<div><span>Observação</span><b>${esc(v.observacao)}</b></div>` : ""}
        </div>
        ${tabela([
          { titulo: "Produto", valor: (i) => esc(i.nome) },
          { titulo: "Qtd.", classe: "numero", valor: (i) => qtd(i.quantidade) },
          { titulo: "Preço", classe: "numero", valor: (i) => dinheiro(i.preco_unit) },
          { titulo: "Total", classe: "numero", valor: (i) => dinheiro(Math.round(i.quantidade * i.preco_unit)) },
        ], v.itens)}
        <div class="carrinho-total">
          <div><span>Produtos</span><b>${dinheiro(v.subtotal)}</b></div>
          ${v.desconto ? `<div><span>Desconto</span><b>− ${dinheiro(v.desconto)}</b></div>` : ""}
          ${v.taxa_entrega ? `<div><span>Taxa de entrega</span><b>${dinheiro(v.taxa_entrega)}</b></div>` : ""}
          <div class="total"><span>Total</span><span>${dinheiro(v.total)}</span></div>
        </div>
        <footer class="nao-imprimir">
          ${v.status === "finalizada" && pode("vendas.cancelar") && !aposVenda ? '<button class="btn perigo" data-cancelar>Cancelar venda</button><span style="flex:1"></span>' : ""}
          ${FA.whatsapp(v.cliente_telefone) && v.status === "finalizada" ? `<a class="btn" target="_blank" rel="noopener" href="${FA.whatsapp(v.cliente_telefone, [
            `Olá, ${FA.primeiroNome(v.cliente_nome)}! Obrigada pela compra na ${loja} 🌷`,
            `Pedido nº ${v.id}:`,
            ...v.itens.map((i) => `• ${qtd(i.quantidade)}× ${i.nome} — ${dinheiro(Math.round(i.quantidade * i.preco_unit))}`),
            ...(v.desconto ? [`Desconto: − ${dinheiro(v.desconto)}`] : []),
            ...(v.taxa_entrega ? [`Entrega: ${dinheiro(v.taxa_entrega)}`] : []),
            `Total: ${dinheiro(v.total)} (${NOMES.pagamento[v.pagamento]})`,
            ...(v.recebimento === "entrega" && v.combinado_para ? [`Entrega: ${dataHora(v.combinado_para)} em ${v.endereco_entrega}`] : []),
          ].join("\n"))}">Enviar por WhatsApp</a>` : ""}
          <button class="btn" data-imprimir>Imprimir comprovante</button>
          <button class="btn primario" data-fechar>${aposVenda ? "Nova venda" : "Fechar"}</button>
        </footer>
      </div>`);
    $("[data-imprimir]", dialogo).addEventListener("click", () => window.print());
    $("[data-cancelar]", dialogo)?.addEventListener("click", async () => {
      const motivo = await confirmar("O estoque volta ao que era antes desta venda. A venda continua no histórico como cancelada.", {
        titulo: `Cancelar a venda nº ${v.id}?`, botao: "Cancelar venda", perigo: true, motivo: "Motivo do cancelamento",
      });
      if (!motivo) return;
      try {
        await api("POST", `/api/vendas/${v.id}/cancelar`, { motivo });
        aviso("Venda cancelada e estoque devolvido.");
        dialogo.close();
        aoMudar?.();
      } catch (problema) {
        aviso(problema.message, "erro");
      }
    });
  }

  FA.telas.vendas = { subtitulo: "Atendimento na loja, WhatsApp e telefone", abrir };
  FA.vendaDetalhe = detalhe;
})();
