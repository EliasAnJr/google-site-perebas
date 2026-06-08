#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..");

/**
 * Faz o parse dos argumentos da linha de comando (process.argv).
 *
 * Suporta os formatos --key value e --key=value.
 * A flag booleana --help e reconhecida diretamente.
 *
 * @param {string[]} argv - Lista de tokens CLI (tipicamente process.argv.slice(2))
 * @returns {{ mes: string, modo: string, data: string,
 *             raiz: string, classificacao: string, base: string,
 *             help: boolean }} Objeto com todas as opcoes
 */
function parseArgs(argv) {
  const args = {
    mes: "marco",
    modo: "preview",
    data: "",
    raiz: DEFAULT_PROJECT_ROOT,
    classificacao: "pagina-home/classificacao-jogadores",
    base: "",
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
      case "--data":
        args.data = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--raiz":
        args.raiz = (value || "").trim();
        if (consumesNext) i += 1;
        break;
      case "--classificacao":
        args.classificacao = (value || "").trim();
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

/**
 * Retorna a string de ajuda exibida com --help ou -h.
 *
 * @returns {string} Texto de uso com exemplos e descricao de cada parametro
 */
function usage() {
  return [
    "Uso:",
    "  node scripts/atualizar-classificacao.js --mes marco --data 14/03/2026 --modo preview",
    "  node scripts/atualizar-classificacao.js --mes marco --data 14/03/2026 --modo apply",
    "",
    "Parametros:",
    "  --mes           Pasta do mes (default: marco)",
    "  --data          Data do jogo no formato DD/MM/AAAA (default: ultimo jogo da base)",
    "  --modo          preview | apply (default: preview)",
    "  --raiz          Caminho raiz do projeto (default: pasta do projeto)",
    "  --classificacao Caminho relativo da classificacao",
    "  --base          Caminho relativo do arquivo base .txt",
    "",
    "Comportamento:",
    "  - preview: calcula e mostra as mudancas sem salvar arquivos",
    "  - apply: salva os arquivos e cria backup .bak.<timestamp>",
  ].join("\n");
}

/**
 * Escapa todos os caracteres especiais de regex em uma string.
 *
 * Necessario para usar valores dinamicos dentro de new RegExp().
 * Exemplo: "14/03/2026" vira "14\/03\/2026".
 *
 * @param {string} value - Valor a ser escapado
 * @returns {string} Valor seguro para uso em expressao regular
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normaliza um nome sem aplicar aliases.
 *
 * @param {string} name - Nome bruto do jogador
 * @returns {string} Chave normalizada sem acentos/sinais
 */
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

/**
 * Normaliza um nome de jogador para uso como chave de deduplicacao e comparacao.
 *
 * Algoritmo:
 *  1. Decomposicao NFD para separar letras de seus acentos
 *  2. Remove combinadores Unicode (acentos, cedilha, etc.)
 *  3. Converte para minusculas
 *  4. Remove caracteres nao alfanumericos (substitui por espaco)
 *  5. Colapsa espacos multiplos e remove espacos nas extremidades
 *
 * Com isso "Rogerio", "Rogério" e "ROGERIO" produzem a mesma chave.
 *
 * @param {string} name - Nome bruto do jogador
 * @returns {string} Chave normalizada, ex: "rogerio", "tacio", "jose silva"
 */
function normalizeName(name) {
  const cleaned = cleanName(name);
  const normalized = normalizeRawName(cleaned);
  const canonical = PLAYER_NAME_ALIASES.get(normalized);
  return normalizeRawName(canonical || cleaned);
}

/**
 * Converte um nome para sua forma canonica quando houver alias conhecido.
 *
 * @param {string} name - Nome bruto do jogador
 * @returns {string} Nome canonico para exibicao/comparacao
 */
function canonicalizePlayerName(name) {
  const cleaned = cleanName(name);
  if (!cleaned) return "";
  const canonical = PLAYER_NAME_ALIASES.get(normalizeRawName(cleaned));
  return canonical || cleaned;
}

/**
 * Limpa uma linha bruta do arquivo .txt para extrair apenas o nome do jogador.
 *
 * Remove:
 *  - Prefixos numerados: "1- Joao", "2. Maria", "3) Pedro"
 *  - Sufixos de pontuacao: "+ 3 PONTOS", "+ 1 PONTO"
 *  - Cabecalhos de secao: "JOGADORES DO TIME ...", "RESULTADO", "PRESENTES:", "AUSENTES:"
 *  - Marcadores de fechamento/metadados: "CICLO FINALIZADO", "CONFERENCIA", "STATUS"
 *  - Linhas de separador: "-----", "#####"
 *  - Espacos nao-separaveis (U+00A0)
 *
 * Retorna "" (string vazia) se a linha nao representar um nome valido.
 *
 * @param {string} rawLine - Linha bruta do arquivo de base
 * @returns {string} Nome limpo ou "" se nao for um nome utilizavel
 */
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

/**
 * Recebe um array de linhas/nomes brutos, limpa cada entrada com cleanName(),
 * normaliza com normalizeName() e retorna uma lista deduplicada.
 *
 * Usa a chave normalizada para identificar duplicatas, portanto
 * "Rogerio" e "Rogerio" (com acento) sao tratados como o mesmo jogador.
 *
 * @param {string[]} names - Array de strings brutas (ex: linhas de um bloco do .txt)
 * @returns {string[]} Array de nomes unicos ja limpos (versao original sem normalizacao)
 */
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

/**
 * Valida a consistencia entre Presentes/Ausentes e os jogadores listados nos times.
 *
 * Regras:
 *  - jogador em time precisa estar em Presentes
 *  - jogador listado em Ausentes nao pode aparecer em time
 *  - o mesmo jogador nao pode aparecer nos dois times
 *  - todo jogador em Presentes precisa estar alocado em algum time
 *
 * Nomes sao comparados com normalizeName(), portanto aliases conhecidos
 * tambem entram na validacao.
 *
 * @param {{date: string, presentes: string[], ausentes: string[],
 *          playersPreto: string[], playersLaranja: string[]}} game
 * @returns {{presentes: string[], ausentes: string[], playersPreto: string[],
 *            playersLaranja: string[], validationErrors: string[]}}
 */
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

/**
 * Extrai uma lista de nomes de um bloco de texto entre dois marcadores regex.
 *
 * Localiza a posicao do marcador de inicio (startRegex) dentro de `block`,
 * faz o recorte ate o marcador de fim (endRegex) e retorna os nomes limpados
 * e deduplicados via uniqueNames().
 *
 * Usado para extrair as secoes "Presentes" e "Ausentes" dentro de cada bloco de jogo.
 *
 * @param {string} block      - Trecho de texto referente a um jogo
 * @param {RegExp} startRegex - Regex que marca o inicio da lista (ex: /Presentes\s*:/i)
 * @param {RegExp} endRegex   - Regex que marca o fim da lista (ex: /Ausentes\s*:?/i)
 * @returns {string[]} Lista de nomes limpos e unicos encontrados entre os marcadores
 */
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

/**
 * Extrai os jogadores de um time especifico dentro de um bloco de jogo do .txt.
 *
 * Procura pelo cabecalho "JOGADORES DO TIME {team} NO Jogo do dia {date}"
 * e captura as linhas seguintes ate o proximo cabecalho de time, separador
 * "#####", bloco de fechamento ("-----", "CICLO FINALIZADO") ou fim do bloco.
 *
 * @param {string} block  - Trecho de texto referente a um jogo (fatiado por parseGames)
 * @param {string} team   - Nome do time em maiusculas, ex: "PRETO" ou "LARANJA"
 * @param {string} date   - Data do jogo no formato DD/MM/AAAA, ex: "14/03/2026"
 * @returns {string[]} Lista de nomes dos jogadores do time naquele jogo
 */
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

/**
 * Determina o time vencedor a partir do valor bruto extraido do .txt.
 *
 * Tenta primeiro interpretar o texto ("PRETO", "LARANJA" ou "EMPATE").
 * Se o texto nao for reconhecido, usa o placar como desempate.
 *
 * @param {string} winnerRaw    - Valor bruto do campo "TIME VENCEDOR = ..." no .txt
 * @param {number} scorePreto   - Gols do time Preto
 * @param {number} scoreLaranja - Gols do time Laranja
 * @returns {"PRETO" | "LARANJA" | "EMPATE"} Time vencedor ou "EMPATE"
 */
function parseWinner(winnerRaw, scorePreto, scoreLaranja) {
  const raw = (winnerRaw || "").toUpperCase();
  if (raw.includes("PRETO")) return "PRETO";
  if (raw.includes("LARANJA")) return "LARANJA";
  if (raw.includes("EMPATE")) return "EMPATE";

  if (scorePreto > scoreLaranja) return "PRETO";
  if (scoreLaranja > scorePreto) return "LARANJA";
  return "EMPATE";
}

/**
 * Converte uma data no formato brasileiro DD/MM/AAAA para um numero inteiro
 * sortavel AAAAMMDD.
 *
 * Permite ordenar jogos cronologicamente comparando numeros inteiros simples.
 * Retorna 0 para datas invalidas.
 *
 * Exemplo: "14/03/2026" -> 20260314
 *
 * @param {string} brDate - Data no formato DD/MM/AAAA
 * @returns {number} Numero inteiro AAAAMMDD ou 0 se a data for invalida
 */
function toDateCode(brDate) {
  const parts = (brDate || "").split("/");
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts.map((v) => Number(v));
  if (!dd || !mm || !yyyy) return 0;
  return yyyy * 10000 + mm * 100 + dd;
}

/**
 * Verifica se a ultima linha util do arquivo base e o marcador
 * "CICLO FINALIZADO".
 *
 * A comparacao ignora caixa e acentos.
 *
 * @param {string} baseText - Conteudo completo do arquivo Jogos-do-ciclo*.txt
 * @returns {boolean} true quando o arquivo termina com "CICLO FINALIZADO"
 */
function hasClosedCycleMarker(baseText) {
  const lines = String(baseText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return false;
  }

  return normalizeRawName(lines[lines.length - 1]) === "ciclo finalizado";
}

/**
 * Descobre as bases mensais da temporada e retorna os jogos considerados ate a
 * data selecionada.
 *
 * Para o mes selecionado, somente jogos com data <= selectedDate entram no
 * contexto. Para meses anteriores, todos os jogos entram.
 *
 * @param {string} root             - Raiz do projeto
 * @param {string} selectedBasePath - Caminho absoluto da base do mes selecionado
 * @param {string} selectedDate     - Data selecionada no formato DD/MM/AAAA
 * @param {string} selectedBaseText - Conteudo ja carregado da base selecionada
 * @returns {Array<{basePath: string, games: Array<Object>, firstDateCode: number,
 *                  selectedLastDateCode: number, fullLastDateCode: number,
 *                  cycleFinalized: boolean}>}
 */
function loadSeasonMonthContexts(root, selectedBasePath, selectedDate, selectedBaseText) {
  const selectedBaseResolved = path.resolve(selectedBasePath);
  const selectedDateCode = toDateCode(selectedDate);

  const monthDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^paginas-/i.test(entry.name))
    .map((entry) => path.join(root, entry.name));

  const contexts = [];

  for (const monthDir of monthDirs) {
    const candidates = fs
      .readdirSync(monthDir)
      .filter((name) => name.toLowerCase().startsWith("jogos-do-ciclo") && name.toLowerCase().endsWith(".txt"))
      .sort();

    if (candidates.length === 0) {
      continue;
    }

    const basePath = path.resolve(path.join(monthDir, candidates[0]));
    const baseText = basePath === selectedBaseResolved ? selectedBaseText : fs.readFileSync(basePath, "utf8");
    const fullGames = parseGames(baseText);

    if (fullGames.length === 0) {
      continue;
    }

    const firstDateCode = Math.min(...fullGames.map((game) => toDateCode(game.date)));
    if (firstDateCode > selectedDateCode) {
      continue;
    }

    const games = fullGames.filter((game) => toDateCode(game.date) <= selectedDateCode);
    if (games.length === 0) {
      continue;
    }

    contexts.push({
      basePath,
      games,
      firstDateCode,
      selectedLastDateCode: Math.max(...games.map((game) => toDateCode(game.date))),
      fullLastDateCode: Math.max(...fullGames.map((game) => toDateCode(game.date))),
      cycleFinalized: hasClosedCycleMarker(baseText),
    });
  }

  return contexts.sort((a, b) => {
    if (a.firstDateCode !== b.firstDateCode) {
      return a.firstDateCode - b.firstDateCode;
    }
    return a.basePath.localeCompare(b.basePath);
  });
}

/**
 * Interpreta o arquivo base (.txt) e retorna um array estruturado de jogos.
 *
 * ATENCAO - armadilha critica do parser:
 *   O marcador de inicio de bloco de jogo DEVE ser ancorado ao inicio e fim de linha:
 *   /^\s*Jogo do dia\s+\d{2}\/\d{2}\/\d{4}\s*$/gim
 *
 *   Sem as ancoras ^ e $ (com flag m), a regex tambem capturaria linhas internas
 *   como "JOGADORES DO TIME PRETO NO Jogo do dia 14/03/2026", criando blocos
 *   fantasmas com listas de jogadores vazias.
 *
 * Cada objeto de jogo retornado contem:
 *   - date           {string}   Data DD/MM/AAAA
 *   - scorePreto     {number}   Gols do time Preto
 *   - scoreLaranja   {number}   Gols do time Laranja
 *   - winnerRaw      {string}   Texto bruto do campo TIME VENCEDOR
 *   - winner         {string}   "PRETO" | "LARANJA" | "EMPATE"
 *   - presentes      {string[]} Nomes dos presentes
 *   - ausentes       {string[]} Nomes dos ausentes
 *   - playersPreto   {string[]} Jogadores do time Preto
 *   - playersLaranja {string[]} Jogadores do time Laranja
 *   - validationErrors {string[]} Lista de inconsistencias entre presentes/ausentes/times
 *   - block          {string}   Trecho bruto do .txt deste jogo
 *
 * @param {string} baseText - Conteudo completo do arquivo Jogos-do-ciclo*.txt
 * @returns {Array<Object>} Array de objetos de jogo, na ordem em que aparecem no arquivo
 */
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
    const parsedPlayersPreto = parseTeamPlayers(block, "PRETO", current.date);
    const parsedPlayersLaranja = parseTeamPlayers(block, "LARANJA", current.date);
    const validatedGame = validateGamePlayers({
      date: current.date,
      presentes,
      ausentes,
      playersPreto: parsedPlayersPreto,
      playersLaranja: parsedPlayersLaranja,
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

/**
 * Extrai todas as linhas <tr> do corpo (<tbody>) de uma tabela HTML especifica.
 *
 * A tabela e identificada pelo atributo `aria-label` no elemento
 * `<div class="table-wrap" aria-label="...">` que a envolve.
 *
 * Usa regex (sem DOM parser) — adequado para o HTML estatico e previsivel do projeto.
 *
 * @param {string} html      - Conteudo HTML completo do arquivo de classificacao
 * @param {string} ariaLabel - Valor exato do aria-label da tabela desejada,
 *                             ex: "Classificacao individual"
 * @returns {string[]} Array de strings com o markup completo de cada <tr>
 * @throws {Error} Se a tabela nao for localizada no HTML
 */
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

/**
 * Remove todas as tags HTML de uma celula <td> e retorna o texto plano.
 *
 * Colapsa espacos multiplos gerados pela remocao de tags inline (ex: <span>).
 *
 * @param {string} cellHtml - Markup HTML completo de uma celula <td>
 * @returns {string} Texto plano da celula sem nenhuma tag HTML
 */
function cellText(cellHtml) {
  return (cellHtml || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Le a tabela "Classificacao individual" do HTML de classificacao e
 * retorna um array de objetos com os dados atuais de cada jogador.
 *
 * Colunas esperadas (na ordem):
 *   formato novo: [0] rank | [1] nome | [2] pontos | [3] jogos | [4] V | [5] E | [6] D | [7] ausencias | [8] bonus
 *   formato intermediario: [0] rank | [1] nome | [2] pontos | [3] jogos | [4] V | [5] E | [6] D | [7] bonus
 *   formato antigo: [0] rank | [1] nome | [2] pontos | [3] V | [4] E | [5] D | [6] bonus
 *
 * Preserva `originalIndex` para desempate de ordenacao por posicao original.
 *
 * @param {string} html - Conteudo HTML completo da pagina de classificacao
 * @returns {Array<{name: string, points: number, games: number, absences: number,
 *                  v: number, e: number, d: number, bonus: number, originalIndex: number}>}
 * @throws {Error} Se a tabela nao for encontrada ou estiver vazia
 */
function parsePlayersTable(html) {
  const rowsHtml = extractTableRowsFromTbody(html, "Classificacao individual");
  const rows = [];

  for (let i = 0; i < rowsHtml.length; i += 1) {
    const cells = rowsHtml[i].match(/<td[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 7) continue;

    const name = cellText(cells[1]);
    const points = Number(cellText(cells[2]).replace(/[^0-9-]/g, "")) || 0;
    const hasGamesColumn = cells.length >= 8;
    const hasAbsencesColumn = cells.length >= 9;
    const games = hasGamesColumn ? Number(cellText(cells[3]).replace(/[^0-9-]/g, "")) || 0 : 0;
    const v = Number(cellText(cells[hasGamesColumn ? 4 : 3]).replace(/[^0-9-]/g, "")) || 0;
    const e = Number(cellText(cells[hasGamesColumn ? 5 : 4]).replace(/[^0-9-]/g, "")) || 0;
    const d = Number(cellText(cells[hasGamesColumn ? 6 : 5]).replace(/[^0-9-]/g, "")) || 0;
    const absences = hasAbsencesColumn ? Number(cellText(cells[7]).replace(/[^0-9-]/g, "")) || 0 : 0;

    const bonusRaw = cellText(cells[hasAbsencesColumn ? 8 : hasGamesColumn ? 7 : 6]).replace(/\+/g, "");
    const bonus = Number(bonusRaw.replace(/[^0-9-]/g, "")) || 0;

    rows.push({
      name,
      points,
      games: games || v + e + d,
      absences,
      v,
      e,
      d,
      bonus,
      originalIndex: rows.length,
    });
  }

  if (rows.length === 0) {
    throw new Error("Tabela de jogadores vazia ou invalida.");
  }

  return rows;
}

/**
 * Le a tabela "Classificacao dos times" do HTML de classificacao e
 * retorna um array de objetos com os dados atuais dos times.
 *
 * Colunas esperadas (na ordem):
 *   [0] rank | [1] time | [2] J | [3] pontos | [4] V | [5] E | [6] D | [7] aproveitamento
 *
 * O nome do time e inferido por regex (/preto/i ou /laranja/i) do texto da celula.
 *
 * @param {string} html - Conteudo HTML completo da pagina de classificacao
 * @returns {Array<{team: string, j: number, points: number, v: number, e: number, d: number}>}
 * @throws {Error} Se a tabela tiver menos de 2 times (PRETO e LARANJA)
 */
function parseTeamsTable(html) {
  const rowsHtml = extractTableRowsFromTbody(html, "Classificacao dos times");
  const rows = [];

  for (const rowHtml of rowsHtml) {
    const cells = rowHtml.match(/<td[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 8) continue;

    const teamNameRaw = cellText(cells[1]);
    const team = /preto/i.test(teamNameRaw) ? "PRETO" : /laranja/i.test(teamNameRaw) ? "LARANJA" : "";
    if (!team) continue;

    const j = Number(cellText(cells[2]).replace(/[^0-9-]/g, "")) || 0;
    const points = Number(cellText(cells[3]).replace(/[^0-9-]/g, "")) || 0;
    const v = Number(cellText(cells[4]).replace(/[^0-9-]/g, "")) || 0;
    const e = Number(cellText(cells[5]).replace(/[^0-9-]/g, "")) || 0;
    const d = Number(cellText(cells[6]).replace(/[^0-9-]/g, "")) || 0;

    rows.push({ team, j, points, v, e, d });
  }

  if (rows.length < 2) {
    throw new Error("Tabela de times incompleta ou invalida.");
  }

  return rows;
}

/**
 * Conta o numero total de presencas de cada jogador em todos os jogos da base.
 *
 * Percorre a lista `presentes` de cada jogo e acumula um contador por
 * chave normalizada (normalizeName). Usado para calcular o bonus de 100%
 * de presenca: se presencas == total de rodadas, o jogador ganha +1 ponto.
 *
 * @param {Array<Object>} games - Array de jogos retornado por parseGames()
 * @returns {Map<string, number>} Mapa de chave normalizada -> numero de presencas
 */
function buildPresenceCount(games) {
  const counter = new Map();
  for (const game of games) {
    for (const name of game.presentes) {
      const key = normalizeName(name);
      if (!key) continue;
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }
  return counter;
}

/**
 * Conta o bonus acumulado por jogador considerando +1 para cada mes fechado
 * com 100% de presenca.
 *
 * Um mes so entra na conta quando:
 *  - o conjunto de jogos considerados corresponde ao ultimo jogo conhecido
 *    daquele arquivo base; e
 *  - a ultima linha util do arquivo base e "CICLO FINALIZADO".
 *
 * @param {Array<{games: Array<Object>, selectedLastDateCode: number, fullLastDateCode: number,
 *                cycleFinalized: boolean}>} monthContexts
 * @returns {Map<string, number>} Mapa de nome normalizado -> bonus acumulado
 */
function buildAccumulatedBonusCount(monthContexts) {
  const counter = new Map();

  for (const monthContext of monthContexts) {
    if (monthContext.games.length === 0) {
      continue;
    }

    const monthIsClosed =
      monthContext.selectedLastDateCode === monthContext.fullLastDateCode && monthContext.cycleFinalized;
    if (!monthIsClosed) {
      continue;
    }

    const presenceCount = buildPresenceCount(monthContext.games);
    const rounds = monthContext.games.length;

    for (const [key, presencas] of presenceCount.entries()) {
      if (presencas !== rounds) {
        continue;
      }
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }

  return counter;
}

/**
 * Soma o total de rodadas consideradas na temporada ate a selecao atual.
 *
 * @param {Array<{games: Array<Object>}>} monthContexts - Meses considerados
 * @returns {number} Total de jogos acumulados
 */
function countSeasonRounds(monthContexts) {
  return monthContexts.reduce((total, monthContext) => total + monthContext.games.length, 0);
}

/**
 * Calcula o incremento de pontos, V, E e D para cada jogador em um jogo especifico.
 *
 * Regras aplicadas:
 *  - Vencedor: +3 pontos, +1 V
 *  - Empate:   +1 ponto,  +1 E
 *  - Derrotado: 0 pontos, +1 D
 *  - Ausente (nao listado em playersPreto/playersLaranja): nao aparece no mapa
 *
 * A chave do mapa e a versao normalizada do nome (normalizeName).
 * `sourceName` preserva o nome original do .txt para exibicao em alertas.
 *
 * @param {Object} game - Objeto de jogo retornado por parseGames()
 * @returns {Map<string, {points: number, v: number, e: number, d: number,
 *                        played: boolean, sourceName: string}>}
 *          Mapa de chave normalizada para o delta daquele jogador
 */
function buildDeltaForGame(game) {
  const map = new Map();

  function ensure(name) {
    const key = normalizeName(name);
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, { points: 0, v: 0, e: 0, d: 0, played: false, sourceName: name });
    }
    return map.get(key);
  }

  function applyTeam(names, team) {
    for (const name of names) {
      const delta = ensure(name);
      if (!delta) continue;
      delta.played = true;

      if (game.winner === "EMPATE") {
        delta.points += 1;
        delta.e += 1;
      } else if (game.winner === team) {
        delta.points += 3;
        delta.v += 1;
      } else {
        delta.d += 1;
      }
    }
  }

  applyTeam(game.playersPreto, "PRETO");
  applyTeam(game.playersLaranja, "LARANJA");

  return map;
}

/**
 * Escapa os 5 caracteres especiais HTML para insercao segura em markup:
 *   & -> &amp;  < -> &lt;  > -> &gt;  " -> &quot;  ' -> &#39;
 *
 * Trata null/undefined retornando "".
 *
 * @param {string|null|undefined} text - Texto bruto a ser inserido em HTML
 * @returns {string} Texto com caracteres especiais HTML escapados
 */
function htmlEscape(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gera o markup HTML de todas as linhas <tr> da tabela de classificacao individual.
 *
 * Os 3 primeiros colocados recebem classe "podium" na <tr> e "rank top" no span.
 * O bonus e exibido como "+1" (span.bonus.on) ou "0" (span.bonus).
 *
 * @param {Array<{name: string, points: number, games: number, v: number,
 *                e: number, d: number, bonus: number}>} rows - Jogadores ja ordenados por pontuacao
 * @param {number} rounds - Total de rodadas consideradas para calcular ausencias
 * @returns {string} HTML com todas as <tr> concatenadas por newline
 */
function renderPlayersRows(rows, rounds) {
  return rows
    .map((row, index) => {
      const podium = index < 3 ? ' class="podium"' : "";
      const rankClass = index < 3 ? "rank top" : "rank";
      const bonusClass = row.bonus > 0 ? "bonus on" : "bonus";
      const bonusText = row.bonus > 0 ? `+${row.bonus}` : "0";
      const games = row.games !== undefined ? row.games : row.v + row.e + row.d;
      const absences = Math.max(0, rounds - games);

      return [
        `                    <tr${podium}>`,
        `                      <td><span class="${rankClass}">${index + 1}</span></td>`,
        `                      <td>${htmlEscape(row.name)}</td>`,
        `                      <td class="score">${row.points}</td>`,
        `                      <td>${games}</td>`,
        `                      <td>${row.v}</td>`,
        `                      <td>${row.e}</td>`,
        `                      <td>${row.d}</td>`,
        `                      <td>${absences}</td>`,
        `                      <td><span class="${bonusClass}">${bonusText}</span></td>`,
        "                    </tr>",
      ].join("\n");
    })
    .join("\n");
}

/**
 * Gera o markup HTML de todas as linhas <tr> da tabela de classificacao dos times.
 *
 * O lider (index 0) recebe classe "rank top". O aproveitamento e calculado
 * automaticamente como pontos / (J * 3) * 100, com 1 casa decimal.
 * Se J for 0, exibe "0.0%".
 *
 * @param {Array<{team: string, j: number, points: number, v: number,
 *                e: number, d: number}>} rows - Times ja ordenados por pontuacao
 * @returns {string} HTML com todas as <tr> concatenadas por newline
 */
function renderTeamRows(rows) {
  return rows
    .map((row, index) => {
      const podium = index === 0 ? ' class="podium"' : "";
      const rankClass = index === 0 ? "rank top" : "rank";
      const teamClass = row.team === "PRETO" ? "black" : "orange";
      const dotClass = teamClass;
      const label = row.team === "PRETO" ? "Preto" : "Laranja";
      const aproveitamento = row.j > 0 ? ((row.points / (row.j * 3)) * 100).toFixed(1) : "0.0";

      return [
        `                    <tr${podium}>`,
        `                      <td><span class="${rankClass}">${index + 1}</span></td>`,
        `                      <td><span class="team ${teamClass}"><span class="dotMini ${dotClass}"></span>${label}</span></td>`,
        `                      <td>${row.j}</td>`,
        `                      <td class="score">${row.points}</td>`,
        `                      <td>${row.v}</td>`,
        `                      <td>${row.e}</td>`,
        `                      <td>${row.d}</td>`,
        `                      <td>${aproveitamento}%</td>`,
        "                    </tr>",
      ].join("\n");
    })
    .join("\n");
}

/**
 * Substitui o conteudo do <tbody> de uma tabela especifica no HTML,
 * identificada pelo aria-label do elemento <div class="table-wrap">.
 *
 * Preserva as tags <tbody> e </tbody> originais, substituindo apenas
 * o conteudo interno com o novo HTML de linhas.
 *
 * @param {string} html          - Conteudo HTML completo a ser modificado
 * @param {string} ariaLabel     - Valor do aria-label da tabela alvo
 * @param {string} rowsHtml      - Novo HTML com as linhas <tr> do tbody
 * @param {string} closingIndent - Indentacao de espacos antes do </tbody>
 * @returns {string} HTML atualizado
 * @throws {Error} Se a tabela nao for encontrada
 */
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

/**
 * Substitui o conteudo do <thead> de uma tabela especifica no HTML,
 * identificada pelo aria-label do elemento <div class="table-wrap">.
 *
 * @param {string} html          - Conteudo HTML completo a ser modificado
 * @param {string} ariaLabel     - Valor do aria-label da tabela alvo
 * @param {string} headHtml      - Novo HTML interno do thead
 * @param {string} closingIndent - Indentacao de espacos antes do </thead>
 * @returns {string} HTML atualizado
 * @throws {Error} Se a tabela nao for encontrada
 */
function replaceThead(html, ariaLabel, headHtml, closingIndent) {
  const regex = new RegExp(
    "(<div class=\\\"table-wrap\\\" aria-label=\\\"" +
      escapeRegExp(ariaLabel) +
      "\\\">[\\s\\S]*?<thead>)([\\s\\S]*?)(</thead>)",
    "i"
  );

  if (!regex.test(html)) {
    throw new Error("Nao foi possivel atualizar o cabecalho da tabela: " + ariaLabel);
  }

  return html.replace(regex, `$1\n${headHtml}\n${closingIndent}$3`);
}

/**
 * Orquestra todas as atualizacoes no HTML da pagina de classificacao.
 *
 * Operacoes realizadas:
 *  1. Atualiza o numero de Rodadas no chip "<b>Rodadas:</b> N"
 *  2. Atualiza os chips de desempenho "<b>Laranja:</b> NV NE ND" e "<b>Preto:</b> ..."
 *  3. Substitui o tbody da tabela "Classificacao individual" com as linhas atualizadas
 *  4. Substitui o tbody da tabela "Classificacao dos times" com as linhas atualizadas
 *  5. Registra no footer a data do jogo usado na ultima atualizacao
 *
 * @param {string} classificationHtml   - Conteudo HTML atual da classificacao
 * @param {Array<Object>} updatedPlayers - Jogadores atualizados e ordenados
 * @param {Array<Object>} updatedTeams   - Times atualizados e ordenados
 * @param {number} rounds                - Numero total de rodadas (jogos na base)
 * @param {string} updatedDate           - Data do jogo aplicado na atualizacao
 * @returns {string} HTML da classificacao completamente atualizado
 */
function updateClassificationHtml(classificationHtml, updatedPlayers, updatedTeams, rounds, updatedDate) {
  let html = classificationHtml;
  const playersHeadHtml = [
    "                    <tr>",
    "                      <th>Pos</th>",
    "                      <th>Jogador</th>",
    "                      <th>Pontos</th>",
    "                      <th>Jogos</th>",
    "                      <th>V</th>",
    "                      <th>E</th>",
    "                      <th>D</th>",
    "                      <th>Aus&ecirc;ncia</th>",
    "                      <th>Bonus 100%</th>",
    "                    </tr>",
  ].join("\n");

  html = html.replace(/(<b>Rodadas:<\/b>\s*)\d+/i, `$1${rounds}`);

  const laranja = updatedTeams.find((row) => row.team === "LARANJA");
  const preto = updatedTeams.find((row) => row.team === "PRETO");

  html = html.replace(
    /(<b>Laranja:<\/b>\s*)\d+V\s+\d+E\s+\d+D/i,
    `$1${laranja.v}V ${laranja.e}E ${laranja.d}D`
  );
  html = html.replace(
    /(<b>Preto:<\/b>\s*)\d+V\s+\d+E\s+\d+D/i,
    `$1${preto.v}V ${preto.e}E ${preto.d}D`
  );

  html = replaceThead(html, "Classificacao individual", playersHeadHtml, "                  ");
  html = replaceTbody(html, "Classificacao individual", renderPlayersRows(updatedPlayers, rounds), "                  ");
  html = replaceTbody(html, "Classificacao dos times", renderTeamRows(updatedTeams), "                  ");

  const updateStamp = `<div class="update-stamp">Ultima atualizacao: jogo de ${htmlEscape(updatedDate)}.</div>`;
  if (/<div class="update-stamp">[\s\S]*?<\/div>/i.test(html)) {
    html = html.replace(/<div class="update-stamp">[\s\S]*?<\/div>/i, updateStamp);
  } else if (/<footer>[\s\S]*?<\/footer>/i.test(html)) {
    html = html.replace(/(<footer>\s*[\s\S]*?)(\s*<\/footer>)/i, `$1\n      ${updateStamp}$2`);
  } else {
    throw new Error("Nao foi possivel localizar o footer da pagina de classificacao.");
  }

  return html;
}

/**
 * Incrementa as estatisticas de ambos os times com base no resultado de um jogo.
 *
 * Para cada time: J+1 (independente do resultado).
 * Vencedor: V+1, pontos+3.
 * Derrotado: D+1.
 * Empate: E+1 e pontos+1 para ambos.
 *
 * Retorna os times reordenados: maior pontuacao primeiro;
 * desempate por V; desempate final por nome.
 *
 * @param {Array<{team: string, j: number, points: number, v: number, e: number, d: number}>} currentRows
 *   Estado atual dos times (vindo de parseTeamsTable)
 * @param {"PRETO" | "LARANJA" | "EMPATE"} winner - Resultado do jogo
 * @returns {Array<Object>} Novo array de times com estatisticas atualizadas e reordenados
 * @throws {Error} Se PRETO ou LARANJA nao forem encontrados nos dados atuais
 */
function updateTeamStats(currentRows, winner) {
  const map = new Map(currentRows.map((row) => [row.team, { ...row }]));
  const preto = map.get("PRETO");
  const laranja = map.get("LARANJA");
  if (!preto || !laranja) {
    throw new Error("Times Preto/Laranja nao encontrados na classificacao.");
  }

  preto.j += 1;
  laranja.j += 1;

  if (winner === "PRETO") {
    preto.v += 1;
    preto.points += 3;
    laranja.d += 1;
  } else if (winner === "LARANJA") {
    laranja.v += 1;
    laranja.points += 3;
    preto.d += 1;
  } else {
    preto.e += 1;
    laranja.e += 1;
    preto.points += 1;
    laranja.points += 1;
  }

  return [preto, laranja].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.v !== a.v) return b.v - a.v;
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return 0;
  });
}

/**
 * Aplica o delta de um jogo a todos os jogadores e recalcula o bonus acumulado.
 *
 * Para cada jogador da classificacao:
 *  1. Busca o delta pelo nome normalizado (zero se ausente no jogo)
 *  2. Remove o bonus anterior (para recalculo limpo)
 *  3. Soma pontos base + delta.points + novo bonus
 *  4. Incrementa V, E, D conforme o delta
 *
 * Bonus acumulado: +1 por cada mes fechado em que o jogador teve 100% de presenca.
 *
 * Ordem de retorno: pontos desc, V desc, E desc, D asc, posicao original asc.
 *
 * @param {Array<Object>} currentPlayers    - Jogadores atuais (de parsePlayersTable)
 * @param {Map<string, Object>} deltaByName - Delta do jogo (de buildDeltaForGame)
 * @param {Map<string, number>} bonusByName - Bonus acumulado por jogador na temporada
 * @returns {Array<Object>} Jogadores atualizados e reordenados
 */
function buildUpdatedPlayers(currentPlayers, deltaByName, bonusByName) {
  const updated = currentPlayers.map((row) => {
    const key = normalizeName(row.name);
    const delta = deltaByName.get(key) || { points: 0, v: 0, e: 0, d: 0 };
    const bonus = bonusByName.get(key) || 0;

    const basePoints = row.points - row.bonus;
    const points = basePoints + delta.points + bonus;

    return {
      ...row,
      points,
      games: row.v + delta.v + row.e + delta.e + row.d + delta.d,
      v: row.v + delta.v,
      e: row.e + delta.e,
      d: row.d + delta.d,
      bonus,
    };
  });

  return updated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.v !== a.v) return b.v - a.v;
    if (b.e !== a.e) return b.e - a.e;
    if (a.d !== b.d) return a.d - b.d;
    return a.originalIndex - b.originalIndex;
  });
}

/**
 * Retorna um timestamp no formato AAAAMMDD-HHmmss para uso em nomes de backup.
 *
 * Exemplo: "20260314-193045"
 *
 * @returns {string} Timestamp formatado como AAAAMMDD-HHmmss
 */
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

/**
 * Salva `content` em `filePath` criando um backup automatico antes de sobrescrever.
 *
 * Se o conteudo novo for identico ao atual, nao cria backup nem grava (sem operacao).
 * Backup: copia o arquivo atual para `<filePath>.bak.AAAAMMDD-HHmmss`.
 *
 * @param {string} filePath - Caminho absoluto do arquivo a ser gravado
 * @param {string} content  - Novo conteudo a ser escrito no arquivo
 * @returns {{ changed: boolean, backupPath: string }}
 *          `changed`: indica se o arquivo foi alterado;
 *          `backupPath`: caminho do backup criado (vazio se nao houve alteracao)
 */
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

/**
 * Resolve todos os caminhos de arquivo a partir dos argumentos CLI.
 *
 * Se `--base` nao for informado, faz autodescoberta buscando o primeiro
 * arquivo "Jogos-do-ciclo*.txt" (case-insensitive, ordem alfabetica)
 * dentro da pasta do mes.
 *
 * @param {Object} args - Objeto retornado por parseArgs()
 * @returns {{ root: string, monthDir: string, basePath: string,
 *             classificacaoPath: string }}
 * @throws {Error} Se a pasta do mes nao existir ou nenhum .txt for encontrado
 */
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

  const classificacaoPath = path.resolve(root, args.classificacao);

  return {
    root,
    monthDir,
    basePath,
    classificacaoPath,
  };
}

/**
 * Ponto de entrada principal do script.
 *
 * Fluxo de execucao:
 *  1. Parse dos argumentos CLI
 *  2. Resolucao de caminhos (base e classificacao)
 *  3. Leitura e parse do arquivo base (.txt)
 *  4. Selecao do jogo (por --data ou o ultimo jogo disponivel na base)
 *  5. Leitura da classificacao atual
 *  6. Calculo do delta de pontos/V/E/D para o jogo selecionado
 *  7. Calculo do bonus acumulado por mes fechado
 *  8. Atualizacao dos jogadores e times
 *  9. Renderizacao do HTML atualizado da classificacao
 * 10. Modo preview: exibe o resumo e encerra sem gravar
 * 11. Modo apply: salva arquivo com backup e exibe confirmacao
 */
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
  if (!fs.existsSync(paths.classificacaoPath)) throw new Error(`Arquivo classificacao nao encontrado: ${paths.classificacaoPath}`);

  const baseText = fs.readFileSync(paths.basePath, "utf8");
  const games = parseGames(baseText);
  if (games.length === 0) {
    throw new Error("Nenhum jogo encontrado no arquivo base.");
  }

  let selectedGame;
  if (args.data) {
    selectedGame = games.find((g) => g.date === args.data);
    if (!selectedGame) {
      throw new Error(`Jogo nao encontrado para a data ${args.data}.`);
    }
  } else {
    selectedGame = [...games].sort((a, b) => toDateCode(b.date) - toDateCode(a.date))[0];
  }

  if (selectedGame.playersPreto.length === 0 && selectedGame.playersLaranja.length === 0) {
    throw new Error("Nao foi possivel extrair jogadores do jogo selecionado na base.");
  }

  if (selectedGame.validationErrors && selectedGame.validationErrors.length > 0) {
    throw new Error(
      `O jogo ${selectedGame.date} tem inconsistencias entre Presentes/Ausentes e os times:\n- ${selectedGame.validationErrors.join(
        "\n- "
      )}`
    );
  }

  const classificationHtml = fs.readFileSync(paths.classificacaoPath, "utf8");

  const currentPlayers = parsePlayersTable(classificationHtml);
  const currentTeams = parseTeamsTable(classificationHtml);
  const knownByNormalized = new Map(currentPlayers.map((p) => [normalizeName(p.name), p.name]));

  const seasonMonthContexts = loadSeasonMonthContexts(paths.root, paths.basePath, selectedGame.date, baseText);
  const seasonRounds = countSeasonRounds(seasonMonthContexts);
  const bonusByName = buildAccumulatedBonusCount(seasonMonthContexts);
  const deltaByName = buildDeltaForGame(selectedGame);

  const unknownPlayers = [];
  for (const [key, value] of deltaByName.entries()) {
    if (!knownByNormalized.has(key)) {
      unknownPlayers.push(value.sourceName);
    }
  }

  const updatedPlayers = buildUpdatedPlayers(currentPlayers, deltaByName, bonusByName);
  const updatedTeams = updateTeamStats(currentTeams, selectedGame.winner);

  const updatedClassificationHtml = updateClassificationHtml(
    classificationHtml,
    updatedPlayers,
    updatedTeams,
    seasonRounds,
    selectedGame.date
  );

  const previewTop = updatedPlayers.slice(0, 5);

  console.log("----------------------------------------");
  console.log("Resumo da execucao");
  console.log("----------------------------------------");
  console.log(`Mes: ${args.mes}`);
  console.log(`Data selecionada: ${selectedGame.date}`);
  console.log(`Placar: Preto ${selectedGame.scorePreto} x ${selectedGame.scoreLaranja} Laranja`);
  console.log(`Vencedor: ${selectedGame.winner}`);
  console.log(`Rodadas totais consideradas: ${seasonRounds}`);
  console.log("");

  console.log("Top 5 apos atualizacao:");
  previewTop.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.name} - ${p.points} pts (V${p.v} E${p.e} D${p.d}, bonus ${p.bonus})`);
  });

  if (unknownPlayers.length > 0) {
    console.log("");
    console.log("Aviso: jogadores nao encontrados na tabela da classificacao:");
    uniqueNames(unknownPlayers).forEach((name) => console.log(`- ${name}`));
  }

  if (args.modo === "preview") {
    console.log("");
    console.log("Preview concluido. Nenhum arquivo foi alterado.");
    return;
  }

  const classResult = saveWithBackup(paths.classificacaoPath, updatedClassificationHtml);

  console.log("");
  console.log("Arquivo atualizado:");
  console.log(
    `- Classificacao: ${classResult.changed ? "alterada" : "sem alteracao"}${
      classResult.backupPath ? ` (backup: ${classResult.backupPath})` : ""
    }`
  );
}

try {
  main();
} catch (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}
