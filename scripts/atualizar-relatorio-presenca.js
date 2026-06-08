#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..");

const MONTH_LABELS = {
  janeiro: "Janeiro",
  fevereiro: "Fevereiro",
  marco: "Março",
  abril: "Abril",
  maio: "Maio",
  junho: "Junho",
  julho: "Julho",
  agosto: "Agosto",
  setembro: "Setembro",
  outubro: "Outubro",
  novembro: "Novembro",
  dezembro: "Dezembro",
};

function parseArgs(argv) {
  const args = {
    mes: "",
    modo: "preview",
    data: "",
    forcar: false,
    raiz: DEFAULT_PROJECT_ROOT,
    relatorio: "",
    base: "",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token === "--forcar") {
      args.forcar = true;
      continue;
    }

    if (!token.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = token.split("=");
    const value = inlineValue !== undefined ? inlineValue : argv[i + 1];
    const consumesNext = inlineValue === undefined;

    switch (key) {
      case "--mes":
        args.mes = (value || "").trim().toLowerCase();
        if (consumesNext) i += 1;
        break;
      case "--modo":
        args.modo = (value || "").trim().toLowerCase();
        if (consumesNext) i += 1;
        break;
      case "--data":
        args.data = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--raiz":
        args.raiz = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--relatorio":
        args.relatorio = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--base":
        args.base = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function usage() {
  return [
    "Uso:",
    "  node scripts/atualizar-relatorio-presenca.js --mes marco --modo preview",
    "  node scripts/atualizar-relatorio-presenca.js --mes marco --data 14/03/2026 --modo preview",
    "  node scripts/atualizar-relatorio-presenca.js --mes marco --modo apply",
    "",
    "Parametros:",
    "  --mes        Mes alvo (ex: fevereiro, marco)",
    "  --data       Data limite no formato DD/MM/AAAA (default: ultimo jogo da base)",
    "  --modo       preview | apply (default: preview)",
    "  --forcar     Permite aplicar mesmo com inconsistencias detectadas na base",
    "  --raiz       Caminho raiz do projeto (default: pasta do projeto)",
    "  --relatorio  Caminho relativo do HTML alvo (default: paginas-{mes}/pagina-relatorio-presenca-{mes})",
    "  --base       Caminho relativo do arquivo Jogos-do-ciclo*.txt (default: autodetecta na pasta do mes)",
    "",
    "Comportamento:",
    "  - Considera apenas os jogos do mes alvo ate a data limite",
    "  - preview: valida a base e mostra o resumo sem salvar",
    "  - apply: gera o HTML do relatorio, salva e cria backup .bak.<timestamp>",
  ].join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRawName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PLAYER_NAME_ALIASES = new Map(
  [
    ["Cleber", "Cleberson"],
    ["Henirque", "Henrique"],
    ["Lionel Henrique", "Henrique"],
    ["Lionel Henirque", "Henrique"],
  ].map(([alias, canonical]) => [normalizeRawName(alias), canonical])
);

function cleanName(rawLine) {
  let text = (rawLine || "").replace(/\u00a0/g, " ").trim();
  if (!text) return "";
  if (/^[-#]+$/.test(text)) return "";

  text = text.replace(/^\d+\s*[-.)]\s*/, "");
  text = text.replace(/^-\s*/, "");
  text = text.replace(/\s*\+\s*\d+\s*PONTOS?.*$/i, "");
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return "";
  if (/^presentes:?$/i.test(text)) return "";
  if (/^ausentes:?$/i.test(text)) return "";
  if (/^resultado/i.test(text)) return "";
  if (/^lista\s+com\s+todos\s+jogadores\s+da\s+patota:?$/i.test(text)) return "";
  if (/^times\s+fixo/i.test(text)) return "";
  if (/^time\s+preto$/i.test(text)) return "";
  if (/^time\s+laranja$/i.test(text)) return "";
  if (/^jogos\s+e\s+datas:?$/i.test(text)) return "";

  return text;
}

function canonicalizePlayerName(name) {
  const cleaned = cleanName(name);
  if (!cleaned) return "";
  return PLAYER_NAME_ALIASES.get(normalizeRawName(cleaned)) || cleaned;
}

function normalizeName(name) {
  return normalizeRawName(canonicalizePlayerName(name));
}

function uniqueNames(names) {
  const seen = new Set();
  const result = [];

  for (const item of names) {
    const canonical = canonicalizePlayerName(item);
    const key = normalizeName(canonical);
    if (!canonical || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(canonical);
  }

  return result;
}

function htmlEscape(text) {
  return String(text === undefined || text === null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDateCode(brDate) {
  const parts = (brDate || "").split("/");
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts.map((value) => Number(value));
  if (!dd || !mm || !yyyy) return 0;
  return yyyy * 10000 + mm * 100 + dd;
}

function pluralizeJogos(value) {
  return `${value} jogo${value === 1 ? "" : "s"}`;
}

function inferMonthKey(args) {
  if (args.mes) {
    return normalizeRawName(args.mes).replace(/\s+/g, "");
  }

  const candidates = [args.base, args.relatorio].filter(Boolean);
  for (const candidate of candidates) {
    const basename = path.basename(candidate);
    let match = basename.match(/jogos-do-ciclo-([^.]+)\.txt/i);
    if (!match) {
      match = basename.match(/pagina-relatorio-presenca-([^.]+)$/i);
    }
    if (match) {
      return normalizeRawName(match[1]).replace(/\s+/g, "");
    }
  }

  return "";
}

function resolveMonthLabel(monthKey) {
  return MONTH_LABELS[monthKey] || monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
}

function parseNumberedList(block, startRegex, endRegex) {
  const startMatch = block.match(startRegex);
  if (!startMatch || startMatch.index === undefined) {
    return [];
  }

  const from = startMatch.index + startMatch[0].length;
  const tail = block.slice(from);
  const endMatch = tail.match(endRegex);
  const segment = endMatch ? tail.slice(0, endMatch.index) : tail;

  return uniqueNames(
    segment
      .split(/\r?\n/)
      .map((line) => cleanName(line))
      .filter(Boolean)
  );
}

function parseRosterList(baseText) {
  const startMatch = baseText.match(/^\s*LISTA\s+COM\s+TODOS\s+JOGADORES\s+DA\s+PATOTA\s*:?\s*$/im);
  if (!startMatch || startMatch.index === undefined) {
    return [];
  }

  const from = startMatch.index + startMatch[0].length;
  const tail = baseText.slice(from);
  const endMatch = tail.match(/^\s*(?:-{8,}|TIMES\s+FIXO\b|JOGOS\s+E\s+DATAS\b).*$/im);
  const segment = endMatch ? tail.slice(0, endMatch.index) : tail;

  return uniqueNames(
    segment
      .split(/\r?\n/)
      .map((line) => cleanName(line))
      .filter(Boolean)
  );
}

function validateGame(game, rosterNames) {
  const issues = [];
  const warnings = [];
  const presentKeys = new Set(game.presentes.map((name) => normalizeName(name)));
  const absentKeys = new Set(game.ausentes.map((name) => normalizeName(name)));

  const overlap = game.presentes.filter((name) => absentKeys.has(normalizeName(name)));
  if (overlap.length > 0) {
    issues.push(`[${game.date}] Jogadores listados em presentes e ausentes: ${uniqueNames(overlap).join(", ")}`);
  }

  if (rosterNames.length > 0) {
    const rosterByKey = new Map(rosterNames.map((name) => [normalizeName(name), name]));
    const officialPresent = new Set(game.presentes.map((name) => normalizeName(name)).filter((key) => rosterByKey.has(key)));
    const officialAbsent = new Set(game.ausentes.map((name) => normalizeName(name)).filter((key) => rosterByKey.has(key)));
    const accounted = new Set([...officialPresent, ...officialAbsent]);

    const missing = rosterNames.filter((name) => !accounted.has(normalizeName(name)));
    if (missing.length > 0) {
      issues.push(`[${game.date}] Jogadores fixos sem status em presentes/ausentes: ${missing.join(", ")}`);
    }

    const extrasPresent = game.presentes.filter((name) => !rosterByKey.has(normalizeName(name)));
    if (extrasPresent.length > 0) {
      warnings.push(`[${game.date}] Presentes fora da lista oficial: ${uniqueNames(extrasPresent).join(", ")}`);
    }

    const extrasAbsent = game.ausentes.filter((name) => !rosterByKey.has(normalizeName(name)));
    if (extrasAbsent.length > 0) {
      warnings.push(`[${game.date}] Ausentes fora da lista oficial: ${uniqueNames(extrasAbsent).join(", ")}`);
    }
  }

  return {
    ...game,
    issues,
    warnings,
  };
}

function parseGames(baseText, rosterNames) {
  const markerRegex = /^\s*Jogo do dia\s+(\d{2}\/\d{2}\/\d{4})\s*$/gim;
  const markers = [];

  let match;
  while ((match = markerRegex.exec(baseText)) !== null) {
    markers.push({ date: match[1], index: match.index });
  }

  const games = [];

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const block = baseText.slice(current.index, next ? next.index : baseText.length);

    const game = {
      date: current.date,
      presentes: parseNumberedList(block, /Presentes\s*:/i, /Ausentes\s*:?/i),
      ausentes: parseNumberedList(block, /Ausentes\s*:?/i, /[-]{4,}|RESULTADO\s+do\s+dia|RESULTADO\s+dia/i),
      block,
    };

    games.push(validateGame(game, rosterNames));
  }

  return games;
}

function renderPresenceListItems(names, suffix) {
  return names
    .map(
      (name) =>
        `                <li><span>${htmlEscape(name)}</span><span class="bonus">${htmlEscape(suffix)}</span></li>`
    )
    .join("\n");
}

function renderGameCard(game) {
  const presentItems = game.presentes.map((name) => `              <li>${htmlEscape(name)}</li>`).join("\n");
  const absentItems = game.ausentes.map((name) => `              <li>${htmlEscape(name)}</li>`).join("\n");

  return [
    "      <article class=\"card\">",
    "        <div class=\"card-head\">",
    "          <div class=\"when\">",
    `            <strong>Jogo do dia ${htmlEscape(game.date)}</strong>`,
    "            <div class=\"meta\">",
    `              <span class=\"chip\"><span class=\"ico green\"></span> <b>Presentes:</b> ${game.presentes.length}</span>`,
    `              <span class=\"chip\"><span class=\"ico red\"></span> <b>Ausentes:</b> ${game.ausentes.length}</span>`,
    "            </div>",
    "          </div>",
    "        </div>",
    "",
    "        <div class=\"card-body\">",
    "          <div class=\"col present\">",
    `            <h3>Presentes <span class=\"count\">${game.presentes.length}</span></h3>`,
    "            <ol>",
    presentItems,
    "            </ol>",
    "          </div>",
    "",
    "          <div class=\"col absent\">",
    `            <h3>Ausentes <span class=\"count\">${game.ausentes.length}</span></h3>`,
    "            <ul>",
    absentItems,
    "            </ul>",
    "          </div>",
    "        </div>",
    "      </article>",
  ].join("\n");
}

function buildPresenceSummary(rosterNames, games) {
  const counter = new Map(rosterNames.map((name) => [normalizeName(name), 0]));

  for (const game of games) {
    const seen = new Set();
    for (const name of game.presentes) {
      const key = normalizeName(name);
      if (!key || seen.has(key) || !counter.has(key)) {
        continue;
      }
      seen.add(key);
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }

  const groups = [];
  for (let count = games.length; count >= 0; count -= 1) {
    const names = rosterNames.filter((name) => (counter.get(normalizeName(name)) || 0) === count);
    if (names.length === 0) {
      continue;
    }
    groups.push({ count, names });
  }

  return {
    totalPlayers: rosterNames.length,
    groups,
  };
}

function renderSummaryCard(summary, monthLabel, year) {
  const groupsHtml = summary.groups
    .map((group) => {
      const label = `${pluralizeJogos(group.count)}:`;
      return [
        `              <div class="small" style="margin-top:12px;">${htmlEscape(label)}</div>`,
        '              <ul class="presence-list">',
        renderPresenceListItems(group.names, `${group.count}J`),
        "              </ul>",
      ].join("\n");
    })
    .join("\n\n");

  return [
    '      <article class="card">',
    '        <div class="card-head">',
    '          <div class="when">',
    `            <strong>Resumo de Presenças - ${htmlEscape(monthLabel)}/${htmlEscape(year)}</strong>`,
    '            <div class="meta">',
    `              <span class="chip"><span class="ico green"></span> <b>Jogadores fixos:</b> ${summary.totalPlayers}</span>`,
    "            </div>",
    "          </div>",
    "        </div>",
    "",
    '        <div class="card-body">',
    '          <div class="col">',
    '            <h3>Faixas de presença <span class="count">mês completo</span></h3>',
    '            <div style="padding:12px 12px 16px;">',
    groupsHtml,
    "            </div>",
    "          </div>",
    "        </div>",
    "      </article>",
  ].join("\n");
}

function renderWarningsCard(warnings) {
  if (warnings.length === 0) {
    return "";
  }

  const items = warnings.map((warning) => `              <li>${htmlEscape(warning)}</li>`).join("\n");
  return [
    '      <article class="card">',
    '        <div class="card-head">',
    '          <div class="when">',
    "            <strong>Observações da Base</strong>",
    '            <div class="meta">',
    `              <span class="chip"><span class="ico red"></span> <b>Avisos:</b> ${warnings.length}</span>`,
    "            </div>",
    "          </div>",
    "        </div>",
    "",
    '        <div class="card-body">',
    '          <div class="col">',
    '            <h3>Avisos de consistência <span class="count">leitura do TXT</span></h3>',
    "            <ul>",
    items,
    "            </ul>",
    "          </div>",
    "        </div>",
    "      </article>",
  ].join("\n");
}

function renderPage(params) {
  const { monthLabel, monthLabelLower, year, games, summary, footerDate, warnings } = params;
  const cardsHtml = games.map((game) => renderGameCard(game)).join("\n\n");
  const summaryHtml = renderSummaryCard(summary, monthLabel, year);
  const warningsHtml = renderWarningsCard(warnings);
  const warningsBlock = warningsHtml ? `\n\n${warningsHtml}` : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Presenças (${htmlEscape(monthLabel)}/${htmlEscape(year)})</title>
  <style>
    :root{
      --bg1:#0b1020;
      --bg2:#0f1b3a;
      --card:rgba(255,255,255,.08);
      --card2:rgba(255,255,255,.06);
      --stroke:rgba(255,255,255,.14);
      --text:rgba(255,255,255,.92);
      --muted:rgba(255,255,255,.7);
      --green:#1fe58f;
      --red:#ff5d6c;
      --yellow:#ffd166;
      --shadow: 0 20px 60px rgba(0,0,0,.45);
      --radius: 18px;
    }

    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--text);
      background:
        radial-gradient(900px 500px at 20% 10%, rgba(31,229,143,.20), transparent 55%),
        radial-gradient(800px 500px at 85% 15%, rgba(255,93,108,.18), transparent 55%),
        radial-gradient(900px 650px at 50% 95%, rgba(255,209,102,.14), transparent 55%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
      min-height:100vh;
      padding:28px 14px 60px;
    }

    .wrap{
      max-width:1100px;
      margin:0 auto;
    }

    header{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:16px;
      margin-bottom:18px;
    }

    .title{
      display:flex;
      flex-direction:column;
      gap:6px;
    }

    .badge{
      display:inline-flex;
      align-items:center;
      gap:10px;
      width:fit-content;
      padding:8px 12px;
      border-radius:999px;
      background:rgba(255,255,255,.08);
      border:1px solid var(--stroke);
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 30px rgba(0,0,0,.25);
      font-size:13px;
      color:var(--muted);
    }
    .dot{
      width:10px;height:10px;border-radius:50%;
      background: linear-gradient(135deg, var(--green), #3aa0ff);
      box-shadow: 0 0 0 4px rgba(31,229,143,.12);
    }

    h1{
      margin:0;
      font-size:28px;
      line-height:1.15;
      letter-spacing:.2px;
    }
    .subtitle{
      margin:0;
      color:var(--muted);
      font-size:14px;
      line-height:1.45;
      max-width:70ch;
    }

    .legend{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      align-items:center;
      justify-content:flex-end;
      margin-top:6px;
    }
    .pill{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:8px 10px;
      border-radius:999px;
      background:rgba(255,255,255,.07);
      border:1px solid var(--stroke);
      font-size:12px;
      color:var(--muted);
      white-space:nowrap;
    }
    .pill i{
      display:inline-block;
      width:10px;height:10px;border-radius:3px;
    }
    .pill .p{background:rgba(31,229,143,.85)}
    .pill .a{background:rgba(255,93,108,.85)}

    .grid{
      display:grid;
      grid-template-columns: repeat(12, 1fr);
      gap:14px;
    }

    .card{
      grid-column: span 12;
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--card), var(--card2));
      border:1px solid var(--stroke);
      box-shadow: var(--shadow);
      overflow:hidden;
      position:relative;
    }

    .card::before{
      content:"";
      position:absolute;
      inset:0;
      background:
        radial-gradient(400px 180px at 20% 0%, rgba(31,229,143,.12), transparent 60%),
        radial-gradient(360px 170px at 80% 0%, rgba(255,93,108,.10), transparent 60%);
      pointer-events:none;
    }

    .card-head{
      position:relative;
      padding:16px 18px 14px;
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:14px;
      border-bottom:1px solid rgba(255,255,255,.10);
      background:rgba(0,0,0,.10);
      backdrop-filter: blur(10px);
    }

    .when{
      display:flex;
      flex-direction:column;
      gap:6px;
    }
    .when strong{
      font-size:16px;
      letter-spacing:.2px;
    }
    .meta{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      color:var(--muted);
      font-size:12px;
    }
    .chip{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:6px 10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
    }
    .chip b{color:var(--text); font-weight:700}
    .chip .ico{
      width:10px;height:10px;border-radius:50%;
    }
    .ico.green{background:rgba(31,229,143,.85)}
    .ico.red{background:rgba(255,93,108,.85)}

    .card-body{
      position:relative;
      padding:16px 18px 18px;
      display:grid;
      grid-template-columns: repeat(12, 1fr);
      gap:14px;
    }

    .col{
      grid-column: span 12;
      border-radius: 14px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.05);
      overflow:hidden;
    }

    @media (min-width: 860px){
      .col.present{grid-column: span 8;}
      .col.absent{grid-column: span 4;}
      .card{grid-column: span 6;}
    }

    .col h3{
      margin:0;
      padding:12px 12px 10px;
      font-size:13px;
      letter-spacing:.3px;
      text-transform:uppercase;
      color:var(--muted);
      border-bottom:1px solid rgba(255,255,255,.10);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .count{
      font-size:12px;
      padding:4px 8px;
      border-radius:999px;
      background:rgba(255,255,255,.07);
      border:1px solid rgba(255,255,255,.12);
      color:var(--text);
    }

    ol, ul{
      margin:0;
      padding:12px 18px 16px 34px;
      line-height:1.6;
    }
    ul{padding-left:22px}
    li{
      margin:4px 0;
      color:rgba(255,255,255,.9);
    }

    .presence-list{
      list-style:none;
      margin:8px 0 0;
      padding:0;
      display:grid;
      gap:8px;
    }
    .presence-list li{
      margin:0;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      border:1px solid rgba(255,255,255,.12);
      border-radius:12px;
      background:rgba(255,255,255,.04);
      padding:9px 10px;
    }
    .bonus{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:34px;
      padding:3px 8px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.14);
      font-size:12px;
      font-weight:800;
      color:var(--muted);
      background:rgba(255,255,255,.06);
    }

    .small{
      color:var(--muted);
      font-size:12px;
      line-height:1.45;
    }

    footer{
      margin-top:18px;
      color:rgba(255,255,255,.55);
      font-size:12px;
      text-align:center;
    }
    .update-stamp{
      margin-top:6px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="title">
        <div class="badge"><span class="dot"></span> Presenças nos jogos</div>
        <h1>Relatório de Presença</h1>
        <p class="subtitle">
          Lista organizada por jogo com <b>presentes</b> e <b>ausentes</b> do ciclo de ${htmlEscape(monthLabelLower)}.
        </p>
      </div>

      <div class="legend" aria-label="Legenda">
        <span class="pill"><i class="p"></i> Presentes</span>
        <span class="pill"><i class="a"></i> Ausentes</span>
      </div>
    </header>

    <section class="grid">
${cardsHtml}${warningsBlock}

${summaryHtml}
    </section>

    <footer>
      Feito para organizar a resenha com responsabilidade - ${htmlEscape(monthLabel)}/${htmlEscape(year)}
      <div class="update-stamp">Ultima atualizacao: jogo de ${htmlEscape(footerDate)}.</div>
    </footer>
  </div>
</body>
</html>
`;
}

function formatTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function saveWithBackup(filePath, content) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (current === content) {
    return { changed: false, backupPath: "" };
  }

  let backupPath = "";
  if (fs.existsSync(filePath)) {
    backupPath = `${filePath}.bak.${formatTimestamp()}`;
    fs.copyFileSync(filePath, backupPath);
  }

  fs.writeFileSync(filePath, content, "utf8");
  return { changed: true, backupPath };
}

function resolvePaths(args) {
  const root = path.resolve(args.raiz || process.cwd());
  const monthKey = inferMonthKey(args);

  if (!monthKey) {
    throw new Error("Informe --mes, ou forneca --base/--relatorio contendo o nome do mes.");
  }

  const monthDir = path.join(root, `paginas-${monthKey}`);
  if (!fs.existsSync(monthDir)) {
    throw new Error(`Pasta do mes nao encontrada: ${monthDir}`);
  }

  let basePath = args.base ? path.resolve(root, args.base) : "";
  if (!basePath) {
    const candidates = fs
      .readdirSync(monthDir)
      .filter((name) => /^jogos-do-ciclo/i.test(name) && /\.txt$/i.test(name))
      .sort();

    if (candidates.length === 0) {
      throw new Error(`Nenhum arquivo Jogos-do-ciclo*.txt encontrado em ${monthDir}`);
    }

    basePath = path.join(monthDir, candidates[0]);
  }

  const relatorioPath = args.relatorio
    ? path.resolve(root, args.relatorio)
    : path.join(monthDir, `pagina-relatorio-presenca-${monthKey}`);

  return {
    root,
    monthKey,
    monthDir,
    basePath,
    relatorioPath,
  };
}

function formatPreviewGroup(group) {
  return `${group.count}J: ${group.names.join(", ")}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!["preview", "apply"].includes(args.modo)) {
    throw new Error("Parametro --modo invalido. Use preview ou apply.");
  }

  const paths = resolvePaths(args);
  if (!fs.existsSync(paths.basePath)) {
    throw new Error(`Arquivo base nao encontrado: ${paths.basePath}`);
  }

  const baseText = fs.readFileSync(paths.basePath, "utf8");
  const rosterNames = parseRosterList(baseText);
  const games = parseGames(baseText, rosterNames);

  if (games.length === 0) {
    throw new Error("Nenhum jogo encontrado na base de presenca.");
  }

  let selectedGame;
  if (args.data) {
    selectedGame = games.find((game) => game.date === args.data);
    if (!selectedGame) {
      throw new Error(`Jogo nao encontrado para a data ${args.data}.`);
    }
  } else {
    selectedGame = [...games].sort((a, b) => toDateCode(b.date) - toDateCode(a.date))[0];
  }

  const cutoffCode = toDateCode(selectedGame.date);
  const consideredGames = games
    .filter((game) => toDateCode(game.date) <= cutoffCode)
    .sort((a, b) => toDateCode(a.date) - toDateCode(b.date));

  const issues = consideredGames.flatMap((game) => game.issues);
  const warnings = uniqueNames(consideredGames.flatMap((game) => game.warnings));

  if (issues.length > 0 && args.modo === "apply" && !args.forcar) {
    throw new Error(
      "Base de presenca com inconsistencias. A aplicacao foi bloqueada para evitar atualizar o HTML com contagem quebrada.\n\n" +
        issues.map((issue) => `- ${issue}`).join("\n") +
        "\n\nCorrija a base e rode novamente, ou use --forcar se a manutencao for intencional."
    );
  }

  if (issues.length > 0 && args.modo === "preview" && !args.forcar) {
    console.log("----------------------------------------");
    console.log("Resumo da execucao");
    console.log("----------------------------------------");
    console.log(`Mes: ${paths.monthKey}`);
    console.log(`Base alvo: ${path.basename(paths.basePath)}`);
    console.log(`Data limite: ${selectedGame.date}`);
    console.log(`Jogos considerados: ${consideredGames.length}`);
    console.log(`Jogadores fixos: ${rosterNames.length}`);
    console.log("");
    console.log("O preview foi interrompido porque a base de presenca tem inconsistencias.");
    console.log("");
    issues.forEach((issue) => console.log(`- ${issue}`));
    console.log("");
    console.log("Preview interrompido. Corrija a base ou use --forcar para seguir mesmo assim.");
    return;
  }

  const effectiveRoster =
    rosterNames.length > 0
      ? rosterNames
      : uniqueNames(consideredGames.flatMap((game) => [...game.presentes, ...game.ausentes]));
  const summary = buildPresenceSummary(effectiveRoster, consideredGames);
  const year = (selectedGame.date.split("/")[2] || "").trim() || "----";
  const monthLabel = resolveMonthLabel(paths.monthKey);
  const monthLabelLower = monthLabel.toLowerCase();
  const updatedHtml = renderPage({
    monthLabel,
    monthLabelLower,
    year,
    games: consideredGames,
    summary,
    footerDate: selectedGame.date,
    warnings,
  });

  console.log("----------------------------------------");
  console.log("Resumo da execucao");
  console.log("----------------------------------------");
  console.log(`Mes: ${paths.monthKey}`);
  console.log(`Base alvo: ${path.basename(paths.basePath)}`);
  console.log(`Data limite: ${selectedGame.date}`);
  console.log(`Jogos considerados: ${consideredGames.length}`);
  console.log(`Jogadores fixos: ${effectiveRoster.length}`);
  console.log("");
  console.log("Faixas de presenca:");
  summary.groups.forEach((group) => console.log(`- ${formatPreviewGroup(group)}`));

  if (warnings.length > 0) {
    console.log("");
    console.log("Avisos:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }

  if (issues.length > 0) {
    console.log("");
    console.log("Aviso: execucao forcada com inconsistencias na base:");
    issues.forEach((issue) => console.log(`- ${issue}`));
  }

  if (args.modo === "preview") {
    console.log("");
    console.log("Preview concluido. Nenhum arquivo foi alterado.");
    return;
  }

  const saveResult = saveWithBackup(paths.relatorioPath, updatedHtml);
  console.log("");
  console.log(
    `Arquivo de presenca: ${saveResult.changed ? "alterado" : "sem alteracao"}${
      saveResult.backupPath ? ` (backup: ${saveResult.backupPath})` : ""
    }`
  );
}

try {
  main();
} catch (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}
