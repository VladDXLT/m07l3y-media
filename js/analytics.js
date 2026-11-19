/* Visitor tracking (free): Google Analytics 4 + Microsoft Clarity (heatmaps and session recordings).
 * Paste your IDs below. Empty = off. Never runs in the local editor. */
(function () {
  var GA_ID = '';        // e.g. 'G-ABC123XYZ'   (analytics.google.com > Admin > Data streams)
  var CLARITY_ID = '';   // e.g. 'abcd1234ef'    (clarity.microsoft.com > Settings > Overview)
  if (window.__m07Editor || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return;
  if (GA_ID) {
    var g = document.createElement('script'); g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    // count form sends and Book / Call / Email clicks as events
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      var h = a.getAttribute('href') || '';
      if (/^tel:/.test(h)) window.gtag('event', 'click_call');
      else if (/^mailto:/.test(h)) window.gtag('event', 'click_email');
      else if (/contact\.html/.test(h)) window.gtag('event', 'click_book', { link_text: (a.textContent || '').trim().slice(0, 60) });
      else if (/instagram\.com|tiktok\.com/.test(h)) window.gtag('event', 'click_social', { link_url: h });
    }, true);
    document.addEventListener('submit', function (e) { window.gtag('event', 'generate_lead', { form: (e.target.id || e.target.className || 'form') }); }, true);
  }
  if (CLARITY_ID) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }
})();
