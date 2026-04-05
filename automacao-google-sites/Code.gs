const SPREADSHEET_ID = '';

const SHEETS = Object.freeze({
  PLAYERS: 'Jogadores',
  GAMES: 'Jogos',
  PRESENCE: 'Presencas',
});

const TEAM = Object.freeze({
  ORANGE: 'Laranja',
  BLACK: 'Preto',
});

function doGet(e) {
  const today = new Date();
  const year = toInt_(e && e.parameter && e.parameter.year, today.getFullYear());
  const month = clampMonth_(toInt_(e && e.parameter && e.parameter.month, today.getMonth() + 1));
  const model = buildModel_(year, month);

  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.model = model;

  return tpl
    .evaluate()
    .setTitle('Perebas FC - ' + model.periodLabel)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui
    .createMenu('Perebas FC')
    .addItem('Criar/Atualizar abas modelo', 'setupModeloPerebas')
    .addItem('Carregar jogadores padrao', 'popularJogadoresPadraoPerebas')
    .addItem('Carregar exemplo Fevereiro/2026', 'popularExemploFevereiro2026')
    .addItem('Validar dados do mes atual', 'mostrarValidacaoMesAtual')
    .addToUi();
}

function setupModeloPerebas() {
  const ss = getSpreadsheet_();

  const players = ensureSheet_(ss, SHEETS.PLAYERS);
  const games = ensureSheet_(ss, SHEETS.GAMES);
  const presence = ensureSheet_(ss, SHEETS.PRESENCE);

  players.getRange('A1:D1').setValues([['Nome', 'Time', 'Ativo', 'Alias (opcional, separado por virgula)']]);
  games.getRange('A1:C1').setValues([['Data', 'Gols Laranja', 'Gols Preto']]);
  presence.getRange('A1:B1').setValues([['Data', 'Jogador']]);

  players.setFrozenRows(1);
  games.setFrozenRows(1);
  presence.setFrozenRows(1);

  players.autoResizeColumns(1, 4);
  games.autoResizeColumns(1, 3);
  presence.autoResizeColumns(1, 2);

  const teamValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList([TEAM.ORANGE, TEAM.BLACK], true)
    .setAllowInvalid(false)
    .build();
  players.getRange('B2:B5000').setDataValidation(teamValidation);

  const playerValidation = SpreadsheetApp.newDataValidation()
    .requireValueInRange(players.getRange('A2:A5000'), true)
    .setAllowInvalid(true)
    .build();
  presence.getRange('B2:B10000').setDataValidation(playerValidation);

  SpreadsheetApp.getUi().alert('Abas modelo criadas/atualizadas com sucesso.');
}

function popularJogadoresPadraoPerebas() {
  const ss = getSpreadsheet_();
  const players = ensureSheet_(ss, SHEETS.PLAYERS);

  const rows = [
    ['Everton', TEAM.ORANGE, true, ''],
    ['Rogerio', TEAM.ORANGE, true, 'Rogério'],
    ['Cleberson', TEAM.ORANGE, true, 'Cleber'],
    ['Derval', TEAM.ORANGE, true, ''],
    ['Jean', TEAM.ORANGE, true, ''],
    ['Kistt', TEAM.ORANGE, true, ''],
    ['Chico', TEAM.ORANGE, true, ''],
    ['Domingos', TEAM.ORANGE, true, ''],
    ['Daniel', TEAM.ORANGE, true, ''],
    ['Gabriel', TEAM.BLACK, true, ''],
    ['Tacio', TEAM.BLACK, true, 'Tácio'],
    ['Elias', TEAM.BLACK, true, ''],
    ['Darci', TEAM.BLACK, true, ''],
    ['Leone', TEAM.BLACK, true, ''],
    ['Alemao', TEAM.BLACK, true, 'Alemão'],
    ['Henrique', TEAM.BLACK, true, 'Henirque'],
    ['Pavesi', TEAM.BLACK, true, ''],
    ['Alex', TEAM.BLACK, true, ''],
  ];

  players.getRange('A2:D5000').clearContent();
  players.getRange(2, 1, rows.length, 4).setValues(rows);
  players.autoResizeColumns(1, 4);

  SpreadsheetApp.getUi().alert('Jogadores padrao carregados (18 atletas).');
}

function popularExemploFevereiro2026() {
  const ss = getSpreadsheet_();
  setupModeloPerebas();
  popularJogadoresPadraoPerebas();

  const games = ensureSheet_(ss, SHEETS.GAMES);
  const presence = ensureSheet_(ss, SHEETS.PRESENCE);

  const gameRows = [
    [new Date(2026, 1, 7), 15, 7],
    [new Date(2026, 1, 14), 7, 10],
    [new Date(2026, 1, 21), 12, 9],
    [new Date(2026, 1, 28), 6, 6],
  ];

  const byDate = {
    '2026-02-07': ['Elias', 'Kistt', 'Jean', 'Leone', 'Tacio', 'Cleberson', 'Alemao', 'Chico', 'Henrique', 'Everton', 'Rogerio', 'Derval', 'Gabriel', 'Darci'],
    '2026-02-14': ['Elias', 'Daniel', 'Leone', 'Domingos', 'Jean', 'Derval', 'Kistt', 'Cleberson', 'Alemao', 'Darci'],
    '2026-02-21': ['Elias', 'Cleberson', 'Leone', 'Everton', 'Kistt', 'Jean', 'Daniel', 'Henrique', 'Derval', 'Alex', 'Rogerio', 'Chico', 'Gabriel'],
    '2026-02-28': ['Tacio', 'Henrique', 'Jean', 'Kistt', 'Elias', 'Chico', 'Alemao', 'Everton', 'Daniel', 'Leone', 'Cleberson', 'Darci'],
  };

  games.getRange('A2:C5000').clearContent();
  games.getRange(2, 1, gameRows.length, 3).setValues(gameRows);
  games.getRange('A2:A5').setNumberFormat('dd/MM/yyyy');

  const presenceRows = [];
  Object.keys(byDate).forEach(function(dateKey) {
    const date = parseIsoDate_(dateKey);
    byDate[dateKey].forEach(function(name) {
      presenceRows.push([date, name]);
    });
  });

  presence.getRange('A2:B10000').clearContent();
  presence.getRange(2, 1, presenceRows.length, 2).setValues(presenceRows);
  presence.getRange(2, 1, presenceRows.length, 1).setNumberFormat('dd/MM/yyyy');

  SpreadsheetApp.getUi().alert('Exemplo de Fevereiro/2026 carregado em Jogos e Presencas.');
}

function mostrarValidacaoMesAtual() {
  const today = new Date();
  const model = buildModel_(today.getFullYear(), today.getMonth() + 1);
  const lines = model.warnings.length ? model.warnings.slice(0, 20) : ['Nenhum alerta encontrado.'];
  const suffix = model.warnings.length > 20 ? '\n... e mais ' + (model.warnings.length - 20) + ' alerta(s).' : '';
  SpreadsheetApp.getUi().alert('Validacao ' + model.periodLabel, lines.join('\n') + suffix, SpreadsheetApp.getUi().ButtonSet.OK);
}

function buildModel_(year, month) {
  const ss = getSpreadsheet_();
  const warnings = [];
  const tz = Session.getScriptTimeZone() || 'America/Sao_Paulo';

  const playersPack = readPlayers_(ss, warnings);
  const games = readGames_(ss, year, month, warnings, tz);
  const presencePack = readPresence_(ss, year, month, playersPack.aliasToKey, warnings, tz);

  const ranking = computeRanking_(playersPack.list, games, presencePack.byDate);
  const teams = computeTeams_(games);
  const gamesView = buildGamesView_(games, playersPack.byKey, presencePack.byDate, warnings);

  return {
    periodLabel: monthNamePt_(month) + '/' + year,
    year: year,
    month: month,
    gamesCount: games.length,
    playersCount: playersPack.list.length,
    ranking: ranking,
    teams: teams,
    games: gamesView,
    warnings: warnings,
    generatedAt: Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'),
  };
}

function readPlayers_(ss, warnings) {
  const sheet = ensureSheet_(ss, SHEETS.PLAYERS);
  const values = sheet.getDataRange().getValues();
  const list = [];
  const byKey = {};
  const aliasToKey = {};

  for (let i = 1; i < values.length; i++) {
    const rawName = trimString_(values[i][0]);
    if (!rawName) continue;

    const team = normalizeTeam_(values[i][1]);
    if (!team) {
      warnings.push('Jogador sem time valido: "' + rawName + '" (aba Jogadores, linha ' + (i + 1) + ').');
      continue;
    }

    const activeCell = values[i][2];
    const active = activeCell === '' || activeCell === null ? true : Boolean(activeCell);
    if (!active) continue;

    const key = normalizeKey_(rawName);
    if (!key) continue;

    if (byKey[key]) {
      warnings.push('Nome duplicado em Jogadores: "' + rawName + '".');
      continue;
    }

    const player = {
      key: key,
      name: rawName,
      team: team,
    };

    list.push(player);
    byKey[key] = player;
    aliasToKey[key] = key;

    const aliasCell = trimString_(values[i][3]);
    if (aliasCell) {
      aliasCell.split(',').forEach(function(aliasRaw) {
        const alias = normalizeKey_(aliasRaw);
        if (!alias) return;
        if (aliasToKey[alias] && aliasToKey[alias] !== key) {
          warnings.push('Alias em conflito: "' + aliasRaw.trim() + '".');
          return;
        }
        aliasToKey[alias] = key;
      });
    }
  }

  list.sort(function(a, b) {
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  return {
    list: list,
    byKey: byKey,
    aliasToKey: aliasToKey,
  };
}

function readGames_(ss, year, month, warnings, tz) {
  const sheet = ensureSheet_(ss, SHEETS.GAMES);
  const values = sheet.getDataRange().getValues();
  const games = [];

  for (let i = 1; i < values.length; i++) {
    const date = parseAnyDate_(values[i][0]);
    if (!date) continue;
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;

    const goalsOrange = Number(values[i][1]);
    const goalsBlack = Number(values[i][2]);
    if (!isFinite(goalsOrange) || !isFinite(goalsBlack)) {
      warnings.push('Placar invalido em Jogos, linha ' + (i + 1) + '.');
      continue;
    }

    let winnerTeam = null;
    if (goalsOrange > goalsBlack) winnerTeam = TEAM.ORANGE;
    if (goalsBlack > goalsOrange) winnerTeam = TEAM.BLACK;

    games.push({
      date: date,
      dateKey: dateKey_(date, tz),
      displayDate: Utilities.formatDate(date, tz, 'dd/MM/yyyy'),
      goalsOrange: goalsOrange,
      goalsBlack: goalsBlack,
      winnerTeam: winnerTeam,
    });
  }

  games.sort(function(a, b) {
    return a.date.getTime() - b.date.getTime();
  });

  return games;
}

function readPresence_(ss, year, month, aliasToKey, warnings, tz) {
  const sheet = ensureSheet_(ss, SHEETS.PRESENCE);
  const values = sheet.getDataRange().getValues();
  const byDate = {};

  for (let i = 1; i < values.length; i++) {
    const date = parseAnyDate_(values[i][0]);
    if (!date) continue;
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;

    const rawName = trimString_(values[i][1]);
    if (!rawName) continue;

    const normalized = normalizeKey_(rawName);
    const playerKey = aliasToKey[normalized];
    if (!playerKey) {
      warnings.push('Nome em Presencas nao encontrado em Jogadores: "' + rawName + '" (linha ' + (i + 1) + ').');
      continue;
    }

    const key = dateKey_(date, tz);
    if (!byDate[key]) byDate[key] = {};
    byDate[key][playerKey] = true;
  }

  return { byDate: byDate };
}

function computeRanking_(players, games, presenceByDate) {
  const stats = {};
  players.forEach(function(player) {
    stats[player.key] = {
      player: player,
      presence: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      base: 0,
      bonus: 0,
      points: 0,
    };
  });

  games.forEach(function(game) {
    const presentMap = presenceByDate[game.dateKey] || {};
    players.forEach(function(player) {
      if (!presentMap[player.key]) return;
      const s = stats[player.key];
      s.presence += 1;
      if (!game.winnerTeam) {
        s.draws += 1;
        s.base += 1;
      } else if (player.team === game.winnerTeam) {
        s.wins += 1;
        s.base += 3;
      } else {
        s.losses += 1;
      }
    });
  });

  const rows = players.map(function(player) {
    const s = stats[player.key];
    if (games.length > 0 && s.presence === games.length) s.bonus = 1;
    s.points = s.base + s.bonus;
    return {
      key: player.key,
      name: player.name,
      team: player.team,
      presence: s.presence,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      base: s.base,
      bonus: s.bonus,
      points: s.points,
    };
  });

  rows.sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.draws !== a.draws) return b.draws - a.draws;
    if (b.presence !== a.presence) return b.presence - a.presence;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  rows.forEach(function(row, index) {
    row.position = index + 1;
  });

  return rows;
}

function computeTeams_(games) {
  const table = {};
  table[TEAM.ORANGE] = initTeamStats_(TEAM.ORANGE);
  table[TEAM.BLACK] = initTeamStats_(TEAM.BLACK);

  games.forEach(function(game) {
    const orange = table[TEAM.ORANGE];
    const black = table[TEAM.BLACK];

    orange.played += 1;
    black.played += 1;

    orange.gf += game.goalsOrange;
    orange.ga += game.goalsBlack;
    black.gf += game.goalsBlack;
    black.ga += game.goalsOrange;

    if (!game.winnerTeam) {
      orange.draws += 1;
      black.draws += 1;
      orange.points += 1;
      black.points += 1;
      return;
    }

    if (game.winnerTeam === TEAM.ORANGE) {
      orange.wins += 1;
      black.losses += 1;
      orange.points += 3;
      return;
    }

    black.wins += 1;
    orange.losses += 1;
    black.points += 3;
  });

  const rows = [table[TEAM.ORANGE], table[TEAM.BLACK]];
  rows.forEach(function(row) {
    row.goalDiff = row.gf - row.ga;
    row.aproveitamento = row.played ? ((row.points / (row.played * 3)) * 100).toFixed(1) : '0.0';
  });

  rows.sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    return b.gf - a.gf;
  });

  rows.forEach(function(row, index) {
    row.position = index + 1;
  });

  return rows;
}

function buildGamesView_(games, playersByKey, presenceByDate, warnings) {
  return games.map(function(game) {
    const presentMap = presenceByDate[game.dateKey] || {};
    const presentKeys = Object.keys(presentMap);

    if (!presentKeys.length) {
      warnings.push('Sem presencas registradas para o jogo de ' + game.displayDate + '.');
    }

    const playersOrange = [];
    const playersBlack = [];

    presentKeys.forEach(function(playerKey) {
      const player = playersByKey[playerKey];
      if (!player) return;

      const points = !game.winnerTeam ? 1 : player.team === game.winnerTeam ? 3 : 0;
      const item = {
        name: player.name,
        points: points,
      };

      if (player.team === TEAM.ORANGE) playersOrange.push(item);
      if (player.team === TEAM.BLACK) playersBlack.push(item);
    });

    playersOrange.sort(function(a, b) {
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    playersBlack.sort(function(a, b) {
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    return {
      displayDate: game.displayDate,
      goalsOrange: game.goalsOrange,
      goalsBlack: game.goalsBlack,
      winnerTeam: game.winnerTeam,
      playersOrange: playersOrange,
      playersBlack: playersBlack,
    };
  });
}

function initTeamStats_(teamName) {
  return {
    team: teamName,
    played: 0,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    goalDiff: 0,
    aproveitamento: '0.0',
    position: 0,
  };
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Defina SPREADSHEET_ID no Code.gs para usar este projeto em modo standalone.');
  }
  return ss;
}

function ensureSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function normalizeTeam_(value) {
  const key = normalizeKey_(trimString_(value));
  if (key === 'laranja') return TEAM.ORANGE;
  if (key === 'preto') return TEAM.BLACK;
  return '';
}

function normalizeKey_(value) {
  return trimString_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseAnyDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;

    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  return null;
}

function parseIsoDate_(yyyyMmDd) {
  const parts = yyyyMmDd.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function dateKey_(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function toInt_(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? Math.trunc(n) : fallback;
}

function clampMonth_(month) {
  if (month < 1) return 1;
  if (month > 12) return 12;
  return month;
}

function trimString_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function monthNamePt_(month) {
  const names = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return names[Math.max(1, Math.min(12, month)) - 1];
}
