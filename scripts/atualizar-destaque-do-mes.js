#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");

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
    raiz: DEFAULT_PROJECT_ROOT,
    destaque: "",
    relatorio: "",
    modelo: "paginas-fevereiro/destaque-do-mes",
    vencedor: "",
    votos: "",
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
      case "--destaque":
        args.destaque = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--relatorio":
        args.relatorio = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--modelo":
        args.modelo = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--vencedor":
        args.vencedor = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--votos":
        args.votos = (value || "").trim();
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
    "  node scripts/atualizar-destaque-do-mes.js --mes marco --modo preview",
    "  node scripts/atualizar-destaque-do-mes.js --mes marco --modo apply",
    "  node scripts/atualizar-destaque-do-mes.js --mes marco --modo apply --vencedor Leone --votos 3",
    "",
    "Parametros:",
    "  --mes       Mes alvo (ex: fevereiro, marco)",
    "  --modo      preview | apply (default: preview)",
    "  --raiz      Caminho raiz do projeto (default: pasta do projeto)",
    "  --destaque  Caminho relativo do HTML alvo (default: paginas-{mes}/destaque-do-mes)",
    "  --relatorio Caminho relativo do relatorio de presenca (default: paginas-{mes}/pagina-relatorio-presenca-{mes})",
    "  --modelo    Caminho relativo do modelo visual (default: paginas-fevereiro/destaque-do-mes)",
    "  --vencedor  Nome do vencedor (opcional; se omitido, o script pergunta)",
    "  --votos     Total de votos do vencedor (opcional; se omitido, o script pergunta)",
    "",
    "Comportamento:",
    "  - Le os elegiveis diretamente do bloco '4 jogos' do relatorio de presenca do mes",
    "  - Ordena os elegiveis em ordem alfabetica",
    "  - Usa o HTML de fevereiro como modelo visual",
    "  - preview: valida os dados e mostra o resumo sem salvar",
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

const PLAYER_NAME_ALIASES = new Map(
  [
    ["Cleber", "Cleberson"],
    ["Henirque", "Henrique"],
    ["Lionel Henrique", "Henrique"],
    ["Lionel Henirque", "Henrique"],
  ].map(([alias, canonical]) => [normalizeRawName(alias), canonical])
);

function cleanName(rawValue) {
  return String(rawValue || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
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

  for (const name of names) {
    const canonical = canonicalizePlayerName(name);
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

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&atilde;/gi, "ã")
    .replace(/&aacute;/gi, "á")
    .replace(/&agrave;/gi, "à")
    .replace(/&acirc;/gi, "â")
    .replace(/&eacute;/gi, "é")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&otilde;/gi, "õ")
    .replace(/&uacute;/gi, "ú");
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || "").replace(/<[^>]*>/g, " "));
}

function inferMonthKey(args) {
  if (args.mes) {
    return normalizeRawName(args.mes).replace(/\s+/g, "");
  }

  const candidates = [args.relatorio, args.destaque].filter(Boolean);
  for (const candidate of candidates) {
    const basename = path.basename(candidate);
    const match = basename.match(/(?:pagina-relatorio-presenca-|paginas-)([^.\\/]+)/i);
    if (match) {
      return normalizeRawName(match[1]).replace(/\s+/g, "");
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
    throw new Error("Informe --mes, ou forneca --relatorio/--destaque contendo o nome do mes.");
  }

  const monthDir = path.join(root, `paginas-${monthKey}`);
  if (!fs.existsSync(monthDir)) {
    throw new Error(`Pasta do mes nao encontrada: ${monthDir}`);
  }

  return {
    root,
    monthKey,
    monthDir,
    relatorioPath: args.relatorio
      ? path.resolve(root, args.relatorio)
      : path.join(monthDir, `pagina-relatorio-presenca-${monthKey}`),
    destaquePath: args.destaque
      ? path.resolve(root, args.destaque)
      : path.join(monthDir, "destaque-do-mes"),
    modeloPath: path.resolve(root, args.modelo),
  };
}

function parseYearFromReport(reportHtml) {
  const titleMatch = reportHtml.match(/<title>[^<]*\([^/]+\/(\d{4})\)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1];
  }

  const dateMatch = reportHtml.match(/\b\d{2}\/\d{2}\/(\d{4})\b/);
  if (dateMatch) {
    return dateMatch[1];
  }

  return String(new Date().getFullYear());
}

function parseEligibleNames(reportHtml) {
  const fourGamesMatch = reportHtml.match(
    /<div class="small"[^>]*>\s*4 jogos:\s*<\/div>\s*<ul class="presence-list">([\s\S]*?)<\/ul>/i
  );

  if (!fourGamesMatch) {
    throw new Error("Nao foi possivel localizar o bloco '4 jogos' no relatorio de presenca.");
  }

  const names = [];
  const liRegex = /<li>\s*<span>([\s\S]*?)<\/span>\s*<span class="bonus">\s*4J\s*<\/span>\s*<\/li>/gi;
  let match = liRegex.exec(fourGamesMatch[1]);

  while (match) {
    const name = canonicalizePlayerName(stripTags(match[1]));
    if (name) {
      names.push(name);
    }
    match = liRegex.exec(fourGamesMatch[1]);
  }

  const uniqueEligible = uniqueNames(names);
  if (uniqueEligible.length === 0) {
    throw new Error("O bloco '4 jogos' foi encontrado, mas nenhum jogador elegivel foi extraido.");
  }

  return uniqueEligible.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function parseVotes(value) {
  const numeric = Number(String(value || "").trim());
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
}

function resolveWinnerInput(input, eligibleByKey) {
  const canonical = canonicalizePlayerName(input);
  if (!canonical) {
    return "";
  }

  return eligibleByKey.get(normalizeName(canonical)) || "";
}

function askQuestion(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function collectWinnerAndVotes(args, eligibleNames) {
  const eligibleByKey = new Map(eligibleNames.map((name) => [normalizeName(name), name]));
  const needsPrompt = !args.vencedor || !args.votos;
  let rl = null;

  if (needsPrompt) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  try {
    let winnerName = resolveWinnerInput(args.vencedor, eligibleByKey);
    while (!winnerName) {
      if (!rl) {
        throw new Error(`O vencedor informado ('${args.vencedor}') nao esta entre os elegiveis.`);
      }

      const answer = await askQuestion(rl, `Quem foi o vencedor? (${eligibleNames.join(", ")}): `);
      winnerName = resolveWinnerInput(answer, eligibleByKey);
      if (!winnerName) {
        console.log("Nome invalido. Informe um dos jogadores elegiveis listados acima.");
      }
    }

    let votes = parseVotes(args.votos);
    while (!votes) {
      if (!rl) {
        throw new Error(`O total de votos informado ('${args.votos}') e invalido.`);
      }

      const answer = await askQuestion(rl, `Quantos votos ${winnerName} recebeu? `);
      votes = parseVotes(answer);
      if (!votes) {
        console.log("Valor invalido. Informe um numero inteiro maior que zero.");
      }
    }

    return { winnerName, votes };
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

function replaceRequired(content, pattern, replacer, label) {
  if (!pattern.test(content)) {
    throw new Error(`O modelo nao contem o trecho esperado para ${label}.`);
  }
  return content.replace(pattern, replacer);
}

function renderEligibleRows(eligibleNames, winnerName) {
  return eligibleNames
    .map((name) => {
      const isWinner = normalizeName(name) === normalizeName(winnerName);
      return `                <li${isWinner ? ' class="winnerRow"' : ""}><span>${htmlEscape(name)}</span><span class="tag">${
        isWinner ? "Vencedor" : "Elegível"
      }</span></li>`;
    })
    .join("\n");
}

function buildUpdatedHtml(templateHtml, { monthLabel, year, winnerName, votes, eligibleNames }) {
  const winnerUpper = winnerName.toLocaleUpperCase("pt-BR");
  const eligibleRows = renderEligibleRows(eligibleNames, winnerName);

  let updated = templateHtml;

  updated = replaceRequired(
    updated,
    /<title>[^<]*<\/title>/i,
    `<title>Jogador Destaque do Mês — ${htmlEscape(monthLabel)}/${htmlEscape(year)}</title>`,
    "title"
  );

  updated = replaceRequired(
    updated,
    /[A-Za-zÀ-ÿ]+\/\d{4}\s*•\s*Patota Perebas FC/,
    `${monthLabel}/${year} • Patota Perebas FC`,
    "periodo do card"
  );

  updated = replaceRequired(
    updated,
    /(<span class="chip"><span class="ico gold"><\/span> <b>Vencedor:<\/b>\s*)([^<]+)(<\/span>)/,
    (_, start, __, end) => `${start}${htmlEscape(winnerName)}${end}`,
    "chip vencedor"
  );

  updated = replaceRequired(
    updated,
    /(<span class="chip"><span class="ico blue"><\/span> <b>Votos:<\/b>\s*)(\d+)(<\/span>)/,
    (_, start, __, end) => `${start}${votes}${end}`,
    "chip votos"
  );

  updated = replaceRequired(
    updated,
    /(<span class="chip"><span class="ico green"><\/span> <b>Elegíveis:<\/b>\s*)(\d+)(<\/span>)/,
    (_, start, __, end) => `${start}${eligibleNames.length}${end}`,
    "chip elegiveis"
  );

  updated = replaceRequired(
    updated,
    /<div class="name">[\s\S]*?<\/div>/,
    `<div class="name">${htmlEscape(winnerUpper)}</div>`,
    "nome do vencedor"
  );

  updated = replaceRequired(
    updated,
    /<div class="votes"><span class="spark"><\/span>\s*Total de votos:\s*<span aria-label="votos">[\s\S]*?<\/span><\/div>/,
    `<div class="votes"><span class="spark"></span> Total de votos: <span aria-label="votos">${votes}</span></div>`,
    "badge de votos"
  );

  updated = replaceRequired(
    updated,
    /🏆\s*Elegíveis\s*—\s*[A-Za-zÀ-ÿ]+\s+\d{4}/,
    `🏆 Elegíveis — ${monthLabel} ${year}`,
    "cabecalho dos elegiveis"
  );

  updated = replaceRequired(
    updated,
    /<ul class="eligible">[\s\S]*?<\/ul>/,
    `<ul class="eligible">\n${eligibleRows}\n              </ul>`,
    "lista de elegiveis"
  );

  updated = replaceRequired(
    updated,
    /👉\s*Total:\s*<b style="color:var\(--text\)">\d+<\/b>\s*jogadores elegíveis/,
    `👉 Total: <b style="color:var(--text)">${eligibleNames.length}</b> jogadores elegíveis`,
    "contador total"
  );

  updated = replaceRequired(
    updated,
    /Feito para celebrar a resenha ⚽\s*—\s*[A-Za-zÀ-ÿ]+\/\d{4}/,
    `Feito para celebrar a resenha ⚽ — ${monthLabel}/${year}`,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!["preview", "apply"].includes(args.modo)) {
    throw new Error("Parametro --modo invalido. Use preview ou apply.");
  }

  const paths = resolvePaths(args);

  if (!fs.existsSync(paths.relatorioPath)) {
    throw new Error(`Relatorio de presenca nao encontrado: ${paths.relatorioPath}`);
  }

  if (!fs.existsSync(paths.modeloPath)) {
    throw new Error(`Modelo de destaque nao encontrado: ${paths.modeloPath}`);
  }

  const reportHtml = fs.readFileSync(paths.relatorioPath, "utf8");
  const templateHtml = fs.readFileSync(paths.modeloPath, "utf8");
  const eligibleNames = parseEligibleNames(reportHtml);
  const year = parseYearFromReport(reportHtml);
  const monthLabel = resolveMonthLabel(paths.monthKey);
  const outcome = await collectWinnerAndVotes(args, eligibleNames);
  const updatedHtml = buildUpdatedHtml(templateHtml, {
    monthLabel,
    year,
    winnerName: outcome.winnerName,
    votes: outcome.votes,
    eligibleNames,
  });

  console.log("----------------------------------------");
  console.log("Resumo da execucao");
  console.log("----------------------------------------");
  console.log(`Mes: ${paths.monthKey}`);
  console.log(`Relatorio usado: ${path.basename(paths.relatorioPath)}`);
  console.log(`Modelo visual: ${path.relative(paths.root, paths.modeloPath)}`);
  console.log(`Pagina alvo: ${path.relative(paths.root, paths.destaquePath)}`);
  console.log(`Elegiveis (${eligibleNames.length}): ${eligibleNames.join(", ")}`);
  console.log(`Vencedor: ${outcome.winnerName}`);
  console.log(`Votos: ${outcome.votes}`);

  if (args.modo === "preview") {
    console.log("");
    console.log("Preview concluido. Nenhum arquivo foi alterado.");
    return;
  }

  const saveResult = saveWithBackup(paths.destaquePath, updatedHtml);
  console.log("");
  console.log(
    `Arquivo de destaque: ${saveResult.changed ? "alterado" : "sem alteracao"}${
      saveResult.backupPath ? ` (backup: ${saveResult.backupPath})` : ""
    }`
  );
}

main().catch((error) => {
  console.error("Erro:", error.message);
  process.exit(1);
});
