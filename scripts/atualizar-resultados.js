#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    mes: "marco",
    modo: "preview",
    data: "",
    forcar: false,
    reaplicarExistente: false,
    raiz: DEFAULT_PROJECT_ROOT,
    base: "",
    resultados: "",
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
    if (token === "--reaplicar-existente") {
      args.reaplicarExistente = true;
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
      case "--base":
        args.base = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--resultados":
        args.resultados = (value || "").trim();
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
    "  node scripts/atualizar-resultados.js --mes marco --data 14/03/2026 --modo preview",
    "  node scripts/atualizar-resultados.js --mes marco --data 14/03/2026 --modo apply",
    "",
    "Parametros:",
    "  --mes                   Pasta do mes (default: marco)",
    "  --data                  Data do jogo no formato DD/MM/AAAA (default: ultimo jogo da base)",
    "  --modo                  preview | apply (default: preview)",
    "  --forcar                Forca operacoes que nao sejam bloqueadas por seguranca de duplicidade",
    "  --reaplicar-existente   Permite substituir uma data ja existente, mas so junto com --forcar",
    "  --raiz                  Caminho raiz do projeto (default: pasta do projeto)",
    "  --base                  Caminho relativo do arquivo base .txt",
    "  --resultados            Caminho relativo do arquivo de resultados",
    "",
    "Comportamento:",
    "  - preview: mostra o resumo da alteracao sem salvar arquivos",
    "  - apply: salva o arquivo de resultados e cria backup .bak.<timestamp>",
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
  ].map(([alias, canonical]) => [normalizeRawName(alias), canonical])
);

function cleanName(rawLine) {
  let text = (rawLine || "").replace(/\u00a0/g, " ").trim();
  if (!text) return "";
  if (/^[-#]+$/.test(text)) return "";

  text = text.replace(/^\d+\s*[-.)]\s*/, "");
  text = text.replace(/^[-]\s*/, "");
  text = text.replace(/\s*\+\s*\d+\s*PONTOS?.*$/i, "");
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return "";
  if (/^jogadores\s+do\s+time/i.test(text)) return "";
  if (/^resultado/i.test(text)) return "";
  if (/^presentes:?$/i.test(text)) return "";
  if (/^ausentes:?$/i.test(text)) return "";
  if (/^ciclo\s+finalizado$/i.test(text)) return "";
  if (/^conferencia:?$/i.test(text)) return "";
  if (/^status\s*:/i.test(text)) return "";
  if (/^soma\s+time\s+/i.test(text)) return "";

  return text;
}

function canonicalizePlayerName(name) {
  const cleaned = cleanName(name);
  if (!cleaned) return "";
  const canonical = PLAYER_NAME_ALIASES.get(normalizeRawName(cleaned));
  return canonical || cleaned;
}

function normalizeName(name) {
  const cleaned = canonicalizePlayerName(name);
  return normalizeRawName(cleaned);
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

function validateGamePlayers(game) {
  const presentesByKey = new Map();
  const ausentesByKey = new Map();
  const validationErrors = [];

  for (const name of game.presentes) {
    const key = normalizeName(name);
    if (!key || presentesByKey.has(key)) continue;
    presentesByKey.set(key, canonicalizePlayerName(name));
  }

  for (const name of game.ausentes) {
    const key = normalizeName(name);
    if (!key || ausentesByKey.has(key)) continue;
    ausentesByKey.set(key, canonicalizePlayerName(name));
  }

  for (const [key, name] of presentesByKey.entries()) {
    if (ausentesByKey.has(key)) {
      validationErrors.push(`${name} aparece em Presentes e Ausentes ao mesmo tempo.`);
    }
  }

  const assignedTeamByKey = new Map();

  function sanitizeTeam(names, team) {
    const sanitized = [];

    for (const rawName of names) {
      const displayName = canonicalizePlayerName(rawName);
      const key = normalizeName(displayName);
      if (!key) continue;

      const presentName = presentesByKey.get(key);
      const absentName = ausentesByKey.get(key);
      const canonicalName = presentName || absentName || displayName;

      if (absentName) {
        validationErrors.push(`${canonicalName} aparece no time ${team} mas esta em Ausentes.`);
        continue;
      }

      if (!presentName) {
        validationErrors.push(`${canonicalName} aparece no time ${team} mas nao esta em Presentes.`);
        continue;
      }

      const previousTeam = assignedTeamByKey.get(key);
      if (previousTeam) {
        validationErrors.push(`${canonicalName} aparece nos dois times (${previousTeam} e ${team}).`);
        continue;
      }

      assignedTeamByKey.set(key, team);
      sanitized.push(presentName);
    }

    return sanitized;
  }

  const playersPreto = sanitizeTeam(game.playersPreto, "PRETO");
  const playersLaranja = sanitizeTeam(game.playersLaranja, "LARANJA");

  for (const [key, name] of presentesByKey.entries()) {
    if (!assignedTeamByKey.has(key)) {
      validationErrors.push(`${name} esta em Presentes mas nao foi alocado em nenhum time.`);
    }
  }

  return {
    presentes: [...presentesByKey.values()],
    ausentes: [...ausentesByKey.values()],
    playersPreto,
    playersLaranja,
    validationErrors: [...new Set(validationErrors)],
  };
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

  const names = segment
    .split(/\r?\n/)
    .map((line) => cleanName(line))
    .filter(Boolean);

  return uniqueNames(names);
}

function parseTeamPlayers(block, team, date) {
  const regex = new RegExp(
    "JOGADORES\\s+DO\\s+TIME\\s+" +
      team +
      "\\s+NO\\s+Jogo\\s+do\\s+dia\\s+" +
      escapeRegExp(date) +
      "([\\s\\S]*?)(?=JOGADORES\\s+DO\\s+TIME|#{5,}|[-]{4,}|CICLO\\s+FINALIZADO|Jogo\\s+do\\s+dia|$)",
    "i"
  );

  const match = block.match(regex);
  if (!match) return [];

  const lines = match[1]
    .split(/\r?\n/)
    .map((line) => cleanName(line))
    .filter(Boolean);

  return uniqueNames(lines);
}

function parseWinner(winnerRaw, scorePreto, scoreLaranja) {
  const raw = (winnerRaw || "").toUpperCase();
  if (raw.includes("PRETO")) return "PRETO";
  if (raw.includes("LARANJA")) return "LARANJA";
  if (raw.includes("EMPATE")) return "EMPATE";

  if (scorePreto > scoreLaranja) return "PRETO";
  if (scoreLaranja > scorePreto) return "LARANJA";
  return "EMPATE";
}

function toDateCode(brDate) {
  const parts = (brDate || "").split("/");
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts.map((v) => Number(v));
  if (!dd || !mm || !yyyy) return 0;
  return yyyy * 10000 + mm * 100 + dd;
}

function parseGames(baseText) {
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

    const scorePretoMatch = block.match(/TIME PRETO:\s*(\d+)\s*GOLS/i);
    const scoreLaranjaMatch = block.match(/TIME LARANJA:\s*(\d+)\s*GOLS/i);
    const winnerRawMatch = block.match(/TIME VENCEDOR\s*=\s*(.+)/i);

    const scorePreto = scorePretoMatch ? Number(scorePretoMatch[1]) : 0;
    const scoreLaranja = scoreLaranjaMatch ? Number(scoreLaranjaMatch[1]) : 0;
    const winnerRaw = winnerRawMatch ? winnerRawMatch[1].trim() : "";

    const presentes = parseNumberedList(block, /Presentes\s*:/i, /Ausentes\s*:?/i);
    const ausentes = parseNumberedList(block, /Ausentes\s*:?/i, /[-]{4,}|RESULTADO\s+do\s+dia/i);
    const validatedGame = validateGamePlayers({
      date: current.date,
      presentes,
      ausentes,
      playersPreto: parseTeamPlayers(block, "PRETO", current.date),
      playersLaranja: parseTeamPlayers(block, "LARANJA", current.date),
    });

    games.push({
      date: current.date,
      scorePreto,
      scoreLaranja,
      winnerRaw,
      winner: parseWinner(winnerRaw, scorePreto, scoreLaranja),
      presentes: validatedGame.presentes,
      ausentes: validatedGame.ausentes,
      playersPreto: validatedGame.playersPreto,
      playersLaranja: validatedGame.playersLaranja,
      validationErrors: validatedGame.validationErrors,
      block,
    });
  }

  return games;
}

function htmlEscape(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureMatchSeparatorCss(resultsHtml) {
  if (/\.match\s*\+\s*\.match\s*\{/.test(resultsHtml)) {
    return resultsHtml;
  }

  const block = [
    "    .match + .match{",
    "      margin-top:18px;",
    "      padding-top:18px;",
    "      border-top:1px solid rgba(255,255,255,.14);",
    "    }",
    "",
  ].join("\n");

  if (/\n\s*@media \(min-width: 860px\)\{/.test(resultsHtml)) {
    return resultsHtml.replace(/\n\s*@media \(min-width: 860px\)\{/, `\n\n${block}    @media (min-width: 860px){`);
  }

  return resultsHtml.replace(/<\/style>/i, `${block}</style>`);
}

function ensureDrawCss(resultsHtml) {
  if (/\.winner\.draw\s*\{/.test(resultsHtml)) {
    return resultsHtml;
  }

  const drawCss = [
    "    .winner.draw{",
    "      border-color:rgba(255,255,255,.32);",
    "      background:rgba(255,255,255,.08);",
    "      color:var(--text);",
    "      box-shadow:none;",
    "      animation:none;",
    "    }",
    "",
  ].join("\n");

  if (/\n\s*@keyframes winnerPulse\{/.test(resultsHtml)) {
    return resultsHtml.replace(/\n\s*@keyframes winnerPulse\{/, `\n${drawCss}    @keyframes winnerPulse{`);
  }

  return resultsHtml.replace(/<\/style>/i, `${drawCss}</style>`);
}

function buildCanonicalNameMap(game) {
  const map = new Map();
  const names = [
    ...game.presentes,
    ...game.ausentes,
    ...game.playersPreto,
    ...game.playersLaranja,
  ];

  for (const rawName of names) {
    const canonical = canonicalizePlayerName(rawName);
    const key = normalizeName(canonical);
    if (!canonical || !key || map.has(key)) {
      continue;
    }
    map.set(key, canonical);
  }

  return map;
}

function renderPlayerList(names, pointsPerPlayer, nameByNormalized) {
  return names
    .map((rawName) => {
      const key = normalizeName(rawName);
      const name = key && nameByNormalized.has(key) ? nameByNormalized.get(key) : canonicalizePlayerName(rawName);

      if (pointsPerPlayer === 0) {
        return `              <li><span>${htmlEscape(name)}</span><span class="pts zero">0 ponto</span></li>`;
      }

      const text = pointsPerPlayer === 1 ? "+1 ponto" : "+3 pontos";
      return `              <li><span>${htmlEscape(name)}</span><span class="pts">${text}</span></li>`;
    })
    .join("\n");
}

function renderMatchSection(game, nameByNormalized) {
  let winnerBanner = "";
  let tagPreto = "derrota";
  let tagLaranja = "derrota";
  let pontosPreto = 0;
  let pontosLaranja = 0;

  if (game.winner === "PRETO") {
    winnerBanner = '<div class="winner">Vencedor: Time Preto <span class="teamEmoji" aria-hidden="true">⚫</span></div>';
    tagPreto = "+3 por jogador";
    pontosPreto = 3;
  } else if (game.winner === "LARANJA") {
    winnerBanner = '<div class="winner">Vencedor: Time Laranja <span class="teamEmoji" aria-hidden="true">🟠</span></div>';
    tagLaranja = "+3 por jogador";
    pontosLaranja = 3;
  } else {
    winnerBanner = '<div class="winner draw">Empate: nao houve time vencedor</div>';
    tagPreto = "+1 por jogador";
    tagLaranja = "+1 por jogador";
    pontosPreto = 1;
    pontosLaranja = 1;
  }

  return [
    "      <section class=\"match\">",
    `        <h2>Jogo do dia ${game.date}</h2>`,
    "        <div class=\"score\">",
    "          <div class=\"teamBox black\">",
    "            <span class=\"teamName\">Time Preto</span>",
    `            <strong class=\"goals\">${game.scorePreto}</strong>`,
    "          </div>",
    "          <div class=\"versus\">x</div>",
    "          <div class=\"teamBox orange\">",
    "            <span class=\"teamName\">Time Laranja</span>",
    `            <strong class=\"goals\">${game.scoreLaranja}</strong>`,
    "          </div>",
    "        </div>",
    "",
    `        ${winnerBanner}`,
    "",
    "        <div class=\"cols\">",
    "          <article class=\"teamCard\">",
    "            <div class=\"teamTitle\">",
    "              <strong>Jogadores do Time Preto</strong>",
    `              <span class=\"tag\">${tagPreto}</span>`,
    "            </div>",
    "            <ul>",
    renderPlayerList(game.playersPreto, pontosPreto, nameByNormalized),
    "            </ul>",
    "          </article>",
    "",
    "          <article class=\"teamCard\">",
    "            <div class=\"teamTitle\">",
    "              <strong>Jogadores do Time Laranja</strong>",
    `              <span class=\"tag\">${tagLaranja}</span>`,
    "            </div>",
    "            <ul>",
    renderPlayerList(game.playersLaranja, pontosLaranja, nameByNormalized),
    "            </ul>",
    "          </article>",
    "        </div>",
    "      </section>",
  ].join("\n");
}

function findMatchSection(resultsHtml, date) {
  const sections = resultsHtml.match(/<section class="match">[\s\S]*?<\/section>/g) || [];
  const dateRegex = new RegExp(`<h2>\\s*Jogo do dia\\s*${escapeRegExp(date)}\\s*<\\/h2>`, "i");
  return sections.find((section) => dateRegex.test(section)) || "";
}

function updateResultsHtml(resultsHtml, game, overwriteExisting) {
  let html = ensureMatchSeparatorCss(resultsHtml);
  if (game.winner === "EMPATE") {
    html = ensureDrawCss(html);
  }

  const nameByNormalized = buildCanonicalNameMap(game);
  const section = renderMatchSection(game, nameByNormalized);
  const existingSection = findMatchSection(html, game.date);

  if (existingSection) {
    if (!overwriteExisting) {
      return { html, action: "unchanged" };
    }
    return {
      html: html.replace(existingSection, section),
      action: "replaced",
    };
  }

  const insertIndex = html.lastIndexOf("\n    </section>");
  if (insertIndex < 0) {
    throw new Error("Nao foi possivel encontrar o fechamento da secao principal de resultados.");
  }

  return {
    html: html.slice(0, insertIndex) + "\n\n" + section + "\n" + html.slice(insertIndex),
    action: "inserted",
  };
}

function formatTimestamp() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
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
  const current = fs.readFileSync(filePath, "utf8");
  if (current === content) {
    return { changed: false, backupPath: "" };
  }

  const backupPath = `${filePath}.bak.${formatTimestamp()}`;
  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(filePath, content, "utf8");
  return { changed: true, backupPath };
}

function resolvePaths(args) {
  const root = path.resolve(args.raiz || process.cwd());
  const monthDir = path.join(root, `paginas-${args.mes}`);

  if (!fs.existsSync(monthDir)) {
    throw new Error(`Pasta do mes nao encontrada: ${monthDir}`);
  }

  let basePath = args.base ? path.resolve(root, args.base) : "";
  if (!basePath) {
    const candidates = fs
      .readdirSync(monthDir)
      .filter((name) => name.toLowerCase().startsWith("jogos-do-ciclo") && name.toLowerCase().endsWith(".txt"))
      .sort();

    if (candidates.length === 0) {
      throw new Error(`Nenhum arquivo Jogos-do-ciclo*.txt encontrado em ${monthDir}`);
    }

    basePath = path.join(monthDir, candidates[0]);
  }

  const resultsPath = args.resultados
    ? path.resolve(root, args.resultados)
    : path.join(monthDir, "resultados");

  return {
    root,
    monthDir,
    basePath,
    resultsPath,
  };
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
  if (!fs.existsSync(paths.basePath)) throw new Error(`Arquivo base nao encontrado: ${paths.basePath}`);
  if (!fs.existsSync(paths.resultsPath)) throw new Error(`Arquivo resultados nao encontrado: ${paths.resultsPath}`);

  const baseText = fs.readFileSync(paths.basePath, "utf8");
  const games = parseGames(baseText);
  if (games.length === 0) {
    throw new Error("Nenhum jogo encontrado no arquivo base.");
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

  if (selectedGame.playersPreto.length === 0 && selectedGame.playersLaranja.length === 0) {
    throw new Error("Nao foi possivel extrair jogadores do jogo selecionado na base.");
  }

  if (selectedGame.validationErrors.length > 0) {
    throw new Error(
      `O jogo ${selectedGame.date} tem inconsistencias entre Presentes/Ausentes e os times:\n- ${selectedGame.validationErrors.join(
        "\n- "
      )}`
    );
  }

  const resultsHtmlOriginal = fs.readFileSync(paths.resultsPath, "utf8");
  const alreadyInResults = Boolean(findMatchSection(resultsHtmlOriginal, selectedGame.date));
  const explicitDuplicateOverride = args.forcar && args.reaplicarExistente;

  if (alreadyInResults && args.reaplicarExistente && !args.forcar) {
    throw new Error(
      `A data ${selectedGame.date} ja existe em resultados. Para reaplicar uma data existente, use --forcar e --reaplicar-existente juntos.`
    );
  }

  if (alreadyInResults && args.modo === "apply" && !explicitDuplicateOverride) {
    throw new Error(
      `A data ${selectedGame.date} ja existe em resultados. O script bloqueou o apply para evitar duplicidade acidental. Se voce realmente quiser substituir esta mesma data, use --forcar --reaplicar-existente.`
    );
  }

  if (alreadyInResults && args.modo === "preview" && !explicitDuplicateOverride) {
    console.log("----------------------------------------");
    console.log("Resumo da execucao");
    console.log("----------------------------------------");
    console.log(`Mes: ${args.mes}`);
    console.log(`Data selecionada: ${selectedGame.date}`);
    console.log(`Placar: Preto ${selectedGame.scorePreto} x ${selectedGame.scoreLaranja} Laranja`);
    console.log(`Vencedor: ${selectedGame.winner}`);
    console.log(`Jogadores Preto: ${selectedGame.playersPreto.length}`);
    console.log(`Jogadores Laranja: ${selectedGame.playersLaranja.length}`);
    console.log("Jogo ja presente em resultados: sim");
    console.log("");
    console.log("Preview seguro: nenhuma alteracao foi simulada para evitar duplicidade.");
    console.log("Se voce realmente quiser substituir essa mesma data, use --forcar --reaplicar-existente.");
    return;
  }

  const updated = updateResultsHtml(resultsHtmlOriginal, selectedGame, explicitDuplicateOverride);

  console.log("----------------------------------------");
  console.log("Resumo da execucao");
  console.log("----------------------------------------");
  console.log(`Mes: ${args.mes}`);
  console.log(`Data selecionada: ${selectedGame.date}`);
  console.log(`Placar: Preto ${selectedGame.scorePreto} x ${selectedGame.scoreLaranja} Laranja`);
  console.log(`Vencedor: ${selectedGame.winner}`);
  console.log(`Jogadores Preto: ${selectedGame.playersPreto.length}`);
  console.log(`Jogadores Laranja: ${selectedGame.playersLaranja.length}`);
  console.log(`Jogo ja presente em resultados: ${alreadyInResults ? "sim" : "nao"}`);
  console.log(`Acao prevista: ${updated.action === "replaced" ? "substituir bloco existente" : "inserir novo bloco"}`);

  if (args.modo === "preview") {
    console.log("");
    console.log("Preview concluido. Nenhum arquivo foi alterado.");
    return;
  }

  const saveResult = saveWithBackup(paths.resultsPath, updated.html);

  console.log("");
  console.log("Arquivo atualizado:");
  console.log(
    `- Resultados: ${saveResult.changed ? "alterado" : "sem alteracao"}${
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
