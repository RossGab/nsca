import { readConfirmation, updateConfirmation } from "./local-confirmations.js";

const confirmationStages = ["driver", "admin", "payroll"];
const field = id => document.getElementById(id);
const parameters = new URLSearchParams(location.search);
const requestedStage = parameters.get("view");
const stage = confirmationStages.includes(requestedStage) ? requestedStage : "admin";
const index = confirmationStages.indexOf(stage);
const labels = {driver: "Driver", admin: "Task admin", payroll: "Payroll"};
const pageTitles = {driver: "Report my completed tasks", admin: "Task Admin to Payroll", payroll: "Payroll confirmation"};
const buttonLabels = {driver: "Send confirmed tasks to task admin", admin: "Verify and send to payroll", payroll: "Approve reported count"};
let current;
let busy = false;

function message(text, error = false) {
  const feedback = field("feedback");
  feedback.hidden = !text;
  feedback.className = "message" + (error ? " error" : "");
  feedback.textContent = text;
}

function payrollCutoff(month, half) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["first", "second"].includes(half)) {
    throw new Error("Choose a payroll month and period.");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const first = half === "first";
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {from: month + (first ? "-01" : "-16"), to: month + "-" + (first ? "15" : lastDay)};
}

function selection() {
  const driverId = field("driver").value.trim().toUpperCase();
  if (!driverId) throw new Error("Enter a Driver ID.");
  const {from, to} = payrollCutoff(field("periodMonth").value, field("periodHalf").value);
  return {driverId, from, to, id: JSON.stringify([driverId, from, to])};
}

function earlierStagesMatch(record) {
  if (index === 0) return true;
  const tasks = record?.tasks || [];
  const count = tasks.length;
  return count > 0 && tasks.every(task => task.confirmed) && confirmationStages.slice(0, index).every(role =>
    record?.[role]?.status === "CONFIRMED" && record[role].count === count);
}

function render(record, model) {
  field("result").hidden = false;
  const tasks = record?.tasks || [];
  field("taskCount").textContent = tasks.length;
  renderTasks(tasks, model);
  field("cutoffLabel").textContent = model.driverId + " · " + model.from + " to " + model.to;
  for (const role of confirmationStages) {
    const entry = record?.[role];
    field(role + "Status").textContent = entry?.status === "CONFIRMED"
      ? "Confirmed · " + entry.count : entry?.status === "DISPUTED" ? "Discrepancy" : "Pending";
  }
  const dispute = confirmationStages.find(role => record?.[role]?.status === "DISPUTED");
  const waiting = confirmationStages.find(role => record?.[role]?.status !== "CONFIRMED");
  field("reviewStatus").textContent = dispute ? labels[dispute] + " reported a discrepancy" :
    waiting ? "Waiting for " + labels[waiting] + " confirmation" : "Manual count approved by payroll";
  field("reviewNote").hidden = !dispute;
  field("reviewNote").textContent = dispute
    ? "Expected " + record[dispute].count + " tasks: " + record[dispute].reason : "";
  field("confirm").disabled = !earlierStagesMatch(record) || record?.[stage]?.status === "CONFIRMED"
    || (stage === "driver" && (!tasks.length || tasks.some(task => !task.confirmed)));
  field("flag").disabled = !earlierStagesMatch(record);
  field("disputeForm").hidden = true;
  field("disputeForm").reset();
  const history = field("confirmationHistory");
  history.replaceChildren();
  for (const event of (record?.history || []).slice().reverse()) {
    const item = document.createElement("li");
    const date = new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"
    }).format(new Date(event.time));
    item.textContent = labels[event.stage] + (event.dispute ? " reported a discrepancy" : " confirmed") +
      " ? " + event.count + " tasks ? " + date;
    history.append(item);
  }
  field("confirmationHistoryPanel").hidden = !history.childElementCount;
}

function renderTasks(tasks, {from, to}) {
  const form = field("sampleTaskForm");
  form.hidden = stage !== "driver";
  const date = field("sampleTaskDate");
  date.min = from;
  date.max = to;
  if (!date.value || date.value < from || date.value > to) date.value = today >= from && today <= to ? today : from;
  const table = field("completedTasks");
  table.replaceChildren();
  const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const task of sorted) {
    const row = table.insertRow();
    row.insertCell().textContent = task.id;
    row.insertCell().textContent = task.date;
    const cell = row.insertCell();
    if (stage === "driver") {
      const label = document.createElement("label");
      label.className = "check-field";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = task.confirmed;
      box.setAttribute("aria-label", "Confirm task " + task.id);
      box.addEventListener("change", () => {
        if (busy) {
          box.checked = task.confirmed;
          return;
        }
        changeTasks(tasks => tasks.map(entry =>
          entry.id === task.id ? {...entry, confirmed: box.checked} : entry));
      });
      label.append(box, task.confirmed ? "Confirmed" : "Confirm task");
      cell.append(label);
    } else {
      cell.textContent = task.confirmed ? "Confirmed" : "Pending";
    }
  }
  if (!sorted.length) {
    const cell = table.insertRow().insertCell();
    cell.colSpan = 3;
    cell.className = "empty";
    cell.textContent = "No completed tasks recorded for this period.";
  }
}

async function changeTasks(update) {
  if (stage !== "driver" || !current || busy) return;
  const model = current;
  busy = true;
  try {
    await updateConfirmation(model.id, saved => ({
      ...saved, driverId: model.driverId, from: model.from, to: model.to,
      tasks: update(saved?.tasks || []), driver: null, admin: null, payroll: null
    }));
    if (current === model) await load();
    if (current?.id === model.id) message("");
  } catch (error) {
    if (current === model) {
      await load().catch(() => {});
      message(error.message, true);
    }
  } finally {
    busy = false;
  }
}

async function load() {
  const input = selection();
  const record = await readConfirmation(input.id);
  if (selection().id !== input.id) return;
  current = {...input, record};
  render(current.record, current);
}

async function submit(dispute) {
  if (!current || busy) return;
  const model = current;
  const reason = field("reason").value.trim();
  const count = dispute ? field("reportedCount").valueAsNumber : stage === "driver"
    ? model.record?.tasks?.length : model.record?.driver?.count;
  if (!Number.isSafeInteger(count) || count < 0 || (dispute && !reason)) {
    message(dispute ? "Enter a whole expected count and a reason." : "Enter a whole count of zero or more.", true);
    return;
  }
  busy = true;
  const buttons = [field("confirm"), field("flag"), field("disputeForm").querySelector("button")];
  buttons.forEach(button => { button.disabled = true; });
  try {
    await updateConfirmation(model.id, saved => {
      if (stage === "driver" && !dispute && (!saved?.tasks?.length || saved.tasks.length !== count
          || saved.tasks.some(task => !task.confirmed))) {
        throw new Error("Confirm each completed task before sending the list.");
      }
      if (!earlierStagesMatch(saved) || (stage !== "driver" && saved?.driver?.updatedAt !== model.record?.driver?.updatedAt)) {
        throw new Error("The reported count or approval changed. Open the cutoff again.");
      }
      if (!dispute && saved?.[stage]?.status === "CONFIRMED" && saved[stage].count === count) return saved;
      const reset = Object.fromEntries(confirmationStages.slice(index + 1).map(role => [role, null]));
      const time = new Date().toISOString();
      return {
        ...saved, driverId: model.driverId, from: model.from, to: model.to, ...reset,
        [stage]: {status: dispute ? "DISPUTED" : "CONFIRMED", count, reason: dispute ? reason : "", updatedAt: time},
        history: [...(saved?.history || []), {stage, dispute, count, time}]
      };
    });
    if (current === model) {
      await load();
      message(dispute ? "Discrepancy recorded." : "Confirmation saved.");
    }
  } catch (error) {
    if (current === model) message(error.message, true);
  } finally {
    busy = false;
    if (current === model) {
      field("confirm").disabled = false;
      field("flag").disabled = false;
    }
    field("disputeForm").querySelector("button").disabled = false;
  }
}

field("pageTitle").textContent = pageTitles[stage];
field("confirm").textContent = buttonLabels[stage];
if (stage === "driver") {
  field("driver").value = localStorage.getItem("driverId") || "";
  field("backLink").href = "../driver.html";
  field("backLink").textContent = "Back to driver app";
} else if (stage === "payroll") {
  field("backLink").href = "../pr/index.html";
  field("backLink").textContent = "Back to payroll";
}
if (parameters.has("driver")) field("driver").value = parameters.get("driver");
const today = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
const requestedFrom = parameters.get("from");
const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom || "") ? requestedFrom : today;
field("periodMonth").value = defaultDate.slice(0, 7);
field("periodHalf").value = Number(defaultDate.slice(8)) <= 15 ? "first" : "second";
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
    await load();
    message("");
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
  }
});
field("sampleTaskForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!current) return;
  const id = field("sampleTaskId").value.trim();
  const date = field("sampleTaskDate").value;
  if (!id || date < current.from || date > current.to) {
    message("Enter a task ID and a completion date within the cutoff.", true);
    return;
  }
  await changeTasks(tasks => {
    if (tasks.some(task => task.id.toUpperCase() === id.toUpperCase())) {
      throw new Error("That task ID is already recorded for this cutoff.");
    }
    return [...tasks, {id, date, confirmed: false}];
  });
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
