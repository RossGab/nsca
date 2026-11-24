export const earningsCategories = [
  ["regular", "Regular pay"], ["overtime", "Overtime"], ["premium", "Premiums"],
  ["bonus", "Bonuses"], ["driver", "Driver earnings"], ["other", "Other / unclassified"]
];

const cents = value => Number.isFinite(value) ? Math.round(value * 100) : 0;
const emptyBreakdown = () => Object.fromEntries(earningsCategories.map(([key]) => [key, 0]));

function runBreakdown(run, gross) {
  const result = emptyBreakdown();
  for (const row of run.rows || []) {
    result.regular += cents(row.basicPay);
    result.overtime += cents(row.overtimePay);
    if (Number.isFinite(row.overtimePay)) result.premium += cents(row.attendancePremium) - cents(row.overtimePay);
    result.bonus += cents(row.bonusPay);
    result.driver += cents(row.driverEarnings);
  }
  const classified = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (classified > gross || Object.values(result).some(value => value < 0)) {
    return {...emptyBreakdown(), other: gross};
  }
  result.other = gross - classified;
  return result;
}

function point(month, breakdown) {
  if (!breakdown) return {month, amount: null, breakdown: null};
  const amount = Object.values(breakdown).reduce((sum, value) => sum + value, 0) / 100;
  return {month, amount, breakdown: Object.fromEntries(
    Object.entries(breakdown).map(([key, value]) => [key, value / 100]))};
}

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
    const amount = run.totals?.grossPay;
    if (run.status !== "PAID" || !date || !Number.isFinite(date.getTime()) ||
        date > now || !Number.isFinite(amount) || amount < 0) continue;
    const key = monthKey(date);
    const entry = totals.get(key) || {breakdown: emptyBreakdown(), count: 0};
    const breakdown = runBreakdown(run, cents(amount));
    for (const [category] of earningsCategories) entry.breakdown[category] += breakdown[category];
    entry.count++;
    totals.set(key, entry);
  }
  const history = Array.from({length: 12}, (_, index) => {
    const month = offsetMonth(current, index - 11);
    return point(month, totals.get(month)?.breakdown);
  });
  const recent = history.slice(0, -1).filter(entry => entry.amount !== null).slice(-3);
  const currentTotal = totals.get(current);
  const baseline = recent.length || currentTotal ? emptyBreakdown() : null;
  if (baseline) {
    for (const [key] of earningsCategories) {
      baseline[key] = recent.length
        ? Math.round(recent.reduce((sum, entry) => sum + cents(entry.breakdown[key]), 0) / recent.length)
        : Math.round(currentTotal.breakdown[key] * 2 / currentTotal.count);
    }
  }
  const forecast = [1, 2].map(offset => point(offsetMonth(current, offset), baseline));
  return {history, forecast, baselineMonths: recent.length};
}
