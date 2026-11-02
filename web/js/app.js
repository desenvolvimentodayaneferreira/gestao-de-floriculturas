"use strict";

// Entrada, primeiro acesso, menu por permissão e navegação entre telas (#/endereço).
(() => {
  const { $, esc, api, guardarToken, aviso, formulario, pode } = FA;

  const ICONES = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    vendas: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    encomendas: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    clientes: '<path d="M16 18a4 4 0 0 0-8 0"/><circle cx="12" cy="11" r="3"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v2M16 2v2"/>',
    catalogo: '<circle cx="12" cy="12" r="3"/><path d="M12 9a3.5 3.5 0 1 1 3-5.2A3.5 3.5 0 1 1 15 9.8M15 9.8a3.5 3.5 0 1 1 .2 6A3.5 3.5 0 1 1 12 15M12 15a3.5 3.5 0 1 1-3.2 5A3.5 3.5 0 1 1 9 14M9 14a3.5 3.5 0 1 1-1-6.2A3.5 3.5 0 1 1 12 9"/>',
    fichas: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    estoque: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    frota: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>',
    producao: '<path d="M3 7h18M3 12h18M3 17h12"/><circle cx="19" cy="17" r="2"/>',
    financeiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    relatorios: '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
    acessos: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    config: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    senha: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  };
  const icone = (nome, tamanho = 19) => `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
  FA.icone = icone;

  // [rota, rótulo, permissões que dão acesso] — na ordem do dia a dia da loja; a primeira permitida abre ao entrar.
  const MENU = [
    ["vendas", "Vendas", ["vendas.registrar", "vendas.ver"]],
    ["encomendas", "Encomendas", ["vendas.ver"]],
    ["catalogo", "Catálogo", ["catalogo.ver"]],
    ["producao", "Produção do dia", ["vendas.ver"]],
    ["painel", "Painel", ["painel.ver"]],
    ["frota", "Frota e entregas", ["frota.ver"]],
    ["clientes", "Clientes", ["vendas.ver", "vendas.registrar"]],
    ["fichas", "Fichas técnicas", ["catalogo.ver"]],
    ["estoque", "Estoque", ["estoque.ver"]],
    ["financeiro", "Financeiro", ["financeiro.gerenciar"]],
    ["relatorios", "Relatórios", ["vendas.ver"]],
    ["acessos", "Acessos", ["usuarios.gerenciar", "perfis.gerenciar"]],
    ["config", "Configurações", ["sistema.configurar"]],
  ];
  const permitidas = () => MENU.filter(([, , perms]) => pode(...perms));

  let telaAtual = null;

  function layout() {
    const u = FA.estado.usuario;
    const loja = FA.estado.sistema.loja.nome;
    $("#raiz").innerHTML = `
      <div class="app">
        <aside class="lateral">
          <div class="marca" role="img" aria-label="Gestão de Floriculturas"></div>
          <nav>${permitidas().map(([id, rotulo]) => `<a href="#/${id}" data-menu="${id}">${icone(id)}<span>${rotulo}</span></a>`).join("")}</nav>
          <div class="usuario">
            <span class="avatar">${esc(u.nome[0] || "F")}</span>
            <div><b>${esc(u.nome)}</b><small>${esc(u.perfil)}${u.setor && u.setor !== u.perfil ? ` · ${esc(u.setor)}` : ""}</small></div>
          </div>
          <div class="usuario-acoes">
            <button class="link-lateral" data-senha>${icone("senha", 16)} Minha senha</button>
            <button class="link-lateral" data-sair>${icone("sair", 16)} Sair</button>
          </div>
        </aside>
        <main class="principal">
          ${FA.estado.sistema.demonstracao ? `<div class="faixa-demo"><span><b>Modo demonstração</b> · dados fictícios para conhecer o sistema. Nada aqui afeta os dados reais da loja.</span>${window.floricultura ? '<button class="btn pequeno" data-sair-demo>Sair da demonstração</button>' : ""}</div>` : ""}
          <header class="topo"><div><h1 id="titulo"></h1><p id="subtitulo"></p></div><span class="loja">${esc(loja)}</span></header>
          <div id="conteudo"></div>
          <footer class="rodape">Gestão de Floriculturas ${esc(FA.estado.sistema.versao)} · tecnologia KAI — Kaelor Artificial Intelligence</footer>
        </main>
      </div>`;
    $("[data-sair]").addEventListener("click", () => sair());
    $("[data-senha]").addEventListener("click", trocarSenha);
    $("[data-sair-demo]")?.addEventListener("click", () => window.floricultura.demonstracao(false));
  }

  function trocarSenha() {
    formulario({
      titulo: "Trocar minha senha",
      intro: "A nova senha precisa de pelo menos 8 caracteres, com letras e números.",
      campos: [
        { nome: "atual", rotulo: "Senha atual", tipo: "senha", obrigatorio: true, largo: true },
        { nome: "nova", rotulo: "Nova senha", tipo: "senha", obrigatorio: true },
        { nome: "repetir", rotulo: "Repita a nova senha", tipo: "senha", obrigatorio: true },
      ],
      botao: "Trocar senha",
      salvar: async (d) => {
        if (d.nova !== d.repetir) throw new Error("As duas senhas novas não são iguais.");
        await api("PUT", "/api/eu/senha", { atual: d.atual, nova: d.nova });
        aviso("Senha trocada.");
      },
    });
  }

  function ir(caminho) {
    if (location.hash === `#/${caminho}`) mostrar();
    else location.hash = `#/${caminho}`;
  }

  async function mostrar() {
    if (!FA.estado.usuario) return;
    const [nome, ...params] = location.hash.replace(/^#\/?/, "").split("/");
    const lista = permitidas();
    if (!lista.length) {
      $("#conteudo").innerHTML = '<div class="vazio"><b>Seu perfil ainda não tem acesso a nenhuma tela.</b><p>Peça a um administrador para ajustar as permissões em Acessos.</p></div>';
      return;
    }
    const item = lista.find(([id]) => id === nome);
    if (!item || !FA.telas[nome]) return ir(lista[0][0]);
    telaAtual?.sair?.();
    document.querySelectorAll("[data-menu]").forEach((link) => link.classList.toggle("ativo", link.dataset.menu === nome));
    telaAtual = FA.telas[nome];
    $("#titulo").textContent = item[1];
    $("#subtitulo").textContent = telaAtual.subtitulo || "";
    // Cada tela desenha numa área nova: respostas atrasadas de uma tela antiga caem numa área já descartada.
    const area = document.createElement("div");
    area.className = "tela";
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    $("#conteudo").replaceChildren(area);
    window.scrollTo(0, 0);
    try {
      await telaAtual.abrir(area, params);
    } catch (erro) {
      if (area.isConnected) area.innerHTML = `<div class="vazio"><b>Não foi possível abrir esta tela</b><p>${esc(erro.message)}</p></div>`;
    }
  }

  async function iniciarSessao() {
    FA.estado.usuario = await api("GET", "/api/eu");
    FA.estado.sistema = await api("GET", "/api/sistema");
    layout();
    if (!location.hash || location.hash === "#/") ir((permitidas()[0] || ["painel"])[0]);
    else mostrar();
  }

  function sair(motivo) {
    if (FA.estado.usuario && FA.token()) api("POST", "/api/sair").catch(() => {});
    guardarToken(null);
    telaAtual?.sair?.();
    telaAtual = null;
    FA.estado.usuario = null;
    history.replaceState(null, "", "/");
    telaEntrada();
    if (motivo) aviso(motivo, "erro");
  }

  // ---------- Entrada ----------
  function cartaoEntrada(conteudo) {
    $("#raiz").innerHTML = `
      <div class="entrada">
        <div class="entrada-cartao">
          <img class="entrada-logo" src="assets/logo.svg" alt="Gestão de Floriculturas"/>
          ${conteudo}
        </div>
        <p class="entrada-rodape">Gestão de Floriculturas · tecnologia KAI — Kaelor Artificial Intelligence</p>
      </div>`;
  }

  // Botões do modo demonstração (dados fictícios, separados dos reais).
  const botaoVerDemo = () => (window.floricultura ? '<button type="button" class="btn largo suave" data-ver-demo>Conhecer com dados de demonstração</button>' : "");
  function ligarBotoesDemo() {
    $("[data-ver-demo]")?.addEventListener("click", (e) => {
      e.target.disabled = true;
      e.target.textContent = "Preparando a demonstração…";
      window.floricultura.demonstracao(true);
    });
    $("[data-entrar-demo]")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const { token } = await api("POST", "/api/demonstracao/entrar");
        guardarToken(token);
        await iniciarSessao();
      } catch (problema) {
        aviso(problema.message, "erro");
        e.target.disabled = false;
      }
    });
    $("[data-sair-demo]")?.addEventListener("click", () => window.floricultura.demonstracao(false));
  }

  function telaEntrada(demonstracao = FA.estado.demonstracao) {
    cartaoEntrada(demonstracao ? `
      <div class="entrada-form">
        <h2>Demonstração</h2>
        <p class="sutil centro">Uma floricultura fictícia com seis meses de vendas, encomendas, estoque, financeiro e entregas, para conhecer o sistema à vontade.</p>
        <button class="btn primario grande largo" data-entrar-demo>Entrar na demonstração</button>
        ${window.floricultura ? '<button class="btn largo" data-sair-demo>Voltar para os dados da loja</button>' : ""}
      </div>` : `
      <form class="entrada-form" novalidate>
        <label>Usuário<input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required/></label>
        <label>Senha<input name="senha" type="password" autocomplete="current-password" required/></label>
        <p class="erro" role="alert"></p>
        <button class="btn primario grande largo" type="submit">Entrar</button>
        <p class="sutil centro">Esqueceu a senha? Peça a quem administra o sistema para criar uma nova em <b>Acessos</b>.</p>
        ${botaoVerDemo()}
      </form>`);
    ligarBotoesDemo();
    const form = $("form.entrada-form");
    if (!form) return;
    form.elements.usuario.focus();
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const erro = $(".erro", form);
      erro.textContent = "";
      const usuario = form.elements.usuario.value.trim();
      const senha = form.elements.senha.value;
      if (!usuario || !senha) return (erro.textContent = "Informe usuário e senha.");
      const botao = $("button", form);
      botao.disabled = true;
      try {
        const { token } = await api("POST", "/api/login", { usuario, senha });
        guardarToken(token);
        await iniciarSessao();
      } catch (problema) {
        erro.textContent = problema.message;
        form.elements.senha.value = "";
        form.elements.senha.focus();
      } finally {
        botao.disabled = false;
      }
    });
  }

  function telaPrimeiroAcesso() {
    cartaoEntrada(`
      <form class="entrada-form" novalidate>
        <h2>Primeiro acesso</h2>
        <p class="sutil">Crie o usuário de quem administra o sistema. Não existe senha de fábrica: só quem souber esta senha poderá entrar.</p>
        <label>Nome da floricultura<input name="loja" value="Floricultura Exemplo" maxlength="80"/></label>
        <label>Seu nome completo<input name="nome" maxlength="120" required/></label>
        <label>Usuário para entrar<input name="usuario" autocapitalize="none" spellcheck="false" maxlength="40" placeholder="ex.: dayane" required/><small>Letras sem acento, números, ponto ou hífen.</small></label>
        <label>Senha<input name="senha" type="password" autocomplete="new-password" required/><small>Pelo menos 8 caracteres, com letras e números.</small></label>
        <label>Repita a senha<input name="repetir" type="password" autocomplete="new-password" required/></label>
        <p class="erro" role="alert"></p>
        <button class="btn primario grande largo" type="submit">Criar acesso e entrar</button>
        ${botaoVerDemo()}
      </form>`);
    ligarBotoesDemo();
    const form = $(".entrada-form");
    form.elements.nome.focus();
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const erro = $(".erro", form);
      const v = (n) => form.elements[n].value.trim();
      erro.textContent = "";
      if (form.elements.senha.value !== form.elements.repetir.value) return (erro.textContent = "As duas senhas não são iguais.");
      try {
        await api("POST", "/api/configurar", { loja: v("loja"), nome: v("nome"), usuario: v("usuario"), senha: form.elements.senha.value });
        const { token } = await api("POST", "/api/login", { usuario: v("usuario"), senha: form.elements.senha.value });
        guardarToken(token);
        await iniciarSessao();
        aviso("Tudo pronto! Comece cadastrando os produtos no Catálogo.");
      } catch (problema) {
        erro.textContent = problema.message;
      }
    });
  }

  window.addEventListener("hashchange", mostrar);

  async function iniciar() {
    try {
      const estado = await api("GET", "/api/estado");
      FA.estado.demonstracao = estado.demonstracao;
      if (!estado.configurado) return telaPrimeiroAcesso();
      if (FA.token()) {
        try {
          return await iniciarSessao();
        } catch { /* sessão expirada: pede a senha */ }
      }
      telaEntrada();
    } catch (erro) {
      $("#raiz").innerHTML = `<div class="vazio tela-cheia"><b>O sistema não respondeu</b><p>${esc(erro.message)}</p><button class="btn primario" data-recarregar>Tentar de novo</button></div>`;
      $("[data-recarregar]").addEventListener("click", () => location.reload());
    }
  }

  FA.app = { ir, sair, mostrar, recarregar: () => mostrar() };
  iniciar();
})();
