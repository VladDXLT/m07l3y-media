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
   **From a link:** open **Media**, paste a link and click **Download**. It keeps the link (visitors who click go to the original post) and the likes, comments, shares and views. Tick **Include stat overlay** before dragging it onto a frame, or use **Stats** on a placed frame. **Refresh stats** updates the numbers later.
   - Instagram reel or video: highest quality with sound.
   - Instagram photo or carousel post: every photo and video in the post, numbered 1/5, 2/5...
   - Instagram story highlight (Share > Copy link): every photo and video in the highlight.
   - TikTok / YouTube: downloaded without logging in.
   Instagram always uses the **@vladivanenko_** login from **Google Chrome** (never Safari, never another account). Be logged into instagram.com in Chrome as @vladivanenko_ (any Chrome profile). The first time, macOS asks to allow "Chrome Safe Storage": click **Always Allow**. If Chrome is logged into a different account, the download stops and says so. The login copy is kept in `~/.m07l3y-editor/` on your Mac, outside the website folder, and is never uploaded. To use another account, start the editor with `M07_IG_ACCOUNT=name`.
   Needs `brew install yt-dlp ffmpeg` once. Only use posts you or your clients own.
   **Several clips in one frame:** click a frame, click **+ Clip**, then click more videos in Media (or drop several videos on a frame at once, or hold Shift while dropping). They play one after another with no gap, looping. **− Last clip** removes the last one.
   **Vertical or horizontal:** every file in Media shows a chip (↕ Vertical 9:16, ↔ Horizontal 16:9, Square) and its size; hovering a frame shows whether the frame is vertical or horizontal.
   **Stats you type in:** click **Add views** / **Edit stats** under a file to type views, likes, comments or shares (1.2M, 45.2K or 45200). Works for your own uploads too. Refresh stats keeps your numbers where the app can't find them.
   **Trim a video:** click **Trim** under a video in Media (or **Trim** on a frame's hover bar). Drag the pink handles on the filmstrip, or play it and press **I** (start) / **O** (end); arrows step one frame, or type exact times. **Save as new clip** keeps the original; **Replace original** swaps the file everywhere (the old one is kept in `.editor-backups/trimmed-originals/`). From a frame, the new clip is swapped into that frame automatically.
   **Remove a file:** the × in the corner of a file in Media (click twice). Files still used on a page are refused. Removed files go to `.editor-backups/deleted/`.
4b. **Layout** (button in the toolbar): click a box to select it. Video boxes, photos, buttons and the scrolling strips select as one piece; the likes / comments / shares / views and the sound button on a video select on their own (each one, or all together with **Bigger box**). **Cmd or Shift click** adds more boxes; everything selected moves together. **Esc** clears the selection.
   - Drag to move. It clicks into place (pink/teal guide lines) on the center and edges of the box around it, its neighbours, the page center and its normal spot; hold Option to move freely. **⇔ Center / ⇕ Center** centers it in one click. Type exact **X, Y, Size %, Tilt °, Layer** in the boxes on the bar (Enter to apply, ↑/↓ to step). Arrow keys nudge 1px (Shift = 10px). Moving something over another section no longer cuts it off.
   - **Corner squares**: bigger / smaller including everything inside. **Side bars** (teal): change only the box. On sections, cards and text boxes a side changes the empty space on that side (past zero the box gets narrower / shorter); on videos, photos and shapes it changes the box size and the picture fills it.
   - **Dot on top**: rotate (snaps to 0°/15°/30°; hold Option for free).
   - **Front** puts it over everything (other sections too, never over the top menu), **Back** sends it behind its neighbours.
   - **Duplicate** (Cmd+D), **Copy** / **Paste** (Cmd+C / Cmd+V, works between pages: pastes after the selected box), **↑ / ↓** reorder, **Reset**, **Delete** (Backspace).
   - Hover effects and animations pause while Layout is on, so things hold still. On phones, moved boxes go back to their normal spot (rotation, smaller sizes and spacing stay), so the phone version never breaks.
4c. **Undo / Redo** (Cmd+Z / Cmd+Shift+Z, or the toolbar buttons) undo the last change of any kind, in order: text, media, stats, moves, sizes, deletes, pastes. Moves snap back instantly; bigger changes reload the page where you were. It keeps working after reloads until you close the tab.
5. Changes **save automatically** a second after you make them (Cmd+S / Save still works). Changes are written straight into the .html files. Uploads go to `assets/uploads/`. Backups of every save are kept in `.editor-backups/` (not uploaded to GitHub).
   **Phones:** big videos used on a page (over 12 MB) automatically get a lighter 720p copy in `assets/uploads/phone/` (made in the background by the editor; watch the Terminal window). Phones play those, computers keep full quality.
6. Only uploads that are used on a page get published (the editor keeps `assets/uploads/.gitignore` up to date); everything else stays in Media on your computer. Publish: open GitHub Desktop, write a short summary, click **Commit to main**, then **Push origin**.

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
- **Custom domain:** the site is served at https://mo7leymedia.com (see the `CNAME` file). DNS is at Namecheap: four A records for `@` pointing to GitHub Pages and a `www` CNAME to `vladdxlt.github.io`.

## Run locally

```
python3 -m http.server 8000
```
Then open http://localhost:8000.
