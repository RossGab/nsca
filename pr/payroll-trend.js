const months = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit"
});

function monthKey(date) {
  return months.format(date).slice(0, 7);
}

function offsetMonth(key, offset) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function payrollTrend(runs, now = new Date()) {
  const current = monthKey(now);
  const totals = new Map();
  for (const run of runs) {
    const date = run.paidAt?.toDate?.() ?? (run.paidAt instanceof Date ? run.paidAt : null);
    const amount = run.totals?.netPay;
    if (run.status !== "PAID" || !date || !Number.isFinite(date.getTime()) ||
        date > now || !Number.isFinite(amount)) continue;
    const key = monthKey(date);
    const entry = totals.get(key) || {amount: 0, count: 0};
    entry.amount += Math.round(amount * 100);
    entry.count++;
    totals.set(key, entry);
  }
  const history = Array.from({length: 12}, (_, index) => {
    const month = offsetMonth(current, index - 11);
    return {month, amount: totals.has(month) ? totals.get(month).amount / 100 : null};
  });
  const recent = history.slice(0, -1).filter(point => point.amount !== null).slice(-3);
  const currentTotal = totals.get(current);
  const baseline = recent.length
    ? Math.round(recent.reduce((sum, point) => sum + Math.round(point.amount * 100), 0) / recent.length) / 100
    : currentTotal ? Math.round(currentTotal.amount * 2 / currentTotal.count) / 100 : null;
  const forecast = [1, 2].map(offset => ({month: offsetMonth(current, offset), amount: baseline}));
  return {history, forecast, baselineMonths: recent.length};
}
