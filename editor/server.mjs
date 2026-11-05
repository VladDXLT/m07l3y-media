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
/* ------------------------------------------------------------------ Instagram
 * Instagram links always use YOUR Instagram login from Google Chrome (never Safari,
 * never any other account). The editor reads Chrome's Instagram cookies once
 * (macOS may ask to allow "Chrome Safe Storage": click Always Allow), checks they
 * belong to IG_ACCOUNT, and keeps them in ~/.m07l3y-editor/ (outside the website
 * folder, never uploaded). If Chrome is logged into a different account it stops.
 */
const IG_ACCOUNT = String(process.env.M07_IG_ACCOUNT || 'vladivanenko_').replace(/^@/, '').toLowerCase();
const IG_BASE = process.env.M07_IG_BASE || 'https://www.instagram.com';
const IG_APP_ID = '936619743392459';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const PRIV = path.join(HOME, '.m07l3y-editor');
const IG_JAR = path.join(PRIV, 'instagram-cookies.txt');
const IG_STATE = path.join(PRIV, 'instagram.json');
const isInstagram = u => /(^|\.)instagram\.com$/i.test((() => { try { return new URL(u).hostname; } catch (e) { return ''; } })());

function parseJar(text) {
  const out = {};
  for (let line of String(text).split('\n')) {
    line = line.replace(/^#HttpOnly_/, '');
    if (!line || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length >= 7 && /instagram\.com$/i.test(f[0])) out[f[5]] = f[6].trim();
  }
  return out;
}
const cookieHeader = c => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ');
function getJSON(url, cookies) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http2;
    const req = lib.get(url, { headers: { 'User-Agent': UA, 'X-IG-App-ID': IG_APP_ID, 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Referer': IG_BASE + '/', ...(cookies ? { Cookie: cookieHeader(cookies) } : {}) } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => {
        let data = null; try { data = JSON.parse(body); } catch (e) {}
        if (res.statusCode === 200 && data) return resolve(data);
        const err = new Error((data && data.message) || ('Instagram answered ' + res.statusCode));
        err.status = res.statusCode; err.login = res.statusCode === 401 || res.statusCode === 403 || /login/i.test(body.slice(0, 2000)) || res.statusCode === 302;
        reject(err);
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('Instagram did not answer')));
    req.on('error', reject);
  });
}
function chromeProfiles() {
  const dir = path.join(HOME, 'Library/Application Support/Google/Chrome');
  try {
    const st = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8'));
    const names = Object.keys((st.profile && st.profile.info_cache) || {});
    const last = st.profile && st.profile.last_used;
    names.sort((a, b) => (b === last) - (a === last) || (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b, undefined, { numeric: true })));
    if (names.length) return names;
  } catch (e) {}
  return ['Default'];
}
// Who is this cookie's account? Returns the username, or null if Instagram won't say.
async function igUsernameFor(cookies) {
  const id = cookies.ds_user_id;
  for (const u of [`${IG_BASE}/api/v1/users/${id}/info/`]) {
    try { const d = await getJSON(u, cookies); if (d && d.user && d.user.username) return d.user.username.toLowerCase(); } catch (e) { if (e.login) throw e; }
  }
  // Fallback: look up IG_ACCOUNT's id and compare
  try {
    const d = await getJSON(`${IG_BASE}/api/v1/users/web_profile_info/?username=${encodeURIComponent(IG_ACCOUNT)}`, cookies);
    const want = d && d.data && d.data.user && d.data.user.id;
    if (want) return String(want) === String(id) ? IG_ACCOUNT : '(another account)';
  } catch (e) { if (e.login) throw e; }
  return null;
}
let igCache = null;   // { cookies, profile, userId }
async function igSession(force = false) {
  if (!force && igCache) return igCache;
  await fsp.mkdir(PRIV, { recursive: true, mode: 0o700 });
  let state = null; try { state = JSON.parse(await fsp.readFile(IG_STATE, 'utf8')); } catch (e) {}
  if (state && state.account !== IG_ACCOUNT) state = null;
  // Reuse the saved login if it is ours and less than 12 hours old
  if (!force && state && fs.existsSync(IG_JAR) && Date.now() - state.checkedAt < 12 * 3600 * 1000) {
    const c = parseJar(await fsp.readFile(IG_JAR, 'utf8'));
    if (c.sessionid && String(c.ds_user_id) === String(state.userId)) return (igCache = { cookies: c, profile: state.profile, userId: state.userId });
  }
  const ytdlp = which('yt-dlp');
  if (!ytdlp) throw new Error('yt-dlp is not installed. In Terminal run: brew install yt-dlp ffmpeg');
  const seen = [];
  for (const profile of chromeProfiles()) {
    const tmp = path.join(PRIV, `chrome-${profile.replace(/[^\w]+/g, '_')}.txt`);
    await fsp.rm(tmp, { force: true });
    // No URL on purpose: yt-dlp just copies Chrome's cookies into tmp, then exits
    await run(ytdlp, ['--cookies-from-browser', `chrome:${profile}`, '--cookies', tmp], 2 * 60 * 1000);
    let c = {}; try { c = parseJar(await fsp.readFile(tmp, 'utf8')); } catch (e) {}
    await fsp.rm(tmp, { force: true });
    if (!c.sessionid || !c.ds_user_id) continue;
    let ok = state && String(state.userId) === String(c.ds_user_id);
    if (!ok) {
      let who = null; try { who = await igUsernameFor(c); } catch (e) { seen.push(`a logged-out session in Chrome (${profile})`); continue; }
      if (who === null) throw new Error(`Could not confirm which Instagram account Chrome (${profile}) is logged into, so nothing was downloaded. Try again in a minute.`);
      if (who !== IG_ACCOUNT) { seen.push(`@${who} in Chrome (${profile})`); continue; }
      ok = true;
    }
    const jar = Object.entries(c).map(([k, v]) => `.instagram.com\tTRUE\t/\tTRUE\t0\t${k}\t${v}`).join('\n');
    await fsp.writeFile(IG_JAR, '# Netscape HTTP Cookie File\n' + jar + '\n', { mode: 0o600 });
    await fsp.writeFile(IG_STATE, JSON.stringify({ account: IG_ACCOUNT, userId: c.ds_user_id, profile, checkedAt: Date.now() }), { mode: 0o600 });
    console.log(`  instagram  using @${IG_ACCOUNT} from Chrome (${profile})`);
    return (igCache = { cookies: c, profile, userId: c.ds_user_id });
  }
  throw new Error(`Instagram links only download with @${IG_ACCOUNT} logged in on Google Chrome. ` +
    (seen.length ? `Chrome is logged in as ${seen.join(', ')}. ` : 'No Instagram login was found in Chrome. ') +
    `Open instagram.com in Chrome, switch to @${IG_ACCOUNT}, then try again. If macOS asks about "Chrome Safe Storage", click Always Allow.`);
}
async function igCall(fn) {
  try { return await fn(await igSession()); }
  catch (e) { if (!e.login) throw e; igCache = null; return fn(await igSession(true)); }   // login expired: re-read Chrome once
}
const SC_ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function igShortcode(url) {
  const m = /instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/i.exec(url);
  return m ? m[1] : null;
}
function igMediaId(code) {
  let id = 0n;
  for (const ch of code.slice(0, 11)) id = id * 64n + BigInt(SC_ABC.indexOf(ch));
  return id.toString();
}
const biggest = list => (list || []).filter(x => x && x.url).sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0] || null;
function igStats(m) {
  const n = v => (typeof v === 'number' && isFinite(v) ? v : null);
  return { views: n(m.play_count) ?? n(m.ig_play_count) ?? n(m.view_count) ?? n(m.video_view_count), likes: n(m.like_count),
    comments: n(m.comment_count), shares: n(m.reshare_count) ?? n(m.share_count) ?? n(m.media_repost_count) };
}
async function igPost(url) {
  const code = igShortcode(url);
  if (!code) throw new Error('That Instagram link does not point to a post or reel.');
  const d = await igCall(s => getJSON(`${IG_BASE}/api/v1/media/${igMediaId(code)}/info/`, s.cookies));
  const m = d && d.items && d.items[0];
  if (!m) throw new Error('Instagram did not return that post. Check the link, and that @' + IG_ACCOUNT + ' can see it.');
  return { m, link: `https://www.instagram.com/${m.product_type === 'clips' ? 'reel' : 'p'}/${code}/` };
}

// Story highlights (and single stories): every photo and video in it.
function igHighlightId(url) {
  let m = /\/stories\/highlights\/(\d+)/i.exec(url);
  if (m) return m[1];
  m = /instagram\.com\/s\/([\w-]+)/i.exec(url);            // share links: /s/<base64 of "highlight:ID">
  if (m) {
    try { const t = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); const h = /highlight:(\d+)/.exec(t); if (h) return h[1]; } catch (e) {}
  }
  return null;
}
const isStoryLink = u => /instagram\.com\/(stories|s)\//i.test(u);
async function importStories(url) {
  let list, title = '', who = '', link;
  const hid = igHighlightId(url);
  if (hid) {
    const d = await igCall(s => getJSON(`${IG_BASE}/api/v1/feed/reels_media/?reel_ids=highlight%3A${hid}`, s.cookies));
    const reel = (d.reels && d.reels['highlight:' + hid]) || (Array.isArray(d.reels_media) && d.reels_media[0]);
    if (!reel || !Array.isArray(reel.items) || !reel.items.length) throw new Error('Instagram did not return that highlight. Check the link, and that @' + IG_ACCOUNT + ' can see it.');
    list = reel.items; title = reel.title || 'Highlight'; who = (reel.user && reel.user.username) || '';
    link = `https://www.instagram.com/stories/highlights/${hid}/`;
  } else {
    const m = /\/stories\/([\w.]+)\/(\d+)/i.exec(url);
    if (!m) throw new Error('That story link is not one the editor understands. Use the highlight\'s link (Share > Copy link).');
    const d = await igCall(s => getJSON(`${IG_BASE}/api/v1/media/${m[2]}/info/`, s.cookies));
    if (!d.items || !d.items[0]) throw new Error('Instagram did not return that story. Stories disappear after 24 hours unless they are in a highlight.');
    list = d.items; who = m[1]; title = 'Story'; link = `https://www.instagram.com/stories/${m[1]}/${m[2]}/`;
  }
  console.log(`  import  Instagram ${hid ? 'highlight "' + title + '"' : 'story'} by @${who} (${list.length} item${list.length > 1 ? 's' : ''}) as @${IG_ACCOUNT}`);
  const items = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const baseName = newBase(`instagram-${who}-${hid ? 'highlight-' + title : 'story'}${list.length > 1 ? '-' + (i + 1) : ''}`);
    const img = biggest(p.image_versions2 && p.image_versions2.candidates);
    const video = p.media_type === 2;
    let file, poster = null;
    if (video) {
      const v = biggest(p.video_versions);
      if (!v) continue;
      file = path.join(UPLOADS, baseName + '.mp4');
      await downloadTo(v.url, file);
      file = await shrink(file, baseName);
      if (img) { try { await downloadTo(img.url, path.join(UPLOADS, baseName + '.poster.jpg')); poster = 'assets/uploads/' + baseName + '.poster.jpg'; } catch (e) {} }
    } else {
      if (!img) continue;
      file = path.join(UPLOADS, baseName + '.jpg');
      await downloadTo(img.url, file);
    }
    items.push(await finish(baseName, file, {
      src: 'assets/uploads/' + path.basename(file), poster, video, audio: video && p.has_audio !== false,
      link, platform: 'Instagram', uploader: who, title: (hid ? 'Highlight: ' : '') + title, stats: {}, statsPng: null,
      fetchedAt: new Date().toISOString(), account: IG_ACCOUNT, part: list.length > 1 ? i + 1 : null, parts: list.length > 1 ? list.length : null,
    }));
  }
  if (!items.length) throw new Error('Nothing in that ' + (hid ? 'highlight' : 'story') + ' could be downloaded.');
  return items;
}

// TikTok / YouTube / others: yt-dlp with no login at all.
async function fetchMeta(url) {
  const ytdlp = which('yt-dlp');
  if (!ytdlp) throw new Error('yt-dlp is not installed. In Terminal run: brew install yt-dlp ffmpeg');
  const r = await run(ytdlp, ['-J', '--no-playlist', '--no-warnings', url], 3 * 60 * 1000);
  if (r.code === 0 && r.stdout.trim()) {
    let meta = JSON.parse(r.stdout);
    if (meta._type === 'playlist' && Array.isArray(meta.entries) && meta.entries.length) {
      meta = Object.assign({}, meta.entries[0], { like_count: meta.like_count ?? meta.entries[0].like_count, comment_count: meta.comment_count ?? meta.entries[0].comment_count });
    }
    return meta;
  }
  const err = (r.stderr || '').split('\n').filter(l => /ERROR/.test(l)).pop() || r.stderr.slice(-300);
  throw new Error('Could not read that link. ' + err.replace(/^ERROR:\s*/, ''));
}
// Best quality video with sound via yt-dlp. cookieJar is only passed for Instagram.
async function ytVideo(url, baseName, cookieJar) {
  const ytdlp = which('yt-dlp'), ffmpeg = which('ffmpeg');
  if (!ytdlp) throw new Error('yt-dlp is not installed. In Terminal run: brew install yt-dlp ffmpeg');
  let tmpJar = null;
  if (cookieJar) { tmpJar = path.join(PRIV, `run-${Date.now()}.txt`); await fsp.copyFile(IG_JAR, tmpJar); await fsp.chmod(tmpJar, 0o600); }
  const args = ['--no-playlist', '--no-warnings', '-f', ffmpeg ? 'bv*+ba/b' : 'b', '-S', 'vcodec:h264,res,acodec:aac',
    ...(ffmpeg ? ['--merge-output-format', 'mp4'] : []), ...(tmpJar ? ['--cookies', tmpJar] : []),
    '-o', path.join(UPLOADS, baseName + '.%(ext)s'), '--print', 'after_move:filepath', url];
  const r = await run(ytdlp, args);
  if (tmpJar) await fsp.rm(tmpJar, { force: true });
  const printed = r.stdout.trim().split('\n').filter(Boolean).pop();
  if (r.code !== 0 || !printed || !fs.existsSync(printed)) throw new Error('Download failed. ' + (r.stderr.split('\n').filter(l => /ERROR/.test(l)).pop() || ''));
  return shrink(printed, baseName);
}
// GitHub rejects files over 100 MB: shrink big videos (keeps 1080p and audio)
async function shrink(file, baseName) {
  const ffmpeg = which('ffmpeg');
  if (ffmpeg && fs.statSync(file).size > 90 * 1048576) {
    const small = path.join(UPLOADS, baseName + '-web.mp4');
    const t = await run(ffmpeg, ['-y', '-i', file, '-vf', "scale='min(1080,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', small]);
    if (t.code === 0 && fs.existsSync(small)) { await fsp.unlink(file); const out = path.join(UPLOADS, baseName + '.mp4'); await fsp.rename(small, out); return out; }
  }
  return file;
}
async function probeDuration(file) {
  const ffprobe = which('ffprobe');
  if (ffprobe) {
    const r = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], 60 * 1000);
    const d = parseFloat(r.stdout);
    if (isFinite(d) && d > 0) return d;
  }
  const ffmpeg = which('ffmpeg');
  if (!ffmpeg) return 0;
  const r = await run(ffmpeg, ['-i', file], 60 * 1000);
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}
async function finish(baseName, file, item) {
  await writeSidecar(baseName, item);
  const size = fs.statSync(file).size;
  console.log(`  saved   ${item.src} (${(size / 1048576).toFixed(1)} MB)`);
  return Object.assign({ name: path.basename(file), base: baseName, size }, item);
}
// A file name stem not used by any file yet (so a new download never overwrites an old one)
function newBase(stem) {
  const clean = path.basename(uniqueName(UPLOADS, stem + '.tmp'), '.tmp');
  const used = b => fs.readdirSync(UPLOADS).some(f => f.startsWith(b + '.') || f.startsWith(b + '-stats.'));
  let base = clean, i = 2;
  while (used(base)) base = `${clean}-v${i++}`;
  return base;
}

async function importInstagram(url) {
  const { m, link } = await igPost(url);
  const who = (m.user && m.user.username) || '';
  const stats = igStats(m);
  const title = ((m.caption && m.caption.text) || '').slice(0, 140);
  const common = { link, platform: 'Instagram', uploader: who, title, stats, statsPng: null, fetchedAt: new Date().toISOString(), account: IG_ACCOUNT };
  const parts = m.media_type === 8 && Array.isArray(m.carousel_media) ? m.carousel_media : [m];
  const kind = m.media_type === 8 ? 'post' : m.product_type === 'clips' ? 'reel' : m.media_type === 2 ? 'video' : 'photo';
  console.log(`  import  Instagram ${kind} by @${who} (${parts.length} item${parts.length > 1 ? 's' : ''}) as @${IG_ACCOUNT}`);
  const items = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const baseName = newBase(`instagram-${who}-${m.code || igShortcode(url)}${parts.length > 1 ? '-' + (i + 1) : ''}`);
    const img = biggest(p.image_versions2 && p.image_versions2.candidates);
    let file, poster = null, video = p.media_type === 2;
    if (video) {
      if (parts.length === 1) {
        try { file = await ytVideo(link, baseName, true); } catch (e) { file = null; }   // best quality + sound
      }
      if (!file) {
        const v = biggest(p.video_versions);
        if (!v) throw new Error('Instagram did not give a video file for item ' + (i + 1) + '.');
        file = path.join(UPLOADS, baseName + '.mp4');
        await downloadTo(v.url, file);
        file = await shrink(file, baseName);
      }
      if (img) { try { await downloadTo(img.url, path.join(UPLOADS, baseName + '.poster.jpg')); poster = 'assets/uploads/' + baseName + '.poster.jpg'; } catch (e) {} }
    } else {
      if (!img) throw new Error('Instagram did not give an image for item ' + (i + 1) + '.');
      file = path.join(UPLOADS, baseName + '.jpg');
      await downloadTo(img.url, file);
    }
    items.push(await finish(baseName, file, Object.assign({}, common, {
      src: 'assets/uploads/' + path.basename(file), poster, video, audio: video && p.has_audio !== false,
      part: parts.length > 1 ? i + 1 : null, parts: parts.length > 1 ? parts.length : null,
    })));
  }
  return items;
}
async function importOther(url) {
  const meta = await fetchMeta(url);
  const platform = platformOf(meta, url);
  const who = (meta.uploader_id || meta.channel || meta.uploader || '').toString();
  const baseName = newBase(`${platform}-${who}-${meta.id || Date.now()}`);
  const hasVideo = Array.isArray(meta.formats) ? meta.formats.some(f => f.vcodec && f.vcodec !== 'none') : /^(mp4|mov|webm|m4v)$/.test(meta.ext || '');
  const hasAudio = Array.isArray(meta.formats) ? meta.formats.some(f => f.acodec && f.acodec !== 'none') : true;
  const thumbs = (meta.thumbnails || []).filter(t => t.url).sort((a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0));
  const bestThumb = (thumbs.length ? thumbs[thumbs.length - 1].url : meta.thumbnail) || null;
  let file, poster = null;
  if (hasVideo) {
    console.log(`  import  ${platform} video ${url}`);
    file = await ytVideo(url, baseName, false);
    if (bestThumb) { try { await downloadTo(bestThumb, path.join(UPLOADS, baseName + '.poster.jpg')); poster = 'assets/uploads/' + baseName + '.poster.jpg'; } catch (e) {} }
  } else {
    if (!bestThumb) throw new Error('No video or image found at that link.');
    console.log(`  import  ${platform} image ${url}`);
    file = path.join(UPLOADS, baseName + '.jpg');
    await downloadTo(bestThumb, file);
  }
  return [await finish(baseName, file, {
    src: 'assets/uploads/' + path.basename(file), poster, video: hasVideo, audio: hasVideo && hasAudio,
    link: meta.webpage_url || url, platform, uploader: meta.uploader || meta.channel || who || '', title: (meta.title || meta.description || '').slice(0, 140),
    stats: statsFrom(meta), statsPng: null, fetchedAt: new Date().toISOString(),
  })];
}
async function importLink(url) {
  await fsp.mkdir(UPLOADS, { recursive: true });
  if (!isInstagram(url)) return importOther(url);
  return isStoryLink(url) ? importStories(url) : importInstagram(url);
}
async function freshStats(link) {
  if (isInstagram(link) && isStoryLink(link)) throw new Error('Stories and highlights have no public likes or views to refresh.');
  if (isInstagram(link)) return igStats((await igPost(link)).m);
  return statsFrom(await fetchMeta(link));
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
    const backup = `${path.basename(file)}.${stamp}.bak`;
    await fsp.copyFile(file, path.join(BACKUPS, backup));
    await fsp.writeFile(file, html, 'utf8');
    console.log(`  saved   ${path.basename(file)}`);
    return json(res, 200, { ok: true, page: path.basename(file), savedAt: Date.now(), backup });
  }
  // Undo a layout change: put back the copy saved right before it (only if nothing was saved after it)
  if (req.method === 'POST' && route === 'undo') {
    const { page, backup } = JSON.parse((await readBody(req)).toString('utf8'));
    const file = pageFile(page);
    const bak = path.basename(String(backup || ''));
    if (!file || !bak.startsWith(path.basename(file) + '.') || !bak.endsWith('.bak') || !fs.existsSync(path.join(BACKUPS, bak))) return json(res, 404, { error: 'That change can\'t be undone any more.' });
    const newer = (await fsp.readdir(BACKUPS)).filter(f => f.startsWith(path.basename(file) + '.') && f.endsWith('.bak') && f > bak);
    if (newer.length) return json(res, 409, { error: 'You saved other changes on this page after that, so it can\'t be undone automatically. Older copies are in .editor-backups.' });
    const undone = path.join(BACKUPS, 'undone');
    await fsp.mkdir(undone, { recursive: true });
    await fsp.copyFile(file, path.join(undone, `${path.basename(file)}.${new Date().toISOString().replace(/[:.]/g, '-')}.html`));
    await fsp.copyFile(path.join(BACKUPS, bak), file);
    await fsp.rename(path.join(BACKUPS, bak), path.join(undone, bak));
    console.log(`  undo    ${path.basename(file)}`);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && route === 'tools') {
    let ig = null;
    try { ig = JSON.parse(fs.readFileSync(IG_STATE, 'utf8')); } catch (e) {}
    return json(res, 200, { ytdlp: which('yt-dlp'), ffmpeg: which('ffmpeg'), igAccount: IG_ACCOUNT, igProfile: ig && ig.account === IG_ACCOUNT ? ig.profile : null });
  }
  if (req.method === 'POST' && route === 'import') {
    const { url: link } = JSON.parse((await readBody(req)).toString('utf8'));
    if (!/^https?:\/\/\S+$/i.test(String(link || '').trim())) return json(res, 400, { error: 'Paste a full link that starts with https://' });
    try { const items = await importLink(String(link).trim()); return json(res, 200, { ok: true, items, item: items[0], account: isInstagram(link) ? IG_ACCOUNT : null }); }
    catch (err) { console.error('  import failed:', err.message); return json(res, 400, { error: err.message }); }
  }
  if (req.method === 'POST' && route === 'refresh') {
    const { base } = JSON.parse((await readBody(req)).toString('utf8'));
    const safe = path.basename(String(base || ''));
    const item = await readSidecar(safe);
    if (!item || !item.link) return json(res, 404, { error: 'No link saved for that file.' });
    try {
      const fetched = await freshStats(item.link);
      const fetchedAt = new Date().toISOString();
      // update every file saved from the same post (all slides of a carousel)
      const bases = (await fsp.readdir(UPLOADS)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
      const items = [];
      for (const b of bases) {
        const it = await readSidecar(b);
        if (!it || it.link !== item.link) continue;
        // numbers Instagram/TikTok don't give (e.g. views) keep what you typed in
        const old = it.stats || {}, stats = {};
        for (const k of ['views', 'likes', 'comments', 'shares']) stats[k] = fetched[k] ?? old[k] ?? null;
        it.stats = stats; it.fetchedAt = fetchedAt;
        await writeSidecar(b, it);
        items.push(Object.assign({ base: b }, it));
      }
      return json(res, 200, { ok: true, items, item: items.find(i => i.base === safe) || items[0] });
    } catch (err) { return json(res, 400, { error: err.message }); }
  }
  // Type in stats yourself (e.g. views when the app can't find them). Works for uploads too.
  if (req.method === 'POST' && route === 'stats') {
    const { name, stats } = JSON.parse((await readBody(req)).toString('utf8'));
    const file = path.basename(String(name || ''));
    if (!MEDIA_EXT.test(file) || !fs.existsSync(path.join(UPLOADS, file))) return json(res, 404, { error: 'File not found' });
    const clean = {};
    for (const k of ['views', 'likes', 'comments', 'shares']) {
      const v = stats && stats[k];
      clean[k] = v === null || v === '' || v === undefined ? null : Math.max(0, Math.round(Number(v)));
      if (clean[k] !== null && !isFinite(clean[k])) return json(res, 400, { error: 'Numbers only for ' + k });
    }
    const base = path.basename(file, path.extname(file));
    let item = await readSidecar(base);
    if (!item) item = { src: 'assets/uploads/' + file, poster: null, video: /\.(mp4|mov|webm|m4v)$/i.test(file), audio: true, link: null, platform: '', uploader: '', title: '', stats: {}, statsPng: null };
    const targets = [base];
    if (item.link) {   // same numbers for every slide of the same post
      for (const f of await fsp.readdir(UPLOADS)) {
        if (!f.endsWith('.json') || f === base + '.json') continue;
        const it = await readSidecar(f.slice(0, -5));
        if (it && it.link === item.link) targets.push(f.slice(0, -5));
      }
    }
    const items = [];
    for (const b of targets) {
      const it = b === base ? item : await readSidecar(b);
      it.stats = clean; it.statsEditedAt = new Date().toISOString();
      if (clean.likes == null && clean.comments == null && clean.shares == null && it.statsPng) {   // nothing left for the overlay image
        await fsp.rm(path.join(UPLOADS, b + '-stats.png'), { force: true }); it.statsPng = null;
      }
      await writeSidecar(b, it);
      items.push(Object.assign({ base: b }, it));
    }
    return json(res, 200, { ok: true, items });
  }
  // Filmstrip picture for the trim timeline (12 frames side by side), cached
  if (req.method === 'GET' && route === 'filmstrip') {
    const file = path.basename(String(url.searchParams.get('name') || ''));
    const src = path.join(UPLOADS, file);
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file) || !fs.existsSync(src)) return json(res, 404, { error: 'File not found' });
    const ffmpeg = which('ffmpeg');
    if (!ffmpeg) return json(res, 400, { error: 'ffmpeg is not installed' });
    const cacheDir = path.join(BACKUPS, 'cache');
    await fsp.mkdir(cacheDir, { recursive: true });
    const out = path.join(cacheDir, `${file}.${Math.round(fs.statSync(src).mtimeMs)}.strip.jpg`);
    if (!fs.existsSync(out)) {
      const dur = await probeDuration(src);
      const n = 12, rate = dur > 0 ? n / dur : 1;
      await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-vf', `fps=${rate.toFixed(6)},scale=-2:72,tile=${n}x1`, '-frames:v', '1', '-q:v', '5', out], 2 * 60 * 1000);
    }
    if (!fs.existsSync(out)) return json(res, 500, { error: 'Could not make the filmstrip' });
    return send(res, 200, await fsp.readFile(out), 'image/jpeg');
  }
  // Cut a video to [start, end] seconds. mode 'new' saves a new clip next to it, 'replace' swaps the file (original kept in .editor-backups)
  if (req.method === 'POST' && route === 'trim') {
    const { name, start, end, mode } = JSON.parse((await readBody(req)).toString('utf8'));
    const file = path.basename(String(name || ''));
    const src = path.join(UPLOADS, file);
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file) || !fs.existsSync(src)) return json(res, 404, { error: 'Video not found' });
    const ffmpeg = which('ffmpeg');
    if (!ffmpeg) return json(res, 400, { error: 'Cutting videos needs ffmpeg. In Terminal run: brew install ffmpeg, then restart the editor.' });
    const dur = await probeDuration(src);
    const a = Math.max(0, Number(start) || 0), b = Math.min(dur > 0 ? dur : Infinity, Number(end) || 0);
    if (!(b - a >= 0.1)) return json(res, 400, { error: 'Pick at least a tenth of a second.' });
    const base = path.basename(file, path.extname(file));
    const replace = mode === 'replace';
    if (replace && !/\.mp4$/i.test(file)) return json(res, 400, { error: 'Replace works on .mp4 files. Use Save as new clip.' });
    const outBase = replace ? base : newBase(base + '-cut');
    const tmp = path.join(UPLOADS, `.${outBase}.trim-${Date.now()}.mp4`);
    console.log(`  trim    ${file} ${a.toFixed(2)}s to ${b.toFixed(2)}s (${replace ? 'replace' : 'new clip'})`);
    // re-encode so the cut lands on the exact frame (stream copy can only cut on keyframes)
    const r = await run(ffmpeg, ['-y', '-loglevel', 'error', '-ss', a.toFixed(3), '-i', src, '-t', (b - a).toFixed(3),
      '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp]);
    if (r.code !== 0 || !fs.existsSync(tmp)) { await fsp.rm(tmp, { force: true }); return json(res, 500, { error: 'Cut failed. ' + r.stderr.split('\n').filter(Boolean).pop() }); }
    const outFile = outBase + '.mp4', out = path.join(UPLOADS, outFile);
    if (replace) {
      const keep = path.join(BACKUPS, 'trimmed-originals');
      await fsp.mkdir(keep, { recursive: true });
      await fsp.copyFile(src, path.join(keep, `${new Date().toISOString().replace(/[:.]/g, '-')}-${file}`));
    }
    await fsp.rename(tmp, out);
    const old = await readSidecar(base);
    let poster = null;
    if (!replace || (old && old.poster)) {
      const pj = path.join(UPLOADS, outBase + '.poster.jpg');
      const pr = await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', out, '-frames:v', '1', '-q:v', '3', pj], 60 * 1000);
      if (pr.code === 0 && fs.existsSync(pj)) poster = 'assets/uploads/' + outBase + '.poster.jpg';
    }
    if (old || !replace) {
      const item = Object.assign({}, old || { video: true, audio: true, link: null, platform: '', uploader: '', title: '', stats: {}, statsPng: null },
        { src: 'assets/uploads/' + outFile, poster: poster || (old && old.poster) || null, trimmed: { from: (old && old.trimmed && old.trimmed.from) || file, start: a, end: b } });
      if (!replace && old && old.statsPng) {   // reuse the same stat overlay picture
        try { await fsp.copyFile(path.join(UPLOADS, base + '-stats.png'), path.join(UPLOADS, outBase + '-stats.png')); item.statsPng = 'assets/uploads/' + outBase + '-stats.png'; } catch (e) { item.statsPng = null; }
      }
      await writeSidecar(outBase, item);
    }
    const size = fs.statSync(out).size;
    console.log(`  saved   assets/uploads/${outFile} (${(size / 1048576).toFixed(1)} MB, ${(b - a).toFixed(1)}s)`);
    return json(res, 200, { ok: true, name: outFile, src: 'assets/uploads/' + outFile, size, length: b - a, replaced: replace });
  }
  // Remove a file from the media library. It is moved to .editor-backups/deleted/ (not uploaded), never erased.
  if (req.method === 'POST' && route === 'delete') {
    const { name } = JSON.parse((await readBody(req)).toString('utf8'));
    const file = path.basename(String(name || ''));
    if (!MEDIA_EXT.test(file) || HIDDEN_MEDIA.test(file) || !fs.existsSync(path.join(UPLOADS, file))) return json(res, 404, { error: 'File not found' });
    const ref = 'assets/uploads/' + file;
    const pages = (await fsp.readdir(ROOT)).filter(f => f.endsWith('.html') && fs.readFileSync(path.join(ROOT, f), 'utf8').includes(ref));
    if (pages.length) return json(res, 409, { error: `It's still on ${pages.join(', ')}. Remove it from the frame and save first.`, pages });
    const base = path.basename(file, path.extname(file));
    const trash = path.join(BACKUPS, 'deleted', new Date().toISOString().replace(/[:.]/g, '-'));
    await fsp.mkdir(trash, { recursive: true });
    for (const f of [file, base + '.json', base + '.poster.jpg', base + '-stats.png']) {
      const from = path.join(UPLOADS, f);
      if (fs.existsSync(from)) await fsp.rename(from, path.join(trash, f));
    }
    console.log(`  removed ${ref} (copy kept in .editor-backups/deleted/)`);
    return json(res, 200, { ok: true });
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
    const files = (await fsp.readdir(UPLOADS)).filter(f => MEDIA_EXT.test(f) && !HIDDEN_MEDIA.test(f) && !f.startsWith('.'));
    const list = await Promise.all(files.map(async f => {
      const st = await fsp.stat(path.join(UPLOADS, f));
      const base = path.basename(f, path.extname(f));
      const meta = await readSidecar(base);
      return Object.assign({ name: f, src: 'assets/uploads/' + f, size: st.size, mtime: st.mtimeMs, video: /\.(mp4|mov|webm|m4v)$/i.test(f) }, meta ? { base, meta } : {});
    }));
    // newest first, with the slides of one post / highlight kept together in order
    const groupTime = {};
    const key = f => String((f.meta && f.meta.link) || f.src);   // uploads and trimmed clips have no link
    for (const f of list) { const k = key(f); groupTime[k] = Math.max(groupTime[k] || 0, f.mtime); }
    list.sort((a, b) => (groupTime[key(b)] - groupTime[key(a)]) || key(a).localeCompare(key(b)) || ((a.meta && a.meta.part) || 0) - ((b.meta && b.meta.part) || 0) || b.mtime - a.mtime);
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
