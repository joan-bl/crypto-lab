// Utilidades pequeñas de interfaz.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const eurFmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const eurFmtSmall = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const eur = (n) => (Math.abs(n) < 0.1 && n !== 0 ? eurFmtSmall : eurFmt).format(n);
export const num = (n, d = 2) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: d }).format(n);
export const pct = (n) => `${num(n, 2)} %`;

export function btcAmount(sats) {
  const s = BigInt(sats);
  const neg = s < 0n;
  const a = neg ? -s : s;
  const whole = a / 100_000_000n;
  const frac = (a % 100_000_000n).toString().padStart(8, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export function shortHash(h, n = 8) {
  return h && h.length > 2 * n + 3 ? `${h.slice(0, n)}…${h.slice(-n)}` : h;
}

export function copyButton(text, label = "Copiar") {
  return `<button class="btn-ghost copy" data-copy="${esc(text)}">${label}</button>`;
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    const old = b.textContent;
    b.textContent = "Copiado";
    setTimeout(() => (b.textContent = old), 1200);
  } catch {
    /* sin permiso de portapapeles */
  }
});

export function timeAgo(tsSec) {
  const s = Math.floor(Date.now() / 1000 - tsSec);
  if (s < 60) return "hace unos segundos";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} días`;
}

export function errorBox(err) {
  return `<p class="error">⚠ ${esc(err?.message || err)}</p>`;
}
