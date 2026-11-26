import { readConfirmation, updateConfirmation } from "./local-confirmations.js";

const confirmationStages = ["driver", "admin", "payroll"];
const field = id => document.getElementById(id);
const parameters = new URLSearchParams(location.search);
const requestedStage = parameters.get("view");
const stage = confirmationStages.includes(requestedStage) ? requestedStage : "admin";
const index = confirmationStages.indexOf(stage);
const labels = {driver: "Driver", admin: "Task admin", payroll: "Payroll"};
const pageTitles = {driver: "Report my completed tasks", admin: "Task Admin to Payroll", payroll: "Payroll confirmation"};
const buttonLabels = {driver: "Send count to task admin", admin: "Verify and send to payroll", payroll: "Approve reported count"};
let current;
let busy = false;

function message(text, error = false) {
  const feedback = field("feedback");
  feedback.hidden = !text;
  feedback.className = "message" + (error ? " error" : "");
  feedback.textContent = text;
}

function selection() {
  const driverId = field("driver").value.trim().toUpperCase();
  const from = field("from").value;
  const to = field("to").value;
  if (!driverId || !from || !to || from > to) throw new Error("Enter a driver ID and a valid cutoff.");
  return {driverId, from, to, id: JSON.stringify([driverId, from, to])};
}

function earlierStagesMatch(record) {
  const count = record?.driver?.count;
  return confirmationStages.slice(0, index).every(role =>
    record?.[role]?.status === "CONFIRMED" && record[role].count === count);
}

function render(record, model) {
  field("result").hidden = false;
  field("taskCount").textContent = record?.driver?.count ?? "Pending";
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
  field("manualCountField").hidden = stage !== "driver";
  field("manualCount").value = record?.driver?.count ?? "";
  field("confirm").disabled = !earlierStagesMatch(record) ||
    (stage !== "driver" && record?.[stage]?.status === "CONFIRMED");
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
    ? field("manualCount").valueAsNumber : model.record?.driver?.count;
  if (!Number.isSafeInteger(count) || count < 0 || (dispute && !reason)) {
    message(dispute ? "Enter a whole expected count and a reason." : "Enter a whole count of zero or more.", true);
    return;
  }
  busy = true;
  const buttons = [field("confirm"), field("flag"), field("disputeForm").querySelector("button")];
  buttons.forEach(button => { button.disabled = true; });
  try {
    await updateConfirmation(model.id, saved => {
      if (!earlierStagesMatch(saved) || (stage !== "driver" && saved?.driver?.count !== model.record?.driver?.count)) {
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
      message(dispute ? "Discrepancy recorded." : "Manual count saved.");
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
const month = today.slice(0, 7);
const firstHalf = Number(today.slice(8)) <= 15;
field("from").value = parameters.get("from") || (month + (firstHalf ? "-01" : "-16"));
field("to").value = parameters.get("to") || (firstHalf ? month + "-15" : today);
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
field("confirm").addEventListener("click", () => submit(false));
field("flag").addEventListener("click", () => {
  field("disputeForm").hidden = !field("disputeForm").hidden;
  if (!field("disputeForm").hidden) field("reportedCount").focus();
});
field("disputeForm").addEventListener("submit", event => {
  event.preventDefault();
  submit(true);
});
