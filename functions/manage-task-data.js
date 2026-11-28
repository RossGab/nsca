"use strict";
const FIELDS = ["taskId", "accountNumber", "address", "agentId", "agentName", "driverId",
  "assignedDate", "ba", "bg", "BG", "createdAt", "customerName", "deleted", "dmz", "jobType",
  "latitude", "longitude", "meterNumber", "mru", "sequence", "status", "workStatus", "updatedAt"];
function isManageTaskActive(task) {
  if (!task || task.deleted === true) return false;
  const normalize = value => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const status = normalize(task.status);
  const workStatus = normalize(task.workStatus);
  if (status === "completed" || workStatus === "completed") return false;
  const state = workStatus || status;
  return state === "pending" || state === "fordownload";
}
function projectManageTask(task) {
  const result = {_key: String(task._key || task.taskId || "")};
  for (const field of FIELDS) {
    let value = task[field];
    if (value === undefined) continue;
    if (field === "createdAt" || field === "updatedAt") {
      if (typeof value?.toDate === "function") value = value.toDate().toISOString();
      else if (typeof (value?._seconds ?? value?.seconds) === "number")
        value = new Date((value._seconds ?? value.seconds) * 1000).toISOString();
    }
    result[field] = value;
  }
  return result;
}
module.exports = {isManageTaskActive, projectManageTask};
