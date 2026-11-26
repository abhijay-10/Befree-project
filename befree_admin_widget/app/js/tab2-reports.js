/* Tab 2: Reports & Analytics */
(function () {
  "use strict";

  const el = App.el;
  let root = null;
  let revenueChart = null;

  function reportCard(title, subtitle, isSample, className) {
    const card = App.card(title, subtitle);
    card.classList.add("rp-card");
    if (className) card.classList.add(className);
    if (isSample) card.querySelector(".card-title").append(" ", App.pill("CRM data unavailable", "orange"));
    return card;
  }

  function emptyNote(text) { return el("p", "rp-empty", text); }

  function renderAttribution(data, state) {
    const card = reportCard("Marketing attribution", "Confirmed amount by source channel · " + countryLabel(state), data.unavailable);
    card.body.appendChild(App.attributionBars(data));
    return card;
  }

  function renderWonLost(data, state) {
    const card = reportCard("Deals won vs lost", "Last 6 months · " + countryLabel(state), data.unavailable, "rp-fill");
    const series = [{ key: "won", name: "Won", color: "var(--green)" }, { key: "lost", name: "Lost", color: "var(--pink)" }];
    const max = Math.max.apply(null, [1].concat(...data.wonLost.map(function (m) { return [m.won, m.lost]; })));

    // Reuses the grouped-bar styles (.ov-chart*).
    const chart = el("div", "ov-chart rp-bars");
    data.wonLost.forEach(function (m) {
      const col = el("div", "ov-chart-col");
      const bars = el("div", "ov-chart-bars");
      series.forEach(function (s) {
        const bar = el("div", "ov-chart-bar");
        bar.style.height = (m[s.key] / max * 100) + "%";
        bar.style.background = s.color;
        bar.title = m.label + " · " + s.name + ": " + m[s.key];
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", bar.title);
        bars.appendChild(bar);
      });
      col.append(bars, el("div", "ov-chart-month", m.label));
      chart.appendChild(col);
    });
    card.body.append(chart, App.legend(series.map(function (s) { return { label: s.name, color: s.color }; }), "rp-legend"));
    return card;
  }

  // Each switch card keeps its own choice, so switching one never changes another.
  const choice = { country: "won", service: "won" };

  /*
   * A bar card with the Won only / Won + Open switch. rowsOf(block) gives [{label, value, text}] for one option
   * (data.options.won / .open / .wonOpen). The card total is the option's amount, so the bars add up to it.
   */
  function switchCard(key, title, data, state, rowsOf, color) {
    const card = reportCard(title, "", data.unavailable, "rp-pipeline");
    card.dataset.check = "switch-" + key;
    const header = card.querySelector(".card-header");
    header.classList.add("ov-card-header");
    const heading = el("div");
    heading.append.apply(heading, Array.from(header.childNodes));
    const subtitle = heading.querySelector(".card-subtitle") || heading.appendChild(el("p", "card-subtitle"));
    header.append(heading);

    function draw() {
      const o = choice[key];
      const block = data.options[o];
      subtitle.textContent = "Won: closing date in " + App.periodText(state.range) + " · Open: deals open today · " + countryLabel(state);
      header.replaceChildren(heading, App.optionSwitch(o, function (next) { choice[key] = next; draw(); }));
      card.dataset.option = o;
      card.dataset.total = block.amount;
      const keep = new Set(rowsOf(data.options.wonOpen).filter(function (r) { return r.value > 0; }).map(function (r) { return r.label; }));
      const all = rowsOf(block).filter(function (r) { return keep.has(r.label); });
      const rows = all.filter(function (r) { return !r.hidden; });
      // Rows that are not shown still belong to the total, and are stated below the bars
      const left = all.filter(function (r) { return r.hidden; }).reduce(function (t, r) { return t + r.value; }, 0);
      card.dataset.rowsTotal = all.reduce(function (t, r) { return t + r.value; }, 0);
      const max = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.value; })));
      card.body.replaceChildren();
      const split = App.splitLine(data.options.won.amount, data.options.open.amount);
      if (o !== "wonOpen") split.classList.add("is-reserved");
      card.body.appendChild(split);
      rows.forEach(function (r) {
        card.body.appendChild(App.horizontalBarRow(r.label, r.text, r.value / max * 100, color));
      });
      if (!rows.length) card.body.appendChild(emptyNote(o === "won" ? "No won deals in this period." : "No won or open deals."));
      if (left) card.body.appendChild(el("p", "ov-muted", "Not shown: " + App.formatINR(left) + (key === "country" ? " with no US, UK or AU country." : " with no listed service.")));
    }
    draw();
    return card;
  }

  function renderByCountry(data, state) {
    return switchCard("country", "Amount by country", data, state, function (block) {
      // Shares are recalculated from the amounts, never averaged; shown only when there are several countries.
      const percents = Data.shares(block.byCountry.map(function (c) { return c.value; }));
      return block.byCountry.map(function (c, i) {
        return {
          label: c.label,
          hidden: c.label === Data.OTHER_COUNTRY,
          value: c.value,
          text: App.formatINR(c.value) + (state.country === "ALL" ? " · " + App.formatPct(percents[i]) : "")
        };
      }).sort(function (a, b) { return b.value - a.value; });
    }, "#5B7FE8");
  }

  function renderByService(data, state) {
    return switchCard("service", "Amount by service", data, state, function (block) {
      return block.services.map(function (s) {
        return { label: s.label, value: s.value, text: App.formatINR(s.value), hidden: s.key === "other" };
      }).sort(function (a, b) { return b.value - a.value; });
    }, "var(--blue)");
  }

  // Won (in the period) and open money per deal owner
  function renderOwners(data, state) {
    const card = reportCard("Sales by owner", "Won: closing date in " + App.periodText(state.range) + " · Open: deals open today · " + countryLabel(state), data.unavailable);
    const rows = data.salesByOwner.slice(0, 8);
    const max = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.won + r.open; })));
    rows.forEach(function (r) {
      const row = el("div", "rp-owner");
      const bar = el("div", "rp-owner-bar");
      const won = el("span", "is-won"), open = el("span", "is-open");
      won.style.width = (r.won / max * 100) + "%";
      open.style.width = (r.open / max * 100) + "%";
      bar.append(won, open);
      bar.title = r.owner + ": won " + App.formatINR(r.won) + " (" + r.wonCount + "), open " + App.formatINR(r.open) + " (" + r.openCount + ")";
      const text = el("span", "rp-owner-value");
      text.append(el("b", "", App.formatINR(r.won)), " won · " + App.formatINR(r.open) + " open");
      row.append(el("span", "rp-owner-name", r.owner), bar, text);
      card.body.appendChild(row);
    });
    if (!rows.length) card.body.appendChild(emptyNote("No won or open deals."));
    else card.body.appendChild(App.legend([{ label: "Won", color: "var(--green)" }, { label: "Open", color: "#F2B84B" }], "rp-legend"));
    return card;
  }

  // Returns the card; call card.draw() once it is in the document.
  function renderRevenue(data, state) {
    const card = reportCard("Revenue trend", "₹ lakh · " + countryLabel(state), data.unavailable);
    card.draw = function () {};
    if (!window.Chart) {
      card.body.appendChild(emptyNote("The chart library could not be loaded."));
      return card;
    }
    const months = data.revenueTrend;
    const lakhs = months.map(function (m) { return Math.round(m.revenue / 1e4) / 10; });
    const box = el("div", "rp-line");
    const canvas = el("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Revenue in lakh rupees: " +
      months.map(function (m, i) { return m.label + " " + lakhs[i]; }).join(", "));
    box.appendChild(canvas);
    card.body.appendChild(box);

    card.draw = function () {
      const css = getComputedStyle(document.documentElement);
      const blue = css.getPropertyValue("--blue").trim();
      const muted = css.getPropertyValue("--muted").trim();
      const family = css.getPropertyValue("--font").trim();
      // Headroom above the peak, split into three gridline intervals.
      const top = Math.ceil(Math.max.apply(null, lakhs.concat(1)) * 1.15 / 3) * 3;

      revenueChart = new Chart(canvas, {
        type: "line",
        data: {
          labels: months.map(function (m) { return m.label; }),
          datasets: [{
            data: lakhs,
            borderColor: blue,
            borderWidth: 2,
            cubicInterpolationMode: "monotone",
            pointBackgroundColor: "#fff",
            pointBorderColor: blue,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#fff",
            fill: "start",
            backgroundColor: function (context) {
              const area = context.chart.chartArea;
              if (!area) return "transparent";
              const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              gradient.addColorStop(0, "rgba(35, 82, 229, .20)");
              gradient.addColorStop(1, "rgba(35, 82, 229, 0)");
              return gradient;
            }
          }]
        },
        options: {
          maintainAspectRatio: false,
          layout: { padding: { left: 4, right: 4, top: 6 } },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              displayColors: false,
              callbacks: { label: function (item) { return "₹" + item.parsed.y.toFixed(1) + " L"; } }
            }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { family: family, size: 12 } } },
            y: {
              min: 0,
              max: top,
              ticks: { display: false, stepSize: top / 3 },
              border: { display: false },
              // Three faint lines; none along the baseline.
              grid: { drawTicks: false, color: function (c) { return c.tick.value === 0 ? "transparent" : "#EEF1F6"; } }
            }
          }
        }
      });
    };
    return card;
  }

  function mount(node) { root = node; }

  function render(data, state) {
    if (revenueChart) {
      revenueChart.destroy();
      revenueChart = null;
    }
    const revenue = renderRevenue(data, state);
    const grid = el("div", "rp-grid");
    grid.append(
      renderAttribution(data, state),
      renderWonLost(data, state),
      renderByCountry(data, state),
      renderByService(data, state),
      renderOwners(data, state),
      revenue
    );
    root.replaceChildren(grid);
    revenue.draw();
  }

  App.registerTab("reports", { mount: mount, render: render });
})();
