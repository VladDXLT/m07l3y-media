# M07L3Y Media website

Static website for M07L3Y Media, a Southern California video production team (drone, ground, underwater, commercials, reels and TikToks).

Plain HTML, CSS and JavaScript. No build step, no dependencies. Works on GitHub Pages, Netlify, Vercel or any static host.

## Pages

| File | Page |
|---|---|
| `index.html` | Home |
| `services.html` | Services hub (links to all five service pages) |
| `drone.html` | Drone services: events, holiday lights, farms, real estate, inspections, mapping, film support |
| `media.html` | Media production: commercials, brand films, underwater, deliverables |
| `social.html` | Social media management, monthly content, UGC |
| `collabs.html` | Creator collabs: sponsored posts and features on our channels |
| `events.html` | Events & shows: promoters, venues, holiday shows, drone-only crew |
| `work.html` | Work / portfolio with category filters |
| `about.html` | About, what "motley" means, why us |
| `team.html` | Team (founder + template for new members) |
| `faq.html` | FAQ (with FAQ schema for Google) |
| `contact.html` | Contact info + inquiry form |
| `privacy.html` | Privacy policy |
| `404.html` | Not found page |

Logo PNGs are in `assets/logo/`. Service links like `contact.html?s=drone` preselect that service on the contact form.

Shared files: `css/styles.css` (all styles + brand tokens), `js/main.js` (menu, filters, form, animations, logo back-to-top), `js/chat.js` (chat widget mount point), `assets/`. The local editor lives in `editor/` and is started by `Edit Website.command`.

## Editing the website (visual editor)

1. Double-click **Edit Website.command** (first time only: right-click it, choose Open, then Open again if macOS asks).
2. The site opens in your browser with an editing toolbar at the bottom. Keep the Terminal window open while you edit.
3. Click any text to edit it. Select words to format just those words, or click into a box and use the toolbar on the whole box:
   bold, italic, underline, strikethrough, size (A− / A+), alignment, box width (or drag the pink handle), brand colors, Clear.
4. Images and videos: drag a file from Finder onto any frame or photo spot. Or open **Media**, upload files, then drag them onto the page (or click a frame, then click a file). Hover a frame for Replace / HUD on-off / Remove.
5. Press **Cmd+S** (or Save). Changes are written straight into the .html files. Uploads go to `assets/uploads/`. Backups of every save are kept in `.editor-backups/` (not uploaded to GitHub).
6. Publish: open GitHub Desktop, write a short summary, click **Commit to main**, then **Push origin**.

Use the page menu in the toolbar to switch pages. Click **Editing** to switch to Preview, where links and buttons work normally. The editor only runs on your computer; the public site never loads it.

Keep videos under ~50 MB (GitHub rejects files over 100 MB). Export at 1080p or compress with HandBrake.

## Adding the chatbox later

Every page already has an empty `<div id="chat-root"></div>` and loads `js/chat.js`. Build the widget in `js/chat.js` (or replace it with a provider's embed snippet) and it appears on every page. Brand colors and fonts are CSS variables in `css/styles.css` (`--purple`, `--pink`, `--teal`, `--f-display`, etc.).

If the chat calls an AI API, put the API key in a serverless function (Netlify/Vercel/Cloudflare), never in `chat.js`, since everything in this repo is public.

## Contact form

The form posts to [FormSubmit](https://formsubmit.co) and lands in `m07l3ymedia@gmail.com`.

**One-time activation:** submit the form once yourself. FormSubmit emails an activation link to m07l3ymedia@gmail.com. Click it and every submission after that is delivered. If the form ever fails, it shows the visitor a pre-filled email link as a fallback.

To change the destination, edit `data-email` and `data-endpoint` on the `<form id="contact-form">` in `contact.html`.

## To-do / swap-ins

- **Team photos:** save as `assets/team/vlad.jpg` and follow the comment in `team.html`. Copy the commented `TEAM MEMBER TEMPLATE` block for each new person.
- **Real footage:** the frames on Home and Work are illustrated stand-ins. Replace a frame's `<div class="scene ...">` with
  `<video src="assets/video/clip.mp4" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover"></video>`
  (keep clips short and compressed, under ~10 MB each, or host on Vimeo/Mux).
- **Social links:** uncomment the Instagram / TikTok lines in the footer of each page and add your handles.
- **Custom domain:** add a `CNAME` file with your domain, then update the URLs in `sitemap.xml`, `robots.txt` and the `canonical` / `og:url` tags.

## Run locally

```
python3 -m http.server 8000
```
Then open http://localhost:8000.
