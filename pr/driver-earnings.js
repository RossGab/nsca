const manilaDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
});

export function taskCompletion(task) {
  if (!task || task.deleted || task.forceReopen ||
      String(task.status).toUpperCase() !== "COMPLETED" ||
      String(task.workStatus).toUpperCase() !== "COMPLETED") return null;
  const owners = [task.driverId, task.agentId, task.AGENTID].map(value =>
    String(value ?? "").trim()).filter(Boolean);
  const driverId = owners[0];
  const actor = String(task.completionSource === "admin"
    ? task.completionOnBehalfOf ?? "" : task.completedBy ?? "").trim();
  const date = task.completedAt?.toDate?.();
  if (!driverId || actor !== driverId || owners.some(owner => owner !== driverId) ||
      !(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return {driverId, date: manilaDate.format(date), completedAtMs: date.getTime()};
}

export function driverCredits(tasks, row, recordedDates) {
  const counted = new Set(recordedDates);
  return [...tasks].sort((a, b) => a.completedAtMs - b.completedAtMs || a.taskId.localeCompare(b.taskId))
    .map(task => {
      const payableDay = row.payType === "DAILY" && !counted.has(task.date);
      counted.add(task.date);
      return {...task, payableDay, amount: payableDay ? row.rate : 0};
    });
}
