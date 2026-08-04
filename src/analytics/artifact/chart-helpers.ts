import type { PaymentSlice } from "../types.js";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

const PAYMENT_COLORS: Record<string, string> = {
  Cash: "#2e7d32",
  UPI: "#1565c0",
  Khata: "#ef6c00",
};

export function paymentSlicesFromBreakdown(breakdown: {
  cash: PaymentSlice;
  upi: PaymentSlice;
  khata: PaymentSlice;
}): PieSlice[] {
  return [
    { label: "Cash", value: breakdown.cash.paise, color: PAYMENT_COLORS.Cash! },
    { label: "UPI", value: breakdown.upi.paise, color: PAYMENT_COLORS.UPI! },
    {
      label: "Khata",
      value: breakdown.khata.paise,
      color: PAYMENT_COLORS.Khata!,
    },
  ].filter((slice) => slice.value > 0);
}

export function renderPieChart(
  slices: PieSlice[],
  size = 160,
  title?: string,
): string {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return `<div class="chart-empty">No payment data</div>`;
  }

  const radius = size / 2 - 8;
  const center = size / 2;
  let cumulative = 0;
  const paths: string[] = [];

  for (const slice of slices) {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += slice.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    paths.push(
      `<path d="M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${slice.color}" />`,
    );
  }

  const legend = slices
    .map(
      (slice) =>
        `<div class="legend-item"><span class="legend-swatch" style="background:${slice.color}"></span>${slice.label}</div>`,
    )
    .join("");

  return `<div class="chart-wrap">
    ${title ? `<div class="chart-title">${title}</div>` : ""}
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Payment split chart">${paths.join("")}</svg>
    <div class="legend">${legend}</div>
  </div>`;
}

export function renderHorizontalBarChart(
  items: Array<{ label: string; value: number }>,
  maxWidth = 320,
  title?: string,
  escapeLabel: (value: string) => string = (value) => value,
): string {
  if (items.length === 0) {
    return `<div class="chart-empty">No item data</div>`;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const rows = items
    .map((item) => {
      const width = Math.round((item.value / maxValue) * maxWidth);
      return `<div class="bar-row">
        <div class="bar-label">${escapeLabel(item.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}px"></div></div>
        <div class="bar-value">${formatCompactRupees(item.value)}</div>
      </div>`;
    })
    .join("");

  return `<div class="chart-wrap">
    ${title ? `<div class="chart-title">${title}</div>` : ""}
    <div class="bar-chart">${rows}</div>
  </div>`;
}

export function renderMiniBarChart(
  items: Array<{ label: string; value: number }>,
  width = 280,
  height = 120,
  title?: string,
): string {
  if (items.length === 0) {
    return `<div class="chart-empty">No daily sales data</div>`;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const barWidth = Math.max(12, Math.floor(width / items.length) - 8);
  const bars = items
    .map((item, index) => {
      const barHeight = Math.round((item.value / maxValue) * (height - 24));
      const x = index * (barWidth + 8) + 8;
      const y = height - barHeight - 16;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#3949ab" rx="3" />
        <text x="${x + barWidth / 2}" y="${height - 2}" text-anchor="middle" class="mini-label">${item.label}</text>`;
    })
    .join("");

  return `<div class="chart-wrap">
    ${title ? `<div class="chart-title">${title}</div>` : ""}
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales mini chart">${bars}</svg>
  </div>`;
}

function formatCompactRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}
