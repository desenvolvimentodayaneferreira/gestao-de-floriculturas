// Frota: veículos, abastecimentos, manutenções e fechamento diário das entregas.
const { exigir, texto, centavos, quantidade, dataValida, registrar, umDe } = require("./comum");

function criarFrota(banco) {
  const veiculo = (id) => {
    const v = banco.um("select * from veiculos where id = ?", Number(id));
    exigir(v, "Escolha o veículo.", 404);
    return v;
  };
  const data = (valor) => {
    exigir(dataValida(valor), "Data inválida.");
    return valor;
  };

  function rotas(rota) {
    rota("GET", "/api/frota/veiculos", { perm: "frota.ver" }, () =>
      banco.todos(`select v.*,
          (select coalesce(sum(valor), 0) from abastecimentos a where a.veiculo_id = v.id) as gasto_combustivel,
          (select coalesce(sum(valor), 0) from manutencoes m where m.veiculo_id = v.id and m.status = 'realizada') as gasto_manutencao,
          (select coalesce(sum(litros), 0) from abastecimentos a where a.veiculo_id = v.id) as litros,
          (select min(km) from abastecimentos a where a.veiculo_id = v.id) as km_primeiro,
          (select max(km) from abastecimentos a where a.veiculo_id = v.id) as km_ultimo,
          (select litros from abastecimentos a where a.veiculo_id = v.id order by km asc, id asc limit 1) as litros_primeiro
        from veiculos v order by v.ativo desc, v.nome`).map((v) => {
        // Consumo médio: km rodados entre o primeiro e o último abastecimento ÷ litros colocados depois do primeiro.
        const rodados = (v.km_ultimo ?? 0) - (v.km_primeiro ?? 0);
        const litros = v.litros - (v.litros_primeiro ?? 0);
        return { ...v, consumo_medio: rodados > 0 && litros > 0 ? Math.round((rodados / litros) * 10) / 10 : null };
      }));

    rota("POST", "/api/frota/veiculos", { perm: "frota.registrar" }, ({ corpo, sessao }) => {
      const nome = texto(corpo.nome, 80);
      exigir(nome, "Informe a descrição do veículo (ex.: Moto de entrega).");
      const placa = texto(corpo.placa, 10).toUpperCase().replace(/\s/g, "");
      exigir(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(placa), "Placa inválida (ex.: ABC1D23 ou ABC-1234).");
      exigir(!banco.um("select 1 from veiculos where placa = ?", placa), "Já existe um veículo com essa placa.", 409);
      const ano = corpo.ano ? Number(corpo.ano) : null;
      exigir(!ano || (Number.isInteger(ano) && ano >= 1950 && ano <= new Date().getFullYear() + 1), "Ano inválido.");
      const r = banco.exec("insert into veiculos (nome, placa, modelo, ano, km) values (?, ?, ?, ?, ?)",
        nome, placa, texto(corpo.modelo, 80), ano, quantidade(corpo.km ?? 0, "Quilometragem", { positiva: false }));
      registrar(banco, sessao, "Cadastro de veículo", `${nome} ${placa}`);
      return { id: Number(r.lastInsertRowid) };
    });

    rota("PUT", "/api/frota/veiculos/:id", { perm: "frota.registrar" }, ({ params, corpo, sessao }) => {
      const v = veiculo(params.id);
      const ativo = corpo.ativo === undefined ? v.ativo : corpo.ativo ? 1 : 0;
      banco.exec("update veiculos set nome = ?, modelo = ?, ativo = ? where id = ?", texto(corpo.nome, 80) || v.nome, corpo.modelo === undefined ? v.modelo : texto(corpo.modelo, 80), ativo, v.id);
      registrar(banco, sessao, "Alteração de veículo", `${v.placa}${ativo !== v.ativo ? (ativo ? " (reativado)" : " (desativado)") : ""}`);
    });

    rota("GET", "/api/frota/abastecimentos", { perm: "frota.ver" }, () =>
      banco.todos("select a.*, v.nome as veiculo, v.placa from abastecimentos a join veiculos v on v.id = a.veiculo_id order by a.data desc, a.id desc limit 300"));

    rota("POST", "/api/frota/abastecimentos", { perm: "frota.registrar" }, ({ corpo, sessao }) => {
      const v = veiculo(corpo.veiculo_id);
      const km = quantidade(corpo.km, "Quilometragem");
      const ultimo = banco.um("select max(km) as km from abastecimentos where veiculo_id = ?", v.id).km;
      exigir(ultimo === null || km >= ultimo, `A quilometragem não pode ser menor que a do último abastecimento (${ultimo} km).`);
      banco.transacao(() => {
        banco.exec("insert into abastecimentos (veiculo_id, data, litros, valor, km, motorista, tipo, observacao, criado_em) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          v.id, data(corpo.data), quantidade(corpo.litros, "Litros"), centavos(corpo.valor, "Valor"), km, texto(corpo.motorista, 80),
          umDe(corpo.tipo || "entrega", ["entrega", "particular", "interno"], "Tipo de uso inválido."), texto(corpo.observacao, 200), Date.now());
        banco.exec("update veiculos set km = max(km, ?) where id = ?", km, v.id);
      });
      registrar(banco, sessao, "Abastecimento", `${v.placa} · ${corpo.litros} L`);
    });

    rota("GET", "/api/frota/manutencoes", { perm: "frota.ver" }, () =>
      banco.todos("select m.*, v.nome as veiculo, v.placa from manutencoes m join veiculos v on v.id = m.veiculo_id order by m.data desc, m.id desc limit 300"));

    rota("POST", "/api/frota/manutencoes", { perm: "frota.registrar" }, ({ corpo, sessao }) => {
      const v = veiculo(corpo.veiculo_id);
      const descricao = texto(corpo.descricao, 200);
      exigir(descricao, "Descreva a manutenção.");
      const km = quantidade(corpo.km ?? 0, "Quilometragem", { positiva: false });
      const status = umDe(corpo.status || "realizada", ["realizada", "agendada"], "Situação inválida.");
      banco.transacao(() => {
        banco.exec("insert into manutencoes (veiculo_id, data, descricao, valor, km, status, criado_em) values (?, ?, ?, ?, ?, ?, ?)",
          v.id, data(corpo.data), descricao, centavos(corpo.valor, "Valor"), km, status, Date.now());
        if (status === "realizada") banco.exec("update veiculos set km = max(km, ?) where id = ?", km, v.id);
      });
      registrar(banco, sessao, "Manutenção", `${v.placa} · ${descricao}`);
    });

    rota("PUT", "/api/frota/manutencoes/:id", { perm: "frota.registrar" }, ({ params, corpo, sessao }) => {
      const m = banco.um("select * from manutencoes where id = ?", Number(params.id));
      exigir(m, "Manutenção não encontrada.", 404);
      const status = umDe(corpo.status, ["realizada", "agendada"], "Situação inválida.");
      banco.exec("update manutencoes set status = ?, valor = ?, data = ? where id = ?", status,
        corpo.valor === undefined ? m.valor : centavos(corpo.valor, "Valor"), corpo.data ? data(corpo.data) : m.data, m.id);
      if (status === "realizada") banco.exec("update veiculos set km = max(km, ?) where id = ?", m.km, m.veiculo_id);
      registrar(banco, sessao, "Manutenção atualizada", `nº ${m.id} · ${status}`);
    });

    // Fechamento do expediente: quantidade de entregas × valor por entrega.
    rota("GET", "/api/frota/entregas", { perm: "frota.ver" }, () =>
      banco.todos("select * from fechamentos_entrega order by data desc, id desc limit 300"));

    rota("POST", "/api/frota/entregas", { perm: "frota.registrar" }, ({ corpo, sessao }) => {
      const entregador = texto(corpo.entregador, 80);
      exigir(entregador, "Informe o nome do entregador.");
      const qtd = Number(corpo.quantidade);
      exigir(Number.isInteger(qtd) && qtd > 0 && qtd <= 1000, "A quantidade de entregas deve ser um número inteiro maior que zero.");
      const valorUnit = centavos(corpo.valor_unit, "Valor por entrega");
      const r = banco.exec("insert into fechamentos_entrega (data, entregador, quantidade, valor_unit, total, observacao, criado_em) values (?, ?, ?, ?, ?, ?, ?)",
        data(corpo.data), entregador, qtd, valorUnit, qtd * valorUnit, texto(corpo.observacao, 200), Date.now());
      registrar(banco, sessao, "Fechamento de entregas", `${entregador} · ${qtd} entregas · R$ ${((qtd * valorUnit) / 100).toFixed(2)}`);
      return { id: Number(r.lastInsertRowid), total: qtd * valorUnit };
    });

    rota("DELETE", "/api/frota/entregas/:id", { perm: "frota.registrar" }, ({ params, sessao }) => {
      const f = banco.um("select * from fechamentos_entrega where id = ?", Number(params.id));
      exigir(f, "Fechamento não encontrado.", 404);
      banco.exec("delete from fechamentos_entrega where id = ?", f.id);
      registrar(banco, sessao, "Fechamento de entregas excluído", `${f.data} · ${f.entregador} · ${f.quantidade} entregas`);
    });
  }

  return { rotas };
}

module.exports = { criarFrota };
