/* Start-up and routing. Routes are hash based so the app works from any path with no server rewrites. */
"use strict";
async function boot() {
  try {
    G.me = await GET("/api/me");
    G.meta = G.meta || (await GET("/api/meta"));
    try { localStorage.setItem("boot", JSON.stringify({ me: G.me, meta: G.meta })); } catch (e) { /* storage unavailable */ }
  } catch (e) {
    // Offline with a saved start-up copy: open Fieldwork so an auditor can keep recording results.
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("boot") || "null"); } catch (x) { /* ignore */ }
    if (!e.offline || !saved) return;
    G.me = saved.me; G.meta = saved.meta;
    if (!location.hash.startsWith("#/fieldwork")) { location.hash = "#/fieldwork"; return; }
    return render();
  }
  if (G.me.must_enrol_mfa) return P.enrolGate();
  if (!location.hash || location.hash === "#/") location.hash = (G.me.permissions.dashboard || 0) >= 1 ? "#/dashboard/executive" : "#/e/task";
  else render();
}
async function render() {
  if (!G.me) return;
  const [path, qs] = location.hash.slice(2).split("?");
  const p = path.split("/").map(decodeURIComponent), q = Object.fromEntries(new URLSearchParams(qs || ""));
  const root = shell();
  put(root, h("p", { class: "muted" }, "Loading…"));
  try {
    if (p[0] === "dashboard") await P.dashboard(root, p[1] || "executive", q);
    else if (p[0] === "e" && p[2]) await P.detail(root, p[1], p[2]);
    else if (p[0] === "e") await P.list(root, p[1], q);
    else if (p[0] === "workflows" && p[1]) await S.editor(root, p[1]);
    else if (p[0] === "workflows") await S.workflows(root);
    else if (p[0] === "ai") await S.ai(root, q);
    else if (p[0] === "approvals") await P.approvals(root);
    else if (p[0] === "calendar") await P.calendar(root, q);
    else if (p[0] === "matrix") await P.matrix(root);
    else if (p[0] === "trace") await P.trace(root, p[1]);
    else if (p[0] === "heatmap") await P.heatmap(root);
    else if (p[0] === "checks") await P.checks(root);
    else if (p[0] === "coverage") await P.coverage(root);
    else if (p[0] === "claims") await P.claims(root);
    else if (p[0] === "reports") await P.reports(root, p[1]);
    else if (p[0] === "training") await P.training(root, p[1]);
    else if (p[0] === "roles") await P.roles(root);
    else if (p[0] === "org") await P.org(root);
    else if (p[0] === "tokens") await P.tokens(root);
    else if (p[0] === "audit-trail") await P.auditTrail(root, q);
    else if (p[0] === "settings") await P.settings(root);
    else if (ROUTES[p[0]]) await ROUTES[p[0]](root, p[1], q);
    else put(root, empty("Page not found", "Choose a page from the menu."));
    annotate(document.getElementById("app"));
  } catch (e) {
    if (G.me) put(root, h("div", { class: "card" }, empty("This page could not be shown", e.message)));
  }
}
window.addEventListener("hashchange", render);
(async () => {
  const health = await GET("/api/health").catch(() => null);
  if ((health && health.needs_setup) || location.hash.startsWith("#sso=")) return showGate();
  if (!health) return boot();                       // no connection: boot() falls back to the saved copy if there is one
  try { G.me = await GET("/api/me"); await boot(); } catch (e) { /* showGate already displayed by api() on 401 */ }
})();
if (false && "serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("/sw.js").catch(() => {});
