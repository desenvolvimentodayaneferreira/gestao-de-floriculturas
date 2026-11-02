"use strict";

// Acessos: usuários (senha, perfil, desbloqueio, desativar) e perfis com as permissões de cada um.
(() => {
  const { $, $$, esc, api, aviso, dataHora, tabela, formulario, confirmar, janela, pode } = FA;

  async function abrir(area) {
    const [usuarios, perfis, permissoes] = await Promise.all([
      pode("usuarios.gerenciar") ? api("GET", "/api/usuarios") : [],
      api("GET", "/api/perfis"),
      api("GET", "/api/permissoes"),
    ]);
    if (!area.isConnected) return;
    const eu = FA.estado.usuario;
    area.innerHTML = `
      ${pode("usuarios.gerenciar") ? `<section class="cartao">
        <div class="cartao-topo"><h3>Usuários</h3><button class="btn primario" data-novo>+ Novo usuário</button></div>
        ${tabela([
          { titulo: "Nome", valor: (u) => `<b>${esc(u.nome)}</b>${u.id === eu.id ? ' <span class="etiqueta rosa">você</span>' : ""}` },
          { titulo: "Usuário", valor: (u) => esc(u.usuario) },
          { titulo: "Setor", valor: (u) => esc(u.setor || "—") },
          { titulo: "Perfil", valor: (u) => esc(u.perfil) },
          { titulo: "Situação", valor: (u) => (!u.ativo ? '<span class="etiqueta">Desativado</span>' : u.bloqueado ? '<span class="etiqueta perigo">Bloqueado</span>' : '<span class="etiqueta ok">Ativo</span>') },
          { titulo: "Desde", valor: (u) => dataHora(u.criado_em).slice(0, 8) },
        ], usuarios, { clicavel: true })}
      </section>` : ""}
      <section class="cartao">
        <div class="cartao-topo"><div><h3>Perfis de acesso</h3><small>O que cada perfil pode ver e fazer no sistema.</small></div>${pode("perfis.gerenciar") ? '<button class="btn" data-novo-perfil>+ Novo perfil</button>' : ""}</div>
        ${tabela([
          { titulo: "Perfil", valor: (p) => `<b>${esc(p.nome)}</b><br><small class="sutil">${esc(p.descricao)}</small>` },
          { titulo: "Permissões", valor: (p) => `${p.permissoes.length} de ${Object.keys(permissoes).length}` },
          { titulo: "Usuários ativos", classe: "numero", valor: (p) => p.usuarios },
        ], perfis, { clicavel: pode("perfis.gerenciar") })}
      </section>`;

    const recarregar = () => abrir(area);
    const tabelas = $$("table", area);
    if (pode("usuarios.gerenciar")) {
      $$("tbody tr", tabelas[0]).forEach((tr) => tr.addEventListener("click", () => editarUsuario(usuarios[Number(tr.dataset.indice)], perfis, recarregar)));
      $("[data-novo]", area).addEventListener("click", () => formulario({
        titulo: "Novo usuário",
        intro: "Combine a senha inicial com a pessoa. Ela pode trocar depois em “Minha senha”.",
        campos: [
          { nome: "nome", rotulo: "Nome completo", obrigatorio: true, largo: true, max: 120 },
          { nome: "usuario", rotulo: "Usuário para entrar", obrigatorio: true, max: 40, placeholder: "ex.: ana" },
          { nome: "setor", rotulo: "Setor", max: 80, lista: ["Loja", "Atendimento", "Produção", "Entregas", "Administrativo", "Direção"] },
          { nome: "perfil_id", rotulo: "Perfil de acesso", tipo: "select", obrigatorio: true, opcoes: perfis.map((p) => ({ valor: p.id, rotulo: p.nome })) },
          { nome: "senha", rotulo: "Senha inicial", tipo: "senha", obrigatorio: true, ajuda: "8 ou mais caracteres, com letras e números." },
        ],
        botao: "Liberar acesso",
        salvar: async (d) => {
          await api("POST", "/api/usuarios", d);
          aviso("Usuário cadastrado.");
          recarregar();
        },
      }));
    }
    if (pode("perfis.gerenciar")) {
      const tabelaPerfis = tabelas[tabelas.length - 1];
      $$("tbody tr", tabelaPerfis).forEach((tr) => tr.addEventListener("click", () => editarPerfil(perfis[Number(tr.dataset.indice)], permissoes, recarregar)));
      $("[data-novo-perfil]", area).addEventListener("click", () => editarPerfil(null, permissoes, recarregar));
    }
  }

  function editarUsuario(u, perfis, depois) {
    const dialogo = formulario({
      titulo: `${u.nome} (${u.usuario})`,
      intro: u.bloqueado ? "<b>Este usuário está bloqueado por erros de senha.</b> Marque “Desbloquear” para liberar agora." : "",
      valores: { ...u, ativo: Boolean(u.ativo) },
      campos: [
        { nome: "nome", rotulo: "Nome completo", obrigatorio: true, largo: true, max: 120 },
        { nome: "setor", rotulo: "Setor", max: 80 },
        { nome: "perfil_id", rotulo: "Perfil de acesso", tipo: "select", vazio: false, opcoes: perfis.map((p) => ({ valor: p.id, rotulo: p.nome })) },
        { nome: "senha", rotulo: "Nova senha (deixe em branco para manter)", tipo: "senha", largo: true },
        { nome: "ativo", rotulo: "Ativo (pode entrar no sistema)", tipo: "checkbox", largo: true },
        ...(u.bloqueado ? [{ nome: "desbloquear", rotulo: "Desbloquear agora", tipo: "checkbox", largo: true }] : []),
      ],
      salvar: async (d) => {
        if (!d.senha) delete d.senha;
        await api("PUT", `/api/usuarios/${u.id}`, d);
        aviso("Usuário atualizado.");
        depois();
      },
    });
    return dialogo;
  }

  function editarPerfil(p, permissoes, depois) {
    const marcadas = new Set(p?.permissoes || []);
    const dialogo = janela(`
      <form class="form-janela larga" novalidate>
        <header class="janela-topo"><h2>${p ? `Perfil: ${esc(p.nome)}` : "Novo perfil"}</h2><button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        <div class="campos">
          <label>Nome<input name="nome" value="${esc(p?.nome || "")}" maxlength="60"/></label>
          <label>Descrição<input name="descricao" value="${esc(p?.descricao || "")}" maxlength="200"/></label>
        </div>
        <h3>Permissões</h3>
        <div class="permissoes">${Object.entries(permissoes).map(([codigo, descricao]) => `
          <label class="check"><input type="checkbox" name="perm" value="${codigo}" ${marcadas.has(codigo) ? "checked" : ""}/> <span>${esc(descricao)}</span></label>`).join("")}</div>
        <p class="erro"></p>
        <footer>${p && !p.usuarios ? '<button type="button" class="btn perigo" data-excluir>Excluir perfil</button><span style="flex:1"></span>' : ""}<button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">Salvar</button></footer>
      </form>`);
    const form = $("form", dialogo);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const corpo = { nome: form.elements.nome.value, descricao: form.elements.descricao.value, permissoes: $$('[name="perm"]:checked', form).map((c) => c.value) };
      try {
        if (p) await api("PUT", `/api/perfis/${p.id}`, corpo);
        else await api("POST", "/api/perfis", corpo);
        dialogo.close();
        aviso("Perfil salvo. As mudanças valem na próxima tela que cada pessoa abrir.");
        if (p && p.nome === FA.estado.usuario.perfil) FA.estado.usuario = await api("GET", "/api/eu");
        depois();
      } catch (erro) {
        $(".erro", form).textContent = erro.message;
      }
    });
    $("[data-excluir]", dialogo)?.addEventListener("click", async () => {
      if (!(await confirmar(`Excluir o perfil “${p.nome}”?`, { botao: "Excluir", perigo: true }))) return;
      try {
        await api("DELETE", `/api/perfis/${p.id}`);
        dialogo.close();
        depois();
      } catch (erro) {
        $(".erro", form).textContent = erro.message;
      }
    });
  }

  FA.telas.acessos = { subtitulo: "Quem entra no sistema e o que cada um pode fazer", abrir };
})();
