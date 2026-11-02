"use strict";

// Produção do dia: o que montar, materiais necessários x estoque (lista de compras) e roteiro de entregas.
(() => {
  const { $, $$, esc, api, dinheiro, qtd, hoje, somarDias, data, quandoTexto, tabela, telefone, whatsapp, NOMES } = FA;
  let periodo = "hoje";

  const PERIODOS = {
    hoje: ["Hoje", () => [hoje(), hoje()]],
    amanha: ["Amanhã", () => [somarDias(hoje(), 1), somarDias(hoje(), 1)]],
    semana: ["Próximos 7 dias", () => [hoje(), somarDias(hoje(), 6)]],
  };
  const mapa = (endereco) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;

  // Imprime só uma parte da tela (lista de compras, roteiro ou fichas).
  function imprimir(secao) {
    secao.classList.add("imprimir-isto");
    document.body.classList.add("imprimir-parte");
    window.print();
    setTimeout(() => {
      secao.classList.remove("imprimir-isto");
      document.body.classList.remove("imprimir-parte");
    }, 500);
  }

  async function abrir(area) {
    const [de, ate] = PERIODOS[periodo][1]();
    const p = await api("GET", `/api/producao?de=${de}&ate=${ate}`);
    if (!area.isConnected) return;
    const aComprar = p.materiais.filter((m) => m.comprar > 0);
    const titulo = de === ate ? data(de) : `${data(de)} a ${data(ate)}`;
    const textoCompras = `Lista de compras — ${FA.estado.sistema.loja.nome} (${titulo})\n${aComprar.map((m) => `• ${qtd(m.comprar)} ${m.unidade} de ${m.nome}`).join("\n")}`;
    area.innerHTML = `
      <div class="barra-acoes">
        <div class="chips">${Object.entries(PERIODOS).map(([id, [rotulo]]) => `<button class="chip ${periodo === id ? "ativo" : ""}" data-periodo="${id}">${rotulo}</button>`).join("")}</div>
        <span class="espaco"></span><span class="sutil">${titulo}</span>
      </div>
      <section class="grade g4">
        <div class="cartao indicador"><span>Encomendas para montar</span><strong>${p.encomendas.length}</strong><small>${p.encomendas.reduce((s, e) => s + e.itens.reduce((t, i) => t + i.quantidade, 0), 0)} peças no total</small></div>
        <div class="cartao indicador"><span>Entregas no roteiro</span><strong>${p.roteiro.length}</strong><small>encomendas e vendas com entrega</small></div>
        <div class="cartao indicador ${p.materiais.some((m) => m.falta > 0) ? "alerta" : ""}"><span>Itens para comprar</span><strong>${aComprar.length}</strong><small>${p.materiais.filter((m) => m.falta > 0).length} faltam para as encomendas</small></div>
        <div class="cartao indicador"><span>Custo estimado da compra</span><strong>${dinheiro(p.custo_compras)}</strong><small>pelo último custo de cada item</small></div>
      </section>

      <section class="cartao" data-secao="montar">
        <div class="cartao-topo"><div><h3>O que montar</h3><small>Encomendas em aberto no período, com a mensagem de cada cartão.</small></div>${p.encomendas.length ? '<button class="btn pequeno" data-imprimir="montar">Imprimir fichas de produção</button>' : ""}</div>
        ${p.encomendas.length ? `<div class="fichas-producao">${p.encomendas.map((e) => `
          <article class="ficha-producao">
            <header><b>${esc(quandoTexto(e.entrega_em))}</b><span class="etiqueta rosa">${esc(NOMES.encomenda[e.status])}</span></header>
            <h3>${esc(e.cliente)} <small class="sutil">· nº ${e.id} · ${esc(e.ocasiao)}</small></h3>
            ${e.itens.length ? `<ul>${e.itens.map((i) => `<li><b>${qtd(i.quantidade)}×</b> ${esc(i.nome)}</li>`).join("")}</ul>` : `<p class="sutil">Sem produtos cadastrados${e.observacoes ? "" : " — veja com o atendimento"}.</p>`}
            ${e.observacoes ? `<p>📝 ${esc(e.observacoes)}</p>` : ""}
            ${e.mensagem_cartao ? `<p class="cartao-mensagem">“${esc(e.mensagem_cartao)}”</p>` : ""}
            <p class="sutil">${e.endereco ? `📍 ${esc(e.endereco)}` : "🏬 Retirada na loja"}</p>
          </article>`).join("")}</div>` : '<div class="vazio-linha">Nenhuma encomenda para montar neste período.</div>'}
      </section>

      <section class="cartao" data-secao="compras">
        <div class="cartao-topo"><div><h3>Materiais e lista de compras</h3><small>Quanto as encomendas vão usar (pelas fichas técnicas) e quanto comprar para atender e manter o estoque mínimo.</small></div>
          ${aComprar.length ? `<div class="barra-acoes"><a class="btn pequeno" href="https://wa.me/?text=${encodeURIComponent(textoCompras)}" target="_blank" rel="noopener">Enviar por WhatsApp</a><button class="btn pequeno" data-imprimir="compras">Imprimir lista de compras</button></div>` : ""}</div>
        ${tabela([
          { titulo: "Material", valor: (m) => `<b>${esc(m.nome)}</b>` },
          { titulo: "Para as encomendas", classe: "numero", valor: (m) => (m.precisa ? `${qtd(m.precisa)} ${esc(m.unidade)}` : "—") },
          { titulo: "Em estoque", classe: "numero", valor: (m) => `${qtd(m.estoque)} ${esc(m.unidade)}` },
          { titulo: "Mínimo", classe: "numero", valor: (m) => qtd(m.estoque_minimo) },
          { titulo: "Comprar", classe: "numero", valor: (m) => (m.comprar ? `<b>${qtd(m.comprar)} ${esc(m.unidade)}</b>` : "—") },
          { titulo: "Custo estimado", classe: "numero", valor: (m) => dinheiro(Math.round(m.comprar * m.custo)) },
          { titulo: "", valor: (m) => (m.falta > 0 ? '<span class="etiqueta perigo">Falta para encomenda</span>' : m.comprar > 0 ? '<span class="etiqueta alerta">Abaixo do mínimo</span>' : '<span class="etiqueta ok">Tem</span>') },
        ], p.materiais, { vazio: "Nada para comprar: o estoque atende as encomendas e está acima do mínimo." })}
      </section>

      <section class="cartao" data-secao="roteiro">
        <div class="cartao-topo"><div><h3>Roteiro de entregas</h3><small>Em ordem de horário, com endereço no mapa e o valor a receber na entrega.</small></div>${p.roteiro.length ? '<button class="btn pequeno" data-imprimir="roteiro">Imprimir roteiro</button>' : ""}</div>
        ${p.roteiro.length ? `<ol class="roteiro">${p.roteiro.map((r) => {
          const zap = whatsapp(r.telefone, `Olá, ${FA.primeiroNome(r.cliente)}! Aqui é da ${FA.estado.sistema.loja.nome} 🌷 Seu pedido está a caminho.`);
          return `<li>
            <div class="roteiro-hora">${esc(quandoTexto(r.quando))}</div>
            <div class="roteiro-dados">
              <b>${esc(r.cliente)}</b> <small class="sutil">${r.origem === "encomenda" ? `encomenda nº ${r.id}` : `venda nº ${r.id}`}${r.telefone ? ` · ${esc(telefone(r.telefone))}` : ""}</small>
              <p>📍 <a href="${mapa(r.endereco)}" target="_blank" rel="noopener">${esc(r.endereco)}</a></p>
              ${r.descricao ? `<p class="sutil">${esc(r.descricao)}</p>` : ""}
            </div>
            <div class="roteiro-acoes">${r.saldo ? `<span class="etiqueta alerta">Receber ${dinheiro(r.saldo)}</span>` : '<span class="etiqueta ok">Pago</span>'}${zap ? ` <a class="btn pequeno nao-imprimir" href="${zap}" target="_blank" rel="noopener">Avisar</a>` : ""}</div>
          </li>`;
        }).join("")}</ol>` : '<div class="vazio-linha">Nenhuma entrega marcada neste período.</div>'}
      </section>`;

    $$("[data-periodo]", area).forEach((b) => b.addEventListener("click", () => {
      periodo = b.dataset.periodo;
      abrir(area);
    }));
    $$("[data-imprimir]", area).forEach((b) => b.addEventListener("click", () => imprimir($(`[data-secao="${b.dataset.imprimir}"]`, area))));
  }

  FA.telas.producao = { subtitulo: "O que montar, o que comprar e para onde entregar", abrir };
})();
