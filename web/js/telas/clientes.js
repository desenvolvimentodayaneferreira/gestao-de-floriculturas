"use strict";

// Clientes: cadastro único por CPF, preferências, aniversário e histórico de compras.
(() => {
  const { $, $$, esc, api, aviso, dinheiro, cpf, telefone, data, dataHora, tabela, formulario, janela, NOMES, pode, whatsapp, baixarCsv, csvDinheiro } = FA;
  let busca = "";

  const campos = () => [
    { nome: "nome", rotulo: "Nome completo", obrigatorio: true, largo: true, max: 120 },
    { nome: "cpf", rotulo: FA.estado.sistema.exigir_cpf ? "CPF" : "CPF (opcional)", tipo: "cpf", obrigatorio: FA.estado.sistema.exigir_cpf },
    { nome: "telefone", rotulo: "Telefone / WhatsApp", tipo: "telefone" },
    { nome: "email", rotulo: "E-mail", tipo: "email", max: 120 },
    { nome: "aniversario", rotulo: "Aniversário", tipo: "data" },
    { nome: "endereco", rotulo: "Endereço", largo: true, max: 250 },
    { nome: "observacoes", rotulo: "Preferências e observações", tipo: "textarea", largo: true, placeholder: "Ex.: prefere tons rosé, alergia a lírio…" },
  ];

  function novoCliente(depois) {
    formulario({
      titulo: "Novo cliente",
      campos: campos(),
      botao: "Cadastrar cliente",
      salvar: async (d) => {
        await api("POST", "/api/clientes", d);
        aviso("Cliente cadastrado.");
        depois?.();
      },
    });
  }
  FA.novoCliente = novoCliente;

  async function abrir(area) {
    area.innerHTML = `
      <div class="faixa"><div><span>Relacionamento</span><h2>Clientes que voltam florescem com a marca</h2><p>Preferências, datas importantes e histórico de compras reunidos em um só lugar.</p></div>${FA.icone("clientes", 44)}</div>
      <section class="cartao">
        <div class="barra-acoes" style="margin-bottom:14px">
          <input class="busca" name="busca" value="${esc(busca)}" placeholder="Buscar por nome, CPF ou telefone" autocomplete="off"/>
          ${pode("vendas.registrar") ? '<button class="btn primario" data-novo>+ Novo cliente</button>' : ""}
          <button class="btn suave" data-csv>Exportar planilha</button>
        </div>
        <div data-lista><div class="carregando">Carregando…</div></div>
      </section>`;
    let clientes = [];
    const carregar = async () => {
      clientes = await api("GET", `/api/clientes?busca=${encodeURIComponent(busca)}`);
      const alvo = $("[data-lista]", area);
      if (!alvo) return;
      alvo.innerHTML = tabela([
        { titulo: "Cliente", valor: (c) => `<b>${esc(c.nome)}</b>${c.observacoes ? `<br><small class="sutil">${esc(c.observacoes.slice(0, 80))}</small>` : ""}` },
        { titulo: "CPF", valor: (c) => (c.cpf ? cpf(c.cpf) : "—") },
        { titulo: "Contato", valor: (c) => esc(telefone(c.telefone) || c.email || "—") },
        { titulo: "Aniversário", valor: (c) => (c.aniversario ? data(c.aniversario).slice(0, 5) : "—") },
        { titulo: "Compras", classe: "numero", valor: (c) => c.compras },
        { titulo: "Total comprado", classe: "numero", valor: (c) => dinheiro(c.total_compras) },
        { titulo: "Última compra", valor: (c) => (c.ultima_compra ? dataHora(c.ultima_compra).slice(0, 8) : "—") },
      ], clientes, { vazio: busca ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda.", clicavel: true });
      $$("tbody tr", alvo).forEach((tr) => tr.addEventListener("click", () => detalhe(clientes[Number(tr.dataset.indice)].id, carregar)));
    };
    let espera;
    $('[name="busca"]', area).addEventListener("input", (e) => {
      busca = e.target.value.trim();
      clearTimeout(espera);
      espera = setTimeout(carregar, 250);
    });
    $("[data-novo]", area)?.addEventListener("click", () => novoCliente(carregar));
    $("[data-csv]", area).addEventListener("click", () => baixarCsv("clientes.csv",
      ["Nome", "CPF", "Telefone", "E-mail", "Aniversário", "Endereço", "Preferências", "Compras", "Total comprado"],
      clientes.map((c) => [c.nome, cpf(c.cpf), telefone(c.telefone), c.email, data(c.aniversario), c.endereco, c.observacoes, c.compras, csvDinheiro(c.total_compras)])));
    await carregar();
  }

  async function detalhe(id, depois) {
    const c = await api("GET", `/api/clientes/${id}`);
    const zap = whatsapp(c.telefone);
    const dialogo = janela(`
      <div class="form-janela larga">
        <header class="janela-topo"><h2>${esc(c.nome)}</h2><button class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        <div class="grade g2">
          <div class="lista-simples">
            <div><span>CPF</span><b>${c.cpf ? cpf(c.cpf) : "—"}</b></div>
            <div><span>Telefone</span><b>${esc(telefone(c.telefone) || "—")}${zap ? ` · <a href="${zap}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</b></div>
            <div><span>E-mail</span><b>${esc(c.email || "—")}</b></div>
            <div><span>Aniversário</span><b>${data(c.aniversario)}</b></div>
            <div><span>Endereço</span><b>${esc(c.endereco || "—")}</b></div>
          </div>
          <div><h3>Preferências</h3><p class="destaque-texto" style="margin-top:8px">${esc(c.observacoes || "Nenhuma anotação.")}</p></div>
        </div>
        <h3>Compras</h3>
        ${tabela([
          { titulo: "Nº", valor: (v) => v.id },
          { titulo: "Data", valor: (v) => dataHora(v.criado_em) },
          { titulo: "Recebimento", valor: (v) => NOMES.recebimento[v.recebimento] },
          { titulo: "Pagamento", valor: (v) => NOMES.pagamento[v.pagamento] },
          { titulo: "Total", classe: "numero", valor: (v) => dinheiro(v.total) },
          { titulo: "", valor: (v) => (v.status === "cancelada" ? '<span class="etiqueta perigo">Cancelada</span>' : "") },
        ], c.vendas, { vazio: "Nenhuma compra registrada.", clicavel: true })}
        <h3>Encomendas</h3>
        ${tabela([
          { titulo: "Nº", valor: (e) => e.id },
          { titulo: "Entrega", valor: (e) => dataHora(e.entrega_em) },
          { titulo: "Ocasião", valor: (e) => esc(e.ocasiao) },
          { titulo: "Situação", valor: (e) => NOMES.encomenda[e.status] },
          { titulo: "Valor", classe: "numero", valor: (e) => dinheiro(e.valor) },
        ], c.encomendas, { vazio: "Nenhuma encomenda." })}
        <footer>${pode("vendas.registrar") ? '<button class="btn" data-editar>Editar cadastro</button>' : ""}<button class="btn primario" data-fechar>Fechar</button></footer>
      </div>`);
    $$("table.clicavel tbody tr", dialogo).forEach((tr) => tr.addEventListener("click", () => FA.vendaDetalhe(c.vendas[Number(tr.dataset.indice)].id)));
    $("[data-editar]", dialogo)?.addEventListener("click", () => {
      dialogo.close();
      formulario({
        titulo: "Editar cliente",
        campos: campos().map((x) => (x.nome === "cpf" ? { ...x, obrigatorio: false } : x)),
        valores: c,
        salvar: async (d) => {
          await api("PUT", `/api/clientes/${c.id}`, d);
          aviso("Cadastro atualizado.");
          depois();
        },
      });
    });
  }

  FA.telas.clientes = { subtitulo: "Cadastro e histórico de cada cliente", abrir };
})();
