"use strict";

// Painel: vendas do dia e do mês, buquês, coroas por dia da semana, agenda, aniversários e estoque baixo.
(() => {
  const { $, esc, api, dinheiro, dinheiroCurto, qtd, grafico, quandoTexto, dataCurta, whatsapp, NOMES, pode } = FA;
  let periodo = "mes";

  const indicador = (titulo, valor, detalhe, classe = "") =>
    `<div class="cartao indicador ${classe}"><span>${esc(titulo)}</span><strong>${valor}</strong><small>${esc(detalhe)}</small></div>`;

  async function abrir(area) {
    const d = await api("GET", `/api/painel?periodo=${periodo}`);
    if (!area.isConnected) return;
    const hojeQtd = d.hoje.quantidade;
    const melhorCoroa = d.coroas.por_dia.findIndex((p) => p.dia === d.coroas.melhor?.dia);
    const variacao = d.mes.anterior ? Math.round(((d.mes.total - d.mes.anterior) / d.mes.anterior) * 100) : null;
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    const dataExtenso = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    area.innerHTML = `
      <section class="boas-vindas">
        <div><h2>${saudacao}, ${esc(/^equipe/i.test(FA.estado.usuario.nome) ? FA.estado.usuario.nome : FA.primeiroNome(FA.estado.usuario.nome))}!</h2><p class="sutil">Hoje é ${esc(dataExtenso)}.</p></div>
        ${pode("vendas.registrar") ? '<a class="btn primario" href="#/vendas">+ Nova venda</a>' : ""}
      </section>

      ${d.datas.length ? `<section class="datas">${d.datas.slice(0, 3).map((x) => `
        <div class="data-comemorativa ${x.faltam <= 7 ? "perto" : ""}">
          <div class="contagem"><strong>${x.faltam === 0 ? "Hoje" : x.faltam}</strong>${x.faltam === 0 ? "" : `<span>${x.faltam === 1 ? "dia" : "dias"}</span>`}</div>
          <div><b>${esc(x.nome)}</b> <small class="sutil">${dataCurta(x.dia)}</small><p>${esc(x.dica)}</p></div>
        </div>`).join("")}</section>` : ""}

      <section class="grade g4">
        ${indicador("Vendas hoje", dinheiro(d.hoje.total), `${hojeQtd} ${hojeQtd === 1 ? "venda" : "vendas"}`)}
        <div class="cartao indicador"><span>Vendas no mês</span><strong>${dinheiro(d.mes.total)}</strong>
          <small>${variacao === null ? "" : `<b class="${variacao >= 0 ? "sobe" : "desce"}">${variacao >= 0 ? "▲" : "▼"} ${Math.abs(variacao)}%</b> em relação ao mesmo período do mês passado · `}${d.mes.quantidade} vendas · ticket médio ${dinheiro(d.mes.ticket)}</small></div>
        ${d.contas
          ? `<a class="cartao indicador ${d.contas.vencidas ? "alerta" : ""}" href="#/financeiro"><span>Contas a pagar (7 dias)</span><strong>${dinheiro(d.contas.total)}</strong><small>${d.contas.quantidade} conta(s)${d.contas.vencidas ? ` · ${d.contas.vencidas} vencida(s)` : ""}</small></a>`
          : indicador("Itens à venda", d.produtos, "produtos e serviços ativos")}
        ${indicador("Estoque baixo", d.estoque_baixo.length, d.estoque_baixo.length ? "precisam de reposição" : "tudo em ordem", d.estoque_baixo.length ? "alerta" : "")}
      </section>

      <section class="grade g3">
        <div class="secao-titulo" style="grid-column:1/-1"><span>Produção de buquês</span><h2>Quantidade vendida</h2></div>
        ${indicador("Buquês hoje", qtd(d.buques.hoje), "unidades vendidas no dia")}
        ${indicador("Buquês na semana", qtd(d.buques.semana), "desde segunda-feira")}
        ${indicador("Buquês no mês", qtd(d.buques.mes), "acumulado do mês")}
      </section>

      <section class="cartao">
        <div class="cartao-topo">
          <h3>Desempenho de vendas</h3>
          <div class="chips">
            <button class="chip ${periodo === "mes" ? "ativo" : ""}" data-periodo="mes">Mês (por dia)</button>
            <button class="chip ${periodo === "ano" ? "ativo" : ""}" data-periodo="ano">Ano (por mês)</button>
          </div>
        </div>
        ${grafico(d.serie.map((p) => ({ rotulo: p.rotulo, valor: p.total })), { tipo: periodo === "mes" ? "linha" : "barras", formato: dinheiroCurto })}
      </section>

      <section class="grade g2">
        <div class="cartao">
          <div class="cartao-topo"><div><h3>Coroas por dia da semana</h3><small>Últimos ${d.coroas.dias} dias</small></div></div>
          ${grafico(d.coroas.por_dia.map((p) => ({ rotulo: p.dia, valor: p.quantidade })), { formato: (v) => qtd(v), largura: 600, altura: 260, destaque: d.coroas.melhor ? melhorCoroa : -1 })}
          <p class="destaque-texto">${d.coroas.melhor
            ? `<b>${esc(d.coroas.melhor.dia)}</b> é o dia com mais coroas vendidas: <b>${qtd(d.coroas.melhor.quantidade)}</b> unidades. Vale reforçar o estoque de flores na véspera.`
            : "Ainda não há vendas de coroas suficientes para indicar o melhor dia."}</p>
        </div>
        <div class="cartao">
          <div class="cartao-topo"><h3>Agenda dos próximos 7 dias</h3>${pode("vendas.ver") ? '<a href="#/encomendas">Ver encomendas</a>' : ""}</div>
          ${d.agenda.length ? `<div class="lista-simples">${d.agenda.map((a) => `
            <div>
              <span><b>${esc(a.cliente)}</b><br><small class="sutil">${a.origem === "encomenda" ? `Encomenda · ${esc(a.descricao)} · ${esc(NOMES.encomenda[a.status])}` : `Venda nº ${a.id} · ${esc(NOMES.recebimento[a.descricao])}`}${a.endereco ? ` · ${esc(a.endereco)}` : ""}</small></span>
              <span class="etiqueta ${a.atrasada ? "perigo" : a.quando.startsWith(FA.hoje()) ? "alerta" : "rosa"}">${a.atrasada ? "Atrasada · " : ""}${esc(quandoTexto(a.quando))}</span>
            </div>`).join("")}</div>` : '<div class="vazio-linha">Nenhuma entrega ou retirada marcada para os próximos dias.</div>'}
        </div>
      </section>

      <section class="grade g3">
        <div class="cartao">
          <div class="cartao-topo"><h3>Entregas de hoje</h3>${pode("frota.ver") ? '<a href="#/frota">Frota</a>' : ""}</div>
          <div class="lista-simples">
            <div><span>Entregas realizadas</span><b>${qtd(d.entregas_hoje.quantidade)}</b></div>
            <div><span>Valor por entrega</span><b>${dinheiro(d.entregas_hoje.valor_medio)}</b></div>
            <div><span>Total a pagar</span><b>${dinheiro(d.entregas_hoje.total)}</b></div>
            <div><span>Combustível no mês</span><b>${dinheiro(d.frota_mes.combustivel)}</b></div>
            <div><span>Manutenção no mês</span><b>${dinheiro(d.frota_mes.manutencao)}</b></div>
          </div>
        </div>
        <div class="cartao">
          <div class="cartao-topo"><h3>Aniversários (30 dias)</h3></div>
          ${d.aniversariantes.length ? `<div class="lista-simples">${d.aniversariantes.map((c) => {
            const zap = whatsapp(c.telefone, `Olá, ${FA.primeiroNome(c.nome)}! A equipe ${FA.estado.sistema.loja.nome} deseja um feliz aniversário, cheio de flores e momentos especiais! 🌷`);
            return `<div><span><b>${esc(c.nome)}</b><br><small class="sutil">${esc(FA.telefone(c.telefone) || "sem telefone")}</small></span>
              <span>${c.proximo === FA.hoje() ? '<span class="etiqueta ok">Hoje!</span>' : `<span class="etiqueta rosa">${dataCurta(c.proximo)}</span>`}
              ${zap ? ` <a href="${zap}" target="_blank" rel="noopener" title="Mandar mensagem no WhatsApp">WhatsApp</a>` : ""}</span></div>`;
          }).join("")}</div>` : '<div class="vazio-linha">Nenhum cliente faz aniversário nos próximos 30 dias.</div>'}
        </div>
        <div class="cartao">
          <div class="cartao-topo"><h3>Estoque baixo</h3>${pode("estoque.ver") ? '<a href="#/estoque">Estoque</a>' : ""}</div>
          ${d.estoque_baixo.length ? `<div class="lista-simples">${d.estoque_baixo.slice(0, 8).map((p) => `
            <div><span>${esc(p.nome)}</span><span class="etiqueta ${p.estoque <= 0 ? "perigo" : "alerta"}">${qtd(p.estoque)} ${esc(p.unidade)} (mín. ${qtd(p.estoque_minimo)})</span></div>`).join("")}
            ${d.estoque_baixo.length > 8 ? `<div><small class="sutil">e mais ${d.estoque_baixo.length - 8}…</small></div>` : ""}</div>` : '<div class="vazio-linha">Nenhum item abaixo do mínimo.</div>'}
        </div>
      </section>`;

    area.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => {
      periodo = b.dataset.periodo;
      abrir(area);
    }));
  }

  FA.telas.painel = { subtitulo: "Resumo do dia e do mês", abrir };
})();
