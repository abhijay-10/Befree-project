/*
 * Header search ("Search deals, accounts, contacts…"). Asks CRM directly with COQL on every search (no cache),
 * so new, changed and deleted records show at once. Respects the header country filter.
 * find() has no screen code, so the Node tests can run it.
 */
(function (root) {
  "use strict";

  const PER_GROUP = 5;      // rows shown per type
  const CANDIDATES = 25;    // rows asked from CRM per type, before the country filter
  const DEBOUNCE = 300;     // ms
  const GROUPS = [["deals", "Deals", "Deals"], ["accounts", "Accounts", "Accounts"], ["contacts", "Contacts", "Contacts"]];

  const text = function (v) { return v && typeof v === "object" ? v.name || "" : v == null ? "" : String(v); };
  const idOf = function (v) { return v && typeof v === "object" ? v.id || null : v || null; };
  // COQL string: quotes and backslashes escaped
  const quote = function (s) { return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; };
  // The typed words. % and _ are wildcards in "like", so they are not searched for.
  const words = function (q) { return String(q || "").toLowerCase().replace(/[%_]/g, " ").split(/\s+/).filter(Boolean); };

  // Every typed word must appear somewhere in the record (case-insensitive, partial)
  function matches(hay, ws) {
    const h = hay.join(" ").toLowerCase();
    return ws.every(function (w) { return h.indexOf(w) !== -1; });
  }
  // Names that start with the search come first
  function rank(list, q) {
    const s = q.toLowerCase();
    return list.slice().sort(function (a, b) {
      const x = a.name.toLowerCase().indexOf(s) === 0 ? 0 : 1, y = b.name.toLowerCase().indexOf(s) === 0 ? 0 : 1;
      return x - y;
    });
  }
  function inCountry(values, country, countryCode) {
    if (!country || country === "ALL") return true;
    let code = null;
    for (let i = 0; i < values.length && !code; i++) code = countryCode(values[i]);
    return country === "Other" ? !code : code === country;
  }

  /*
   * deps: { coql(query) -> Promise<rows>, countryCode(value) -> "US" | "UK" | "AU" | null }
   * Returns { deals, accounts, contacts }, each [{ id, entity, name, detail }] (at most 5), and failed: [types].
   * CRM finds candidates by the longest word; the full match (every word, case-insensitive) is checked here.
   */
  async function find(query, country, deps) {
    const ws = words(query);
    const out = { deals: [], accounts: [], contacts: [], failed: [] };
    if (!ws.length) return out;
    const key = ws.slice().sort(function (a, b) { return b.length - a.length; })[0];
    const like = function (field) { return field + " like " + quote("%" + key + "%"); };
    // Runs the full query; if CRM refuses a field in it, runs the name-only one
    const ask = async function (type, full, simple) {
      try { return await deps.coql(full); } catch (e) {
        if (simple && simple !== full) { try { return await deps.coql(simple); } catch (e2) { /* reported below */ } }
        out.failed.push(type);
        return [];
      }
    };
    const tail = " order by Modified_Time desc limit 0, " + CANDIDATES;

    const accountRows = await ask("Accounts",
      "select Account_Name, Billing_City, Billing_Country, Website from Accounts where (" + like("Account_Name") + " or " + like("Website") + ")" + tail,
      "select Account_Name, Billing_City, Billing_Country, Website from Accounts where " + like("Account_Name") + tail);
    // Deals and contacts of a matching company are found too
    const companyIds = accountRows.map(function (r) { return r.id; }).filter(Boolean).slice(0, 25);
    const ofCompany = companyIds.length ? " or Account_Name in (" + companyIds.map(quote).join(", ") + ")" : "";

    const results = await Promise.all([
      ask("Deals",
        "select Deal_Name, Stage, Account_Name, Account_Name.Billing_Country, Contact_Name.Mailing_Country from Deals where (" + like("Deal_Name") + ofCompany + ")" + tail,
        "select Deal_Name, Stage, Account_Name from Deals where " + like("Deal_Name") + tail),
      ask("Contacts",
        "select Full_Name, Email, Mailing_Country, Account_Name, Account_Name.Billing_Country from Contacts where (" +
          like("First_Name") + " or " + like("Last_Name") + " or " + like("Email") + ofCompany + ")" + tail,
        "select Full_Name, Email, Mailing_Country, Account_Name from Contacts where (" + like("First_Name") + " or " + like("Last_Name") + ")" + tail)
    ]);
    const dealRows = results[0], contactRows = results[1];

    const accounts = accountRows.filter(function (r) {
      return matches([text(r.Account_Name), text(r.Website)], ws) && inCountry([r.Billing_Country], country, deps.countryCode);
    }).map(function (r) {
      return { id: r.id, entity: "Accounts", name: text(r.Account_Name) || "(unnamed account)",
               detail: [text(r.Billing_City), text(r.Billing_Country)].filter(Boolean).join(", ") || text(r.Website) || "Account" };
    });
    const deals = dealRows.filter(function (r) {
      return matches([text(r.Deal_Name), text(r.Account_Name), text(r.Stage)], ws) &&
        inCountry([r["Account_Name.Billing_Country"], r["Contact_Name.Mailing_Country"]], country, deps.countryCode);
    }).map(function (r) {
      return { id: r.id, entity: "Deals", name: text(r.Deal_Name) || "(unnamed deal)", detail: [text(r.Account_Name), text(r.Stage)].filter(Boolean).join(" · ") || "Deal" };
    });
    const contacts = contactRows.filter(function (r) {
      return matches([text(r.Full_Name), text(r.Email), text(r.Account_Name)], ws) &&
        inCountry([r.Mailing_Country, r["Account_Name.Billing_Country"]], country, deps.countryCode);
    }).map(function (r) {
      return { id: r.id, entity: "Contacts", name: text(r.Full_Name) || text(r.Email) || "(unnamed contact)",
               detail: [text(r.Email), text(r.Account_Name)].filter(Boolean).join(" · ") || "Contact", accountId: idOf(r.Account_Name) };
    });
    out.accounts = rank(accounts, query.trim()).slice(0, PER_GROUP);
    out.deals = rank(deals, query.trim()).slice(0, PER_GROUP);
    out.contacts = rank(contacts, query.trim()).slice(0, PER_GROUP);
    return out;
  }

  /* ---------- Screen: dropdown, keyboard, clear button ---------- */
  function mount() {
    const box = document.querySelector(".admin-v2-head .search") || document.querySelector(".search");
    const input = document.getElementById("global-search");
    if (!box || !input || box.dataset.gs) return;
    box.dataset.gs = "1";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "gs-clear";
    clear.hidden = true;
    clear.setAttribute("aria-label", "Clear search");
    clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const kbd = box.querySelector(".v2-kbd");
    box.insertBefore(clear, kbd && kbd.parentNode === box ? kbd : null);

    const pop = document.createElement("div");
    pop.className = "gs-pop";
    pop.id = "gs-results";
    pop.hidden = true;
    pop.setAttribute("role", "listbox");
    pop.setAttribute("aria-label", "Search results");
    box.appendChild(pop);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", pop.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");

    let timer = null, seq = 0, options = [], active = -1;

    function open(show) {
      pop.hidden = !show;
      input.setAttribute("aria-expanded", String(show));
      if (!show) { options = []; active = -1; input.removeAttribute("aria-activedescendant"); }
    }
    function message(cls, msg) {
      pop.replaceChildren();
      const p = document.createElement("p");
      p.className = "gs-msg " + cls;
      p.textContent = msg;
      pop.appendChild(p);
      options = []; active = -1;
      open(true);
    }
    function highlight(i) {
      options.forEach(function (o, k) { o.el.setAttribute("aria-selected", String(k === i)); o.el.classList.toggle("is-active", k === i); });
      active = i;
      if (i >= 0) { input.setAttribute("aria-activedescendant", options[i].el.id); options[i].el.scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    }
    function go(item) {
      open(false);
      if (root.App && App.isEmbedded && root.ZOHO && ZOHO.CRM && ZOHO.CRM.UI) ZOHO.CRM.UI.Record.open({ Entity: item.entity, RecordID: item.id });
    }
    function draw(q, res) {
      pop.replaceChildren();
      options = []; active = -1;
      GROUPS.forEach(function (g) {
        const list = res[g[0]];
        if (!list.length) return;
        const section = document.createElement("div");
        section.className = "gs-group";
        section.setAttribute("role", "group");
        const head = document.createElement("p");
        head.className = "gs-head";
        head.textContent = g[1];
        section.setAttribute("aria-label", g[1]);
        section.appendChild(head);
        list.forEach(function (item) {
          const row = document.createElement("div");
          row.className = "gs-row";
          row.id = "gs-opt-" + options.length;
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", "false");
          const name = document.createElement("span");
          name.className = "gs-name";
          name.textContent = item.name;
          const detail = document.createElement("span");
          detail.className = "gs-detail";
          detail.textContent = item.detail;
          row.append(name, detail);
          const index = options.length;
          row.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keeps focus in the field
          row.addEventListener("mousemove", function () { if (active !== index) highlight(index); });
          row.addEventListener("click", function (e) { e.preventDefault(); go(item); });
          options.push({ el: row, item: item });
          section.appendChild(row);
        });
        pop.appendChild(section);
      });
      if (res.failed.length) {
        const p = document.createElement("p");
        p.className = "gs-msg is-error";
        p.textContent = res.failed.join(", ") + " could not be searched.";
        pop.appendChild(p);
      }
      if (!options.length && !res.failed.length) return message("is-empty", "No results for '" + q.trim() + "'");
      if (!options.length) return message("is-error", "Search failed. Check your connection to CRM and try again.");
      open(true);
    }

    async function run() {
      const q = input.value;
      const mine = ++seq; // a newer search makes this one outdated
      if (!q.trim()) { open(false); return; }
      message("is-loading", "Searching…");
      try {
        const res = await find(q, root.Store ? Store.state.country : "ALL", { coql: App.coql, countryCode: Data.countryCode });
        if (mine !== seq) return; // an outdated answer never replaces a newer one
        draw(q, res);
      } catch (e) {
        if (mine !== seq) return;
        message("is-error", "Search failed. " + ((e && e.message) || "Try again."));
      }
    }
    function schedule() {
      clear.hidden = !input.value;
      clearTimeout(timer);
      if (!input.value.trim()) { seq++; open(false); return; }
      timer = setTimeout(run, DEBOUNCE);
    }

    input.addEventListener("input", schedule);
    input.addEventListener("focus", function () { if (input.value.trim() && pop.hidden) run(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (pop.hidden && input.value.trim()) { run(); return; }
        if (!options.length) return;
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        highlight(active < 0 ? (step > 0 ? 0 : options.length - 1) : (active + step + options.length) % options.length);
      } else if (e.key === "Enter") {
        if (active >= 0 && options[active]) { e.preventDefault(); go(options[active].item); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearTimeout(timer);
        seq++;
        open(false);
        input.blur();
      }
    });
    clear.addEventListener("click", function (e) {
      e.preventDefault();
      clearTimeout(timer);
      seq++;
      input.value = "";
      clear.hidden = true;
      open(false);
      input.focus();
    });
    // Clicking anywhere else closes the list
    document.addEventListener("mousedown", function (e) { if (!box.contains(e.target)) open(false); });
    // A new country filter: search again with it
    root.addEventListener("filters:changed", function () { if (!pop.hidden && input.value.trim()) run(); });
  }

  const api = { find: find, mount: mount, PER_GROUP: PER_GROUP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.GlobalSearch = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(this);
