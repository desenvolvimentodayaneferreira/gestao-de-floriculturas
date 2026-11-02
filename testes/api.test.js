// Testes das regras do sistema pela API (servidor real, banco temporário). Rodar: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { iniciarServidor } = require("../servidor/app");
const { cpfValido, diaLocal } = require("../servidor/comum");

let app;
let base;
let pasta;
const tokens = {};
const ids = {};
const SENHA = "Flores2026";

async function api(metodo, caminho, corpo, quem) {
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(quem ? { Authorization: `Bearer ${tokens[quem]}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resposta.status, dados: await resposta.json() };
}
const ok = async (...args) => {
  const r = await api(...args);
  assert.equal(r.status, 200, `${args[0]} ${args[1]} → ${r.status}: ${JSON.stringify(r.dados)}`);
  return r.dados;
};
const produto = async (id) => ok("GET", `/api/produtos/${id}`, null, "admin");

test.before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "floricultura-teste-"));
  app = iniciarServidor({ pastaDados: pasta, porta: 0 });
  base = `http://127.0.0.1:${await app.pronto}`;
});
test.after(() => app.parar());

test("CPF: confere os dígitos verificadores", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("52998224726"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("123"), false);
});

test("primeiro acesso cria o administrador (sem senha de fábrica)", async () => {
  assert.equal((await ok("GET", "/api/estado")).configurado, false);
  assert.equal((await api("POST", "/api/login", { usuario: "admin", senha: "Floricultura@123" })).status, 401, "a senha antiga de fábrica não existe mais");
  assert.equal((await api("POST", "/api/configurar", { loja: "Floricultura Exemplo", nome: "Dayane", usuario: "dayane", senha: "123" })).status, 400, "senha fraca");
  assert.equal((await api("POST", "/api/configurar", { loja: "Floricultura Exemplo", nome: "Dayane", usuario: "dayane", senha: "somenteletras" })).status, 400, "senha sem números");
  await ok("POST", "/api/configurar", { loja: "Floricultura Exemplo", nome: "Dayane Ferreira", usuario: "Dayane", senha: SENHA });
  assert.equal((await api("POST", "/api/configurar", { loja: "X", nome: "Y", usuario: "outro", senha: SENHA })).status, 409);
  assert.equal((await ok("GET", "/api/estado")).configurado, true);

  const errado = await api("POST", "/api/login", { usuario: "dayane", senha: "Errada123" });
  assert.equal(errado.status, 401);
  assert.match(errado.dados.erro, /Restam 4/);
  tokens.admin = (await ok("POST", "/api/login", { usuario: "DAYANE", senha: SENHA })).token;
  const eu = await ok("GET", "/api/eu", null, "admin");
  assert.equal(eu.perfil, "Direção");
  assert.ok(eu.permissoes.includes("perfis.gerenciar"));
  assert.equal((await api("GET", "/api/eu")).status, 401, "sem sessão não entra");
});

test("só atende pelo endereço do próprio computador", async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/estado`, { headers: { Host: "site-malicioso.com" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});

test("usuários, perfis e permissões", async () => {
  const perfis = await ok("GET", "/api/perfis", null, "admin");
  assert.deepEqual(perfis.map((p) => p.nome).sort(), ["Atendimento", "Colaborador", "Direção", "Gerência", "Programador Técnico"]);
  ids.perfilAtendimento = perfis.find((p) => p.nome === "Atendimento").id;
  ids.perfilDirecao = perfis.find((p) => p.nome === "Direção").id;

  ids.ana = (await ok("POST", "/api/usuarios", { nome: "Ana Atendente", usuario: "ana", senha: "Balcao2026", setor: "Loja", perfil_id: ids.perfilAtendimento }, "admin")).id;
  assert.equal((await api("POST", "/api/usuarios", { nome: "Outra", usuario: "ANA", senha: "Balcao2026", perfil_id: ids.perfilAtendimento }, "admin")).status, 409);
  tokens.ana = (await ok("POST", "/api/login", { usuario: "ana", senha: "Balcao2026" })).token;
  assert.equal((await api("GET", "/api/usuarios", null, "ana")).status, 403, "atendimento não gerencia usuários");
  assert.equal((await api("POST", "/api/produtos", { nome: "X", sku: "X1" }, "ana")).status, 403, "atendimento não edita catálogo");

  const admin = (await ok("GET", "/api/usuarios", null, "admin")).find((u) => u.usuario === "dayane");
  assert.equal((await api("PUT", `/api/usuarios/${admin.id}`, { ativo: false }, "admin")).status, 400, "não desativa o único administrador");
  assert.equal((await api("PUT", `/api/perfis/${ids.perfilDirecao}`, { nome: "Direção", permissoes: ["painel.ver"] }, "admin")).status, 400, "não tira o acesso do único administrador");
  assert.equal((await api("DELETE", `/api/perfis/${ids.perfilAtendimento}`, null, "admin")).status, 400, "perfil em uso");
});

test("bloqueio após 5 senhas erradas e troca de senha", async () => {
  const id = (await ok("POST", "/api/usuarios", { nome: "Temp", usuario: "temp", senha: "Temporaria1", perfil_id: ids.perfilAtendimento }, "admin")).id;
  for (let i = 0; i < 5; i++) await api("POST", "/api/login", { usuario: "temp", senha: "Errada0000" });
  assert.equal((await api("POST", "/api/login", { usuario: "temp", senha: "Temporaria1" })).status, 423, "bloqueado mesmo com a senha certa");
  await ok("PUT", `/api/usuarios/${id}`, { desbloquear: true }, "admin");
  tokens.temp = (await ok("POST", "/api/login", { usuario: "temp", senha: "Temporaria1" })).token;
  assert.equal((await api("PUT", "/api/eu/senha", { atual: "errada", nova: "NovaSenha22" }, "temp")).status, 400);
  await ok("PUT", "/api/eu/senha", { atual: "Temporaria1", nova: "NovaSenha22" }, "temp");
  await ok("POST", "/api/login", { usuario: "temp", senha: "NovaSenha22" });
  await ok("PUT", `/api/usuarios/${id}`, { ativo: false }, "admin");
  assert.equal((await api("GET", "/api/eu", null, "temp")).status, 401, "desativado perde a sessão");
});

test("catálogo, fichas técnicas e estoque", async () => {
  const categorias = await ok("GET", "/api/categorias", null, "admin");
  const cat = (nome) => categorias.find((c) => c.nome === nome).id;
  ids.catBuques = cat("Buquês");
  ids.catCoroas = cat("Coroas");
  ids.rosa = (await ok("POST", "/api/produtos", { nome: "Rosa vermelha", sku: "mat-rosa", tipo: "material", unidade: "haste", custo: 450, estoque: 50, estoque_minimo: 20, categoria_id: cat("Flores e folhagens") }, "admin")).id;
  ids.papel = (await ok("POST", "/api/produtos", { nome: "Papel coreano", sku: "MAT-PAPEL", tipo: "material", unidade: "un", custo: 300, estoque: 10, estoque_minimo: 5, categoria_id: cat("Embalagens") }, "admin")).id;
  ids.fita = (await ok("POST", "/api/produtos", { nome: "Fita de cetim", sku: "MAT-FITA", tipo: "material", unidade: "m", custo: 150, estoque: 5, estoque_minimo: 2, categoria_id: cat("Materiais") }, "admin")).id;
  assert.equal((await api("POST", "/api/produtos", { nome: "Outra rosa", sku: "MAT-ROSA", tipo: "material" }, "admin")).status, 409, "SKU repetido (sem diferenciar maiúsculas)");

  ids.buque = (await ok("POST", "/api/produtos", { nome: "Buquê 12 rosas", sku: "BUQ-12", tipo: "produto", preco: 18990, categoria_id: ids.catBuques }, "admin")).id;
  await ok("PUT", `/api/fichas/${ids.buque}/${ids.rosa}`, { quantidade: 12 }, "admin");
  await ok("PUT", `/api/fichas/${ids.buque}/${ids.papel}`, { quantidade: 2 }, "admin");
  await ok("PUT", `/api/fichas/${ids.buque}/${ids.fita}`, { quantidade: 0.5 }, "admin");
  assert.equal((await api("PUT", `/api/fichas/${ids.buque}/${ids.buque}`, { quantidade: 1 }, "admin")).status, 400);

  const fichas = await ok("GET", "/api/fichas", null, "admin");
  const f = fichas.find((x) => x.id === ids.buque);
  assert.equal(f.custo, 12 * 450 + 2 * 300 + 75, "custo pela ficha");
  assert.equal(f.possiveis, 4, "rosas dão para 4 buquês");

  ids.coroa = (await ok("POST", "/api/produtos", { nome: "Coroa de flores média", sku: "COR-M", preco: 45000, custo: 20000, estoque: 3, categoria_id: ids.catCoroas }, "admin")).id;
  ids.taxa = (await ok("POST", "/api/produtos", { nome: "Cartão personalizado", sku: "SRV-CARTAO", tipo: "servico", preco: 1000, estoque: 99 }, "admin")).id;
  assert.equal((await produto(ids.taxa)).estoque, 0, "serviço não tem estoque");

  // Entrada com custo novo faz média ponderada: (50×4,50 + 50×5,50) / 100 = 5,00
  await ok("POST", "/api/estoque/movimentos", { produto_id: ids.rosa, tipo: "entrada", quantidade: 50, custo_unit: 550, motivo: "Compra Ceasa" }, "admin");
  let rosa = await produto(ids.rosa);
  assert.equal(rosa.estoque, 100);
  assert.equal(rosa.custo, 500);
  assert.equal((await api("POST", "/api/estoque/movimentos", { produto_id: ids.rosa, tipo: "perda", quantidade: 4 }, "admin")).status, 400, "perda exige motivo");
  await ok("POST", "/api/estoque/movimentos", { produto_id: ids.rosa, tipo: "perda", quantidade: 4, motivo: "Murcharam" }, "admin");
  assert.equal((await api("POST", "/api/estoque/movimentos", { produto_id: ids.rosa, tipo: "saida", quantidade: 1000 }, "admin")).status, 400, "não sai mais do que há");
  await ok("POST", "/api/estoque/movimentos", { produto_id: ids.rosa, tipo: "ajuste", quantidade: 90, motivo: "Contagem" }, "admin");
  rosa = await produto(ids.rosa);
  assert.equal(rosa.estoque, 90);
  assert.deepEqual(rosa.movimentos.slice(0, 3).map((m) => [m.tipo, m.quantidade, m.saldo]), [["ajuste", -6, 90], ["perda", -4, 96], ["entrada", 50, 100]]);
});

test("venda com ficha técnica baixa os materiais; cancelamento devolve", async () => {
  const semCpf = await api("POST", "/api/vendas", { cliente_nome: "Maria", cliente_telefone: "11999990000", itens: [{ produto_id: ids.buque, quantidade: 1 }] }, "ana");
  assert.equal(semCpf.status, 400, "CPF obrigatório por padrão");
  const cpfErrado = await api("POST", "/api/vendas", { cliente_nome: "Maria", cliente_telefone: "11999990000", cliente_cpf: "123.456.789-00", itens: [{ produto_id: ids.buque, quantidade: 1 }] }, "ana");
  assert.match(cpfErrado.dados.erro, /CPF inválido/);
  assert.equal((await api("POST", "/api/vendas", { cliente_nome: "Maria", cliente_telefone: "1", cliente_cpf: "52998224725", recebimento: "entrega", itens: [{ produto_id: ids.buque, quantidade: 1 }] }, "ana")).status, 400, "entrega exige endereço");

  const venda = await ok("POST", "/api/vendas", {
    cliente_nome: "Maria Souza", cliente_telefone: "(11) 99999-0000", cliente_cpf: "529.982.247-25", canal: "whatsapp", pagamento: "pix",
    recebimento: "entrega", endereco_entrega: "Rua das Flores, 10", combinado_para: `${diaLocal()}T15:00`, taxa_entrega: 1500, desconto: 990,
    itens: [{ produto_id: ids.buque, quantidade: 2 }, { produto_id: ids.taxa, quantidade: 1 }],
  }, "ana");
  assert.equal(venda.total, 2 * 18990 + 1000 - 990 + 1500);
  assert.equal((await produto(ids.rosa)).estoque, 90 - 24);
  assert.equal((await produto(ids.papel)).estoque, 10 - 4);
  assert.equal((await produto(ids.fita)).estoque, 4);

  // Mesmo CPF = mesmo cliente (nome/telefone atualizados).
  const venda2 = await ok("POST", "/api/vendas", { cliente_nome: "Maria S. Lima", cliente_telefone: "11988887777", cliente_cpf: "52998224725", itens: [{ produto_id: ids.coroa, quantidade: 1 }] }, "ana");
  assert.equal(venda2.cliente_id, venda.cliente_id);
  ids.cliente = venda.cliente_id;
  const cliente = await ok("GET", `/api/clientes/${ids.cliente}`, null, "admin");
  assert.equal(cliente.nome, "Maria S. Lima");
  assert.equal(cliente.vendas.length, 2);

  // Falta material: nada é gravado.
  const antes = (await ok("GET", "/api/vendas", null, "admin")).length;
  const falta = await api("POST", "/api/vendas", { cliente_cpf: "52998224725", cliente_nome: "Maria", cliente_telefone: "1", itens: [{ produto_id: ids.buque, quantidade: 4 }] }, "ana");
  assert.equal(falta.status, 409);
  assert.match(falta.dados.erro, /Papel coreano/);
  assert.equal((await ok("GET", "/api/vendas", null, "admin")).length, antes);
  assert.equal((await produto(ids.rosa)).estoque, 66, "nenhuma rosa saiu");

  assert.equal((await api("POST", "/api/vendas", { cliente_cpf: "52998224725", cliente_nome: "M", cliente_telefone: "1", desconto: 999999, itens: [{ produto_id: ids.coroa, quantidade: 1 }] }, "ana")).status, 400, "desconto maior que a venda");

  assert.equal((await api("POST", `/api/vendas/${venda.id}/cancelar`, { motivo: "Desistiu" }, "ana")).status, 403, "atendimento não cancela");
  assert.equal((await api("POST", `/api/vendas/${venda.id}/cancelar`, {}, "admin")).status, 400, "cancelar exige motivo");
  await ok("POST", `/api/vendas/${venda.id}/cancelar`, { motivo: "Cliente desistiu" }, "admin");
  assert.equal((await produto(ids.rosa)).estoque, 90);
  assert.equal((await produto(ids.papel)).estoque, 10);
  assert.equal((await produto(ids.fita)).estoque, 5);
  assert.equal((await api("POST", `/api/vendas/${venda.id}/cancelar`, { motivo: "de novo" }, "admin")).status, 400, "não cancela duas vezes");

  // Sem exigir CPF: venda de balcão para consumidor.
  await ok("PUT", "/api/sistema", { exigir_cpf: false }, "admin");
  const balcao = await ok("POST", "/api/vendas", { pagamento: "dinheiro", itens: [{ produto_id: ids.buque, quantidade: 1 }] }, "ana");
  assert.equal(balcao.cliente_id, null);
  await ok("PUT", "/api/sistema", { exigir_cpf: true }, "admin");
});

test("clientes: um cadastro por CPF", async () => {
  assert.equal((await api("POST", "/api/clientes", { nome: "Outra Maria", telefone: "1", cpf: "52998224725" }, "ana")).status, 409);
  const id = (await ok("POST", "/api/clientes", { nome: "Ana Beatriz", telefone: "11 98877-6655", cpf: "111.444.777-35", aniversario: diaLocal(), observacoes: "Prefere tons rosé" }, "ana")).id;
  assert.equal((await api("POST", "/api/clientes", { nome: "X", cpf: "11144477735", aniversario: "2020-02-31" }, "ana")).status, 400);
  const busca = await ok("GET", "/api/clientes?busca=111.444", null, "ana");
  assert.equal(busca.length, 1);
  assert.equal(busca[0].id, id);
  ids.ana_beatriz = id;
});

test("encomendas", async () => {
  const quando = `${diaLocal()}T18:30`;
  const id = (await ok("POST", "/api/encomendas", { cliente_id: ids.ana_beatriz, ocasiao: "Aniversário", entrega_em: quando, valor: 18990, mensagem_cartao: "Felicidades!" }, "ana")).id;
  assert.equal((await api("POST", "/api/encomendas", { cliente_id: ids.ana_beatriz, entrega_em: "amanhã" }, "ana")).status, 400);
  await ok("PUT", `/api/encomendas/${id}`, { status: "producao" }, "ana");
  assert.equal((await api("PUT", `/api/encomendas/${id}`, { status: "voando" }, "ana")).status, 400);
  const lista = await ok("GET", "/api/encomendas", null, "ana");
  assert.equal(lista.find((e) => e.id === id).status, "producao");
});

test("frota e fechamento de entregas", async () => {
  assert.equal((await api("POST", "/api/frota/veiculos", { nome: "Moto", placa: "123" }, "admin")).status, 400);
  const id = (await ok("POST", "/api/frota/veiculos", { nome: "Moto de entrega", placa: "abc1d23", modelo: "CG 160", ano: 2022, km: 10000 }, "admin")).id;
  const hoje = diaLocal();
  await ok("POST", "/api/frota/abastecimentos", { veiculo_id: id, data: hoje, litros: 10, valor: 6000, km: 10100, motorista: "Beto" }, "admin");
  await ok("POST", "/api/frota/abastecimentos", { veiculo_id: id, data: hoje, litros: 5, valor: 3000, km: 10300, motorista: "Beto" }, "admin");
  assert.equal((await api("POST", "/api/frota/abastecimentos", { veiculo_id: id, data: hoje, litros: 5, valor: 3000, km: 9000 }, "admin")).status, 400, "km não volta");
  await ok("POST", "/api/frota/manutencoes", { veiculo_id: id, data: hoje, descricao: "Troca de óleo", valor: 8000, km: 10350 }, "admin");
  const moto = (await ok("GET", "/api/frota/veiculos", null, "admin")).find((v) => v.id === id);
  assert.equal(moto.placa, "ABC1D23");
  assert.equal(moto.km, 10350);
  assert.equal(moto.consumo_medio, 40, "200 km com 5 L");

  const r = await ok("POST", "/api/frota/entregas", { data: hoje, entregador: "Beto", quantidade: 8, valor_unit: 700 }, "admin");
  assert.equal(r.total, 5600);
  assert.equal((await api("POST", "/api/frota/entregas", { data: hoje, entregador: "Beto", quantidade: 0, valor_unit: 700 }, "admin")).status, 400);
});

test("painel e relatório", async () => {
  const painel = await ok("GET", "/api/painel", null, "ana");
  assert.equal(painel.hoje.quantidade, 2, "duas vendas válidas hoje (uma cancelada)");
  assert.equal(painel.hoje.total, 45000 + 18990);
  assert.equal(painel.buques.hoje, 1);
  assert.equal(painel.coroas.melhor.quantidade, 1);
  assert.equal(painel.entregas_hoje.total, 5600);
  assert.equal(painel.entregas_hoje.valor_medio, 700);
  assert.equal(painel.frota_mes.combustivel, 9000);
  assert.ok(painel.agenda.some((a) => a.origem === "encomenda"));
  assert.ok(painel.aniversariantes.some((c) => c.nome === "Ana Beatriz"));
  assert.ok(painel.serie.length >= 1);
  assert.equal((await ok("GET", "/api/painel?periodo=ano", null, "ana")).serie.length, 12);

  const rel = await ok("GET", "/api/relatorios/vendas", null, "admin");
  assert.equal(rel.totais.quantidade, 2);
  assert.equal(rel.canceladas.quantidade, 1);
  assert.equal(rel.totais.custo, 20000 + (12 * 500 + 2 * 300 + 75));
  assert.equal(rel.produtos[0].nome, "Coroa de flores média");
  assert.equal((await api("GET", "/api/relatorios/vendas?de=2026-05-10&ate=2026-01-01", null, "admin")).status, 400);
});

test("cópia de segurança e registro de ações", async () => {
  const { arquivo } = await ok("POST", "/api/copias", null, "admin");
  const { copias } = await ok("GET", "/api/copias", null, "admin");
  assert.ok(copias.some((c) => c.nome === arquivo));
  assert.ok(fs.existsSync(path.join(app.pastaCopias, arquivo)));
  assert.equal((await api("GET", "/api/copias", null, "ana")).status, 403);
  const acoes = await ok("GET", "/api/auditoria", null, "admin");
  assert.ok(acoes.some((a) => a.acao === "Cancelamento de venda"));
});

test("encomenda com produtos e sinal vira venda e baixa o estoque", async () => {
  const quando = `${diaLocal()}T20:00`;
  const r = await ok("POST", "/api/encomendas", {
    cliente_id: ids.ana_beatriz, ocasiao: "Corporativo", entrega_em: quando, endereco: "Av. Central, 900", taxa_entrega: 2000,
    sinal: 10000, sinal_forma: "pix", itens: [{ produto_id: ids.buque, quantidade: 2 }],
  }, "ana");
  assert.equal(r.valor, 2 * 18990 + 2000, "valor calculado pelos produtos");
  assert.equal((await api("POST", "/api/encomendas", { cliente_id: ids.ana_beatriz, entrega_em: quando, sinal: 999999, valor: 1000 }, "ana")).status, 400, "sinal maior que o valor");
  const lista = await ok("GET", "/api/encomendas", null, "ana");
  const e = lista.find((x) => x.id === r.id);
  assert.equal(e.saldo, r.valor - 10000);
  assert.equal(e.itens.length, 1);

  // Produção: materiais para montar os 2 buquês.
  const producao = await ok("GET", "/api/producao", null, "ana");
  const rosas = producao.materiais.find((x) => x.id === ids.rosa);
  assert.equal(rosas.precisa, 24);
  assert.ok(producao.roteiro.some((x) => x.origem === "encomenda" && x.id === r.id));

  const estoqueAntes = (await produto(ids.rosa)).estoque;
  const venda = await ok("POST", `/api/encomendas/${r.id}/venda`, { pagamento: "credito" }, "ana");
  assert.equal(venda.total, r.valor);
  assert.equal((await produto(ids.rosa)).estoque, estoqueAntes - 24);
  assert.equal((await api("POST", `/api/encomendas/${r.id}/venda`, {}, "ana")).status, 400, "não vira venda duas vezes");
  assert.equal((await api("PUT", `/api/encomendas/${r.id}`, { itens: [] }, "ana")).status, 400, "produtos travados depois da venda");
  await ok("PUT", `/api/encomendas/${r.id}`, { status: "entregue" }, "ana");
  const detalhe = await ok("GET", `/api/vendas/${venda.id}`, null, "admin");
  assert.equal(detalhe.cliente_nome, "Ana Beatriz");
  assert.match(detalhe.observacao, /Encomenda nº/);
});

test("financeiro: despesas, contas a pagar e lucro do mês", async () => {
  const hoje = diaLocal();
  const mes = hoje.slice(0, 7);
  assert.equal((await api("GET", "/api/financeiro", null, "ana")).status, 403, "atendimento não vê o financeiro");
  const { ids: aluguel } = await ok("POST", "/api/despesas", { descricao: "Aluguel", categoria: "Aluguel", valor: 250000, vencimento: `${mes}-05`, pago_em: `${mes}-05`, repetir: 2 }, "admin");
  assert.equal(aluguel.length, 3, "aluguel lançado para 3 meses");
  await ok("POST", "/api/despesas", { descricao: "Energia", categoria: "Energia e água", valor: 40000, vencimento: hoje }, "admin");
  const f = await ok("GET", `/api/financeiro?mes=${mes}`, null, "admin");
  assert.equal(f.total_despesas, 250000, "só as pagas entram no resultado");
  assert.ok(f.a_pagar.some((d) => d.descricao === "Energia" && d.vence_hoje));
  assert.equal(f.lucro, f.vendas.receita - f.vendas.custo - f.total_despesas - f.total_frota);
  assert.equal(f.historico.length, 6);
  const energia = f.a_pagar.find((d) => d.descricao === "Energia");
  await ok("PUT", `/api/despesas/${energia.id}`, { pago_em: hoje, forma: "pix" }, "admin");
  assert.equal((await ok("GET", `/api/financeiro?mes=${mes}`, null, "admin")).total_despesas, 290000);
  const painel = await ok("GET", "/api/painel", null, "admin");
  assert.ok(painel.contas, "administração vê as contas no painel");
  assert.equal((await ok("GET", "/api/painel", null, "ana")).contas, null);
});

test("datas comemorativas e entrada de demonstração", async () => {
  const { proximasDatas } = require("../servidor/datas");
  assert.deepEqual(proximasDatas("2026-10-14", 30).map((d) => [d.nome, d.faltam]), [["Dia dos Professores", 1], ["Finados", 19]]);
  assert.equal(proximasDatas("2027-04-20", 30)[0].dia, "2027-05-09", "Dia das Mães = 2º domingo de maio");
  assert.equal((await api("POST", "/api/demonstracao/entrar")).status, 403, "banco real não tem entrada sem senha");
  assert.equal((await ok("GET", "/api/estado")).demonstracao, false);
});

test("fotos dos produtos", async () => {
  // Menor JPEG válido possível (1×1 pixel).
  const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z";
  assert.equal((await api("PUT", `/api/produtos/${ids.buque}/foto`, { imagem: jpeg }, "ana")).status, 403, "atendimento não troca foto");
  assert.equal((await api("PUT", `/api/produtos/${ids.buque}/foto`, { imagem: "data:image/jpeg;base64,PHN2Zz4=" }, "admin")).status, 400, "conteúdo que não é JPEG");
  assert.equal((await api("PUT", `/api/produtos/${ids.buque}/foto`, { imagem: "data:image/svg+xml;base64,PHN2Zz4=" }, "admin")).status, 400, "SVG não é aceito no envio");
  await ok("PUT", `/api/produtos/${ids.buque}/foto`, { imagem: jpeg }, "admin");
  const produtos = await ok("GET", "/api/produtos", null, "ana");
  assert.ok(produtos.find((p) => p.id === ids.buque).foto, "lista informa a versão da foto");
  const resposta = await fetch(`${base}/api/produtos/${ids.buque}/foto`);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("content-type"), "image/jpeg");
  assert.match(resposta.headers.get("content-security-policy"), /sandbox/);
  await ok("DELETE", `/api/produtos/${ids.buque}/foto`, null, "admin");
  assert.equal((await fetch(`${base}/api/produtos/${ids.buque}/foto`)).status, 404);
});
