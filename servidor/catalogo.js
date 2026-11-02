// Catálogo (produtos, materiais e serviços), categorias, fichas técnicas e estoque.
const { exigir, texto, centavos, quantidade, arredondar, registrar, umDe } = require("./comum");

const TIPOS = ["produto", "material", "servico"];
const UNIDADES = ["un", "maço", "haste", "m", "kg", "g", "l", "ml", "rolo", "pacote", "caixa"];

function criarCatalogo(banco) {
  // Registra um movimento e atualiza o saldo. quantidade > 0 entra, < 0 sai.
  function movimentar(produtoId, tipo, qtd, { motivo = "", custoUnit = null, vendaId = null, usuarioId = null } = {}) {
    const produto = banco.um("select id, estoque from produtos where id = ?", produtoId);
    const saldo = arredondar(produto.estoque + qtd);
    banco.exec("update produtos set estoque = ? where id = ?", saldo, produtoId);
    banco.exec(`insert into estoque_movimentos (produto_id, tipo, quantidade, saldo, custo_unit, motivo, venda_id, usuario_id, criado_em)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`, produtoId, tipo, arredondar(qtd), saldo, custoUnit, motivo, vendaId, usuarioId, Date.now());
    return saldo;
  }

  function ficha(produtoId) {
    return banco.todos(`select f.componente_id, f.quantidade, p.nome, p.unidade, p.custo, p.estoque
      from ficha_itens f join produtos p on p.id = f.componente_id where f.produto_id = ? order by p.nome`, produtoId);
  }

  // Custo de uma unidade: pela ficha técnica, se houver; senão o custo cadastrado.
  function custoUnitario(produto) {
    const itens = ficha(produto.id);
    if (!itens.length) return produto.custo;
    return Math.round(itens.reduce((soma, i) => soma + i.quantidade * i.custo, 0));
  }

  // O que sai do estoque ao vender: os componentes da ficha, o próprio produto, ou nada (serviço).
  function consumo(produto, qtd) {
    if (produto.tipo === "servico") return [];
    const itens = ficha(produto.id);
    if (itens.length) return itens.map((i) => ({ produto_id: i.componente_id, quantidade: arredondar(i.quantidade * qtd) }));
    return [{ produto_id: produto.id, quantidade: arredondar(qtd) }];
  }

  function dadosProduto(corpo, atual = {}) {
    const nome = texto(corpo.nome ?? atual.nome, 120);
    exigir(nome, "Informe o nome do produto.");
    const sku = texto(corpo.sku ?? atual.sku, 40).toUpperCase();
    exigir(sku, "Informe o código (SKU).");
    const tipo = umDe(corpo.tipo ?? atual.tipo ?? "produto", TIPOS, "Tipo inválido.");
    const unidade = texto(corpo.unidade ?? atual.unidade ?? "un", 20) || "un";
    const categoriaId = corpo.categoria_id ? Number(corpo.categoria_id) : null;
    if (categoriaId) exigir(banco.um("select 1 from categorias where id = ?", categoriaId), "Categoria inválida.");
    return {
      nome, sku, tipo, unidade, categoria_id: categoriaId,
      preco: centavos(corpo.preco ?? atual.preco, "Preço de venda"),
      custo: centavos(corpo.custo ?? atual.custo, "Custo"),
      estoque_minimo: quantidade(corpo.estoque_minimo ?? atual.estoque_minimo ?? 0, "Estoque mínimo", { positiva: false }),
      descricao: texto(corpo.descricao ?? atual.descricao, 500),
    };
  }

  function listarProdutos(incluirInativos = false) {
    const produtos = banco.todos(`select p.*, c.nome as categoria,
        (select count(*) from ficha_itens f where f.produto_id = p.id) as ficha_itens,
        (select atualizado_em from produto_fotos ft where ft.produto_id = p.id) as foto
      from produtos p left join categorias c on c.id = p.categoria_id
      ${incluirInativos ? "" : "where p.ativo = 1"} order by p.nome`);
    return produtos.map((p) => ({ ...p, custo_estimado: p.ficha_itens ? custoUnitario(p) : p.custo }));
  }

  // Fotos: JPEG, PNG ou WebP enviados pela tela (já reduzidos no computador). SVG só nas ilustrações da demonstração.
  const ASSINATURAS = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/webp": [0x52, 0x49, 0x46, 0x46] };
  function salvarFoto(produtoId, tipo, imagem) {
    banco.exec(`insert into produto_fotos (produto_id, tipo, imagem, atualizado_em) values (?, ?, ?, ?)
      on conflict (produto_id) do update set tipo = excluded.tipo, imagem = excluded.imagem, atualizado_em = excluded.atualizado_em`, produtoId, tipo, imagem, Date.now());
  }

  function rotas(rota) {
    rota("GET", "/api/produtos/:id/foto", { publica: true }, ({ params }) => {
      const foto = banco.um("select tipo, imagem from produto_fotos where produto_id = ?", Number(params.id));
      exigir(foto, "Produto sem foto.", 404);
      return { arquivo: Buffer.from(foto.imagem), tipo: foto.tipo };
    });

    rota("PUT", "/api/produtos/:id/foto", { perm: "catalogo.editar" }, ({ params, corpo, sessao }) => {
      const produto = banco.um("select id, nome from produtos where id = ?", Number(params.id));
      exigir(produto, "Produto não encontrado.", 404);
      const partes = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(corpo.imagem || ""));
      exigir(partes, "Envie uma foto em JPG, PNG ou WebP.");
      const imagem = Buffer.from(partes[2], "base64");
      exigir(imagem.length <= 1.5 * 1024 * 1024, "Foto grande demais (máximo 1,5 MB).");
      exigir(ASSINATURAS[partes[1]].every((b, i) => imagem[i] === b), "O arquivo não é uma imagem válida.");
      salvarFoto(produto.id, partes[1], imagem);
      registrar(banco, sessao, "Foto de produto", produto.nome);
    });

    rota("DELETE", "/api/produtos/:id/foto", { perm: "catalogo.editar" }, ({ params, sessao }) => {
      const r = banco.exec("delete from produto_fotos where produto_id = ?", Number(params.id));
      exigir(r.changes, "Produto sem foto.", 404);
      registrar(banco, sessao, "Foto de produto removida", `produto ${params.id}`);
    });

    // ---------- Categorias ----------
    rota("GET", "/api/categorias", () =>
      banco.todos("select c.*, (select count(*) from produtos p where p.categoria_id = c.id and p.ativo = 1) as produtos from categorias c order by c.ordem, c.nome"));

    rota("POST", "/api/categorias", { perm: "catalogo.editar" }, ({ corpo, sessao }) => {
      const nome = texto(corpo.nome, 60);
      exigir(nome, "Informe o nome da categoria.");
      exigir(!banco.um("select 1 from categorias where nome = ?", nome), "Essa categoria já existe.", 409);
      const ordem = (banco.um("select max(ordem) as m from categorias").m ?? -1) + 1;
      const r = banco.exec("insert into categorias (nome, ordem) values (?, ?)", nome, ordem);
      registrar(banco, sessao, "Cadastro de categoria", nome);
      return { id: Number(r.lastInsertRowid) };
    });

    rota("PUT", "/api/categorias/:id", { perm: "catalogo.editar" }, ({ params, corpo, sessao }) => {
      const categoria = banco.um("select * from categorias where id = ?", Number(params.id));
      exigir(categoria, "Categoria não encontrada.", 404);
      const nome = texto(corpo.nome, 60);
      exigir(nome, "Informe o nome da categoria.");
      exigir(!banco.um("select 1 from categorias where nome = ? and id <> ?", nome, categoria.id), "Essa categoria já existe.", 409);
      banco.exec("update categorias set nome = ? where id = ?", nome, categoria.id);
      registrar(banco, sessao, "Categoria renomeada", `${categoria.nome} → ${nome}`);
    });

    rota("DELETE", "/api/categorias/:id", { perm: "catalogo.editar" }, ({ params, sessao }) => {
      const categoria = banco.um("select * from categorias where id = ?", Number(params.id));
      exigir(categoria, "Categoria não encontrada.", 404);
      exigir(!banco.um("select 1 from produtos where categoria_id = ?", categoria.id), "Há produtos nesta categoria. Mude a categoria deles antes de excluir.");
      banco.exec("delete from categorias where id = ?", categoria.id);
      registrar(banco, sessao, "Exclusão de categoria", categoria.nome);
    });

    // ---------- Produtos ----------
    rota("GET", "/api/produtos", { perm: ["catalogo.ver", "estoque.ver", "vendas.registrar"] }, ({ query }) =>
      listarProdutos(query.get("inativos") === "1"));

    rota("GET", "/api/produtos/:id", { perm: ["catalogo.ver", "estoque.ver"] }, ({ params }) => {
      const produto = banco.um("select p.*, c.nome as categoria from produtos p left join categorias c on c.id = p.categoria_id where p.id = ?", Number(params.id));
      exigir(produto, "Produto não encontrado.", 404);
      return {
        ...produto,
        ficha: ficha(produto.id),
        custo_estimado: custoUnitario(produto),
        usado_em: banco.todos("select p.id, p.nome, f.quantidade from ficha_itens f join produtos p on p.id = f.produto_id where f.componente_id = ? order by p.nome", produto.id),
        movimentos: banco.todos("select m.*, u.nome as usuario from estoque_movimentos m left join usuarios u on u.id = m.usuario_id where m.produto_id = ? order by m.id desc limit 50", produto.id),
      };
    });

    rota("POST", "/api/produtos", { perm: "catalogo.editar" }, ({ corpo, sessao }) => {
      const p = dadosProduto(corpo);
      exigir(!banco.um("select 1 from produtos where sku = ?", p.sku), "Já existe um produto com esse código (SKU).", 409);
      const inicial = quantidade(corpo.estoque ?? 0, "Estoque inicial", { positiva: false });
      const id = banco.transacao(() => {
        const r = banco.exec(`insert into produtos (nome, sku, categoria_id, tipo, unidade, preco, custo, estoque, estoque_minimo, descricao, criado_em)
          values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`, p.nome, p.sku, p.categoria_id, p.tipo, p.unidade, p.preco, p.custo, p.estoque_minimo, p.descricao, Date.now());
        const novo = Number(r.lastInsertRowid);
        if (inicial > 0 && p.tipo !== "servico") movimentar(novo, "entrada", inicial, { motivo: "Estoque inicial", custoUnit: p.custo, usuarioId: sessao.usuario.id });
        return novo;
      });
      registrar(banco, sessao, "Cadastro de produto", `${p.sku} ${p.nome}`);
      return { id };
    });

    rota("PUT", "/api/produtos/:id", { perm: "catalogo.editar" }, ({ params, corpo, sessao }) => {
      const atual = banco.um("select * from produtos where id = ?", Number(params.id));
      exigir(atual, "Produto não encontrado.", 404);
      const p = dadosProduto(corpo, atual);
      exigir(!banco.um("select 1 from produtos where sku = ? and id <> ?", p.sku, atual.id), "Já existe um produto com esse código (SKU).", 409);
      const ativo = corpo.ativo === undefined ? atual.ativo : corpo.ativo ? 1 : 0;
      banco.exec(`update produtos set nome = ?, sku = ?, categoria_id = ?, tipo = ?, unidade = ?, preco = ?, custo = ?, estoque_minimo = ?, descricao = ?, ativo = ? where id = ?`,
        p.nome, p.sku, p.categoria_id, p.tipo, p.unidade, p.preco, p.custo, p.estoque_minimo, p.descricao, ativo, atual.id);
      const mudancas = [];
      if (p.preco !== atual.preco) mudancas.push(`preço ${atual.preco / 100} → ${p.preco / 100}`);
      if (ativo !== atual.ativo) mudancas.push(ativo ? "reativado" : "desativado");
      registrar(banco, sessao, "Alteração de produto", `${p.sku} ${p.nome}${mudancas.length ? ` (${mudancas.join(", ")})` : ""}`);
    });

    // ---------- Fichas técnicas ----------
    rota("GET", "/api/fichas", { perm: "catalogo.ver" }, () => {
      const produtos = banco.todos(`select p.id, p.nome, p.preco, p.sku, c.nome as categoria from produtos p left join categorias c on c.id = p.categoria_id
        where p.ativo = 1 and exists (select 1 from ficha_itens f where f.produto_id = p.id) order by p.nome`);
      return produtos.map((p) => {
        const itens = ficha(p.id).map((i) => ({ ...i, custo_linha: Math.round(i.quantidade * i.custo) }));
        const custo = itens.reduce((s, i) => s + i.custo_linha, 0);
        const possiveis = Math.floor(Math.min(...itens.map((i) => (i.quantidade > 0 ? Math.max(0, i.estoque) / i.quantidade : Infinity))));
        return { ...p, itens, custo, margem: p.preco ? Math.round(((p.preco - custo) / p.preco) * 1000) / 10 : 0, possiveis: Number.isFinite(possiveis) ? possiveis : 0 };
      });
    });

    rota("PUT", "/api/fichas/:produto/:componente", { perm: "catalogo.editar" }, ({ params, corpo, sessao }) => {
      const produto = banco.um("select * from produtos where id = ?", Number(params.produto));
      const componente = banco.um("select * from produtos where id = ?", Number(params.componente));
      exigir(produto && componente, "Produto inválido.", 404);
      exigir(produto.id !== componente.id, "Um produto não pode fazer parte da própria ficha.");
      exigir(produto.tipo !== "material", "Matéria-prima não tem ficha técnica. Escolha o produto final.");
      exigir(componente.tipo === "material" || componente.tipo === "produto", "Escolha um material ou produto como componente.");
      exigir(!banco.um("select 1 from ficha_itens where produto_id = ?", componente.id), "Esse componente tem ficha própria. Use os materiais dele diretamente.");
      const qtd = quantidade(corpo.quantidade);
      banco.exec(`insert into ficha_itens (produto_id, componente_id, quantidade) values (?, ?, ?)
        on conflict (produto_id, componente_id) do update set quantidade = excluded.quantidade`, produto.id, componente.id, qtd);
      registrar(banco, sessao, "Ficha técnica", `${produto.nome}: ${qtd} × ${componente.nome}`);
    });

    rota("DELETE", "/api/fichas/:produto/:componente", { perm: "catalogo.editar" }, ({ params, sessao }) => {
      const r = banco.exec("delete from ficha_itens where produto_id = ? and componente_id = ?", Number(params.produto), Number(params.componente));
      exigir(r.changes, "Componente não encontrado na ficha.", 404);
      registrar(banco, sessao, "Ficha técnica", `Componente removido do produto ${params.produto}`);
    });

    // ---------- Estoque ----------
    rota("GET", "/api/estoque/movimentos", { perm: "estoque.ver" }, ({ query }) =>
      banco.todos(`select m.*, p.nome as produto, p.unidade, u.nome as usuario from estoque_movimentos m
        join produtos p on p.id = m.produto_id left join usuarios u on u.id = m.usuario_id order by m.id desc limit ?`,
      Math.min(500, Number(query.get("limite")) || 100)));

    rota("POST", "/api/estoque/movimentos", { perm: "estoque.movimentar" }, ({ corpo, sessao }) => {
      const produto = banco.um("select * from produtos where id = ?", Number(corpo.produto_id));
      exigir(produto, "Escolha o produto.", 404);
      exigir(produto.tipo !== "servico", "Serviços não têm estoque.");
      const tipo = umDe(corpo.tipo, ["entrada", "saida", "perda", "ajuste"], "Tipo de movimento inválido.");
      const motivo = texto(corpo.motivo, 200);
      let qtd;
      if (tipo === "ajuste") {
        const contado = quantidade(corpo.quantidade, "Quantidade contada", { positiva: false });
        qtd = arredondar(contado - produto.estoque);
        exigir(qtd !== 0, "O estoque já está com essa quantidade.");
      } else {
        qtd = quantidade(corpo.quantidade);
        if (tipo !== "entrada") {
          exigir(qtd <= produto.estoque + 1e-9, `Estoque insuficiente: há ${produto.estoque} ${produto.unidade} de ${produto.nome}.`);
          qtd = -qtd;
        }
      }
      if (tipo === "perda") exigir(motivo, "Informe o motivo da perda (ex.: flores murchas).");
      const custoUnit = corpo.custo_unit === undefined || corpo.custo_unit === null || corpo.custo_unit === "" ? null : centavos(corpo.custo_unit, "Custo");
      const saldo = banco.transacao(() => {
        // Entrada com custo novo: atualiza o custo do produto pela média ponderada.
        if (tipo === "entrada" && custoUnit !== null) {
          const base = Math.max(0, produto.estoque);
          const medio = base + qtd > 0 ? Math.round((base * produto.custo + qtd * custoUnit) / (base + qtd)) : custoUnit;
          banco.exec("update produtos set custo = ? where id = ?", medio, produto.id);
        }
        return movimentar(produto.id, tipo, qtd, { motivo, custoUnit, usuarioId: sessao.usuario.id });
      });
      registrar(banco, sessao, "Movimento de estoque", `${tipo} ${qtd} ${produto.unidade} · ${produto.nome}`);
      return { saldo };
    });
  }

  return { rotas, movimentar, consumo, custoUnitario, listarProdutos, salvarFoto };
}

module.exports = { criarCatalogo, UNIDADES };
