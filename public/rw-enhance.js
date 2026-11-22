/* Renta Work: interacciones livianas sin dependencias.
   - [data-ticker]: intereses que suman en vivo.
   - [data-sim]: simulador "¿Y si sumás más?".
   Funciona sobre el HTML que ya viene renderizado; sin JS se ve el estado inicial. */
(function () {
  function usd(cents, dec) {
    var d = dec == null ? 2 : dec;
    var v = Math.max(0, cents) / 100;
    var s = v.toFixed(d).split(".");
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "USD " + s[0] + (d ? "," + s[1] : "");
  }
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ticker(el) {
    if (el.__rw) return; el.__rw = 1;
    var base = Number(el.getAttribute("data-base"));
    var perDay = Number(el.getAttribute("data-perday"));
    var t0 = Number(el.getAttribute("data-t0"));
    var out = el.querySelector("[data-value]") || el;
    var dec = 2; // dos decimales: es un estimado, no un saldo
    function tick() {
      var cents = base + perDay * Math.max(0, Date.now() - t0) / 86400000;
      out.textContent = usd(cents, dec);
    }
    tick();
    setInterval(tick, reduce ? 10000 : 1000);
  }

  function sim(el) {
    if (el.__rw) return; el.__rw = 1;
    var rate = Number(el.getAttribute("data-rate")) / 10000;
    var capital = Number(el.getAttribute("data-capital"));
    var m2price = Number(el.getAttribute("data-m2price"));
    var input = el.querySelector("input[type=range]");
    function set(name, text) { var o = el.querySelector('[data-out="' + name + '"]'); if (o) o.textContent = text; }
    function update() {
      var t = Number(input.value);
      var add = t * 10000;
      set("tokens", t + (t === 1 ? " token" : " tokens"));
      el.querySelectorAll("[data-out-tokens]").forEach(function (o) { o.textContent = t; });
      set("amount", usd(add, 0));
      set("month", "+ " + usd(Math.floor(add * rate / 12)));
      set("year", "+ " + usd(Math.floor(add * rate)));
      set("total-month", usd(Math.floor((capital + add) * rate / 12)));
      if (m2price) set("m2", ((capital + add) / m2price).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²");
      var cta = el.querySelector('[data-out="cta"]');
      if (cta) { cta.textContent = "Quiero invertir " + usd(add, 0); if (cta.getAttribute("href") && cta.getAttribute("href").indexOf("/invertir") === 0) cta.setAttribute("href", "/invertir?tokens=" + t); }
      input.style.setProperty("--fill", ((t - input.min) / (input.max - input.min) * 100) + "%");
    }
    input.addEventListener("input", function () { window.__rwTokens = Number(input.value); update(); });
    el.__rwSync = function () {
      if (el.hasAttribute("data-follow") && window.__rwTokens) { input.value = String(Math.min(Number(input.max), window.__rwTokens)); }
      update();
    };
    update();
  }

  // Festejo: muestra lo elegido en el simulador (vista estática). En la app real ya viene calculado.
  function done(el) {
    if (!window.__rwTokens) return;
    var t = window.__rwTokens, add = t * 10000;
    var rate = Number(el.getAttribute("data-rate")) / 10000;
    var cap = Number(el.getAttribute("data-capital")), tok = Number(el.getAttribute("data-tokens"));
    var m2price = Number(el.getAttribute("data-m2price"));
    function set(n, v) { el.querySelectorAll('[data-done="' + n + '"]').forEach(function (o) { o.textContent = v; }); }
    set("tokens", t + (t === 1 ? " token" : " tokens"));
    set("amount", usd(add, 0));
    set("month", "+ " + usd(Math.floor(add * rate / 12)));
    set("tokens-after", (tok + t) + " tokens");
    set("total-month", usd(Math.floor((cap + add) * rate / 12)) + " por mes");
    if (m2price) set("m2", ((cap + add) / m2price).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²");
  }
  window.addEventListener("hashchange", function () {
    document.querySelectorAll("[data-sim]").forEach(function (el) { if (el.__rwSync) el.__rwSync(); });
    document.querySelectorAll("[data-done-box]").forEach(done);
  });

  function scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll("[data-ticker]").forEach(ticker);
    (root.querySelectorAll ? root : document).querySelectorAll("[data-sim]").forEach(sim);
  }
  function start() {
    scan(document);
    new MutationObserver(function () { scan(document); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
