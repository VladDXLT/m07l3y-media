/*
 * M07L3Y Media — chat widget mount point
 * -------------------------------------------------------------
 * Every page already loads this file and has an empty
 *   <div id="chat-root"></div>
 * right before </body>. Build the chatbox here and it will show
 * up across the whole site without touching any HTML page.
 *
 * Options when you're ready:
 *   1. Paste a third-party embed snippet (Tidio, Crisp, Intercom,
 *      tawk.to, etc.) into this file or replace this file with it.
 *   2. Build a custom AI chat: render a floating button + panel
 *      into #chat-root and POST messages to your own backend
 *      (e.g. a serverless function that calls the Claude API).
 *      Never put API keys in this file; it is public.
 *
 * Brand tokens are available as CSS variables from css/styles.css:
 *   --bg --surface --fg --muted --purple --pink --teal
 *   --f-display --f-serif --f-mono
 */
(function () {
  'use strict';
  var root = document.getElementById('chat-root');
  if (!root) return;
  // Chat widget goes here.
})();
