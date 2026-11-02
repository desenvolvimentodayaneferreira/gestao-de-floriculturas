// Banco de dados do sistema (SQLite embutido no Node; um único arquivo no computador da loja).
// Dinheiro é guardado em centavos (inteiros) para evitar erros de arredondamento.
// Quantidades de estoque aceitam frações (ex.: 0,5 m de fita), com 3 casas decimais.
const { DatabaseSync } = require("node:sqlite");

const MIGRACOES = [
  // 1 — estrutura inicial
  `
  create table config (chave text primary key, valor text not null);

  create table perfis (
    id integer primary key,
    nome text not null unique collate nocase,
    descricao text not null default '',
    permissoes text not null default '[]',      -- JSON com os códigos de permissão
    criado_em integer not null
  );

  create table usuarios (
    id integer primary key,
    usuario text not null unique collate nocase,
    nome text not null,
    setor text not null default '',
    perfil_id integer not null references perfis(id),
    senha_hash text not null,
    senha_sal text not null,
    ativo integer not null default 1,
    tentativas integer not null default 0,
    bloqueado_ate integer,
    criado_em integer not null
  );

  create table sessoes (
    token_hash text primary key,
    usuario_id integer not null references usuarios(id),
    criado_em integer not null,
    ultimo_uso integer not null
  );

  create table categorias (
    id integer primary key,
    nome text not null unique collate nocase,
    ordem integer not null default 0
  );

  create table produtos (
    id integer primary key,
    nome text not null,
    sku text not null unique collate nocase,
    categoria_id integer references categorias(id),
    tipo text not null default 'produto' check (tipo in ('produto', 'material', 'servico')),
    unidade text not null default 'un',
    preco integer not null default 0 check (preco >= 0),
    custo integer not null default 0 check (custo >= 0),
    estoque real not null default 0,
    estoque_minimo real not null default 0,
    descricao text not null default '',
    ativo integer not null default 1,
    criado_em integer not null
  );
  create index produtos_nome on produtos (nome);

  -- Ficha técnica: o que vai em cada criação (buquê, coroa, arranjo...).
  create table ficha_itens (
    produto_id integer not null references produtos(id),
    componente_id integer not null references produtos(id),
    quantidade real not null check (quantidade > 0),
    primary key (produto_id, componente_id)
  );

  create table estoque_movimentos (
    id integer primary key,
    produto_id integer not null references produtos(id),
    tipo text not null check (tipo in ('entrada', 'saida', 'perda', 'ajuste', 'venda', 'estorno')),
    quantidade real not null,                   -- positivo entra, negativo sai
    saldo real not null,                        -- estoque depois do movimento
    custo_unit integer,
    motivo text not null default '',
    venda_id integer,
    usuario_id integer,
    criado_em integer not null
  );
  create index movimentos_produto on estoque_movimentos (produto_id, id);
  create index movimentos_venda on estoque_movimentos (venda_id);

  create table clientes (
    id integer primary key,
    nome text not null,
    telefone text not null default '',
    cpf text unique,                            -- só números; um cadastro por pessoa
    email text not null default '',
    aniversario text,                           -- AAAA-MM-DD
    endereco text not null default '',
    observacoes text not null default '',
    criado_em integer not null
  );
  create index clientes_nome on clientes (nome);

  create table vendas (
    id integer primary key,
    criado_em integer not null,
    dia text not null,                          -- AAAA-MM-DD (hora local da loja)
    cliente_id integer references clientes(id),
    cliente_nome text not null default 'Consumidor',
    cliente_telefone text not null default '',
    cliente_cpf text not null default '',
    canal text not null default 'loja' check (canal in ('loja', 'whatsapp', 'telefone')),
    recebimento text not null default 'retirada' check (recebimento in ('retirada', 'entrega')),
    combinado_para text,                        -- AAAA-MM-DDTHH:MM
    endereco_entrega text not null default '',
    pagamento text not null default 'pix' check (pagamento in ('pix', 'dinheiro', 'debito', 'credito', 'outro')),
    subtotal integer not null,
    desconto integer not null default 0,
    taxa_entrega integer not null default 0,
    total integer not null,
    custo integer not null default 0,
    observacao text not null default '',
    status text not null default 'finalizada' check (status in ('finalizada', 'cancelada')),
    cancelada_em integer,
    cancelada_motivo text,
    usuario_id integer references usuarios(id)
  );
  create index vendas_dia on vendas (dia);

  create table venda_itens (
    id integer primary key,
    venda_id integer not null references vendas(id),
    produto_id integer references produtos(id),
    nome text not null,
    categoria_id integer,
    quantidade real not null check (quantidade > 0),
    preco_unit integer not null,
    custo_unit integer not null default 0
  );
  create index itens_venda on venda_itens (venda_id);

  create table encomendas (
    id integer primary key,
    cliente_id integer not null references clientes(id),
    ocasiao text not null default 'Presente',
    entrega_em text not null,                   -- AAAA-MM-DDTHH:MM
    status text not null default 'aguardando' check (status in ('aguardando', 'producao', 'pronto', 'entrega', 'entregue', 'cancelada')),
    valor integer not null default 0,
    endereco text not null default '',
    mensagem_cartao text not null default '',
    observacoes text not null default '',
    usuario_id integer,
    criado_em integer not null
  );
  create index encomendas_entrega on encomendas (entrega_em);

  create table veiculos (
    id integer primary key,
    nome text not null,
    placa text not null unique collate nocase,
    modelo text not null default '',
    ano integer,
    km real not null default 0,
    ativo integer not null default 1
  );

  create table abastecimentos (
    id integer primary key,
    veiculo_id integer not null references veiculos(id),
    data text not null,
    litros real not null check (litros > 0),
    valor integer not null check (valor >= 0),
    km real not null,
    motorista text not null default '',
    tipo text not null default 'entrega' check (tipo in ('entrega', 'particular', 'interno')),
    observacao text not null default '',
    criado_em integer not null
  );

  create table manutencoes (
    id integer primary key,
    veiculo_id integer not null references veiculos(id),
    data text not null,
    descricao text not null,
    valor integer not null default 0,
    km real not null default 0,
    status text not null default 'realizada' check (status in ('realizada', 'agendada')),
    criado_em integer not null
  );

  create table fechamentos_entrega (
    id integer primary key,
    data text not null,
    entregador text not null,
    quantidade integer not null check (quantidade > 0),
    valor_unit integer not null check (valor_unit >= 0),
    total integer not null,
    observacao text not null default '',
    criado_em integer not null
  );
  create index fechamentos_data on fechamentos_entrega (data);

  create table auditoria (
    id integer primary key,
    usuario_id integer,
    usuario_nome text,
    acao text not null,
    detalhe text,
    criado_em integer not null
  );
  `,

  // 2 — produtos e sinal nas encomendas, despesas (financeiro)
  `
  alter table encomendas add column taxa_entrega integer not null default 0;
  alter table encomendas add column sinal integer not null default 0;
  alter table encomendas add column sinal_forma text;
  alter table encomendas add column venda_id integer references vendas(id);

  create table encomenda_itens (
    id integer primary key,
    encomenda_id integer not null references encomendas(id),
    produto_id integer not null references produtos(id),
    nome text not null,
    quantidade real not null check (quantidade > 0),
    preco_unit integer not null
  );
  create index encomenda_itens_encomenda on encomenda_itens (encomenda_id);

  create table despesas (
    id integer primary key,
    descricao text not null,
    categoria text not null default 'Outros',
    fornecedor text not null default '',
    valor integer not null check (valor > 0),
    vencimento text not null,                   -- AAAA-MM-DD
    pago_em text,                               -- AAAA-MM-DD; null = a pagar
    forma text,
    observacao text not null default '',
    usuario_id integer,
    criado_em integer not null
  );
  create index despesas_vencimento on despesas (vencimento);

  update perfis set permissoes = json_insert(permissoes, '$[#]', 'financeiro.gerenciar')
    where nome in ('Direção', 'Gerência', 'Programador Técnico') and permissoes not like '%financeiro.gerenciar%';
  `,

  // 3 — fotos dos produtos (separadas, para a lista de produtos continuar leve)
  `
  create table produto_fotos (
    produto_id integer primary key references produtos(id),
    tipo text not null,
    imagem blob not null,
    atualizado_em integer not null
  );
  `,
];

function abrir(arquivo) {
  const db = new DatabaseSync(arquivo);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  const versao = db.prepare("pragma user_version").get().user_version;
  for (let i = versao; i < MIGRACOES.length; i++) {
    db.exec("begin");
    try {
      db.exec(MIGRACOES[i]);
      db.exec(`pragma user_version = ${i + 1}`);
      db.exec("commit");
    } catch (erro) {
      db.exec("rollback");
      throw erro;
    }
  }

  return {
    bruto: db,
    todos: (sql, ...p) => db.prepare(sql).all(...p),
    um: (sql, ...p) => db.prepare(sql).get(...p) || null,
    exec: (sql, ...p) => db.prepare(sql).run(...p),
    // Várias gravações de uma vez: ou grava tudo, ou nada.
    transacao(fn) {
      if (db.isTransaction) return fn();
      db.exec("begin immediate");
      try {
        const resultado = fn();
        db.exec("commit");
        return resultado;
      } catch (erro) {
        db.exec("rollback");
        throw erro;
      }
    },
    config(chave, padrao = null) {
      const linha = db.prepare("select valor from config where chave = ?").get(chave);
      return linha ? JSON.parse(linha.valor) : padrao;
    },
    salvarConfig(chave, valor) {
      db.prepare("insert into config (chave, valor) values (?, ?) on conflict (chave) do update set valor = excluded.valor").run(chave, JSON.stringify(valor));
    },
    // Cópia de segurança consistente mesmo com o sistema em uso.
    copiar(destino) {
      db.prepare("vacuum into ?").run(destino);
    },
    fechar: () => db.close(),
  };
}

// Confere se um arquivo é um banco do sistema (usado antes de restaurar uma cópia).
function ehBancoFloricultura(arquivo) {
  let db;
  try {
    db = new DatabaseSync(arquivo, { readOnly: true });
    const versao = db.prepare("pragma user_version").get().user_version;
    const tabelas = db.prepare("select name from sqlite_master where type = 'table'").all().map((t) => t.name);
    return versao >= 1 && versao <= MIGRACOES.length && ["vendas", "produtos", "usuarios", "perfis"].every((t) => tabelas.includes(t));
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

module.exports = { abrir, ehBancoFloricultura, VERSAO_BANCO: MIGRACOES.length };
