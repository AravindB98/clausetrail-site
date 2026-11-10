/* Sign-in and account, plain-language terms, charts, and the content review page. */
"use strict";

/* ── plain-language terms ── */
const termRe = { re: null, map: null };
function glossaryIndex() {
  if (termRe.map || !G.meta) return termRe;
  termRe.map = new Map(G.meta.glossary.map((g) => [g.term.toLowerCase(), g]));
  const short = G.meta.glossary.filter((g) => g.full).map((g) => g.term).sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  termRe.re = new RegExp("(^|[^A-Za-z0-9])(" + short.join("|") + ")(s?)(?![A-Za-z0-9])", "g");
  return termRe;
}
const termTip = (g) => (g.full ? `${g.term}: ${g.full}\n` : "") + g.text;
/** Full form and a short explanation for any glossary terms in a page title. */
function explain(title) {
  if (!G.meta || typeof title !== "string") return null;
  const found = [], lower = " " + title.toLowerCase() + " ";
  for (const g of G.meta.glossary) {
    const hit = g.full ? new RegExp("(^|[^A-Za-z0-9])" + g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?(?![A-Za-z0-9])").test(title)
      : new RegExp("[^a-z]" + g.term.toLowerCase().replace(/y$/, "(y|ie)") + "(s|es)?[^a-z]").test(lower);
    if (hit) found.push(g);
  }
  if (!found.length) return null;
  return h("div", { class: "terms" }, found.slice(0, 2).map((g) => h("div", { class: "term-def" }, h("b", {}, g.full ? `${g.term}: ${g.full}` : g.term), h("span", {}, g.text))));
}
/** Give every short form on the page its full form and explanation on hover or keyboard focus. */
function annotate(root) {
  const ix = glossaryIndex();
  if (!ix.re || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
    const p = n.parentElement;
    if (!p || p.namespaceURI !== "http://www.w3.org/1999/xhtml" || p.closest("abbr,.terms,input,textarea,select,option,pre,script,style,.code,.term-row,[data-tip]")) return NodeFilter.FILTER_REJECT;
    ix.re.lastIndex = 0;
    return ix.re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  } });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const frag = document.createDocumentFragment(), text = n.nodeValue;
    let last = 0, m;
    ix.re.lastIndex = 0;
    while ((m = ix.re.exec(text))) {
      const start = m.index + m[1].length, g = ix.map.get(m[2].toLowerCase());
      frag.append(text.slice(last, start), h("abbr", { class: "term", "data-tip": termTip(g), tabindex: 0 }, m[2]), m[3]);
      last = ix.re.lastIndex;
    }
    frag.append(text.slice(last));
    n.replaceWith(frag);
  }
}
ROUTES.glossary = async (root) => {
  const groups = [...new Set(G.meta.glossary.map((g) => g.group))], box = h("div", {});
  const draw = (q) => put(box, groups.map((grp) => {
    const items = G.meta.glossary.filter((g) => g.group === grp && (!q || (g.term + " " + (g.full || "") + " " + g.text).toLowerCase().includes(q))).sort((a, b) => a.term.localeCompare(b.term));
    return items.length ? card(grp, h("div", { class: "term-list" }, items.map((g) => h("div", { class: "term-row" }, h("b", {}, g.term), h("div", {}, g.full ? h("div", { class: "full" }, g.full) : null, h("p", {}, g.text)))))) : null;
  }));
  draw("");
  put(root, pageHead("Glossary", "Every short form and specialist word used in this application, with its full form and a brief explanation. Hover over an underlined short form anywhere to see the same text."),
    h("div", { class: "row", style: "margin-bottom:12px" }, h("input", { type: "search", placeholder: "Search terms", style: "max-width:280px", oninput: (e) => draw(e.target.value.trim().toLowerCase()) })),
    h("div", { class: "stack" }, box));
};

/* ── charts ── */
const SVGNS = "http://www.w3.org/2000/svg";
const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short" }) + (m.endsWith("-01") ? " " + m.slice(2, 4) : "");
const monthLong = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
/** Line chart for up to two monthly series: thin lines, end labels, a legend, and a hover band per month. */
function lineChart(months, series, label) {
  const all = series.flatMap((s) => s.values);
  if (!all.some((v) => v)) return h("p", { class: "muted small" }, "Nothing recorded in the last 12 months.");
  const W = 520, H = 170, pad = { l: 30, r: 14, t: 10, b: 24 }, max = Math.max(...all, 1), top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / (months.length - 1), y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const svg = document.createElementNS(SVGNS, "svg"), colors = ["#2a78d6", "#eb6834"];
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.style.width = "100%";
  svg.setAttribute("aria-label", `${label}: ` + series.map((s) => `${s.name} ${s.values.reduce((a, b) => a + b, 0)} in 12 months`).join(", "));
  const add = (tag, a, text) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) e.setAttribute(k, a[k]); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  [0, 0.5, 1].forEach((f) => { add("line", { x1: pad.l, x2: W - pad.r, y1: y(top * f), y2: y(top * f), stroke: "#e3e7ec" }); add("text", { x: pad.l - 6, y: y(top * f) + 4, "text-anchor": "end", "font-size": 11, fill: "#77838f" }, Math.round(top * f)); });
  months.forEach((m, i) => { if (i % 2 === (months.length - 1) % 2) add("text", { x: x(i), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: "#77838f" }, monthLabel(m)); });
  series.forEach((s, k) => {
    add("polyline", { points: s.values.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none", stroke: colors[k], "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" });
    const li = s.values.length - 1;
    add("circle", { cx: x(li), cy: y(s.values[li]), r: 4, fill: colors[k], stroke: "#fff", "stroke-width": 2 });
  });
  const guide = add("line", { y1: pad.t, y2: H - pad.b, stroke: "#9aa5b1", "stroke-dasharray": "3 3", visibility: "hidden" });
  const bw = (W - pad.l - pad.r) / (months.length - 1);
  months.forEach((m, i) => {
    const r = add("rect", { x: x(i) - bw / 2, y: pad.t, width: bw, height: H - pad.t - pad.b, fill: "transparent", "data-tip": `${monthLong(m)}\n` + series.map((s) => `${s.name}: ${s.values[i]}`).join("\n") });
    r.addEventListener("mouseenter", () => { guide.setAttribute("x1", x(i)); guide.setAttribute("x2", x(i)); guide.setAttribute("visibility", "visible"); });
    r.addEventListener("mouseleave", () => guide.setAttribute("visibility", "hidden"));
  });
  return h("div", {}, svg, h("div", { class: "legend" }, series.map((s, k) => h("span", {}, h("i", { class: "sw " + (k ? "t-s2" : "t-info") }), s.name, " ", h("b", {}, fmt.num(s.values.reduce((a, b) => a + b, 0)))))));
}
/** Small single-series monthly columns: records added per month. */
function miniColumns(months, values, noun) {
  const W = 300, H = 74, pad = { t: 6, b: 16 }, max = Math.max(...values, 1), bw = W / months.length;
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${noun} added per month, last 12 months`); svg.style.width = "100%";
  const add = (tag, a, text) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) e.setAttribute(k, a[k]); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  add("line", { x1: 0, x2: W, y1: H - pad.b, y2: H - pad.b, stroke: "#dde2e8" });
  values.forEach((v, i) => {
    const hh = ((H - pad.t - pad.b) * v) / max;
    if (v) add("rect", { x: i * bw + 2, y: H - pad.b - hh, width: bw - 4, height: Math.max(2, hh), rx: 2, fill: "#2a78d6" });
    add("rect", { x: i * bw, y: 0, width: bw, height: H - pad.b, fill: "transparent", "data-tip": `${monthLong(months[i])}\n${v} added` });
  });
  [0, months.length - 1].forEach((i) => add("text", { x: i ? W : 0, y: H - 3, "text-anchor": i ? "end" : "start", "font-size": 10.5, fill: "#77838f" }, monthLabel(months[i])));
  return svg;
}
/** "At a glance" strip above every register: how the records split by status, and how many were added each month. */
function summaryStrip(entity, params) {
  const open = localStorage.getItem("glance") !== "closed", body = h("div", { class: "glance-body" });
  const box = h("details", { class: "glance", open, ontoggle: () => { try { localStorage.setItem("glance", box.open ? "open" : "closed"); } catch (e) { /* storage unavailable */ } } }, h("summary", {}, "At a glance"), body);
  GET(`/api/e/${entity}/summary?${params}`).then((d) => {
    const parts = d.groups.map((g) => h("div", {}, h("h3", {}, `By ${g.label.toLowerCase()}`), g.items.length > 6 || !g.items.some((i) => toneOf(i.label)) ? barList(g.items.filter((i) => i.value).sort((a, b) => b.value - a.value).slice(0, 8)) : segBar(g.items)));
    if (d.added.some((v) => v)) parts.push(h("div", { style: "max-width:340px" }, h("h3", {}, "Added per month"), miniColumns(d.months, d.added, ent(entity).plural)));
    if (!parts.length) return box.remove();
    put(body, parts);
    annotate(body);
  }).catch(() => box.remove());
  return box;
}
/** Twelve-month trend charts for the executive dashboard. */
function trendsBlock() {
  const grid = h("div", { class: "grid g3", style: "margin-top:16px" });
  const wrap = h("div", {}, h("h2", { class: "section" }, "Trends, last 12 months"), grid);
  GET("/api/trends").then((d) => {
    if (!d.charts.length) return wrap.remove();
    put(grid, d.charts.map((c) => card(c.title, lineChart(d.months, c.series, c.title), h("p", { class: "small muted", style: "margin:8px 0 0" }, c.note))));
    annotate(grid);
  }).catch(() => wrap.remove());
  return wrap;
}
/** A chart for any standard report: counts by the first column that groups the rows into a handful of values. */
function reportChart(r) {
  if (r.rows.length < 3) return null;
  const groupable = r.columns.map((c, i) => ({ c, i })).filter(({ i }) => {
    const vals = r.rows.map((row) => row[i]).filter((v) => v !== null && v !== undefined && v !== "");
    const distinct = new Set(vals);
    return vals.length && !vals.some((v) => typeof v === "number") && distinct.size >= 2 && distinct.size <= 8 && distinct.size < vals.length;
  });
  const best = groupable.find(({ c }) => /status|rating|severity|result/i.test(c)) || groupable[0];
  if (!best) return null;
  const counts = {};
  r.rows.forEach((row) => { const v = row[best.i] === null || row[best.i] === undefined || row[best.i] === "" ? "Not set" : row[best.i]; counts[v] = (counts[v] || 0) + 1; });
  const items = Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return h("div", { class: "card", style: "margin-bottom:14px" }, h("h2", {}, `Rows by ${best.c.toLowerCase()}`), items.some((i) => toneOf(i.label)) ? segBar(items) : barList(items));
}

/* ── sign-in, first-run setup and two-step sign-in ── */
async function showGate() {
  const health = await GET("/api/health").catch(() => ({ needs_setup: false }));
  const setup = health.needs_setup, sso = health.sso;
  const ssoError = location.hash.startsWith("#sso=") ? decodeURIComponent(location.hash.slice(5).replace(/\+/g, " ")) : "";
  if (ssoError) history.replaceState(null, "", location.pathname);
  const f = {}, inp = (k, label, type, extra) => h("label", { class: "f", style: "margin-bottom:12px" }, h("span", {}, label), (f[k] = h("input", { type: type || "text", required: true, autocomplete: extra || "off" })));
  const sample = h("input", { type: "checkbox", checked: true });
  const panel = h("div", { class: "panel" });
  const secondStep = () => {
    const code = h("input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", required: true, placeholder: "6-digit code", style: "font-size:18px;letter-spacing:.12em" });
    put(panel, h("h2", {}, "Enter your code"), h("p", { class: "muted" }, "Open your authenticator app and enter the 6-digit code for ClauseTrail. If you have lost your phone, enter one of your recovery codes instead."),
      h("form", { onsubmit: act(async () => { await POST("/api/auth/mfa", { code: code.value.trim() }); await boot(); }) }, h("label", { class: "f", style: "margin-bottom:12px" }, h("span", {}, "Code"), code),
        h("button", { class: "btn primary", style: "width:100%;padding:9px" }, "Verify and sign in")),
      h("p", { style: "margin-top:14px" }, h("a", { href: "#", onclick: (e) => { e.preventDefault(); showGate(); } }, "Start again")));
    annotate(panel); code.focus();
  };
  const form = h("form", { onsubmit: act(async () => {
    if (setup) {
      await POST("/api/setup", { organisation: f.org.value, name: f.name.value, email: f.email.value, password: f.pw.value, sample_data: sample.checked });
      toast("Setup complete. Signing you in…");
    }
    const r = await POST("/api/auth/login", { email: f.email.value, password: f.pw.value });
    if (r.mfa_required) return secondStep();
    await boot();
  }) },
    setup ? [inp("org", "Organisation name"), inp("name", "Your name")] : null,
    inp("email", "Email", "email", "username"), inp("pw", setup ? "Choose a password (10+ characters, letters and numbers)" : "Password", "password", setup ? "new-password" : "current-password"),
    setup ? h("label", { class: "check", style: "margin:4px 0 16px" }, sample, h("span", {}, "Load a fictional insurer's sample data so I can explore (removable later)")) : null,
    h("button", { class: "btn primary", style: "width:100%;padding:9px" }, setup ? "Create organisation and sign in" : "Sign in"));
  put(panel, h("h2", {}, setup ? "Set up your organisation" : "Sign in"),
    ssoError ? h("div", { class: "note bad", style: "margin:10px 0" }, ssoError) : null,
    sso && !setup ? [h("a", { class: "btn primary", style: "display:block;text-align:center;padding:9px;margin-top:16px", href: "/api/auth/sso/start" }, `Sign in with ${sso.name}`),
      h("p", { class: "muted small", style: "margin:14px 0 0" }, sso.only ? "Passwords are switched off for this organisation. The form below is for the emergency administrator account only." : "Or use your email and password.")] : null,
    !sso || setup ? h("p", { class: "muted" }, setup ? "This creates the first administrator account. It takes a few seconds." : "Use the email and password your administrator gave you.") : null, form);
  put(document.getElementById("app"), h("div", { class: "gate" },
    h("div", { class: "pitch" }, h("h1", {}, "From the clause to the fix"),
      h("p", {}, "ClauseTrail is one place for regulatory obligations, risks, controls, evidence, claims timelines, TPA oversight, audits and corrective actions, with every step traceable."),
      h("div", { class: "chain" }, LIFECYCLE.map((s) => h("span", {}, s)))), panel));
}
/** Steps to switch on two-step sign-in. done() runs after the recovery codes have been shown. */
async function enrolSteps(box, done) {
  const s = await POST("/api/auth/mfa/setup");
  const code = h("input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "6-digit code", style: "max-width:200px;font-size:16px;letter-spacing:.1em" });
  put(box, h("ol", { class: "enrol" },
    h("li", {}, h("b", {}, "Install an authenticator app on your phone"), h("span", {}, "Microsoft Authenticator, Google Authenticator and Authy all work. Skip this if you already have one.")),
    h("li", {}, h("b", {}, "Scan this code with the app"), h("img", { src: s.qr, alt: "QR code for your authenticator app", width: 190, height: 190, style: "display:block;margin:8px 0" }),
      h("span", {}, "Cannot scan? Choose 'enter a setup key' in the app and type: "), h("code", { class: "code", style: "user-select:all;white-space:normal;word-break:break-all" }, s.secret.replace(/(.{4})/g, "$1 ").trim())),
    h("li", {}, h("b", {}, "Enter the 6-digit code the app shows"), h("div", { class: "row", style: "margin-top:6px" }, code,
      h("button", { class: "btn primary", onclick: act(async () => {
        const r = await POST("/api/auth/mfa/enable", { code: code.value.trim() });
        put(box, h("div", { class: "note info" }, h("b", {}, "Two-step sign-in is on. Save these recovery codes now."), " Each one works once if you lose your phone. They are shown only this time."),
          h("pre", { class: "report", style: "font-size:15px;columns:2;margin:12px 0" }, r.recovery_codes.join("\n")),
          h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(r.recovery_codes.join("\n")); toast("Copied"); } }, "Copy codes"),
            h("button", { class: "btn primary", onclick: act(done) }, "I have saved them")));
      }) }, "Turn on")))));
  annotate(box);
}
P.enrolGate = () => {
  const box = h("div", {});
  put(document.getElementById("app"), h("div", { class: "gate" },
    h("div", { class: "pitch" }, h("h1", {}, "One more step to protect your account"), h("p", {}, "Your organisation requires two-step sign-in. After this, signing in needs your password and a code from your phone, so a stolen password alone is not enough.")),
    h("div", { class: "panel" }, h("h2", {}, "Set up two-step sign-in"), box, h("p", { style: "margin-top:18px" }, h("a", { href: "#", onclick: act(async () => { await POST("/api/auth/logout"); G.me = null; showGate(); }) }, "Sign out")))));
  enrolSteps(box, async () => boot()).catch((e) => put(box, h("div", { class: "note bad" }, e.message)));
};
P.account = () => {
  const u = G.me.user, a = h("input", { type: "password", autocomplete: "current-password" }), b = h("input", { type: "password", autocomplete: "new-password" });
  const two = h("div", {});
  const drawTwo = () => {
    if (u.session_method === "single sign-on") return put(two, h("p", { class: "muted" }, "You signed in through your organisation's single sign-on (SSO), which manages the second step for you."));
    if (u.mfa_enabled) {
      const pw = h("input", { type: "password", placeholder: "Password", autocomplete: "current-password" }), code = h("input", { type: "text", placeholder: "Current 6-digit code", inputmode: "numeric" });
      return put(two, h("p", {}, chip("Active"), " Signing in needs your password and a code from your authenticator app."),
        h("details", {}, h("summary", {}, "Turn off, or move to a new phone"), h("p", { class: "muted small" }, "To move to a new phone, turn two-step sign-in off here and set it up again on the new phone."),
          h("div", { class: "row" }, pw, code, h("button", { class: "btn danger", onclick: act(async () => { await POST("/api/auth/mfa/disable", { password: pw.value, code: code.value.trim() }); u.mfa_enabled = false; toast("Two-step sign-in turned off"); drawTwo(); }) }, "Turn off"))));
    }
    put(two, h("p", {}, chip("Not set"), " Add a code from your phone as a second step, so a stolen password alone cannot be used."),
      h("button", { class: "btn primary", onclick: act(async () => enrolSteps(two, async () => { u.mfa_enabled = true; drawTwo(); })) }, "Set up two-step sign-in"));
    annotate(two);
  };
  drawTwo();
  modal("Your account", h("div", { class: "stack" },
    h("div", {}, h("h3", {}, "Signed in as"), h("p", { style: "margin:2px 0 0" }, `${u.name} · ${u.email} · ${u.role}`)),
    h("div", {}, h("h3", { style: "margin-bottom:6px" }, "Two-step sign-in (MFA)"), two),
    u.session_method === "single sign-on" ? null : h("div", {}, h("h3", { style: "margin-bottom:6px" }, "Change password"), h("div", { class: "form-grid" }, h("label", { class: "f" }, h("span", {}, "Current password"), a), h("label", { class: "f" }, h("span", {}, "New password (10+ characters, letters and numbers)"), b)),
      h("button", { class: "btn", style: "margin-top:10px", onclick: act(async () => { await POST("/api/auth/password", { current: a.value, new: b.value }); a.value = b.value = ""; toast("Password changed"); }) }, "Change password"))),
    [{ label: "Close", run: () => {} }]);
};

/* ── content review ── */
ROUTES.review = async (root) => {
  const d = await GET("/api/review");
  const rows = d.items.filter((i) => i.total);
  put(root, pageHead("Content review", "The starter library was written from public summaries. Nothing in it counts towards your compliance figures until a qualified person has checked it against the official text and approved it here.",
      h("a", { class: "btn", href: "/api/review/workbook" }, "Download review pack (Excel)"), can("regulatory", 2) ? h("button", { class: "btn primary", onclick: act(() => recordForm("content_signoff", null, { reviewer: G.me.user.id, review_date: G.me.today })) }, "Record a sign-off") : null),
    h("div", { class: "grid g3" },
      card("Overall progress", h("div", { class: "kpi" }, h("div", { class: "val" }, d.percent === null ? "No data" : d.percent + "%", h("small", {}, `${d.reviewed} of ${d.total} reviewed`)), h("div", { class: "meter", role: "img", "aria-label": `Reviewed ${d.percent}%` }, h("i", { style: `width:${d.percent || 0}%` }))),
        h("p", { class: "small muted", style: "margin:10px 0 0" }, "Reviewed means approved or rejected by a person with authority to do so. Automation and AI cannot approve.")),
      h("div", { class: "span2" }, card("Progress by content type", h("div", { class: "review-bars" }, rows.map((i) => [
        h("a", { href: `#/e/${i.entity}?${i.field}__ne=${encodeURIComponent(i.done_value)}`, "data-tip": "Open the records still waiting" }, i.label),
        h("div", { class: "seg", role: "img", "aria-label": `${i.label}: ${i.reviewed} approved, ${i.pending} waiting, ${i.rejected} rejected` },
          [["reviewed", "t-good", "Approved"], ["pending", "t-warn", "Waiting for review"], ["rejected", "t-neutral", "Rejected or superseded"]].filter(([k]) => i[k]).map(([k, c, l]) => h("i", { class: c, style: `flex:${i[k]}`, "data-tip": `${l}: ${i[k]}` }))),
        h("span", { class: "v" }, `${i.reviewed} of ${i.total}`)])),
        h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-good" }), "Approved"), h("span", {}, h("i", { class: "sw t-warn" }), "Waiting for review"), h("span", {}, h("i", { class: "sw t-neutral" }), "Rejected or superseded"))))),
    h("h2", { class: "section" }, "How a review works"),
    h("ol", { class: "enrol", style: "max-width:80ch" },
      h("li", {}, h("b", {}, "Download the review pack"), h("span", {}, "One sheet per content type, listing everything still waiting, with columns for the reviewer's decision, comment and the official source checked.")),
      h("li", {}, h("b", {}, "Approve, amend or reject each record here"), h("span", {}, "Open the waiting records from the chart above. Approval is recorded against the person who gave it and appears in the audit trail.")),
      h("li", {}, h("b", {}, "Record and sign a sign-off"), h("span", {}, "The reviewer states their qualification, the sources checked and any exceptions, then signs. A signed sign-off cannot be changed."))),
    h("h2", { class: "section" }, "Sign-offs"),
    d.signoffs.length ? simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Sign-off", render: (s) => h("a", { href: `#/e/content_signoff/${s.id}` }, s.title) }, { label: "Scope", key: "scope" }, { label: "Reviewer", render: (s) => (s._labels || {}).reviewer || "" },
      { label: "Qualification", key: "reviewer_qualification" }, { label: "Date", render: (s) => fmt.date(s.review_date) }, { label: "Signed", render: (s) => (s.signed ? chip("Verified") : chip("Pending")) }], d.signoffs)
      : h("div", { class: "card" }, empty("No sign-offs recorded yet", "When a qualified person has reviewed the content, record their sign-off here.")));
};

/* ── connectors ── */
ROUTES.connectors = async (root) => {
  const d = await GET("/api/connectors"), admin = can("admin", 4);
  const runBtn = (c) => {
    const needsFile = c.source_type === "File upload" || c.source_type === "FHIR claim bundle (upload)";
    const show = (r) => modal("Connector run finished", h("div", { class: "stack" }, h("p", {}, `${r.created} created, ${r.updated} updated, ${r.errors.length} rejected` + (c.source_type === "Drop folder" ? `, from ${r.files} file(s).` : ".")),
      r.unmatched_columns.length ? h("p", { class: "note" }, "Columns with no matching field were skipped: " + r.unmatched_columns.join(", ") + ". Add them to the field map if they are needed.") : null,
      r.errors.length ? simpleTable([{ label: "Row", key: "row" }, { label: "Problem", key: "error" }], r.errors.slice(0, 50)) : null), [{ label: "Done", cls: "primary", run: () => render() }]);
    const input = h("input", { type: "file", accept: ".csv,.xlsx,.json", hidden: true, onchange: act(async () => { const fd = new FormData(); fd.append("file", input.files[0]); show(await api("POST", `/api/connectors/${c.id}/run`, fd)); }) });
    return [input, h("button", { class: "btn primary sm", onclick: needsFile ? () => input.click() : act(async () => show(await POST(`/api/connectors/${c.id}/run`))) }, needsFile ? "Choose file and run" : "Run now")];
  };
  const secretBtn = (c) => h("button", { class: "btn sm", onclick: () => { const v = h("input", { type: "password", autocomplete: "off" });
    modal(`Credential for ${c.name}`, h("label", { class: "f" }, h("span", {}, `Value sent in the ${c.auth_header_name || "Authorization"} header, for example "Bearer abc123". It is stored encrypted and cannot be read back. Leave empty to remove it.`), v),
      [{ label: "Cancel", run: () => {} }, { label: "Save credential", cls: "primary", run: async () => { await POST(`/api/connectors/${c.id}/secret`, { value: v.value }); toast("Credential saved"); render(); } }], true); } }, c.secret_set ? "Replace credential" : "Set credential");
  put(root, pageHead("Connectors", "Bring records in from your claims, policy or other core systems without writing code. A connector says where the data comes from, which register it feeds, and how the source's column names map to the register's fields.",
      admin ? h("button", { class: "btn primary", onclick: act(() => recordForm("connector", null, { active: true, schedule: "Manual" }, () => render())) }, "New connector") : null),
    h("div", { class: "grid g3", style: "margin-bottom:16px" },
      card("Four ways in", h("dl", { class: "dl" }, h("div", {}, h("dt", {}, "File upload"), h("dd", {}, "Choose a CSV, Excel or JSON export when you run it.")), h("div", {}, h("dt", {}, "Drop folder"), h("dd", {}, "Your system writes files to a folder on this server. They are picked up on a schedule and moved to 'processed'.")),
        h("div", {}, h("dt", {}, "REST pull"), h("dd", {}, "The connector fetches JSON from an https address on a schedule.")), h("div", {}, h("dt", {}, "FHIR claim bundle"), h("dd", {}, "Claims in the FHIR format used by the National Health Claims Exchange (NHCX), by upload or pull.")))),
      card("Field map and value map", h("p", { class: "small" }, "The field map renames the source's columns to this register's field names. The value map translates codes."),
        h("pre", { class: "report small" }, 'Field map\n{ "Claim No": "claim_number",\n  "Regd On": "registration_date" }\n\nValue map\n{ "claim_type": { "CL": "Cashless",\n                  "RI": "Reimbursement" } }')),
      card("Reading scanned documents", h("p", {}, d.ocr ? chip("Active") : chip("Not set"), d.ocr ? " OCR is available on this server." : " OCR is not available on this server."),
        h("p", { class: "small muted" }, "Scanned circulars and images attached to a regulation are read with OCR, so the AI assistant can search them and suggest obligations. OCR is included in the Docker set-up. Without Docker, install Tesseract on the server."))),
    d.connectors.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Connector", "Source", "Feeds", "Schedule", "Last run", "Result", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.connectors.map((c) => h("tr", {}, h("td", {}, h("a", { href: `#/e/connector/${c.id}` }, c.name), c.active ? null : h("span", { class: "muted small" }, " (inactive)"), c.folder ? h("div", { class: "code", style: "white-space:normal;word-break:break-all" }, c.folder) : null),
        h("td", {}, c.source_type), h("td", {}, (ent(c.target_entity) || { plural: c.target_entity }).plural), h("td", {}, c.schedule || "Manual"), h("td", { class: "nowrap" }, fmt.dt(c.last_run)),
        h("td", {}, c.last_result === "Failed" ? [chip("Failed"), h("div", { class: "small muted" }, c.last_error)] : c.last_result || ""),
        h("td", { class: "nowrap" }, admin ? [runBtn(c), " ", c.source_type.includes("pull") || c.source_type === "REST pull" ? secretBtn(c) : null] : null)))))) :
      h("div", { class: "card" }, empty("No connectors yet", admin ? "Create one for each feed from a core system. Start with a file upload to check the mapping, then switch it to a drop folder or a REST pull." : "An administrator can add connectors.")));
};

/* ── Insight: outlook, hospital analytics, sampling, regulatory watch, fieldwork ── */
const svgEl = (tag, a, text) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) e.setAttribute(k, a[k]); if (text !== undefined) e.textContent = text; return e; };
const dirChip = (d) => h("span", { class: "chip " + ({ Worsening: "bad", Improving: "good", Steady: "" }[d] || "") }, d);
/** Twelve months of one measure, with a dashed straight-line projection for the month ahead. */
function projChart(months, values, projected, unit) {
  const W = 420, H = 150, pad = { l: 30, r: 40, t: 10, b: 22 }, max = Math.max(...values, projected, 1), top = max <= 4 ? 4 : Math.ceil(max / 4) * 4, n = months.length;
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / n, y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Last 12 complete months, latest ${values[n - 1]} ${unit}, projected for the current month ${projected} ${unit}` });
  svg.style.width = "100%";
  [0, 0.5, 1].forEach((f) => { svg.append(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: y(top * f), y2: y(top * f), stroke: "#e3e7ec" }), svgEl("text", { x: pad.l - 6, y: y(top * f) + 4, "text-anchor": "end", "font-size": 11, fill: "#77838f" }, Math.round(top * f))); });
  [0, 4, 8, 11].forEach((i) => svg.append(svgEl("text", { x: x(i), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: "#77838f" }, monthLabel(months[i]))));
  svg.append(svgEl("polyline", { points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none", stroke: "#2a78d6", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }),
    svgEl("line", { x1: x(n - 1), y1: y(values[n - 1]), x2: x(n), y2: y(projected), stroke: "#2a78d6", "stroke-width": 2, "stroke-dasharray": "4 4" }),
    svgEl("circle", { cx: x(n - 1), cy: y(values[n - 1]), r: 4, fill: "#2a78d6", stroke: "#fff", "stroke-width": 2 }),
    svgEl("circle", { cx: x(n), cy: y(projected), r: 4, fill: "#fff", stroke: "#2a78d6", "stroke-width": 2, "data-tip": `Projected for the current month: ${projected} ${unit}\nStraight-line projection, not a forecast of certainty` }),
    svgEl("text", { x: x(n) + 7, y: y(projected) + 4, "font-size": 11, fill: "#4d5a6b" }, fmt.num(projected)));
  const bw = (W - pad.l - pad.r) / n;
  months.forEach((m, i) => svg.append(svgEl("rect", { x: x(i) - bw / 2, y: pad.t, width: bw, height: H - pad.t - pad.b, fill: "transparent", "data-tip": `${monthLong(m)}\n${values[i]} ${unit}` })));
  return svg;
}
ROUTES.outlook = async (root) => {
  const d = await GET("/api/outlook"), maxDue = Math.max(...d.upcoming.map((u) => Math.max(u.due_60_days, u.overdue_now)), 1);
  put(root, pageHead("Outlook", "Where things are heading, worked out from the records already on file. These are indicators to help decide where to look first. They are not predictions, and they do not change any score or status."),
    h("h2", { class: "section", style: "margin-top:6px" }, "Direction of travel"),
    h("div", { class: "grid g3" }, d.indicators.map((i) => card([i.title, i.link ? h("a", { href: i.link }, "Open") : null],
      h("div", { class: "row", style: "gap:10px;margin-bottom:6px" }, dirChip(i.direction), h("span", { class: "muted small" }, i.change ? `${i.change > 0 ? "+" : ""}${i.change}% over the last three months compared with the three before` : "little change over six months")),
      projChart(d.months, i.values, i.projected, i.unit), h("p", { class: "small muted", style: "margin:6px 0 0" }, i.basis)))),
    h("h2", { class: "section" }, "Known to be coming in the next 60 days"),
    card(null, h("div", { class: "pair-bars" }, d.upcoming.map((u) => [h("a", { href: u.link }, u.label),
      h("div", {}, h("i", { class: "bar t-info", style: `width:${(100 * u.due_60_days) / maxDue}%`, "data-tip": `${u.label}: ${u.due_60_days} in the next 60 days` }), h("i", { class: "bar t-s2", style: `width:${(100 * u.overdue_now) / maxDue}%`, "data-tip": `${u.label}: ${u.overdue_now} already overdue` })),
      h("span", { class: "v" }, `${u.due_60_days} due, ${u.overdue_now} overdue`)])),
      h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-info" }), "Due in the next 60 days"), h("span", {}, h("i", { class: "sw t-s2" }), "Already overdue"))),
    h("h2", { class: "section" }, "Risks under the most pressure"),
    d.risks.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Risk", "Residual", "Pressure", "", "Why"].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.risks.map((r) => h("tr", {}, h("td", {}, h("span", { class: "code" }, r.code + " "), h("a", { href: `#/e/risk/${r.id}` }, r.title)), h("td", {}, chip(r.residual_rating)),
        h("td", { style: "width:150px" }, h("div", { class: "meter", role: "img", "aria-label": `Pressure ${r.pressure} of 100` }, h("i", { style: `width:${r.pressure}%;background:${r.pressure >= 60 ? "var(--critical)" : r.pressure >= 35 ? "var(--serious)" : "var(--warning)"}` }))),
        h("td", { class: "num" }, r.pressure), h("td", { class: "small" }, r.reasons.join("; "))))))) : h("div", { class: "card" }, empty("No risk is under pressure", "No open risk has a failed control, an open finding, a red indicator or an overdue treatment.")),
    h("p", { class: "small muted", style: "max-width:92ch" }, d.method));
};
ROUTES.hospitals = async (root) => {
  const d = await GET("/api/hospitals"), rows = d.hospitals.filter((r) => r.claims), t = d.totals;
  const scatter = () => {
    const W = 520, H = 250, pad = { l: 44, r: 16, t: 12, b: 36 }, mx = Math.max(...rows.map((r) => r.claims), 1), my = Math.max(...rows.map((r) => r.exception_rate), 10);
    const x = (v) => pad.l + ((W - pad.l - pad.r) * v) / mx, y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / my);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Each hospital by number of claims and exception rate" }); svg.style.width = "100%";
    [0, 0.5, 1].forEach((f) => { svg.append(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: y(my * f), y2: y(my * f), stroke: "#e3e7ec" }), svgEl("text", { x: pad.l - 6, y: y(my * f) + 4, "text-anchor": "end", "font-size": 11, fill: "#77838f" }, Math.round(my * f) + "%"),
      svgEl("text", { x: x(mx * f), y: H - 18, "text-anchor": "middle", "font-size": 11, fill: "#77838f" }, Math.round(mx * f))); });
    svg.append(svgEl("text", { x: (W + pad.l) / 2, y: H - 3, "text-anchor": "middle", "font-size": 11, fill: "#4d5a6b" }, "Number of claims"));
    rows.forEach((r) => { const c = svgEl("circle", { cx: x(r.claims), cy: y(r.exception_rate), r: 6, fill: r.flags.length ? "#eb6834" : "#2a78d6", stroke: "#fff", "stroke-width": 2, style: "cursor:pointer",
      "data-tip": `${r.name}\n${r.claims} claims, exception rate ${r.exception_rate}%` + (r.flags.length ? "\n" + r.flags.join("\n") : "") }); c.addEventListener("click", () => (location.hash = `#/e/third_party/${r.id}`)); svg.append(c); });
    return h("div", {}, svg, h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-info" }), "Within the usual range"), h("span", {}, h("i", { class: "sw t-s2" }), "Flagged for review")));
  };
  const costBars = () => { const span = Math.max(...rows.filter((r) => r.cost_index).map((r) => Math.abs(r.cost_index - 1)), 0.2);
    return h("div", { class: "div-bars" }, rows.filter((r) => r.cost_index).sort((a, b) => b.cost_index - a.cost_index).map((r) => { const off = (r.cost_index - 1) / span, w = Math.abs(off) * 50;
      return [h("span", { class: "l", title: r.name }, h("a", { href: `#/e/third_party/${r.id}` }, r.name)),
        h("div", { class: "track", "data-tip": `${r.name}: ${r.cost_index.toFixed(2)} times the network's typical cost for the same diagnosis groups` }, h("i", { style: `left:${off >= 0 ? 50 : 50 - w}%;width:${Math.max(w, 0.6)}%;background:${off >= 0 ? "#eb6834" : "#2a78d6"};border-radius:${off >= 0 ? "0 4px 4px 0" : "4px 0 0 4px"}` })),
        h("span", { class: "v" }, r.cost_index.toFixed(2))]; })); };
  put(root, pageHead("Hospital network analytics", "How each network hospital compares with the rest of the network on volume, cost, exceptions and rejections. A flag is a reason to review, not a finding about the hospital."),
    h("div", { class: "card", style: "margin-bottom:16px" }, h("div", { class: "row", style: "gap:34px" }, stat(t.hospitals, "Hospitals", "#/e/third_party?party_type=Hospital"), stat(t.with_claims, "With claims"), stat(t.claims, "Claims"),
      h("div", { class: "stat" }, h("b", {}, "₹" + fmt.num(Math.round(t.amount / 100000)) + " lakh"), h("span", {}, "Claimed amount")), stat(t.flagged, "Flagged for review"))),
    h("div", { class: "grid g2" },
      card("Number of claims (across) and exception rate (up)", scatter(), h("p", { class: "small muted", style: "margin:6px 0 0" }, "Each dot is one hospital. Further right means more claims; higher means more of its claims raised an exception.")),
      card("Cost against the network's typical cost", costBars(), h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-info" }), "Below typical"), h("span", {}, h("i", { class: "sw t-s2" }), "Above typical")),
        h("p", { class: "small muted", style: "margin:6px 0 0" }, "1.00 is the network's median cost for the same diagnosis groups.")),
      card("Claims by hospital", barList(rows.map((r) => ({ label: r.name, value: r.claims, id: r.id })), (i) => `#/e/third_party/${i.id}`)),
      card("Claims by city", barList(d.by_city.filter((c) => c.value)))),
    h("h2", { class: "section" }, "All hospitals"),
    simpleTable([{ label: "Hospital", render: (r) => h("a", { href: `#/e/third_party/${r.id}` }, r.name) }, { label: "City", key: "city" }, { label: "Claims", key: "claims", num: true }, { label: "Average claim (₹)", render: (r) => fmt.num(r.average_amount), num: true },
      { label: "Cost index", render: (r) => (r.cost_index ? r.cost_index.toFixed(2) : ""), num: true }, { label: "Cashless", render: (r) => (r.claims ? r.cashless_share + "%" : ""), num: true }, { label: "Exceptions", render: (r) => (r.claims ? r.exception_rate + "%" : ""), num: true },
      { label: "Rejected", render: (r) => (r.claims ? r.rejection_rate + "%" : ""), num: true }, { label: "Pre-auth (hours)", render: (r) => fmt.num(r.average_preauth_hours), num: true }, { label: "Fraud alerts", render: (r) => r.fraud_alerts || "", num: true },
      { label: "Review", render: (r) => (r.flags.length ? h("span", { class: "chip warn", "data-tip": r.flags.join("\n") }, `${r.flags.length} flag${r.flags.length > 1 ? "s" : ""}`) : "") }], d.hospitals),
    h("p", { class: "small muted", style: "max-width:92ch" }, d.method));
};
ROUTES.sampling = async (root) => {
  const list = await GET("/api/e/audit_sample?size=30"), audits = await options("audit"), out = h("div", {});
  const pops = ["claim", "grievance", "claim_exception", "control_test", "evidence", "finding", "capa", "policy_check", "underwriting_exception", "reconciliation", "access_review", "third_party"].filter((k) => ent(k) && can(ent(k).module, 1));
  const f = { ent: h("select", {}, pops.map((k) => h("option", { value: k }, ent(k).plural))), method: h("select", {}, ["Random", "Stratified", "Monetary unit"].map((m) => h("option", {}, m))), field: h("select", {}),
    size: h("input", { type: "number", min: 1, placeholder: "Suggested automatically" }), conf: h("input", { type: "number", value: 95, min: 50, max: 99 }), tol: h("input", { type: "number", value: 5, min: 1, max: 50 }),
    seed: h("input", { type: "number", placeholder: "Chosen for you and recorded" }), audit: h("select", {}, h("option", { value: "" }, ""), audits.map((a) => h("option", { value: a.id }, a.label))), why: h("input", { type: "text", placeholder: "What is being tested" }) };
  const fieldWrap = h("label", { class: "f" }, h("span", {}, "Field"), f.field), hint = h("p", { class: "small muted", style: "margin:8px 0 0" });
  const sync = async () => {
    const e = ent(f.ent.value), m = f.method.value;
    fieldWrap.hidden = m === "Random";
    fieldWrap.firstChild.textContent = m === "Stratified" ? "Stratify by (each group is sampled in proportion)" : "Amount field (larger amounts are more likely to be selected)";
    put(f.field, e.fields.filter((x) => !x.hidden && (m === "Stratified" ? x.type === "enum" : ["float", "int"].includes(x.type))).map((x) => h("option", { value: x.name }, x.label)));
    const total = (await GET(`/api/e/${f.ent.value}?size=1`)).total;
    const s = total ? (await GET(`/api/sampling/size?population=${total}&confidence=${f.conf.value || 95}&tolerable=${f.tol.value || 5}`)).size : 0;
    hint.textContent = `${fmt.num(total)} ${e.plural.toLowerCase()} in the population. For ${f.conf.value}% confidence that the true rate of exceptions is no more than ${f.tol.value}%, when none is expected, test ${s}.`;
  };
  [f.ent, f.method, f.conf, f.tol].forEach((x) => x.addEventListener("change", () => sync().catch(() => {})));
  const show = (s) => put(out, card([s.title, h("a", { href: `#/e/audit_sample/${s.id}` }, s.code)],
    h("div", { class: "row", style: "gap:30px;margin-bottom:12px" }, stat(s.sample_size, "Selected"), stat(s.population_count, "In the population"), h("div", { class: "stat" }, h("b", {}, String(s.seed)), h("span", {}, "Seed (re-creates this sample)"))),
    (s.breakdown || []).length ? h("div", { style: "max-width:560px;margin-bottom:12px" }, h("h3", { style: "margin-bottom:6px" }, s.method === "Monetary unit" ? "Value covered (₹)" : `By ${s.strata_field.replace(/_/g, " ")}: population and sample`),
      h("div", { class: "pair-bars" }, s.breakdown.map((b) => { const mx = Math.max(...s.breakdown.map((z) => z.population), 1); return [h("span", {}, b.label), h("div", {}, h("i", { class: "bar t-info", style: `width:${(100 * b.population) / mx}%`, "data-tip": `Population: ${fmt.num(b.population)}` }), h("i", { class: "bar t-s2", style: `width:${(100 * b.sampled) / mx}%`, "data-tip": `Sampled: ${fmt.num(b.sampled)}` })), h("span", { class: "v" }, `${fmt.num(b.sampled)} of ${fmt.num(b.population)}`)]; })),
      h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-info" }), "Population"), h("span", {}, h("i", { class: "sw t-s2" }), "Sample"))) : null,
    simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Record", render: (i) => h("a", { href: `#/e/${s.population_entity}/${i.id}` }, i.label || i.code) }], s.selected),
    s.audit && can("audit", 2) ? h("button", { class: "btn", style: "margin-top:12px", onclick: act(async () => { const r = await POST(`/api/sampling/${s.id}/workpapers`); toast(r.created ? `${r.created} workpaper(s) created on the audit` : "Every sampled record already has a workpaper"); }) }, "Create a workpaper for each sampled record") : null));
  put(root, pageHead("Audit sampling", "Select records to test without bias, and keep a record of how they were chosen. The same seed and population always give the same sample, so a reviewer or regulator can re-create it."),
    can("audit", 2) ? card("Draw a sample", h("div", { class: "form-grid" }, h("label", { class: "f" }, h("span", {}, "Population (the register to sample from)"), f.ent), h("label", { class: "f" }, h("span", {}, "Method"), f.method), fieldWrap,
      h("label", { class: "f" }, h("span", {}, "Confidence (%)"), f.conf), h("label", { class: "f" }, h("span", {}, "Tolerable rate of exceptions (%)"), f.tol), h("label", { class: "f" }, h("span", {}, "Sample size (leave empty to use the suggestion)"), f.size),
      h("label", { class: "f" }, h("span", {}, "Seed (leave empty for a new sample)"), f.seed), h("label", { class: "f" }, h("span", {}, "Audit (optional)"), f.audit), h("label", { class: "f wide" }, h("span", {}, "Purpose"), f.why)), hint,
      h("button", { class: "btn primary", style: "margin-top:12px", onclick: act(async () => { const m = f.method.value;
        show(await POST("/api/sampling", { population_entity: f.ent.value, method: m, strata_field: m === "Stratified" ? f.field.value : null, amount_field: m === "Monetary unit" ? f.field.value : null, sample_size: f.size.value || null,
          confidence: f.conf.value, tolerable_rate: f.tol.value, seed: f.seed.value || null, audit: f.audit.value ? Number(f.audit.value) : null, rationale: f.why.value })); annotate(out); }) }, "Draw sample")) : null,
    h("div", { style: "margin-top:16px" }, out),
    h("h2", { class: "section" }, "Samples drawn"),
    list.rows.length ? simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Sample", render: (s) => h("a", { href: "#", onclick: (e) => { e.preventDefault(); show(s); out.scrollIntoView({ behavior: "smooth" }); } }, s.title) }, { label: "Method", key: "method" },
      { label: "Selected", render: (s) => `${s.sample_size} of ${s.population_count}`, num: true }, { label: "Seed", key: "seed", num: true }, { label: "Drawn by", render: (s) => (s._labels || {}).drawn_by || "" }, { label: "When", render: (s) => fmt.dt(s.drawn_at) }], list.rows)
      : h("div", { class: "card" }, empty("No samples yet", "Draw the first one above.")));
  if (can("audit", 2)) sync().catch(() => {});
};
ROUTES.watch = async (root) => {
  const src = await GET("/api/e/watch_source?size=100&sort=name"), recent = await GET("/api/e/regulatory_change?status=Identified&size=12&sort=-id"), edit = can("regulatory", 2);
  put(root, pageHead("Regulatory watch", "Official pages are visited on a schedule. When a new document link appears, a regulatory change is raised with the status 'Identified' for a compliance officer to open, confirm and assess. The watch never decides that a change applies.",
      edit ? h("button", { class: "btn primary", onclick: act(() => recordForm("watch_source", null, { frequency: "Daily", active: true }, () => render())) }, "Watch a page") : null),
    src.rows.some((s) => !s.active) ? h("div", { class: "note", style: "margin-bottom:14px" }, "Starter sources load switched off. Open each one, confirm the address points at the list you rely on, then tick Active.") : null,
    h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Source", "Authority", "Checked", "Last visit", "Links seen", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, src.rows.map((s) => h("tr", {}, h("td", {}, h("a", { href: `#/e/watch_source/${s.id}` }, s.name), s.active ? null : h("span", { class: "muted small" }, " (switched off)"), h("div", { class: "code", style: "white-space:normal;word-break:break-all" }, s.url)),
        h("td", {}, s.authority || ""), h("td", {}, s.frequency || "Daily"), h("td", {}, s.last_status === "Failed" ? [chip("Failed"), h("div", { class: "small muted" }, s.last_error)] : [s.last_status || "Not visited yet", h("div", { class: "small muted" }, fmt.dt(s.last_checked))]),
        h("td", { class: "num" }, fmt.num(s.items_seen)), h("td", {}, edit ? h("button", { class: "btn sm", onclick: act(async () => { const r = await POST(`/api/watch/${s.id}/check`); toast(r.error ? r.error : r.baseline ? `First visit: ${r.items} links recorded as the starting point` : `${r.new} new link(s) raised for review`, !!r.error); render(); }) }, "Check now") : null)))))),
    h("h2", { class: "section" }, "Waiting to be assessed"),
    recent.rows.length ? simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Change", render: (r) => h("a", { href: `#/e/regulatory_change/${r.id}` }, r.title) }, { label: "Found", render: (r) => fmt.date(r.published_date) }, { label: "Status", render: (r) => chip(r.status) }], recent.rows)
      : h("div", { class: "card" }, empty("Nothing is waiting", "New links found by the watch appear here until someone assesses them.")));
};
/* Fieldwork: a phone-sized screen for auditors that keeps working without a connection. */
const FW = { cache: "fw_cache", queue: "fw_queue",
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
async function fieldworkSync() {
  const q = FW.get(FW.queue) || [], left = [];
  for (const item of q) {
    try { await PUT(`/api/e/audit_step/${item.id}`, item.data); } catch (e) { left.push(item); if (!e.offline) item.error = e.message; }
  }
  FW.set(FW.queue, left);
  return { sent: q.length - left.length, left: left.length };
}
ROUTES.fieldwork = async (root) => {
  let rows, offline = false;
  try { rows = (await GET("/api/e/audit_step?size=300&sort=-id")).rows; FW.set(FW.cache, rows); } catch (e) { if (!e.offline) throw e; offline = true; rows = FW.get(FW.cache) || []; }
  if (!offline) { const r = await fieldworkSync(); if (r.sent) toast(`${r.sent} saved result(s) sent`); }
  const queued = new Map((FW.get(FW.queue) || []).map((i) => [i.id, i.data])), mine = h("input", { type: "checkbox", checked: true }), listEl = h("div", { class: "fw-list" });
  const results = field("audit_step", "result").options;
  const draw = () => put(listEl, rows.filter((r) => !mine.checked || !r.auditor || r.auditor === G.me.user.id).map((r) => {
    const cur = { ...r, ...(queued.get(r.id) || {}) }, res = h("select", {}, results.map((o) => h("option", { selected: o === cur.result }, o))), note = h("textarea", { rows: 3, placeholder: "What you examined and what you found" }), state = h("span", { class: "small muted" }, queued.has(r.id) ? "Saved on this device. It will be sent when you are back online." : "");
    note.value = cur.workpaper_note || "";
    const photo = h("input", { type: "file", accept: "image/*,.pdf", capture: "environment", hidden: true, onchange: act(async () => {
      const fd = new FormData(); fd.append("file", photo.files[0]); const up = await api("POST", "/api/files", fd);
      const ev = await POST("/api/e/evidence", { title: `Fieldwork: ${r.title}`.slice(0, 190), file: up.id, control: r.control || null, description: "Captured during audit fieldwork.", collected_date: G.me.today, status: "Submitted" });
      await PUT(`/api/e/audit_step/${r.id}`, { evidence: [...(r.evidence || []), ev.id] }); r.evidence = [...(r.evidence || []), ev.id]; toast("Evidence attached"); }) });
    const save = act(async () => {
      const data = { result: res.value, workpaper_note: note.value, performed_date: G.me.today };
      try { await PUT(`/api/e/audit_step/${r.id}`, data); Object.assign(r, data); queued.delete(r.id); FW.set(FW.cache, rows); state.textContent = "Saved"; }
      catch (e) { if (!e.offline) throw e; const q = (FW.get(FW.queue) || []).filter((i) => i.id !== r.id); q.push({ id: r.id, data }); FW.set(FW.queue, q); queued.set(r.id, data); state.textContent = "Saved on this device. It will be sent when you are back online."; }
    });
    return h("section", { class: "card fw" }, h("div", { class: "code" }, `${r.code} · ${(r._labels || {}).audit || ""}`), h("h3", {}, r.title), r.procedure ? h("p", { class: "small" }, r.procedure) : null,
      h("label", { class: "f" }, h("span", {}, "Result"), res), h("label", { class: "f" }, h("span", {}, "Workpaper note"), note),
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: save }, "Save"), photo, h("button", { class: "btn", disabled: offline, onclick: () => photo.click() }, "Add photo or file"), (r.evidence || []).length ? h("span", { class: "small muted" }, `${r.evidence.length} evidence item(s)`) : null), state);
  }), rows.length ? null : empty("No workpapers", "Workpapers appear here when an audit's checklist is generated or a sample is turned into workpapers."));
  mine.addEventListener("change", draw);
  put(root, pageHead("Fieldwork", "Record audit results from a phone or tablet. If the connection drops, results are kept on this device and sent when it returns. On a phone, add this page to the home screen to open it like an app."),
    offline ? h("div", { class: "note", style: "margin-bottom:12px" }, "You are offline. Showing the workpapers saved on this device the last time you were online.") : null,
    (FW.get(FW.queue) || []).length ? h("div", { class: "note info", style: "margin-bottom:12px" }, `${(FW.get(FW.queue) || []).length} result(s) are waiting to be sent. `, h("button", { class: "btn sm", onclick: act(async () => { const r = await fieldworkSync(); toast(r.left ? `${r.sent} sent, ${r.left} still waiting` : `${r.sent} sent`); render(); }) }, "Send now")) : null,
    h("label", { class: "check", style: "margin-bottom:12px" }, mine, "Only workpapers assigned to me or unassigned"), listEl);
  draw();
};
window.addEventListener("online", () => { if (G.me && (FW.get(FW.queue) || []).length) fieldworkSync().then((r) => { if (r.sent) { toast(`${r.sent} saved result(s) sent`); if (location.hash.startsWith("#/fieldwork")) render(); } }); });
