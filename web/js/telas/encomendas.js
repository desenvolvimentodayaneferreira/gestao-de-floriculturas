"use strict";

// Encomendas: agenda de produção por situação (aguardando → em produção → pronto → saiu → entregue),
// com produtos, sinal, saldo, aviso ao cliente por WhatsApp e conversão em venda (baixa no estoque).
(() => {
  const { $, $$, esc, api, aviso, dinheiro, qtd, quandoTexto, hoje, agoraCampo, janela, campoHtml, lerCampos, lerNumero, lerDinheiro, NOMES, pode, whatsapp, telefone, primeiroNome } = FA;
  const COLUNAS = ["aguardando", "producao", "pronto", "entrega", "entregue"];
  const OCASIOES = ["Aniversário", "Romance", "Casamento", "Corporativo", "Condolências", "Finados", "Maternidade", "Formatura", "Dia das Mães", "Dia dos Namorados", "Dia dos Professores", "Presente", "Outro"];
  let todas = false;

  // Mensagem pronta para o WhatsApp conforme a situação.
  function mensagem(e) {
    const loja = FA.estado.sistema.loja.nome;
    const nome = primeiroNome(e.cliente);
    const quando = quandoTexto(e.entrega_em).toLowerCase();
    return {
      aguardando: `Olá, ${nome}! Aqui é da ${loja} 🌷 Sua encomenda (${e.ocasiao}) está confirmada para ${quando}.${e.saldo ? ` Valor restante: ${dinheiro(e.saldo)}.` : ""} Qualquer dúvida, é só chamar!`,
      producao: `Olá, ${nome}! Sua encomenda já está sendo preparada com todo carinho aqui na ${loja} 💐`,
      pronto: `Olá, ${nome}! Sua encomenda está pronta ✨ ${e.endereco ? "Em breve sai para entrega." : "Já pode retirar aqui na loja."}`,
      entrega: `Olá, ${nome}! Sua encomenda saiu para entrega 🛵 Logo chega em ${e.endereco}.`,
      entregue: `Olá, ${nome}! Sua encomenda foi entregue. Obrigada pela confiança na ${loja}! 🌸`,
      cancelada: `Olá, ${nome}! Sobre sua encomenda na ${loja}: `,
    }[e.status];
  }

  async function abrir(area) {
    const [encomendas, clientes, produtos] = await Promise.all([
      api("GET", `/api/encomendas${todas ? "?todas=1" : ""}`), api("GET", "/api/clientes"), pode("vendas.registrar") ? api("GET", "/api/produtos") : [],
    ]);
    if (!area.isConnected) return;
    const agora = agoraCampo();
    const editar = pode("vendas.registrar");
    const abertas = encomendas.filter((e) => !["entregue", "cancelada"].includes(e.status));
    const canceladas = encomendas.filter((e) => e.status === "cancelada");
    area.innerHTML = `
      <section class="grade g4">
        <div class="cartao indicador"><span>Em aberto</span><strong>${abertas.length}</strong><small>encomendas para produzir e entregar</small></div>
        <div class="cartao indicador ${abertas.some((e) => e.entrega_em < agora) ? "alerta" : ""}"><span>Para hoje</span><strong>${abertas.filter((e) => e.entrega_em.startsWith(hoje())).length}</strong><small>${abertas.filter((e) => e.entrega_em < agora).length} atrasada(s)</small></div>
        <div class="cartao indicador"><span>Valor em aberto</span><strong>${dinheiro(abertas.reduce((s, e) => s + e.valor, 0))}</strong><small>${dinheiro(abertas.reduce((s, e) => s + e.sinal, 0))} já recebidos de sinal</small></div>
        <div class="cartao indicador"><span>A receber na entrega</span><strong>${dinheiro(abertas.filter((e) => !e.venda_id).reduce((s, e) => s + e.saldo, 0))}</strong><small>saldo das encomendas</small></div>
      </section>
      <div class="barra-acoes">
        ${editar ? '<button class="btn primario" data-nova>+ Nova encomenda</button><button class="btn" data-cliente>+ Novo cliente</button>' : ""}
        <a class="btn suave" href="#/producao">Produção do dia</a>
        <span class="espaco"></span>
        <label class="check"><input type="checkbox" data-todas ${todas ? "checked" : ""}/> <span>Mostrar entregues antigas</span></label>
      </div>
      <div class="quadro">
        ${COLUNAS.map((s) => {
          const lista = encomendas.filter((e) => e.status === s);
          return `<div class="coluna"><div class="coluna-topo"><span>${NOMES.encomenda[s]}</span><b>${lista.length}</b></div>
            ${lista.map((e) => cartao(e, agora, editar)).join("") || '<small class="sutil centro">—</small>'}</div>`;
        }).join("")}
      </div>
      ${canceladas.length ? `<p class="sutil">${canceladas.length} encomenda(s) cancelada(s) recente(s): ${canceladas.map((e) => `<button class="link" data-abrir="${e.id}">nº ${e.id} · ${esc(e.cliente)}</button>`).join(", ")}</p>` : ""}`;

    const recarregar = () => abrir(area);
    $("[data-todas]", area).addEventListener("change", (e) => {
      todas = e.target.checked;
      recarregar();
    });
    $("[data-nova]", area)?.addEventListener("click", () => form(null, clientes, produtos, recarregar));
    $("[data-cliente]", area)?.addEventListener("click", () => FA.novoCliente(recarregar));
    $$("[data-abrir]", area).forEach((el) => el.addEventListener("click", (ev) => {
      if (ev.target.closest("button, a")) return;
      const e = encomendas.find((x) => x.id === Number(el.dataset.abrir));
      if (editar) form(e, clientes, produtos, recarregar);
    }));
    $$("[data-avancar]", area).forEach((b) => b.addEventListener("click", async () => {
      const e = encomendas.find((x) => x.id === Number(b.dataset.avancar));
      const proxima = COLUNAS[COLUNAS.indexOf(e.status) + 1];
      try {
        await api("PUT", `/api/encomendas/${e.id}`, { status: proxima });
        aviso(`Encomenda de ${e.cliente}: ${NOMES.encomenda[proxima]}.`);
        if (proxima === "entregue" && e.itens.length && !e.venda_id) return registrarVenda(e, recarregar);
        recarregar();
      } catch (erro) {
        aviso(erro.message, "erro");
      }
    }));
    $$("[data-vender]", area).forEach((b) => b.addEventListener("click", () => registrarVenda(encomendas.find((x) => x.id === Number(b.dataset.vender)), recarregar)));
  }

  function cartao(e, agora, editar) {
    const atrasada = !["entregue", "cancelada"].includes(e.status) && e.entrega_em < agora;
    const ehHoje = e.entrega_em.startsWith(hoje());
    const proxima = COLUNAS[COLUNAS.indexOf(e.status) + 1];
    const zap = whatsapp(e.telefone, mensagem(e));
    const pagamento = e.venda_id ? `<span class="etiqueta ok">Venda nº ${e.venda_id}</span>`
      : e.sinal && e.sinal >= e.valor ? '<span class="etiqueta ok">Pago</span>'
        : e.sinal ? `<span class="etiqueta info">Sinal ${dinheiro(e.sinal)} · falta ${dinheiro(e.saldo)}</span>`
          : e.valor ? '<span class="etiqueta alerta">A receber</span>' : "";
    return `<article class="pedido ${atrasada ? "atrasada" : ehHoje && e.status !== "entregue" ? "hoje" : ""}" data-abrir="${e.id}">
      <small>${atrasada ? "⚠ Atrasada · " : ""}${esc(quandoTexto(e.entrega_em))} · nº ${e.id}</small>
      <b>${esc(e.cliente)}</b>
      <span>${esc(e.ocasiao)} · ${dinheiro(e.valor)}</span>
      ${e.itens.length ? `<ul class="itens-pedido">${e.itens.map((i) => `<li>${qtd(i.quantidade)}× ${esc(i.nome)}</li>`).join("")}</ul>` : ""}
      ${e.endereco ? `<p>📍 ${esc(e.endereco)}</p>` : "<p>🏬 Retirada na loja</p>"}
      ${e.mensagem_cartao ? `<p>💌 “${esc(e.mensagem_cartao)}”</p>` : ""}
      ${e.observacoes ? `<p>${esc(e.observacoes)}</p>` : ""}
      <div>${pagamento}</div>
      <div class="acoes">
        ${editar && proxima ? `<button class="btn pequeno" data-avancar="${e.id}">→ ${NOMES.encomenda[proxima]}</button>` : ""}
        ${editar && e.itens.length && !e.venda_id && e.status !== "cancelada" && ["pronto", "entrega", "entregue"].includes(e.status) ? `<button class="btn pequeno primario" data-vender="${e.id}">Registrar venda</button>` : ""}
        ${zap ? `<a class="btn pequeno" href="${zap}" target="_blank" rel="noopener" title="Avisar ${esc(telefone(e.telefone))} pelo WhatsApp">WhatsApp</a>` : ""}
      </div>
    </article>`;
  }

  // Encomenda vira venda: entra no faturamento e tira os materiais do estoque.
  function registrarVenda(e, depois) {
    const dialogo = janela(`
      <form class="form-janela pequena" novalidate>
        <header class="janela-topo"><h2>Registrar a venda da encomenda nº ${e.id}</h2><button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        <p>${esc(e.cliente)} · ${e.itens.map((i) => `${qtd(i.quantidade)}× ${esc(i.nome)}`).join(", ")}</p>
        <div class="lista-simples">
          <div><span>Valor total</span><b>${dinheiro(e.valor)}</b></div>
          ${e.sinal ? `<div><span>Sinal já recebido (${NOMES.pagamento[e.sinal_forma] || ""})</span><b>${dinheiro(e.sinal)}</b></div>` : ""}
          <div><span>Receber agora</span><b>${dinheiro(e.saldo)}</b></div>
        </div>
        <label>Forma de pagamento do saldo<select name="pagamento">${FA.opcoes(NOMES.pagamento).map((o) => `<option value="${o.valor}" ${o.valor === (e.sinal_forma || "pix") ? "selected" : ""}>${o.rotulo}</option>`).join("")}</select></label>
        <p class="sutil">A venda entra no faturamento do dia e os materiais da ficha técnica saem do estoque.</p>
        <p class="erro"></p>
        <footer><button type="button" class="btn" data-fechar>Depois</button><button class="btn primario">Registrar venda</button></footer>
      </form>`, { aoFechar: depois });
    const form = $("form", dialogo);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const venda = await api("POST", `/api/encomendas/${e.id}/venda`, { pagamento: form.elements.pagamento.value });
        aviso(`Venda nº ${venda.id} registrada: ${dinheiro(venda.total)}.`);
        dialogo.close();
      } catch (erro) {
        $(".erro", form).textContent = erro.message;
      }
    });
  }

  function form(e, clientes, produtos, depois) {
    if (!clientes.length) return aviso("Cadastre o cliente primeiro (botão “Novo cliente”).", "erro");
    const travada = Boolean(e?.venda_id);
    const vendaveis = produtos.filter((p) => p.tipo !== "material" || p.preco > 0);
    let itens = (e?.itens || []).map((i) => ({ produto_id: i.produto_id, nome: i.nome, quantidade: i.quantidade, preco_unit: i.preco_unit }));
    const valores = e ? { ...e } : { entrega_em: `${FA.somarDias(hoje(), 1)}T10:00`, ocasiao: "Aniversário", sinal_forma: "pix" };
    const campos = [
      { nome: "cliente_id", rotulo: "Cliente", tipo: "select", obrigatorio: true, largo: true, opcoes: clientes.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.telefone ? ` · ${telefone(c.telefone)}` : ""}` })) },
      { nome: "ocasiao", rotulo: "Ocasião", lista: OCASIOES, obrigatorio: true },
      { nome: "entrega_em", rotulo: "Entregar / retirar em", tipo: "datahora", obrigatorio: true },
      ...(e ? [{ nome: "status", rotulo: "Situação", tipo: "select", vazio: false, opcoes: FA.opcoes(NOMES.encomenda) }] : []),
      { nome: "endereco", rotulo: "Endereço de entrega", placeholder: "Em branco = cliente retira na loja", max: 250, largo: !e },
      { nome: "mensagem_cartao", rotulo: "Mensagem do cartão", tipo: "textarea", largo: true },
      { nome: "observacoes", rotulo: "Observações (cores, embalagem, horário…)", tipo: "textarea", largo: true },
    ];
    const dialogo = janela(`
      <form class="form-janela larga" novalidate>
        <header class="janela-topo"><h2>${e ? `Encomenda nº ${e.id}` : "Nova encomenda"}</h2><button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        ${travada ? `<p class="destaque-texto">Esta encomenda já virou a venda nº ${e.venda_id}: produtos e valores não mudam mais.</p>` : ""}
        <div class="campos">${campos.map((c) => campoHtml(c, valores[c.nome])).join("")}</div>
        <h4 class="campos-titulo">Produtos</h4>
        <div data-itens></div>
        ${travada ? "" : `<div class="barra-acoes"><select data-produto class="busca"><option value="">Adicionar produto…</option>${vendaveis.map((p) => `<option value="${p.id}">${esc(p.nome)} — ${dinheiro(p.preco)}</option>`).join("")}</select></div>`}
        <div class="campos c3">
          <label>Taxa de entrega (R$)<input name="taxa_entrega" inputmode="decimal" value="${FA.paraCampo(e?.taxa_entrega || 0)}" ${travada ? "disabled" : ""}/></label>
          <label>Sinal recebido (R$)<input name="sinal" inputmode="decimal" value="${FA.paraCampo(e?.sinal || 0)}"/></label>
          <label>Forma do sinal<select name="sinal_forma">${FA.opcoes(NOMES.pagamento).map((o) => `<option value="${o.valor}" ${o.valor === (valores.sinal_forma || "pix") ? "selected" : ""}>${o.rotulo}</option>`).join("")}</select></label>
          <label data-valor-manual>Valor combinado (R$)<input name="valor" inputmode="decimal" value="${FA.paraCampo(e?.valor || 0)}" ${travada ? "disabled" : ""}/><small>Sem produtos na lista, informe o valor.</small></label>
        </div>
        <div class="carrinho-total"><div class="total"><span>Total</span><span data-total></span></div><div><span>Falta receber</span><b data-saldo></b></div></div>
        <p class="erro"></p>
        <footer><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">${e ? "Salvar" : "Agendar encomenda"}</button></footer>
      </form>`, { aoFechar: depois });
    const f = $("form", dialogo);
    const totais = () => {
      const produtosTotal = itens.reduce((s, i) => s + Math.round(i.quantidade * i.preco_unit), 0);
      const taxa = lerDinheiro(f.elements.taxa_entrega.value) || 0;
      const total = itens.length ? produtosTotal + taxa : lerDinheiro(f.elements.valor.value) || 0;
      const sinal = lerDinheiro(f.elements.sinal.value) || 0;
      $("[data-total]", f).textContent = dinheiro(total);
      $("[data-saldo]", f).textContent = dinheiro(Math.max(0, total - sinal));
      $("[data-valor-manual]", f).classList.toggle("oculto", itens.length > 0);
    };
    const desenharItens = () => {
      $("[data-itens]", f).innerHTML = itens.length ? itens.map((i, n) => `
        <div class="ficha-linha">
          <span>${esc(i.nome)} · ${dinheiro(i.preco_unit)}</span>
          <span class="controles">${travada ? `<b>${qtd(i.quantidade)}</b>` : `<input value="${String(i.quantidade).replace(".", ",")}" inputmode="decimal" data-qtd="${n}" style="width:70px;min-height:32px;text-align:center"/> <button type="button" class="link" data-tirar="${n}">tirar</button>`}</span>
        </div>`).join("") : '<div class="vazio-linha">Sem produtos: escolha abaixo (assim o sistema calcula o valor, separa os materiais e baixa o estoque na venda).</div>';
      $$("[data-qtd]", f).forEach((input) => input.addEventListener("change", () => {
        const n = lerNumero(input.value);
        if (Number.isFinite(n) && n > 0) itens[Number(input.dataset.qtd)].quantidade = n;
        desenharItens();
      }));
      $$("[data-tirar]", f).forEach((b) => b.addEventListener("click", () => {
        itens.splice(Number(b.dataset.tirar), 1);
        desenharItens();
      }));
      totais();
    };
    $("[data-produto]", f)?.addEventListener("change", (ev) => {
      const p = vendaveis.find((x) => x.id === Number(ev.target.value));
      if (p) {
        const existente = itens.find((i) => i.produto_id === p.id);
        if (existente) existente.quantidade += 1;
        else itens.push({ produto_id: p.id, nome: p.nome, quantidade: 1, preco_unit: p.preco });
      }
      ev.target.value = "";
      desenharItens();
    });
    f.addEventListener("input", totais);
    desenharItens();

    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const erro = $(".erro", f);
      erro.textContent = "";
      try {
        const d = lerCampos(f, campos);
        const sinal = lerDinheiro(f.elements.sinal.value);
        if (Number.isNaN(sinal)) throw new Error("Sinal: valor inválido.");
        Object.assign(d, { sinal: sinal || 0, sinal_forma: f.elements.sinal_forma.value });
        if (!travada) {
          const taxa = lerDinheiro(f.elements.taxa_entrega.value);
          const valor = lerDinheiro(f.elements.valor.value);
          if (Number.isNaN(taxa) || Number.isNaN(valor)) throw new Error("Confira os valores.");
          Object.assign(d, { taxa_entrega: taxa || 0, valor: valor || 0, itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco_unit: i.preco_unit })) });
        }
        if (e) await api("PUT", `/api/encomendas/${e.id}`, d);
        else await api("POST", "/api/encomendas", d);
        aviso(e ? "Encomenda atualizada." : "Encomenda agendada.");
        dialogo.close();
      } catch (problema) {
        erro.textContent = problema.message;
      }
    });
  }

  FA.telas.encomendas = { subtitulo: "Pedidos agendados para datas especiais", abrir };
})();
