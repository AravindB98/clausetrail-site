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
