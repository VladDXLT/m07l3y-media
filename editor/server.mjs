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
import { exec, spawn } from 'node:child_process';
import os from 'node:os';
import https from 'node:https';
import http2 from 'node:http';

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
const HIDDEN_MEDIA = /(-stats\.png|\.poster\.jpg)$/i;   // helper files, not shown as their own items

// Find yt-dlp / ffmpeg wherever they were installed (Homebrew, conda, pip --user)
const HOME = os.homedir();
process.env.PATH = [process.env.PATH || '', path.join(HOME, '.homebrew/bin'), '/opt/homebrew/bin', '/usr/local/bin',
  path.join(HOME, 'anaconda3/bin'), path.join(HOME, 'miniconda3/bin'), '/opt/anaconda3/bin', '/opt/miniconda3/bin',
  path.join(HOME, '.local/bin'), path.join(HOME, 'Library/Python/3.12/bin'), path.join(HOME, 'Library/Python/3.11/bin')].join(':');
function which(cmd) {
  for (const dir of process.env.PATH.split(':')) {
    if (!dir) continue;
    const p = path.join(dir, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) {}
  }
  return null;
}
function run(cmd, args, timeoutMs = 15 * 60 * 1000) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { env: process.env });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); stderr += '\nTimed out'; }, timeoutMs);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: err.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
function downloadTo(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http2;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume(); return resolve(downloadTo(new URL(res.headers.location, url).href, dest, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (' + res.statusCode + ')')); }
      const out = fs.createWriteStream(dest);
      res.pipe(out); out.on('finish', () => resolve(dest)); out.on('error', reject);
    }).on('error', reject);
  });
}
const sidecarPath = base => path.join(UPLOADS, base + '.json');
async function readSidecar(base) { try { return JSON.parse(await fsp.readFile(sidecarPath(base), 'utf8')); } catch (e) { return null; } }
async function writeSidecar(base, data) { await fsp.writeFile(sidecarPath(base), JSON.stringify(data, null, 2)); }
function statsFrom(meta) {
  const n = v => (typeof v === 'number' && isFinite(v) ? v : null);
  return { views: n(meta.view_count) ?? n(meta.play_count), likes: n(meta.like_count), comments: n(meta.comment_count), shares: n(meta.repost_count) ?? n(meta.share_count) };
}
function platformOf(meta, url) {
  const k = (meta.extractor_key || meta.extractor || '').toLowerCase();
  if (k.includes('instagram') || /instagram\.com/.test(url)) return 'Instagram';
  if (k.includes('tiktok') || /tiktok\.com/.test(url)) return 'TikTok';
  if (k.includes('youtube') || /youtu\.?be/.test(url)) return 'YouTube';
  if (k.includes('facebook') || /facebook\.com|fb\.watch/.test(url)) return 'Facebook';
  if (k.includes('vimeo')) return 'Vimeo';
  return meta.extractor_key || 'Link';
}
// Ask yt-dlp for the post's details. Tries without login first, then with your browser's login if needed.
async function fetchMeta(url, cookies) {
  const ytdlp = which('yt-dlp');
  if (!ytdlp) throw new Error('yt-dlp is not installed. In Terminal run: brew install yt-dlp ffmpeg');
  const attempts = cookies && cookies !== 'auto' ? [cookies] : ['none', 'chrome', 'safari'];
  let lastErr = '';
  for (const c of attempts) {
    const args = ['-J', '--no-playlist', '--no-warnings', ...(c !== 'none' ? ['--cookies-from-browser', c] : []), url];
    const r = await run(ytdlp, args, 3 * 60 * 1000);
    if (r.code === 0 && r.stdout.trim()) {
      let meta = JSON.parse(r.stdout);
      if (meta._type === 'playlist' && Array.isArray(meta.entries) && meta.entries.length) {
        meta = Object.assign({}, meta.entries[0], { like_count: meta.like_count ?? meta.entries[0].like_count, comment_count: meta.comment_count ?? meta.entries[0].comment_count });
      }
      return { meta, cookies: c };
    }
    lastErr = (r.stderr || '').split('\n').filter(l => /ERROR/.test(l)).pop() || r.stderr.slice(-300);
  }
  throw new Error('Could not read that link. ' + lastErr.replace(/^ERROR:\s*/, ''));
}
async function importLink(url, cookies) {
  const ytdlp = which('yt-dlp'), ffmpeg = which('ffmpeg');
  const { meta, cookies: usedCookies } = await fetchMeta(url, cookies);
  const platform = platformOf(meta, url);
  await fsp.mkdir(UPLOADS, { recursive: true });
  const who = (meta.uploader_id || meta.channel || meta.uploader || '').toString();
  const baseName = path.basename(uniqueName(UPLOADS, `${platform}-${who}-${meta.id || Date.now()}.tmp`), '.tmp');
  const hasVideo = Array.isArray(meta.formats) ? meta.formats.some(f => f.vcodec && f.vcodec !== 'none') : /^(mp4|mov|webm|m4v)$/.test(meta.ext || '');
  const hasAudio = Array.isArray(meta.formats) ? meta.formats.some(f => f.acodec && f.acodec !== 'none') : true;
  let file, poster = null;
  const thumbs = (meta.thumbnails || []).filter(t => t.url).sort((a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0));
  const bestThumb = (thumbs.length ? thumbs[thumbs.length - 1].url : meta.thumbnail) || null;
  if (hasVideo) {
    const args = ['--no-playlist', '--no-warnings', '-f', ffmpeg ? 'bv*+ba/b' : 'b', '-S', 'vcodec:h264,res,acodec:aac',
      ...(ffmpeg ? ['--merge-output-format', 'mp4'] : []),
      ...(usedCookies !== 'none' ? ['--cookies-from-browser', usedCookies] : []),
      '-o', path.join(UPLOADS, baseName + '.%(ext)s'), '--print', 'after_move:filepath', url];
    console.log(`  import  ${platform} video ${url}`);
    const r = await run(ytdlp, args);
    const printed = r.stdout.trim().split('\n').filter(Boolean).pop();
    if (r.code !== 0 || !printed || !fs.existsSync(printed)) throw new Error('Download failed. ' + (r.stderr.split('\n').filter(l => /ERROR/.test(l)).pop() || ''));
    file = printed;
    // GitHub rejects files over 100 MB: shrink big videos (keeps 1080p and audio)
    if (ffmpeg && fs.statSync(file).size > 90 * 1048576) {
      const small = path.join(UPLOADS, baseName + '-web.mp4');
      const t = await run(ffmpeg, ['-y', '-i', file, '-vf', "scale='min(1080,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', small]);
      if (t.code === 0 && fs.existsSync(small)) { await fsp.unlink(file); await fsp.rename(small, path.join(UPLOADS, baseName + '.mp4')); file = path.join(UPLOADS, baseName + '.mp4'); }
    }
    if (bestThumb) { try { await downloadTo(bestThumb, path.join(UPLOADS, baseName + '.poster.jpg')); poster = 'assets/uploads/' + baseName + '.poster.jpg'; } catch (e) {} }
  } else {
    if (!bestThumb) throw new Error('No video or image found at that link.');
    console.log(`  import  ${platform} image ${url}`);
    file = path.join(UPLOADS, baseName + '.jpg');
    await downloadTo(bestThumb, file);
  }
  const item = {
    src: 'assets/uploads/' + path.basename(file), poster, video: hasVideo, audio: hasVideo && hasAudio,
    link: meta.webpage_url || url, platform, uploader: meta.uploader || meta.channel || who || '', title: (meta.title || meta.description || '').slice(0, 140),
    stats: statsFrom(meta), statsPng: null, fetchedAt: new Date().toISOString(), cookies: usedCookies,
  };
  await writeSidecar(baseName, item);
  const size = fs.statSync(file).size;
  console.log(`  saved   ${item.src} (${(size / 1048576).toFixed(1)} MB)`);
  return Object.assign({ name: path.basename(file), base: baseName, size }, item);
}

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
  if (req.method === 'GET' && route === 'tools') {
    return json(res, 200, { ytdlp: which('yt-dlp'), ffmpeg: which('ffmpeg') });
  }
  if (req.method === 'POST' && route === 'import') {
    const { url: link, cookies } = JSON.parse((await readBody(req)).toString('utf8'));
    if (!/^https?:\/\/\S+$/i.test(String(link || '').trim())) return json(res, 400, { error: 'Paste a full link that starts with https://' });
    try { return json(res, 200, { ok: true, item: await importLink(String(link).trim(), cookies) }); }
    catch (err) { console.error('  import failed:', err.message); return json(res, 400, { error: err.message }); }
  }
  if (req.method === 'POST' && route === 'refresh') {
    const { base } = JSON.parse((await readBody(req)).toString('utf8'));
    const safe = path.basename(String(base || ''));
    const item = await readSidecar(safe);
    if (!item) return json(res, 404, { error: 'No link saved for that file.' });
    try {
      const { meta } = await fetchMeta(item.link, item.cookies || 'auto');
      item.stats = statsFrom(meta); item.fetchedAt = new Date().toISOString();
      await writeSidecar(safe, item);
      return json(res, 200, { ok: true, item: Object.assign({ base: safe }, item) });
    } catch (err) { return json(res, 400, { error: err.message }); }
  }
  if (req.method === 'POST' && route === 'stats-png') {
    const safe = path.basename(String(url.searchParams.get('base') || ''));
    const item = await readSidecar(safe);
    if (!item) return json(res, 404, { error: 'No link saved for that file.' });
    const png = await readBody(req, 5 * 1024 * 1024);
    if (png.slice(1, 4).toString() !== 'PNG') return json(res, 400, { error: 'Not a PNG' });
    await fsp.writeFile(path.join(UPLOADS, safe + '-stats.png'), png);
    item.statsPng = 'assets/uploads/' + safe + '-stats.png';
    await writeSidecar(safe, item);
    return json(res, 200, { ok: true, statsPng: item.statsPng });
  }
  if (req.method === 'GET' && route === 'media') {
    await fsp.mkdir(UPLOADS, { recursive: true });
    const files = (await fsp.readdir(UPLOADS)).filter(f => MEDIA_EXT.test(f) && !HIDDEN_MEDIA.test(f));
    const list = await Promise.all(files.map(async f => {
      const st = await fsp.stat(path.join(UPLOADS, f));
      const base = path.basename(f, path.extname(f));
      const meta = await readSidecar(base);
      return Object.assign({ name: f, src: 'assets/uploads/' + f, size: st.size, mtime: st.mtimeMs, video: /\.(mp4|mov|webm|m4v)$/i.test(f) }, meta ? { base, meta } : {});
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
