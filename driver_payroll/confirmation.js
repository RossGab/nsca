import {initializeApp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {collection, doc, getDoc, getDocs, initializeFirestore, runTransaction, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {confirmationId, confirmationStages, eligibleDriverTasks, payrollConfirmationMatches, priorStagesMatch, stageMatches, taskFingerprint} from "../pr/driver-confirmations.js?v=3";

const db = initializeFirestore(initializeApp({projectId: "driva-pwa", appId: "1:299138219722:web:623ff6b0a067ea822dfe33"}), {}, "drver-task");
const field = id => document.getElementById(id);
const parameters = new URLSearchParams(location.search);
const requestedStage = parameters.get("view");
const stage = confirmationStages.includes(requestedStage) ? requestedStage : "admin";
const stageLabels = {driver: "Driver", admin: "Task admin", payroll: "Payroll"};
const pageTitles = {driver: "Confirm my completed tasks", admin: "Task Admin to Payroll", payroll: "Payroll confirmation"};
const buttonLabels = {driver: "Confirm and send to task admin", admin: "Verify and send to payroll", payroll: "Approve for the pay run"};
const money = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
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
  for (const role of confirmationStages) {
    field(role + "Status").textContent = status(record?.[role], fingerprint);
  }
  const ready = payrollConfirmationMatches(record, fingerprint, tasks.length);
  const stageReady = priorStagesMatch(record, stage, fingerprint, tasks.length);
  const dispute = confirmationStages.find(role => record?.[role]?.status === "DISPUTED");
  const waiting = confirmationStages.find(role => !stageMatches(record, role, fingerprint, tasks.length));
  field("reviewStatus").textContent = closed ? "Payroll cutoff closed" : ready ? "Approved for payroll" :
    dispute ? stageLabels[dispute] + " reported a discrepancy" : "Waiting for " + stageLabels[waiting] + " confirmation";
  const note = field("reviewNote");
  note.hidden = !dispute;
  note.textContent = dispute ? "Expected " + record[dispute].count + " tasks: " + record[dispute].reason : "";
  const draft = field("draftEarnings");
  draft.hidden = stage !== "payroll";
  draft.textContent = model.draftMatches
    ? "Additional driver earnings in the saved payroll run: " + money.format(model.driverEarnings)
    : "Save or refresh a payroll draft with this task list before approving.";
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
  field("confirm").disabled = closed || !stageReady || (stage === "payroll" && !model.draftMatches)
    || stageMatches(record, stage, fingerprint, tasks.length);
  field("flag").disabled = closed || !stageReady;
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
  const fingerprint = await taskFingerprint(tasks);
  const row = payroll?.rows?.find(entry => entry.driverTasks?.some(task => task.driverId === input.driverId));
  const draftMatches = Boolean(row && (payroll.status === "DRAFT" || closed)
    && fingerprint === await taskFingerprint(row.driverTasks));
  return {model: {...input, ref, tasks, closed, fingerprint, draftMatches, driverEarnings: row?.driverEarnings || 0},
    record: confirmation.data()};
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
      const [run, saved] = await Promise.all([
        transaction.get(doc(db, "payrollRuns", model.from + "_" + model.to)),
        transaction.get(model.ref)
      ]);
      const payroll = run.data();
      if (["FINALIZED", "PAID"].includes(payroll?.status)) throw new Error("This payroll cutoff has closed.");
      if (!dispute && stageMatches(saved.data(), stage, model.fingerprint, model.tasks.length)) return;
      if (!priorStagesMatch(saved.data(), stage, model.fingerprint, model.tasks.length)) {
        throw new Error("Earlier stages must confirm the current task list first.");
      }
      if (stage === "payroll" && !dispute) {
        const row = payroll?.rows?.find(entry => entry.driverTasks?.some(task => task.driverId === model.driverId));
        if (payroll?.status !== "DRAFT" || !row || await taskFingerprint(row.driverTasks) !== model.fingerprint) {
          throw new Error("Save or refresh the matching payroll draft first.");
        }
      }
      const audit = doc(collection(db, "payrollAuditLogs"));
      const updates = Object.fromEntries(confirmationStages.slice(confirmationStages.indexOf(stage) + 1)
        .map(role => [role, null]));
      transaction.set(model.ref, {
        driverId: model.driverId, from: model.from, to: model.to, ...updates,
        [stage]: {status: dispute ? "DISPUTED" : "CONFIRMED", count: dispute ? reported : model.tasks.length,
          fingerprint: model.fingerprint, reason: dispute ? reason : "", updatedAt: serverTimestamp()}
      }, {merge: true});
      transaction.set(audit, {
        action: dispute ? "DRIVER_COUNT_DISPUTED" : "DRIVER_COUNT_CONFIRMED",
        payrollRunId: model.from + "_" + model.to, role: stage === "admin" ? "TASK_ADMIN" : stage.toUpperCase(), createdAt: serverTimestamp(),
        details: {driverId: model.driverId, count: dispute ? reported : model.tasks.length}
      });
    });
    if (current === prior) {
      message(dispute ? "Discrepancy sent for review." : ({driver: "Sent to task admin.", admin: "Sent to payroll.", payroll: "Approved for the pay run."})[stage]);
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
  const assigned = stage === "driver" ? (localStorage.getItem("driverId") || "").trim() : "";
  if (stage === "driver" && !assigned) {
    field("cutoffForm").hidden = true;
    message("Set your Driver ID in the driver app to continue.", true);
    return;
  }
  const [registry, payroll] = await Promise.allSettled([
    getDocs(collection(db, "drivers")),
    getDocs(collection(db, "payrollEmployees"))
  ]);
  if (registry.status === "rejected") throw registry.reason;
  const startDates = new Map();
  if (payroll.status === "fulfilled") {
    for (const record of payroll.value.docs) {
      const employee = record.data();
      if (employee.active !== false && employee.driverId?.trim()) {
        startDates.set(employee.driverId.trim(), employee.startDate);
      }
    }
  }
  const values = registry.value.docs.map(record => {
    const driver = record.data();
    const id = String(driver.driverCode || record.id).trim();
    return {id, name: driver.name || driver.AGENTNAME || driver.agentName || id, startDate: startDates.get(id)};
  }).filter(driver => driver.id && (!assigned || driver.id.toUpperCase() === assigned.toUpperCase()));
  values.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const driver of values) {
    if (drivers.has(driver.id)) continue;
    drivers.set(driver.id, driver);
    field("driver").add(new Option(driver.name + " (" + driver.id + ")", driver.id));
  }
  if (!drivers.size) message("No drivers found. Add a driver from the task admin dashboard.");
  if (assigned && drivers.size) {
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
field("pageTitle").textContent = pageTitles[stage];
field("confirm").textContent = buttonLabels[stage];
if (stage === "driver") {
  field("backLink").href = "../driver.html";
  field("backLink").textContent = "Back to driver app";
} else if (stage === "payroll") {
  field("backLink").href = "../pr/index.html";
  field("backLink").textContent = "Back to payroll";
}
start().catch(error => message(error.message, true));
