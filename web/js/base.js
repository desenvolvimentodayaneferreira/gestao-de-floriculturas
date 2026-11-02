"use strict";

// Base da interface: comunicação com o servidor, formatação, janelas, tabelas e gráficos.
const FA = window.FA = { telas: {}, estado: { usuario: null, sistema: null } };

(() => {
  const TOKEN = "floricultura:token";
  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];
  const esc = (texto) => String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- Dinheiro (centavos ↔ texto) ----------
  const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dinheiro = (centavos) => formatador.format((Number(centavos) || 0) / 100);
  function lerNumero(texto) {
    const limpo = String(texto ?? "").trim().replace(/[R$\s]/g, "");
    if (!limpo) return null;
    const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
    const valor = Number(normal);
    return Number.isFinite(valor) ? valor : NaN;
  }
  function lerDinheiro(texto) {
    const valor = lerNumero(texto);
    if (valor === null) return null;
    return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : NaN;
  }
  const paraCampo = (centavos) => ((Number(centavos) || 0) / 100).toFixed(2).replace(".", ",");
  const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const pct = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  // ---------- Datas (sempre no horário do computador) ----------
  const dois = (n) => String(n).padStart(2, "0");
  const hoje = (d = new Date()) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  const agoraCampo = (d = new Date()) => `${hoje(d)}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
  const somarDias = (dia, n) => {
    const [a, m, d] = dia.split("-").map(Number);
    return hoje(new Date(a, m - 1, d + n));
  };
  const data = (dia) => (dia ? dia.slice(0, 10).split("-").reverse().join("/") : "—");
  const dataCurta = (dia) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : "—");
  const dataHora = (valor) => {
    if (!valor) return "—";
    if (typeof valor === "number") return new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `${dataCurta(valor)} ${valor.slice(11, 16)}`;
  };
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  function quandoTexto(valor) {
    if (!valor) return "—";
    const dia = valor.slice(0, 10);
    const h = valor.slice(11, 16);
    if (dia === hoje()) return `Hoje ${h}`;
    if (dia === somarDias(hoje(), 1)) return `Amanhã ${h}`;
    const [a, m, d] = dia.split("-").map(Number);
    return `${SEMANA[new Date(a, m - 1, d).getDay()]} ${dataCurta(dia)} ${h}`;
  }

  // ---------- Documentos ----------
  const soNumeros = (v) => String(v ?? "").replace(/\D/g, "");
  function cpf(v) {
    const n = soNumeros(v).slice(0, 11);
    return n.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  function telefone(v) {
    const n = soNumeros(v).slice(0, 11);
    if (n.length <= 10) return n.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    return n.replace(/^(\d{2})(\d{5})(\d)/, "($1) $2-$3");
  }
  // Link do WhatsApp com a mensagem já escrita (a pessoa só confere e envia).
  const whatsapp = (tel, texto = "") => {
    const n = soNumeros(tel);
    if (n.length < 10) return null;
    return `https://wa.me/55${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
  };
  const primeiroNome = (nome) => String(nome || "").trim().split(/\s+/)[0];
  // Máscaras automáticas nos campos marcados.
  document.addEventListener("input", (evento) => {
    const el = evento.target;
    if (el.dataset?.mascara === "cpf") el.value = cpf(el.value);
    if (el.dataset?.mascara === "telefone") el.value = telefone(el.value);
  });

  // ---------- API ----------
  const token = () => localStorage.getItem(TOKEN);
  function guardarToken(valor) {
    if (valor) localStorage.setItem(TOKEN, valor);
    else localStorage.removeItem(TOKEN);
  }

  async function api(metodo, caminho, corpo) {
    let resposta;
    try {
      resposta = await fetch(caminho, {
        method: metodo,
        headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch {
      throw new Error("O sistema não respondeu. Feche e abra o programa de novo.");
    }
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.status === 401 && token() && !caminho.startsWith("/api/eu/senha")) {
      guardarToken(null);
      FA.app?.sair(dados.erro);
    }
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir.");
    return dados;
  }

  // ---------- Avisos e janelas ----------
  let toastTimer = null;
  function aviso(mensagem, tipo = "ok") {
    const el = $("#toast");
    el.textContent = mensagem;
    el.dataset.tipo = tipo;
    el.classList.add("mostrar");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("mostrar"), tipo === "erro" ? 6000 : 3500);
  }

  function janela(html, { classe = "", aoFechar } = {}) {
    const dialogo = document.createElement("dialog");
    dialogo.className = `janela ${classe}`;
    dialogo.innerHTML = html;
    document.body.appendChild(dialogo);
    dialogo.addEventListener("close", () => {
      aoFechar?.();
      dialogo.remove();
    });
    dialogo.addEventListener("click", (evento) => {
      if (evento.target.closest("[data-fechar]")) dialogo.close();
    });
    dialogo.showModal();
    return dialogo;
  }

  // Formulário em janela: campos simples, valida e chama salvar(dados).
  function formulario({ titulo, campos, valores = {}, botao = "Salvar", salvar, intro = "", largo = false }) {
    const dialogo = janela(`
      <form class="form-janela ${largo ? "larga" : ""}" novalidate>
        <header class="janela-topo"><h2>${esc(titulo)}</h2><button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
        ${intro ? `<p class="intro">${intro}</p>` : ""}
        <div class="campos">${campos.map((c) => campoHtml(c, valores[c.nome])).join("")}</div>
        <p class="erro" role="alert"></p>
        <footer><button type="button" class="btn" data-fechar>Cancelar</button><button type="submit" class="btn primario">${esc(botao)}</button></footer>
      </form>`);
    const form = $("form", dialogo);
    $("input:not([type=checkbox]), select, textarea", form)?.focus();
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const erro = $(".erro", form);
      erro.textContent = "";
      let dados;
      try {
        dados = lerCampos(form, campos);
      } catch (problema) {
        erro.textContent = problema.message;
        return;
      }
      const enviar = $("[type=submit]", form);
      enviar.disabled = true;
      try {
        await salvar(dados);
        dialogo.close();
      } catch (problema) {
        erro.textContent = problema.message;
      } finally {
        enviar.disabled = false;
      }
    });
    return dialogo;
  }

  function lerCampos(form, campos) {
    const dados = {};
    for (const c of campos) {
      if (c.tipo === "titulo") continue;
      const el = form.elements[c.nome];
      if (!el) continue;
      let valor = c.tipo === "checkbox" ? el.checked : el.value.trim();
      if (c.obrigatorio && valor === "") throw new Error(`Preencha: ${c.rotulo}.`);
      if (c.tipo === "dinheiro") {
        valor = lerDinheiro(valor);
        if (Number.isNaN(valor)) throw new Error(`${c.rotulo}: valor inválido.`);
      } else if (c.tipo === "quantidade" || c.tipo === "numero") {
        valor = lerNumero(valor);
        if (Number.isNaN(valor)) throw new Error(`${c.rotulo}: número inválido.`);
      } else if (c.tipo === "cpf" || c.tipo === "telefone") {
        valor = c.tipo === "cpf" ? soNumeros(valor) : valor;
      }
      dados[c.nome] = valor;
    }
    return dados;
  }

  function campoHtml(c, valor) {
    const id = `campo-${c.nome}`;
    const largo = c.largo ? " largo" : "";
    const ajuda = c.ajuda ? `<small>${esc(c.ajuda)}</small>` : "";
    if (c.tipo === "titulo") return `<h4 class="campos-titulo largo">${esc(c.rotulo)}</h4>`;
    if (c.tipo === "checkbox") return `<label class="check${largo}"><input type="checkbox" name="${c.nome}" ${valor ? "checked" : ""}/> <span>${esc(c.rotulo)}${ajuda}</span></label>`;
    if (c.tipo === "select") {
      const opcoes = c.opcoes.map((o) => `<option value="${esc(o.valor)}" ${String(o.valor) === String(valor ?? c.padrao ?? "") ? "selected" : ""}>${esc(o.rotulo)}</option>`).join("");
      return `<label class="${largo}" for="${id}">${esc(c.rotulo)}<select id="${id}" name="${c.nome}">${c.vazio !== false ? `<option value="">${esc(c.vazio || "Selecione")}</option>` : ""}${opcoes}</select>${ajuda}</label>`;
    }
    if (c.tipo === "textarea") return `<label class="${largo}" for="${id}">${esc(c.rotulo)}<textarea id="${id}" name="${c.nome}" rows="3" maxlength="${c.max || 500}" placeholder="${esc(c.placeholder || "")}">${esc(valor ?? "")}</textarea>${ajuda}</label>`;
    const tipos = { dinheiro: "text", quantidade: "text", numero: "text", data: "date", datahora: "datetime-local", senha: "password", cpf: "text", telefone: "tel", email: "email" };
    const tipo = tipos[c.tipo] || "text";
    const modo = { dinheiro: "decimal", quantidade: "decimal", numero: "decimal", cpf: "numeric" }[c.tipo];
    let texto = valor ?? c.padrao ?? "";
    if (c.tipo === "dinheiro" && valor !== undefined && valor !== null) texto = paraCampo(valor);
    if (c.tipo === "quantidade" && valor !== undefined && valor !== null) texto = String(valor).replace(".", ",");
    if (c.tipo === "cpf") texto = cpf(texto);
    const extras = [
      modo ? `inputmode="${modo}"` : "",
      c.tipo === "cpf" ? 'data-mascara="cpf" maxlength="14"' : "",
      c.tipo === "telefone" ? 'data-mascara="telefone" maxlength="16"' : "",
      c.tipo === "senha" ? 'autocomplete="new-password"' : 'autocomplete="off"',
      c.max ? `maxlength="${c.max}"` : "",
      c.lista ? `list="${id}-lista"` : "",
    ].join(" ");
    const lista = c.lista ? `<datalist id="${id}-lista">${c.lista.map((o) => `<option value="${esc(o)}"></option>`).join("")}</datalist>` : "";
    return `<label class="${largo}" for="${id}"><span>${esc(c.rotulo)}${c.obrigatorio ? ' <em class="obrig">*</em>' : ""}</span><input id="${id}" name="${c.nome}" type="${tipo}" value="${esc(texto)}" placeholder="${esc(c.placeholder || "")}" ${extras}/>${lista}${ajuda}</label>`;
  }

  function confirmar(mensagem, { titulo = "Confirmar", botao = "Confirmar", perigo = false, motivo = false } = {}) {
    return new Promise((resolve) => {
      let resposta = false;
      const dialogo = janela(`
        <form class="form-janela pequena" novalidate>
          <header class="janela-topo"><h2>${esc(titulo)}</h2></header>
          <p>${esc(mensagem)}</p>
          ${motivo ? `<label>${esc(motivo)}<input name="motivo" maxlength="200" autocomplete="off"/></label><p class="erro"></p>` : ""}
          <footer><button type="button" class="btn" data-fechar>Voltar</button><button type="submit" class="btn ${perigo ? "perigo" : "primario"}">${esc(botao)}</button></footer>
        </form>`, { aoFechar: () => resolve(resposta) });
      const form = $("form", dialogo);
      if (motivo) form.elements.motivo.focus();
      form.addEventListener("submit", (evento) => {
        evento.preventDefault();
        if (motivo) {
          const texto = form.elements.motivo.value.trim();
          if (!texto) return ($(".erro", form).textContent = "Informe o motivo.");
          resposta = texto;
        } else resposta = true;
        dialogo.close();
      });
    });
  }

  // ---------- Tabelas ----------
  // colunas: [{ titulo, valor: (linha) => html, classe }]
  function tabela(colunas, linhas, { vazio = "Nenhum registro.", clicavel = false } = {}) {
    if (!linhas.length) return `<div class="vazio-linha">${esc(vazio)}</div>`;
    return `<div class="tabela-rolagem"><table class="tabela${clicavel ? " clicavel" : ""}">
      <thead><tr>${colunas.map((c) => `<th class="${c.classe || ""}">${esc(c.titulo)}</th>`).join("")}</tr></thead>
      <tbody>${linhas.map((l, i) => `<tr data-indice="${i}">${colunas.map((c) => `<td class="${c.classe || ""}">${c.valor(l)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  // ---------- Gráficos (SVG simples, sem bibliotecas) ----------
  function escalaMaxima(maximo) {
    if (maximo <= 0) return 1;
    const potencia = 10 ** Math.floor(Math.log10(maximo));
    return [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((v) => v >= maximo);
  }
  function grafico(pontos, { tipo = "barras", formato = (v) => v, largura = 1000, altura = 250, destaque = -1 } = {}) {
    const margem = { topo: 14, dir: 8, base: 28, esq: 82 };
    const area = { l: largura - margem.esq - margem.dir, a: altura - margem.topo - margem.base };
    const maximo = escalaMaxima(Math.max(0, ...pontos.map((p) => p.valor)));
    const y = (v) => margem.topo + area.a - (v / maximo) * area.a;
    const passo = area.l / Math.max(1, pontos.length);
    const linhasGrade = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = maximo * f;
      return `<line x1="${margem.esq}" x2="${largura - margem.dir}" y1="${y(v)}" y2="${y(v)}" class="grade"/><text x="${margem.esq - 8}" y="${y(v) + 4}" class="eixo" text-anchor="end">${esc(formato(v, true))}</text>`;
    }).join("");
    const cadaRotulo = Math.ceil(pontos.length / 16);
    const rotulos = pontos.map((p, i) => (i % cadaRotulo === 0 ? `<text x="${margem.esq + passo * i + passo / 2}" y="${altura - 8}" class="eixo" text-anchor="middle">${esc(p.rotulo)}</text>` : "")).join("");
    let marcas;
    if (tipo === "linha") {
      const coords = pontos.map((p, i) => [margem.esq + passo * i + passo / 2, y(p.valor)]);
      const caminho = coords.map(([cx, cy], i) => `${i ? "L" : "M"}${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ");
      const areaCaminho = coords.length ? `${caminho} L${coords.at(-1)[0].toFixed(1)},${y(0)} L${coords[0][0].toFixed(1)},${y(0)} Z` : "";
      marcas = `<path d="${areaCaminho}" class="area"/><path d="${caminho}" class="linha"/>${coords.map(([cx, cy], i) => `<circle cx="${cx}" cy="${cy}" r="3.5" class="ponto"><title>${esc(pontos[i].rotulo)}: ${esc(formato(pontos[i].valor))}</title></circle>`).join("")}`;
    } else {
      const larguraBarra = Math.min(56, passo * 0.62);
      marcas = pontos.map((p, i) => {
        const topo = y(p.valor);
        const altBarra = Math.max(0, y(0) - topo);
        return `<rect x="${margem.esq + passo * i + (passo - larguraBarra) / 2}" y="${topo}" width="${larguraBarra}" height="${altBarra}" rx="4" class="barra${i === destaque ? " destaque" : ""}"><title>${esc(p.rotulo)}: ${esc(formato(p.valor))}</title></rect>`;
      }).join("");
    }
    return `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" role="img">${linhasGrade}${marcas}${rotulos}</svg>`;
  }
  const dinheiroCurto = (centavos, eixo) => {
    if (!eixo) return dinheiro(centavos);
    const reais = Math.abs(centavos / 100);
    const sinal = centavos < 0 ? "−" : "";
    if (reais >= 1000) return `${sinal}R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
    return `${sinal}R$ ${Math.round(reais)}`;
  };

  // ---------- Planilha (CSV para abrir no Excel) ----------
  function baixarCsv(nome, cabecalho, linhas) {
    const celula = (v) => {
      const t = String(v ?? "");
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const conteudo = [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
    const blob = new Blob(["﻿", conteudo], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1000);
  }
  const csvDinheiro = (centavos) => ((Number(centavos) || 0) / 100).toFixed(2).replace(".", ",");

  // ---------- Fotos dos produtos ----------
  function imagemProduto(p, classe = "") {
    if (p?.id && p.foto) return `<img class="foto ${classe}" src="/api/produtos/${p.id}/foto?v=${p.foto}" alt="${esc(p.nome)}" loading="lazy"/>`;
    return `<div class="foto sem-foto ${classe}" aria-hidden="true"><span>${esc(String(p?.nome || "?").trim()[0] || "?")}</span></div>`;
  }
  // Reduz a foto no próprio computador (até 900 px, JPEG) antes de enviar.
  async function reduzirFoto(arquivo) {
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error("Escolha uma foto em JPG, PNG ou WebP.");
    if (arquivo.size > 25 * 1024 * 1024) throw new Error("Foto grande demais.");
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  const NOMES = {
    pagamento: { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", outro: "Outro" },
    canal: { loja: "Loja", whatsapp: "WhatsApp", telefone: "Telefone" },
    recebimento: { retirada: "Retirada", entrega: "Entrega" },
    encomenda: { aguardando: "Aguardando", producao: "Em produção", pronto: "Pronto", entrega: "Saiu para entrega", entregue: "Entregue", cancelada: "Cancelada" },
    tipo: { produto: "Produto", material: "Matéria-prima", servico: "Serviço" },
    movimento: { entrada: "Entrada", saida: "Saída", perda: "Perda", ajuste: "Ajuste", venda: "Venda", estorno: "Devolução" },
    uso: { entrega: "Entrega", particular: "Serviço particular", interno: "Interno" },
  };
  const opcoes = (mapa) => Object.entries(mapa).map(([valor, rotulo]) => ({ valor, rotulo }));

  Object.assign(FA, {
    $, $$, esc, dinheiro, lerDinheiro, lerNumero, paraCampo, qtd, pct, hoje, agoraCampo, somarDias, data, dataCurta, dataHora, quandoTexto,
    soNumeros, cpf, telefone, whatsapp, primeiroNome, api, token, guardarToken, aviso, janela, formulario, lerCampos, campoHtml, confirmar, tabela, grafico, dinheiroCurto,
    baixarCsv, csvDinheiro, normalizar, NOMES, opcoes, imagemProduto, reduzirFoto,
    pode: (...permissoes) => permissoes.some((p) => FA.estado.usuario?.permissoes.includes(p)),
  });
})();
