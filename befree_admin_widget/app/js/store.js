/* The one shared filter state. Change it only through setCountry() / setRange(). */
window.Store = (function () {
  "use strict";

  const COUNTRIES = { ALL: "All countries", US: "United States", UK: "United Kingdom", AU: "Australia", Other: "Country not set" };
  const RANGES = ["7d", "30d", "90d", "12m", "all"];

  // range "custom" uses from / to ("YYYY-MM-DD", both days included)
  const state = { country: "ALL", range: "30d", from: null, to: null };

  function emit() {
    window.dispatchEvent(new CustomEvent("filters:changed", { detail: Object.assign({}, state) }));
  }

  function setCountry(c) {
    if (!COUNTRIES[c] || c === state.country) return;
    state.country = c;
    emit();
  }

  function setRange(r) {
    if (RANGES.indexOf(r) === -1 || r === state.range) return;
    state.range = r;
    state.from = state.to = null;
    emit();
  }

  // A user-chosen range, both days included
  function setCustom(from, to) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!day.test(from) || !day.test(to) || to < from) return;
    if (state.range === "custom" && state.from === from && state.to === to) return;
    state.range = "custom";
    state.from = from;
    state.to = to;
    emit();
  }

  function countryLabel(s) {
    return COUNTRIES[(s || state).country];
  }

  window.countryLabel = countryLabel;

  return { state: state, setCountry: setCountry, setRange: setRange, setCustom: setCustom, countryLabel: countryLabel };
})();
