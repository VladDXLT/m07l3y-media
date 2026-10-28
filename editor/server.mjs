#!/usr/bin/env node
/*
 * M07L3Y Media — local site editor
 * ------------------------------------------------------------------
 * Runs the website on your own computer with an editing toolbar on
 * every page. Everything you save is written straight into the site's
 * .html files, and uploaded images / videos go to assets/uploads/.
 * Then commit + push with GitHub Desktop to publish.
 *
 * Start it:  double-click "Edit Website.command"
 *        or: node editor/server.mjs
 *
 * No dependencies. Only listens on this computer (127.0.0.1).
 * The public website never loads the editor.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EDITOR_DIR = __dirname;
const UPLOADS = path.join(ROOT, 'assets', 'uploads');
const BACKUPS = path.join(ROOT, '.editor-backups');
const START_PORT = Number(process.env.PORT) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.heic': 'image/heic', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.md': 'text/plain; charset=utf-8',
};
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|svg|mp4|mov|webm|m4v)$/i;

const INJECT = '\n<link rel="stylesheet" href="/__editor/editor.css" data-m07-editor>\n' +
               '<script src="/__editor/editor.js" defer data-m07-editor></script>\n';

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json');

// Resolve a path inside the site folder, refusing anything that escapes it.
function safePath(rel) {
  const p = path.resolve(ROOT, '.' + path.posix.normalize('/' + decodeURIComponent(rel)));
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  return p;
}
// Only top-level .html pages can be saved.
function pageFile(name) {
  const base = path.basename(String(name || 'index.html').split('?')[0].split('#')[0]) || 'index.html';
  if (!/^[\w.-]+\.html$/.test(base)) return null;
  const p = path.join(ROOT, base);
  return fs.existsSync(p) ? p : null;
}
function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function uniqueName(dir, name) {
  const ext = path.extname(name).toLowerCase();
  let base = path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'media';
  let candidate = base + ext, i = 1;
  while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}-${i++}${ext}`;
  return candidate;
}

async function handleEditorApi(req, res, url) {
  const route = url.pathname.slice('/__editor/'.length);

  if (req.method === 'GET' && (route === 'editor.js' || route === 'editor.css')) {
    const file = path.join(EDITOR_DIR, route);
    return send(res, 200, await fsp.readFile(file), TYPES[path.extname(file)]);
  }
  if (req.method === 'GET' && route === 'pages') {
    const pages = (await fsp.readdir(ROOT)).filter(f => f.endsWith('.html')).sort();
    return json(res, 200, { pages });
  }
  if (req.method === 'GET' && route === 'raw') {
    const file = pageFile(url.searchParams.get('page'));
    if (!file) return json(res, 404, { error: 'Page not found' });
    return send(res, 200, await fsp.readFile(file, 'utf8'));
  }
  if (req.method === 'POST' && route === 'save') {
    const { page, html } = JSON.parse((await readBody(req)).toString('utf8'));
    const file = pageFile(page);
    if (!file) return json(res, 400, { error: 'Unknown page: ' + page });
    if (typeof html !== 'string' || !/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) {
      return json(res, 400, { error: 'That does not look like a full page, nothing was saved.' });
    }
    await fsp.mkdir(BACKUPS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(file, path.join(BACKUPS, `${path.basename(file)}.${stamp}.bak`));
    await fsp.writeFile(file, html, 'utf8');
    console.log(`  saved   ${path.basename(file)}`);
    return json(res, 200, { ok: true, page: path.basename(file), savedAt: Date.now() });
  }
  if (req.method === 'GET' && route === 'media') {
    await fsp.mkdir(UPLOADS, { recursive: true });
    const files = (await fsp.readdir(UPLOADS)).filter(f => MEDIA_EXT.test(f));
    const list = await Promise.all(files.map(async f => {
      const st = await fsp.stat(path.join(UPLOADS, f));
      return { name: f, src: 'assets/uploads/' + f, size: st.size, mtime: st.mtimeMs, video: /\.(mp4|mov|webm|m4v)$/i.test(f) };
    }));
    list.sort((a, b) => b.mtime - a.mtime);
    return json(res, 200, { files: list });
  }
  if (req.method === 'POST' && route === 'upload') {
    const original = url.searchParams.get('name') || 'media';
    if (!MEDIA_EXT.test(original)) return json(res, 400, { error: 'Use an image (jpg, png, webp, gif, svg) or a video (mp4, mov, webm).' });
    await fsp.mkdir(UPLOADS, { recursive: true });
    const name = uniqueName(UPLOADS, original);
    const dest = path.join(UPLOADS, name);
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      req.pipe(out);
      out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
    });
    const size = (await fsp.stat(dest)).size;
    console.log(`  upload  assets/uploads/${name} (${(size / 1048576).toFixed(1)} MB)`);
    return json(res, 200, { ok: true, src: 'assets/uploads/' + name, name, size });
  }
  return json(res, 404, { error: 'Unknown editor route' });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/__editor/')) return await handleEditorApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    let rel = url.pathname;
    if (rel.endsWith('/')) rel += 'index.html';
    let file = safePath(rel);
    if (file && !path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const nf = path.join(ROOT, '404.html');
      const html = fs.existsSync(nf) ? (await fsp.readFile(nf, 'utf8')).replace('</head>', INJECT + '</head>') : 'Not found';
      return send(res, 404, html, TYPES['.html']);
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html') {
      const html = (await fsp.readFile(file, 'utf8')).replace('</head>', INJECT + '</head>');
      return send(res, 200, html, TYPES['.html']);
    }
    // Stream everything else (supports video seeking with Range requests)
    const stat = fs.statSync(file);
    const type = TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error('  error  ', err.message);
    if (!res.headersSent) json(res, 500, { error: err.message });
  }
}

function listen(port, tries = 10) {
  const server = http.createServer(handle);
  server.on('error', err => {
    if (err.code === 'EADDRINUSE' && tries > 0) return listen(port + 1, tries - 1);
    console.error(err); process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const link = `http://localhost:${port}/`;
    console.log('\n  M07L3Y site editor is running');
    console.log(`  Open ${link} (leave this window open while you edit)`);
    console.log('  Press Ctrl+C to stop.\n');
    if (process.argv.includes('--open')) exec(`open "${link}"`);
  });
}
listen(START_PORT);
