#!/usr/bin/env node
// Read-only checks of rendered output. Uses the project's existing jsdom dependency.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const production = 'https://sleepy.is-my.app';
const sections = ['', 'schools/', 'download/', 'releases/', 'faq/', 'privacy/', 'licenses/', 'guides/', 'guides/wakeup-migration/', 'guides/backup-restore/'];
const routes = sections.flatMap(section => [`/${section}`, `/en/${section}`]);
const args = process.argv.slice(2);
let directory = 'dist/client';
let base;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    process.stdout.write('Usage: node scripts/audit-seo.mjs [--dir dist/client | --url https://sleepy.is-my.app]\nJSON report on stdout; exit 1 when a check fails. No files are written.\n');
    process.exit(0);
  }
  if (!['--dir', '--url'].includes(args[i]) || !args[i + 1]) throw new Error(`Invalid argument: ${args[i]}`);
  if (args[i] === '--dir') directory = args[++i];
  else base = new URL(args[++i]);
}
if (base && (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash)) throw new Error('--url must be an HTTP(S) origin without a path, query, or fragment');
const root = path.resolve(directory);
const findings = [];
const cache = new Map();
const issue = (route, code, detail) => findings.push({ route, code, detail });
const parse = (text, xml = false) => new JSDOM(text, { contentType: xml ? 'text/xml' : 'text/html', virtualConsole: new VirtualConsole() }).window.document;
const absolute = route => `${production}${route}`;

function filePath(route) {
  const decoded = decodeURIComponent(route);
  const candidate = path.resolve(root, `.${decoded.endsWith('/') ? `${decoded}index.html` : decoded}`);
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('Path outside output directory');
  return candidate;
}

async function load(route) {
  if (!cache.has(route)) cache.set(route, (async () => {
    try {
      if (base) {
        const response = await fetch(new URL(route, base), {
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SleepySEOAudit/1.0; read-only site audit)' },
        });
        return { text: await response.text(), status: response.status, finalUrl: response.url, robotsHeader: response.headers.get('x-robots-tag') };
      }
      return { text: await readFile(filePath(route), 'utf8'), status: null, finalUrl: null, robotsHeader: null };
    } catch (error) { return { error: error.message, status: null }; }
  })());
  return cache.get(route);
}

async function required(route) {
  const result = await load(route);
  if (result.error) issue(route, 'unreadable', result.error);
  else if (base && result.status !== 200) issue(route, 'http-status', `Expected 200; received ${result.status}`);
  return result;
}

// robots.txt groups and longest-rule matching, sufficient for the site's policies.
function robotGroups(text) {
  const groups = [];
  let current;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim().toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(key) && current && value) current.rules.push({ allow: key === 'allow', value });
  }
  return groups;
}

function robotAllowed(groups, bot, route) {
  let selected = groups.filter(group => group.agents.includes(bot.toLowerCase()));
  if (!selected.length) selected = groups.filter(group => group.agents.includes('*'));
  const matches = selected.flatMap(group => group.rules).filter(rule => {
    const escaped = rule.value.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\$$/, '$');
    return new RegExp(`^${escaped}`).test(route);
  }).sort((a, b) => b.value.replace(/\*/g, '').length - a.value.replace(/\*/g, '').length || Number(b.allow) - Number(a.allow));
  return !matches.length || matches[0].allow;
}

const pages = [];
const documents = new Map();
// Sequential reads keep remote request volume low and provide deterministic output.
for (const route of routes) {
  const loaded = await required(route);
  if (loaded.error || (base && loaded.status !== 200)) { pages.push({ route, status: loaded.status, error: loaded.error ?? 'HTTP failure' }); continue; }
  if (base && loaded.finalUrl !== new URL(route, base).href) issue(route, 'redirect', `Final URL: ${loaded.finalUrl}`);
  const document = parse(loaded.text);
  documents.set(route, document);
  const titles = [...document.querySelectorAll('title')];
  const descriptions = [...document.querySelectorAll('meta[name]')].filter(meta => meta.name.toLowerCase() === 'description');
  const canonicals = [...document.querySelectorAll('link[rel]')].filter(link => link.rel.toLowerCase().split(/\s+/).includes('canonical'));
  const h1 = [...document.querySelectorAll('h1')].map(node => node.textContent.trim());
  const robotValues = [...document.querySelectorAll('meta[name]')].filter(meta => /^(robots|googlebot|bingbot)$/i.test(meta.name)).map(meta => meta.content);
  if (titles.length !== 1 || !titles[0].textContent.trim()) issue(route, 'title', 'Expected one nonempty title');
  if (descriptions.length !== 1 || !descriptions[0].content.trim()) issue(route, 'description', 'Expected one nonempty description');
  if (canonicals.length !== 1 || canonicals[0].getAttribute('href') !== absolute(route)) issue(route, 'canonical', `Expected exactly ${absolute(route)}`);
  if (h1.length !== 1 || !h1[0]) issue(route, 'h1', 'Expected one nonempty H1');
  if ([...robotValues, loaded.robotsHeader ?? ''].some(value => /\b(noindex|none)\b/i.test(value))) issue(route, 'noindex', 'Indexable route has an indexing restriction');
  const chinese = route.startsWith('/en/') ? route.slice(3) : route;
  const expectedAlternates = { 'zh-CN': absolute(chinese), en: absolute(`/en${chinese}`), 'x-default': absolute(chinese) };
  const alternates = [...document.querySelectorAll('link[hreflang]')];
  for (const [language, href] of Object.entries(expectedAlternates)) {
    const matching = alternates.filter(link => link.hreflang === language && link.rel.toLowerCase().split(/\s+/).includes('alternate'));
    if (matching.length !== 1 || matching[0].getAttribute('href') !== href) issue(route, 'hreflang', `Expected one ${language} alternate to ${href}`);
  }
  const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')];
  if (!jsonld.length) issue(route, 'jsonld-missing', 'No JSON-LD script found');
  jsonld.forEach((script, index) => { try { const value = JSON.parse(script.textContent); if (!value || typeof value !== 'object') throw new Error('Expected JSON object or array'); } catch (error) { issue(route, 'jsonld-invalid', `Script ${index + 1}: ${error.message}`); } });
  pages.push({ route, status: loaded.status, title: titles[0]?.textContent.trim() ?? null, description: descriptions[0]?.content ?? null, h1, canonical: canonicals[0]?.getAttribute('href') ?? null, jsonldScripts: jsonld.length });
}

const robots = await required('/robots.txt');
let crawlAccess = [];
if (!robots.error && (!base || robots.status === 200)) {
  if (!robots.text.split(/\r?\n/).some(line => line.trim().toLowerCase() === `sitemap: ${production}/sitemap-index.xml`)) issue('/robots.txt', 'sitemap-directive', 'Missing production sitemap-index.xml directive');
  const groups = robotGroups(robots.text);
  crawlAccess = ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'].map(bot => {
    const blockedRoutes = routes.filter(route => !robotAllowed(groups, bot, route));
    if (blockedRoutes.length) issue('/robots.txt', 'crawler-disallowed', `${bot}: ${blockedRoutes.join(', ')}`);
    return { bot, blockedRoutes, scope: 'robots.txt policy only; server/WAF access not measured with this identity' };
  });
}

const sitemapRoutes = new Set();
const sitemapSeen = new Set();
async function readSitemap(route) {
  if (sitemapSeen.has(route)) return;
  if (sitemapSeen.size >= 10) { issue(route, 'sitemap-limit', 'More than 10 sitemap documents; remaining files not read'); return; }
  sitemapSeen.add(route);
  const loaded = await required(route);
  if (loaded.error || (base && loaded.status !== 200)) return;
  let document;
  try { document = parse(loaded.text, true); } catch (error) { issue(route, 'sitemap-xml', error.message); return; }
  const isIndex = document.documentElement.localName === 'sitemapindex';
  if (!isIndex && document.documentElement.localName !== 'urlset') issue(route, 'sitemap-root', 'Expected sitemapindex or urlset');
  for (const node of document.querySelectorAll('loc')) {
    let url;
    try { url = new URL(node.textContent.trim()); } catch { issue(route, 'sitemap-url', node.textContent); continue; }
    if (url.origin !== production) { issue(route, 'sitemap-origin', url.href); continue; }
    if (isIndex) await readSitemap(url.pathname);
    else sitemapRoutes.add(url.href);
  }
}
await readSitemap('/sitemap-index.xml');
for (const route of routes) if (!sitemapRoutes.has(absolute(route))) issue(route, 'sitemap-missing', 'Canonical page is absent from sitemap');
for (const href of sitemapRoutes) if (!routes.some(route => absolute(route) === href)) issue('/sitemap-index.xml', 'sitemap-unexpected', `Review unexpected indexed URL: ${href}`);

let linksChecked = 0;
const deferredLinks = new Set();
for (const [route, document] of documents) {
  const targets = new Set([...document.querySelectorAll('a[href]')].map(link => link.getAttribute('href')));
  for (const href of targets) {
    let url;
    try { url = new URL(href, absolute(route)); } catch { issue(route, 'invalid-link', href); continue; }
    if (url.origin !== production) continue;
    if (/^\/preview(?:\/|$)/.test(url.pathname)) { deferredLinks.add(url.pathname); continue; }
    let targetDocument = documents.get(url.pathname);
    if (base && !targetDocument) { deferredLinks.add(url.pathname); continue; }
    linksChecked++;
    if (!base) {
      try {
        const target = filePath(url.pathname);
        if (!(await stat(target)).isFile()) throw new Error('Not a file');
        if (!targetDocument && target.endsWith('.html')) targetDocument = parse(await readFile(target, 'utf8'));
      } catch (error) { issue(route, 'broken-internal-link', `${href}: ${error.message}`); continue; }
    }
    if (url.hash && url.hash !== '#top' && targetDocument) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { issue(route, 'invalid-fragment', href); continue; }
      if (!targetDocument.getElementById(id) && ![...targetDocument.querySelectorAll('a[name]')].some(anchor => anchor.name === id)) issue(route, 'missing-fragment', href);
    }
  }
}

const report = {
  measuredAt: new Date().toISOString(),
  mode: base ? 'url' : 'rendered-files',
  source: base?.href ?? root,
  canonicalOrigin: production,
  summary: { expectedPages: routes.length, pagesRead: documents.size, sitemapUrls: sitemapRoutes.size, internalLinksChecked: linksChecked, failures: findings.length, passed: findings.length === 0 },
  limitations: [
    base ? 'HTTP results use one audit User-Agent; they do not establish Googlebot or AI crawler access.' : 'HTTP status, redirects, headers, WAF behavior and deployed content are not measured in file mode.',
    'JSON-LD checks validate syntax, not rich-result eligibility or every schema property.',
    'Checks cover the fixed 20 canonical pages; scripts, styles, images, external links and live app behavior are not comprehensively audited.',
    'No search ranking, index coverage, AI visibility, citation baseline, field performance or conversion data is inferred.',
    'robots.txt checks cover the listed search bots; training-crawler policy is a separate choice.',
  ],
  deferredInternalLinks: [...deferredLinks].sort(),
  crawlAccess,
  findings,
  pages,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = findings.length ? 1 : 0;
