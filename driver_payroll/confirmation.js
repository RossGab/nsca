import {initializeApp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {collection, doc, getDoc, getDocs, initializeFirestore, runTransaction, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {confirmationId, confirmationMatches, eligibleDriverTasks, taskFingerprint} from "../pr/driver-confirmations.js";

const db = initializeFirestore(initializeApp({projectId: "driva-pwa", appId: "1:299138219722:web:623ff6b0a067ea822dfe33"}), {}, "drver-task");
const field = id => document.getElementById(id);
const parameters = new URLSearchParams(location.search);
const side = parameters.get("view") === "driver" ? "driver" : "admin";
const drivers = new Map();
let current;
let busy = false;

function message(text, error = false) {
  const feedback = field("feedback");
  feedback.hidden = !text;
  feedback.className = "message" + (error ? " error" : "");
  feedback.textContent = text;
}

function selection() {
  const driverId = field("driver").value;
  const from = field("from").value;
  const to = field("to").value;
  const driver = drivers.get(driverId);
  if (!driver || !from || !to || from > to) throw new Error("Choose a driver and a valid cutoff.");
  return {driverId, from, to, driver, id: confirmationId(driverId, from, to)};
}

function status(entry, fingerprint) {
  if (!entry) return "Pending";
  if (entry.fingerprint !== fingerprint) return "Needs reconfirmation";
  return entry.status === "DISPUTED" ? "Discrepancy" : "Confirmed";
}

function render(record, model) {
  const {tasks, fingerprint, driver, from, to, closed} = model;
  field("result").hidden = false;
  field("taskCount").textContent = tasks.length;
  field("listHeading").textContent = "Completed tasks for " + driver.name;
  field("cutoffLabel").textContent = from + " to " + to;
  for (const role of ["admin", "driver"]) field(role + "Status").textContent = status(record?.[role], fingerprint);
  const ready = confirmationMatches(record, fingerprint, tasks.length);
  const disputes = ["admin", "driver"].filter(role => record?.[role]?.status === "DISPUTED");
  field("reviewStatus").textContent = closed ? "Payroll cutoff closed" : ready ? "Ready for payroll" :
    disputes.length ? "Reconcile the discrepancy before payroll" : "Waiting for both confirmations";
  const note = field("reviewNote");
  note.hidden = !disputes.length;
  note.textContent = disputes.map(role => {
    const entry = record[role];
    return (role === "admin" ? "Admin" : "Driver") + " expected " + entry.count + " · " + entry.reason;
  }).join(" · ");
  const table = field("taskRows");
  table.replaceChildren();
  for (const task of tasks) {
    const row = table.insertRow();
    row.insertCell().textContent = task.taskId;
    row.insertCell().textContent = task.date;
  }
  if (!tasks.length) {
    const cell = table.insertRow().insertCell();
    cell.colSpan = 2;
    cell.className = "empty";
    cell.textContent = "No eligible completed tasks for this cutoff.";
  }
  field("confirm").disabled = closed || status(record?.[side], fingerprint) === "Confirmed";
  field("flag").disabled = closed;
  field("disputeForm").hidden = true;
  field("disputeForm").reset();
}

async function readCutoff(input) {
  const ref = doc(db, "payrollDriverConfirmations", input.id);
  const [confirmation, run] = await Promise.all([
    getDoc(ref), getDoc(doc(db, "payrollRuns", input.from + "_" + input.to))
  ]);
  const payroll = run.data();
  const closed = ["FINALIZED", "PAID"].includes(payroll?.status);
  const tasks = closed
    ? (payroll.rows || []).flatMap(row => (row.driverTasks || []).filter(task => task.driverId === input.driverId))
    : await eligibleDriverTasks(db, new Map([[input.driverId, input.driver]]), input.from, input.to);
  tasks.sort((a, b) => a.completedAtMs - b.completedAtMs || a.taskId.localeCompare(b.taskId));
  return {model: {...input, ref, tasks, closed, fingerprint: await taskFingerprint(tasks)}, record: confirmation.data()};
}

async function load() {
  const input = selection();
  const {model, record} = await readCutoff(input);
  if (selection().id !== input.id) return;
  current = model;
  render(record, model);
}

async function submit(dispute) {
  if (!current || busy) return;
  const prior = current;
  const reported = field("reportedCount").valueAsNumber;
  const reason = field("reason").value.trim();
  if (dispute && (!Number.isSafeInteger(reported) || reported < 0 || !reason)) {
    message("Enter a whole expected count and a reason.", true);
    return;
  }
  busy = true;
  const controls = [field("confirm"), field("flag"), field("disputeForm").querySelector("button")];
  controls.forEach(control => { control.disabled = true; });
  try {
    const {model, record} = await readCutoff(prior);
    if (current !== prior) return;
    if (model.closed || model.fingerprint !== prior.fingerprint) {
      current = model;
      render(record, model);
      message(model.closed ? "This payroll cutoff has closed." : "The task list changed. Review the updated list before submitting.", true);
      return;
    }
    await runTransaction(db, async transaction => {
      const run = await transaction.get(doc(db, "payrollRuns", model.from + "_" + model.to));
      if (["FINALIZED", "PAID"].includes(run.data()?.status)) throw new Error("This payroll cutoff has closed.");
      const audit = doc(collection(db, "payrollAuditLogs"));
      transaction.set(model.ref, {
        driverId: model.driverId, from: model.from, to: model.to,
        [side]: {status: dispute ? "DISPUTED" : "CONFIRMED", count: dispute ? reported : model.tasks.length,
          fingerprint: model.fingerprint, reason: dispute ? reason : "", updatedAt: serverTimestamp()}
      }, {merge: true});
      transaction.set(audit, {
        action: dispute ? "DRIVER_COUNT_DISPUTED" : "DRIVER_COUNT_CONFIRMED",
        payrollRunId: model.from + "_" + model.to, role: side, createdAt: serverTimestamp(),
        details: {driverId: model.driverId, count: dispute ? reported : model.tasks.length}
      });
    });
    if (current === prior) {
      message(dispute ? "Discrepancy sent for review." : "Task count confirmed.");
      await load();
    }
  } catch (error) {
    if (current === prior) message(error.message, true);
  } finally {
    busy = false;
    if (current === prior) controls.forEach(control => { control.disabled = false; });
    else field("disputeForm").querySelector("button").disabled = false;
  }
}

async function start() {
  const snapshot = await getDocs(collection(db, "payrollEmployees"));
  const assigned = side === "driver" ? (localStorage.getItem("driverId") || parameters.get("driver") || "") : "";
  const values = snapshot.docs.map(record => record.data()).filter(employee =>
    employee.active !== false && employee.driverId?.trim() && (!assigned ||
      employee.driverId.trim().toUpperCase() === assigned.trim().toUpperCase()));
  values.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const employee of values) {
    const id = employee.driverId.trim();
    if (drivers.has(id)) throw new Error("Driver " + id + " is linked to more than one payroll record.");
    drivers.set(id, employee);
    field("driver").add(new Option(employee.name + " (" + id + ")", id));
  }
  if (!drivers.size) message("Link a driver ID to an active payroll employee first.");
  if (assigned && drivers.size === 1) {
    field("driver").value = drivers.keys().next().value;
    field("driver").disabled = true;
  } else if (drivers.has(parameters.get("driver"))) {
    field("driver").value = parameters.get("driver");
  }
  const today = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const month = today.slice(0, 7);
  const firstHalf = Number(today.slice(8)) <= 15;
  field("from").value = parameters.get("from") || (month + (firstHalf ? "-01" : "-16"));
  field("to").value = parameters.get("to") || (firstHalf ? month + "-15" : today);
}

if (side === "driver") {
  field("pageTitle").textContent = "Confirm my completed tasks";
  field("backLink").textContent = "Back to driver app";
  field("backLink").href = "../driver.html";
}

field("cutoffForm").addEventListener("input", () => {
  current = undefined;
  field("result").hidden = true;
  message("");
});
field("cutoffForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = field("cutoffForm").querySelector("button");
  button.disabled = true;
  try {
    message("Loading completed tasks...");
    await load();
    message("");
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
  }
});
field("confirm").addEventListener("click", () => submit(false));
field("flag").addEventListener("click", () => {
  field("disputeForm").hidden = !field("disputeForm").hidden;
  if (!field("disputeForm").hidden) field("reportedCount").focus();
});
field("disputeForm").addEventListener("submit", event => {
  event.preventDefault();
  submit(true);
});
start().catch(error => message(error.message, true));
