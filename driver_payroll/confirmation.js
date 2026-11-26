import { listPeriodDrivers, readConfirmation, updateConfirmation } from "./local-confirmations.js?v=3";

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
let selectedDay = "";

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

function selectedCutoff() {
  return payrollCutoff(field("periodMonth").value, field("periodHalf").value);
}

async function loadDriverRoster() {
  const {from, to} = selectedCutoff();
  const rows = await listPeriodDrivers(from, to);
  const latest = selectedCutoff();
  if (from !== latest.from || to !== latest.to) return;
  field("driverRoster").hidden = false;
  field("rosterPeriod").textContent = from + " to " + to;
  const list = field("rosterList");
  list.replaceChildren();
  rows.sort((a, b) => a.driverId.localeCompare(b.driverId, undefined, {numeric: true}));
  for (const driver of rows) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(current?.driverId === driver.driverId));
    const id = document.createElement("strong");
    id.textContent = driver.driverId;
    const details = document.createElement("span");
    details.textContent = driver.count + " completed tasks";
    const status = document.createElement("span");
    status.textContent = driver.openDiscrepancies
      ? driver.openDiscrepancies + (driver.openDiscrepancies === 1 ? " open discrepancy" : " open discrepancies")
      : driver.adminStatus === "CONFIRMED" ? "Sent to Payroll" :
        driver.driverStatus === "CONFIRMED" ? "Ready for task admin" : "Waiting for driver";
    status.className = driver.openDiscrepancies ? "roster-disputed" : "";
    button.append(id, details, status);
    button.addEventListener("click", async () => {
      field("driver").value = driver.driverId;
      try {
        await load();
        if (current?.driverId !== driver.driverId) return;
        for (const entry of list.querySelectorAll("button")) entry.setAttribute("aria-pressed", String(entry === button));
        message("");
      } catch (error) {
        message(error.message, true);
      }
    });
    item.append(button);
    list.append(item);
  }
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No drivers have recorded tasks in this period.";
    list.append(empty);
  }
}

function selection() {
  const driverId = field("driver").value.trim().toUpperCase();
  if (!driverId) throw new Error("Enter a Driver ID.");
  const {from, to} = selectedCutoff();
  return {driverId, from, to, id: JSON.stringify([driverId, from, to])};
}

function openDayDisputes(record) {
  return Object.values(record?.dayDisputes || {}).filter(dispute => !dispute.resolvedAt);
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
    const status = field(role + "Status");
    const reported = openDayDisputes(record).some(dispute => dispute.stage === role) || entry?.status === "DISPUTED";
    status.closest(".summary-card").classList.toggle("has-discrepancy", reported);
    status.textContent = reported ? "Discrepancy" : entry?.status === "CONFIRMED"
      ? "Confirmed · " + entry.count : entry?.status === "DISPUTED" ? "Discrepancy" : "Pending";
  }
  const open = openDayDisputes(record).length;
  const waiting = confirmationStages.find(role => record?.[role]?.status !== "CONFIRMED");
  field("reviewStatus").textContent = open ? open + (open === 1 ? " date has an open discrepancy" : " dates have open discrepancies") :
    waiting ? "Waiting for " + labels[waiting] + " confirmation" : "Manual count approved by payroll";
  field("confirm").disabled = open > 0 || !earlierStagesMatch(record) || record?.[stage]?.status === "CONFIRMED"
    || (stage === "driver" && (!tasks.length || tasks.some(task => !task.confirmed)));
  const history = field("confirmationHistory");
  history.replaceChildren();
  for (const event of (record?.history || []).slice().reverse()) {
    const item = document.createElement("li");
    const date = new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"
    }).format(new Date(event.time));
    item.textContent = labels[event.stage] + (event.resolved ? " resolved a discrepancy" : event.dispute ? " reported a discrepancy" : " confirmed") +
      (event.date ? " for " + event.date : "") + " | " + event.count + " tasks | " + date;
    history.append(item);
  }
  field("confirmationHistoryPanel").hidden = !history.childElementCount;
}

function calendarDays(from, to) {
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  const days = Array(new Date(start).getUTCDay()).fill("");
  for (let time = start; time <= end; time += 86400000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

function renderCalendar(tasks, model) {
  const dates = new Map();
  for (const task of tasks) {
    const counts = dates.get(task.date) || {completed: 0, confirmed: 0};
    counts.completed++;
    if (task.confirmed) counts.confirmed++;
    dates.set(task.date, counts);
  }
  const grid = field("taskCalendar");
  grid.replaceChildren();
  for (const date of calendarDays(model.from, model.to)) {
    if (!date) {
      const blank = document.createElement("span");
      blank.setAttribute("aria-hidden", "true");
      grid.append(blank);
      continue;
    }
    const {completed, confirmed} = dates.get(date) || {completed: 0, confirmed: 0};
    const day = document.createElement("button");
    day.type = "button";
    const dispute = model.record?.dayDisputes?.[date];
    const disputed = Boolean(dispute && !dispute.resolvedAt);
    const dayConfirmed = !disputed && completed > 0 && completed === confirmed;
    day.className = "task-calendar-day";
    day.classList.toggle("is-confirmed", dayConfirmed);
    day.classList.toggle("is-disputed", disputed);
    day.dataset.date = date;
    day.setAttribute("aria-pressed", String(selectedDay === date));
    day.setAttribute("aria-label", date + ", " + completed + " completed, " + confirmed + " confirmed" + (disputed ? ", open discrepancy" : ""));
    const number = document.createElement("strong");
    number.textContent = Number(date.slice(-2));
    const count = document.createElement("span");
    count.textContent = completed;
    count.className = "task-day-total";
    day.append(number, count);
    if (dayConfirmed || disputed) {
      const check = document.createElement("span");
      check.className = "task-day-check";
      check.textContent = disputed ? "!" : "\u2713";
      check.setAttribute("aria-hidden", "true");
      day.append(check);
    }
    day.addEventListener("click", () => {
      selectedDay = date;
      renderTasks(tasks, model);
      grid.querySelector('[data-date="' + date + '"]')?.focus();
    });
    grid.append(day);
  }
}

function renderTasks(tasks, model) {
  const {from, to} = model;
  renderCalendar(tasks, model);
  const form = field("sampleTaskForm");
  form.hidden = stage !== "driver";
  const date = field("sampleTaskDate");
  date.min = from;
  date.max = to;
  if (selectedDay) date.value = selectedDay;
  else if (!date.value || date.value < from || date.value > to) date.value = today >= from && today <= to ? today : from;
  renderDayConfirmation(model);
}

function renderDayConfirmation(model) {
  const tasks = model.tasksByDate.get(selectedDay) || [];
  const total = tasks.length;
  const dispute = model.record?.dayDisputes?.[selectedDay];
  const open = Boolean(dispute && !dispute.resolvedAt);
  const dayConfirmed = !open && total > 0 && tasks.every(task => task.confirmed);
  field("dayConfirmation").hidden = !selectedDay;
  field("selectedDaySummary").textContent = selectedDay + ": " + total + " completed " + (total === 1 ? "task" : "tasks");
  field("confirmDay").hidden = stage !== "driver" || !total;
  field("confirmDay").disabled = dayConfirmed || open;
  field("confirmDay").textContent = dayConfirmed ? "Day confirmed" : "Confirm day";
  field("flag").hidden = open;
  field("flag").disabled = !earlierStagesMatch(model.record);
  field("resolveDiscrepancy").hidden = !open || dispute.stage !== stage;
  field("reviewNote").hidden = !open;
  field("reviewNote").textContent = open ? labels[dispute.stage] + " reported a discrepancy for " +
    selectedDay + ". Expected " + dispute.count + " tasks: " + dispute.reason : "";
  field("disputeForm").hidden = true;
  field("disputeForm").reset();
}

async function changeTasks(update) {
  if (stage !== "driver" || !current || busy) return;
  const model = current;
  busy = true;
  try {
    const record = await updateConfirmation(model.id, saved => ({
      ...saved, driverId: model.driverId, from: model.from, to: model.to,
      tasks: update(saved?.tasks || [], saved), driver: null, admin: null, payroll: null
    }));
    if (current === model) {
      setRecord(model, record);
    }
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
  if (!current || current.id !== input.id) {
    const dates = (record?.tasks || []).map(task => task.date);
    const latest = dates.reduce((max, date) => date > max ? date : max, input.from);
    selectedDay = dates.includes(today) || (!dates.length && today >= input.from && today <= input.to) ? today : latest;
  }
  setRecord(input, record);
}

function setRecord(input, record) {
  const tasksByDate = new Map();
  for (const task of record?.tasks || []) {
    if (!tasksByDate.has(task.date)) tasksByDate.set(task.date, []);
    tasksByDate.get(task.date).push(task);
  }
  current = {...input, record, tasksByDate};
  render(record, current);
}

async function saveAction(update, success) {
  if (!current || busy) return;
  const model = current;
  busy = true;
  try {
    const record = await updateConfirmation(model.id, saved => update(saved, model));
    if (current === model) {
      setRecord(model, record);
      message(success);
      if (stage === "admin") await loadDriverRoster();
    }
  } catch (error) {
    if (current === model) {
      await load().catch(() => {});
      message(error.message, true);
    }
  } finally {
    busy = false;
  }
}

function submitConfirmation() {
  saveAction((saved, model) => {
    if (openDayDisputes(saved).length) throw new Error("Resolve the open discrepancies before sending this cutoff.");
    const tasks = saved?.tasks || [];
    const count = tasks.length;
    if (!count || tasks.some(task => !task.confirmed)) {
      throw new Error("Confirm each day with completed tasks before sending the period.");
    }
    if (!earlierStagesMatch(saved) || (stage !== "driver" && saved?.driver?.updatedAt !== model.record?.driver?.updatedAt)) {
      throw new Error("The reported count or approval changed. Open the cutoff again.");
    }
    if (saved?.[stage]?.status === "CONFIRMED" && saved[stage].count === count) return saved;
    const reset = Object.fromEntries(confirmationStages.slice(index + 1).map(role => [role, null]));
    const time = new Date().toISOString();
    return {...saved, ...reset, [stage]: {status: "CONFIRMED", count, updatedAt: time},
      history: [...(saved?.history || []), {stage, count, time}]};
  }, "Confirmation saved.");
}

function reportDayDiscrepancy() {
  const date = selectedDay;
  const count = field("reportedCount").valueAsNumber;
  const reason = field("reason").value.trim();
  if (!date || !Number.isSafeInteger(count) || count < 0 || !reason) {
    message("Select a date and enter a whole expected count and a reason.", true);
    return;
  }
  saveAction((saved, model) => {
    if (!earlierStagesMatch(saved)) throw new Error("Earlier stages must confirm this list before reporting.");
    const prior = saved?.dayDisputes?.[date];
    if (prior && !prior.resolvedAt) throw new Error("This date already has an open discrepancy.");
    const time = new Date().toISOString();
    return {
      ...saved, driverId: model.driverId, from: model.from, to: model.to,
      driver: null, admin: null, payroll: null,
      tasks: (saved?.tasks || []).map(task => task.date === date ? {...task, confirmed: false} : task),
      dayDisputes: {...saved?.dayDisputes, [date]: {stage, date, count, reason, time}},
      history: [...(saved?.history || []), {stage, date, dispute: true, count, time}]
    };
  }, "Discrepancy recorded for " + date + ". The cutoff is on hold.");
}

function resolveDayDiscrepancy() {
  const date = selectedDay;
  if (!date) return;
  saveAction(saved => {
    const dispute = saved?.dayDisputes?.[date];
    if (!dispute || dispute.resolvedAt || dispute.stage !== stage) {
      throw new Error("The reviewer who reported this discrepancy must resolve it.");
    }
    const time = new Date().toISOString();
    return {...saved, dayDisputes: {...saved.dayDisputes, [date]: {...dispute, resolvedAt: time}},
      history: [...(saved.history || []), {stage, date, resolved: true, count: dispute.count, time}]};
  }, "Discrepancy resolved. The driver can confirm the day again.");
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
if (stage === "admin") {
  field("driverField").hidden = true;
  field("driver").required = false;
  field("cutoffForm").querySelector("button").textContent = "Show drivers";
}
const today = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
const requestedFrom = parameters.get("from");
const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom || "") ? requestedFrom : today;
field("periodMonth").value = defaultDate.slice(0, 7);
field("periodHalf").value = Number(defaultDate.slice(8)) <= 15 ? "first" : "second";
field("cutoffForm").addEventListener("input", () => {
  current = undefined;
  selectedDay = "";
  field("result").hidden = true;
  field("driverRoster").hidden = true;
  message("");
});
field("cutoffForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = field("cutoffForm").querySelector("button");
  button.disabled = true;
  try {
    if (stage === "admin") {
      current = undefined;
      selectedDay = "";
      field("result").hidden = true;
      field("driver").value = "";
      await loadDriverRoster();
    } else {
      await load();
    }
    message("");
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
  }
});
field("confirmDay").addEventListener("click", async () => {
  if (!current || !selectedDay || busy) return;
  const date = selectedDay;
  const reviewed = current.tasksByDate.get(date) || [];
  if (!reviewed.length) return;
  const ids = new Set(reviewed.map(task => task.id));
  await changeTasks((tasks, saved) => {
    const dispute = saved?.dayDisputes?.[date];
    if (dispute && !dispute.resolvedAt) throw new Error("Resolve this day's discrepancy before confirming.");
    const actual = tasks.filter(task => task.date === date);
    if (actual.length !== ids.size || actual.some(task => !ids.has(task.id))) {
      throw new Error("This day's task list changed. Review the updated count and confirm again.");
    }
    return tasks.map(task => task.date === date ? {...task, confirmed: true} : task);
  });
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
    return [...tasks.map(task => task.date === date ? {...task, confirmed: false} : task),
      {id, date, confirmed: false}];
  });
});
field("confirm").addEventListener("click", submitConfirmation);
field("resolveDiscrepancy").addEventListener("click", resolveDayDiscrepancy);
field("flag").addEventListener("click", () => {
  field("disputeForm").hidden = !field("disputeForm").hidden;
  if (!field("disputeForm").hidden) field("reportedCount").focus();
});
field("disputeForm").addEventListener("submit", event => {
  event.preventDefault();
  reportDayDiscrepancy();
});

if (stage === "admin") loadDriverRoster().catch(error => message(error.message, true));
