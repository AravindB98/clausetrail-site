/* Screens: sign-in, shell, dashboards, registers, and the analysis and administration pages. */
"use strict";
const P = {};
const LIFECYCLE = ["Regulation", "Obligation", "Applicability", "Risk", "Control", "Evidence", "Testing", "Audit", "Finding", "CAPA", "Reporting"];

/* ── shell ── */
function shell() {
  const cur = location.hash.split("?")[0];
  const openGroups = JSON.parse(sessionStorage.getItem("nav") || "{}");
  const side = h("nav", { class: "side", "aria-label": "Main" },
    h("div", { class: "brand" }, h("img", { src: "static/favicon.svg", alt: "" }), h("div", {}, h("b", {}, "ClauseTrail"), h("span", {}, G.me.tenant.name))),
    G.me.menu.map((g) => {
      const active = g.items.some((i) => i.href.split("?")[0] === cur || cur.startsWith(i.href.split("?")[0] + "/"));
      const grp = h("div", { class: "nav-group" + (active || openGroups[g.label] ? " open" : "") },
        h("button", { "aria-expanded": active ? "true" : "false", onclick: () => { grp.classList.toggle("open"); openGroups[g.label] = grp.classList.contains("open"); sessionStorage.setItem("nav", JSON.stringify(openGroups)); } }, h("span", {}, g.label), h("span", { class: "chev" }, "›")),
        h("div", { class: "nav-items" }, g.items.map((i) => h("a", { href: i.href, class: location.hash === i.href || (cur === i.href && !i.href.includes("?") && !location.hash.includes("?")) ? "on" : "" }, i.label))));
      return grp;
    }));
  const tenantSel = G.me.tenants.length > 1 ? h("select", { style: "width:auto", "aria-label": "Organisation", onchange: act(async (e) => { await POST("/api/tenants/switch", { id: Number(e.target.value) }); G.optCache = {}; await boot(); }) },
    G.me.tenants.map((t) => h("option", { value: t.id, selected: t.id === G.me.tenant.id }, t.name))) : h("span", { class: "org" }, G.me.tenant.name);
  const top = h("header", { class: "top" },
    h("button", { class: "btn sm menu-btn", onclick: () => side.classList.toggle("show") }, "Menu"), tenantSel,
    G.me.ai_mode === "rules" ? h("span", { class: "pill", "data-tip": "AI agents are running on built-in rules. Add a model key in the .env file to enable language-model drafting." }, "AI: rules mode") : h("span", { class: "pill" }, "AI: " + G.me.ai_mode),
    h("span", { class: "grow" }),
    can("work", 1) ? h("a", { href: "#/approvals" }, "Approvals", G.me.pending_approvals ? h("span", { class: "count" }, G.me.pending_approvals) : null) : null,
    can("work", 1) ? h("a", { href: "#/e/notification" }, "Notifications", G.me.unread ? h("span", { class: "count" }, G.me.unread) : null) : null,
    h("span", { class: "muted small" }, `${G.me.user.name} · ${G.me.user.role}`),
    h("button", { class: "btn sm", onclick: () => P.account() }, "Account"),
    h("button", { class: "btn sm", onclick: act(async () => { await POST("/api/auth/logout"); G.me = null; showGate(); }) }, "Sign out"));
  const content = h("main", { class: "content", id: "content" });
  put(document.getElementById("app"), h("div", { class: "shell" }, side, h("div", { class: "main" }, top, content)));
  return content;
}
/* ── dashboards ── */
const dashTabs = (name) => h("div", { class: "tabs" }, [["executive", "Executive"], ["department", "Department"], ["compliance", "Compliance"], ["risk", "Risk"]].map(([k, l]) =>
  h("button", { class: k === name ? "on" : "", onclick: () => (location.hash = `#/dashboard/${k}`) }, l)));
const railOf = (stages) => h("div", { class: "rail" }, stages.map((s) => h("a", { href: s.link, class: s.count ? "" : "gap" }, h("b", {}, fmt.num(s.count)), h("span", {}, s.stage))));

P.dashboard = async (root, name, q) => {
  const d = await GET(`/api/dashboard/${name}${q.department ? "?department=" + q.department : ""}`);
  const out = [pageHead({ executive: "Executive dashboard", department: `${(d.department || {}).name || "Department"} dashboard`, compliance: "Compliance dashboard", risk: "Risk dashboard" }[name],
    name === "executive" ? "Figures count only approved, applicable records. Hover 'How this is calculated' under any number." : null), dashTabs(name)];
  if (name === "executive") {
    out.push(railOf(d.lifecycle));
    if (d.pending_review) out.push(h("div", { class: "note", style: "margin-top:14px" }, `${d.pending_review} obligation(s) are waiting for compliance review and are not yet counted. `, h("a", { href: "#/e/obligation?review_status=Pending review" }, "Review them")));
    out.push(h("div", { class: "grid g5", style: "margin-top:16px" }, d.kpis.map(kpiTile)));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      card(["Compliance status", h("a", { href: "#/e/obligation" }, "Obligations")], segBar(d.obligation_status)),
      card(["Risk", h("a", { href: "#/heatmap" }, "Heatmap")], h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, stat(d.risks.critical, "Critical residual", "#/e/risk?residual_rating=Critical"), stat(d.risks.high, "High residual", "#/e/risk?residual_rating=High"), stat(d.risks.over_appetite, "Above appetite", "#/e/risk?exceeds_appetite=true")),
        simpleTable([{ label: "Top residual risks", render: (r) => h("a", { href: `#/e/risk/${r.id}` }, r.title), cls: "clip" }, { label: "Score", key: "residual", num: true }, { label: "Rating", render: (r) => chip(r.rating) }], d.risks.top.slice(0, 4))),
      card(["Audit findings and CAPA", h("a", { href: "#/e/finding?status__ne=Closed" }, "Open findings")], h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, stat(d.findings.open, "Open findings"), stat(d.findings.overdue, "Findings overdue"), stat(d.capa.overdue, "CAPA overdue", "#/e/capa"), stat(d.capa.awaiting_verification, "Awaiting verification", "#/e/capa?status=Implemented")),
        segBar(d.findings.by_severity, { Critical: "crit", High: "bad", Medium: "warn", Low: "good" })),
      card(["Claims compliance", h("a", { href: "#/claims" }, "Details")], segBar(d.claims.status), h("p", { class: "small muted", style: "margin:10px 0 0" }, `${d.claims.open_exceptions} exception(s) awaiting review. An exception is a prompt for review, not a finding.`)),
      card(["TPA performance", h("a", { href: "#/e/third_party?party_type=TPA" }, "TPA register")], simpleTable([{ label: "TPA", render: (t) => h("a", { href: `#/e/third_party/${t.id}` }, t.name), cls: "clip" }, { label: "Risk", render: (t) => chip(t.rating) }, { label: "SLA met", render: (t) => fmt.pct(t.sla_met), num: true },
        { label: "Reassessment", render: (t) => (t.overdue ? chip("Overdue") : fmt.date(t.reassessment_due)) }], d.tpa)),
      card(["Security, privacy and grievances"], h("div", { class: "row", style: "gap:26px" }, stat(d.incidents.open, "Open incidents", "#/e/security_incident"), stat(d.incidents.breaches, "Data breaches, 90 days"), stat(d.grievances.open, "Open grievances", "#/e/grievance"), stat(d.grievances.overdue, "Past timeline"))),
      h("div", { class: "span2" }, card(["Department-wise compliance", h("a", { href: "#/reports/REP-003" }, "Report")], simpleTable([{ label: "Department", render: (r) => h("a", { href: `#/dashboard/department?department=${r.id}` }, r.department) }, { label: "Obligations", key: "obligations", num: true },
        { label: "Met", render: (r) => h("div", { class: "meter", style: "width:110px;display:inline-block;vertical-align:middle;margin-right:8px", "data-tip": `${r.met} of ${r.obligations} met` }, h("i", { style: `width:${r.met_pct || 0}%` })), }, { label: "%", render: (r) => fmt.pct(r.met_pct), num: true },
        { label: "Gaps", key: "gaps", num: true }, { label: "Overdue", key: "overdue", num: true }, { label: "Open findings", key: "open_findings", num: true }], d.departments))),
      h("div", { class: "stack" }, card(["Regulatory changes", h("a", { href: "#/e/regulatory_change" }, "All")], d.regulatory_changes.length ? d.regulatory_changes.map((c) => h("div", { style: "margin-bottom:8px" }, h("a", { href: `#/e/regulatory_change/${c.id}` }, c.title), h("div", {}, chip(c.status), c.deadline ? h("span", { class: "muted small" }, `  due ${fmt.date(c.deadline)}`) : null))) : h("p", { class: "muted small" }, "None in progress.")),
        card(["Management actions pending", h("a", { href: "#/e/governance_action" }, "All")], d.management_actions.length ? d.management_actions.map((a) => h("div", { style: "margin-bottom:6px" }, h("a", { href: `#/e/governance_action/${a.id}` }, a.title), " ", a.overdue ? chip("Overdue") : h("span", { class: "muted small" }, fmt.date(a.due_date)))) : h("p", { class: "muted small" }, "None.")))));
    out.push(trendsBlock());
  } else if (name === "department") {
    const depts = await options("department");
    if (!["Department Head", "Employee"].includes(G.me.user.role)) out.splice(1, 0, h("div", { class: "row", style: "margin:-8px 0 12px" }, h("span", { class: "muted" }, "Department"),
      h("select", { style: "width:auto", onchange: (e) => (location.hash = `#/dashboard/department?department=${e.target.value}`) }, depts.map((x) => h("option", { value: x.id, selected: x.id === d.department.id }, x.label.split(" · ")[1] || x.label)))));
    const dq = `department=${d.department.id}`;
    out.push(h("div", { class: "grid g5" }, d.kpis.filter((k) => k.denominator).slice(0, 5).map(kpiTile)));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      card(["Applicable obligations", h("a", { href: `#/e/obligation?${dq}` }, "Open")], h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, stat(d.obligations.total, "Obligations"), stat(d.obligations.overdue, "Overdue"), stat(d.obligations.pending_review, "Awaiting review")), segBar(d.obligations.status)),
      card(["Assigned controls", h("a", { href: `#/e/control?${dq}` }, "Open")], h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, stat(d.controls.total, "Controls")), h("h3", { style: "margin-bottom:6px" }, "Latest test result"), segBar(d.controls.test_status, { "Not set": "" })),
      card(["Evidence submission", h("a", { href: `#/e/evidence?${dq}` }, "Open")], segBar(d.evidence)),
      card(["Risk exposure", h("a", { href: `#/e/risk?${dq}` }, "Open")], h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, stat(d.risk.total, "Risks"), stat(d.risk.over_appetite, "Above appetite"), stat(d.pending_assessments, "Assessments pending")), segBar(d.risk.by_rating, { Critical: "crit", High: "bad", Medium: "warn", Low: "good", "Not set": "" })),
      card(["Open findings", h("a", { href: `#/e/finding?${dq}` }, "Open")], h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, stat(d.findings.open, "Open")), segBar(d.findings.by_severity, { Critical: "crit", High: "bad", Medium: "warn", Low: "good" })),
      card(["CAPA status", h("a", { href: `#/e/capa?${dq}` }, "Open")], segBar(d.capa)),
      h("div", { class: "span3" }, card("Upcoming deadlines (next 45 days and overdue)", simpleTable([{ label: "Date", render: (r) => fmt.date(r.date), cls: "nowrap" }, { label: "", render: (r) => (r.overdue ? chip("Overdue") : "") }, { label: "Type", render: (r) => ent(r.entity).label },
        { label: "Item", render: (r) => h("a", { href: `#/e/${r.entity}/${r.id}` }, `${r.code} · ${r.title}`) }], d.deadlines)))));
  } else if (name === "compliance") {
    out.push(h("div", { class: "grid g4" }, d.kpis.map(kpiTile)));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      h("div", { class: "span2" }, card("Approved obligations by framework", simpleTable([{ label: "Framework", key: "framework" }, { label: "Met", key: "met", num: true }, { label: "In progress", key: "in_progress", num: true }, { label: "Gap", key: "gap", num: true }, { label: "Not assessed", key: "not_assessed", num: true },
        { label: "", render: (r) => h("div", { style: "width:160px" }, h("div", { class: "seg", style: "height:10px" }, [["met", "t-good"], ["in_progress", "t-warn"], ["gap", "t-bad"], ["not_assessed", "t-neutral"]].filter(([k]) => r[k]).map(([k, c]) => h("i", { class: c, style: `flex:${r[k]}` })))) }], d.by_framework))),
      h("div", { class: "stack" }, card("Review status", segBar(d.review)), card("Applicability", segBar(d.applicability, { Applicable: "good", "Under assessment": "warn", "Not applicable": "" }))),
      card("Obligation type", barList(d.types)), card(["Regulatory change pipeline", h("a", { href: "#/e/regulatory_change" }, "Open")], barList(d.changes)),
      card(["Grievance handling", h("a", { href: "#/e/grievance" }, "Open")], h("div", { class: "row", style: "gap:22px;margin-bottom:12px" }, stat(d.grievances.open, "Open"), stat(d.grievances.overdue, "Past timeline"), stat(d.grievances.repeat, "Repeat"), h("div", { class: "stat" }, h("b", {}, fmt.pct(d.grievances.resolved_on_time)), h("span", {}, "Resolved on time"))), barList(d.grievances.by_category)),
      h("div", { class: "span3" }, card(["Overdue obligations", h("a", { href: "#/calendar" }, "Compliance calendar")], simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Obligation", render: (r) => h("a", { href: `#/e/obligation/${r.id}` }, r.title) }, { label: "Due", render: (r) => fmt.date(r.due_date) }, { label: "Status", render: (r) => chip(r.status) }], d.overdue)))));
  } else {
    out.push(h("div", { class: "grid g3" },
      h("div", { class: "span2" }, card(["Residual risk heatmap", h("a", { href: "#/heatmap" }, "Inherent and residual")], heatGrid(d.heatmap.residual))),
      h("div", { class: "stack" }, kpiTile(d.kpi), card("Key risk indicators", segBar(d.kri, { Red: "crit", Amber: "warn", Green: "good", "Not set": "" }), d.kri_red.map((k) => h("div", { class: "small", style: "margin-top:8px" }, h("a", { href: `#/e/kri/${k.id}` }, k.name), `: ${fmt.num(k.value)} ${k.unit || ""} (red at ${fmt.num(k.red)})`))),
        card(["Treatment plans", h("a", { href: "#/e/risk_treatment" }, "Open")], h("div", { class: "row", style: "gap:26px" }, stat(d.treatments.open, "Open"), stat(d.treatments.overdue, "Overdue")))),
      card("Open risks by category", barList(d.by_category, (i) => `#/e/risk?category=${encodeURIComponent(i.label)}`)),
      card("Before and after controls", h("h3", { style: "margin-bottom:6px" }, "Inherent"), segBar(d.by_rating.inherent, { Critical: "crit", High: "bad", Medium: "warn", Low: "good" }), h("h3", { style: "margin:14px 0 6px" }, "Residual"), segBar(d.by_rating.residual, { Critical: "crit", High: "bad", Medium: "warn", Low: "good" })),
      card("Above risk appetite", d.over_appetite.length ? simpleTable([{ label: "Risk", render: (r) => h("a", { href: `#/e/risk/${r.id}` }, r.title) }, { label: "Residual", key: "residual", num: true }, { label: "Appetite", key: "appetite", num: true }], d.over_appetite) : h("p", { class: "muted small" }, "No open risk exceeds its appetite threshold."))));
  }
  put(root, ...out);
};

function heatGrid(cells, onPick) {
  const band = (s) => (s >= 16 ? "b-crit" : s >= 10 ? "b-high" : s >= 5 ? "b-med" : "b-low");
  const g = h("div", { class: "heat", role: "table", "aria-label": "Risk heatmap: likelihood by impact" });
  for (let l = 5; l >= 1; l--) {
    g.append(h("div", { class: "ax" }, l));
    for (let i = 1; i <= 5; i++) {
      const items = cells[`${l}-${i}`] || [];
      g.append(h("button", { class: `cell ${band(l * i)}` + (items.length ? " has" : ""), "data-tip": items.length ? `Likelihood ${l}, impact ${i}\n` + items.map((x) => `${x.code} ${x.title}`).join("\n") : `Likelihood ${l}, impact ${i}: no risks`,
        onclick: () => (items.length && onPick ? onPick(items, l, i) : items.length === 1 ? (location.hash = `#/e/risk/${items[0].id}`) : null) }, items.length || ""));
    }
  }
  g.append(h("div", {}), ...[1, 2, 3, 4, 5].map((i) => h("div", { class: "ax" }, i)));
  return h("div", {}, h("div", { class: "row", style: "align-items:stretch" }, h("div", { class: "muted small", style: "writing-mode:vertical-rl;transform:rotate(180deg);text-align:center" }, "Likelihood"), h("div", { class: "grow" }, g)), h("div", { class: "muted small", style: "margin:4px 0 8px 44px" }, "Impact"),
    h("div", { class: "legend" }, [["b-low", "Low (1 to 4)"], ["b-med", "Medium (5 to 9)"], ["b-high", "High (10 to 15)"], ["b-crit", "Critical (16 to 25)"]].map(([c, l]) => h("span", {}, h("i", { class: "sw heat-sw " + c, style: `background:${{ "b-low": "#dff0df", "b-med": "#fdecc2", "b-high": "#f8d2c2", "b-crit": "#eeb5b5" }[c]}` }), l))));
}
P.heatmap = async (root) => {
  const d = await GET("/api/heatmap"), list = h("div", {});
  const pick = (items, l, i) => put(list, card(`Likelihood ${l}, impact ${i}`, items.map((x) => h("div", {}, h("a", { href: `#/e/risk/${x.id}` }, `${x.code} · ${x.title}`)))));
  put(root, pageHead("Risk heatmap", "Open risks before controls (inherent) and after controls (residual). Select a cell to list its risks."),
    h("div", { class: "grid g2" }, card("Inherent risk", heatGrid(d.inherent, pick)), card("Residual risk", heatGrid(d.residual, pick))), h("div", { style: "margin-top:16px" }, list));
};

/* ── registers: list ── */
P.list = async (root, entity, q) => {
  const e = ent(entity);
  if (!e) return put(root, empty("Page not found", ""));
  const state = { q: q.q || "", sort: q.sort || "-id", page: Number(q.page || 1) };
  const filters = Object.fromEntries(Object.entries(q).filter(([k]) => !["q", "sort", "page"].includes(k)));
  const writable = can(e.module, 2) && !G.meta.locked.includes(entity);
  const go = (patch) => { const p = new URLSearchParams({ ...filters, ...(state.q ? { q: state.q } : {}), sort: state.sort, page: state.page, ...patch }); for (const [k, v] of [...p]) if (v === "" || v === "undefined") p.delete(k); location.hash = `#/e/${entity}?${p}`; };
  const enumFs = e.fields.filter((f) => f.type === "enum" && (e.list_fields.includes(f.name) || /status|severity|type|category/.test(f.name))).slice(0, 4);
  const search = h("input", { type: "search", placeholder: `Search ${e.plural.toLowerCase()}`, value: state.q, style: "max-width:260px", onkeydown: (ev) => { if (ev.key === "Enter") go({ q: ev.target.value, page: 1 }); } });
  const importInput = h("input", { type: "file", accept: ".csv,.xlsx", hidden: true, onchange: act(async () => {
    const fd = new FormData(); fd.append("file", importInput.files[0]);
    const r = await api("POST", `/api/e/${entity}/import`, fd);
    modal("Import finished", h("div", { class: "stack" }, h("p", {}, `${r.created} created, ${r.updated} updated, ${r.errors.length} rejected.`),
      r.unmatched_columns.length ? h("p", { class: "note" }, "Columns not recognised and skipped: " + r.unmatched_columns.join(", ")) : null,
      r.errors.length ? simpleTable([{ label: "Row", key: "row" }, { label: "Problem", key: "error" }], r.errors.slice(0, 50)) : null), [{ label: "Done", cls: "primary", run: () => render() }]);
  }) });
  const params = new URLSearchParams({ ...filters, q: state.q, sort: state.sort, page: state.page, size: 50 });
  const data = await GET(`/api/e/${entity}?${params}`);
  const cols = e.list_fields.map((n) => field(entity, n)).filter(Boolean);
  const th = (f) => h("th", { class: "sort" + (["int", "float"].includes(f.type) ? " num" : ""), onclick: f.type === "refs" ? null : () => go({ sort: state.sort === f.name ? "-" + f.name : f.name, page: 1 }) }, f.label, state.sort === f.name ? " ↑" : state.sort === "-" + f.name ? " ↓" : "");
  const exportQ = new URLSearchParams({ ...filters, q: state.q });
  const activeFilters = Object.entries(filters).filter(([k]) => !enumFs.some((f) => f.name === k));
  put(root, 
    pageHead(e.plural, `${fmt.num(data.total)} record${data.total === 1 ? "" : "s"}` + (entity === "obligation" ? ". Only approved, applicable obligations count towards compliance figures." : entity === "fraud_alert" ? ". Alerts are investigation leads, not determinations." : ""),
      writable ? h("button", { class: "btn primary", onclick: act(() => (entity === "workflow" ? (location.hash = "#/workflows/new") : recordForm(entity, null, filters))) }, `New ${e.label.toLowerCase()}`) : null),
    h("div", { class: "row", style: "margin-bottom:12px" }, search,
      enumFs.map((f) => h("select", { style: "width:auto;max-width:190px", "aria-label": f.label, onchange: (ev) => { filters[f.name] = ev.target.value; go({ [f.name]: ev.target.value, page: 1 }); } }, h("option", { value: "" }, `${f.label}: all`), f.options.map((o) => h("option", { value: o, selected: filters[f.name] === o }, o)))),
      activeFilters.map(([k, v]) => h("span", { class: "tag" }, `${k.replace("__ne", " is not").replace(/_/g, " ")}: ${v} `, h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); delete filters[k]; go({ page: 1 }); } }, "clear"))),
      h("span", { class: "grow" }),
      writable ? [importInput, h("button", { class: "btn sm", onclick: () => importInput.click(), "data-tip": "Upload a CSV or Excel file. Column headings should match the template." }, "Import"), h("a", { class: "btn sm", href: `/api/e/${entity}/template` }, "Template")] : null,
      h("a", { class: "btn sm", href: `/api/e/${entity}/export?fmt=xlsx&${exportQ}` }, "Export Excel"), h("a", { class: "btn sm", href: `/api/e/${entity}/export?fmt=csv&${exportQ}` }, "CSV")),
    data.total > 1 ? summaryStrip(entity, new URLSearchParams({ ...filters, q: state.q })) : null,
    data.rows.length ? h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { class: "sort", onclick: () => go({ sort: state.sort === "id" ? "-id" : "id" }) }, "Ref"), cols.map(th))),
      h("tbody", {}, data.rows.map((r) => h("tr", { class: "click", onclick: () => (location.hash = entity === "workflow" ? `#/workflows/${r.id}` : `#/e/${entity}/${r.id}`) },
        h("td", { class: "code" }, r.code), cols.map((f, i) => h("td", { class: (["int", "float"].includes(f.type) ? "num " : "") + (i === 0 ? "clip" : "") }, showValue(entity, f, r)))))))) :
      h("div", { class: "card" }, empty(state.q || Object.keys(filters).length ? "No records match" : `No ${e.plural.toLowerCase()} yet`, state.q || Object.keys(filters).length ? "Clear the search or filters to see everything." : writable ? "Create the first one, or import a spreadsheet." : "")),
    data.total > 50 ? h("div", { class: "pager" }, `${(state.page - 1) * 50 + 1} to ${Math.min(state.page * 50, data.total)} of ${fmt.num(data.total)}`,
      h("button", { class: "btn sm", disabled: state.page <= 1, onclick: () => go({ page: state.page - 1 }) }, "Previous"), h("button", { class: "btn sm", disabled: state.page * 50 >= data.total, onclick: () => go({ page: state.page + 1 }) }, "Next")) : null);
};

/* ── registers: one record ── */
const ADD_RELATED = { finding: [["capa", "finding", "Add corrective action"]], control: [["evidence", "control", "Add evidence"], ["control_test", "control", "Record a test"]], risk: [["risk_treatment", "risk", "Add treatment"], ["kri", "risk", "Add indicator"]],
  third_party: [["tp_assessment", "third_party", "New assessment"], ["tp_sla", "third_party", "Add SLA measurement"], ["tp_incident", "third_party", "Log incident"]], audit: [["finding", "audit", "Add finding"], ["audit_step", "audit", "Add workpaper"]],
  obligation: [["evidence", "obligation", "Add evidence"]], regulation: [["clause", "regulation", "Add clause"]], clause: [["obligation", "clause", "Add obligation"]], meeting: [["governance_action", "meeting", "Add action"]],
  training_programme: [["training_assignment", "programme", "Assign to someone"]], product: [["policy_wording", "product", "Add policy wording"]], fraud_alert: [], claim: [["grievance", "claim", "Log grievance"]] };
const AGENT_BTN = { obligation: ["compliance_mapping", "Suggest controls (AI)"], risk: ["risk_assessment", "Suggest assessment (AI)"], evidence: ["evidence_validation", "Pre-check evidence (AI)"], third_party: ["third_party_risk", "Review with AI"],
  audit: ["audit_reporting", "Draft report (AI)"], finding: ["audit_reporting", "Root cause prompts (AI)"] };

P.detail = async (root, entity, id) => {
  const e = ent(entity), rec = await GET(`/api/e/${entity}/${id}`);
  const writable = can(e.module, 2) && !G.meta.locked.includes(entity);
  const title = rec[e.label_field] || rec.code;
  const runAgent = (agent, body) => act(async () => { toast("Working on it…"); const r = await POST(`/api/ai/run/${agent}`, body); location.hash = `#/e/ai_recommendation/${r.id}`; });
  const actions = [];
  if (AGENT_BTN[entity] && can("ai", 2)) actions.push(h("button", { class: "btn", onclick: runAgent(AGENT_BTN[entity][0], { id: rec.id, entity }) }, AGENT_BTN[entity][1]));
  if (entity === "regulation" && can("ai", 2)) actions.push(h("button", { class: "btn", onclick: () => (location.hash = `#/ai?regulation=${rec.id}`) }, "Extract obligations (AI)"));
  if (entity === "audit" && can("audit", 2)) actions.push(h("button", { class: "btn", onclick: act(async () => { const r = await POST(`/api/audits/${rec.id}/checklist`); toast(r.created ? `${r.created} workpaper(s) created from the controls in scope` : "Every control in scope already has a workpaper"); render(); }) }, "Generate checklist"));
  if (entity === "obligation") actions.push(h("a", { class: "btn", href: `#/trace/${rec.id}` }, "Trace lifecycle"));
  if (entity === "user" && can("admin", 4)) actions.push(h("button", { class: "btn", onclick: () => {
    const p = h("input", { type: "password", autocomplete: "new-password" });
    modal(`Set password for ${rec.name}`, h("label", { class: "f" }, h("span", {}, "New password (10+ characters, letters and numbers). Share it with the user securely."), p),
      [{ label: "Cancel", run: () => {} }, { label: "Set password", cls: "primary", run: async () => { await POST(`/api/users/${rec.id}/password`, { password: p.value }); toast(`${rec.name} can now sign in`); render(); } }], true);
  } }, rec.can_sign_in ? "Reset password" : "Set password so they can sign in"));
  if (entity === "user" && can("admin", 4) && rec.mfa_enabled) actions.push(h("button", { class: "btn", onclick: () => confirmBox(`Reset two-step sign-in for ${rec.name}?`, "Use this when someone has lost or replaced their phone. Their authenticator and recovery codes stop working, they are signed out, and they set it up again at next sign-in.", "Reset", async () => { await POST(`/api/users/${rec.id}/mfa/reset`); toast("Two-step sign-in reset"); render(); }) }, "Reset two-step sign-in"));
  if (entity === "content_signoff" && !rec.signed && rec.reviewer === G.me.user.id) actions.push(h("button", { class: "btn primary", onclick: () => confirmBox("Sign this review?", "By signing you confirm that you checked the records in scope against the official sources listed. A signed sign-off cannot be changed.", "Sign", async () => { await POST(`/api/review/signoff/${rec.id}`); toast("Signed"); render(); }) }, "Sign"));
  if (entity === "training_assignment" && rec.status !== "Completed" && (rec.trainee === G.me.user.id || can("training", 3))) actions.push(h("a", { class: "btn primary", href: `#/training/${rec.id}` }, "Take assessment"));
  if (entity === "workflow_run" && can("workflow", 2)) {
    if (rec.status === "Failed") actions.push(h("button", { class: "btn primary", onclick: act(async () => { await POST(`/api/runs/${rec.id}/retry`); toast("Retry started"); setTimeout(render, 900); }) }, "Retry"));
    if (!["Completed", "Cancelled", "Rejected", "Failed"].includes(rec.status)) actions.push(h("button", { class: "btn", onclick: act(async () => { await POST(`/api/runs/${rec.id}/cancel`); render(); }) }, "Cancel run"));
  }
  if (entity === "approval" && rec.status === "Pending") actions.push(...approvalButtons(rec));
  if (entity === "notification" && !rec.read) POST("/api/notifications/read", { id: rec.id }).then(() => { G.me.unread = Math.max(0, G.me.unread - 1); });
  for (const [child, fk, label] of ADD_RELATED[entity] || []) if (can(ent(child).module, 2)) actions.push(h("button", { class: "btn", onclick: act(() => recordForm(child, null, { [fk]: rec.id }, () => render())) }, label));
  if (writable) actions.push(h("button", { class: "btn primary", onclick: act(() => recordForm(entity, rec)) }, "Edit"));
  if (can(e.module, 4) && !["workflow_run", "ai_recommendation", "approval"].includes(entity)) actions.push(h("button", { class: "btn danger", onclick: () => confirmBox(`Delete ${rec.code}?`, "This removes the record. The deletion is written to the audit trail.", "Delete", async () => { await api("DELETE", `/api/e/${entity}/${rec.id}`); toast("Deleted"); location.hash = `#/e/${entity}`; }, true) }, "Delete"));

  const body = h("div", {});
  const tabs = [["Details", () => detailsTab(entity, rec)], ["Linked records", () => relatedTab(entity, rec)], ["History", () => historyTab(entity, rec)]];
  const tabBar = h("div", { class: "tabs" }, tabs.map(([label, fn], i) => h("button", { class: i === 0 ? "on" : "", onclick: act(async (ev) => { [...tabBar.children].forEach((b) => b.classList.remove("on")); ev.currentTarget.classList.add("on"); put(body, h("p", { class: "muted" }, "Loading…")); put(body, await fn()); }) }, label)));
  put(body, await detailsTab(entity, rec));
  const status = ["status", "review_status", "severity", "residual_rating", "compliance_status", "result"].filter((n) => rec[n] && field(entity, n)).map((n) => chip(rec[n]));
  put(root, h("div", { class: "crumb" }, h("a", { href: `#/e/${entity}` }, e.plural), " / ", rec.code),
    h("div", { class: "page-head" }, h("div", { class: "grow" }, h("h1", {}, title), h("div", { class: "row", style: "margin-top:8px;gap:16px" }, status)), h("div", { class: "row" }, actions)), tabBar, body);
};

async function detailsTab(entity, rec) {
  const e = ent(entity), extra = [];
  if (entity === "workflow_run") extra.push(card("Steps", h("ul", { class: "timeline" }, (rec.log || []).map((l) => h("li", { class: l.status }, h("b", {}, l.name), ` (${l.type}) `, chip({ done: "Done", failed: "Failed", waiting: "Waiting for approval", rejected: "Rejected" }[l.status] || l.status), h("div", {}, l.message), h("div", { class: "muted small" }, fmt.dt(l.ts)))), !(rec.log || []).length ? h("li", {}, "No steps have run yet.") : null),
    rec.error ? h("p", { class: "note bad" }, rec.error) : null));
  if (entity === "ai_recommendation") return S.recommendation(rec);
  if (entity === "risk" && rec.inherent_score) extra.push(h("div", { class: "note info" }, `Inherent score ${rec.inherent_score} (likelihood ${rec.likelihood} x impact ${rec.impact}). Residual score ${rec.residual_score} after applying control effectiveness '${rec.control_effectiveness || "Not assessed"}'. Appetite threshold ${rec.appetite_threshold}.`));
  if (entity === "evidence" && rec.content_hash) {
    const out = h("span", {});
    extra.push(h("div", { class: "note info" }, `Collected automatically from ${rec.source_system} on ${fmt.dt(rec.collected_at)}. Only the item name and the tested value are kept. SHA-256 ${rec.content_hash.slice(0, 20)}… `,
      h("button", { class: "btn sm", onclick: act(async () => { const r = await GET(`/api/evidence/${rec.id}/verify`); put(out, " ", r.intact ? chip("Verified") : chip("Failed"), r.intact ? " stored data matches its recorded hash" : " stored data no longer matches its hash"); }) }, "Verify integrity"), out));
    const pl = rec.payload || {};
    extra.push(card(`What was collected (${pl.in_scope} in scope, ${pl.failing} not meeting the rule)`, simpleTable([{ label: "Item", key: "item" }, { label: "Tested value", render: (i) => String(i.value) }, { label: "Result", render: (i) => chip(i.pass ? "Pass" : "Fail") }], (pl.items || []).slice(0, 60)),
      (pl.items || []).length > 60 ? h("p", { class: "muted small" }, `Showing 60 of ${pl.items.length}. Items not meeting the rule are listed first.`) : null));
  }
  if (entity === "control_check") extra.push(h("div", { class: "note" + (rec.validation_status === "Validated" ? " info" : "") }, rec.validation_status === "Validated" ? "Validated. " : "Not yet validated: confirm the rule matches your policy, then set Validation status. ",
    `Rule: ${rec.scope_field ? `for items where ${rec.scope_field} ${rec.scope_op || "eq"} ${rec.scope_value}, ` : "for every item, "}${rec.pass_field} ${rec.pass_op} ${rec.pass_value || ""}. Collectors send data with the key `, h("b", {}, rec.check_key), "."));
  if (entity === "claim" && rec.compliance_status) extra.push(h("div", { class: "note info" }, "Compliance status is calculated by the timeline rules. Exceptions are listed under Linked records and need review by a person."));
  if (entity === "obligation" && rec.review_status !== "Approved") extra.push(h("div", { class: "note" }, "This obligation is not yet approved by the compliance team, so it does not count in dashboards or KPIs. Check it against the official text, then set Review status to Approved."));
  if (entity === "tat_rule" && rec.validation_status !== "Validated by compliance") extra.push(h("div", { class: "note" }, "This is an unvalidated starter rule. Confirm the limit and any permitted exceptions against the official text, then set Validation status."));
  const skip = entity === "workflow_run" ? ["log", "state", "context"] : entity === "evidence" ? ["payload"] : [];
  const fs = e.fields.filter((f) => !f.hidden && !skip.includes(f.name));
  return h("div", { class: "stack" }, ...extra, h("div", { class: "card" }, h("dl", { class: "dl" }, fs.map((f) => { const v = showValue(entity, f, rec); return h("div", { class: ["long", "json", "refs"].includes(f.type) && v ? "wide" : "" }, h("dt", {}, f.label), h("dd", {}, v || h("span", { class: "muted" }, "Not set"))); }),
    h("div", {}, h("dt", {}, "Created"), h("dd", {}, fmt.dt(rec.created_at))), h("div", {}, h("dt", {}, "Last updated"), h("dd", {}, fmt.dt(rec.updated_at))))));
}

async function relatedTab(entity, rec) {
  const refs = [];
  for (const [k, e] of Object.entries(G.meta.entities)) if (can(e.module, 1) && !["notification"].includes(k)) for (const f of e.fields) if (f.to === entity && (f.type === "ref" || f.type === "refs")) refs.push([k, f]);
  const sets = await Promise.all(refs.map(([k, f]) => GET(`/api/e/${k}?${f.name}=${rec.id}&size=25`).then((d) => ({ k, f, d })).catch(() => null)));
  const tasks = can("work", 1) ? await GET(`/api/e/task?related_entity=${entity}&related_id=${rec.id}&size=25`).catch(() => null) : null;
  const blocks = sets.filter((s) => s && s.d.total).map(({ k, f, d }) => relatedBlock(k, `${ent(k).plural} (${f.label.toLowerCase()})`, d, `#/e/${k}?${f.name}=${rec.id}`));
  if (tasks && tasks.total) blocks.push(relatedBlock("task", "Tasks about this record", tasks, `#/e/task?related_entity=${entity}&related_id=${rec.id}`));
  return blocks.length ? h("div", { class: "stack" }, blocks) : h("div", { class: "card" }, empty("No linked records yet", "Records that refer to this one appear here."));
}
function relatedBlock(k, title, d, href) {
  const e = ent(k), cols = e.list_fields.slice(0, 5).map((n) => field(k, n)).filter(Boolean);
  return card([title, h("a", { href }, d.total > d.rows.length ? `All ${d.total}` : "Open list")], simpleTable([{ label: "Ref", key: "code", cls: "code" }, ...cols.map((f) => ({ label: f.label, render: (r) => showValue(k, f, r), cls: f === cols[0] ? "clip" : "" }))], d.rows, (r) => (location.hash = `#/e/${k}/${r.id}`)));
}
async function historyTab(entity, rec) {
  const d = await GET(`/api/e/${entity}/${rec.id}/history`);
  const change = (a) => Object.entries((a.details || {}).changes || {}).map(([k, v]) => h("div", { class: "small" }, h("b", {}, (field(entity, k) || { label: k }).label), ": ", h("span", { class: "muted" }, JSON.stringify(v[0])), " → ", JSON.stringify(v[1])));
  return h("div", { class: "grid g2" }, card("Activity", d.activity.length ? h("ul", { class: "timeline" }, d.activity.map((a) => h("li", {}, h("b", {}, a.action), ` by ${a.user_name}`, h("div", { class: "muted small" }, fmt.dt(a.ts)), change(a)))) : h("p", { class: "muted" }, "No activity recorded.")),
    card("Previous versions", d.versions.length ? simpleTable([{ label: "Version", key: "version" }, { label: "Replaced on", render: (v) => fmt.dt(v.ts) }, { label: "Changed by", key: "changed_by_name" },
      { label: "", render: (v) => h("button", { class: "btn sm", onclick: () => modal(`Version ${v.version}`, h("pre", { class: "report small" }, JSON.stringify(v.data, null, 2)), [{ label: "Close", run: () => {} }]) }, "View") }], d.versions) : h("p", { class: "muted" }, "This record has not been changed since it was created.")));
}

/* ── approvals ── */
function approvalButtons(a) {
  const decide = (approve) => () => noteBox(approve ? "Approve" : "Reject", approve ? "Note (optional)" : "Reason for rejection", approve ? "Approve" : "Reject", async (note) => { await POST(`/api/approvals/${a.id}/decide`, { approve, note }); toast(approve ? "Approved" : "Rejected"); G.me = await GET("/api/me"); render(); }, !approve);
  return [h("button", { class: "btn primary", onclick: decide(true) }, "Approve"), h("button", { class: "btn danger", onclick: decide(false) }, "Reject")];
}
P.approvals = async (root) => {
  const d = await GET("/api/approvals/mine");
  const link = (a) => (a.related_entity && a.related_id ? h("a", { href: `#/e/${a.related_entity}/${a.related_id}` }, `Open the ${ent(a.related_entity).label.toLowerCase()}`) : "");
  put(root, pageHead("Approvals", "Requests waiting for your decision. Workflows pause here until an authorised person approves or rejects."),
    card("Waiting for you", d.pending.length ? simpleTable([{ label: "Request", render: (a) => h("div", {}, h("a", { href: `#/e/approval/${a.id}` }, a.title), h("div", { class: "muted small" }, a.description)) }, { label: "For", render: (a) => a.approver_role || "You" }, { label: "Level", key: "level" },
      { label: "Record", render: link }, { label: "", render: (a) => h("div", { class: "row" }, approvalButtons(a)) }], d.pending) : empty("Nothing is waiting for you", "")),
    h("div", { style: "margin-top:16px" }, card("Recently decided", simpleTable([{ label: "Request", render: (a) => h("a", { href: `#/e/approval/${a.id}` }, a.title) }, { label: "Decision", render: (a) => chip(a.status) }, { label: "When", render: (a) => fmt.dt(a.decided_at) }, { label: "Note", key: "decision_note" }], d.decided))));
};

/* ── compliance calendar, applicability matrix, traceability ── */
P.calendar = async (root, q) => {
  const today = new Date(G.me.today), start = q.start || new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10), end = q.end || new Date(today.getTime() + 90 * 864e5).toISOString().slice(0, 10);
  const items = (await GET(`/api/calendar?start=${start}&end=${end}`)).filter((i) => !i.done || q.all);
  const byMonth = {};
  items.forEach((i) => (byMonth[i.date.slice(0, 7)] = byMonth[i.date.slice(0, 7)] || []).push(i));
  const dateIn = (v, k) => h("input", { type: "date", value: v, style: "width:auto", onchange: (e) => (location.hash = `#/calendar?start=${k === "s" ? e.target.value : start}&end=${k === "e" ? e.target.value : end}`) });
  put(root, pageHead("Compliance calendar", "Due dates across obligations, regulatory changes, audits, CAPA, reassessments, reviews and training."),
    h("div", { class: "row", style: "margin-bottom:14px" }, "From", dateIn(start, "s"), "to", dateIn(end, "e"), h("span", { class: "muted" }, `${items.length} open item(s), ${items.filter((i) => i.overdue).length} overdue`)),
    Object.keys(byMonth).length ? Object.entries(byMonth).map(([m, list]) => h("div", { style: "margin-bottom:16px" }, card(new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      simpleTable([{ label: "Date", render: (i) => fmt.date(i.date), cls: "nowrap" }, { label: "", render: (i) => (i.overdue ? chip("Overdue") : "") }, { label: "What", key: "kind" }, { label: "Item", render: (i) => h("a", { href: `#/e/${i.entity}/${i.id}` }, `${i.code} · ${i.title}`) }], list)))) :
      h("div", { class: "card" }, empty("Nothing due in this period", "Widen the dates, or add due dates to obligations and actions.")));
};
P.matrix = async (root) => {
  const d = await GET("/api/matrix");
  put(root, pageHead("Regulatory applicability matrix", "Which obligations apply to which legal entity. Applicability is assessed separately for each entity and activity; edit an obligation to change it.", h("a", { class: "btn", href: "/api/reports/REP-001?fmt=xlsx" }, "Export register")),
    d.rows.length ? h("div", { class: "table-wrap matrix" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Obligation"), h("th", {}, "Framework"), h("th", {}, "Applicability"), d.entities.map((e) => h("th", { "data-tip": e.type }, e.name)))),
      h("tbody", {}, d.rows.map((r) => h("tr", {}, h("td", {}, h("a", { href: `#/e/obligation/${r.id}` }, `${r.code} · ${r.title}`)), h("td", { class: "small" }, (r.framework || "").split(" · ")[1] || ""), h("td", {}, chip(r.applicability)),
        d.entities.map((e) => (r.applicability === "Not applicable" ? h("td", { class: "no" }, "n/a") : r.entities.includes(e.id) ? h("td", { class: "yes" }, "Applies") : h("td", { class: "no" }, "Not set")))))))) : h("div", { class: "card" }, empty("No obligations yet", "")));
};
P.trace = async (root, id) => {
  if (id) {
    const d = await GET(`/api/trace?obligation=${id}`);
    return put(root, h("div", { class: "crumb" }, h("a", { href: "#/trace" }, "Traceability"), " / ", d.obligation.code), pageHead(d.obligation.title, "From the regulation to the corrective action. An empty stage is a gap in the chain."),
      h("div", { class: "trace" }, d.stages.map((s) => h("div", { class: "col" + (s.items.length ? "" : " none") }, h("h3", {}, s.stage, h("span", {}, s.items.length)), s.items.length ? s.items.map((i) => h("a", { class: "it", href: `#/e/${s.entity}/${i.id}` }, h("div", { class: "code" }, i.code), i.title, h("div", {}, [i.status, i.result, i.severity, i.test_status, i.residual_rating].filter(Boolean).map(chip)))) : h("p", { class: "muted small" }, "None linked")))));
  }
  const d = await GET("/api/trace"), n = (v) => h("td", { class: "num", style: v ? "" : "color:var(--critical-ink);font-weight:600" }, v);
  put(root, pageHead("Traceability", "Every obligation and how far its chain of risk, control, evidence, testing, audit and corrective action reaches. Zeros are gaps."),
    h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Obligation", "Status", "Clause", "Risks", "Controls", "Evidence", "Tests", "Audits", "Findings", "CAPA"].map((c, i) => h("th", { class: i > 2 ? "num" : "" }, c)))),
      h("tbody", {}, d.rows.map((r) => h("tr", { class: "click", onclick: () => (location.hash = `#/trace/${r.id}`) }, h("td", { class: "clip" }, `${r.code} · ${r.title}`), h("td", {}, chip(r.status)), h("td", {}, r.clause ? "Linked" : chip("Not set")), n(r.risks), n(r.controls), n(r.evidence), n(r.tests), n(r.audits),
        h("td", { class: "num" }, r.findings, r.open_findings ? h("span", { class: "muted small" }, ` (${r.open_findings} open)`) : null), h("td", { class: "num" }, r.capa)))))));
};

/* ── claims compliance overview ── */
P.claims = async (root) => {
  const d = await GET("/api/claims/overview"), w = can("claims", 2);
  put(root, pageHead("Claims compliance", "Each claim is checked against the timeline rules. A timeline that is exceeded without a documented, permitted extension becomes an exception for a person to review.",
    w ? h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/claims/reevaluate"); toast(`Rules re-run on ${r.evaluated} claims`); render(); }) }, "Re-run rules") : null,
    can("fraud", 2) ? h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/fraud/scan"); toast(`${r.new_alerts} new fraud alert(s)`); }) }, "Scan for fraud indicators") : null,
    can("ai", 2) ? h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/ai/run/claims_audit"); location.hash = `#/e/ai_recommendation/${r.id}`; }) }, "Find patterns (AI)") : null,
    w ? h("a", { class: "btn primary", href: "#/e/claim" }, "Import or add claims") : null),
    d.tat.some((t) => t.validation !== "Validated by compliance") ? h("div", { class: "note", style: "margin-bottom:16px" }, "Some timeline rules are unvalidated starter rules. ", h("a", { href: "#/e/tat_rule" }, "Review the rules"), " before relying on these figures.") : null,
    h("div", { class: "grid g3" },
      kpiTile(d.kpi),
      h("div", { class: "span2" }, card(["Claims by compliance status", h("a", { href: "#/e/claim" }, `${fmt.num(d.total)} claims`)], segBar(d.status))),
      h("div", { class: "span3" }, card(["Turnaround against each rule", h("a", { href: "#/e/tat_rule" }, "Timeline rules")], simpleTable([{ label: "Rule", key: "rule" }, { label: "Limit", render: (t) => `${t.limit} ${t.unit}`, cls: "nowrap" }, { label: "Within limit", key: "within", num: true }, { label: "Over limit", key: "over", num: true },
        { label: "Within %", render: (t) => h("span", {}, h("span", { class: "meter", style: "width:120px;display:inline-block;vertical-align:middle;margin-right:8px" }, h("i", { style: `width:${t.pct || 0}%` })), fmt.pct(t.pct)) }, { label: "Median", render: (t) => (t.median === null ? "" : `${t.median} ${t.unit}`), num: true, cls: "nowrap" }, { label: "Reference", key: "reference", cls: "small" }], d.tat))),
      card(["Open exceptions by type", h("a", { href: "#/e/claim_exception?status=Open" }, "Review")], barList(d.exceptions.by_type, (i) => `#/e/claim_exception?exception_type=${encodeURIComponent(i.label)}`)),
      card("Exception review progress", segBar(d.exceptions.by_status, { Open: "bad", "Under review": "warn", "Confirmed non-compliance": "crit", "Dismissed (justified)": "good", Corrected: "" })),
      card("By TPA", simpleTable([{ label: "TPA", render: (t) => h("a", { href: `#/e/third_party/${t.id}`, title: t.name }, (t.name.split(" · ")[1] || t.name).replace(" (sample)", "")) }, { label: "Claims", key: "claims", num: true }, { label: "With exceptions", key: "with_exceptions", num: true }, { label: "Rate", render: (t) => fmt.pct(t.rate), num: true }], d.by_tpa)),
      h("div", { class: "span3" }, card("Claims registered per week", columns(d.trend, "claims", "with_exceptions", "Claims registered", "Claims with exceptions")))));
};

/* ── reports ── */
P.reports = async (root, id) => {
  if (!id) {
    const list = await GET("/api/reports");
    return put(root, pageHead("Standard reports", "Open a report to view it, or export it to Excel, CSV or PDF. Exports are recorded in the audit trail."),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Ref"), h("th", {}, "Report"), h("th", {}, "Export"))), h("tbody", {}, list.map((r) => h("tr", {}, h("td", { class: "code" }, r.id), h("td", {}, h("a", { href: `#/reports/${r.id}` }, r.name)),
        h("td", {}, ["xlsx", "csv", "pdf"].map((f) => h("a", { class: "btn sm", style: "margin-right:6px", href: `/api/reports/${r.id}?fmt=${f}` }, f === "xlsx" ? "Excel" : f.toUpperCase())))))))));
  }
  const r = await GET(`/api/reports/${id}`);
  put(root, h("div", { class: "crumb" }, h("a", { href: "#/reports" }, "Reports"), " / ", r.id), pageHead(r.title, r.summary, ["xlsx", "csv", "pdf"].map((f) => h("a", { class: "btn", href: `/api/reports/${r.id}?fmt=${f}` }, f === "xlsx" ? "Excel" : f.toUpperCase())), h("button", { class: "btn", onclick: () => print() }, "Print"),
      h("button", { class: "btn", "data-tip": "For large reports. The file is prepared on the server while you carry on working, and you are notified when it is ready.", onclick: act(async () => { await POST(`/api/reports/${r.id}/generate`, { fmt: "xlsx" }); toast("Preparing the Excel file. You will be notified when it is ready under Reports, Report downloads."); }) }, "Prepare in background")),
    reportChart(r),
    r.rows.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, r.columns.map((c) => h("th", {}, c)))), h("tbody", {}, r.rows.map((row) => h("tr", {}, row.map((v) => h("td", { class: typeof v === "number" ? "num" : "" }, v === null || v === undefined ? "" : typeof v === "number" ? fmt.num(v) : toneOf(v) ? chip(v) : String(v)))))))) : h("div", { class: "card" }, empty("No data for this report yet", "")));
};

/* ── training assessment ── */
P.training = async (root, id) => {
  const d = await GET(`/api/training/${id}/questions`);
  const form = h("form", { class: "stack", onsubmit: act(async () => {
    const answers = {};
    d.questions.forEach((_, i) => { const c = form.querySelector(`input[name=q${i}]:checked`); if (c) answers[i] = Number(c.value); });
    const r = await POST(`/api/training/${id}/submit`, { answers });
    modal(r.passed ? "Passed" : "Not passed yet", h("p", {}, `You scored ${r.score}% (${r.correct} of ${r.total}). The pass mark is ${r.pass_mark}%.` + (r.passed ? " Your completion has been recorded." : " You can review the material and try again.")), [{ label: "Done", cls: "primary", run: () => (location.hash = `#/e/training_assignment/${id}`) }], true);
  }) }, d.questions.map((q, i) => card(`${i + 1}. ${q.q}`, q.options.map((o, j) => h("label", { class: "check", style: "margin:6px 0" }, h("input", { type: "radio", name: `q${i}`, value: j, required: true }), o)))),
    d.questions.length ? h("div", {}, h("button", { class: "btn primary" }, "Submit answers")) : h("div", { class: "card" }, empty("No questions yet", "Ask HR to add assessment questions to this programme.")));
  put(root, h("div", { class: "crumb" }, h("a", { href: "#/e/training_assignment" }, "Assignments"), " / assessment"), pageHead(d.programme.title, `${d.programme.description || ""} Pass mark ${d.programme.pass_mark || 70}%.`), form);
};

/* ── administration ── */
P.roles = async (root) => {
  const mods = Object.entries(G.meta.modules), L = ["None", "View", "Edit", "Approve", "Administer"];
  put(root, pageHead("Roles and permissions", "What each role may do in each area. Department Heads and Employees see only their own department's records. Approvals also enforce segregation of duties: nobody approves their own work."),
    h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Area"), G.meta.roles.map((r) => h("th", { style: "white-space:normal;min-width:86px;font-size:12px" }, r)))),
      h("tbody", {}, mods.map(([k, label]) => h("tr", {}, h("td", { class: "nowrap" }, label), G.meta.roles.map((r) => { const v = G.meta.permissions[r][k] || 0; return h("td", { class: "small", style: v ? "" : "color:#c0c8d1" }, L[v]); })))))));
};
P.org = async (root) => {
  const [le, de, br, bp] = await Promise.all(["legal_entity", "department", "branch", "business_process"].map((k) => GET(`/api/e/${k}?size=200&sort=id`)));
  const block = (k, d) => card([ent(k).plural, h("a", { href: `#/e/${k}` }, "Manage")], simpleTable([{ label: "Name", render: (r) => h("a", { href: `#/e/${k}/${r.id}` }, r.name) }, ...ent(k).list_fields.slice(1, 4).map((n) => ({ label: field(k, n).label, render: (r) => showValue(k, field(k, n), r) }))], d.rows));
  put(root, pageHead("Organisation", "Legal entities, departments, branches and business processes. Obligations, risks and controls are assigned against these."), h("div", { class: "grid g2" }, block("legal_entity", le), block("department", de), block("branch", br), block("business_process", bp)));
};
P.tokens = async (root) => {
  const d = await GET("/api/e/api_token?size=100");
  const create = () => { const n = h("input", { type: "text", placeholder: "For example: Claims system feed" }), s = h("input", { type: "text", placeholder: "claim, grievance, evidence (leave empty for all)" }),
    ips = h("input", { type: "text", placeholder: "For example 10.20.0.5, 10.30.0.0/24 (leave empty for any)" }), exp = h("input", { type: "date" });
    modal("New API token", h("div", { class: "stack" }, h("label", { class: "f" }, h("span", {}, "Name"), n), h("label", { class: "f" }, h("span", {}, "Registers it may write to"), s, h("span", { class: "muted small" }, "Use 'evidence' for evidence collectors.")),
      h("label", { class: "f" }, h("span", {}, "Only accept it from these network addresses"), ips), h("label", { class: "f" }, h("span", {}, "Expires on (recommended: within a year)"), exp)), [{ label: "Cancel", run: () => {} }, { label: "Create token", cls: "primary", run: async () => {
      const r = await POST("/api/tokens", { name: n.value, entities: s.value, allowed_ips: ips.value, expires_on: exp.value || null });
      modal("Copy this token now", h("div", { class: "stack" }, h("p", {}, "It is shown only once. Store it in the sending system's secret store."), h("pre", { class: "report", style: "user-select:all" }, r.token)), [{ label: "I have copied it", cls: "primary", run: () => render() }]);
    } }], true); };
  put(root, pageHead("API tokens", "Tokens let other systems send data in, for example claims from the claims system. Each token is limited to the registers you name.", h("button", { class: "btn primary", onclick: create }, "New token")),
    simpleTable([{ label: "Name", key: "name" }, { label: "Token", key: "token_hint", cls: "code" }, { label: "Registers", render: (t) => t.entities || "All" }, { label: "Allowed from", render: (t) => t.allowed_ips || "Any address" }, { label: "Expires", render: (t) => (t.expires_on ? (t.expires_on < G.me.today ? chip("Expired") : fmt.date(t.expires_on)) : "Never") },
      { label: "Last used", render: (t) => (t.last_used ? `${fmt.dt(t.last_used)}${t.last_ip ? " from " + t.last_ip : ""}` : "Never") }, { label: "Status", render: (t) => chip(t.active ? "Active" : "Disabled") },
      { label: "", render: (t) => (t.active ? h("button", { class: "btn sm danger", onclick: act(async () => { await POST(`/api/tokens/${t.id}/revoke`); render(); }) }, "Revoke") : "") }], d.rows),
    h("div", { class: "card", style: "margin-top:16px" }, h("h2", {}, "Sending data in"), h("pre", { class: "report small" }, `POST ${location.origin}/api/integrations/claim\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{"records": [{"external_id": "C-1001", "claim_number": "C-1001", "claim_type": "Cashless",\n  "preauth_request_at": "2026-11-10T10:00", "preauth_response_at": "2026-11-10T10:42", "status": "Pre-auth approved"}]}`),
      h("p", { class: "small muted", style: "margin-bottom:0" }, "Records are matched on external_id, so sending the same claim again updates it. Full API reference: ", h("a", { href: "/docs", target: "_blank", rel: "noopener" }, "/docs"))));
};
P.auditTrail = async (root, q) => {
  const page = Number(q.page || 1), d = await GET(`/api/audit-trail?page=${page}&q=${encodeURIComponent(q.q || "")}&action=${q.action || ""}`);
  const result = h("span", {});
  put(root, pageHead("Audit trail", "Every sign-in, change, approval, export and AI decision. Entries are chained with a cryptographic hash, so an altered or deleted entry is detectable.",
    h("button", { class: "btn", onclick: act(async () => { const r = await GET("/api/audit-trail/verify"); put(result, r.intact ? chip("Verified") : chip("Failed"), r.intact ? ` ${fmt.num(r.entries)} entries, chain intact` : ` chain broken at entry ${r.broken_at_id}`); }) }, "Verify integrity"), result),
    h("div", { class: "row", style: "margin-bottom:12px" }, h("input", { type: "search", placeholder: "Search summary or user", value: q.q || "", style: "max-width:280px", onkeydown: (e) => { if (e.key === "Enter") location.hash = `#/audit-trail?q=${encodeURIComponent(e.target.value)}`; } })),
    simpleTable([{ label: "When", render: (a) => fmt.dt(a.ts), cls: "nowrap" }, { label: "Who", key: "user_name" }, { label: "Action", key: "action" }, { label: "Record", render: (a) => (a.entity && a.record_id && G.meta.entities[a.entity] ? h("a", { href: `#/e/${a.entity}/${a.record_id}` }, ent(a.entity).label) : a.entity) },
      { label: "Summary", key: "summary" }, { label: "Hash", render: (a) => h("span", { class: "code", "data-tip": a.hash }, (a.hash || "").slice(0, 10)) }], d.rows),
    h("div", { class: "pager" }, `Page ${page} of ${Math.max(1, Math.ceil(d.total / 100))}`, h("button", { class: "btn sm", disabled: page <= 1, onclick: () => (location.hash = `#/audit-trail?page=${page - 1}&q=${q.q || ""}`) }, "Previous"),
      h("button", { class: "btn sm", disabled: page * 100 >= d.total, onclick: () => (location.hash = `#/audit-trail?page=${page + 1}&q=${q.q || ""}`) }, "Next")));
};
P.settings = async (root) => {
  const d = await GET("/api/settings"), s = d.settings, admin = can("admin", 4);
  const num = (k, label, help) => { const i = h("input", { type: "number", step: "any", value: s[k], disabled: !admin }); i.dataset.k = k; return h("label", { class: "f" }, h("span", {}, label), i, help ? h("span", { class: "muted small" }, help) : null); };
  const lim = ["L1", "L2", "L3"].map((l) => { const i = h("input", { type: "number", value: s.authority_limits[l], disabled: !admin }); i.dataset.lim = l; return h("label", { class: "f" }, h("span", {}, `${l} approval limit (₹)`), i); });
  const ai = h("input", { type: "checkbox", checked: s.ai_enabled, disabled: !admin });
  const mfaReq = h("input", { type: "checkbox", checked: s.require_mfa, disabled: !admin });
  const form = h("div", { class: "form-grid" }, num("grievance_resolution_days", "Grievance resolution timeline (days)", "Used to set each grievance's due date."), num("risk_appetite_default", "Default risk appetite threshold (score out of 25)"),
    ...lim, num("fraud_frequency_claims", "Fraud indicator: claims per policy"), num("fraud_frequency_days", "…within this many days"), num("fraud_billing_sigma", "Unusual billing threshold (standard deviations)"), num("repeat_grievance_days", "Repeat grievance window (days)"), num("evidence_stale_days", "Evidence considered stale after (days)"),
    h("label", { class: "check wide" }, ai, "Allow AI agents for this organisation"),
    h("label", { class: "check wide" }, mfaReq, "Require two-step sign-in (MFA) for everyone who signs in with a password. People without it are asked to set it up before they can continue."));
  const save = act(async () => { const body = { ai_enabled: ai.checked, require_mfa: mfaReq.checked, authority_limits: {} }; form.querySelectorAll("input[data-k]").forEach((i) => (body[i.dataset.k] = Number(i.value))); form.querySelectorAll("input[data-lim]").forEach((i) => (body.authority_limits[i.dataset.lim] = Number(i.value))); await PUT("/api/settings", body); toast("Settings saved"); });
  const newOrg = () => { const f = {}; const i = (k, l, t) => h("label", { class: "f" }, h("span", {}, l), (f[k] = h("input", { type: t || "text" }))); const sm = h("input", { type: "checkbox" });
    modal("New organisation", h("div", { class: "stack" }, i("name", "Organisation name"), i("admin_name", "Administrator's name"), i("admin_email", "Administrator's email", "email"), i("admin_password", "Administrator's password", "password"), h("label", { class: "check" }, sm, "Load sample data")),
      [{ label: "Cancel", run: () => {} }, { label: "Create organisation", cls: "primary", run: async () => { await POST("/api/tenants", { name: f.name.value, admin_name: f.admin_name.value, admin_email: f.admin_email.value, admin_password: f.admin_password.value, sample_data: sm.checked }); toast("Organisation created"); await boot(); } }], true); };
  put(root, pageHead("Settings", "Thresholds used by the rules, AI and email status, sample data and organisations."),
    h("div", { class: "grid g2" },
      h("div", { class: "span2" }, card("Rules and thresholds", form, admin ? h("div", { style: "margin-top:14px" }, h("button", { class: "btn primary", onclick: save }, "Save settings")) : null)),
      card("System", h("dl", { class: "dl" }, h("div", {}, h("dt", {}, "AI agents"), h("dd", {}, d.ai_mode === "rules" ? "Built-in rules mode (no data leaves this server)" : d.ai_mode)), h("div", {}, h("dt", {}, "Email notifications"), h("dd", {}, d.email_configured ? "Configured" : "Not configured (in-app notifications only)")),
        h("div", {}, h("dt", {}, "Database"), h("dd", {}, d.database)), h("div", {}, h("dt", {}, "Sessions"), h("dd", {}, `${d.session_hours} hours, ${d.idle_minutes} minutes idle timeout`)), h("div", {}, h("dt", {}, "Version"), h("dd", {}, G.me.version))),
        h("p", { class: "small muted", style: "margin-bottom:0" }, "AI model, email server and database are set in the .env file. See the README.")),
      admin ? card("Sample data", h("p", {}, d.sample_loaded ? "A fictional insurer's sample data is loaded. Remove it when you are ready to start with your own records. The starter library, workflows and anything you entered yourself stay." : "No sample data is loaded."),
        d.sample_loaded ? h("button", { class: "btn danger", onclick: () => confirmBox("Remove sample data?", "This deletes the fictional insurer's records and anything derived from them. It cannot be undone.", "Remove sample data", async () => { const r = await POST("/api/admin/sample/clear"); toast(`${r.records} sample records removed`); G.optCache = {}; render(); }, true) }, "Remove sample data")
          : h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/admin/sample/load"); toast(`${r.records} sample records loaded`); G.optCache = {}; render(); }) }, "Load sample data")) : null,
      G.me.user.role === "Super Administrator" ? card("Organisations (multi-tenant)", h("p", {}, `${G.me.tenants.length} organisation(s) on this installation. Each organisation's data is isolated from the others.`), h("button", { class: "btn", onclick: newOrg }, "Add organisation")) : null,
      can("workflow", 4) ? card("Scheduler", h("p", {}, "Scheduled and date-based workflows run every minute in the background. Run them now to see the effect immediately."), h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/scheduler/run"); toast(`${r.workflows_started} workflow run(s) started, ${r.claims_reevaluated} open claims re-checked`); }) }, "Run scheduler now")) : null));
};

/* ── automated checks and evidence collectors ── */
P.checks = async (root) => {
  const d = await GET("/api/checks"), w = can("controls", 2);
  const W = { eq: "is", ne: "is not", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most", in: "is one of", not_in: "is none of", contains: "contains", empty: "is empty", not_empty: "is filled in" };
  const nice = (f) => String(f || "").replace(/_/g, " ");
  const rule = (c) => `${c.scope_field ? `Where ${nice(c.scope_field)} ${W[c.scope_op || "eq"]} ${c.scope_value}: ` : ""}${nice(c.pass_field)} ${W[c.pass_op] || c.pass_op} ${c.pass_value || ""}`;
  put(root, pageHead("Automated checks", "Collectors read your source systems with read-only access and send the data here. A fixed rule, not AI, decides pass or fail. A failure raises one finding for a person to review.",
    h("a", { class: "btn", href: "#/e/evidence?source_system__ne=" }, "Collected evidence"), w ? h("button", { class: "btn primary", onclick: act(() => recordForm("control_check")) }, "New check") : null),
    h("div", { class: "grid g4", style: "margin-bottom:16px" }, h("div", { class: "card" }, stat(d.summary.total, "Checks")), h("div", { class: "card" }, stat(d.summary.passing, "Passing")), h("div", { class: "card" }, stat(d.summary.failing, "Failing")),
      h("div", { class: "card" }, stat(d.summary.silent, "Not reporting or no data"))),
    simpleTable([{ label: "Check", render: (c) => h("div", {}, h("a", { href: `#/e/control_check/${c.id}` }, c.name), h("div", { class: "muted small" }, rule(c))) }, { label: "Source", key: "source_system", cls: "nowrap" },
      { label: "Control", render: (c) => h("a", { href: `#/e/control/${c.control}`, title: c.control_label }, (c.control_label || "").split(" · ")[0]), cls: "nowrap" }, { label: "State", render: (c) => chip(c.state) },
      { label: "Not meeting rule", render: (c) => (c.last_run ? `${c.last_failing} of ${c.last_total}` : ""), num: true }, { label: "Last data", render: (c) => fmt.dt(c.last_run) || "Never", cls: "nowrap" },
      { label: "Next expected", render: (c) => fmt.date(c.next_expected), cls: "nowrap" }, { label: "Rule", render: (c) => chip(c.validation_status === "Validated" ? "Validated" : "Not yet validated") },
      { label: "Evidence", render: (c) => (c.auto_accept_evidence ? "Accepted automatically" : "Reviewed by a person") }], d.checks),
    h("div", { class: "grid g2", style: "margin-top:16px" },
      card("Connect a collector", h("ol", { style: "margin:0;padding-left:18px" }, h("li", {}, "Create an API token under ", h("a", { href: "#/tokens" }, "Administration, API tokens"), ". Set its registers to ", h("b", {}, "evidence"), ", restrict it to the collector's network address and give it an expiry date."),
        h("li", {}, "Give the collector read-only access to the source system. The exact permissions are listed in each template."), h("li", {}, "Import a template into n8n, or schedule the matching Python script from the ", h("b", {}, "collectors"), " folder."),
        h("li", {}, "Run it once. The check's state changes here within seconds.")),
        h("p", { style: "margin-bottom:6px" }, "n8n workflow templates:"), h("div", { class: "row" }, [["GitHub", "grc-evidence-github.json"], ["Microsoft Entra ID", "grc-evidence-entra-id.json"], ["AWS", "grc-evidence-aws.json"]].map(([l, f]) => h("a", { class: "btn sm", href: `static/n8n/${f}`, download: f }, l))),
        h("p", { style: "margin:12px 0 6px" }, "Other n8n workflows:"), h("div", { class: "row" }, [["Claims feed from a core system", "grc-feed-claims.json"], ["Findings to Slack or Teams", "grc-alerts-findings-to-chat.json"]].map(([l, f]) => h("a", { class: "btn sm", href: `static/n8n/${f}`, download: f }, l)))),
      card("How this is kept safe", h("ul", { style: "margin:0;padding-left:18px" }, h("li", {}, "Collectors only read. They hold no permission to change your source systems."), h("li", {}, "Only each item's name and the tested value are stored. The rest of the data is discarded on arrival."),
        h("li", {}, "Every data set is hashed, the hash is written to the audit trail, and it can be re-verified on the evidence record."), h("li", {}, "No data is treated as 'Not tested', never as a pass. A collector that goes quiet raises a task."),
        h("li", {}, "Evidence is accepted automatically only for checks where an authorised approver has switched that on."), h("li", {}, "Findings are never closed automatically.")))));
};

P.coverage = async (root) => {
  const d = await GET("/api/coverage"), fws = d.frameworks;
  const state = (c) => (c.checks.length ? chip(c.checks.includes("Fail") ? "Fail" : c.checks.every((x) => x === "Pass") ? "Pass" : c.checks.find((x) => x !== "Pass")) : h("span", { class: "muted" }, "None"));
  put(root, pageHead("Framework coverage", "One control can answer several frameworks. This view shows which controls are mapped to which framework references, and how many of those references are backed by a passing test and accepted evidence.",
    h("a", { class: "btn", href: "/api/e/control_mapping/export?fmt=xlsx" }, "Export mappings"), can("controls", 2) ? h("button", { class: "btn primary", onclick: act(() => recordForm("control_mapping", null, null, () => render())) }, "New mapping") : null),
    fws.some((f) => f.unvalidated) ? h("div", { class: "note", style: "margin-bottom:16px" }, "Starter mappings are suggestions in our own words. Have someone who knows each framework confirm them and set Validation status. ", h("a", { href: "#/e/control_mapping?validation_status=Unvalidated starter mapping" }, "Review mappings")) : null,
    card(["By framework", h("span", { class: "muted", "data-tip": d.rule, tabindex: 0, style: "border-bottom:1px dotted #b6bfc9;cursor:help" }, "How 'assured' is calculated")],
      simpleTable([{ label: "Framework", render: (f) => h("a", { href: `#/e/control_mapping?framework=${f.id}` }, f.name) }, { label: "References mapped", key: "references", num: true },
        { label: "Assured", render: (f) => h("span", {}, h("span", { class: "meter", style: "width:110px;display:inline-block;vertical-align:middle;margin-right:8px", "data-tip": `${f.references_assured} of ${f.references} references` }, h("i", { style: `width:${(100 * f.references_assured) / (f.references || 1)}%` })), `${f.references_assured} of ${f.references}`), cls: "nowrap" },
        { label: "Controls", key: "controls", num: true }, { label: "Tested and passing", render: (f) => `${f.controls_passing} of ${f.controls_tested} tested`, num: true }, { label: "With evidence", key: "controls_with_evidence", num: true },
        { label: "Checked automatically", key: "controls_automated", num: true }, { label: "Mappings to validate", key: "unvalidated", num: true }], fws)),
    h("div", { style: "margin-top:16px" }, card([`Controls against frameworks`, h("span", { class: "muted" }, `${d.unmapped} control(s) not mapped to any framework`)],
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Control"), h("th", {}, "Latest test"), h("th", {}, "Evidence"), h("th", {}, "Automated check"), fws.map((f) => h("th", { "data-tip": f.name }, f.code || f.name)))),
        h("tbody", {}, d.controls.map((c) => h("tr", {}, h("td", { class: "clip" }, h("a", { href: `#/e/control/${c.id}`, title: c.title }, `${c.code} · ${c.title}`)), h("td", {}, chip(c.test_status) || h("span", { class: "muted" }, "Not tested")),
          h("td", {}, c.evidence ? chip("Accepted") : h("span", { class: "muted" }, "None accepted")), h("td", {}, state(c)), fws.map((f) => h("td", {}, (c.refs[f.id] || []).map((r) => h("span", { class: "tag" }, r))))))))))));
};
