const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");

const pages = [
  { source: "pagina-home/pagina-inicio", route: "", title: "Home", section: "Principal" },
  { source: "pagina-home/classificacao-jogadores", route: "classificacao-jogadores", title: "Classificacao de Jogadores", section: "Principal" },
  { source: "pagina-home/regras-votacao", route: "regras-votacao", title: "Regras de Votacao", section: "Principal" },
  { source: "artilharia/artilharia", route: "artilharia", title: "Artilharia", section: "Estatisticas" },
  { source: "artilharia/dash", route: "artilharia/dashboard", title: "Dashboard da Artilharia", section: "Estatisticas" },
  { source: "paginas-fevereiro/resultados", route: "fevereiro/resultados", title: "Resultados de Fevereiro", section: "Fevereiro" },
  { source: "paginas-fevereiro/times-fixos-fevereiro", route: "fevereiro/times-fixos", title: "Times Fixos de Fevereiro", section: "Fevereiro" },
  { source: "paginas-fevereiro/pagina-relatorio-presenca-fevereiro", route: "fevereiro/presenca", title: "Relatorio de Presenca de Fevereiro", section: "Fevereiro" },
  { source: "paginas-fevereiro/destaque-do-mes", route: "fevereiro/destaque-do-mes", title: "Destaque do Mes de Fevereiro", section: "Fevereiro" },
  { source: "paginas-marco/resultados", route: "marco/resultados", title: "Resultados de Marco", section: "Marco" },
  { source: "paginas-marco/times-fixos-marco", route: "marco/times-fixos", title: "Times Fixos de Marco", section: "Marco" },
  { source: "paginas-marco/pagina-relatorio-presenca-marco", route: "marco/presenca", title: "Relatorio de Presenca de Marco", section: "Marco" },
  { source: "paginas-marco/destaque-do-mes", route: "marco/destaque-do-mes", title: "Destaque do Mes de Marco", section: "Marco" },
  { source: "paginas-marco/destaque-do-mes-pendente.html", route: "marco/destaque-do-mes-pendente", title: "Destaque do Mes Pendente de Marco", section: "Marco" },
  { source: "paginas-abril/resultados", route: "abril/resultados", title: "Resultados de Abril", section: "Abril" },
  { source: "paginas-abril/times-fixos-abril", route: "abril/times-fixos", title: "Times Fixos de Abril", section: "Abril" },
  { source: "paginas-abril/pagina-relatorio-presenca-abril", route: "abril/presenca", title: "Relatorio de Presenca de Abril", section: "Abril" },
  { source: "paginas-abril/destaque-do-mes", route: "abril/destaque-do-mes", title: "Destaque do Mes de Abril", section: "Abril" },
  { source: "paginas-abril/destaque-do-mes-pendente.html", route: "abril/destaque-do-mes-pendente", title: "Destaque do Mes Pendente de Abril", section: "Abril" }
];

function parseArgs(argv) {
  const options = {
    siteUrl: process.env.SITE_URL || null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--site-url") {
      options.siteUrl = argv[index + 1] || null;
      index += 1;
    }
  }

  return options;
}

function normalizeSiteUrl(siteUrl) {
  if (!siteUrl) {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository || !repository.includes("/")) {
      return null;
    }

    const [owner, name] = repository.split("/");
    return `https://${owner.toLowerCase()}.github.io/${name}`;
  }

  return siteUrl.replace(/\/+$/, "");
}

function getBasePath(siteUrl) {
  if (!siteUrl) {
    return "";
  }

  const parsed = new URL(siteUrl);
  return parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
}

function buildHref(basePath, route) {
  const normalizedRoute = route === "/" ? "/" : route;
  return `${basePath}${normalizedRoute}` || "/";
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureHtmlDocument(source, content) {
  const sample = content.toLowerCase();
  if (!sample.includes("<!doctype html") || !sample.includes("<html") || !sample.includes("</html>")) {
    throw new Error(`Arquivo ${source} nao parece ser um documento HTML completo.`);
  }
}

function readHtmlFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Arquivo de origem nao encontrado: ${relativePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  ensureHtmlDocument(relativePath, content);
  return content;
}

function writeRoute(route, html) {
  const targetDir = route ? path.join(distDir, route) : distDir;
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "index.html"), html, "utf8");
}

function buildManifest(siteUrl) {
  const builtAt = new Date().toISOString();
  const routes = pages.map((page) => ({
    title: page.title,
    section: page.section,
    source: page.source,
    route: page.route ? `/${page.route}/` : "/",
    url: siteUrl ? `${siteUrl}${page.route ? `/${page.route}/` : "/"}` : null
  }));

  fs.writeFileSync(
    path.join(distDir, "routes.json"),
    JSON.stringify({ builtAt, siteUrl, routes }, null, 2),
    "utf8"
  );

  return routes;
}

function buildSiteMapPage(routes, siteUrl, basePath) {
  const groups = new Map();

  for (const route of routes) {
    if (!groups.has(route.section)) {
      groups.set(route.section, []);
    }
    groups.get(route.section).push(route);
  }

  const sectionsMarkup = Array.from(groups.entries())
    .map(([section, entries]) => {
      const links = entries
        .map((entry) => {
          const link = buildHref(basePath, entry.route);
          return `<li><a href="${escapeHtml(link)}">${escapeHtml(entry.title)}</a><span>${escapeHtml(entry.route)}</span></li>`;
        })
        .join("");

      return `<section class="card"><h2>${escapeHtml(section)}</h2><ul>${links}</ul></section>`;
    })
    .join("");

  const siteUrlMarkup = siteUrl
    ? `<p class="meta">Base publica: <a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a></p>`
    : `<p class="meta">Build local sem URL publica configurada.</p>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mapa do Site - Perebas FC</title>
  <style>
    :root {
      --bg: #0b1020;
      --bg2: #132347;
      --card: rgba(255,255,255,.08);
      --stroke: rgba(255,255,255,.12);
      --text: rgba(255,255,255,.92);
      --muted: rgba(255,255,255,.72);
      --accent: #1fe58f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(900px 500px at 15% 10%, rgba(31,229,143,.18), transparent 55%),
        linear-gradient(180deg, var(--bg), var(--bg2));
      min-height: 100vh;
      padding: 28px 14px 56px;
    }
    .wrap {
      max-width: 1040px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 32px;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .meta {
      margin-top: 8px;
    }
    .meta a,
    a {
      color: var(--accent);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      margin-top: 18px;
    }
    .card {
      border: 1px solid var(--stroke);
      border-radius: 18px;
      background: var(--card);
      padding: 16px;
      backdrop-filter: blur(8px);
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    li {
      border: 1px solid var(--stroke);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(255,255,255,.04);
      display: grid;
      gap: 4px;
    }
    li span {
      font-size: 12px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Mapa do Site</h1>
    <p>Rotas publicadas automaticamente no GitHub Pages a partir do repositório.</p>
    ${siteUrlMarkup}
    <div class="grid">${sectionsMarkup}</div>
  </div>
</body>
</html>`;
}

function build404Page(basePath) {
  const homeHref = buildHref(basePath, "/");
  const siteMapHref = buildHref(basePath, "/site-map/");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Pagina nao encontrada</title>
  <style>
    :root {
      --bg: #0b1020;
      --bg2: #132347;
      --text: rgba(255,255,255,.92);
      --muted: rgba(255,255,255,.72);
      --accent: #ffd166;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", Arial, sans-serif;
      background:
        radial-gradient(900px 500px at 20% 10%, rgba(255,209,102,.18), transparent 55%),
        linear-gradient(180deg, var(--bg), var(--bg2));
      color: var(--text);
      padding: 24px;
    }
    .card {
      max-width: 520px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 20px;
      background: rgba(255,255,255,.06);
      padding: 24px;
      text-align: center;
    }
    h1 { margin: 0 0 10px; font-size: 30px; }
    p { margin: 0 0 16px; line-height: 1.5; color: var(--muted); }
    a {
      color: #0b1020;
      background: var(--accent);
      text-decoration: none;
      padding: 12px 16px;
      border-radius: 999px;
      display: inline-block;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Pagina nao encontrada</h1>
    <p>A rota solicitada nao existe no deploy atual do Perebas FC.</p>
    <a href="${escapeHtml(homeHref)}">Voltar para a home</a>
    <p style="margin-top:16px"><a href="${escapeHtml(siteMapHref)}" style="background:transparent;color:var(--accent);padding:0;border-radius:0">Abrir mapa do site</a></p>
  </div>
</body>
</html>`;
}

function buildSitemapXml(siteUrl, routes) {
  if (!siteUrl) {
    return null;
  }

  const urls = routes
    .map((route) => {
      const routeUrl = `${siteUrl}${route.route === "/" ? "/" : route.route}`;
      return `<url><loc>${escapeHtml(routeUrl)}</loc></url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function buildRobotsTxt(siteUrl) {
  const lines = [
    "User-agent: *",
    "Allow: /"
  ];

  if (siteUrl) {
    lines.push(`Sitemap: ${siteUrl}/sitemap.xml`);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const siteUrl = normalizeSiteUrl(options.siteUrl);
  const basePath = getBasePath(siteUrl);

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  for (const page of pages) {
    const html = readHtmlFile(page.source);
    writeRoute(page.route, html);
  }

  const routes = buildManifest(siteUrl);

  writeRoute("site-map", buildSiteMapPage(routes, siteUrl, basePath));
  fs.writeFileSync(path.join(distDir, ".nojekyll"), "", "utf8");
  fs.writeFileSync(path.join(distDir, "404.html"), build404Page(basePath), "utf8");
  fs.writeFileSync(path.join(distDir, "robots.txt"), buildRobotsTxt(siteUrl), "utf8");

  const sitemapXml = buildSitemapXml(siteUrl, routes);
  if (sitemapXml) {
    fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemapXml, "utf8");
  }

  console.log(`Site estatico gerado em: ${path.relative(repoRoot, distDir)}`);
  console.log(`Paginas publicadas: ${routes.length}`);
  if (siteUrl) {
    console.log(`URL base configurada: ${siteUrl}`);
  }
}

main();
