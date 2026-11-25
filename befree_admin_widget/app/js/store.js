/* The one shared filter state. Change it only through setCountry() / setRange(). */
window.Store = (function () {
  "use strict";

  const COUNTRIES = { ALL: "All countries", US: "United States", UK: "United Kingdom", AU: "Australia" };
  const RANGES = ["7d", "30d", "90d", "12m"];

  const state = { country: "US", range: "30d" };

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
    emit();
  }

  function countryLabel(s) {
    return COUNTRIES[(s || state).country];
  }

  window.countryLabel = countryLabel;

  return { state: state, setCountry: setCountry, setRange: setRange, countryLabel: countryLabel };
})();
