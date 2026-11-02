// Acesso: primeiro acesso, login com senha, sessões, usuários e perfis com permissões.
const crypto = require("node:crypto");
const { ErroHttp, exigir, texto, registrar } = require("./comum");

const PERMISSOES = {
  "painel.ver": "Ver o painel e os indicadores",
  "vendas.ver": "Ver vendas, clientes, encomendas e relatórios",
  "vendas.registrar": "Registrar vendas, clientes e encomendas",
  "vendas.cancelar": "Cancelar vendas (devolve o estoque)",
  "catalogo.ver": "Ver catálogo e fichas técnicas",
  "catalogo.editar": "Cadastrar e editar produtos, categorias e fichas técnicas",
  "estoque.ver": "Ver o estoque",
  "estoque.movimentar": "Registrar entradas, saídas e perdas de estoque",
  "financeiro.gerenciar": "Financeiro: despesas, contas a pagar e lucro",
  "frota.ver": "Ver frota e entregas",
  "frota.registrar": "Registrar veículos, combustível, manutenção e entregas",
  "usuarios.gerenciar": "Cadastrar usuários e trocar senhas",
  "perfis.gerenciar": "Criar perfis e definir permissões",
  "sistema.configurar": "Configurações, cópias de segurança e registro de ações",
};
const TODAS = Object.keys(PERMISSOES);

const PERFIS_PADRAO = [
  ["Direção", "Acesso completo", TODAS],
  ["Gerência", "Tudo, menos perfis e configurações", TODAS.filter((p) => !["perfis.gerenciar", "sistema.configurar"].includes(p))],
  ["Programador Técnico", "Acesso completo para suporte", TODAS],
  ["Atendimento", "Balcão: vendas, clientes e encomendas", ["painel.ver", "vendas.ver", "vendas.registrar", "catalogo.ver", "estoque.ver"]],
  ["Colaborador", "Somente consulta", ["painel.ver", "vendas.ver", "catalogo.ver", "estoque.ver", "frota.ver"]],
];
const CATEGORIAS_PADRAO = ["Buquês", "Coroas", "Arranjos", "Solitárias", "Flores e folhagens", "Materiais", "Embalagens", "Outros"];

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000;
const SESSAO_MS = 12 * 60 * 60 * 1000; // sem uso por 12 horas, pede a senha de novo
const SENHA_MIN = 8;

function hashSenha(senha, sal = crypto.randomBytes(16).toString("hex")) {
  return { sal, hash: crypto.scryptSync(String(senha), sal, 64).toString("hex") };
}
function conferirSenha(senha, usuario) {
  const { hash } = hashSenha(senha, usuario.senha_sal);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(usuario.senha_hash, "hex"));
}
function validarSenha(senha) {
  const s = String(senha || "");
  exigir(s.length >= SENHA_MIN, `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`);
  exigir(s.length <= 200, "Senha longa demais.");
  exigir(/[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s), "A senha deve ter letras e números.");
  return s;
}
function validarUsuario(valor) {
  const u = texto(valor, 40).toLowerCase();
  exigir(/^[a-z0-9._-]{3,40}$/.test(u), "O usuário deve ter de 3 a 40 letras sem acento, números, ponto, hífen ou sublinhado.");
  return u;
}
const lerPermissoes = (json) => {
  try {
    return JSON.parse(json).filter((p) => TODAS.includes(p));
  } catch {
    return [];
  }
};

// Perfis e categorias de fábrica (só na primeira vez).
function prepararBase(banco) {
  if (!banco.um("select 1 from perfis")) {
    for (const [nome, descricao, permissoes] of PERFIS_PADRAO) {
      banco.exec("insert into perfis (nome, descricao, permissoes, criado_em) values (?, ?, ?, ?)", nome, descricao, JSON.stringify(permissoes), Date.now());
    }
  }
  if (!banco.um("select 1 from categorias")) {
    CATEGORIAS_PADRAO.forEach((nome, i) => banco.exec("insert into categorias (nome, ordem) values (?, ?)", nome, i));
  }
}

function criarAcesso(banco) {
  // Precisa sobrar alguém que consiga administrar usuários e perfis.
  function garantirAdministrador(excetoUsuarioId, perfisAlterados = {}) {
    const usuarios = banco.todos("select u.id, u.perfil_id, p.permissoes from usuarios u join perfis p on p.id = u.perfil_id where u.ativo = 1");
    const restam = usuarios.filter((u) => u.id !== excetoUsuarioId).some((u) => {
      const permissoes = perfisAlterados[u.perfil_id] ?? lerPermissoes(u.permissoes);
      return permissoes.includes("usuarios.gerenciar") && permissoes.includes("perfis.gerenciar");
    });
    exigir(restam, "É preciso manter pelo menos um usuário ativo que gerencie usuários e perfis.");
  }

  function criarSessao(usuarioId) {
    const token = crypto.randomBytes(32).toString("hex");
    const agora = Date.now();
    banco.exec("delete from sessoes where ultimo_uso < ?", agora - SESSAO_MS);
    banco.exec("insert into sessoes (token_hash, usuario_id, criado_em, ultimo_uso) values (?, ?, ?, ?)",
      crypto.createHash("sha256").update(token).digest("hex"), usuarioId, agora, agora);
    return token;
  }

  function autenticar(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const linha = banco.um(`select s.ultimo_uso, u.id, u.usuario, u.nome, u.setor, u.ativo, p.nome as perfil, p.permissoes
      from sessoes s join usuarios u on u.id = s.usuario_id join perfis p on p.id = u.perfil_id where s.token_hash = ?`, hash);
    if (!linha || !linha.ativo || Date.now() - linha.ultimo_uso > SESSAO_MS) return null;
    if (Date.now() - linha.ultimo_uso > 60000) banco.exec("update sessoes set ultimo_uso = ? where token_hash = ?", Date.now(), hash);
    return {
      tokenHash: hash,
      permissoes: lerPermissoes(linha.permissoes),
      usuario: { id: linha.id, usuario: linha.usuario, nome: linha.nome, setor: linha.setor, perfil: linha.perfil },
    };
  }

  function rotas(rota) {
    rota("GET", "/api/estado", { publica: true }, () => ({
      configurado: Boolean(banco.um("select 1 from usuarios")),
      loja: banco.config("loja", { nome: "Floricultura Exemplo" }),
      demonstracao: Boolean(banco.config("demonstracao")),
    }));

    // Só no banco de demonstração (dados fictícios): entra direto como administração, sem senha.
    rota("POST", "/api/demonstracao/entrar", { publica: true }, () => {
      exigir(banco.config("demonstracao"), "Disponível apenas no modo demonstração.", 403);
      const usuario = banco.um("select u.id from usuarios u join perfis p on p.id = u.perfil_id where u.ativo = 1 and p.nome = 'Direção' order by u.id");
      exigir(usuario, "Demonstração sem usuário.", 404);
      return { token: criarSessao(usuario.id) };
    });

    // Primeiro acesso: cria o administrador. Não existe usuário nem senha de fábrica.
    rota("POST", "/api/configurar", { publica: true }, ({ corpo }) => {
      exigir(!banco.um("select 1 from usuarios"), "O sistema já foi configurado.", 409);
      const loja = texto(corpo.loja, 80) || "Floricultura Exemplo";
      const nome = texto(corpo.nome, 120);
      exigir(nome, "Informe o seu nome.");
      const usuario = validarUsuario(corpo.usuario);
      const { hash, sal } = hashSenha(validarSenha(corpo.senha));
      banco.transacao(() => {
        banco.salvarConfig("loja", { nome: loja });
        const perfil = banco.um("select id from perfis where nome = 'Direção'") || banco.um("select id from perfis order by id");
        banco.exec("insert into usuarios (usuario, nome, setor, perfil_id, senha_hash, senha_sal, criado_em) values (?, ?, 'Direção', ?, ?, ?, ?)",
          usuario, nome, perfil.id, hash, sal, Date.now());
      });
      registrar(banco, null, "Configuração inicial", loja);
    });

    rota("POST", "/api/login", { publica: true }, ({ corpo }) => {
      const mensagemErro = "Usuário ou senha incorretos.";
      const usuario = banco.um("select * from usuarios where usuario = ?", texto(corpo.usuario, 40).toLowerCase());
      if (!usuario || !usuario.ativo) {
        hashSenha(String(corpo.senha || "")); // mesmo tempo de resposta, para não revelar se o usuário existe
        throw new ErroHttp(401, mensagemErro);
      }
      exigir(!usuario.bloqueado_ate || usuario.bloqueado_ate < Date.now(), "Muitas tentativas erradas. Aguarde 5 minutos ou peça a um administrador para desbloquear.", 423);
      if (!conferirSenha(corpo.senha || "", usuario)) {
        const tentativas = usuario.tentativas + 1;
        const bloquear = tentativas >= MAX_TENTATIVAS;
        banco.exec("update usuarios set tentativas = ?, bloqueado_ate = ? where id = ?", bloquear ? 0 : tentativas, bloquear ? Date.now() + BLOQUEIO_MS : null, usuario.id);
        if (bloquear) registrar(banco, null, "Bloqueio por senha errada", usuario.usuario);
        throw new ErroHttp(401, bloquear ? "Senha errada 5 vezes. Acesso bloqueado por 5 minutos." : `${mensagemErro} Restam ${MAX_TENTATIVAS - tentativas} tentativa(s).`);
      }
      banco.exec("update usuarios set tentativas = 0, bloqueado_ate = null where id = ?", usuario.id);
      return { token: criarSessao(usuario.id) };
    });

    rota("POST", "/api/sair", ({ sessao }) => {
      banco.exec("delete from sessoes where token_hash = ?", sessao.tokenHash);
    });

    rota("GET", "/api/eu", ({ sessao }) => ({ ...sessao.usuario, permissoes: sessao.permissoes }));

    rota("PUT", "/api/eu/senha", ({ corpo, sessao }) => {
      const usuario = banco.um("select * from usuarios where id = ?", sessao.usuario.id);
      exigir(conferirSenha(corpo.atual || "", usuario), "A senha atual está incorreta.");
      const { hash, sal } = hashSenha(validarSenha(corpo.nova));
      banco.exec("update usuarios set senha_hash = ?, senha_sal = ? where id = ?", hash, sal, usuario.id);
      banco.exec("delete from sessoes where usuario_id = ? and token_hash <> ?", usuario.id, sessao.tokenHash);
      registrar(banco, sessao, "Troca da própria senha");
    });

    // ---------- Usuários ----------
    rota("GET", "/api/usuarios", { perm: "usuarios.gerenciar" }, () =>
      banco.todos(`select u.id, u.usuario, u.nome, u.setor, u.perfil_id, p.nome as perfil, u.ativo, u.criado_em, coalesce(u.bloqueado_ate > ?, 0) as bloqueado
        from usuarios u join perfis p on p.id = u.perfil_id order by u.ativo desc, u.nome`, Date.now()));

    rota("POST", "/api/usuarios", { perm: "usuarios.gerenciar" }, ({ corpo, sessao }) => {
      const nome = texto(corpo.nome, 120);
      exigir(nome, "Informe o nome completo.");
      const usuario = validarUsuario(corpo.usuario);
      exigir(!banco.um("select 1 from usuarios where usuario = ?", usuario), "Esse nome de usuário já existe.", 409);
      const perfil = banco.um("select * from perfis where id = ?", Number(corpo.perfil_id));
      exigir(perfil, "Escolha o perfil de acesso.");
      exigir(sessao.permissoes.includes("perfis.gerenciar") || lerPermissoes(perfil.permissoes).every((p) => sessao.permissoes.includes(p)),
        "Você não pode dar a outra pessoa um acesso maior que o seu.", 403);
      const { hash, sal } = hashSenha(validarSenha(corpo.senha));
      const r = banco.exec("insert into usuarios (usuario, nome, setor, perfil_id, senha_hash, senha_sal, criado_em) values (?, ?, ?, ?, ?, ?, ?)",
        usuario, nome, texto(corpo.setor, 80), perfil.id, hash, sal, Date.now());
      registrar(banco, sessao, "Cadastro de usuário", `${usuario} (${perfil.nome})`);
      return { id: Number(r.lastInsertRowid) };
    });

    rota("PUT", "/api/usuarios/:id", { perm: "usuarios.gerenciar" }, ({ params, corpo, sessao }) => {
      const usuario = banco.um("select * from usuarios where id = ?", Number(params.id));
      exigir(usuario, "Usuário não encontrado.", 404);
      const perfilId = corpo.perfil_id ? Number(corpo.perfil_id) : usuario.perfil_id;
      const perfil = banco.um("select * from perfis where id = ?", perfilId);
      exigir(perfil, "Perfil inválido.");
      if (perfilId !== usuario.perfil_id) {
        exigir(sessao.permissoes.includes("perfis.gerenciar") || lerPermissoes(perfil.permissoes).every((p) => sessao.permissoes.includes(p)),
          "Você não pode dar a outra pessoa um acesso maior que o seu.", 403);
      }
      const ativo = corpo.ativo === undefined ? usuario.ativo : corpo.ativo ? 1 : 0;
      if (!ativo || perfilId !== usuario.perfil_id) garantirAdministradorApos(usuario.id, perfilId, ativo);
      banco.transacao(() => {
        banco.exec("update usuarios set nome = ?, setor = ?, perfil_id = ?, ativo = ? where id = ?",
          texto(corpo.nome, 120) || usuario.nome, corpo.setor === undefined ? usuario.setor : texto(corpo.setor, 80), perfilId, ativo, usuario.id);
        if (corpo.senha) {
          const { hash, sal } = hashSenha(validarSenha(corpo.senha));
          banco.exec("update usuarios set senha_hash = ?, senha_sal = ?, tentativas = 0, bloqueado_ate = null where id = ?", hash, sal, usuario.id);
        }
        if (corpo.desbloquear) banco.exec("update usuarios set tentativas = 0, bloqueado_ate = null where id = ?", usuario.id);
        if (!ativo || corpo.senha) banco.exec("delete from sessoes where usuario_id = ?", usuario.id);
      });
      registrar(banco, sessao, "Alteração de usuário", `${usuario.usuario}${corpo.senha ? " (nova senha)" : ""}${!ativo ? " (desativado)" : ""}`);
    });

    // Confere a regra do administrador simulando a alteração.
    function garantirAdministradorApos(usuarioId, novoPerfilId, ativo) {
      const usuarios = banco.todos("select u.id, p.permissoes from usuarios u join perfis p on p.id = case when u.id = ? then ? else u.perfil_id end where u.ativo = 1 or u.id = ?",
        usuarioId, novoPerfilId, usuarioId);
      const restam = usuarios.filter((u) => u.id !== usuarioId || ativo).some((u) => {
        const p = lerPermissoes(u.permissoes);
        return p.includes("usuarios.gerenciar") && p.includes("perfis.gerenciar");
      });
      exigir(restam, "É preciso manter pelo menos um usuário ativo que gerencie usuários e perfis.");
    }

    // ---------- Perfis ----------
    rota("GET", "/api/permissoes", { perm: ["perfis.gerenciar", "usuarios.gerenciar"] }, () => PERMISSOES);

    rota("GET", "/api/perfis", { perm: ["perfis.gerenciar", "usuarios.gerenciar"] }, () =>
      banco.todos("select p.*, (select count(*) from usuarios u where u.perfil_id = p.id and u.ativo = 1) as usuarios from perfis p order by p.nome")
        .map((p) => ({ ...p, permissoes: lerPermissoes(p.permissoes) })));

    function dadosPerfil(corpo) {
      const nome = texto(corpo.nome, 60);
      exigir(nome, "Informe o nome do perfil.");
      exigir(Array.isArray(corpo.permissoes), "Escolha as permissões.");
      const permissoes = [...new Set(corpo.permissoes)].filter((p) => TODAS.includes(p));
      return { nome, descricao: texto(corpo.descricao, 200), permissoes };
    }

    rota("POST", "/api/perfis", { perm: "perfis.gerenciar" }, ({ corpo, sessao }) => {
      const p = dadosPerfil(corpo);
      exigir(!banco.um("select 1 from perfis where nome = ?", p.nome), "Já existe um perfil com esse nome.", 409);
      const r = banco.exec("insert into perfis (nome, descricao, permissoes, criado_em) values (?, ?, ?, ?)", p.nome, p.descricao, JSON.stringify(p.permissoes), Date.now());
      registrar(banco, sessao, "Cadastro de perfil", p.nome);
      return { id: Number(r.lastInsertRowid) };
    });

    rota("PUT", "/api/perfis/:id", { perm: "perfis.gerenciar" }, ({ params, corpo, sessao }) => {
      const perfil = banco.um("select * from perfis where id = ?", Number(params.id));
      exigir(perfil, "Perfil não encontrado.", 404);
      const p = dadosPerfil(corpo);
      exigir(!banco.um("select 1 from perfis where nome = ? and id <> ?", p.nome, perfil.id), "Já existe um perfil com esse nome.", 409);
      garantirAdministrador(null, { [perfil.id]: p.permissoes });
      banco.exec("update perfis set nome = ?, descricao = ?, permissoes = ? where id = ?", p.nome, p.descricao, JSON.stringify(p.permissoes), perfil.id);
      registrar(banco, sessao, "Alteração de perfil", `${p.nome}: ${p.permissoes.length} permissões`);
    });

    rota("DELETE", "/api/perfis/:id", { perm: "perfis.gerenciar" }, ({ params, sessao }) => {
      const perfil = banco.um("select * from perfis where id = ?", Number(params.id));
      exigir(perfil, "Perfil não encontrado.", 404);
      exigir(!banco.um("select 1 from usuarios where perfil_id = ?", perfil.id), "Há usuários com este perfil. Troque o perfil deles antes de excluir.");
      banco.exec("delete from perfis where id = ?", perfil.id);
      registrar(banco, sessao, "Exclusão de perfil", perfil.nome);
    });

    rota("GET", "/api/auditoria", { perm: "sistema.configurar" }, ({ query }) =>
      banco.todos("select * from auditoria order by id desc limit ?", Math.min(1000, Number(query.get("limite")) || 300)));
  }

  return { autenticar, rotas };
}

module.exports = { criarAcesso, prepararBase, PERMISSOES, hashSenha };
