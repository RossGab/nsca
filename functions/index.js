const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createTaskViewerUser = functions.https.onCall(async (data, context) => {

  const { email, password, role } = data;

  if (!email || !password || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing email/password/role"
    );
  }

  // 🔐 Require logged-in user
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in"
    );
  }

  try {
    // ✅ CREATE AUTH USER
    await admin.auth().createUser({
      email,
      password
    });

    // ✅ SAVE TO DATABASE
    await admin.database().ref(`config/taskviewUsers/${role}`).push({
      email,
      active: true,
      createdAt: Date.now()
    });

    return { success: true };

  } catch (err) {
    throw new functions.https.HttpsError(
      "internal",
      err.message
    );
  }
});

const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const ExcelJS = require("exceljs");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const REPORT_ORIGINS = new Set([
  "https://rossgab.github.io",
  "http://localhost",
  "http://127.0.0.1"
]);
const REPORT_DATABASE_ID = "drver-task";
const REPORT_COLLECTION = "TASK";
const REPORT_MAX_DAYS = 62;
const EXCEL_CELL_LIMIT = 32767;

function setReportCors(req, res) {
  const origin = String(req.get("origin") || "");
  const allowed = REPORT_ORIGINS.has(origin) ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
  if (allowed) res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Expose-Headers", "X-Task-Count, Content-Disposition");
  return allowed;
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function reportBounds(from, to) {
  const startParts = parseDateOnly(from);
  const endParts = parseDateOnly(to);
  if (!startParts || !endParts) return null;
  const startMillis = Date.UTC(
    startParts.year, startParts.month - 1, startParts.day, -8, 0, 0, 0
  );
  const endMillis = Date.UTC(
    endParts.year, endParts.month - 1, endParts.day + 1, -8, 0, 0, 0
  ) - 1;
  const days = Math.floor((endMillis - startMillis) / 86400000) + 1;
  if (days < 1 || days > REPORT_MAX_DAYS) return null;
  return { startMillis, endMillis };
}

function normalizedTask(id, raw) {
  const rawStatus = String(raw.status || "").trim().toUpperCase();
  const workStatus = String(raw.workStatus || "").trim().toUpperCase();
  const status = rawStatus === "COMPLETED" || workStatus === "COMPLETED"
    ? "COMPLETED"
    : rawStatus || workStatus || "PENDING";
  return {
    TASK_ID: id,
    ...raw,
    driverId: raw.driverId ?? raw.agentId ?? "",
    JOBTYPE: raw.JOBTYPE ?? raw.jobType ?? "",
    BA: raw.BA ?? raw.ba ?? "",
    DMZ: raw.DMZ ?? raw.dmz ?? "",
    status
  };
}

function cellValue(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && Number.isFinite(value._seconds)) {
    return new Date(value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1000000));
  }
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000));
  }
  let result = value;
  if (typeof value === "object") {
    try { result = JSON.stringify(value); }
    catch { result = String(value); }
  }
  if (typeof result === "string" && result.length > EXCEL_CELL_LIMIT) {
    return `${result.slice(0, 32750)}... [truncated]`;
  }
  return result;
}

exports.generateTaskReport = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 3600,
  memory: "2GiB",
  cpu: 2,
  concurrency: 1,
  maxInstances: 1,
  cors: false
}, async (req, res) => {
  const originAllowed = setReportCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(originAllowed ? 204 : 403).end();
    return;
  }
  if (req.method !== "POST" || !originAllowed) {
    res.status(403).json({ error: "Report request is not allowed." });
    return;
  }

  const bounds = reportBounds(req.body?.from, req.body?.to);
  if (!bounds) {
    res.status(400).json({ error: `Select a valid range of ${REPORT_MAX_DAYS} days or less.` });
    return;
  }

  const selected = key => new Set(
    Array.isArray(req.body?.[key]) ? req.body[key].map(value => String(value)) : []
  );
  const statuses = selected("statuses");
  const jobTypes = selected("jobTypes");
  const bas = selected("bas");
  const dmzs = selected("dmzs");
  const db = getFirestore(REPORT_DATABASE_ID);
  const lockRef = db.collection("systemLocks").doc("publicTaskReport");
  const lockToken = crypto.randomUUID();
  const now = Date.now();

  try {
    await db.runTransaction(async transaction => {
      const lock = await transaction.get(lockRef);
      const lockedUntil = Number(lock.data()?.lockedUntil || 0);
      if (lockedUntil > now) throw new Error("REPORT_BUSY");
      transaction.set(lockRef, {
        token: lockToken,
        lockedUntil: now + 60 * 60 * 1000,
        createdAt: Timestamp.now()
      });
    });
  } catch (error) {
    if (error.message === "REPORT_BUSY") {
      res.status(429).json({ error: "Another report is being generated. Please try again later." });
      return;
    }
    throw error;
  }

  try {
    const rows = [];
    const headerSet = new Set(["TASK_ID"]);

    const sourceTasks = await loadHybridReportTasks(
      db,
      String(req.body.from),
      String(req.body.to)
    );
    sourceTasks.forEach(sourceTask => {
      const raw = sourceTask || {};
      if (raw.deleted === true) return;
      const row = normalizedTask(raw._key, raw);
      if (statuses.size && !statuses.has(String(row.status))) return;
      if (jobTypes.size && !jobTypes.has(String(row.JOBTYPE))) return;
      if (bas.size && !bas.has(String(row.BA))) return;
      if (dmzs.size && !dmzs.has(String(row.DMZ))) return;
      Object.keys(row).forEach(key => headerSet.add(key));
      rows.push(row);
    });

    if (!rows.length) {
      res.status(404).json({ error: "No tasks matched the selected report filters." });
      return;
    }

    const headers = [...headerSet]
      .filter(header => header !== "TASK_ID")
      .sort();
    headers.unshift("TASK_ID");
    if (rows.length > 1048575) {
      res.status(413).json({
        error: "The report exceeds Excel's 1,048,575 data-row worksheet limit."
      });
      return;
    }

    const filename = `Task_Report_${req.body.from}_to_${req.body.to}.xlsx`;
    res.status(200);
    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.set("X-Task-Count", String(rows.length));
    res.flushHeaders();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: false,
      useSharedStrings: false
    });
    const worksheet = workbook.addWorksheet("Tasks");
    worksheet.addRow(headers).commit();
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length }
    };
    for (const row of rows) {
      worksheet.addRow(headers.map(header => cellValue(row[header]))).commit();
    }
    worksheet.commit();
    await workbook.commit();
  } catch (error) {
    console.error("Public task report failed", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Report generation failed." });
    } else {
      res.destroy(error);
    }
  } finally {
    try {
      await db.runTransaction(async transaction => {
        const lock = await transaction.get(lockRef);
        if (lock.data()?.token === lockToken) transaction.delete(lockRef);
      });
    } catch (lockError) {
      console.error("Unable to release report lock", lockError);
    }
  }
});

function snapshotDateIsEligible(dateText) {
  const parsed = parseDateOnly(dateText);
  if (!parsed) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const today = formatter.format(new Date());
  const cutoff = new Date(`${today}T00:00:00+08:00`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 2);
  return dateText <= formatter.format(cutoff);
}

function reportDateStrings(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end) return [];
  const dates = [];
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const last = new Date(Date.UTC(end.year, end.month - 1, end.day));
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function refreshSnapshotForDate(db, date) {
  const manifestRef = db.collection("reportSnapshotManifests").doc(date);
  const file = admin.storage().bucket().file(`task-report-snapshots/${date}.json.gz`);
  const token = crypto.randomUUID();
  const checkStartedMillis = Date.now();
  try {
    await db.runTransaction(async transaction => {
      const manifest = await transaction.get(manifestRef);
      if (Number(manifest.data()?.lockedUntil || 0) > Date.now()) throw new Error("SNAPSHOT_BUSY");
      transaction.set(manifestRef, { lockToken: token, lockedUntil: Date.now() + 10 * 60 * 1000 }, { merge: true });
    });
    const manifest = (await manifestRef.get()).data() || {};
    let tasksById = new Map();
    let watermarkMillis = Number(manifest.watermarkMillis || 0);
    let fullBuild = !manifest.snapshotExists;
    if (!fullBuild) {
      try {
        const [compressed] = await file.download();
        const saved = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
        tasksById = new Map((saved.tasks || []).map(task => [task._key, task]));
      } catch {
        fullBuild = true; tasksById = new Map(); watermarkMillis = 0;
      }
    }
    let taskQuery = db.collection(REPORT_COLLECTION).where("assignedDate", "==", date);
    if (!fullBuild && watermarkMillis) {
      taskQuery = taskQuery.where("updatedAt", ">", Timestamp.fromMillis(watermarkMillis));
    }
    const changes = await taskQuery.get();
    changes.forEach(document => {
      const raw = document.data() || {};
      if (raw.deleted === true || String(raw.assignedDate || "") !== date) tasksById.delete(document.id);
      else tasksById.set(document.id, { _key: document.id, ...raw });
    });
    const payload = { date, generatedAt: new Date().toISOString(), watermarkMillis: checkStartedMillis, tasks: [...tasksById.values()] };
    await file.save(zlib.gzipSync(Buffer.from(JSON.stringify(payload))), {
      resumable: false,
      metadata: { contentType: "application/json", contentEncoding: "gzip" }
    });
    await manifestRef.set({
      date, snapshotExists: true, taskCount: tasksById.size,
      watermarkMillis: checkStartedMillis, generatedAt: Timestamp.now(),
      changedTasks: changes.size, lockedUntil: 0, lockToken: null
    }, { merge: true });
    return { date, fullBuild, changedTasks: changes.size, taskCount: tasksById.size, tasks: [...tasksById.values()] };
  } finally {
    try {
      const current = await manifestRef.get();
      if (current.data()?.lockToken === token) await manifestRef.set({ lockedUntil: 0, lockToken: null }, { merge: true });
    } catch (error) {
      console.error("Unable to release snapshot lock", date, error);
    }
  }
}

async function loadHybridReportTasks(db, from, to, onDate) {
  const rows = [];
  const dates = reportDateStrings(from, to);
  for (let index = 0; index < dates.length; index++) {
    const date = dates[index];
    let dailyTasks;
    if (snapshotDateIsEligible(date)) {
      const result = await refreshSnapshotForDate(db, date);
      dailyTasks = result.tasks;
      if (onDate) onDate({ ...result, index, totalDates: dates.length, source: "snapshot" });
    } else {
      const live = await db.collection(REPORT_COLLECTION).where("assignedDate", "==", date).get();
      dailyTasks = live.docs.map(document => ({ _key: document.id, ...document.data() }));
      if (onDate) onDate({ date, changedTasks: live.size, taskCount: live.size, index, totalDates: dates.length, source: "live" });
    }
    for (const task of dailyTasks) {
      if (task.deleted !== true && String(task.assignedDate || "") === date) rows.push(task);
    }
  }
  return rows;
}

exports.refreshHistoricalTaskSnapshot = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 540,
  memory: "2GiB",
  maxInstances: 2,
  concurrency: 1,
  cors: false
}, async (req, res) => {
  const originAllowed = setReportCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(originAllowed ? 204 : 403).end();
    return;
  }
  if (req.method !== "POST" || !originAllowed) {
    res.status(403).json({ error: "Snapshot request is not allowed." });
    return;
  }

  const date = String(req.body?.date || "");
  if (!snapshotDateIsEligible(date)) {
    res.status(400).json({ error: "Only dates up to today minus two days can be snapshotted." });
    return;
  }

  const db = getFirestore(REPORT_DATABASE_ID);
  const manifestRef = db.collection("reportSnapshotManifests").doc(date);
  const bucket = admin.storage().bucket();
  const file = bucket.file(`task-report-snapshots/${date}.json.gz`);
  const token = crypto.randomUUID();
  const checkStartedMillis = Date.now();

  try {
    await db.runTransaction(async transaction => {
      const manifest = await transaction.get(manifestRef);
      if (Number(manifest.data()?.lockedUntil || 0) > Date.now()) {
        throw new Error("SNAPSHOT_BUSY");
      }
      transaction.set(manifestRef, {
        ...(manifest.data() || {}),
        lockToken: token,
        lockedUntil: Date.now() + 10 * 60 * 1000
      }, { merge: true });
    });

    const manifest = (await manifestRef.get()).data() || {};
    let tasksById = new Map();
    let watermarkMillis = Number(manifest.watermarkMillis || 0);
    let fullBuild = !manifest.snapshotExists;

    if (!fullBuild) {
      try {
        const [compressed] = await file.download();
        const saved = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
        tasksById = new Map((saved.tasks || []).map(task => [task._key, task]));
      } catch {
        fullBuild = true;
        tasksById = new Map();
        watermarkMillis = 0;
      }
    }

    let query = db.collection(REPORT_COLLECTION).where("assignedDate", "==", date);
    if (!fullBuild && watermarkMillis) {
      query = query.where("updatedAt", ">", Timestamp.fromMillis(watermarkMillis));
    }
    const snapshot = await query.get();
    let latestWatermark = checkStartedMillis;
    snapshot.forEach(document => {
      const raw = document.data() || {};
      const updatedMillis = raw.updatedAt?.toMillis?.() || 0;
      latestWatermark = Math.max(latestWatermark, updatedMillis);
      if (raw.deleted === true || String(raw.assignedDate || "") !== date) {
        tasksById.delete(document.id);
      } else {
        tasksById.set(document.id, { _key: document.id, ...raw });
      }
    });

    const payload = {
      date,
      generatedAt: new Date().toISOString(),
      watermarkMillis: latestWatermark,
      tasks: [...tasksById.values()]
    };
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload)));
    await file.save(compressed, {
      resumable: false,
      metadata: { contentType: "application/json", contentEncoding: "gzip" }
    });
    await manifestRef.set({
      date,
      snapshotExists: true,
      taskCount: tasksById.size,
      watermarkMillis: latestWatermark,
      generatedAt: Timestamp.now(),
      changedTasks: snapshot.size,
      lockedUntil: 0,
      lockToken: null
    }, { merge: true });

    res.json({
      date,
      fullBuild,
      changedTasks: snapshot.size,
      taskCount: tasksById.size
    });
  } catch (error) {
    console.error("Historical snapshot refresh failed", date, error);
    if (error.message === "SNAPSHOT_BUSY") {
      res.status(409).json({ error: `${date} is already being checked by another administrator.` });
    } else {
      res.status(500).json({ error: error.message || "Snapshot refresh failed." });
    }
  } finally {
    try {
      const current = await manifestRef.get();
      if (current.data()?.lockToken === token) {
        await manifestRef.set({ lockedUntil: 0, lockToken: null }, { merge: true });
      }
    } catch (error) {
      console.error("Unable to release snapshot lock", date, error);
    }
  }
});

exports.prepareTaskReport = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 1800,
  memory: "2GiB",
  cpu: 2,
  maxInstances: 2,
  concurrency: 1,
  cors: false
}, async (req, res) => {
  const originAllowed = setReportCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(originAllowed ? 204 : 403).end();
    return;
  }
  if (req.method !== "POST" || !originAllowed) {
    res.status(403).json({ error: "Report preparation request is not allowed." });
    return;
  }
  if (!reportBounds(req.body?.from, req.body?.to)) {
    res.status(400).json({ error: `Select a valid range of ${REPORT_MAX_DAYS} days or less.` });
    return;
  }
  try {
    const db = getFirestore(REPORT_DATABASE_ID);
    const sourceStats = { snapshotDates: 0, liveDates: 0, changedTasks: 0 };
    const tasks = await loadHybridReportTasks(
      db,
      String(req.body.from),
      String(req.body.to),
      info => {
        if (info.source === "snapshot") sourceStats.snapshotDates++;
        else sourceStats.liveDates++;
        sourceStats.changedTasks += Number(info.changedTasks || 0);
      }
    );
    const normalized = tasks.map(raw => normalizedTask(raw._key, raw));
    const values = field => [...new Set(
      normalized.map(task => String(task[field] || "")).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    }));
    res.json({
      taskCount: normalized.length,
      statuses: values("status"),
      jobTypes: values("JOBTYPE"),
      bas: values("BA"),
      dmzs: values("DMZ"),
      ...sourceStats
    });
  } catch (error) {
    console.error("Task report preparation failed", error);
    if (error.message === "SNAPSHOT_BUSY") {
      res.status(409).json({ error: "A historical snapshot is already being refreshed. Please retry shortly." });
    } else {
      res.status(500).json({ error: error.message || "Report preparation failed." });
    }
  }
});
