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

function safeWorksheetName(value, usedNames) {
  const cleaned = String(value || "Unspecified")
    .replace(/[\\/?*\[\]:]/g, " ")
    .trim() || "Unspecified";
  const base = cleaned.slice(0, 31);
  let candidate = base;
  let number = 2;
  while (usedNames.has(candidate.toUpperCase())) {
    const suffix = ` ${number++}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
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
    const snapshot = await db.collection(REPORT_COLLECTION)
      .where("createdAt", ">=", Timestamp.fromMillis(bounds.startMillis))
      .where("createdAt", "<=", Timestamp.fromMillis(bounds.endMillis))
      .get();
    const rows = [];
    const headerSet = new Set(["TASK_ID"]);

    snapshot.forEach(document => {
      const raw = document.data() || {};
      if (raw.deleted === true) return;
      const row = normalizedTask(document.id, raw);
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
    const rowsByJobType = new Map();
    rows.forEach(row => {
      const jobType = String(row.JOBTYPE || "").trim() || "Unspecified";
      if (!rowsByJobType.has(jobType)) rowsByJobType.set(jobType, []);
      rowsByJobType.get(jobType).push(row);
    });
    const oversizedJobType = [...rowsByJobType.entries()].find(
      ([, jobRows]) => jobRows.length > 1048575
    );
    if (oversizedJobType) {
      res.status(413).json({
        error: `${oversizedJobType[0]} exceeds Excel's 1,048,575 data-row worksheet limit.`
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
    const usedNames = new Set();
    const groups = [...rowsByJobType.entries()].sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    for (const [jobType, jobRows] of groups) {
      const worksheet = workbook.addWorksheet(safeWorksheetName(jobType, usedNames));
      worksheet.addRow(headers).commit();
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length }
      };
      for (const row of jobRows) {
        worksheet.addRow(headers.map(header => cellValue(row[header]))).commit();
      }
      worksheet.commit();
    }
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
