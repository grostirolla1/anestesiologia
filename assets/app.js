/* Anestesiologia aberta: site estático, sem dependências.
   Dados: data/indice.json (gerado por scripts/gerar_indice.py) + arquivos em data/. */
(() => {
  'use strict';

  const REPO = 'https://github.com/grostirolla1/anestesiologia';
  const CHAVE = 'anestesiologia-aberta:v1';
  const main = document.getElementById('conteudo');

  let IDX = null;                 // índice carregado
  const LINHA = new Map();        // id -> [id, fonte, tema, temFigura, temExplicacao]
  const Q = new Map();            // id -> questão completa (carregada sob demanda)
  const arquivos = new Map();     // arquivo -> Promise
  let estudo = null;              // sessão de estudo (só em memória)
  let relogio = null;             // intervalo do cronômetro
  let aoSair = null;              // limpeza da tela atual

  /* ---------------- utilidades ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const tempo = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
  };
  const embaralhar = (lista) => {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // texto de referência: escapa tudo e transforma endereços em links
  const comLinks = (s) => String(s ?? '').split(/(https?:\/\/[^\s<>"']+[^\s<>"'.,;:)\]])/).map((p, i) =>
    i % 2 ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p)}</a>` : esc(p)).join('');

  function ler() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || { simulados: {} }; } catch (e) { return { simulados: {} }; }
  }
  function gravar(estado) {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); return true; } catch (e) { return false; }
  }
  function salvarSimulado(sim) { const e = ler(); e.simulados[sim.id] = sim; return gravar(e); }

  /* ---------------- HTML de terceiros: só o que está na lista passa ---------------- */
  const TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'figure', 'figcaption', 'img', 'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'title', 'desc', 'defs', 'marker']);
  const ATRIBUTOS = new Set(['viewbox', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'width', 'height', 'fill', 'stroke',
    'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-size', 'font-weight', 'font-style', 'text-anchor',
    'dominant-baseline', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity', 'marker-end', 'marker-start', 'id', 'markerwidth',
    'markerheight', 'refx', 'refy', 'orient', 'colspan', 'rowspan', 'dx', 'dy', 'preserveaspectratio']);
  function limpar(html) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    const visitar = (no) => {
      for (const filho of Array.from(no.childNodes)) {
        if (filho.nodeType === 3) continue;
        if (filho.nodeType !== 1) { filho.remove(); continue; }
        const tag = filho.tagName.toLowerCase();
        if (!TAGS.has(tag)) {
          if (['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'].includes(tag)) { filho.remove(); continue; }
          visitar(filho);
          filho.replaceWith(...Array.from(filho.childNodes));
          continue;
        }
        for (const at of Array.from(filho.attributes)) {
          const nome = at.name.toLowerCase(), valor = at.value;
          if (tag === 'img' && nome === 'src' && /^data\/imagens\/[\w.\-]+$/.test(valor)) continue;
          if (tag === 'img' && nome === 'alt') continue;
          if (ATRIBUTOS.has(nome) && !/url\s*\(|javascript:|expression/i.test(valor.replace(/url\(#[\w-]+\)/g, ''))) continue;
          filho.removeAttribute(at.name);
        }
        if (tag === 'img') { filho.setAttribute('loading', 'lazy'); if (!filho.getAttribute('alt')) filho.setAttribute('alt', 'Figura da questão'); }
        visitar(filho);
      }
    };
    visitar(doc.body);
    return doc.body.innerHTML;
  }

  /* ---------------- carga de dados ---------------- */
  function buscar(arquivo) {
    if (!arquivos.has(arquivo)) {
      arquivos.set(arquivo, fetch(arquivo).then((r) => { if (!r.ok) throw new Error(arquivo + ': ' + r.status); return r.json(); }));
    }
    return arquivos.get(arquivo);
  }
  async function carregarFonte(i) {
    const f = IDX.fontes[i];
    if (f.carregada) return;
    const [dados, exps] = await Promise.all([buscar(f.arquivo), f.explicacoes ? buscar(f.explicacoes).catch(() => ({})) : {}]);
    for (const q of dados.questoes) {
      const e = exps[String(q.id)] || {};
      Q.set(q.id, {
        ...q, fonte: i,
        tema: q.tema || e.tema || null,
        explicacao: q.explicacao || e.explicacao || null,
        referencias: q.referencias || e.referencias || [],
        divergencia: q.divergencia || e.divergencia || null,
      });
    }
    f.carregada = true;
  }
  async function garantir(ids) {
    const fontes = new Set(ids.map((id) => LINHA.get(id)).filter(Boolean).map((l) => l[1]));
    await Promise.all([...fontes].map(carregarFonte));
    return ids.filter((id) => Q.has(id));
  }
  const gabarito = (q) => (q.alternativas.find((a) => a.isResposta) || {}).letra || null;
  const acertou = (q, letra) => q.anulada ? true : letra != null && letra === gabarito(q);

  /* ---------------- capnograma: cada questão é um ciclo respiratório ---------------- */
  function capnograma(itens, opcoes = {}) {
    const n = itens.length, L = 20;
    let s = `<svg class="capno" viewBox="0 0 ${n * L} 32" preserveAspectRatio="none" role="group" aria-label="${esc(opcoes.rotulo || 'Progresso')}">`;
    itens.forEach((it, i) => {
      const x = i * L;
      const d = it.classe === 'apneia' ? `M${x} 27h${L}` : `M${x} 27h2l2-18l10-3l2 21h4`;
      const alvo = opcoes.clicavel ? ` data-ir="${i}" role="button" tabindex="0"` : '';
      s += `<g${alvo} aria-label="${esc(it.rotulo)}"><title>${esc(it.rotulo)}</title><rect class="alvo" x="${x}" y="0" width="${L}" height="32"/>` +
        `<path class="${it.classe}" d="${d}"/>` +
        (it.marcada ? `<rect class="marcada" x="${x + 6}" y="0" width="8" height="2.5"/>` : '') +
        (it.atual ? `<rect class="atual" x="${x + 4}" y="29.5" width="12" height="2.5"/>` : '') + '</g>';
    });
    return s + '</svg>';
  }
  function tracoAbertura() {
    let d = 'M0 52';
    for (let i = 0; i < 9; i++) d += 'h14l6-40l44-7l6 47h10';
    return `<svg class="capno" viewBox="0 0 720 60" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="${d}"/></svg>`;
  }

  /* ---------------- blocos de questão ---------------- */
  function htmlQuestao(q, { posicao, total, escolhida, revelar, travada }) {
    const f = IDX.fontes[q.fonte];
    const certa = gabarito(q);
    // o tema só aparece junto com o gabarito: durante o simulado ele seria uma dica
    const meta = [`Questão ${posicao} de ${total}`, f.titulo, revelar ? q.tema : null].filter(Boolean).map(esc).join(' | ');
    let h = `<article class="questao"><p class="meta">${meta}</p><div class="enunciado">${limpar(q.descricao)}</div><ol class="alternativas">`;
    for (const a of q.alternativas) {
      let classe = 'alt', selo = '';
      if (revelar) {
        if (a.letra === certa) { classe += ' certa'; selo = a.letra === escolhida ? 'Gabarito, e foi a sua resposta' : 'Gabarito'; }
        else if (a.letra === escolhida) { classe += ' errada'; selo = 'Sua resposta'; }
      }
      h += `<li><button type="button" class="${classe}" data-letra="${a.letra}" aria-pressed="${a.letra === escolhida}"${travada ? ' disabled' : ''}>` +
        `<span class="letra">${a.letra})</span><span>${limpar(a.descricao)}</span>${selo ? `<span class="selo">${selo}</span>` : ''}</button></li>`;
    }
    h += '</ol>';
    if (revelar) h += htmlExplicacao(q, escolhida);
    return h + '</article>';
  }
  function htmlExplicacao(q, escolhida) {
    const f = IDX.fontes[q.fonte];
    let h = '<section class="explicacao"><h3>Explicação</h3>';
    if (q.anulada) h += '<p class="aviso forte">Questão anulada pela banca: conta como acerto para todos.</p>';
    else if (escolhida == null) h += '<p class="aviso">Você não respondeu esta questão.</p>';
    if (q.explicacao) {
      // [1], [2] no texto viram chamadas pequenas para a lista de referências
      h += limpar(q.explicacao).replace(/\s*\[(\d{1,2})\]/g, (m, n) => q.referencias[n - 1] ? `<sup class="cit" title="${esc(q.referencias[n - 1])}">[${n}]</sup>` : m);
      if (q.divergencia) h += `<p class="aviso forte"><strong>Atenção ao gabarito:</strong> ${esc(q.divergencia)}</p>`;
      if (q.referencias.length) h += '<p class="refs-titulo">Referências</p><ol class="refs">' + q.referencias.map((r) => `<li>${comLinks(r)}</li>`).join('') + '</ol>';
    } else {
      h += `<p>Esta questão ainda não tem explicação. <a href="${REPO}/blob/main/CONTRIBUTING.md">Veja como escrever uma</a>.</p>`;
    }
    const t = IDX.temas.indexOf(q.tema);
    return h + `<p class="rodape-exp">${t >= 0 ? `<a href="#/ia/${t}">Estudar este tema com IA</a>` : ''}<a href="${linkIssue(q)}" target="_blank" rel="noopener">Apontar erro ou sugerir melhoria</a></p></section>`;
  }

  /* ---------------- contribuir: issue já preenchida ---------------- */
  const textoPuro = (h) => { const d = document.createElement('div'); d.innerHTML = limpar(h || ''); return d.textContent.replace(/\s+/g, ' ').trim(); };
  const corta = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  function linkIssue(q) {
    if (!q) return `${REPO}/issues/new/choose`;
    const f = IDX.fontes[q.fonte];
    const certa = q.anulada ? 'anulada' : gabarito(q);
    const dados = [
      `**Prova:** ${f.titulo}`,
      `**Tema:** ${q.tema || 'sem tema'}`,
      `**Gabarito no site:** ${certa}`,
      '', `**Enunciado:** ${corta(textoPuro(q.descricao), 700)}`, '',
      ...q.alternativas.map((a) => `- ${a.letra}) ${corta(textoPuro(a.descricao), 160)}`),
      '', `**Início da explicação:** ${q.explicacao ? corta(textoPuro(q.explicacao), 300) : 'sem explicação'}`,
      '', `Link: ${location.origin}${location.pathname}#/questao/${q.id}`,
    ].join('\n');
    const p = new URLSearchParams({ template: 'erro-na-questao.yml', title: `Questão ${q.id} (${f.titulo})`, questao: `${q.id}, ${f.titulo}`, dados });
    return `${REPO}/issues/new?${p.toString()}`;
  }

  /* ---------------- início ---------------- */
  function telaInicio() {
    const sims = Object.values(ler().simulados).sort((a, b) => b.criadoEm - a.criadoEm);
    const abertos = sims.filter((s) => s.status !== 'finalizado');
    const feitos = sims.filter((s) => s.status === 'finalizado').slice(0, 8);
    const comExp = IDX.questoes.filter((l) => l[4]).length;
    let h = `<section class="abertura">
      <h1>Da residência ao título, aberto para todos.</h1>
      ${tracoAbertura()}
      <p class="chamada">Questões de TSA, TEA, ME e concursos, explicadas a partir da literatura. Grátis, sem cadastro, e qualquer um pode corrigir.</p>
      <div class="acoes">
        <a class="botao principal" href="#/montar/simulado">Montar um simulado</a>
        <a class="botao" href="#/montar/estudo">Estudar com gabarito na hora</a>
        <a class="botao" href="#/ia">Estudar com IA</a>
        <a class="botao" href="#/contribuir">Contribuir</a>
      </div>
    </section>`;
    if (abertos.length) {
      h += '<section class="secao"><h2>Continuar de onde parou</h2><ul class="lista">' + abertos.map((s) => {
        const resp = Object.keys(s.respostas).length;
        return `<li><div><h3>${esc(s.titulo)}</h3><p class="detalhe">${resp} de ${s.ids.length} respondidas, ${tempo(s.tempoMs)} de prova</p></div>
          <div class="acoes"><a class="botao principal" href="#/simulado/${s.id}">Continuar</a><button class="botao discreto" data-apagar="${s.id}">Descartar</button></div></li>`;
      }).join('') + '</ul></section>';
    }
    h += '<section class="secao"><h2>Refazer uma prova</h2><p class="nota">Escolha a prova e o modo. No simulado, o gabarito e as explicações só aparecem depois que você finaliza.</p>';
    const series = new Map();
    IDX.fontes.forEach((f, i) => { if (f.n) { if (!series.has(f.serie)) series.set(f.serie, []); series.get(f.serie).push(i); } });
    const ordem = [...series.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const serie of ordem) {
      const lista = series.get(serie).sort((a, b) => String(IDX.fontes[b].ano).localeCompare(String(IDX.fontes[a].ano)) || IDX.fontes[a].titulo.localeCompare(IDX.fontes[b].titulo, 'pt-BR'));
      const total = lista.reduce((s, i) => s + IDX.fontes[i].n, 0);
      h += `<details><summary><strong>${esc(serie)}</strong>, ${plural(lista.length, 'prova', 'provas')}, ${plural(total, 'questão', 'questões')}</summary><ul class="lista">` +
        lista.map((i) => { const f = IDX.fontes[i]; return `<li><div><h3>${esc(f.titulo)}</h3><p class="detalhe">${plural(f.n, 'questão', 'questões')}${f.ordem_da_prova ? ', na ordem da prova' : ''}</p></div>
          <div class="acoes"><button class="botao" data-prova="${i}" data-modo="simulado">Simulado</button><button class="botao" data-prova="${i}" data-modo="estudo">Estudar</button></div></li>`; }).join('') + '</ul></details>';
    }
    h += '</section>';
    if (feitos.length) {
      h += '<section class="secao"><h2>Simulados finalizados</h2><ul class="lista">' + feitos.map((s) =>
        `<li><div><h3>${esc(s.titulo)}</h3><p class="detalhe">${s.acertos} de ${s.ids.length} acertos em ${tempo(s.tempoMs)}</p></div>
          <div class="acoes"><a class="botao" href="#/resultado/${s.id}">Ver resolução</a><button class="botao discreto" data-apagar="${s.id}">Apagar</button></div></li>`).join('') + '</ul></section>';
    }
    h += `<section class="secao"><h2>O que tem aqui</h2><p class="nota">${comExp === IDX.questoes.length ? 'Todas as questões têm explicação comentada, com as referências da literatura.' : `${plural(comExp, 'questão já tem', 'questões já têm')} explicação comentada, com as referências da literatura; as demais estão sendo escritas.`} <a href="#/sobre">Saiba de onde vêm as questões e como contribuir</a>.</p></section>`;
    main.innerHTML = h;
    main.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.apagar) { const e = ler(); delete e.simulados[b.dataset.apagar]; gravar(e); telaInicio(); }
      if (b.dataset.prova) {
        const i = Number(b.dataset.prova), f = IDX.fontes[i];
        b.disabled = true; b.textContent = 'Abrindo…';
        const ids = IDX.questoes.filter((l) => l[1] === i).map((l) => l[0]);
        iniciar(b.dataset.modo, ids, f.titulo);
      }
    };
  }

  /* ---------------- montar ---------------- */
  function telaMontar(modo) {
    const simulado = modo === 'simulado';
    const series = [...new Set(IDX.fontes.filter((f) => f.n).map((f) => f.serie))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const anos = [...new Set(IDX.fontes.map((f) => String(f.ano)).filter((a) => /^\d{4}$/.test(a)))].sort();
    const porSerie = (s) => IDX.questoes.filter((l) => IDX.fontes[l[1]].serie === s).length;
    const porTema = (t) => IDX.questoes.filter((l) => l[2] === t).length;
    const classificadas = IDX.questoes.filter((l) => l[2] >= 0).length;
    const chip = (nome, valor, texto, n, marcado) => `<label class="opcao"><input type="checkbox" name="${nome}" value="${esc(valor)}"${marcado ? ' checked' : ''}><span>${esc(texto)} <small>${n}</small></span></label>`;
    const seletor = (nome, padrao) => `<select name="${nome}">${anos.map((a) => `<option${a === padrao ? ' selected' : ''}>${a}</option>`).join('')}</select>`;
    main.innerHTML = `<form class="montar">
      <h1>${simulado ? 'Montar um simulado' : 'Estudar com gabarito na hora'}</h1>
      <p class="nota">${simulado
        ? 'Prova cronometrada. Dá para pausar e continuar outro dia neste navegador. Gabarito e explicações aparecem só no fim.'
        : 'A cada resposta você vê o gabarito e a explicação antes de seguir.'}</p>
      <fieldset><legend>De quais provas</legend><div class="opcoes">${series.map((s) => chip('serie', s, s, porSerie(s), true)).join('')}</div>
        <p><button type="button" class="botao discreto" data-todas="1">Marcar todas</button><button type="button" class="botao discreto" data-todas="0">Desmarcar todas</button></p></fieldset>
      <fieldset><legend>De quais anos</legend><div class="linha-campo"><label>De ${seletor('de', anos[0])}</label><label>até ${seletor('ate', anos[anos.length - 1])}</label></div></fieldset>
      <fieldset><legend>De quais temas</legend>
        <p class="nota">Sem marcar nenhum, entram todos.${classificadas < IDX.questoes.length ? ` Por enquanto ${classificadas.toLocaleString('pt-BR')} de ${IDX.questoes.length.toLocaleString('pt-BR')} questões têm tema classificado; marcar um tema restringe a busca a elas.` : ''}</p>
        <div class="opcoes">${IDX.temas.map((t, i) => porTema(i) ? chip('tema', i, t, porTema(i), false) : '').join('')}</div></fieldset>
      <fieldset><legend>Quantas questões</legend><div class="linha-campo"><input type="number" name="n" min="1" value="${simulado ? 50 : 20}" aria-label="Quantidade de questões"><span data-disp></span></div></fieldset>
      <div class="resumo-montar"><button class="botao principal" type="submit">${simulado ? 'Começar o simulado' : 'Começar a estudar'}</button></div>
    </form>`;
    const form = main.querySelector('form');
    const filtrar = () => {
      const d = new FormData(form);
      const ss = new Set(d.getAll('serie')), ts = new Set(d.getAll('tema').map(Number));
      const de = d.get('de'), ate = d.get('ate');
      return IDX.questoes.filter((l) => {
        const f = IDX.fontes[l[1]], ano = String(f.ano);
        return ss.has(f.serie) && (!/^\d{4}$/.test(ano) || (ano >= de && ano <= ate)) && (!ts.size || ts.has(l[2]));
      });
    };
    const atualizar = () => {
      const n = filtrar().length;
      form.querySelector('[data-disp]').textContent = n ? `de ${n.toLocaleString('pt-BR')} disponíveis com esses filtros` : 'Nenhuma questão com esses filtros: afrouxe alguma escolha.';
      form.querySelector('[type=submit]').disabled = !n;
    };
    form.oninput = atualizar;
    form.onclick = (ev) => {
      const b = ev.target.closest('[data-todas]');
      if (!b) return;
      form.querySelectorAll('[name=serie]').forEach((c) => { c.checked = b.dataset.todas === '1'; });
      atualizar();
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const d = new FormData(form), disp = filtrar();
      const n = Math.max(1, Math.min(Number(d.get('n')) || 1, disp.length));
      const ids = embaralhar(disp).slice(0, n).map((l) => l[0]);
      const b = form.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Abrindo…';
      const temas = d.getAll('tema').map((i) => IDX.temas[Number(i)]);
      iniciar(modo, ids, (temas.length && temas.length <= 2 ? temas.join(' e ') : 'Questões sortidas') + `, ${n} questões`);
    };
    atualizar();
  }

  async function iniciar(modo, ids, titulo) {
    try { ids = await garantir(ids); } catch (e) { return erro('Não foi possível carregar as questões. Verifique a conexão e tente de novo.'); }
    if (!ids.length) return erro('Nenhuma questão encontrada para essa escolha.');
    if (modo === 'estudo') { estudo = { ids, titulo, pos: 0, respostas: {} }; location.hash = '#/estudo'; if (location.hash === '#/estudo') rota(); return; }
    const sim = { id: Date.now().toString(36), titulo, criadoEm: Date.now(), ids, respostas: {}, marcadas: [], atual: 0, tempoMs: 0, status: 'andamento' };
    if (!salvarSimulado(sim)) return erro('Este navegador não deixou salvar o simulado (armazenamento bloqueado ou cheio). Libere o armazenamento do site e tente de novo.');
    location.hash = '#/simulado/' + sim.id;
  }

  /* ---------------- estudo ---------------- */
  function telaEstudo() {
    if (!estudo) { location.hash = '#/montar/estudo'; return; }
    const desenhar = () => {
      const s = estudo, q = Q.get(s.ids[s.pos]), escolhida = s.respostas[q.id];
      const feitas = Object.keys(s.respostas).length, certas = s.ids.filter((id) => s.respostas[id] != null && acertou(Q.get(id), s.respostas[id])).length;
      const itens = s.ids.map((id, i) => ({
        classe: s.respostas[id] == null ? 'apneia' : acertou(Q.get(id), s.respostas[id]) ? 'certo' : 'errado',
        atual: i === s.pos, rotulo: `Questão ${i + 1}: ${s.respostas[id] == null ? 'sem resposta' : acertou(Q.get(id), s.respostas[id]) ? 'acerto' : 'erro'}`,
      }));
      main.innerHTML = `<div class="sessao"><div class="sessao-topo"><h2>${esc(s.titulo)}</h2><span>${certas} de ${feitas} certas</span></div>
        ${capnograma(itens, { clicavel: true, rotulo: 'Questões desta sessão' })}
        ${htmlQuestao(q, { posicao: s.pos + 1, total: s.ids.length, escolhida, revelar: escolhida != null, travada: escolhida != null })}
        <div class="navegacao"><div class="grupo"><button class="botao" data-passo="-1"${s.pos === 0 ? ' disabled' : ''}>Anterior</button>
        <button class="botao${escolhida != null ? ' principal' : ''}" data-passo="1"${s.pos === s.ids.length - 1 ? ' disabled' : ''}>Próxima</button></div>
        <a class="botao discreto" href="#/">Encerrar</a></div></div>`;
    };
    const responder = (letra) => { const q = Q.get(estudo.ids[estudo.pos]); if (estudo.respostas[q.id] == null && q.alternativas.some((a) => a.letra === letra)) { estudo.respostas[q.id] = letra; desenhar(); main.querySelector('.explicacao')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
    const ir = (p) => { if (p >= 0 && p < estudo.ids.length) { estudo.pos = p; desenhar(); window.scrollTo(0, 0); } };
    main.onclick = (ev) => {
      const alt = ev.target.closest('.alt'), passo = ev.target.closest('[data-passo]'), salto = ev.target.closest('[data-ir]');
      if (alt && !alt.disabled) responder(alt.dataset.letra);
      else if (passo) ir(estudo.pos + Number(passo.dataset.passo));
      else if (salto) ir(Number(salto.dataset.ir));
    };
    teclado(responder, (d) => ir(estudo.pos + d), (i) => ir(i));
    desenhar();
  }

  /* ---------------- simulado ---------------- */
  async function telaSimulado(id) {
    const sim = ler().simulados[id];
    if (!sim) return erro('Este simulado não existe mais neste navegador.');
    if (sim.status === 'finalizado') { location.hash = '#/resultado/' + id; return; }
    try { await garantir(sim.ids); } catch (e) { return erro('Não foi possível carregar as questões. Verifique a conexão e tente de novo.'); }
    let confirmando = false, ultimoTique = Date.now(), tiques = 0;
    if (sim.tempoMs > 0 || Object.keys(sim.respostas).length) sim.status = 'pausado';   // voltou depois: retoma só com um clique

    const desenhar = () => {
      if (sim.status === 'pausado') {
        main.innerHTML = `<div class="pausa"><h1>Simulado pausado</h1><p>${esc(sim.titulo)}. ${Object.keys(sim.respostas).length} de ${sim.ids.length} respondidas, ${tempo(sim.tempoMs)} de prova.</p>
          <p>O progresso está salvo neste navegador. Pode fechar a página e voltar outro dia.</p>
          <div class="acoes"><button class="botao principal" data-acao="continuar">Continuar o simulado</button><a class="botao" href="#/">Voltar ao início</a></div></div>`;
        return;
      }
      const q = Q.get(sim.ids[sim.atual]);
      const itens = sim.ids.map((qid, i) => ({
        classe: sim.respostas[qid] ? 'ciclo' : 'apneia', atual: i === sim.atual, marcada: sim.marcadas.includes(qid),
        rotulo: `Questão ${i + 1}: ${sim.respostas[qid] ? 'respondida' : 'sem resposta'}${sim.marcadas.includes(qid) ? ', marcada para revisar' : ''}`,
      }));
      const faltam = sim.ids.length - Object.keys(sim.respostas).length;
      main.innerHTML = `<div class="sessao"><div class="sessao-topo"><h2>${esc(sim.titulo)}</h2><span class="relogio" aria-label="Tempo de prova">${tempo(sim.tempoMs)}</span></div>
        ${capnograma(itens, { clicavel: true, rotulo: 'Questões do simulado' })}
        <p class="capno-legenda"><span>Traço verde: respondida</span><span>Linha reta: sem resposta</span><span>Barra no alto: marcada para revisar</span></p>
        ${htmlQuestao(q, { posicao: sim.atual + 1, total: sim.ids.length, escolhida: sim.respostas[q.id], revelar: false, travada: false })}
        <div class="navegacao"><div class="grupo"><button class="botao" data-passo="-1"${sim.atual === 0 ? ' disabled' : ''}>Anterior</button>
          <button class="botao" data-passo="1"${sim.atual === sim.ids.length - 1 ? ' disabled' : ''}>Próxima</button>
          <button class="botao" data-acao="marcar" aria-pressed="${sim.marcadas.includes(q.id)}">${sim.marcadas.includes(q.id) ? 'Desmarcar revisão' : 'Marcar para revisar'}</button></div>
          <div class="grupo"><button class="botao" data-acao="pausar">Pausar</button><button class="botao principal" data-acao="finalizar">Finalizar simulado</button></div></div>
        ${confirmando ? `<div class="confirmar" role="alertdialog" aria-label="Confirmar finalização"><p><strong>Finalizar agora?</strong> ${faltam ? `${plural(faltam, 'questão ficou', 'questões ficaram')} sem resposta e ${faltam === 1 ? 'conta' : 'contam'} como erro.` : 'Todas as questões foram respondidas.'} Depois de finalizar não dá para mudar as respostas.</p>
          <div class="acoes"><button class="botao principal" data-acao="confirmar">Finalizar e ver a resolução</button><button class="botao" data-acao="cancelar">Voltar à prova</button></div></div>` : ''}</div>`;
      if (confirmando) main.querySelector('.confirmar button').focus();
    };
    const salvar = () => salvarSimulado(sim);
    const responder = (letra) => { const q = Q.get(sim.ids[sim.atual]); if (!q.alternativas.some((a) => a.letra === letra)) return; if (sim.respostas[q.id] === letra) delete sim.respostas[q.id]; else sim.respostas[q.id] = letra; salvar(); desenhar(); };
    const ir = (p) => { if (p >= 0 && p < sim.ids.length) { sim.atual = p; confirmando = false; salvar(); desenhar(); window.scrollTo(0, 0); } };
    const finalizar = () => {
      sim.status = 'finalizado'; sim.finalizadoEm = Date.now();
      sim.acertos = sim.ids.filter((qid) => acertou(Q.get(qid), sim.respostas[qid])).length;
      salvar(); location.hash = '#/resultado/' + sim.id;
    };
    main.onclick = (ev) => {
      const alt = ev.target.closest('.alt'), passo = ev.target.closest('[data-passo]'), salto = ev.target.closest('[data-ir]'), acao = ev.target.closest('[data-acao]');
      if (alt) return responder(alt.dataset.letra);
      if (passo) return ir(sim.atual + Number(passo.dataset.passo));
      if (salto) return ir(Number(salto.dataset.ir));
      if (!acao) return;
      const a = acao.dataset.acao, q = Q.get(sim.ids[sim.atual]);
      if (a === 'marcar') { sim.marcadas = sim.marcadas.includes(q.id) ? sim.marcadas.filter((x) => x !== q.id) : [...sim.marcadas, q.id]; }
      if (a === 'pausar') sim.status = 'pausado';
      if (a === 'continuar') { sim.status = 'andamento'; ultimoTique = Date.now(); }
      if (a === 'finalizar') confirmando = true;
      if (a === 'cancelar') confirmando = false;
      if (a === 'confirmar') return finalizar();
      salvar(); desenhar();
    };
    teclado((l) => { if (sim.status === 'andamento') responder(l); }, (d) => { if (sim.status === 'andamento') ir(sim.atual + d); });
    relogio = setInterval(() => {
      const agora = Date.now(), delta = agora - ultimoTique; ultimoTique = agora;
      if (sim.status !== 'andamento' || document.hidden || delta > 5000) return;   // aba escondida ou computador dormindo não contam
      sim.tempoMs += delta;
      const r = main.querySelector('.relogio'); if (r) r.textContent = tempo(sim.tempoMs);
      if (++tiques % 5 === 0) salvar();
    }, 1000);
    aoSair = () => { if (sim.status === 'andamento') { sim.status = 'pausado'; salvar(); } };
    window.addEventListener('pagehide', aoSair, { once: true });
    desenhar();
  }

  /* ---------------- resultado ---------------- */
  async function telaResultado(id) {
    const sim = ler().simulados[id];
    if (!sim) return erro('Este simulado não existe mais neste navegador.');
    if (sim.status !== 'finalizado') { location.hash = '#/simulado/' + id; return; }
    try { await garantir(sim.ids); } catch (e) { return erro('Não foi possível carregar as questões. Verifique a conexão e tente de novo.'); }
    const qs = sim.ids.map((qid) => Q.get(qid)).filter(Boolean);
    const ok = (q) => acertou(q, sim.respostas[q.id]);
    const certas = qs.filter(ok).length;
    const agrupar = (chave) => { const m = new Map(); for (const q of qs) { const k = chave(q); if (!m.has(k)) m.set(k, [0, 0]); m.get(k)[1]++; if (ok(q)) m.get(k)[0]++; } return [...m].sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]); };
    const tabela = (titulo, linhas) => linhas.length < 2 ? '' : `<h3>${titulo}</h3><table class="tabela"><thead><tr><th>${titulo.replace('Por ', '')}</th><th class="num">Acertos</th><th></th></tr></thead><tbody>` +
      linhas.map(([k, [c, t]]) => `<tr><td>${esc(k)}</td><td class="num">${c} de ${t}</td><td><span class="barra"><i style="width:${Math.round(100 * c / t)}%"></i></span></td></tr>`).join('') + '</tbody></table>';
    const itens = qs.map((q, i) => ({ classe: ok(q) ? 'certo' : 'errado', rotulo: `Questão ${i + 1}: ${ok(q) ? 'acerto' : sim.respostas[q.id] ? 'erro' : 'sem resposta'}` }));
    main.innerHTML = `<div class="sessao"><h1>${esc(sim.titulo)}</h1>
      <div class="placar"><span class="nota-final">${certas} de ${qs.length}</span><span>${Math.round(100 * certas / qs.length)}% de acerto em ${tempo(sim.tempoMs)}</span></div>
      ${capnograma(itens, { clicavel: true, rotulo: 'Resultado por questão' })}
      <p class="capno-legenda"><span>Verde: acerto</span><span>Vermelho: erro ou sem resposta</span><span>Clique num ciclo para ir à questão</span></p>
      <div class="secao">${tabela('Por tema', agrupar((q) => q.tema || 'Tema ainda não classificado'))}${tabela('Por prova', agrupar((q) => IDX.fontes[q.fonte].titulo))}</div>
      <div class="acoes"><button class="botao" data-acao="refazer">Refazer este simulado</button><button class="botao" data-acao="erradas"${certas === qs.length ? ' disabled' : ''}>Estudar só as que errei</button><a class="botao discreto" href="#/">Voltar ao início</a></div>
      <section class="secao resolvidas"><h2>Resolução completa</h2>${qs.map((q, i) => `<div id="q${i}">${htmlQuestao(q, { posicao: i + 1, total: qs.length, escolhida: sim.respostas[q.id] ?? null, revelar: true, travada: true })}</div>`).join('')}</section></div>`;
    main.onclick = (ev) => {
      const salto = ev.target.closest('[data-ir]'), acao = ev.target.closest('[data-acao]');
      if (salto) document.getElementById('q' + salto.dataset.ir)?.scrollIntoView({ behavior: 'smooth' });
      if (acao?.dataset.acao === 'refazer') iniciar('simulado', sim.ids, sim.titulo);
      if (acao?.dataset.acao === 'erradas') iniciar('estudo', qs.filter((q) => !ok(q)).map((q) => q.id), 'Erros de: ' + sim.titulo);
    };
  }

  /* ---------------- estudar com IA ---------------- */
  function telaIA(arg) {
    const local = /^(localhost|127\.|\[::1\])/.test(location.host) || location.protocol === 'file:';
    const base = local ? REPO.replace('github.com', 'raw.githubusercontent.com') + '/main/' : new URL('.', location.href.split('#')[0]).href;
    const inicial = /^\d+$/.test(arg || '') && IDX.temas[Number(arg)] ? Number(arg) : -1;
    const partes = (IDX.ia && IDX.ia.partes) || [];
    main.innerHTML = `<form class="montar">
      <h1>Estudar com IA</h1>
      <p class="nota">Escolha o tema e abra uma conversa no Claude ou no ChatGPT já com o pedido pronto. A IA recebe o endereço do guia de estudo e das questões deste banco, começa por um resumo do tema, destaca o que mais cai em prova e depois conduz você com perguntas e questões, citando livro e capítulo.</p>
      <fieldset><legend>Tema</legend><div class="opcoes">${IDX.temas.map((t, i) =>
        `<label class="opcao"><input type="radio" name="tema" value="${i}"${i === inicial ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Assunto específico</legend>
        <p class="nota">Opcional. Por exemplo: hipertermia maligna, curva de dissociação da hemoglobina, bloqueio do plano do eretor da espinha.</p>
        <input type="text" name="assunto" maxlength="120" aria-label="Assunto específico">
      </fieldset>
      <fieldset><legend>O pedido que será enviado</legend>
        <textarea name="prompt" rows="12" aria-label="Pedido que será enviado à IA"></textarea>
        <p class="nota">Pode editar antes de abrir. A conversa acontece na sua conta do Claude ou do ChatGPT; este site não envia nem guarda nada.</p>
      </fieldset>
      <div class="resumo-montar acoes">
        <button type="button" class="botao principal" data-ia="claude">Abrir no Claude</button>
        <button type="button" class="botao" data-ia="chatgpt">Abrir no ChatGPT</button>
        <button type="button" class="botao discreto" data-ia="copiar">Copiar o pedido</button>
        <span role="status" data-aviso></span>
      </div>
      <p class="aviso">IA erra, inclusive ao citar fontes. Confira no livro ou na diretriz antes de levar para a prova, e nunca use a conversa como orientação para tratar pacientes.</p>
    </form>`;
    const form = main.querySelector('form'), caixa = form.elements.prompt;
    let editado = false;
    const montar = () => {
      const t = Number(new FormData(form).get('tema') ?? -1), assunto = form.elements.assunto.value.trim();
      const tema = IDX.temas[t], slug = IDX.ia && IDX.ia.slugs[t];
      const foco = assunto ? (tema ? `${assunto} (dentro de ${tema})` : assunto) : (tema || 'anestesiologia em geral: me pergunte por onde quero começar');
      return `Quero estudar anestesiologia com você, para provas de residência, título (TSA/TEA da SBA) e concursos.

Assunto: ${foco}.

Antes de responder, abra e siga este guia de estudo: ${base}ia/guia.md
` + (tema && slug && partes[t] ? `Questões de prova deste tema, com gabarito e explicação: ${base}ia/temas/${slug}.md
` : `Lista de temas e questões do banco: ${base}ia/temas/indice.md
`) + `
Em resumo, o guia pede: (1) um resumo geral do assunto; (2) os pontos principais que mais caem em prova; (3) me guiar passo a passo, com uma pergunta ou questão do banco por vez, esperando minha resposta antes de comentar.

Baseie 100% do conteúdo na literatura de anestesiologia (Miller, Barash, Stoelting, Morgan & Mikhail, Tratado da SBA, diretrizes). Marque cada afirmação importante com [1], [2] e liste no fim a fonte: livro e capítulo, ou diretriz e ano, com link quando houver. Não invente página, edição nem artigo. Explique de forma clara e humana, com a terminologia médica correta. Se não conseguir abrir os links, avise e siga pela literatura.`;
    };
    const atualizar = () => { if (!editado) caixa.value = montar(); };
    form.oninput = (ev) => { if (ev.target === caixa) editado = true; else { editado = false; atualizar(); } };
    form.onsubmit = (ev) => ev.preventDefault();
    form.onclick = async (ev) => {
      const b = ev.target.closest('[data-ia]');
      if (!b) return;
      const texto = caixa.value, aviso = form.querySelector('[data-aviso]');
      if (b.dataset.ia === 'copiar') {
        try { await navigator.clipboard.writeText(texto); aviso.textContent = 'Pedido copiado.'; }
        catch (e) { caixa.select(); aviso.textContent = 'Não deu para copiar sozinho: o texto está selecionado, use Ctrl+C.'; }
        return;
      }
      const url = (b.dataset.ia === 'claude' ? 'https://claude.ai/new?q=' : 'https://chatgpt.com/?q=') + encodeURIComponent(texto);
      window.open(url, '_blank', 'noopener');
    };
    atualizar();
  }

  /* ---------------- contribuir ---------------- */
  function telaContribuir() {
    main.innerHTML = `<div class="prosa"><h1>Contribuir</h1>
      <p>O banco melhora com cada correção. Você não precisa saber programar: tudo passa por uma issue no GitHub, que qualquer pessoa com conta pode abrir.</p>
      <h2>Achou um erro numa questão</h2>
      <p>Abra a questão e use o link <strong>Apontar erro ou sugerir melhoria</strong>, logo abaixo da explicação. A issue já abre com a prova, o enunciado, as alternativas, o gabarito e o começo da explicação preenchidos. Você só escreve o que está errado e, se puder, a fonte.</p>
      <h2>Outras contribuições</h2>
      <div class="acoes">
        <a class="botao principal" href="${REPO}/issues/new?template=erro-na-questao.yml" target="_blank" rel="noopener">Apontar erro numa questão</a>
        <a class="botao" href="${REPO}/issues/new?template=nova-questao.yml" target="_blank" rel="noopener">Propor questão nova ou melhoria</a>
        <a class="botao discreto" href="${REPO}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Guia de contribuição</a>
      </div>
      <h2>Regras</h2>
      <ul><li>Escreva com suas palavras. Não cole trechos de livros, apostilas, cursos ou bancos de questões pagos.</li>
      <li>Questões novas precisam ser de sua autoria.</li>
      <li>Indique a fonte: livro e capítulo, diretriz e ano, ou link.</li>
      <li>Nada de dados de pacientes reais.</li></ul>
      <p><a class="botao" href="#/">Voltar ao início</a></p></div>`;
    main.onclick = null;
  }

  /* ---------------- questão avulsa (link das issues) ---------------- */
  async function telaQuestao(id) {
    const n = Number(id);
    if (!LINHA.has(n)) return erro('Essa questão não existe no banco.');
    try { await garantir([n]); } catch (e) { return erro('Não foi possível carregar a questão. Verifique a conexão e tente de novo.'); }
    iniciar('estudo', [n], 'Questão ' + n);
  }

  /* ---------------- sobre ---------------- */
  function telaSobre() {
    const n = (tipo) => IDX.questoes.filter((l) => IDX.fontes[l[1]].tipo === tipo).length;
    main.innerHTML = `<div class="prosa"><h1>Sobre este banco</h1>
      <p>Da residência ao título, aberto para todos. Este é um banco aberto de questões de anestesiologia, feito para quem está na residência ou se preparando para provas de título e concursos, e mantido por quem quiser ajudar.</p>
      <h2>De onde vêm as questões</h2>
      <ul><li><strong>${n('prova').toLocaleString('pt-BR')} questões de provas</strong>: provas da Sociedade Brasileira de Anestesiologia (TSA, TEA e provas de ME1, ME2 e ME3) e de concursos públicos. São conteúdo de terceiros: os direitos pertencem a quem elaborou cada prova, e elas não estão cobertas pela licença do repositório.</li>
      <li><strong>${n('original').toLocaleString('pt-BR')} questões originais</strong>, escritas para este projeto e livres para reutilizar nos termos da licença.</li></ul>
      <h2>Sobre as explicações</h2>
      <p>As explicações e as questões originais foram escritas com apoio de IA a partir da literatura-padrão e estão marcadas como pendentes de revisão. Elas podem conter erros. Nada aqui substitui livro-texto, diretriz atual ou julgamento clínico, e nada aqui é orientação para tratar pacientes.</p>
      <h2>Como contribuir</h2>
      <ul><li>Achou um erro? Use o link "Apontar erro ou sugerir melhoria" que aparece junto de cada explicação: a issue já abre com a questão preenchida.</li>
      <li>Quer revisar ou escrever explicações, classificar temas ou propor questões novas? O passo a passo está no <a href="${REPO}/blob/main/CONTRIBUTING.md">guia de contribuição</a>.</li>
      <li>Detém direitos sobre alguma questão e quer que ela saia do ar? <a href="${REPO}/issues/new?title=${encodeURIComponent('Pedido de remoção: ')}">Abra um pedido</a> e ela é removida.</li></ul>
      <h2>Privacidade</h2><p>Não há cadastro nem servidor: suas respostas e simulados ficam só no armazenamento deste navegador. Se você limpar os dados do site, eles se perdem.</p>
      <p><a class="botao" href="#/">Voltar ao início</a></p></div>`;
    main.onclick = null;
  }

  function erro(msg) {
    main.innerHTML = `<div class="prosa"><h1>Não deu certo</h1><p>${esc(msg)}</p><p><a class="botao" href="#/">Voltar ao início</a></p></div>`;
    main.onclick = null;
  }

  /* ---------------- teclado e rotas ---------------- */
  let aoTeclar = null;
  function teclado(responder, passo) {
    aoTeclar = (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
      const k = ev.key.toLowerCase();
      if (/^[a-f]$/.test(k)) responder(k.toUpperCase());
      else if (k === 'arrowright') passo(1);
      else if (k === 'arrowleft') passo(-1);
      else if ((k === 'enter' || k === ' ') && ev.target.closest?.('[data-ir]')) { ev.preventDefault(); ev.target.closest('[data-ir]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    };
  }
  document.addEventListener('keydown', (ev) => aoTeclar && aoTeclar(ev));

  function rota() {
    if (relogio) { clearInterval(relogio); relogio = null; }
    if (aoSair) { window.removeEventListener('pagehide', aoSair); aoSair(); aoSair = null; }
    aoTeclar = null; main.onclick = null;
    const [, tela, arg] = (location.hash || '#/').split('/');
    if (tela === 'montar') telaMontar(arg === 'estudo' ? 'estudo' : 'simulado');
    else if (tela === 'estudo') telaEstudo();
    else if (tela === 'simulado' && arg) telaSimulado(arg);
    else if (tela === 'resultado' && arg) telaResultado(arg);
    else if (tela === 'ia') telaIA(arg);
    else if (tela === 'contribuir') telaContribuir();
    else if (tela === 'questao' && arg) telaQuestao(arg);
    else if (tela === 'sobre') telaSobre();
    else telaInicio();
    window.scrollTo(0, 0);
  }

  /* ---------------- tema claro ou escuro ---------------- */
  const botaoTema = document.getElementById('troca-tema');
  const escuroAgora = () => document.documentElement.dataset.theme === 'dark';
  const rotularTema = () => { if (botaoTema) botaoTema.textContent = escuroAgora() ? 'Tema claro' : 'Tema escuro'; };
  if (botaoTema) {
    botaoTema.onclick = () => {
      const novo = escuroAgora() ? 'light' : 'dark';
      document.documentElement.dataset.theme = novo;
      try { localStorage.setItem('anestesiologia-aberta:tema', novo); } catch (e) { /* sem armazenamento, vale só nesta visita */ }
      rotularTema();
    };
    rotularTema();
  }

  fetch('data/indice.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((idx) => {
    IDX = idx;
    for (const l of IDX.questoes) LINHA.set(l[0], l);
    window.addEventListener('hashchange', rota);
    rota();
  }).catch(() => erro('Não foi possível carregar o banco de questões. Se você abriu o arquivo direto do disco, sirva a pasta por um servidor local (veja o README).'));
})();
