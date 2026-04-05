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

const PLAYER_NAME_ALIASES = new Map(
  [
    ["cleber", "Cleberson"],
    ["cleberson", "Cleberson"],
    ["tacio", "Tácio"],
    ["rogerio", "Rogério"],
    ["henirque", "Henrique"],
    ["lionel henrique", "Henrique"],
    ["lionel henirque", "Henrique"],
  ].map(([alias, canonical]) => [alias, canonical])
);

function parseArgs(argv) {
  const args = {
    mes: "",
    modo: "preview",
    raiz: DEFAULT_PROJECT_ROOT,
    base: "",
    times: "",
    linhas: 47,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      args.help = true;
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
      case "--raiz":
        args.raiz = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--base":
        args.base = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--times":
        args.times = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--linhas":
        args.linhas = Number(value || 0);
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
    "  node scripts/atualizar-times-fixos.js --mes abril --modo preview",
    "  node scripts/atualizar-times-fixos.js --mes abril --modo apply",
    "  node scripts/atualizar-times-fixos.js --mes abril --modo apply --linhas 47",
    "",
    "Parametros:",
    "  --mes     Mes alvo (ex: fevereiro, marco, abril)",
    "  --modo    preview | apply (default: preview)",
    "  --raiz    Caminho raiz do projeto (default: pasta do projeto)",
    "  --base    Caminho relativo do arquivo Jogos-do-ciclo*.txt",
    "  --times   Caminho relativo da pagina alvo (default: paginas-{mes}/times-fixos-{mes})",
    "  --linhas  Quantidade de linhas lidas da base (default: 47)",
    "",
    "Comportamento:",
    "  - Le apenas o topo do Jogos-do-ciclo do mes, conforme o limite em --linhas",
    "  - Extrai a lista oficial, o Time Preto e o Time Laranja",
    "  - Atualiza a pagina times-fixos do mes preservando o layout atual",
    "  - preview: valida e mostra o resumo sem salvar",
    "  - apply: salva o HTML atualizado e cria backup .bak.<timestamp>",
  ].join("\n");
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

function canonicalizePlayerName(name) {
  const cleaned = String(name || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return PLAYER_NAME_ALIASES.get(normalizeRawName(cleaned)) || cleaned;
}

function normalizeName(name) {
  return normalizeRawName(canonicalizePlayerName(name));
}

function inferMonthKey(args) {
  if (args.mes) {
    return normalizeRawName(args.mes).replace(/\s+/g, "");
  }

  const candidates = [args.base, args.times].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeRawName(candidate);
    for (const monthKey of Object.keys(MONTH_LABELS)) {
      if (normalized.includes(monthKey)) {
        return monthKey;
      }
    }
  }

  return "";
}

function resolveMonthLabel(monthKey) {
  return MONTH_LABELS[monthKey] || monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
}

function resolvePaths(args) {
  const root = path.resolve(args.raiz || process.cwd());
  const monthKey = inferMonthKey(args);

  if (!monthKey) {
    throw new Error("Informe --mes, ou forneca --base/--times contendo o nome do mes.");
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

  const timesPath = args.times
    ? path.resolve(root, args.times)
    : path.join(monthDir, `times-fixos-${monthKey}`);

  return {
    root,
    monthKey,
    monthDir,
    basePath,
    timesPath,
  };
}

function readFirstLines(filePath, limit) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).slice(0, limit);
}

function isSeparatorLine(line) {
  return /^[-#_ ]+$/.test((line || "").trim());
}

function cleanRosterLine(line) {
  const cleaned = String(line || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (isSeparatorLine(cleaned)) return "";
  if (/^lista com todos jogadores da patota:?$/i.test(cleaned)) return "";
  if (/^times fixo m[eê]s de/i.test(cleaned)) return "";
  if (/^time preto$/i.test(cleaned)) return "";
  if (/^time laranja$/i.test(cleaned)) return "";
  if (/^jogos e datas:?$/i.test(cleaned)) return "";
  return cleaned;
}

function buildRosterMap(lines) {
  const roster = [];
  const seen = new Set();

  for (const line of lines) {
    const cleaned = cleanRosterLine(line);
    const key = normalizeName(cleaned);
    if (!cleaned || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    roster.push(canonicalizePlayerName(cleaned));
  }

  return new Map(roster.map((name) => [normalizeName(name), name]));
}

function parseTeamEntry(line, rosterMap) {
  const cleaned = cleanRosterLine(line);
  if (!cleaned) return null;

  const isCaptain = /\(\s*capit[aã]o\s*\)/i.test(cleaned);
  const baseName = cleaned.replace(/\s*-\s*\(\s*capit[aã]o\s*\)\s*$/i, "").trim();
  const canonical = rosterMap.get(normalizeName(baseName)) || canonicalizePlayerName(baseName);

  return {
    name: canonical,
    isCaptain,
  };
}

function parseTopBlock(lines) {
  const rosterHeaderIndex = lines.findIndex((line) => /lista com todos jogadores da patota/i.test(line));
  const teamsHeaderIndex = lines.findIndex((line) => /times fixo m[eê]s de/i.test(line));
  const pretoIndex = lines.findIndex((line) => /^time preto$/i.test((line || "").trim()));
  const laranjaIndex = lines.findIndex((line) => /^time laranja$/i.test((line || "").trim()));

  if (rosterHeaderIndex === -1 || teamsHeaderIndex === -1 || pretoIndex === -1 || laranjaIndex === -1) {
    throw new Error("Nao foi possivel localizar os blocos de lista oficial e times fixos no topo da base.");
  }

  const rosterMap = buildRosterMap(lines.slice(rosterHeaderIndex + 1, teamsHeaderIndex));
  const rosterCount = rosterMap.size;

  const pretoLines = lines.slice(pretoIndex + 1, laranjaIndex);
  const laranjaLines = lines.slice(laranjaIndex + 1);

  const preto = pretoLines
    .map((line) => parseTeamEntry(line, rosterMap))
    .filter(Boolean);

  const laranja = laranjaLines
    .map((line) => parseTeamEntry(line, rosterMap))
    .filter(Boolean);

  if (preto.length === 0 || laranja.length === 0) {
    throw new Error("Um dos times ficou vazio ao parsear o topo da base. Ajuste --linhas ou revise o TXT.");
  }

  const allPlayers = [...preto, ...laranja];
  const uniquePlayers = new Set(allPlayers.map((player) => normalizeName(player.name)));
  if (uniquePlayers.size !== allPlayers.length) {
    throw new Error("Existem jogadores repetidos entre Time Preto e Time Laranja no bloco de times fixos.");
  }

  if (rosterCount > 0 && uniquePlayers.size !== rosterCount) {
    throw new Error(
      `A lista oficial tem ${rosterCount} jogadores, mas os times extraidos somaram ${uniquePlayers.size}. Ajuste --linhas ou revise a base.`
    );
  }

  return {
    rosterCount: rosterCount || uniquePlayers.size,
    preto,
    laranja,
  };
}

function parseYear(targetHtml) {
  const match = String(targetHtml || "").match(/\b(20\d{2})\b/);
  return match ? match[1] : String(new Date().getFullYear());
}

function renderTeamList(players) {
  return players
    .map((player) =>
      player.isCaptain
        ? `                <li><span class="captain">${player.name} (Capitão)</span></li>`
        : `                <li>${player.name}</li>`
    )
    .join("\n");
}

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`Nao foi possivel localizar o trecho de ${label} no HTML alvo.`);
  }
  return content.replace(pattern, replacement);
}

function buildUpdatedHtml(targetHtml, data, monthLabel, year) {
  const titleMonthUpper = monthLabel.toUpperCase();
  const subtitle = "Escalação dos times fixos do mês.";
  const blackList = renderTeamList(data.preto);
  const orangeList = renderTeamList(data.laranja);

  let updated = targetHtml;

  updated = replaceRequired(
    updated,
    /<title>[^<]*<\/title>/i,
    `<title>Times Fixos - ${titleMonthUpper}/${year}</title>`,
    "title"
  );

  updated = replaceRequired(
    updated,
    /<h1>[\s\S]*?<\/h1>/,
    `<h1>Times - ${titleMonthUpper} ${year}</h1>`,
    "cabecalho"
  );

  updated = replaceRequired(
    updated,
    /<p class="subtitle">[\s\S]*?<\/p>/,
    `        <p class="subtitle">\n          ${subtitle}\n        </p>`,
    "subtitulo"
  );

  updated = replaceRequired(
    updated,
    /<div class="meta" aria-label="Resumo">[\s\S]*?<\/div>/,
    [
      '          <div class="meta" aria-label="Resumo">',
      `            <span class="chip"><span class="ico black"></span> <b>Time Preto:</b> ${data.preto.length}</span>`,
      `            <span class="chip"><span class="ico orange"></span> <b>Time Laranja:</b> ${data.laranja.length}</span>`,
      `            <span class="chip"><span class="ico blue"></span> <b>Total:</b> ${data.rosterCount} jogadores</span>`,
      "          </div>",
    ].join("\n"),
    "resumo"
  );

  updated = replaceRequired(
    updated,
    /(<section class="team black" aria-label="Time Preto">[\s\S]*?<ol>)[\s\S]*?(<\/ol>[\s\S]*?<\/section>)/,
    (_, start, end) => `${start}\n${blackList}\n              ${end}`,
    "lista do Time Preto"
  );

  updated = replaceRequired(
    updated,
    /(<section class="team orange" aria-label="Time Laranja">[\s\S]*?<ol>)[\s\S]*?(<\/ol>[\s\S]*?<\/section>)/,
    (_, start, end) => `${start}\n${orangeList}\n              ${end}`,
    "lista do Time Laranja"
  );

  updated = replaceRequired(
    updated,
    /<footer>[\s\S]*?<\/footer>/,
    `    <footer>\n      Atualizado com base no ciclo de ${monthLabel}/${year}.\n    </footer>`,
    "rodape"
  );

  return updated;
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

function formatPreviewTeam(label, players) {
  const names = players.map((player) => (player.isCaptain ? `${player.name} (Capitão)` : player.name));
  return `${label} (${players.length}): ${names.join(", ")}`;
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

  if (!Number.isInteger(args.linhas) || args.linhas <= 0) {
    throw new Error("Parametro --linhas invalido. Informe um inteiro maior que zero.");
  }

  const paths = resolvePaths(args);
  if (!fs.existsSync(paths.basePath)) {
    throw new Error(`Arquivo base nao encontrado: ${paths.basePath}`);
  }
  if (!fs.existsSync(paths.timesPath)) {
    throw new Error(`Pagina alvo nao encontrada: ${paths.timesPath}`);
  }

  const topLines = readFirstLines(paths.basePath, args.linhas);
  const parsed = parseTopBlock(topLines);
  const currentHtml = fs.readFileSync(paths.timesPath, "utf8");
  const year = parseYear(currentHtml);
  const monthLabel = resolveMonthLabel(paths.monthKey);
  const updatedHtml = buildUpdatedHtml(currentHtml, parsed, monthLabel, year);

  console.log("----------------------------------------");
  console.log("Resumo da execucao");
  console.log("----------------------------------------");
  console.log(`Mes: ${paths.monthKey}`);
  console.log(`Base alvo: ${path.basename(paths.basePath)}`);
  console.log(`Pagina alvo: ${path.relative(paths.root, paths.timesPath)}`);
  console.log(`Linhas consideradas: ${args.linhas}`);
  console.log(`Total oficial: ${parsed.rosterCount}`);
  console.log(formatPreviewTeam("Time Preto", parsed.preto));
  console.log(formatPreviewTeam("Time Laranja", parsed.laranja));

  if (args.modo === "preview") {
    console.log("");
    console.log("Preview concluido. Nenhum arquivo foi alterado.");
    return;
  }

  const saveResult = saveWithBackup(paths.timesPath, updatedHtml);
  console.log("");
  console.log(
    `Arquivo de times fixos: ${saveResult.changed ? "alterado" : "sem alteracao"}${
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
