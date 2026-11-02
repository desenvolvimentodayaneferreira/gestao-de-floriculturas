"use strict";

// Frota e entregas: fechamento diário do entregador, veículos, combustível e manutenção.
(() => {
  const { $, $$, esc, api, aviso, dinheiro, qtd, data, hoje, tabela, formulario, confirmar, lerDinheiro, NOMES, pode } = FA;

  async function abrir(area) {
    const [veiculos, abastecimentos, manutencoes, entregas] = await Promise.all([
      api("GET", "/api/frota/veiculos"), api("GET", "/api/frota/abastecimentos"), api("GET", "/api/frota/manutencoes"), api("GET", "/api/frota/entregas"),
    ]);
    if (!area.isConnected) return;
    const editar = pode("frota.registrar");
    const ativos = veiculos.filter((v) => v.ativo);
    const entregadores = [...new Set(entregas.map((e) => e.entregador))];
    area.innerHTML = `
      <div class="faixa"><div><span>Fechamento do expediente</span><h2>Entregas e pagamento do entregador</h2><p>Informe quantas entregas foram feitas e o valor de cada uma: o total é calculado na hora.</p></div>${FA.icone("frota", 44)}</div>

      ${editar ? `<section class="cartao">
        <div class="cartao-topo"><h3>Registrar fechamento de entregas</h3><b data-total-previsto>Total: R$ 0,00</b></div>
        <form class="campos c3" data-fechamento novalidate>
          <label>Data<input type="date" name="data" value="${hoje()}"/></label>
          <label>Entregador<input name="entregador" list="entregadores" maxlength="80" autocomplete="off"/><datalist id="entregadores">${entregadores.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist></label>
          <label>Quantidade de entregas<input name="quantidade" inputmode="numeric" value="1"/></label>
          <label>Valor por entrega (R$)<input name="valor_unit" inputmode="decimal" placeholder="0,00" value="${entregas[0] ? FA.paraCampo(entregas[0].valor_unit) : ""}"/></label>
          <label>Observação<input name="observacao" maxlength="200" autocomplete="off"/></label>
          <button class="btn primario" style="align-self:end">Registrar fechamento</button>
          <p class="erro largo"></p>
        </form>
      </section>` : ""}

      <section class="cartao">
        <div class="cartao-topo"><h3>Histórico de entregas</h3></div>
        ${tabela([
          { titulo: "Data", valor: (e) => data(e.data) },
          { titulo: "Entregador", valor: (e) => esc(e.entregador) },
          { titulo: "Entregas", classe: "numero", valor: (e) => e.quantidade },
          { titulo: "Valor unit.", classe: "numero", valor: (e) => dinheiro(e.valor_unit) },
          { titulo: "Total", classe: "numero", valor: (e) => `<b>${dinheiro(e.total)}</b>` },
          { titulo: "Observação", valor: (e) => esc(e.observacao || "—") },
          ...(editar ? [{ titulo: "", classe: "acoes", valor: (e) => `<button class="link" data-excluir-entrega="${e.id}">excluir</button>` }] : []),
        ], entregas.slice(0, 30), { vazio: "Nenhum fechamento registrado." })}
      </section>

      <section class="cartao">
        <div class="cartao-topo"><h3>Veículos</h3>
          ${editar ? `<div class="barra-acoes"><button class="btn" data-veiculo>+ Veículo</button>${ativos.length ? '<button class="btn" data-abastecer>Abastecimento</button><button class="btn" data-manutencao>Manutenção</button>' : ""}</div>` : ""}</div>
        ${tabela([
          { titulo: "Veículo", valor: (v) => `<b>${esc(v.nome)}</b><br><small class="sutil">${esc(v.placa)}${v.modelo ? ` · ${esc(v.modelo)}` : ""}${v.ano ? ` · ${v.ano}` : ""}</small>` },
          { titulo: "Km atual", classe: "numero", valor: (v) => qtd(v.km) },
          { titulo: "Consumo médio", classe: "numero", valor: (v) => (v.consumo_medio ? `${qtd(v.consumo_medio)} km/L` : "—") },
          { titulo: "Combustível", classe: "numero", valor: (v) => dinheiro(v.gasto_combustivel) },
          { titulo: "Manutenção", classe: "numero", valor: (v) => dinheiro(v.gasto_manutencao) },
          { titulo: "", valor: (v) => (v.ativo ? "" : '<span class="etiqueta">Desativado</span>') },
          ...(editar ? [{ titulo: "", classe: "acoes", valor: (v) => `<button class="link" data-editar-veiculo="${v.id}">editar</button>` }] : []),
        ], veiculos, { vazio: "Nenhum veículo cadastrado." })}
      </section>

      <section class="grade g2">
        <div class="cartao"><div class="cartao-topo"><h3>Abastecimentos</h3></div>
          ${tabela([
            { titulo: "Data", valor: (a) => data(a.data) },
            { titulo: "Veículo", valor: (a) => esc(a.placa) },
            { titulo: "Litros", classe: "numero", valor: (a) => qtd(a.litros) },
            { titulo: "Valor", classe: "numero", valor: (a) => dinheiro(a.valor) },
            { titulo: "Km", classe: "numero", valor: (a) => qtd(a.km) },
            { titulo: "Motorista", valor: (a) => `${esc(a.motorista || "—")}<br><small class="sutil">${NOMES.uso[a.tipo]}</small>` },
          ], abastecimentos.slice(0, 30), { vazio: "Nenhum abastecimento." })}
        </div>
        <div class="cartao"><div class="cartao-topo"><h3>Manutenções</h3></div>
          ${tabela([
            { titulo: "Data", valor: (m) => data(m.data) },
            { titulo: "Veículo", valor: (m) => esc(m.placa) },
            { titulo: "Serviço", valor: (m) => esc(m.descricao) },
            { titulo: "Valor", classe: "numero", valor: (m) => dinheiro(m.valor) },
            { titulo: "", valor: (m) => (m.status === "agendada" ? `<span class="etiqueta alerta">Agendada</span>${editar ? ` <button class="link" data-realizar="${m.id}">feita</button>` : ""}` : '<span class="etiqueta ok">Feita</span>') },
          ], manutencoes.slice(0, 30), { vazio: "Nenhuma manutenção." })}
        </div>
      </section>`;

    const recarregar = () => abrir(area);
    const fechamento = $("[data-fechamento]", area);
    if (fechamento) {
      const previsto = () => {
        const n = Number(fechamento.elements.quantidade.value) || 0;
        const v = lerDinheiro(fechamento.elements.valor_unit.value) || 0;
        $("[data-total-previsto]", area).textContent = `Total: ${dinheiro(n * v)}`;
      };
      fechamento.addEventListener("input", previsto);
      previsto();
      fechamento.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = fechamento.elements;
        const erro = $(".erro", fechamento);
        erro.textContent = "";
        const valor = lerDinheiro(f.valor_unit.value);
        if (valor === null || Number.isNaN(valor)) return (erro.textContent = "Informe o valor por entrega.");
        try {
          const r = await api("POST", "/api/frota/entregas", { data: f.data.value, entregador: f.entregador.value, quantidade: Number(f.quantidade.value), valor_unit: valor, observacao: f.observacao.value });
          aviso(`Fechamento registrado. Total a pagar: ${dinheiro(r.total)}.`);
          recarregar();
        } catch (problema) {
          erro.textContent = problema.message;
        }
      });
    }
    $$("[data-excluir-entrega]", area).forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmar("Excluir este fechamento de entregas?", { botao: "Excluir", perigo: true }))) return;
      await api("DELETE", `/api/frota/entregas/${b.dataset.excluirEntrega}`);
      recarregar();
    }));

    const opcoesVeiculos = ativos.map((v) => ({ valor: v.id, rotulo: `${v.nome} · ${v.placa}` }));
    $("[data-veiculo]", area)?.addEventListener("click", () => formulario({
      titulo: "Novo veículo",
      valores: { nome: "Moto de entrega" },
      campos: [
        { nome: "nome", rotulo: "Descrição", obrigatorio: true, max: 80 },
        { nome: "placa", rotulo: "Placa", obrigatorio: true, max: 8, placeholder: "ABC1D23" },
        { nome: "modelo", rotulo: "Modelo", max: 80 },
        { nome: "ano", rotulo: "Ano", tipo: "numero" },
        { nome: "km", rotulo: "Km atual", tipo: "quantidade" },
      ],
      salvar: async (d) => {
        await api("POST", "/api/frota/veiculos", d);
        aviso("Veículo cadastrado.");
        recarregar();
      },
    }));
    $$("[data-editar-veiculo]", area).forEach((b) => b.addEventListener("click", () => {
      const v = veiculos.find((x) => x.id === Number(b.dataset.editarVeiculo));
      formulario({
        titulo: `Veículo ${v.placa}`,
        valores: { ...v, ativo: Boolean(v.ativo) },
        campos: [
          { nome: "nome", rotulo: "Descrição", obrigatorio: true, max: 80 },
          { nome: "modelo", rotulo: "Modelo", max: 80 },
          { nome: "ativo", rotulo: "Em uso", tipo: "checkbox", largo: true },
        ],
        salvar: async (d) => {
          await api("PUT", `/api/frota/veiculos/${v.id}`, d);
          recarregar();
        },
      });
    }));
    $("[data-abastecer]", area)?.addEventListener("click", () => formulario({
      titulo: "Registrar abastecimento",
      valores: { data: hoje(), tipo: "entrega", veiculo_id: ativos.length === 1 ? ativos[0].id : "" },
      campos: [
        { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", obrigatorio: true, opcoes: opcoesVeiculos },
        { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
        { nome: "litros", rotulo: "Litros", tipo: "quantidade", obrigatorio: true },
        { nome: "valor", rotulo: "Valor pago (R$)", tipo: "dinheiro", obrigatorio: true },
        { nome: "km", rotulo: "Km no painel", tipo: "quantidade", obrigatorio: true },
        { nome: "motorista", rotulo: "Motorista", lista: entregadores, max: 80 },
        { nome: "tipo", rotulo: "Uso", tipo: "select", vazio: false, opcoes: FA.opcoes(NOMES.uso) },
        { nome: "observacao", rotulo: "Observação", max: 200 },
      ],
      salvar: async (d) => {
        await api("POST", "/api/frota/abastecimentos", d);
        aviso("Abastecimento registrado.");
        recarregar();
      },
    }));
    $("[data-manutencao]", area)?.addEventListener("click", () => formulario({
      titulo: "Registrar manutenção",
      valores: { data: hoje(), status: "realizada", veiculo_id: ativos.length === 1 ? ativos[0].id : "" },
      campos: [
        { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", obrigatorio: true, opcoes: opcoesVeiculos },
        { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
        { nome: "descricao", rotulo: "Serviço", obrigatorio: true, largo: true, max: 200, placeholder: "Ex.: troca de óleo, pneu traseiro" },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro" },
        { nome: "km", rotulo: "Km", tipo: "quantidade" },
        { nome: "status", rotulo: "Situação", tipo: "select", vazio: false, opcoes: [{ valor: "realizada", rotulo: "Já foi feita" }, { valor: "agendada", rotulo: "Agendada" }] },
      ],
      salvar: async (d) => {
        await api("POST", "/api/frota/manutencoes", d);
        aviso("Manutenção registrada.");
        recarregar();
      },
    }));
    $$("[data-realizar]", area).forEach((b) => b.addEventListener("click", () => {
      const m = manutencoes.find((x) => x.id === Number(b.dataset.realizar));
      formulario({
        titulo: `Concluir: ${m.descricao}`,
        valores: { data: hoje(), valor: m.valor },
        campos: [{ nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true }, { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro" }],
        salvar: async (d) => {
          await api("PUT", `/api/frota/manutencoes/${m.id}`, { ...d, status: "realizada" });
          recarregar();
        },
      });
    }));
  }

  FA.telas.frota = { subtitulo: "Entregadores, veículos, combustível e manutenção", abrir };
})();
