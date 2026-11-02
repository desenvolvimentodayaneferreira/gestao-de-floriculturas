// Clientes, vendas (com baixa automática do estoque pela ficha técnica) e encomendas.
const {
  ErroHttp, exigir, texto, soNumeros, centavos, quantidade, arredondar, diaLocal, dataValida, dataHoraValida, cpfValido, registrar, umDe,
} = require("./comum");

const CANAIS = ["loja", "whatsapp", "telefone"];
const RECEBIMENTOS = ["retirada", "entrega"];
const PAGAMENTOS = ["pix", "dinheiro", "debito", "credito", "outro"];
const STATUS_ENCOMENDA = ["aguardando", "producao", "pronto", "entrega", "entregue", "cancelada"];

function criarVendas(banco, catalogo) {
  const exigeCpf = () => banco.config("exigir_cpf", true);

  function normalizarCpf(valor, obrigatorio) {
    const cpf = soNumeros(valor);
    if (!cpf) {
      exigir(!obrigatorio, "Informe o CPF do cliente.");
      return null;
    }
    exigir(cpfValido(cpf), "CPF inválido. Confira os números.");
    return cpf;
  }

  function dadosCliente(corpo, atual = {}) {
    const nome = texto(corpo.nome ?? atual.nome, 120);
    exigir(nome, "Informe o nome do cliente.");
    const aniversario = corpo.aniversario === undefined ? atual.aniversario ?? null : corpo.aniversario || null;
    exigir(!aniversario || dataValida(aniversario), "Data de aniversário inválida.");
    const email = texto(corpo.email ?? atual.email, 120);
    exigir(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "E-mail inválido.");
    return {
      nome,
      telefone: texto(corpo.telefone ?? atual.telefone, 30),
      email,
      aniversario,
      endereco: texto(corpo.endereco ?? atual.endereco, 250),
      observacoes: texto(corpo.observacoes ?? atual.observacoes, 500),
    };
  }

  // Encontra o cliente pelo CPF (um cadastro por pessoa) ou cria um novo.
  function clienteDaVenda(corpo) {
    // Cliente já cadastrado (ex.: encomenda virando venda).
    if (corpo.cliente_id && !corpo.cliente_cpf) {
      const c = banco.um("select * from clientes where id = ?", Number(corpo.cliente_id));
      exigir(c, "Cliente não encontrado.", 404);
      return { id: c.id, nome: c.nome, telefone: c.telefone, cpf: c.cpf || "" };
    }
    const cpf = normalizarCpf(corpo.cliente_cpf, exigeCpf());
    const nome = texto(corpo.cliente_nome, 120);
    const telefone = texto(corpo.cliente_telefone, 30);
    if (cpf) {
      exigir(nome, "Informe o nome do cliente.");
      exigir(telefone, "Informe o telefone do cliente.");
      const existente = banco.um("select * from clientes where cpf = ?", cpf);
      if (existente) {
        banco.exec("update clientes set nome = ?, telefone = ? where id = ?", nome, telefone, existente.id);
        return { id: existente.id, nome, telefone, cpf };
      }
      const r = banco.exec("insert into clientes (nome, telefone, cpf, criado_em) values (?, ?, ?, ?)", nome, telefone, cpf, Date.now());
      return { id: Number(r.lastInsertRowid), nome, telefone, cpf };
    }
    if (corpo.cliente_id) {
      const c = banco.um("select * from clientes where id = ?", Number(corpo.cliente_id));
      exigir(c, "Cliente não encontrado.", 404);
      return { id: c.id, nome: c.nome, telefone: c.telefone, cpf: c.cpf || "" };
    }
    if (nome) {
      const r = banco.exec("insert into clientes (nome, telefone, criado_em) values (?, ?, ?)", nome, telefone, Date.now());
      return { id: Number(r.lastInsertRowid), nome, telefone, cpf: "" };
    }
    return { id: null, nome: "Consumidor", telefone: "", cpf: "" };
  }

  function registrarVenda(corpo, sessao) {
    exigir(Array.isArray(corpo.itens) && corpo.itens.length, "Inclua ao menos um produto.");
    exigir(corpo.itens.length <= 100, "Itens demais em uma venda.");
    const canal = umDe(corpo.canal || "loja", CANAIS, "Canal de atendimento inválido.");
    const recebimento = umDe(corpo.recebimento || "retirada", RECEBIMENTOS, "Forma de recebimento inválida.");
    const pagamento = umDe(corpo.pagamento || "pix", PAGAMENTOS, "Forma de pagamento inválida.");
    const combinado = corpo.combinado_para || null;
    exigir(!combinado || dataHoraValida(combinado), "Data e horário combinados inválidos.");
    const endereco = texto(corpo.endereco_entrega, 250);
    if (recebimento === "entrega") {
      exigir(endereco, "Informe o endereço de entrega.");
      exigir(combinado, "Informe a data e o horário da entrega.");
    }

    return banco.transacao(() => {
      const itens = [];
      const necessidade = new Map(); // produto_id → quantidade que sai do estoque
      for (const item of corpo.itens) {
        const produto = banco.um("select * from produtos where id = ? and ativo = 1", Number(item.produto_id));
        exigir(produto, "Produto não encontrado ou desativado.", 404);
        exigir(produto.tipo !== "material" || produto.preco > 0, `${produto.nome} é matéria-prima sem preço de venda.`);
        const qtd = quantidade(item.quantidade);
        const preco = item.preco_unit === undefined || item.preco_unit === null ? produto.preco : centavos(item.preco_unit, "Preço");
        itens.push({ produto, qtd, preco, custo: catalogo.custoUnitario(produto) });
        for (const c of catalogo.consumo(produto, qtd)) necessidade.set(c.produto_id, arredondar((necessidade.get(c.produto_id) || 0) + c.quantidade));
      }
      const faltas = [];
      for (const [produtoId, qtd] of necessidade) {
        const p = banco.um("select nome, unidade, estoque from produtos where id = ?", produtoId);
        if (p.estoque + 1e-9 < qtd) faltas.push(`${p.nome} (precisa ${qtd} ${p.unidade}, há ${p.estoque})`);
      }
      if (faltas.length) throw new ErroHttp(409, `Estoque insuficiente: ${faltas.join("; ")}.`);

      const subtotal = itens.reduce((s, i) => s + Math.round(i.preco * i.qtd), 0);
      const desconto = centavos(corpo.desconto, "Desconto");
      exigir(desconto <= subtotal, "O desconto não pode ser maior que o valor dos produtos.");
      const taxa = recebimento === "entrega" ? centavos(corpo.taxa_entrega, "Taxa de entrega") : 0;
      const total = subtotal - desconto + taxa;
      const custo = itens.reduce((s, i) => s + Math.round(i.custo * i.qtd), 0);
      const cliente = clienteDaVenda(corpo);
      const agora = new Date();
      const r = banco.exec(`insert into vendas (criado_em, dia, cliente_id, cliente_nome, cliente_telefone, cliente_cpf, canal, recebimento, combinado_para,
          endereco_entrega, pagamento, subtotal, desconto, taxa_entrega, total, custo, observacao, usuario_id)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      agora.getTime(), diaLocal(agora), cliente.id, cliente.nome, cliente.telefone, cliente.cpf || "", canal, recebimento, combinado,
      endereco, pagamento, subtotal, desconto, taxa, total, custo, texto(corpo.observacao, 500), sessao.usuario.id);
      const vendaId = Number(r.lastInsertRowid);
      for (const i of itens) {
        banco.exec("insert into venda_itens (venda_id, produto_id, nome, categoria_id, quantidade, preco_unit, custo_unit) values (?, ?, ?, ?, ?, ?, ?)",
          vendaId, i.produto.id, i.produto.nome, i.produto.categoria_id, i.qtd, i.preco, i.custo);
      }
      for (const [produtoId, qtd] of necessidade) {
        catalogo.movimentar(produtoId, "venda", -qtd, { motivo: `Venda nº ${vendaId}`, vendaId, usuarioId: sessao.usuario.id });
      }
      registrar(banco, sessao, "Venda", `nº ${vendaId} · ${cliente.nome} · R$ ${(total / 100).toFixed(2)}`);
      return { id: vendaId, total, cliente_id: cliente.id };
    });
  }

  function venda(id) {
    const v = banco.um("select v.*, u.nome as vendedor from vendas v left join usuarios u on u.id = v.usuario_id where v.id = ?", id);
    exigir(v, "Venda não encontrada.", 404);
    v.itens = banco.todos("select * from venda_itens where venda_id = ? order by id", id);
    return v;
  }

  function rotas(rota) {
    // ---------- Clientes ----------
    rota("GET", "/api/clientes", { perm: ["vendas.ver", "vendas.registrar"] }, ({ query }) => {
      const busca = texto(query.get("busca"), 60);
      const filtro = busca ? "where c.nome like ? or c.cpf like ? or c.telefone like ?" : "";
      const termos = busca ? [`%${busca}%`, `%${soNumeros(busca) || busca}%`, `%${busca}%`] : [];
      return banco.todos(`select c.*,
          (select count(*) from vendas v where v.cliente_id = c.id and v.status = 'finalizada') as compras,
          (select coalesce(sum(total), 0) from vendas v where v.cliente_id = c.id and v.status = 'finalizada') as total_compras,
          (select max(v.criado_em) from vendas v where v.cliente_id = c.id and v.status = 'finalizada') as ultima_compra,
          (select count(*) from encomendas e where e.cliente_id = c.id and e.status <> 'cancelada') as encomendas
        from clientes c ${filtro} order by c.nome limit 500`, ...termos);
    });

    rota("GET", "/api/clientes/cpf/:cpf", { perm: ["vendas.ver", "vendas.registrar"] }, ({ params }) =>
      banco.um("select id, nome, telefone, cpf, endereco from clientes where cpf = ?", soNumeros(params.cpf)) || {});

    rota("GET", "/api/clientes/:id", { perm: "vendas.ver" }, ({ params }) => {
      const c = banco.um("select * from clientes where id = ?", Number(params.id));
      exigir(c, "Cliente não encontrado.", 404);
      c.vendas = banco.todos("select id, criado_em, total, status, pagamento, recebimento from vendas where cliente_id = ? order by id desc limit 100", c.id);
      c.encomendas = banco.todos("select id, ocasiao, entrega_em, status, valor from encomendas where cliente_id = ? order by entrega_em desc limit 100", c.id);
      return c;
    });

    rota("POST", "/api/clientes", { perm: "vendas.registrar" }, ({ corpo, sessao }) => {
      const dados = dadosCliente(corpo);
      const cpf = normalizarCpf(corpo.cpf, exigeCpf());
      if (cpf) {
        const existente = banco.um("select nome from clientes where cpf = ?", cpf);
        exigir(!existente, `CPF já cadastrado para ${existente?.nome}.`, 409);
      }
      const r = banco.exec("insert into clientes (nome, telefone, cpf, email, aniversario, endereco, observacoes, criado_em) values (?, ?, ?, ?, ?, ?, ?, ?)",
        dados.nome, dados.telefone, cpf, dados.email, dados.aniversario, dados.endereco, dados.observacoes, Date.now());
      registrar(banco, sessao, "Cadastro de cliente", dados.nome);
      return { id: Number(r.lastInsertRowid) };
    });

    rota("PUT", "/api/clientes/:id", { perm: "vendas.registrar" }, ({ params, corpo, sessao }) => {
      const atual = banco.um("select * from clientes where id = ?", Number(params.id));
      exigir(atual, "Cliente não encontrado.", 404);
      const dados = dadosCliente(corpo, atual);
      let cpf = atual.cpf;
      if (corpo.cpf !== undefined) {
        cpf = normalizarCpf(corpo.cpf, false);
        if (cpf) {
          const outro = banco.um("select nome from clientes where cpf = ? and id <> ?", cpf, atual.id);
          exigir(!outro, `CPF já cadastrado para ${outro?.nome}.`, 409);
        }
      }
      banco.exec("update clientes set nome = ?, telefone = ?, cpf = ?, email = ?, aniversario = ?, endereco = ?, observacoes = ? where id = ?",
        dados.nome, dados.telefone, cpf, dados.email, dados.aniversario, dados.endereco, dados.observacoes, atual.id);
      registrar(banco, sessao, "Alteração de cliente", dados.nome);
    });

    // ---------- Vendas ----------
    rota("GET", "/api/vendas", { perm: "vendas.ver" }, ({ query }) => {
      const de = query.get("de");
      const ate = query.get("ate");
      const condicoes = [];
      const valores = [];
      if (dataValida(de)) {
        condicoes.push("v.dia >= ?");
        valores.push(de);
      }
      if (dataValida(ate)) {
        condicoes.push("v.dia <= ?");
        valores.push(ate);
      }
      const busca = texto(query.get("busca"), 60);
      if (busca) {
        condicoes.push("(v.cliente_nome like ? or v.cliente_cpf like ? or cast(v.id as text) = ?)");
        valores.push(`%${busca}%`, `%${soNumeros(busca) || busca}%`, busca);
      }
      return banco.todos(`select v.*, u.nome as vendedor,
          (select group_concat(case when i.quantidade = 1 then i.nome else replace(cast(i.quantidade as text), '.0', '') || ' × ' || i.nome end, ', ') from venda_itens i where i.venda_id = v.id) as resumo
        from vendas v left join usuarios u on u.id = v.usuario_id
        ${condicoes.length ? `where ${condicoes.join(" and ")}` : ""} order by v.id desc limit ?`, ...valores, Math.min(2000, Number(query.get("limite")) || 300));
    });

    rota("GET", "/api/vendas/:id", { perm: "vendas.ver" }, ({ params }) => venda(Number(params.id)));

    rota("POST", "/api/vendas", { perm: "vendas.registrar" }, ({ corpo, sessao }) => registrarVenda(corpo, sessao));

    // Cancelar devolve ao estoque exatamente o que a venda tirou.
    rota("POST", "/api/vendas/:id/cancelar", { perm: "vendas.cancelar" }, ({ params, corpo, sessao }) => {
      const v = venda(Number(params.id));
      exigir(v.status === "finalizada", "Esta venda já foi cancelada.");
      const motivo = texto(corpo.motivo, 200);
      exigir(motivo, "Informe o motivo do cancelamento.");
      banco.transacao(() => {
        const saidas = banco.todos("select produto_id, sum(quantidade) as qtd from estoque_movimentos where venda_id = ? and tipo = 'venda' group by produto_id", v.id);
        for (const s of saidas) {
          if (s.qtd < 0) catalogo.movimentar(s.produto_id, "estorno", -s.qtd, { motivo: `Cancelamento da venda nº ${v.id}`, vendaId: v.id, usuarioId: sessao.usuario.id });
        }
        banco.exec("update vendas set status = 'cancelada', cancelada_em = ?, cancelada_motivo = ? where id = ?", Date.now(), motivo, v.id);
      });
      registrar(banco, sessao, "Cancelamento de venda", `nº ${v.id} · ${motivo}`);
    });

    // ---------- Encomendas ----------
    // Itens opcionais: com produtos, o valor é calculado e a encomenda pode virar venda (baixa no estoque).
    function lerItens(lista) {
      exigir(Array.isArray(lista), "Itens inválidos.");
      exigir(lista.length <= 50, "Itens demais em uma encomenda.");
      return lista.map((item) => {
        const produto = banco.um("select * from produtos where id = ? and ativo = 1", Number(item.produto_id));
        exigir(produto, "Produto não encontrado ou desativado.", 404);
        const preco = item.preco_unit === undefined || item.preco_unit === null ? produto.preco : centavos(item.preco_unit, "Preço");
        return { produto_id: produto.id, nome: produto.nome, quantidade: quantidade(item.quantidade), preco_unit: preco };
      });
    }

    function dadosEncomenda(corpo, atual = {}) {
      const clienteId = Number(corpo.cliente_id ?? atual.cliente_id);
      exigir(banco.um("select 1 from clientes where id = ?", clienteId), "Escolha o cliente.");
      const entrega = corpo.entrega_em ?? atual.entrega_em;
      exigir(dataHoraValida(entrega), "Informe a data e o horário da entrega.");
      const itens = corpo.itens === undefined ? null : lerItens(corpo.itens);
      const itensAtuais = itens ?? (atual.id ? banco.todos("select * from encomenda_itens where encomenda_id = ?", atual.id) : []);
      const taxa = centavos(corpo.taxa_entrega ?? atual.taxa_entrega, "Taxa de entrega");
      const valor = itensAtuais.length
        ? itensAtuais.reduce((s, i) => s + Math.round(i.quantidade * i.preco_unit), 0) + taxa
        : centavos(corpo.valor ?? atual.valor, "Valor");
      const sinal = centavos(corpo.sinal ?? atual.sinal, "Sinal");
      exigir(sinal <= valor || !valor, "O sinal não pode ser maior que o valor da encomenda.");
      const sinalForma = sinal ? umDe(corpo.sinal_forma ?? atual.sinal_forma ?? "pix", PAGAMENTOS, "Forma do sinal inválida.") : null;
      return {
        cliente_id: clienteId,
        ocasiao: texto(corpo.ocasiao ?? atual.ocasiao, 60) || "Presente",
        entrega_em: entrega,
        valor, taxa_entrega: taxa, sinal, sinal_forma: sinalForma, itens,
        endereco: texto(corpo.endereco ?? atual.endereco, 250),
        mensagem_cartao: texto(corpo.mensagem_cartao ?? atual.mensagem_cartao, 500),
        observacoes: texto(corpo.observacoes ?? atual.observacoes, 500),
      };
    }

    function gravarItens(encomendaId, itens) {
      if (!itens) return;
      banco.exec("delete from encomenda_itens where encomenda_id = ?", encomendaId);
      for (const i of itens) {
        banco.exec("insert into encomenda_itens (encomenda_id, produto_id, nome, quantidade, preco_unit) values (?, ?, ?, ?, ?)",
          encomendaId, i.produto_id, i.nome, i.quantidade, i.preco_unit);
      }
    }

    function comItens(encomendas) {
      if (!encomendas.length) return encomendas;
      const itens = banco.todos(`select * from encomenda_itens where encomenda_id in (${encomendas.map(() => "?").join(",")}) order by id`, ...encomendas.map((e) => e.id));
      return encomendas.map((e) => ({ ...e, saldo: Math.max(0, e.valor - e.sinal), itens: itens.filter((i) => i.encomenda_id === e.id) }));
    }

    rota("GET", "/api/encomendas", { perm: "vendas.ver" }, ({ query }) => {
      const todas = query.get("todas") === "1";
      // Por padrão: tudo em aberto + entregues/canceladas dos últimos 7 dias.
      const desde = `${diaLocal(new Date(Date.now() - 7 * 864e5))}T00:00`;
      return comItens(banco.todos(`select e.*, c.nome as cliente, c.telefone from encomendas e join clientes c on c.id = e.cliente_id
        ${todas ? "" : "where e.status not in ('entregue', 'cancelada') or e.entrega_em >= ?"} order by e.entrega_em limit 1000`, ...(todas ? [] : [desde])));
    });

    rota("POST", "/api/encomendas", { perm: "vendas.registrar" }, ({ corpo, sessao }) => {
      const e = dadosEncomenda(corpo);
      const id = banco.transacao(() => {
        const r = banco.exec(`insert into encomendas (cliente_id, ocasiao, entrega_em, valor, taxa_entrega, sinal, sinal_forma, endereco, mensagem_cartao, observacoes, usuario_id, criado_em)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, e.cliente_id, e.ocasiao, e.entrega_em, e.valor, e.taxa_entrega, e.sinal, e.sinal_forma, e.endereco, e.mensagem_cartao, e.observacoes, sessao.usuario.id, Date.now());
        gravarItens(Number(r.lastInsertRowid), e.itens);
        return Number(r.lastInsertRowid);
      });
      registrar(banco, sessao, "Nova encomenda", `nº ${id} · ${e.ocasiao} · ${e.entrega_em} · R$ ${(e.valor / 100).toFixed(2)}`);
      return { id, valor: e.valor };
    });

    rota("PUT", "/api/encomendas/:id", { perm: "vendas.registrar" }, ({ params, corpo, sessao }) => {
      const atual = banco.um("select * from encomendas where id = ?", Number(params.id));
      exigir(atual, "Encomenda não encontrada.", 404);
      exigir(!atual.venda_id || (corpo.itens === undefined && corpo.valor === undefined && corpo.taxa_entrega === undefined),
        "Esta encomenda já virou venda: os produtos e o valor não podem mais mudar.");
      const e = dadosEncomenda(corpo, atual);
      const status = corpo.status === undefined ? atual.status : umDe(corpo.status, STATUS_ENCOMENDA, "Situação inválida.");
      banco.transacao(() => {
        banco.exec(`update encomendas set cliente_id = ?, ocasiao = ?, entrega_em = ?, valor = ?, taxa_entrega = ?, sinal = ?, sinal_forma = ?, endereco = ?, mensagem_cartao = ?, observacoes = ?, status = ? where id = ?`,
          e.cliente_id, e.ocasiao, e.entrega_em, e.valor, e.taxa_entrega, e.sinal, e.sinal_forma, e.endereco, e.mensagem_cartao, e.observacoes, status, atual.id);
        gravarItens(atual.id, e.itens);
      });
      registrar(banco, sessao, "Encomenda atualizada", `nº ${atual.id}${status !== atual.status ? ` · ${atual.status} → ${status}` : ""}`);
    });

    // Fecha a encomenda como venda: tira os materiais do estoque e entra no faturamento.
    rota("POST", "/api/encomendas/:id/venda", { perm: "vendas.registrar" }, ({ params, corpo, sessao }) => {
      const e = comItens([banco.um("select * from encomendas where id = ?", Number(params.id))].filter(Boolean))[0];
      exigir(e, "Encomenda não encontrada.", 404);
      exigir(!e.venda_id, `Esta encomenda já virou a venda nº ${e.venda_id}.`);
      exigir(e.status !== "cancelada", "Encomenda cancelada.");
      exigir(e.itens.length, "Inclua os produtos na encomenda antes de registrar a venda.");
      const sinal = e.sinal ? ` · sinal de R$ ${(e.sinal / 100).toFixed(2).replace(".", ",")} (${e.sinal_forma})` : "";
      const venda = registrarVenda({
        cliente_id: e.cliente_id,
        canal: umDe(corpo.canal || "whatsapp", CANAIS, "Canal inválido."),
        recebimento: e.endereco ? "entrega" : "retirada",
        endereco_entrega: e.endereco,
        combinado_para: e.entrega_em,
        taxa_entrega: e.endereco ? e.taxa_entrega : 0,
        pagamento: corpo.pagamento || e.sinal_forma || "pix",
        observacao: `Encomenda nº ${e.id} · ${e.ocasiao}${sinal}${e.mensagem_cartao ? ` · Cartão: ${e.mensagem_cartao}` : ""}`.slice(0, 500),
        itens: e.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco_unit: i.preco_unit })),
      }, sessao);
      banco.exec("update encomendas set venda_id = ? where id = ?", venda.id, e.id);
      registrar(banco, sessao, "Encomenda virou venda", `encomenda nº ${e.id} → venda nº ${venda.id}`);
      return venda;
    });

    // Produção: o que montar, materiais necessários x estoque (lista de compras) e roteiro de entregas.
    rota("GET", "/api/producao", { perm: "vendas.ver" }, ({ query }) => {
      const hoje = diaLocal();
      const de = dataValida(query.get("de")) ? query.get("de") : hoje;
      const ate = dataValida(query.get("ate")) ? query.get("ate") : de;
      exigir(de <= ate, "Período inválido.");
      const encomendas = comItens(banco.todos(`select e.*, c.nome as cliente, c.telefone from encomendas e join clientes c on c.id = e.cliente_id
        where e.status not in ('entregue', 'cancelada') and substr(e.entrega_em, 1, 10) between ? and ? order by e.entrega_em`, de, ate));
      const entregasVendas = banco.todos(`select v.id, v.combinado_para as quando, v.cliente_nome as cliente, v.cliente_telefone as telefone, v.endereco_entrega as endereco, v.observacao,
          (select group_concat(i.nome, ', ') from venda_itens i where i.venda_id = v.id) as resumo
        from vendas v where v.status = 'finalizada' and v.recebimento = 'entrega' and substr(v.combinado_para, 1, 10) between ? and ?
          and v.id not in (select venda_id from encomendas where venda_id is not null) order by v.combinado_para`, de, ate);

      // Materiais para as encomendas ainda não montadas (as já prontas ou vendidas não precisam mais).
      const necessidade = new Map();
      for (const e of encomendas.filter((x) => !x.venda_id && ["aguardando", "producao"].includes(x.status))) {
        for (const i of e.itens) {
          const produto = banco.um("select * from produtos where id = ?", i.produto_id);
          for (const c of catalogo.consumo(produto, i.quantidade)) necessidade.set(c.produto_id, arredondar((necessidade.get(c.produto_id) || 0) + c.quantidade));
        }
      }
      const materiais = banco.todos(`select id, nome, unidade, estoque, estoque_minimo, custo from produtos
          where ativo = 1 and tipo <> 'servico' and not exists (select 1 from ficha_itens f where f.produto_id = produtos.id) order by nome`)
        .map((p) => {
          const precisa = necessidade.get(p.id) || 0;
          const comprar = arredondar(Math.max(0, precisa + p.estoque_minimo - p.estoque));
          return { ...p, precisa, comprar, falta: arredondar(Math.max(0, precisa - p.estoque)) };
        })
        .filter((p) => p.precisa > 0 || p.comprar > 0);

      const roteiro = [
        ...encomendas.filter((e) => e.endereco).map((e) => ({ origem: "encomenda", id: e.id, quando: e.entrega_em, cliente: e.cliente, telefone: e.telefone, endereco: e.endereco, descricao: e.itens.map((i) => i.nome).join(", ") || e.ocasiao, mensagem: e.mensagem_cartao, saldo: e.venda_id ? 0 : e.saldo })),
        ...entregasVendas.map((v) => ({ origem: "venda", id: v.id, quando: v.quando, cliente: v.cliente, telefone: v.telefone, endereco: v.endereco, descricao: v.resumo, mensagem: v.observacao, saldo: 0 })),
      ].sort((a, b) => a.quando.localeCompare(b.quando));

      return { de, ate, encomendas, materiais, roteiro, custo_compras: materiais.reduce((s, m) => s + Math.round(m.comprar * m.custo), 0) };
    });
  }

  return { rotas, registrarVenda };
}

module.exports = { criarVendas, PAGAMENTOS, CANAIS };
