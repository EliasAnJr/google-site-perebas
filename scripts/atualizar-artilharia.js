#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    mes: "",
    modo: "preview",
    data: "",
    forcar: false,
    raiz: DEFAULT_PROJECT_ROOT,
    artilharia: "artilharia/artilharia",
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
      case "--artilharia":
        args.artilharia = (value || "").trim();
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
    "  node scripts/atualizar-artilharia.js --mes fevereiro --modo preview",
    "  node scripts/atualizar-artilharia.js --mes fevereiro --data 07/02/2026 --modo preview",
    "  node scripts/atualizar-artilharia.js --mes fevereiro --modo apply",
    "",
    "Parametros:",
    "  --mes         Texto usado para escolher a base alvo do mes na autodeteccao",
    "  --data        Data limite no formato DD/MM/AAAA (default: ultimo jogo da base)",
    "  --modo        preview | apply (default: preview)",
    "  --forcar      Permite aplicar mesmo com inconsistencias detectadas na base",
    "  --raiz        Caminho raiz do projeto (default: pasta do projeto)",
    "  --artilharia  Caminho relativo do HTML alvo (default: artilharia/artilharia)",
    "  --base        Caminho relativo da base alvo .txt da artilharia",
    "",
    "Comportamento:",
    "  - O calculo e acumulado: considera todas as bases canonicas ate a data limite",
    "  - preview: valida o historico, calcula o ranking e mostra resumo sem salvar",
    "  - apply: salva o HTML atualizado e cria backup .bak.<timestamp>",
  ].join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function sumGoals(entries) {
  return entries.reduce((total, entry) => total + entry.goals, 0);
}

function uniqueNames(names) {
  const seen = new Set();
  const result = [];

  for (const rawName of names) {
    const key = normalizeName(rawName);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(rawName);
  }

  return result;
}

function cleanListName(rawLine) {
  let text = (rawLine || "").replace(/\u00a0/g, " ").trim();
  if (!text) return "";
  if (/^[-#]+$/.test(text)) return "";

  text = text.replace(/^\d+\s*[-.)]\s*/, "");
  text = text.replace(/^-\s*/, "");
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return "";
  if (/^presentes:?$/i.test(text)) return "";
  if (/^ausentes:?$/i.test(text)) return "";
  if (/^lista\s+com\s+todos\s+jogadores\s+da\s+patota:?$/i.test(text)) return "";
  if (/^placar\s+oficial:?$/i.test(text)) return "";

  return text;
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
  const seen = new Set();
  const names = [];

  for (const line of segment.split(/\r?\n/)) {
    const cleaned = cleanListName(line);
    const key = normalizeName(cleaned);
    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(cleaned);
  }

  return names;
}

function parseRosterList(baseText) {
  const startMatch = baseText.match(/^\s*LISTA\s+COM\s+TODOS\s+JOGADORES\s+DA\s+PATOTA\s*:?\s*$/im);
  if (!startMatch || startMatch.index === undefined) {
    return [];
  }

  const from = startMatch.index + startMatch[0].length;
  const tail = baseText.slice(from);
  const endMatch = tail.match(/^\s*ARTILHARIA\s+DO\s+CICLO\b.*$/im);
  const segment = endMatch ? tail.slice(0, endMatch.index) : tail;
  const seen = new Set();
  const names = [];

  for (const line of segment.split(/\r?\n/)) {
    const cleaned = cleanListName(line);
    const key = normalizeName(cleaned);
    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(cleaned);
  }

  return names;
}

function cleanGoalLine(rawLine) {
  let text = (rawLine || "").replace(/\u00a0/g, " ").trim();
  if (!text) return null;
  if (/^[-#]+$/.test(text)) return null;

  text = text.replace(/^\d+\s*[-.)]\s*/, "");
  const match = text.match(/^(.+?)\s*:\s*(\d+)\s*$/);
  if (!match) return null;

  const name = match[1].replace(/\s+/g, " ").trim();
  const goals = Number(match[2]);

  if (!name || !Number.isFinite(goals)) {
    return null;
  }

  return { name, goals };
}

function parseGoalList(block, startRegex, endRegex) {
  const startMatch = block.match(startRegex);
  if (!startMatch || startMatch.index === undefined) {
    return [];
  }

  const from = startMatch.index + startMatch[0].length;
  const tail = block.slice(from);
  const endMatch = tail.match(endRegex);
  const segment = endMatch ? tail.slice(0, endMatch.index) : tail;

  const map = new Map();

  for (const line of segment.split(/\r?\n/)) {
    const parsed = cleanGoalLine(line);
    if (!parsed) {
      continue;
    }

    const key = normalizeName(parsed.name);
    if (!key) {
      continue;
    }

    if (!map.has(key)) {
      map.set(key, { name: parsed.name, goals: 0 });
    }

    map.get(key).goals += parsed.goals;
  }

  return Array.from(map.values());
}

function parseOptionalInt(block, regex, fallback = null) {
  const match = block.match(regex);
  return match ? Number(match[1]) : fallback;
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

    const presentes = parseNumberedList(block, /^\s*Presentes\s*:?\s*$/im, /^\s*Ausentes\s*:?\s*$/im);
    const ausentes = parseNumberedList(block, /^\s*Ausentes\s*:?\s*$/im, /^\s*PLACAR\s+OFICIAL\s*:\s*$/im);
    const scorePreto = parseOptionalInt(block, /TIME PRETO:\s*(\d+)\s*GOLS/i, 0);
    const scoreLaranja = parseOptionalInt(block, /TIME LARANJA:\s*(\d+)\s*GOLS/i, 0);

    const playersPreto = parseGoalList(
      block,
      /^\s*GOLS\s+TIME\s+PRETO\s*:\s*$/im,
      /^\s*GOLS\s+TIME\s+LARANJA\s*:\s*$/im
    );
    const playersLaranja = parseGoalList(
      block,
      /^\s*GOLS\s+TIME\s+LARANJA\s*:\s*$/im,
      /^\s*(?:GOLS\s+NAO\s+CREDITADOS(?:\s*\(opcional\))?|CONFERENCIA)\s*:\s*$/im
    );

    const confPreto = parseOptionalInt(block, /SOMA TIME PRETO:\s*(\d+)/i);
    const confLaranja = parseOptionalInt(block, /SOMA TIME LARANJA:\s*(\d+)/i);
    const statusMatch = block.match(/STATUS:\s*(OK|AJUSTAR)/i);
    const status = statusMatch ? statusMatch[1].toUpperCase() : "";

    const creditedPreto = sumGoals(playersPreto);
    const creditedLaranja = sumGoals(playersLaranja);
    const computedPreto = creditedPreto;
    const computedLaranja = creditedLaranja;

    const issues = [];
    const presentKeys = new Set(presentes.map((name) => normalizeName(name)));
    const absentKeys = new Set(ausentes.map((name) => normalizeName(name)));

    if (computedPreto !== scorePreto) {
      issues.push(
        `[${current.date}] Time Preto oficial=${scorePreto}, calculado=${computedPreto} (gols listados=${creditedPreto})`
      );
    }

    if (computedLaranja !== scoreLaranja) {
      issues.push(
        `[${current.date}] Time Laranja oficial=${scoreLaranja}, calculado=${computedLaranja} (gols listados=${creditedLaranja})`
      );
    }

    if (confPreto !== null && confPreto !== computedPreto) {
      issues.push(`[${current.date}] CONFERENCIA preto=${confPreto}, calculado=${computedPreto}`);
    }

    if (confLaranja !== null && confLaranja !== computedLaranja) {
      issues.push(`[${current.date}] CONFERENCIA laranja=${confLaranja}, calculado=${computedLaranja}`);
    }

    if (status && status !== "OK") {
      issues.push(`[${current.date}] STATUS=${status}`);
    }

    if (status === "OK" && (computedPreto !== scorePreto || computedLaranja !== scoreLaranja)) {
      issues.push(`[${current.date}] STATUS=OK, mas as contas nao fecham com o placar oficial`);
    }

    const pretoKeys = new Set(playersPreto.map((entry) => normalizeName(entry.name)));
    const duplicatedAcrossTeams = playersLaranja
      .map((entry) => normalizeName(entry.name))
      .filter((key) => key && pretoKeys.has(key));

    if (duplicatedAcrossTeams.length > 0) {
      issues.push(
        `[${current.date}] Jogador(es) aparecendo nos dois times: ${uniqueNames(duplicatedAcrossTeams).join(", ")}`
      );
    }

    const overlapPresentAbsent = presentes.filter((name) => absentKeys.has(normalizeName(name)));
    if (overlapPresentAbsent.length > 0) {
      issues.push(
        `[${current.date}] Jogador(es) listados em presentes e ausentes: ${uniqueNames(overlapPresentAbsent).join(", ")}`
      );
    }

    if (presentes.length > 0) {
      const scorersOutsidePresentes = [...playersPreto, ...playersLaranja]
        .filter((entry) => entry.goals > 0 && !presentKeys.has(normalizeName(entry.name)))
        .map((entry) => entry.name);

      if (scorersOutsidePresentes.length > 0) {
        issues.push(
          `[${current.date}] Jogador(es) com gol fora da lista de presentes: ${uniqueNames(scorersOutsidePresentes).join(", ")}`
        );
      }
    }

    games.push({
      date: current.date,
      presentes,
      ausentes,
      scorePreto,
      scoreLaranja,
      playersPreto,
      playersLaranja,
      creditedPreto,
      creditedLaranja,
      computedPreto,
      computedLaranja,
      status,
      issues,
      block,
    });
  }

  return games;
}

function isCanonicalBaseFileName(name) {
  return /^artilharia-do-ciclo-[^. ]+\.txt$/i.test(name || "");
}

function samePath(a, b) {
  return path.resolve(a || "").toLowerCase() === path.resolve(b || "").toLowerCase();
}

function readGamesFromBaseFile(filePath) {
  const baseText = fs.readFileSync(filePath, "utf8");
  const games = parseGames(baseText);
  const rosterNames = parseRosterList(baseText);

  return {
    rosterNames,
    games: games.map((game) => ({
      ...game,
      sourceBasePath: filePath,
      sourceBaseName: path.basename(filePath),
    })),
  };
}

function loadHistoricalData(basePaths) {
  const allGames = [];
  const byDate = new Map();
  const rosterMap = new Map();
  const basesWithoutRoster = [];

  for (const basePath of basePaths) {
    const { games, rosterNames } = readGamesFromBaseFile(basePath);

    if (rosterNames.length === 0) {
      basesWithoutRoster.push(path.basename(basePath));
    } else {
      for (const name of rosterNames) {
        const key = normalizeName(name);
        if (!key || rosterMap.has(key)) {
          continue;
        }
        rosterMap.set(key, name);
      }
    }

    for (const game of games) {
      if (byDate.has(game.date)) {
        const previous = byDate.get(game.date);
        throw new Error(
          `Data duplicada nas bases da artilharia: ${game.date} aparece em ${previous.sourceBaseName} e ${game.sourceBaseName}. Remova copias/duplicatas antes de continuar.`
        );
      }

      byDate.set(game.date, game);
      allGames.push(game);
    }
  }

  return {
    games: allGames.sort((a, b) => toDateCode(a.date) - toDateCode(b.date)),
    rosterNames: Array.from(rosterMap.values()),
    basesWithoutRoster: uniqueNames(basesWithoutRoster),
  };
}

function describeTargetBase(targetGames, fallbackLabel) {
  const names = uniqueNames(targetGames.map((game) => game.sourceBaseName));
  if (names.length === 0) return fallbackLabel;
  if (names.length === 1) return names[0];
  return `${names.length} bases (${names.join(", ")})`;
}

function countDistinctBaseNames(games) {
  return uniqueNames(games.map((game) => game.sourceBaseName)).length;
}

function extractTableRowsFromTbody(html, ariaLabel) {
  const sectionRegex = new RegExp(
    "<div class=\\\"table-wrap\\\" aria-label=\\\"" +
      escapeRegExp(ariaLabel) +
      "\\\">[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>",
    "i"
  );

  const sectionMatch = html.match(sectionRegex);
  if (!sectionMatch) {
    throw new Error("Nao foi possivel localizar a tabela: " + ariaLabel);
  }

  const tbody = sectionMatch[1];
  const rowRegex = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = [];

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbody)) !== null) {
    rows.push(rowMatch[0]);
  }

  return rows;
}

function cellText(cellHtml) {
  return (cellHtml || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlayersTable(html) {
  const rowsHtml = extractTableRowsFromTbody(html, "Artilharia individual");
  const rows = [];

  for (const rowHtml of rowsHtml) {
    const cells = rowHtml.match(/<td[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 5) {
      continue;
    }

    rows.push({
      name: cellText(cells[1]),
      originalIndex: rows.length,
    });
  }

  if (rows.length === 0) {
    throw new Error("Tabela de artilharia vazia ou invalida.");
  }

  return rows;
}

function buildCanonicalRowsFromRoster(rosterNames) {
  return rosterNames.map((name, index) => ({
    name,
    originalIndex: index,
  }));
}

function buildParticipationData(games) {
  const counter = new Map();
  const estimatedGames = [];

  for (const game of games) {
    const names =
      game.presentes && game.presentes.length > 0
        ? game.presentes
        : uniqueNames([...game.playersPreto.map((entry) => entry.name), ...game.playersLaranja.map((entry) => entry.name)]);

    if (!game.presentes || game.presentes.length === 0) {
      estimatedGames.push(game.date);
    }

    const seenInGame = new Set();
    for (const name of names) {
      const key = normalizeName(name);
      if (!key || seenInGame.has(key)) {
        continue;
      }

      seenInGame.add(key);
      if (!counter.has(key)) {
        counter.set(key, { games: 0, sourceName: name });
      }

      const current = counter.get(key);
      current.games += 1;
      if (!current.sourceName) {
        current.sourceName = name;
      }
    }
  }

  return {
    counter,
    estimatedGames: uniqueNames(estimatedGames),
  };
}

function buildLeaderboard(currentRows, games, options = {}) {
  const canonicalByNormalized = new Map(currentRows.map((row) => [normalizeName(row.name), row.name]));
  const totals = new Map();
  const unknownPlayers = [];
  const participationData = buildParticipationData(games);
  const strictRoster = Boolean(options.strictRoster);

  function ensurePlayer(key, sourceName) {
    if (strictRoster && !canonicalByNormalized.has(key)) {
      if (sourceName) {
        unknownPlayers.push(sourceName);
      }
      return null;
    }

    if (!totals.has(key)) {
      const canonicalName = canonicalByNormalized.get(key) || sourceName;
      if (!canonicalByNormalized.has(key) && sourceName) {
        unknownPlayers.push(sourceName);
      }

      totals.set(key, { name: canonicalName, goals: 0, games: 0 });
    }

    const current = totals.get(key);
    if (!current.name && sourceName) {
      current.name = canonicalByNormalized.get(key) || sourceName;
    }

    return current;
  }

  for (const game of games) {
    const entries = [...game.playersPreto, ...game.playersLaranja];

    for (const entry of entries) {
      const key = normalizeName(entry.name);
      if (!key) {
        continue;
      }

      const current = ensurePlayer(key, entry.name);
      if (!current) {
        continue;
      }
      current.goals += entry.goals;
    }
  }

  for (const [key, participation] of participationData.counter.entries()) {
    const current = ensurePlayer(key, participation.sourceName);
    if (!current) {
      continue;
    }
    current.games = participation.games;
    if (!current.name) {
      current.name = canonicalByNormalized.get(key) || participation.sourceName;
    }
  }

  const used = new Set();
  const rows = currentRows.map((row) => {
    const key = normalizeName(row.name);
    const total = totals.get(key) || { goals: 0, games: 0 };
    used.add(key);

    return {
      name: row.name,
      goals: total.goals || 0,
      games: total.games || 0,
      media: total.games > 0 ? total.goals / total.games : 0,
      originalIndex: row.originalIndex,
    };
  });

  let extraIndex = rows.length;
  for (const [key, total] of totals.entries()) {
    if (used.has(key)) {
      continue;
    }

    rows.push({
      name: total.name,
      goals: total.goals,
      games: total.games,
      media: total.games > 0 ? total.goals / total.games : 0,
      originalIndex: extraIndex,
    });

    extraIndex += 1;
  }

  rows.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    if (b.media !== a.media) return b.media - a.media;
    const byName = a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.originalIndex - b.originalIndex;
  });

  return {
    rows,
    unknownPlayers: uniqueNames(unknownPlayers),
    estimatedGames: participationData.estimatedGames,
  };
}

function buildTeamSummary(games, hasIssues) {
  const totalPreto = games.reduce((sum, game) => sum + game.scorePreto, 0);
  const totalLaranja = games.reduce((sum, game) => sum + game.scoreLaranja, 0);

  return {
    preto: {
      goalsFor: totalPreto,
      goalsAgainst: totalLaranja,
      saldo: totalPreto - totalLaranja,
    },
    laranja: {
      goalsFor: totalLaranja,
      goalsAgainst: totalPreto,
      saldo: totalLaranja - totalPreto,
    },
  };
}

function buildInsights(games) {
  const totalGoals = games.reduce((sum, game) => sum + game.scorePreto + game.scoreLaranja, 0);

  let hatTricks = 0;
  let biggestBlowout = null;

  for (const game of games) {
    for (const entry of [...game.playersPreto, ...game.playersLaranja]) {
      if (entry.goals >= 3) {
        hatTricks += 1;
      }
    }

    const diff = Math.abs(game.scorePreto - game.scoreLaranja);
    const total = game.scorePreto + game.scoreLaranja;
    if (
      !biggestBlowout ||
      diff > biggestBlowout.diff ||
      (diff === biggestBlowout.diff && total > biggestBlowout.totalGoals)
    ) {
      biggestBlowout = {
        date: game.date,
        scorePreto: game.scorePreto,
        scoreLaranja: game.scoreLaranja,
        diff,
        totalGoals: total,
      };
    }
  }

  return {
    biggestBlowout: biggestBlowout
      ? `${biggestBlowout.date} - ${biggestBlowout.scorePreto} x ${biggestBlowout.scoreLaranja}`
      : "--",
    hatTricks,
    mediaGoals: games.length > 0 ? (totalGoals / games.length).toFixed(2) : "0.00",
    totalGoals,
  };
}

function buildHatTrickEvents(games, currentRows, options = {}) {
  const canonicalByNormalized = new Map(currentRows.map((row) => [normalizeName(row.name), row.name]));
  const events = [];
  const strictRoster = Boolean(options.strictRoster);

  function pushEvents(entries, team, date) {
    for (const entry of entries) {
      if (entry.goals < 3) {
        continue;
      }

      const key = normalizeName(entry.name);
      if (strictRoster && key && !canonicalByNormalized.has(key)) {
        continue;
      }

      const player = key && canonicalByNormalized.has(key) ? canonicalByNormalized.get(key) : entry.name;

      events.push({
        date,
        player,
        team,
        goals: entry.goals,
      });
    }
  }

  for (const game of games) {
    pushEvents(game.playersPreto, "PRETO", game.date);
    pushEvents(game.playersLaranja, "LARANJA", game.date);
  }

  return events.sort((a, b) => {
    const byDate = toDateCode(a.date) - toDateCode(b.date);
    if (byDate !== 0) return byDate;
    if (b.goals !== a.goals) return b.goals - a.goals;
    const byTeam = a.team.localeCompare(b.team);
    if (byTeam !== 0) return byTeam;
    return a.player.localeCompare(b.player, "pt-BR", { sensitivity: "base" });
  });
}

function renderValidationDetails(games) {
  const lines = [];

  for (const game of games) {
    if (!game.issues || game.issues.length === 0) {
      continue;
    }

    lines.push(`Jogo ${game.date}:`);
    lines.push(`  Placar oficial -> Preto ${game.scorePreto} x ${game.scoreLaranja} Laranja`);
    lines.push(`  Preto -> gols listados ${game.creditedPreto}`);
    lines.push(`  Laranja -> gols listados ${game.creditedLaranja}`);

    if (game.status) {
      lines.push(`  STATUS informado na base -> ${game.status}`);
    }

    lines.push("  Motivos:");
    game.issues.forEach((issue) => lines.push(`  - ${issue}`));
    lines.push("");
  }

  return lines;
}

function renderRankingRows(rows) {
  return rows
    .map((row, index) => {
      const podium = index < 3 ? ' class="podium"' : "";
      const rankClass = index < 3 ? "rank top" : "rank";

      return [
        `                    <tr${podium}>`,
        `                      <td><span class="${rankClass}">${index + 1}</span></td>`,
        `                      <td>${htmlEscape(row.name)}</td>`,
        `                      <td class="score">${row.goals}</td>`,
        `                      <td>${row.games}</td>`,
        `                      <td>${row.media.toFixed(2)}</td>`,
        "                    </tr>",
      ].join("\n");
    })
    .join("\n");
}

function renderTeamRows(summary) {
  const rows = [
    { key: "preto", label: "Preto", teamClass: "black", dotClass: "black", rank: 1 },
    { key: "laranja", label: "Laranja", teamClass: "orange", dotClass: "orange", rank: 2 },
  ];

  return rows
    .map((row) => {
      const data = summary[row.key];
      return [
        "                    <tr>",
        `                      <td><span class="team ${row.teamClass}"><span class="dotMini ${row.dotClass}"></span>${row.label}</span></td>`,
        `                      <td class="score">${data.goalsFor}</td>`,
        `                      <td>${data.goalsAgainst}</td>`,
        `                      <td>${data.saldo}</td>`,
        "                    </tr>",
      ].join("\n");
    })
    .join("\n");
}

function renderHatTrickRows(events) {
  if (events.length === 0) {
    return [
      "                    <tr>",
      '                      <td class="muted">--/--/----</td>',
      '                      <td class="muted">Nenhum hat-trick registrado</td>',
      '                      <td class="muted">--</td>',
      '                      <td class="score">0</td>',
      "                    </tr>",
    ].join("\n");
  }

  return events
    .map((event) => {
      const teamClass = event.team === "PRETO" ? "black" : "orange";
      const dotClass = teamClass;
      const label = event.team === "PRETO" ? "Time Preto" : "Time Laranja";

      return [
        "                    <tr>",
        `                      <td>${event.date}</td>`,
        `                      <td>${htmlEscape(event.player)}</td>`,
        `                      <td><span class="team ${teamClass}"><span class="dotMini ${dotClass}"></span>${label}</span></td>`,
        `                      <td class="score">${event.goals}</td>`,
        "                    </tr>",
      ].join("\n");
    })
    .join("\n");
}

function replaceTbody(html, ariaLabel, rowsHtml, closingIndent) {
  const regex = new RegExp(
    "(<div class=\\\"table-wrap\\\" aria-label=\\\"" +
      escapeRegExp(ariaLabel) +
      "\\\">[\\s\\S]*?<tbody>)([\\s\\S]*?)(</tbody>)",
    "i"
  );

  if (!regex.test(html)) {
    throw new Error("Nao foi possivel atualizar a tabela: " + ariaLabel);
  }

  return html.replace(regex, `$1\n${rowsHtml}\n${closingIndent}$3`);
}

function replaceTagContentById(html, id, value) {
  const regex = new RegExp(
    "(<([a-z0-9]+)[^>]*\\bid=\\\"" + escapeRegExp(id) + "\\\"[^>]*>)([\\s\\S]*?)(</\\2>)",
    "i"
  );

  if (!regex.test(html)) {
    throw new Error("Nao foi possivel localizar o elemento com id: " + id);
  }

  return html.replace(regex, `$1${htmlEscape(value)}$4`);
}

function updateArtilhariaHtml(html, leaderboardRows, teamSummary, insights, hatTrickEvents, updatedDate) {
  let updated = html;

  updated = replaceTbody(updated, "Artilharia individual", renderRankingRows(leaderboardRows), "                  ");
  updated = replaceTbody(updated, "Artilharia por time", renderTeamRows(teamSummary), "                  ");
  updated = replaceTbody(updated, "Hat-tricks da temporada", renderHatTrickRows(hatTrickEvents), "                  ");

  updated = replaceTagContentById(updated, "chip-preto-gols", String(teamSummary.preto.goalsFor));
  updated = replaceTagContentById(updated, "chip-laranja-gols", String(teamSummary.laranja.goalsFor));
  updated = replaceTagContentById(updated, "insight-goleada", insights.biggestBlowout);
  updated = replaceTagContentById(updated, "insight-hat", String(insights.hatTricks));
  updated = replaceTagContentById(updated, "insight-media", insights.mediaGoals);
  updated = replaceTagContentById(updated, "insight-total-gols", String(insights.totalGoals));

  const updateStamp = `<div class="update-stamp">Ultima atualizacao automatica: jogo de ${htmlEscape(updatedDate)}.</div>`;
  if (/<div class="update-stamp">[\s\S]*?<\/div>/i.test(updated)) {
    updated = updated.replace(/<div class="update-stamp">[\s\S]*?<\/div>/i, updateStamp);
  } else if (/<footer>[\s\S]*?<\/footer>/i.test(updated)) {
    updated = updated.replace(/(<footer>\s*[\s\S]*?)(\s*<\/footer>)/i, `$1\n      ${updateStamp}$2`);
  } else {
    throw new Error("Nao foi possivel localizar o footer da pagina de artilharia.");
  }

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
  const artilhariaDir = path.join(root, "artilharia");
  if (!fs.existsSync(artilhariaDir)) {
    throw new Error(`Pasta da artilharia nao encontrada: ${artilhariaDir}`);
  }

  const allBasePaths = fs
    .readdirSync(artilhariaDir)
    .filter((name) => isCanonicalBaseFileName(name))
    .sort()
    .map((name) => path.join(artilhariaDir, name));

  if (allBasePaths.length === 0) {
    throw new Error(`Nenhum arquivo canonico artilharia-do-ciclo-<mes>.txt encontrado em ${artilhariaDir}`);
  }

  const targetBasePath = args.base ? path.resolve(root, args.base) : "";
  if (targetBasePath && !fs.existsSync(targetBasePath)) {
    throw new Error(`Arquivo base nao encontrado: ${targetBasePath}`);
  }

  if (targetBasePath && !allBasePaths.some((candidate) => samePath(candidate, targetBasePath))) {
    allBasePaths.push(targetBasePath);
  }

  const artilhariaPath = path.resolve(root, args.artilharia);

  return {
    root,
    targetBasePath,
    allBasePaths,
    artilhariaPath,
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
  if (!fs.existsSync(paths.artilhariaPath)) throw new Error(`Arquivo HTML nao encontrado: ${paths.artilhariaPath}`);

  const history = loadHistoricalData(paths.allBasePaths);
  const games = history.games;
  if (games.length === 0) {
    throw new Error("Nenhum jogo encontrado nas bases da artilharia.");
  }

  let targetGames = games;
  let targetBaseLabel = "historico completo";

  if (paths.targetBasePath) {
    targetGames = games.filter((game) => samePath(game.sourceBasePath, paths.targetBasePath));
    targetBaseLabel = path.basename(paths.targetBasePath);
  } else if (args.mes) {
    const monthKey = normalizeName(args.mes);
    targetGames = games.filter((game) => normalizeName(game.sourceBaseName).includes(monthKey));
    targetBaseLabel = describeTargetBase(targetGames, `mes ${args.mes}`);
  }

  if (targetGames.length === 0) {
    throw new Error(
      paths.targetBasePath
        ? `Nenhum jogo encontrado na base alvo ${path.basename(paths.targetBasePath)}.`
        : `Nenhuma base encontrada para o filtro --mes ${args.mes}.`
    );
  }

  let selectedGame;
  if (args.data) {
    selectedGame = targetGames.find((game) => game.date === args.data);
    if (!selectedGame) {
      throw new Error(`Jogo nao encontrado para a data ${args.data} dentro da base alvo.`);
    }
  } else {
    selectedGame = [...targetGames].sort((a, b) => toDateCode(b.date) - toDateCode(a.date))[0];
  }

  const cutoffCode = toDateCode(selectedGame.date);
  const consideredGames = games
    .filter((game) => toDateCode(game.date) <= cutoffCode)
    .sort((a, b) => toDateCode(a.date) - toDateCode(b.date));

  const issues = consideredGames.flatMap((game) => game.issues);
  if (issues.length > 0 && args.modo === "apply" && !args.forcar) {
    const details = renderValidationDetails(consideredGames).join("\n");
    throw new Error(
      "Base da artilharia com inconsistencias. A aplicacao foi bloqueada para evitar atualizar o HTML com contas quebradas.\n\n" +
        details +
        "Corrija a base e rode novamente, ou use --forcar se a manutencao for intencional."
    );
  }

  if (issues.length > 0 && args.modo === "preview" && !args.forcar) {
    const details = renderValidationDetails(consideredGames);
    console.log("----------------------------------------");
    console.log("Resumo da execucao");
    console.log("----------------------------------------");
    console.log(`Base alvo: ${targetBaseLabel}`);
    console.log(`Bases acumuladas: ${countDistinctBaseNames(consideredGames)}`);
    console.log(`Data limite: ${selectedGame.date}`);
    console.log(`Jogos considerados: ${consideredGames.length}`);
    console.log("");
    console.log("O preview foi interrompido porque a base nao fecha com o placar oficial.");
    console.log("O script para aqui para evitar que a pagina seja atualizada com dados incoerentes.");
    console.log("");
    console.log("Detalhes da validacao:");
    details.forEach((line) => console.log(line));
    console.log("Preview interrompido. Corrija a base ou use --forcar para seguir mesmo assim.");
    return;
  }

  const artilhariaHtml = fs.readFileSync(paths.artilhariaPath, "utf8");
  const currentPlayers =
    history.rosterNames.length > 0 ? buildCanonicalRowsFromRoster(history.rosterNames) : parsePlayersTable(artilhariaHtml);
  const strictRoster = history.rosterNames.length > 0;

  const leaderboard = buildLeaderboard(currentPlayers, consideredGames, { strictRoster });
  const teamSummary = buildTeamSummary(consideredGames, issues.length > 0);
  const insights = buildInsights(consideredGames);
  const hatTrickEvents = buildHatTrickEvents(consideredGames, currentPlayers, { strictRoster });
  const updatedHtml = updateArtilhariaHtml(
    artilhariaHtml,
    leaderboard.rows,
    teamSummary,
    insights,
    hatTrickEvents,
    selectedGame.date
  );

  console.log("----------------------------------------");
  console.log("Resumo da execucao");
  console.log("----------------------------------------");
  console.log(`Base alvo: ${targetBaseLabel}`);
  console.log(`Bases acumuladas: ${countDistinctBaseNames(consideredGames)}`);
  console.log(`Data limite: ${selectedGame.date}`);
  console.log(`Jogos considerados: ${consideredGames.length}`);
  console.log(`Total de gols: ${insights.totalGoals}`);
  console.log("");

  console.log("Top 5 da artilharia:");
  leaderboard.rows.slice(0, 5).forEach((row, index) => {
    console.log(`${index + 1}. ${row.name} - ${row.goals} gols (${row.games} jogos, media ${row.media.toFixed(2)})`);
  });

  if (hatTrickEvents.length > 0) {
    console.log("");
    console.log("Hat-tricks encontrados:");
    hatTrickEvents.forEach((event) => {
      const teamLabel = event.team === "PRETO" ? "Time Preto" : "Time Laranja";
      console.log(`- ${event.date} - ${event.player} - ${teamLabel} - ${event.goals} gols`);
    });
  }

  if (leaderboard.unknownPlayers.length > 0) {
    console.log("");
    console.log("Aviso: jogadores encontrados na base, mas fora da lista oficial/ranking:");
    leaderboard.unknownPlayers.forEach((name) => console.log(`- ${name}`));
  }

  if (history.basesWithoutRoster.length > 0) {
    console.log("");
    console.log("Aviso: bases sem lista oficial de jogadores no topo:");
    history.basesWithoutRoster.forEach((name) => console.log(`- ${name}`));
  }

  if (leaderboard.estimatedGames.length > 0) {
    console.log("");
    console.log("Aviso: jogos sem lista de presentes; coluna Jogos foi estimada pelas listas de gols em:");
    leaderboard.estimatedGames.forEach((date) => console.log(`- ${date}`));
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

  const saveResult = saveWithBackup(paths.artilhariaPath, updatedHtml);
  console.log("");
  console.log(
    `Arquivo de artilharia: ${saveResult.changed ? "alterado" : "sem alteracao"}${
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
