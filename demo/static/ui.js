/* Shared building blocks: DOM helper, API client, formatting, chips, charts, modal, record form. */
"use strict";
const G = { me: null, meta: null, optCache: {} };
const ROUTES = {};          // extra pages register here: ROUTES.name = async (root, arg, query) => {}

/** h("div", {class: "x", onclick: fn}, child, "text") : builds DOM nodes; text is always escaped. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
/** Replace an element's children; accepts nested arrays and skips empty values. */
function put(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false && k !== "").map((k) => (k.nodeType ? k : document.createTextNode(String(k)))));
}
const $ = (sel, root) => (root || document).querySelector(sel);

async function api(method, url, body) {
  const opt = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opt); } catch (err) { const e = new Error("No connection to the server. Check your network and try again."); e.offline = true; throw e; }
  if (res.status === 401 && !url.includes("/auth/login")) { G.me = null; showGate(); throw new Error("Please sign in."); }
  const data = (res.headers.get("content-type") || "").includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || (data && data.detail && JSON.stringify(data.detail)) || `Request failed (${res.status})`);
  return data;
}
const GET = (u) => api("GET", u), POST = (u, b) => api("POST", u, b === undefined ? {} : b), PUT = (u, b) => api("PUT", u, b);

function toast(msg, bad) {
  const t = h("div", { class: "toast" + (bad ? " bad" : "") }, msg);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), bad ? 7000 : 3500);
}
/** Wrap an async action: disables the button, reports failures in plain words. */
function act(fn) {
  return async (ev) => {
    const b = ev && ev.currentTarget && ev.currentTarget.tagName === "BUTTON" ? ev.currentTarget : null;
    if (ev && ev.preventDefault) ev.preventDefault();
    if (b) b.disabled = true;
    try { await fn(ev); } catch (e) { toast(e.message, true); } finally { if (b) b.disabled = false; }
  };
}

const fmt = {
  date(v) { if (!v) return ""; const d = new Date(v.length <= 10 ? v + "T00:00:00" : v); return isNaN(d) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); },
  dt(v) { if (!v) return ""; const d = new Date(v); return isNaN(d) ? v : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); },
  num(v) { return v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }); },
  pct(v) { return v === null || v === undefined ? "No data" : `${v}%`; },
};

const TONES = {
  good: ["Met (evidence on file)", "Approved", "Accepted", "Pass", "Completed", "Closed", "Verified", "Resolved", "Active", "Effective", "Settled", "No exception detected", "Green", "Low", "Validated", "Implemented", "Done",
    "Satisfactory", "Remediated", "Reviewed", "Mitigated", "Minutes approved", "Held", "Empanelled", "In force", "Reviewed - no issues", "Reviewed - acceptable", "Documented exception", "Dismissed (justified)", "Corrected", "Not established", "Largely effective", "Validated by compliance"],
  warn: ["In progress", "Pending review", "Under review", "Pass with exceptions", "Amber", "Medium", "Submitted", "Under assessment", "CAPA in progress", "Pending verification", "Waiting for approval", "Pending", "Partial", "Prepared",
    "Monitoring: not yet due", "Under validation", "Impact assessed", "Implementation in progress", "Investigating", "Triaged", "Partially effective", "Contained", "In remediation", "Fieldwork", "Reporting", "Due diligence", "Query raised", "Acknowledged", "Assigned", "Not assessed", "Draft", "Planned", "Queued", "Running", "Not tested", "Never reported", "Not yet validated", "Unvalidated starter mapping", "Unvalidated starter rule"],
  bad: ["Gap identified", "Fail", "Rejected", "High", "Exception: review required", "Red", "Failed", "Overdue", "Open", "Exception", "Expired", "Escalated", "Reopened", "Suspended", "Observation", "Ineffective", "Reviewed - issues found", "Reviewed - breach", "Not effective", "New", "Error", "Repudiated", "Pre-auth denied", "Identified", "Not reporting"],
  crit: ["Critical", "Confirmed non-compliance", "Fraud established", "Urgent"],
};
const toneOf = (v) => Object.keys(TONES).find((t) => TONES[t].includes(v)) || "";
const chip = (v) => (v === null || v === undefined || v === "" ? "" : h("span", { class: "chip " + toneOf(v) }, v));

/* ── tooltips ── */
document.addEventListener("mousemove", (e) => {
  const tip = $("#tip"), t = e.target.closest ? e.target.closest("[data-tip]") : null;
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX + 14, innerWidth - r.width - 8) + "px";
  tip.style.top = (e.clientY + 18 + r.height > innerHeight ? e.clientY - r.height - 10 : e.clientY + 18) + "px";
});

/* ── figures ── */
function kpiTile(k) {
  return h("div", { class: "card kpi" },
    h("div", { class: "name" }, k.name),
    h("div", { class: "val" }, k.value === null ? "No data" : k.value + "%", k.value === null ? null : h("small", {}, `${fmt.num(k.numerator)} of ${fmt.num(k.denominator)}`)),
    h("div", { class: "meter", role: "img", "aria-label": `${k.name} ${fmt.pct(k.value)}` }, h("i", { style: `width:${Math.max(0, Math.min(100, k.value || 0))}%` })),
    h("div", { style: "margin-top:8px" }, h("span", { class: "how", "data-tip": k.rule, tabindex: 0 }, "How this is calculated")));
}
function barList(items, link) {
  if (!items || !items.length) return h("p", { class: "muted small" }, "Nothing to show yet.");
  const max = Math.max(...items.map((i) => i.value), 1);
  return h("div", { class: "bars" }, items.map((i) => [
    h("span", { class: "l", title: i.label }, link ? h("a", { href: link(i) }, i.label) : i.label),
    h("span", {}, h("i", { class: "bar", style: `display:block;width:${(100 * i.value) / max}%`, "data-tip": `${i.label}: ${fmt.num(i.value)}` })),
    h("span", { class: "v" }, fmt.num(i.value))]));
}
const SEG_TONE = { good: "t-good", warn: "t-warn", bad: "t-bad", crit: "t-crit", "": "t-neutral" };
function segBar(items, tones) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return h("p", { class: "muted small" }, "Nothing to show yet.");
  const cls = (i) => SEG_TONE[(tones && tones[i.label]) || toneOf(i.label)] || "t-neutral";
  return h("div", {},
    h("div", { class: "seg", role: "img", "aria-label": items.map((i) => `${i.label} ${i.value}`).join(", ") },
      items.filter((i) => i.value).map((i) => h("i", { class: cls(i), style: `flex:${i.value}`, "data-tip": `${i.label}: ${i.value} (${Math.round((100 * i.value) / total)}%)` }))),
    h("div", { class: "legend" }, items.map((i) => h("span", {}, h("i", { class: "sw " + cls(i) }), i.label, " ", h("b", {}, i.value)))));
}
/** Two-series weekly columns in SVG, with a legend and per-column hover. */
function columns(rows, keyA, keyB, labelA, labelB) {
  if (!rows.length) return h("p", { class: "muted small" }, "Nothing to show yet.");
  const W = 640, H = 190, pad = { l: 34, r: 8, t: 8, b: 26 }, max = Math.max(...rows.map((r) => r[keyA]), 1);
  const bw = (W - pad.l - pad.r) / rows.length, y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max), ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${labelA} and ${labelB} by week`); svg.style.width = "100%";
  const add = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text) e.textContent = text; svg.append(e); return e; };
  [0, 0.5, 1].forEach((f) => { add("line", { x1: pad.l, x2: W - pad.r, y1: y(max * f), y2: y(max * f), stroke: "#e3e7ec" }); add("text", { x: pad.l - 6, y: y(max * f) + 4, "text-anchor": "end", "font-size": 11, fill: "#77838f" }, Math.round(max * f)); });
  rows.forEach((r, i) => {
    const x = pad.l + i * bw, w = Math.max(4, bw * 0.34);
    const tip = `Week of ${fmt.date(r.week)}\n${labelA}: ${r[keyA]}\n${labelB}: ${r[keyB]}`;
    add("rect", { x: x + bw / 2 - w - 1, y: y(r[keyA]), width: w, height: Math.max(1, H - pad.b - y(r[keyA])), fill: "#2a78d6", rx: 2, "data-tip": tip });
    add("rect", { x: x + bw / 2 + 1, y: y(r[keyB]), width: w, height: Math.max(1, H - pad.b - y(r[keyB])), fill: "#eb6834", rx: 2, "data-tip": tip });
    if (rows.length <= 8 || i % 2 === 0) add("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "#77838f" }, fmt.date(r.week).slice(0, 6));
  });
  return h("div", {}, svg, h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-info" }), labelA), h("span", {}, h("i", { class: "sw t-s2" }), labelB)));
}
const stat = (value, label, href) => h("div", { class: "stat" }, h("b", {}, href ? h("a", { href }, fmt.num(value)) : fmt.num(value)), h("span", {}, label));
const card = (title, ...body) => h("section", { class: "card" }, title ? h("h2", {}, title) : null, ...body);
const pageHead = (title, sub, ...actions) => h("div", { class: "page-head" }, h("div", { class: "grow" }, h("h1", {}, title), sub ? h("p", {}, sub) : null, explain(title)), ...actions);
const empty = (title, text, action) => h("div", { class: "empty" }, h("b", {}, title), text, action ? h("div", { style: "margin-top:12px" }, action) : null);

function simpleTable(cols, rows, onRow) {
  if (!rows.length) return empty("Nothing here yet", "");
  return h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, cols.map((c) => h("th", { class: c.num ? "num" : "" }, c.label)))),
    h("tbody", {}, rows.map((r) => h("tr", { class: onRow ? "click" : "", onclick: onRow ? () => onRow(r) : null },
      cols.map((c) => h("td", { class: (c.num ? "num " : "") + (c.cls || "") }, c.render ? c.render(r) : r[c.key] === null || r[c.key] === undefined ? "" : r[c.key])))))));
}

/* ── modal ── */
function modal(title, body, buttons, narrow) {
  const close = () => ov.remove();
  const ov = h("div", { class: "overlay", onmousedown: (e) => { if (e.target === ov) close(); } },
    h("div", { class: "modal" + (narrow ? " narrow" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
      h("header", {}, h("h2", {}, title), h("button", { class: "btn ghost", onclick: close, "aria-label": "Close" }, "Close")),
      h("div", { class: "body" }, body),
      h("footer", {}, (buttons || []).map((b) => h("button", { class: "btn " + (b.cls || ""), onclick: act(async (e) => { if ((await b.run(e)) !== false) close(); }) }, b.label)))));
  document.body.append(ov);
  annotate(ov);
  const first = ov.querySelector("input,select,textarea");
  if (first) first.focus();
  return { close };
}
function confirmBox(title, text, label, run, danger) {
  modal(title, h("p", {}, text), [{ label: "Cancel", run: () => {} }, { label, cls: danger ? "danger" : "primary", run }], true);
}
/** Ask for a short note, then run. Used for approvals, rejections and reviews. */
function noteBox(title, hint, label, run, required) {
  const ta = h("textarea", { placeholder: hint });
  modal(title, h("label", { class: "f" }, h("span", {}, hint), ta), [{ label: "Cancel", run: () => {} },
    { label, cls: "primary", run: async () => { if (required && !ta.value.trim()) { toast("Please add a note.", true); return false; } await run(ta.value.trim()); } }], true);
}

/* ── record values ── */
const ent = (k) => G.meta.entities[k];
const field = (e, name) => ent(e).fields.find((f) => f.name === name);
const can = (module, level) => (G.me.permissions[module] || 0) >= level;

function showValue(e, f, rec) {
  const v = rec[f.name], L = rec._labels || {};
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "";
  if (f.type === "ref") return h("a", { href: `#/e/${f.to}/${v}`, onclick: (ev) => ev.stopPropagation() }, L[f.name] || `#${v}`);
  if (f.type === "refs") return h("span", {}, v.map((id, i) => h("a", { class: "tag link", href: `#/e/${f.to}/${id}`, onclick: (ev) => ev.stopPropagation() }, (L[f.name] || [])[i] || `#${id}`)));
  if (f.type === "file") return h("a", { href: `/api/files/${v}`, onclick: (ev) => ev.stopPropagation() }, L[f.name] || "Download file");
  if (f.type === "bool") return v ? "Yes" : "No";
  if (f.type === "date") return fmt.date(v);
  if (f.type === "datetime") return fmt.dt(v);
  if (f.type === "enum") return chip(v);
  if (f.type === "float" || (f.type === "int" && !/year/.test(f.name))) return fmt.num(v);
  if (f.type === "json") return h("pre", { class: "report small" }, JSON.stringify(v, null, 2));
  if (["residual_rating", "inherent_rating", "risk_rating", "rating", "rag", "test_status", "compliance_status", "last_result", "method"].includes(f.name)) return chip(v);
  return String(v);
}

async function options(entity) {
  const c = G.optCache[entity];
  if (c && Date.now() - c.t < 20000) return c.v;
  const v = await GET(`/api/e/${entity}/options`);
  G.optCache[entity] = { t: Date.now(), v };
  return v;
}

/** Build an input for one field. Returns {el, get()} */
async function fieldInput(f, value) {
  if (f.type === "enum") {
    const s = h("select", {}, f.required ? null : h("option", { value: "" }, ""), f.options.map((o) => h("option", { value: o, selected: o === (value === undefined || value === null ? f.default : value) }, o)));
    return { el: s, get: () => s.value || null };
  }
  if (f.type === "ref") {
    const opts = await options(f.to);
    const s = h("select", {}, h("option", { value: "" }, ""), opts.map((o) => h("option", { value: o.id, selected: o.id === value }, o.label + (o.sub ? ` (${o.sub})` : ""))));
    return { el: s, get: () => (s.value ? Number(s.value) : null) };
  }
  if (f.type === "refs") {
    const opts = await options(f.to), set = new Set(value || []);
    const box = h("div", { class: "multi" }, opts.length ? opts.map((o) => h("label", {}, h("input", { type: "checkbox", value: o.id, checked: set.has(o.id) }), o.label)) : h("span", { class: "muted small" }, "No records to choose from yet."));
    return { el: box, get: () => [...box.querySelectorAll("input:checked")].map((i) => Number(i.value)) };
  }
  if (f.type === "bool") {
    const c = h("input", { type: "checkbox", checked: !!value });
    return { el: h("span", { class: "check" }, c, h("span", { class: "muted small" }, "Yes")), get: () => c.checked };
  }
  if (f.type === "long") { const t = h("textarea", {}); t.value = value || ""; return { el: t, get: () => t.value }; }
  if (f.type === "json") {
    const t = h("textarea", { style: "font-family:ui-monospace,Consolas,monospace;font-size:12.5px;min-height:120px" });
    t.value = value === null || value === undefined ? "" : JSON.stringify(value, null, 2);
    return { el: t, get: () => { if (!t.value.trim()) return null; try { return JSON.parse(t.value); } catch (e) { throw new Error(`${f.label}: this is not valid JSON.`); } } };
  }
  if (f.type === "file") {
    let id = value || null;
    const status = h("span", { class: "small muted" }, id ? "A file is attached. Choose another to replace it." : "PDF, Word, Excel, CSV, images. Up to 25 MB.");
    const inp = h("input", { type: "file", onchange: act(async () => {
      if (!inp.files[0]) return;
      const fd = new FormData(); fd.append("file", inp.files[0]); status.textContent = "Uploading…";
      const r = await api("POST", "/api/files", fd); id = r.id; status.textContent = `Attached: ${r.name}`;
    }) });
    return { el: h("div", {}, inp, h("div", {}, status)), get: () => id };
  }
  const type = { int: "number", float: "number", date: "date", datetime: "datetime-local" }[f.type] || (f.name === "email" ? "email" : "text");
  const i = h("input", { type, step: f.type === "float" ? "any" : null });
  i.value = value === null || value === undefined ? "" : f.type === "datetime" ? String(value).slice(0, 16) : value;
  return { el: i, get: () => (i.value === "" ? null : f.type === "int" || f.type === "float" ? Number(i.value) : i.value) };
}

/** Create / edit form for any register, generated from the field definitions. */
async function recordForm(entity, rec, preset, after) {
  const e = ent(entity), inputs = {};
  const fields = e.fields.filter((f) => !f.readonly && !f.hidden && !(entity === "workflow" && ["trigger", "steps", "trigger_type"].includes(f.name)));
  const grid = h("div", { class: "form-grid" });
  for (const f of fields) {
    const val = rec ? rec[f.name] : preset && preset[f.name] !== undefined ? preset[f.name] : undefined;
    inputs[f.name] = await fieldInput(f, val);
    grid.append(h("label", { class: "f" + (["long", "json", "refs"].includes(f.type) ? " wide" : "") }, h("span", {}, f.label, f.required ? h("i", { class: "req" }, " *") : null, f.pii ? h("i", { class: "muted" }, " (personal data)") : null), inputs[f.name].el));
  }
  modal(`${rec ? "Edit" : "New"} ${e.label.toLowerCase()}`, grid, [{ label: "Cancel", run: () => {} }, {
    label: rec ? "Save changes" : `Create ${e.label.toLowerCase()}`, cls: "primary", run: async () => {
      const data = {};
      for (const f of fields) data[f.name] = inputs[f.name].get();
      const saved = rec ? await PUT(`/api/e/${entity}/${rec.id}`, data) : await POST(`/api/e/${entity}`, data);
      delete G.optCache[entity];
      toast(rec ? "Changes saved" : `${e.label} ${saved.code} created`);
      if (after) after(saved); else if (!rec) location.hash = `#/e/${entity}/${saved.id}`; else render();
    } }]);
}
