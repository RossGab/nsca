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
// Known writer formats plus legacy case/separator variants. Two 15-value
// branches stay within Firestore's 30-disjunction limit.
const MANAGE_ACTIVE_VALUES = ["pending", "PENDING", "Pending", "fordownload", "FORDOWNLOAD", "ForDownload",
  "for download", "FOR DOWNLOAD", "For Download", "for_download", "FOR_DOWNLOAD", "For_Download",
  "for-download", "FOR-DOWNLOAD", "For-Download"];
async function readManageTaskPage(db, {date, cursor = "", pageSize = 1000}, {Filter, FieldPath}) {
  const started = Date.now();
  const size = Math.max(1, Math.min(1000, Number.isFinite(Number(pageSize)) ? Number(pageSize) : 1000));
  let query = db.collection("TASK").where("assignedDate", "==", date)
    .where(Filter.or(Filter.where("workStatus", "in", MANAGE_ACTIVE_VALUES),
      Filter.where("status", "in", MANAGE_ACTIVE_VALUES)))
    .orderBy(FieldPath.documentId()).limit(size).select(...FIELDS);
  if (cursor) query = query.startAfter(cursor);
  const queryStarted = Date.now();
  const snapshot = await query.get();
  const queryMs = Date.now() - queryStarted;
  const tasks = snapshot.docs.map(document => ({...document.data(), _key:document.id}))
    .filter(isManageTaskActive).map(projectManageTask);
  const nextCursor = snapshot.docs.at(-1)?.id || "";
  return {tasks, nextCursor, hasMore:snapshot.size === size && Boolean(nextCursor),
    estimatedDocumentReads:Math.max(1, snapshot.size),
    timings:{queryMs, processingMs:Date.now() - queryStarted - queryMs, totalMs:Date.now() - started}};
}
module.exports = {isManageTaskActive, projectManageTask, readManageTaskPage, MANAGE_ACTIVE_VALUES};
