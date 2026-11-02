"use strict";

// Configurações: dados da loja, regra do CPF, cópias de segurança e registro de ações.
(() => {
  const { $, esc, api, aviso, dataHora, tabela, normalizar } = FA;
  const desktop = window.floricultura; // presente só no programa instalado (Electron)

  async function abrir(area) {
    const [sistema, copias, acoes] = await Promise.all([api("GET", "/api/sistema"), api("GET", "/api/copias"), api("GET", "/api/auditoria?limite=500")]);
    if (!area.isConnected) return;
    area.innerHTML = `
      <section class="grade g2">
        <form class="cartao" data-loja novalidate>
          <div class="cartao-topo"><h3>Loja</h3></div>
          <div class="campos">
            <label class="largo">Nome da floricultura<input name="loja" value="${esc(sistema.loja.nome)}" maxlength="80"/></label>
            <label class="check largo"><input type="checkbox" name="exigir_cpf" ${sistema.exigir_cpf ? "checked" : ""}/> <span>Exigir CPF em toda venda e cadastro<small>Garante um cadastro por pessoa. Desmarque para permitir vendas rápidas de balcão sem identificar o cliente.</small></span></label>
          </div>
          <button class="btn primario" style="margin-top:14px">Salvar</button>
        </form>
        <div class="cartao">
          <div class="cartao-topo"><h3>Cópias de segurança</h3><button class="btn" data-copiar>Fazer cópia agora</button></div>
          <p class="sutil">O sistema faz uma cópia por dia, sozinho, e guarda as dos últimos 60 dias. Para proteger contra defeito no computador, copie de vez em quando a pasta para um pen drive ou para o Google Drive.</p>
          <p class="destaque-texto" style="margin:10px 0">${copias.copias.length} cópia(s) guardada(s). Mais recente: <b>${esc(copias.copias[0]?.nome || "—")}</b></p>
          ${desktop ? '<div class="barra-acoes"><button class="btn" data-pasta>Abrir pasta das cópias</button><button class="btn suave" data-restaurar>Restaurar uma cópia…</button></div>' : `<p class="sutil">Pasta: ${esc(copias.pasta)}</p>`}
        </div>
      </section>
      <section class="cartao">
        <div class="cartao-topo"><div><h3>Registro de ações</h3><small>Quem fez o quê: vendas, cancelamentos, preços, usuários, estoque.</small></div><input name="filtro" placeholder="Filtrar" style="max-width:260px" autocomplete="off"/></div>
        <div data-acoes></div>
      </section>
      <p class="sutil centro">Gestão de Floriculturas versão ${esc(sistema.versao)} · tecnologia KAI — Kaelor Artificial Intelligence</p>`;

    const desenharAcoes = () => {
      const termo = normalizar($('[name="filtro"]', area).value);
      const lista = acoes.filter((a) => !termo || normalizar(`${a.usuario_nome} ${a.acao} ${a.detalhe}`).includes(termo));
      $("[data-acoes]", area).innerHTML = tabela([
        { titulo: "Quando", valor: (a) => dataHora(a.criado_em) },
        { titulo: "Quem", valor: (a) => esc(a.usuario_nome || "Sistema") },
        { titulo: "Ação", valor: (a) => `<b>${esc(a.acao)}</b>` },
        { titulo: "Detalhe", valor: (a) => esc(a.detalhe || "") },
      ], lista.slice(0, 200), { vazio: "Nada registrado." });
    };
    desenharAcoes();
    $('[name="filtro"]', area).addEventListener("input", desenharAcoes);

    $("[data-loja]", area).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      try {
        await api("PUT", "/api/sistema", { loja: f.loja.value, exigir_cpf: f.exigir_cpf.checked });
        FA.estado.sistema = await api("GET", "/api/sistema");
        $(".loja").textContent = FA.estado.sistema.loja.nome;
        aviso("Configurações salvas.");
      } catch (erro) {
        aviso(erro.message, "erro");
      }
    });
    $("[data-copiar]", area).addEventListener("click", async () => {
      try {
        const r = await api("POST", "/api/copias");
        aviso(`Cópia criada: ${r.arquivo}`);
        abrir(area);
      } catch (erro) {
        aviso(erro.message, "erro");
      }
    });
    $("[data-pasta]", area)?.addEventListener("click", () => desktop.abrirPastaCopias());
    $("[data-restaurar]", area)?.addEventListener("click", () => desktop.restaurarCopia());
  }

  FA.telas.config = { subtitulo: "Loja, cópias de segurança e registro de ações", abrir };
})();
