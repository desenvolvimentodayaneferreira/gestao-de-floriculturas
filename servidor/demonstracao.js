// Floricultura de demonstração: 6 meses de vendas, encomendas, despesas e frota, com datas relativas a hoje.
// Usada pelo modo demonstração do programa (dados separados dos reais) e por `npm run exemplo`.
const crypto = require("node:crypto");
const { diaLocal, somarDias } = require("./comum");
const { ilustracao } = require("./ilustracoes");

const doisDigitos = (n) => String(n).padStart(2, "0");

async function preencherDemonstracao({ base, banco, usuario = "demonstracao", senha = `Demo${crypto.randomBytes(9).toString("hex")}`, progresso = () => {} }) {
  let token = null;
  const api = async (metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    const dados = await r.json();
    if (!r.ok) throw new Error(`${metodo} ${caminho}: ${dados.erro}`);
    return dados;
  };
  // Sorteio repetível: a demonstração sai igual toda vez.
  let semente = 11;
  const sorteio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const um = (lista) => lista[Math.floor(sorteio() * lista.length)];

  await api("POST", "/api/configurar", { loja: "Floricultura Exemplo", nome: "Equipe Demonstração", usuario, senha });
  token = (await api("POST", "/api/login", { usuario, senha })).token;
  const perfis = await api("GET", "/api/perfis");
  await api("POST", "/api/usuarios", { nome: "Ana Paula Rocha", usuario: "ana", setor: "Atendimento", senha: `Ana${crypto.randomBytes(6).toString("hex")}1`, perfil_id: perfis.find((p) => p.nome === "Atendimento").id });
  await api("POST", "/api/usuarios", { nome: "Roberto Alves", usuario: "roberto", setor: "Entregas", senha: `Rob${crypto.randomBytes(6).toString("hex")}1`, perfil_id: perfis.find((p) => p.nome === "Colaborador").id });

  // ---------- Catálogo ----------
  const cats = Object.fromEntries((await api("GET", "/api/categorias")).map((c) => [c.nome, c.id]));
  const material = async (nome, sku, unidade, custo, estoque, minimo, categoria) =>
    (await api("POST", "/api/produtos", { nome, sku, tipo: "material", unidade, custo, estoque, estoque_minimo: minimo, categoria_id: cats[categoria] })).id;
  const m = {
    rosaVermelha: await material("Rosa vermelha colombiana", "MAT-ROSA-V", "haste", 450, 400, 60, "Flores e folhagens"),
    rosaRose: await material("Rosa rosé premium", "MAT-ROSA-R", "haste", 520, 260, 40, "Flores e folhagens"),
    rosaBranca: await material("Rosa branca", "MAT-ROSA-B", "haste", 480, 200, 40, "Flores e folhagens"),
    girassol: await material("Girassol", "MAT-GIRA", "haste", 600, 120, 20, "Flores e folhagens"),
    lirio: await material("Lírio branco", "MAT-LIRIO", "haste", 900, 90, 15, "Flores e folhagens"),
    crisantemo: await material("Crisântemo", "MAT-CRIS", "maço", 1800, 60, 10, "Flores e folhagens"),
    ruscus: await material("Folhagem ruscus", "MAT-FOLHA", "maço", 220, 300, 40, "Flores e folhagens"),
    gipsofila: await material("Gipsófila (mosquitinho)", "MAT-GIPSO", "maço", 1200, 40, 8, "Flores e folhagens"),
    papel: await material("Papel coreano rosé", "MAT-PAPEL", "folha", 480, 300, 40, "Embalagens"),
    fita: await material("Fita de cetim", "MAT-FITA", "m", 150, 500, 50, "Materiais"),
    espuma: await material("Espuma floral", "MAT-ESPUMA", "un", 650, 70, 10, "Materiais"),
    base: await material("Base para coroa (aro 80 cm)", "MAT-ARO", "un", 3500, 40, 5, "Materiais"),
    vaso: await material("Vaso de vidro cilíndrico", "MAT-VASO", "un", 1900, 30, 5, "Embalagens"),
    cachepo: await material("Cachepô de cerâmica pequeno", "MAT-CACHE", "un", 850, 40, 10, "Embalagens"),
  };
  const produto = async (dados, ficha = {}) => {
    const { id } = await api("POST", "/api/produtos", { tipo: "produto", ...dados, categoria_id: cats[dados.categoria] });
    for (const [componente, quantidade] of Object.entries(ficha)) await api("PUT", `/api/fichas/${id}/${m[componente]}`, { quantidade });
    return id;
  };
  const p = {
    buque12: await produto({ nome: "Buquê 12 rosas vermelhas", sku: "BUQ-12V", preco: 18990, categoria: "Buquês", descricao: "Clássico do romance, com folhagem e papel coreano." }, { rosaVermelha: 12, ruscus: 1, papel: 3, fita: 1.5 }),
    buqueRose: await produto({ nome: "Buquê Primavera rosé", sku: "BUQ-PRIM", preco: 15990, categoria: "Buquês" }, { rosaRose: 8, gipsofila: 0.5, ruscus: 1, papel: 2, fita: 1 }),
    buqueGira: await produto({ nome: "Buquê de girassóis", sku: "BUQ-GIRA", preco: 12990, categoria: "Buquês" }, { girassol: 5, ruscus: 1, papel: 2, fita: 1 }),
    noiva: await produto({ nome: "Buquê de noiva", sku: "BUQ-NOIVA", preco: 45000, categoria: "Buquês" }, { rosaBranca: 24, gipsofila: 1, fita: 2 }),
    coroaM: await produto({ nome: "Coroa de flores média", sku: "COR-M", preco: 39000, categoria: "Coroas" }, { base: 1, crisantemo: 4, lirio: 6, ruscus: 3, fita: 2 }),
    coroaG: await produto({ nome: "Coroa de flores grande", sku: "COR-G", preco: 59000, categoria: "Coroas" }, { base: 1, crisantemo: 7, lirio: 10, rosaBranca: 12, ruscus: 5, fita: 3 }),
    arranjo: await produto({ nome: "Arranjo de lírios no vaso", sku: "ARR-LIR", preco: 22990, categoria: "Arranjos" }, { lirio: 5, ruscus: 1, espuma: 1, vaso: 1 }),
    mesa: await produto({ nome: "Arranjo de mesa (eventos)", sku: "ARR-MESA", preco: 12000, categoria: "Arranjos" }, { rosaBranca: 6, gipsofila: 0.5, espuma: 1, cachepo: 1 }),
    mini: await produto({ nome: "Mini arranjo Dia dos Professores", sku: "ARR-MINI", preco: 4990, categoria: "Arranjos" }, { rosaRose: 2, gipsofila: 0.25, cachepo: 1, fita: 0.5 }),
    solitaria: await produto({ nome: "Rosa solitária embalada", sku: "SOL-01", preco: 1990, categoria: "Solitárias" }, { rosaVermelha: 1, papel: 1, fita: 0.5 }),
    orquidea: await produto({ nome: "Orquídea Phalaenopsis", sku: "ORQ-01", preco: 11990, custo: 5500, estoque: 9, estoque_minimo: 4, categoria: "Arranjos" }),
    cartao: await produto({ nome: "Cartão personalizado", sku: "SRV-CARTAO", tipo: "servico", preco: 800, categoria: "Outros" }),
  };

  // Imagens do catálogo (ilustrações; na loja real, entram as fotos).
  for (const { id, sku } of banco.todos("select id, sku from produtos")) {
    const svg = ilustracao(sku);
    if (svg) banco.exec("insert into produto_fotos (produto_id, tipo, imagem, atualizado_em) values (?, 'image/svg+xml', ?, ?)", id, Buffer.from(svg), Date.now());
  }

  // ---------- Clientes ----------
  const hoje = diaLocal();
  const clientes = [
    ["Mariana Souza", "52998224725", "11999887766", "1992-10-18", "Rua das Acácias, 120 - Jardim Primavera", "Prefere tons rosé e arranjos delicados."],
    ["Ana Beatriz Lima", "11144477735", "11988776655", "1988-05-12", "Av. Central, 900 - sala 12", "Cliente corporativa: presentes para a equipe."],
    ["Carlos Henrique Prado", "39053344705", "11977665544", `1985-${hoje.slice(5)}`, "Rua dos Pinheiros, 77", "Compra para a esposa todo mês. Ela adora girassóis."],
    ["Juliana Martins", "15350946056", "11966554433", "1995-12-02", "Rua dos Ipês, 45", "Noiva: casamento no Espaço Jardim Real."],
    ["Funerária Paz Eterna", "71428793860", "1133224455", null, "Rua do Cemitério, 10", "Coroas: entregar até 1h antes do velório. Pagamento por Pix."],
    ["Colégio Pequeno Príncipe", "86288366757", "1134567890", null, "Rua da Escola, 300 - Centro", "Pedido anual para o Dia dos Professores."],
    ["Fernanda Ribeiro", "93541134780", "11955443322", diaLocal(new Date(Date.now() + 9 * 864e5)).replace(/^\d{4}/, "1990"), "Av. das Palmeiras, 1500 - ap. 42", "Alergia a lírio."],
    ["Patrícia Gomes", "28625587887", "11944332211", "1979-03-08", "", ""],
  ];
  const ids = [];
  for (const [nome, cpf, telefone, aniversario, endereco, observacoes] of clientes) {
    ids.push((await api("POST", "/api/clientes", { nome, cpf, telefone, aniversario, endereco, observacoes })).id);
  }

  // ---------- Vendas dos últimos 6 meses (datas ajustadas direto no banco) ----------
  const agora = new Date();
  const repor = async () => {
    for (const id of Object.values(m)) {
      if (banco.um("select estoque from produtos where id = ?", id).estoque < 40) await api("POST", "/api/estoque/movimentos", { produto_id: id, tipo: "entrada", quantidade: 120, motivo: "Compra Ceasa" });
    }
    if (banco.um("select estoque from produtos where id = ?", p.orquidea).estoque < 3) await api("POST", "/api/estoque/movimentos", { produto_id: p.orquidea, tipo: "entrada", quantidade: 8, motivo: "Fornecedor de orquídeas" });
  };
  for (let d = 180; d >= 0; d--) {
    if (d % 6 === 0) progresso(Math.round(5 + ((180 - d) / 180) * 75));
    const dia = somarDias(hoje, -d);
    const semana = (new Date(`${dia}T12:00`).getDay() + 6) % 7; // 0 = segunda
    const mes = Number(dia.slice(5, 7));
    const datasFortes = (mes === 5 && Number(dia.slice(8)) >= 5 && Number(dia.slice(8)) <= 12) || (mes === 6 && Number(dia.slice(8)) >= 8 && Number(dia.slice(8)) <= 12);
    let n = 3 + Math.floor(sorteio() * (semana >= 4 ? 7 : 5)) + (datasFortes ? 8 : 0);
    if (d === 0) n = Math.min(n, 3 + Math.floor(agora.getHours() / 4));
    for (let i = 0; i < n; i++) {
      const r = sorteio();
      const itens = r < 0.28 ? [{ produto_id: p.buque12, quantidade: 1 }]
        : r < 0.42 ? [{ produto_id: p.buqueRose, quantidade: 1 }, { produto_id: p.cartao, quantidade: 1 }]
          : r < 0.52 ? [{ produto_id: p.buqueGira, quantidade: 1 }]
            : r < 0.6 ? [{ produto_id: semana === 4 || semana === 5 ? p.coroaG : p.coroaM, quantidade: 1 }]
              : r < 0.7 ? [{ produto_id: p.solitaria, quantidade: 1 + Math.floor(sorteio() * 3) }]
                : r < 0.8 ? [{ produto_id: p.arranjo, quantidade: 1 }]
                  : [{ produto_id: p.orquidea, quantidade: 1 }];
      const ehCoroa = [p.coroaG, p.coroaM].includes(itens[0].produto_id);
      await repor();
      const cliente = ehCoroa ? 4 : um([0, 1, 2, 3, 6, 7, 0, 2]);
      const entrega = ehCoroa || sorteio() < 0.35;
      const [nome, cpf, telefone, , endereco] = clientes[cliente];
      // Hoje: vendas só até agora, entregas marcadas para as próximas horas.
      let quando;
      let combinado;
      if (d === 0) {
        quando = new Date(Math.max(new Date(`${dia}T07:30`).getTime(), agora.getTime() - Math.floor(sorteio() * 4 * 3600e3)));
        const marcado = new Date(Math.min(new Date(`${dia}T22:00`).getTime(), agora.getTime() + (1 + Math.floor(sorteio() * 5)) * 3600e3));
        combinado = `${dia}T${doisDigitos(marcado.getHours())}:00`;
      } else {
        const hora = 8 + Math.floor(sorteio() * 10);
        quando = new Date(`${dia}T${doisDigitos(hora)}:${doisDigitos(Math.floor(sorteio() * 60))}:00`);
        combinado = `${dia}T${doisDigitos(Math.min(hora + 2, 19))}:30`;
      }
      const venda = await api("POST", "/api/vendas", {
        cliente_cpf: cpf, cliente_nome: nome, cliente_telefone: telefone, canal: ehCoroa ? "telefone" : um(["loja", "whatsapp", "whatsapp", "telefone"]),
        pagamento: um(["pix", "pix", "pix", "credito", "debito", "dinheiro"]), recebimento: entrega ? "entrega" : "retirada",
        endereco_entrega: entrega ? endereco || "Rua das Flores, 200" : "", taxa_entrega: entrega ? 1500 : 0, combinado_para: combinado,
        desconto: sorteio() < 0.08 ? 1000 : 0, itens,
      });
      banco.exec("update vendas set dia = ?, criado_em = ? where id = ?", dia, quando.getTime(), venda.id);
      banco.exec("update estoque_movimentos set criado_em = ? where venda_id = ?", quando.getTime(), venda.id);
    }
  }
  // Situação de estoque para o painel mostrar avisos.
  await api("POST", "/api/estoque/movimentos", { produto_id: m.gipsofila, tipo: "ajuste", quantidade: 3, motivo: "Contagem semanal" });
  await api("POST", "/api/estoque/movimentos", { produto_id: m.cachepo, tipo: "ajuste", quantidade: 6, motivo: "Contagem semanal" });
  await api("POST", "/api/estoque/movimentos", { produto_id: m.rosaRose, tipo: "perda", quantidade: 6, motivo: "Pétalas queimadas no transporte" });
  const ultima = (await api("GET", "/api/vendas?limite=1"))[0];
  await api("POST", `/api/vendas/${ultima.id}/cancelar`, { motivo: "Cliente pediu outra cor" });

  progresso(82);
  // ---------- Encomendas ----------
  const dataHora = (dias, hora) => `${somarDias(hoje, dias)}T${hora}`;
  const encomendas = [
    { c: 0, ocasiao: "Aniversário", entrega_em: dataHora(0, "16:00"), itens: [[p.buqueRose, 1], [p.cartao, 1]], taxa: 1500, sinal: 0, mensagem: "Feliz aniversário! Com carinho, Pedro.", status: "producao" },
    { c: 1, ocasiao: "Corporativo", entrega_em: dataHora(1, "09:30"), itens: [[p.arranjo, 3]], taxa: 2000, sinal: 35000, mensagem: "Parabéns pela inauguração da nova sede!", status: "aguardando" },
    { c: 5, ocasiao: "Dia dos Professores", entrega_em: dataHora(1, "07:30"), itens: [[p.mini, 18]], taxa: 0, sinal: 40000, mensagem: "Obrigado por ensinar com amor!", status: "aguardando", obs: "Retirada pela coordenação." },
    { c: 2, ocasiao: "Romance", entrega_em: dataHora(2, "19:00"), itens: [[p.buqueGira, 1], [p.cartao, 1]], taxa: 1500, sinal: 0, mensagem: "Te amo hoje e sempre.", status: "aguardando" },
    { c: 3, ocasiao: "Casamento", entrega_em: dataHora(6, "11:00"), itens: [[p.noiva, 1], [p.mesa, 8]], taxa: 5000, sinal: 70000, mensagem: "", status: "aguardando", obs: "Tons brancos. Entregar no Espaço Jardim Real até 11h." },
    { c: 4, ocasiao: "Finados", entrega_em: `${hoje.slice(0, 4)}-11-02T07:00`, itens: [[p.coroaG, 2], [p.coroaM, 3]], taxa: 0, sinal: 0, mensagem: "Saudades eternas.", status: "aguardando", obs: "Pedido antecipado da funerária." },
    { c: 4, ocasiao: "Condolências", entrega_em: dataHora(0, "10:00"), itens: [[p.coroaG, 1]], taxa: 0, sinal: 59000, mensagem: "Nossos sentimentos. Família Prado.", status: "entrega" },
    { c: 6, ocasiao: "Maternidade", entrega_em: dataHora(-1, "15:00"), itens: [[p.buqueRose, 1]], taxa: 1500, sinal: 17490, mensagem: "Bem-vinda, Helena!", status: "entregue" },
    { c: 3, ocasiao: "Formatura", entrega_em: dataHora(0, "18:00"), itens: [[p.buqueGira, 1]], taxa: 0, sinal: 0, mensagem: "Parabéns, doutora!", status: "pronto" },
  ].filter((e) => e.entrega_em >= somarDias(hoje, -2));
  for (const e of encomendas) {
    const cliente = clientes[e.c];
    const { id } = await api("POST", "/api/encomendas", {
      cliente_id: ids[e.c], ocasiao: e.ocasiao, entrega_em: e.entrega_em, taxa_entrega: e.taxa, sinal: e.sinal, sinal_forma: "pix",
      endereco: e.obs?.startsWith("Retirada") ? "" : cliente[4] || (e.ocasiao === "Casamento" ? "Espaço Jardim Real" : ""),
      mensagem_cartao: e.mensagem, observacoes: e.obs || "", itens: e.itens.map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
    });
    if (e.status === "entregue") await api("POST", `/api/encomendas/${id}/venda`, { pagamento: "pix" });
    if (e.status !== "aguardando") await api("PUT", `/api/encomendas/${id}`, { status: e.status });
  }

  progresso(86);
  // ---------- Despesas (6 meses) ----------
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const mes = `${ref.getFullYear()}-${doisDigitos(ref.getMonth() + 1)}`;
    const atual = i === 0;
    const pago = (dia) => (!atual || `${mes}-${dia}` <= hoje ? `${mes}-${dia}` : null);
    const contas = [
      ["Aluguel da loja", "Aluguel", "Imobiliária Central", 280000, "05"],
      ["Energia elétrica", "Energia e água", "Concessionária", 42000 + Math.floor(sorteio() * 9000), "10"],
      ["Água", "Energia e água", "Saneamento", 9800, "12"],
      ["Internet e telefone", "Internet e telefone", "Operadora", 15990, "15"],
      ["Salário — atendente", "Salários e comissões", "Ana Paula Rocha", 190000, "05"],
      ["Simples Nacional", "Impostos e taxas", "Receita Federal", 52000 + Math.floor(sorteio() * 15000), "20"],
      ["Anúncios Instagram", "Marketing", "Meta", 30000, "08"],
      ["Embalagens e fitas", "Embalagens e materiais", "Embalagens Flor & Cia", 38000 + Math.floor(sorteio() * 12000), "18"],
    ];
    for (const [descricao, categoria, fornecedor, valor, dia] of contas) {
      await api("POST", "/api/despesas", { descricao, categoria, fornecedor, valor, vencimento: `${mes}-${dia}`, pago_em: pago(dia), forma: "pix" });
    }
    for (const dia of ["03", "10", "17", "24"]) {
      await api("POST", "/api/despesas", { descricao: "Compra de flores no Ceasa", categoria: "Flores e plantas (fornecedor)", fornecedor: "Ceasa", valor: 120000 + Math.floor(sorteio() * 60000), vencimento: `${mes}-${dia}`, pago_em: pago(dia), forma: "dinheiro" });
    }
  }

  progresso(92);
  // ---------- Frota ----------
  const moto = (await api("POST", "/api/frota/veiculos", { nome: "Moto de entrega", placa: "FLR2A26", modelo: "Honda CG 160", ano: 2023, km: 15200 })).id;
  await api("POST", "/api/frota/veiculos", { nome: "Fiorino", placa: "QWE4B56", modelo: "Fiat Fiorino", ano: 2021, km: 54300 });
  let km = 15200;
  for (let d = 175; d >= 0; d -= 5) {
    km += 170 + Math.floor(sorteio() * 60);
    await api("POST", "/api/frota/abastecimentos", { veiculo_id: moto, data: somarDias(hoje, -d), litros: Math.round((4.6 + sorteio() * 1.2) * 10) / 10, valor: 2900 + Math.floor(sorteio() * 600), km, motorista: "Roberto", tipo: "entrega" });
  }
  await api("POST", "/api/frota/manutencoes", { veiculo_id: moto, data: somarDias(hoje, -20), descricao: "Troca de óleo e filtro", valor: 9500, km: km - 300 });
  await api("POST", "/api/frota/manutencoes", { veiculo_id: moto, data: somarDias(hoje, 10), descricao: "Revisão dos freios", valor: 18000, km, status: "agendada" });
  for (let d = 180; d >= 0; d--) {
    if ((new Date(`${somarDias(hoje, -d)}T12:00`).getDay()) === 0) continue; // domingo fechado
    await api("POST", "/api/frota/entregas", { data: somarDias(hoje, -d), entregador: d % 3 ? "Roberto" : "Lucas", quantidade: 3 + Math.floor(sorteio() * 6), valor_unit: 800 });
  }

  banco.salvarConfig("demonstracao", { criada_em: hoje });
  return { usuario };
}

module.exports = { preencherDemonstracao };
