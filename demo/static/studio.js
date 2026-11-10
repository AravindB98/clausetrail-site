/* Automation studio (visual workflow builder) and the AI assistant. */
"use strict";
const S = {};
const OPS = [["eq", "is"], ["ne", "is not"], ["in", "is one of"], ["not_in", "is none of"], ["contains", "contains"], ["gt", "greater than"], ["lt", "less than"], ["empty", "is empty"], ["not_empty", "is filled in"], ["overdue_by", "overdue by (days)"], ["due_within", "due within (days)"]];
const TRIGGERS = ["Record created", "Record updated", "Status changed", "Date approaching or overdue", "Schedule", "Incoming webhook", "Manual"];
const stepLabel = (t) => (G.meta.steps.find((s) => s.type === t) || { label: t }).label;

function triggerSummary(w) {
  const base = triggerBase(w), n = ((w.trigger || {}).conditions || []).length;
  return n ? `${base}, if ${n} condition${n > 1 ? "s" : ""} hold${n > 1 ? "" : "s"}` : base;
}
function triggerBase(w) {
  const t = w.trigger || {}, e = t.entity && G.meta.entities[t.entity] ? ent(t.entity).label.toLowerCase() : "record";
  switch (w.trigger_type) {
    case "Record created": return `When a ${e} is created`;
    case "Record updated": return `When a ${e} is updated`;
    case "Status changed": return `When a ${e}'s ${(t.field || "status").replace(/_/g, " ")} becomes ${t.to || "anything"}`;
    case "Date approaching or overdue": return `${Math.abs(t.days || 0)} day(s) ${Number(t.days) < 0 ? "before" : "after"} a ${e}'s ${(t.date_field || "date").replace(/_/g, " ")}`;
    case "Schedule": return `Every ${{ hourly: "hour", daily: "day", weekly: "week", monthly: "month" }[t.every || "daily"]}`;
    case "Incoming webhook": return "When another system calls its web address";
    default: return "Run manually";
  }
}
function stepSummary(s) {
  const c = s.config || {};
  if (s.type === "condition") return `${(c.field || "field").replace(/_/g, " ")} ${(OPS.find((o) => o[0] === (c.op || "eq")) || [])[1]} ${c.value || ""}`;
  if (s.type === "approval") return (c.approver_roles || []).join(" then ") || "Choose approvers";
  if (s.type === "create_record") return c.entity ? `New ${ent(c.entity).label.toLowerCase()}` : "Choose what to create";
  if (s.type === "update_record") return `${c.field || "field"} = ${c.value || ""}`;
  if (s.type === "webhook") return c.url || "Enter a web address";
  if (s.type === "ai_agent") return (G.meta.agents.find((a) => a.key === c.agent) || { name: "Choose an agent" }).name;
  return (c.to || "").replace("role:", "").replace("field:", "record's ") || "Choose who";
}

/* ── list ── */
S.workflows = async (root) => {
  const d = await GET("/api/e/workflow?size=200&sort=id"), w = can("workflow", 2);
  const cats = {};
  d.rows.forEach((r) => (cats[r.category || "Other"] = cats[r.category || "Other"] || []).push(r));
  put(root, pageHead("Automation", "Workflows react to events, dates and schedules: they assign tasks, ask for approvals, escalate, create findings and call other systems such as n8n or Zapier.",
    h("a", { class: "btn", href: "#/e/workflow_run" }, "Run history"), w ? h("a", { class: "btn primary", href: "#/workflows/new" }, "New workflow") : null),
    Object.entries(cats).map(([cat, rows]) => h("div", { style: "margin-bottom:18px" }, h("h3", { style: "margin-bottom:8px" }, cat), h("div", { class: "grid g2" }, rows.map((r) => h("div", { class: "card wf-card" },
      h("div", {}, h("a", { href: `#/workflows/${r.id}` }, h("b", {}, r.name)), h("p", {}, triggerSummary(r)), h("p", {}, (r.steps || []).map((s) => stepLabel(s.type)).join(" → ") || "No steps yet"),
        h("p", { class: "muted" }, r.last_run_at ? `Last run ${fmt.dt(r.last_run_at)}` : "Has not run yet")),
      h("div", {}, h("button", { class: "switch" + (r.active ? " on" : ""), role: "switch", "aria-checked": r.active ? "true" : "false", "aria-label": `${r.name} active`, disabled: !w, "data-tip": r.active ? "Active. Select to pause." : "Paused. Select to activate.",
        onclick: act(async () => { await PUT(`/api/e/workflow/${r.id}`, { active: !r.active }); render(); }) }))))))));
};

/* ── editor ── */
S.editor = async (root, id) => {
  const wf = id === "new" ? { name: "New workflow", description: "", category: "Custom", active: false, trigger_type: "Record created", trigger: { entity: "finding" }, steps: [] } : await GET(`/api/e/workflow/${id}`);
  wf.trigger = wf.trigger || {}; wf.steps = wf.steps || [];
  const w = can("workflow", 2);
  let sel = { trigger: true }, dirty = false;
  const canvas = h("div", { class: "canvas" }), props = h("div", { class: "card props" }), saveBtn = h("button", { class: "btn primary", disabled: !w }, "Save workflow");
  const touch = () => { dirty = true; saveBtn.textContent = "Save workflow *"; drawCanvas(); };
  const tEnt = () => (wf.trigger.entity && G.meta.entities[wf.trigger.entity] ? ent(wf.trigger.entity) : null);

  const bind = (obj, key, el, cast) => { el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", () => { obj[key] = el.type === "checkbox" ? el.checked : cast ? cast(el.value) : el.value; touch(); if (el.dataset.redraw) drawProps(); }); return el; };
  const fld = (label, el, help) => h("label", { class: "f" }, h("span", {}, label), el, help ? h("span", { class: "muted small" }, help) : null);
  const text = (obj, key, ph) => { const i = h("input", { type: "text", placeholder: ph || "" }); i.value = obj[key] === undefined || obj[key] === null ? "" : obj[key]; return bind(obj, key, i); };
  const area = (obj, key, ph) => { const i = h("textarea", { placeholder: ph || "", style: "min-height:60px" }); i.value = obj[key] || ""; return bind(obj, key, i); };
  const pick = (obj, key, opts, redraw, blank) => { const s = h("select", {}, blank ? h("option", { value: "" }, blank) : null, opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h("option", { value: v, selected: String(obj[key] === undefined ? "" : obj[key]) === String(v) }, l); })); if (redraw) s.dataset.redraw = "1"; if (!blank && (obj[key] === undefined || obj[key] === null) && opts.length) obj[key] = Array.isArray(opts[0]) ? opts[0][0] : opts[0]; return bind(obj, key, s); };
  const fieldOpts = (types) => (tEnt() ? tEnt().fields.filter((f) => !f.hidden && (!types || types.includes(f.type))).map((f) => [f.name, f.label]) : []);
  const valueInput = (obj, key, fname) => { const f = tEnt() && tEnt().fields.find((x) => x.name === fname); const i = text(obj, key, f && f.type === "enum" ? "Choose or type, comma separated" : "Value"); if (f && f.type === "enum") { const dl = h("datalist", { id: "dl" + Math.random().toString(36).slice(2) }, f.options.map((o) => h("option", { value: o }))); i.setAttribute("list", dl.id); return h("span", {}, i, dl); } return i; };
  const condRow = (c, onRemove) => h("div", { class: "cond-row" }, pick(c, "field", fieldOpts(), true, "Field"), pick(c, "op", OPS), ["empty", "not_empty"].includes(c.op) ? h("span", {}) : valueInput(c, "value", c.field), onRemove ? h("button", { class: "btn sm", onclick: onRemove, "aria-label": "Remove condition" }, "×") : h("span", {}));
  const recipient = (cfg) => { const users = fieldOpts(["ref"]).filter(([n]) => tEnt().fields.find((f) => f.name === n).to === "user");
    const s = h("select", { "data-redraw": "1" }, h("optgroup", { label: "A role" }, G.meta.roles.map((r) => h("option", { value: "role:" + r, selected: cfg.to === "role:" + r }, r))), users.length ? h("optgroup", { label: "A person named on the record" }, users.map(([n, l]) => h("option", { value: "field:" + n, selected: cfg.to === "field:" + n }, `The record's ${l.toLowerCase()}`))) : null);
    if (!cfg.to) cfg.to = s.value; bind(cfg, "to", s);
    return [fld("Send to", s), (cfg.to || "").startsWith("field:") ? fld("If that person is not set, send to", pick(cfg, "fallback_role", G.meta.roles)) : null]; };

  function drawProps() {
    const out = [];
    if (sel.trigger) {
      const t = wf.trigger;
      out.push(h("h2", {}, "Trigger"), fld("Start this workflow", pick(wf, "trigger_type", TRIGGERS, true)));
      if (["Record created", "Record updated", "Status changed", "Date approaching or overdue"].includes(wf.trigger_type)) {
        out.push(fld("Register", pick(t, "entity", Object.entries(G.meta.entities).filter(([k]) => !["workflow_run", "notification", "workflow", "api_token"].includes(k)).map(([k, e]) => [k, e.plural]).sort((a, b) => a[1].localeCompare(b[1])), true)));
        if (wf.trigger_type === "Status changed") { if (!t.field) t.field = fieldOpts(["enum"]).some(([n]) => n === "status") ? "status" : (fieldOpts(["enum"])[0] || [""])[0]; const f = tEnt() && tEnt().fields.find((x) => x.name === t.field);
          out.push(fld("Field", pick(t, "field", fieldOpts(["enum"]), true)), fld("Becomes", pick(t, "to", f ? f.options : [], false, "Any value"))); }
        if (wf.trigger_type === "Record updated") out.push(fld("Only when this field changes", pick(t, "field", fieldOpts(), false, "Any field")));
        if (wf.trigger_type === "Date approaching or overdue") out.push(fld("Date field", pick(t, "date_field", fieldOpts(["date", "datetime"]))), fld("Days relative to that date", (() => { const i = h("input", { type: "number" }); i.value = t.days === undefined ? 1 : t.days; if (t.days === undefined) t.days = 1; return bind(t, "days", i, Number); })(), "Negative runs before the date (-14 is two weeks before). Positive runs after it (1 is one day overdue). Runs once per record and date."));
        t.conditions = t.conditions || [];
        out.push(h("div", {}, h("span", { class: "lbl" }, "Only if all of these are true"), t.conditions.map((c, i) => condRow(c, () => { t.conditions.splice(i, 1); touch(); drawProps(); })),
          h("button", { class: "btn sm", onclick: () => { t.conditions.push({ field: (fieldOpts()[0] || [""])[0], op: "eq", value: "" }); touch(); drawProps(); } }, "Add condition")));
      } else if (wf.trigger_type === "Schedule") out.push(fld("How often", pick(t, "every", [["hourly", "Every hour"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"]])));
      else if (wf.trigger_type === "Incoming webhook") out.push(wf.webhook_key ? fld("Web address to call (POST, JSON body)", h("pre", { class: "report small", style: "user-select:all;overflow-wrap:anywhere" }, `${location.origin}/api/hooks/${wf.webhook_key}`), "Treat this address as a secret. Use {{payload.field}} in step text to insert values from the JSON body.") : h("p", { class: "note" }, "Save the workflow to get its web address."));
      else out.push(h("p", { class: "muted" }, "Use 'Run now' to start this workflow by hand."));
    } else {
      const s = sel.step, c = (s.config = s.config || {});
      out.push(h("h2", {}, stepLabel(s.type)), fld("Step name", text(s, "name")));
      const tpl = "Insert record values with {{record.field_name}}, {{code}} or {{label}}.";
      if (s.type === "condition") { if (!c.op) c.op = "eq"; out.push(h("div", {}, h("span", { class: "lbl" }, "Take the Yes branch when"), condRow(c))); }
      if (s.type === "task") out.push(...recipient(c), fld("Task title", text(c, "title"), tpl), fld("Description", area(c, "description")), fld("Due in (days)", bind(c, "due_in_days", Object.assign(h("input", { type: "number" }), { value: c.due_in_days || 7 }), Number)), fld("Priority", pick(c, "priority", ["Normal", "Low", "High", "Urgent"])));
      if (s.type === "notify" || s.type === "escalate") out.push(...recipient(c), fld("Title", text(c, "title"), tpl), fld("Message", area(c, "message")), s.type === "notify" ? fld("Severity", pick(c, "severity", ["Info", "Warning", "Critical"])) : null,
        s.type === "notify" ? h("label", { class: "check" }, bind(c, "email", h("input", { type: "checkbox", checked: !!c.email })), "Also send by email (when an email server is configured)") : h("p", { class: "muted small" }, "Escalation sends a critical notice, an email when configured, and creates an urgent task."));
      if (s.type === "approval") { c.approver_roles = c.approver_roles || ["Chief Compliance Officer"];
        out.push(fld("Request title", text(c, "title"), tpl), h("div", {}, h("span", { class: "lbl" }, "Approvers, in order"), c.approver_roles.map((r, i) => h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { class: "muted small" }, `Level ${i + 1}`), h("span", { class: "grow" }, bind(c.approver_roles, i, h("select", {}, G.meta.roles.map((x) => h("option", { selected: x === r }, x))))),
          c.approver_roles.length > 1 ? h("button", { class: "btn sm", onclick: () => { c.approver_roles.splice(i, 1); touch(); drawProps(); } }, "×") : null)), h("button", { class: "btn sm", onclick: () => { c.approver_roles.push("Chief Risk Officer"); touch(); drawProps(); } }, "Add approval level")),
          h("p", { class: "muted small" }, "The workflow pauses until each level approves. A rejection stops the run.")); }
      if (s.type === "create_record") { c.values = c.values || {}; const ce = c.entity && ent(c.entity);
        out.push(fld("Create a", pick(c, "entity", Object.entries(G.meta.entities).filter(([k]) => !G.meta.locked.includes(k) && !["user", "workflow"].includes(k)).map(([k, e]) => [k, e.label]).sort((a, b) => a[1].localeCompare(b[1])), true, "Choose…")),
          ce ? h("div", {}, h("span", { class: "lbl" }, "With these values"), Object.keys(c.values).map((k) => h("div", { class: "kv" }, h("span", { class: "small", style: "align-self:center" }, (ce.fields.find((f) => f.name === k) || { label: k }).label), text(c.values, k), h("button", { class: "btn sm", onclick: () => { delete c.values[k]; touch(); drawProps(); } }, "×"))),
            h("select", { onchange: (e) => { if (e.target.value) { c.values[e.target.value] = ""; touch(); drawProps(); } } }, h("option", { value: "" }, "Add a field…"), ce.fields.filter((f) => !f.readonly && !f.hidden && !(f.name in c.values) && !["json", "file", "refs"].includes(f.type)).map((f) => h("option", { value: f.name }, f.label))), h("p", { class: "muted small" }, tpl)) : null); }
      if (s.type === "update_record") out.push(fld("Field to set", pick(c, "field", fieldOpts().filter(([n]) => !tEnt().fields.find((f) => f.name === n).readonly), true, "Choose…")), fld("New value", valueInput(c, "value", c.field)), h("p", { class: "muted small" }, "Decisions reserved for people, such as closing a finding or marking an obligation as met, cannot be set by a workflow."));
      if (s.type === "webhook") out.push(fld("Web address", text(c, "url", "https://…"), "For example an n8n Webhook node or a Zapier 'Catch Hook' address. The record is sent as JSON without personal data fields. Retried three times on failure."), fld("Method", pick(c, "method", ["POST", "PUT"])));
      if (s.type === "ai_agent") out.push(fld("Agent", pick(c, "agent", G.meta.agents.filter((a) => a.on && (!tEnt() || a.on === wf.trigger.entity || a.also_on.includes(wf.trigger.entity))).map((a) => [a.key, a.name]), false, "Choose…")), h("p", { class: "muted small" }, "The agent's output is saved as a recommendation for a person to review. It changes nothing by itself."));
      out.push(h("button", { class: "btn danger sm", onclick: () => { removeStep(wf.steps, s); sel = { trigger: true }; touch(); drawProps(); } }, "Remove this step"));
    }
    put(props, h("div", { class: "stack" }, out));
  }
  function removeStep(list, s) { const i = list.indexOf(s); if (i >= 0) return list.splice(i, 1); list.forEach((x) => { if (x.type === "condition") { removeStep(x.then || [], s); removeStep(x.else || [], s); } }); }
  function addStep(list, at) {
    const close = modal("Add a step", h("div", { class: "picker" }, G.meta.steps.map((st) => h("button", { onclick: () => {
      const s = { id: "s" + Date.now().toString(36) + Math.floor(Math.random() * 99), type: st.type, name: st.label, config: {} };
      if (st.type === "condition") { s.then = []; s.else = []; }
      list.splice(at, 0, s); sel = { step: s }; close.close(); touch(); drawProps();
    } }, h("b", {}, st.label), h("span", {}, st.help)))), []);
  }
  const addBtn = (list, at) => (w ? h("button", { class: "add", "aria-label": "Add a step here", "data-tip": "Add a step here", onclick: () => addStep(list, at) }, "+") : null);
  function flow(list) {
    const row = h("div", { class: "flow" });
    list.forEach((s, i) => {
      row.append(h("span", { class: "wire long" }), addBtn(list, i) || "", h("span", { class: "wire long" }),
        h("button", { class: "node" + (s.type === "condition" ? " cond" : "") + (sel.step === s ? " sel" : ""), onclick: () => { sel = { step: s }; drawCanvas(); drawProps(); } }, h("small", {}, stepLabel(s.type)), h("b", {}, s.name || stepLabel(s.type)), h("p", {}, stepSummary(s))));
      if (s.type === "condition") { s.then = s.then || []; s.else = s.else || [];
        row.append(h("span", { class: "wire long" }), h("div", { class: "branches" }, h("div", { class: "branch-row" }, h("em", {}, "Yes"), flow(s.then)), h("div", { class: "branch-row" }, h("em", {}, "No"), flow(s.else)))); }
    });
    row.append(h("span", { class: "wire long" }), addBtn(list, list.length) || "");
    return row;
  }
  function drawCanvas() {
    const row = h("div", { class: "flow" }, h("button", { class: "node trigger" + (sel.trigger ? " sel" : ""), onclick: () => { sel = { trigger: true }; drawCanvas(); drawProps(); } }, h("small", {}, "Trigger"), h("b", {}, wf.trigger_type), h("p", {}, triggerSummary(wf))), flow(wf.steps));
    put(canvas, row, wf.steps.length ? "" : h("p", { class: "muted", style: "margin:18px 0 0" }, "Select + to add the first step."));
  }
  const save = act(async () => {
    const body = { name: wf.name, description: wf.description, category: wf.category, active: wf.active, trigger_type: wf.trigger_type, trigger: wf.trigger, steps: wf.steps };
    const r = wf.id ? await PUT(`/api/e/workflow/${wf.id}`, body) : await POST("/api/e/workflow", body);
    toast("Workflow saved"); dirty = false;
    if (!wf.id) location.hash = `#/workflows/${r.id}`; else render();
  });
  saveBtn.addEventListener("click", save);
  const runNow = act(async () => {
    if (dirty) return toast("Save the workflow first.", true);
    const start = async (rid) => { const r = await POST(`/api/workflows/${wf.id}/run`, rid ? { entity: wf.trigger.entity, id: rid } : {}); toast("Run started"); setTimeout(() => (location.hash = `#/e/workflow_run/${r.run}`), 700); };
    if (!tEnt() || ["Schedule", "Manual", "Incoming webhook"].includes(wf.trigger_type)) return start();
    const opts = await options(wf.trigger.entity), s = h("select", {}, opts.map((o) => h("option", { value: o.id }, o.label)));
    modal("Run now", fld(`Run against which ${tEnt().label.toLowerCase()}?`, s), [{ label: "Cancel", run: () => {} }, { label: "Run", cls: "primary", run: () => start(Number(s.value)) }], true);
  });
  const nameIn = h("input", { type: "text", style: "font:600 22px var(--serif);border-color:transparent;padding:2px 6px;max-width:520px", "aria-label": "Workflow name" }); nameIn.value = wf.name; bind(wf, "name", nameIn);
  const activeSw = h("button", { class: "switch" + (wf.active ? " on" : ""), role: "switch", "aria-checked": String(!!wf.active), "aria-label": "Active", disabled: !w, onclick: () => { wf.active = !wf.active; activeSw.classList.toggle("on", wf.active); touch(); } });
  const runs = wf.id ? await GET(`/api/e/workflow_run?workflow=${wf.id}&size=6`) : { rows: [], total: 0 };
  drawCanvas(); drawProps();
  put(root, h("div", { class: "crumb" }, h("a", { href: "#/workflows" }, "Automation"), " / ", wf.code || "new"),
    h("div", { class: "page-head" }, h("div", { class: "grow" }, nameIn), h("span", { class: "row" }, h("span", { class: "muted small" }, "Active"), activeSw), wf.id && w ? h("button", { class: "btn", onclick: runNow }, "Run now") : null, saveBtn),
    h("div", { class: "studio" }, h("div", { class: "stack" }, canvas, h("div", { class: "grid g2" }, card("About", fld("Description", area(wf, "description", "What this workflow is for")), h("div", { style: "margin-top:10px" }, fld("Group", text(wf, "category")))),
      card(["Recent runs", wf.id ? h("a", { href: `#/e/workflow_run?workflow=${wf.id}` }, `All ${runs.total}`) : ""], runs.rows.length ? runs.rows.map((r) => h("div", { style: "margin-bottom:6px" }, h("a", { href: `#/e/workflow_run/${r.id}` }, r.trigger_info || r.code), " ", chip(r.status), h("span", { class: "muted small" }, "  " + fmt.dt(r.started_at)))) : h("p", { class: "muted small" }, "No runs yet.")))), props));
};

/* ── AI assistant ── */
S.ai = async (root, q) => {
  const rules = G.me.ai_mode === "rules", w = can("ai", 2);
  const answer = h("div", {}), qIn = h("input", { type: "search", placeholder: "For example: what is the timeline for deciding a cashless authorisation request?" });
  const ask = act(async () => {
    if (!qIn.value.trim()) return;
    put(answer, h("p", { class: "muted" }, "Searching your library…"));
    const r = await POST("/api/ai/search", { question: qIn.value });
    put(answer, h("div", { class: "card", style: "margin-top:12px" }, h("p", { style: "white-space:pre-wrap;margin-top:0" }, r.answer), r.sources.length ? h("div", {}, h("h3", { style: "margin-bottom:6px" }, "Sources"), r.sources.map((s) => h("div", { class: "small", style: "margin-bottom:6px" }, h("b", {}, `[${s.ref}] `), s.id ? h("a", { href: `#/e/${s.entity}/${s.id}` }, s.label) : s.label, h("div", { class: "muted" }, s.excerpt)))) : null,
      h("p", { class: "muted small", style: "margin-bottom:0" }, `Answered in ${r.mode === "rules" ? "rules mode (keyword match on your own library)" : r.mode}. Check the source before relying on it.`)));
  });
  const launcher = async (a) => {
    if (a.key === "regulatory_intelligence") {
      const regs = await options("regulation"), reg = h("select", {}, h("option", { value: "" }, "Not linked to a regulation"), regs.map((o) => h("option", { value: o.id, selected: String(o.id) === q.regulation }, o.label)));
      const ta = h("textarea", { placeholder: "Or paste the text of the circular here", style: "min-height:70px" }); let fileId = null;
      const file = h("input", { type: "file", accept: ".pdf,.docx,.txt", onchange: act(async () => { const fd = new FormData(); fd.append("file", file.files[0]); fileId = (await api("POST", "/api/files", fd)).id; toast("Document uploaded"); }) });
      return [h("label", { class: "f" }, h("span", {}, "Regulation"), reg), h("label", { class: "f" }, h("span", {}, "Document (PDF, Word or text)"), file), ta,
        h("button", { class: "btn primary", disabled: !w, onclick: act(async () => { const r = await POST(`/api/ai/run/${a.key}`, { regulation: reg.value || null, file: fileId, text: ta.value }); location.hash = `#/e/ai_recommendation/${r.id}`; }) }, "Extract obligations")];
    }
    if (!a.on) return [h("button", { class: "btn primary", disabled: !w, onclick: act(async () => { const r = await POST(`/api/ai/run/${a.key}`); location.hash = `#/e/ai_recommendation/${r.id}`; }) }, "Run")];
    const kinds = [a.on, ...a.also_on], kind = h("select", { style: kinds.length > 1 ? "" : "display:none" }, kinds.map((k) => h("option", { value: k }, ent(k).label))), rec = h("select", {});
    const fill = async () => put(rec, ...(await options(kind.value)).map((o) => h("option", { value: o.id }, o.label)));
    kind.addEventListener("change", fill); await fill();
    return [kind, rec, h("button", { class: "btn primary", disabled: !w, onclick: act(async () => { if (!rec.value) return toast("Nothing to run on yet.", true); const r = await POST(`/api/ai/run/${a.key}`, { id: Number(rec.value), entity: kind.value }); location.hash = `#/e/ai_recommendation/${r.id}`; }) }, "Run")];
  };
  const cards = [];
  for (const a of G.meta.agents) if (can(a.module, 1)) cards.push(h("div", { class: "card agent" }, h("span", { class: "id" }, a.id), h("h2", {}, a.name), h("p", { class: "small", style: "margin:0;color:var(--text-2)" }, a.does), ...(await launcher(a))));
  const pending = await GET("/api/e/ai_recommendation?status=Pending review&size=1");
  put(root, pageHead("AI assistant", "Agents draft and suggest. A person reviews every recommendation before anything changes, and each one lists the records it is based on.", h("a", { class: "btn", href: "#/e/ai_recommendation?status=Pending review" }, `Recommendations to review (${pending.total})`)),
    rules ? h("div", { class: "note info", style: "margin-bottom:16px" }, "Running in rules mode: agents use built-in analysis of your own records and nothing is sent outside this server. To add language-model drafting, set AI_PROVIDER and AI_API_KEY in the .env file (an on-premises model works too). See the README.") : null,
    card("Regulatory search", h("div", { class: "row" }, h("span", { class: "grow" }, qIn), h("button", { class: "btn primary", onclick: ask }, "Search")), answer),
    h("h2", { style: "margin:22px 0 10px" }, "Agents"), h("div", { class: "grid g3" }, cards));
  qIn.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(e); });
};

S.recommendation = (rec) => {
  const out = rec.output || {}, refs = Object.fromEntries((rec.references || []).map((r) => [r.ref, r]));
  const refChip = (r) => { const x = refs[r]; return x ? (x.id && G.meta.entities[x.entity] ? h("a", { class: "tag link", href: `#/e/${x.entity}/${x.id}`, "data-tip": `${x.label}\n${x.excerpt}` }, r) : h("span", { class: "tag", "data-tip": `${x.label}\n${x.excerpt}` }, r)) : h("span", { class: "tag" }, r); };
  const item = (it) => h("div", { class: "card", style: "padding:12px 14px" }, Object.entries(it).filter(([k]) => !["refs", "unsupported", "control_id"].includes(k)).map(([k, v]) => h("div", { style: "margin-bottom:4px" }, h("span", { class: "muted small" }, (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ") + ": "),
    k === "result" ? chip({ pass: "Pass", warn: "Pass with exceptions", fail: "Fail" }[v] || v) : k === "severity" ? chip(v) : ["report", "analysis"].includes(k) ? h("pre", { class: "report" }, v) : String(v === null ? "" : v))),
    h("div", {}, h("span", { class: "muted small" }, "Based on: "), (it.refs || []).length ? it.refs.map(refChip) : chip("No supporting reference")));
  const describe = (a) => { const e = ent(a.entity), v = a.values || {};
    if (a.op === "create") return `Create ${e.label.toLowerCase()}: ${v.title || v.name || ""}` + (v.status || v.review_status ? ` (as ${v.review_status || v.status})` : "");
    if (a.op === "link") return `Link ${a.ids.length} ${field(a.entity, a.field).label.toLowerCase()} to this ${e.label.toLowerCase()}`;
    return `Update ${e.label.toLowerCase()}: ` + Object.entries(v).map(([k, x]) => `${(field(a.entity, k) || { label: k }).label} = ${String(x).length > 60 ? String(x).slice(0, 60) + "…" : x}`).join("; "); };
  const decide = (accept) => () => noteBox(accept ? "Accept recommendation" : "Reject recommendation", accept ? "Note (optional)" : "Why is it rejected? This helps monitor AI quality.", accept ? "Accept and apply" : "Reject", async (note) => {
    const r = await POST(`/api/ai/recommendations/${rec.id}/decide`, { accept, note });
    toast(accept ? (r.applied.length ? `Applied: ${r.applied.length} change(s)` : "Accepted") : "Rejected"); render(); }, !accept);
  const acts = rec.proposed_actions || [];
  return h("div", { class: "stack" },
    h("div", { class: "card" }, h("div", { class: "row", style: "margin-bottom:8px" }, h("b", {}, rec.agent), h("span", { class: "tag" }, rec.mode === "rules" ? "Rules mode" : rec.mode), chip(rec.status), h("span", { class: "grow" }),
      rec.target_entity && rec.target_id && G.meta.entities[rec.target_entity] ? h("a", { href: `#/e/${rec.target_entity}/${rec.target_id}` }, `Open the ${ent(rec.target_entity).label.toLowerCase()}`) : null), h("p", { style: "margin:0" }, rec.summary),
      (rec.warnings || []).map((w) => h("p", { class: "note", style: "margin:10px 0 0" }, w)),
      rec.status !== "Pending review" ? h("p", { class: "muted small", style: "margin:10px 0 0" }, `${rec.status} by ${(rec._labels || {}).decided_by || "a reviewer"} on ${fmt.dt(rec.decided_at)}. ${rec.decision_note || ""}`) : null),
    (out.items || []).length ? h("div", {}, h("h2", { style: "margin-bottom:10px" }, `What the agent found (${out.items.length})`), h("div", { class: "grid g2" }, out.items.map(item))) : null,
    out.new_control ? card("Suggested new control (draft)", h("p", { style: "margin:0" }, h("b", {}, out.new_control.title), h("br"), out.new_control.description)) : null,
    card("If you accept, this will happen", acts.length ? h("ul", { style: "margin:0;padding-left:18px" }, acts.slice(0, 40).map((a) => h("li", {}, describe(a))), acts.length > 40 ? h("li", {}, `…and ${acts.length - 40} more`) : null) : h("p", { class: "muted", style: "margin:0" }, "Nothing changes. The recommendation is recorded as reviewed."),
      h("p", { class: "muted small" }, "New records are created as drafts or pending review. Nothing here can mark an obligation as met, close a finding or decide a case."),
      rec.status === "Pending review" && can("ai", 2) ? h("div", { class: "row" }, h("button", { class: "btn primary", onclick: decide(true) }, "Accept and apply"), h("button", { class: "btn danger", onclick: decide(false) }, "Reject")) : null),
    (rec.references || []).length ? card("References", rec.references.map((r) => h("div", { class: "small", style: "margin-bottom:8px" }, h("b", {}, `[${r.ref}] `), r.id && G.meta.entities[r.entity] ? h("a", { href: `#/e/${r.entity}/${r.id}` }, r.label) : r.label, h("div", { class: "muted" }, r.excerpt)))) : null);
};
