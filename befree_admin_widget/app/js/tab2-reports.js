/* Tab 2: Reports & Analytics */
(function () {
  "use strict";

  const TEMPERATURES = [
    { name: "Hot", color: "var(--red)" },
    { name: "Warm", color: "var(--orange)" },
    { name: "Cold", color: "var(--grey-blue)" },
    { name: "Not enough data", color: "#C9D2E3" },
    { name: "Not checked yet", color: "#E6EAF2" }
  ];

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
      subtitle.textContent = App.optionText(o, state.range) + " · " + countryLabel(state);
      header.replaceChildren(heading, App.optionSwitch(o, function (next) { choice[key] = next; draw(); }));
      card.dataset.option = o;
      card.dataset.total = block.amount;
      const rows = rowsOf(block).filter(function (r) { return r.value > 0; });
      card.dataset.rowsTotal = rows.reduce(function (t, r) { return t + r.value; }, 0);
      const max = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.value; })));
      card.body.replaceChildren();
      if (o === "wonOpen") card.body.appendChild(App.splitLine(data.options.won.amount, data.options.open.amount));
      rows.forEach(function (r) {
        card.body.appendChild(App.horizontalBarRow(r.label, r.text, r.value / max * 100, color));
      });
      if (!rows.length) card.body.appendChild(emptyNote(o === "won" ? "No won deals in this period." : "No won or open deals."));
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
          label: c.label === Data.OTHER_COUNTRY ? "Country not set" : c.label,
          value: c.value,
          text: App.formatINR(c.value) + (state.country === "ALL" ? " · " + App.formatPct(percents[i]) : "")
        };
      }).sort(function (a, b) { return b.value - a.value; });
    }, "#5B7FE8");
  }

  function renderByService(data, state) {
    return switchCard("service", "Amount by service", data, state, function (block) {
      return block.services.map(function (s) {
        return { label: s.label, value: s.value, text: App.formatINR(s.value) };
      }).sort(function (a, b) { return b.value - a.value; });
    }, "var(--blue)");
  }

  function donut(segments, total) {
    const NS = "http://www.w3.org/2000/svg";
    const R = 63, STROKE = 20, GAP = 5;
    const circumference = 2 * Math.PI * R;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "rp-donut");
    svg.setAttribute("viewBox", "0 0 150 150");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", total + " open leads: " + segments.map(function (s) { return s.name + " " + s.count; }).join(", "));

    const visible = segments.filter(function (s) { return s.count > 0; });
    let start = 0;
    visible.forEach(function (s) {
      const share = s.count / total * circumference;
      // Round caps add STROKE to the drawn length, so shorten the dash to leave a gap.
      const inset = visible.length > 1 ? STROKE + GAP : 0;
      const dash = Math.max(0.01, share - inset);
      const arc = document.createElementNS(NS, "circle");
      arc.setAttribute("cx", "75");
      arc.setAttribute("cy", "75");
      arc.setAttribute("r", String(R));
      arc.setAttribute("transform", "rotate(-90 75 75)");
      arc.style.fill = "none";
      arc.style.stroke = s.color;
      arc.style.strokeWidth = STROKE;
      arc.style.strokeLinecap = visible.length > 1 ? "round" : "butt";
      arc.style.strokeDasharray = dash + " " + (circumference - dash);
      arc.style.strokeDashoffset = String(-(start + inset / 2));
      svg.appendChild(arc);
      start += share;
    });

    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", "75");
    label.setAttribute("y", "75");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("class", "rp-donut-total");
    label.textContent = total;
    svg.appendChild(label);
    return svg;
  }

  function renderTemperature(data, state) {
    const card = reportCard("Lead temperature", "Open leads only, without converted, lost and junk leads · " + countryLabel(state), data.unavailable);
    const segments = TEMPERATURES.map(function (t) {
      return { name: t.name, color: t.color, count: data.temperature[t.name] || 0 };
    });
    const total = segments.reduce(function (n, s) { return n + s.count; }, 0);
    if (!segments.some(function (s) { return s.count && s.name !== "Not checked yet"; })) {
      card.body.appendChild(emptyNote(total ? (total === 1 ? "1 open lead, not checked yet. " : total + " open leads, not checked yet. ") + "Open a lead and click AI summary." : "No open leads."));
      return card;
    }
    const box = el("div", "rp-temperature");
    box.dataset.check = "temperature";
    box.dataset.total = total;
    box.append(donut(segments, total), App.legend(segments.filter(function (s, i) { return i < 3 || s.count; }).map(function (s) {
      return { label: s.name + ": " + s.count, color: s.color };
    }), "rp-legend"));
    card.body.appendChild(box);
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
      renderTemperature(data, state),
      revenue
    );
    root.replaceChildren(grid);
    revenue.draw();
  }

  App.registerTab("reports", { mount: mount, render: render });
})();
