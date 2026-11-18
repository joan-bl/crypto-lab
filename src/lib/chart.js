// Gráfica de líneas en SVG, sin librerías: líneas finas, rejilla tenue, cruz que sigue
// al puntero (o al teclado) y una etiqueta con el valor de todas las series en esa fecha.

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= Math.abs(min) * 0.05 || 1; max += Math.abs(max) * 0.05 || 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toPrecision(12));
  return { lo, hi, ticks };
}

/**
 * series: [{ name, color, points: [{ t, v }], area?: bool }]
 * fmt: (v) => texto del valor · fmtT: (t) => texto de la fecha (etiqueta) · fmtAxis: (t) => texto corto para el eje
 */
export function lineChart(container, { series, fmt, fmtT, fmtAxis, height = 280, label = "Gráfica" }) {
  container.classList.add("chart");
  container.innerHTML = "";
  const all = series.flatMap((s) => s.points);
  if (!all.length) {
    container.innerHTML = `<p class="muted small">Sin datos para este periodo.</p>`;
    return;
  }
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  container.append(tip);

  const draw = () => {
    container.querySelector("svg")?.remove();
    const W = Math.max(280, container.clientWidth);
    const H = height;
    const m = { l: 8, r: 64, t: 12, b: 26 };
    const tMin = Math.min(...all.map((p) => p.t)), tMax = Math.max(...all.map((p) => p.t));
    const vals = all.map((p) => p.v);
    const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
    const x = (t) => m.l + ((t - tMin) / (tMax - tMin || 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": label, tabindex: 0 });
    const grid = el("g", { class: "grid" });
    for (const v of ticks) {
      grid.append(el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const tx = el("text", { x: W - m.r + 8, y: y(v) + 4, class: "axis" });
      tx.textContent = fmt(v, true);
      grid.append(tx);
    }
    // eje de fechas: 4–6 etiquetas
    const nX = Math.max(2, Math.min(6, Math.floor(W / 130)));
    for (let i = 0; i <= nX; i++) {
      const t = tMin + ((tMax - tMin) * i) / nX;
      const tx = el("text", { x: x(t), y: H - 6, class: "axis", "text-anchor": i === 0 ? "start" : i === nX ? "end" : "middle" });
      tx.textContent = fmtAxis(t);
      grid.append(tx);
    }
    svg.append(grid);

    for (const s of series) {
      if (!s.points.length) continue;
      const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
      if (s.area) {
        const base = y(lo);
        svg.append(el("path", { d: `${d}L${x(s.points.at(-1).t).toFixed(1)},${base}L${x(s.points[0].t).toFixed(1)},${base}Z`, fill: s.color, opacity: 0.08 }));
      }
      svg.append(el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    }

    const cross = el("line", { y1: m.t, y2: H - m.b, class: "cross", visibility: "hidden" });
    svg.append(cross);
    const dots = series.map((s) => {
      const c = el("circle", { r: 4.5, fill: s.color, stroke: "var(--card)", "stroke-width": 2, visibility: "hidden" });
      svg.append(c);
      return c;
    });
    const hit = el("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" });
    svg.append(hit);

    // índice de fechas de la serie más larga
    const ref = series.reduce((a, b) => (b.points.length > a.points.length ? b : a)).points;
    let idx = -1;
    const show = (i) => {
      idx = Math.max(0, Math.min(ref.length - 1, i));
      const t = ref[idx].t;
      const px = x(t);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("visibility", "visible");
      tip.replaceChildren();
      const head = document.createElement("div");
      head.className = "tip-date";
      head.textContent = fmtT(t);
      tip.append(head);
      series.forEach((s, k) => {
        const p = nearest(s.points, t);
        if (!p) { dots[k].setAttribute("visibility", "hidden"); return; }
        dots[k].setAttribute("cx", x(p.t)); dots[k].setAttribute("cy", y(p.v)); dots[k].setAttribute("visibility", "visible");
        const row = document.createElement("div");
        row.className = "tip-row";
        const key = document.createElement("i");
        key.style.background = s.color;
        const val = document.createElement("b");
        val.textContent = fmt(p.v);
        const nm = document.createElement("span");
        nm.textContent = s.name;
        row.append(key, val, nm);
        tip.append(row);
      });
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(0, px - tw / 2), W - tw)}px`;
    };
    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
      tip.hidden = true;
    };
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const t = tMin + ((px - m.l) / (W - m.l - m.r)) * (tMax - tMin);
      show(nearestIndex(ref, t));
    });
    hit.addEventListener("pointerleave", hide);
    svg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        show((idx < 0 ? ref.length - 1 : idx) + (e.key === "ArrowRight" ? 1 : -1));
      }
      if (e.key === "Escape") hide();
    });
    svg.addEventListener("blur", hide);
    container.prepend(svg);
  };

  draw();
  let w = container.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - w) > 4) { w = container.clientWidth; draw(); }
  });
  ro.observe(container);
}

function nearestIndex(points, t) {
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid; else hi = mid;
  }
  return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi;
}

function nearest(points, t) {
  if (!points.length) return null;
  return points[nearestIndex(points, t)];
}

/** Tabla accesible con los mismos datos (la vista alternativa a la gráfica). */
export function dataTable(series, fmt, fmtT, maxRows = 400) {
  const ref = series.reduce((a, b) => (b.points.length > a.points.length ? b : a)).points;
  const step = Math.max(1, Math.ceil(ref.length / maxRows));
  const rows = [];
  for (let i = ref.length - 1; i >= 0; i -= step) {
    const t = ref[i].t;
    rows.push(`<tr><td>${fmtT(t)}</td>${series.map((s) => `<td class="n">${fmt(nearest(s.points, t)?.v ?? NaN)}</td>`).join("")}</tr>`);
  }
  return `<div class="table-wrap"><table class="entries compact data-table"><thead><tr><th>Fecha</th>${series.map((s) => `<th class="n">${s.name.replace(/</g, "&lt;")}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
