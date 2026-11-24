import {initializeApp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {addDoc, collection, doc, getDocs, initializeFirestore, runTransaction, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = initializeApp({projectId: "driva-pwa", appId: "1:299138219722:web:623ff6b0a067ea822dfe33"});
const db = initializeFirestore(app, {}, "drver-task");
const byId = id => document.getElementById(id);
const form = byId("leaveForm");
const filter = byId("leaveFilter");
const tbody = byId("leaveRows");
const message = byId("leaveMessage");
const portalEmployee = new URLSearchParams(location.search).get("employee");
const types = {VACATION_LEAVE: "Vacation leave", SICK_LEAVE: "Sick leave"};
let employees = new Map();
let requests = [];

function status(text, error = false) {
  message.hidden = !text;
  message.className = "message " + (error ? "error" : "success");
  message.textContent = text;
}

function leaveDates(from, to) {
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  const day = 86400000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start >= 60 * day) {
    throw new Error("Choose a valid date range of up to 60 days.");
  }
  return Array.from({length: (end - start) / day + 1}, (_, index) =>
    new Date(start + index * day).toISOString().slice(0, 10));
}

function showView() {
  const submitting = Boolean(portalEmployee) || location.hash === "#request";
  byId("leaveRequest").hidden = !submitting;
  byId("leaveInbox").hidden = submitting;
  byId(submitting ? "leaveRequestLink" : "leaveInboxLink").setAttribute("aria-current", "page");
  byId(submitting ? "leaveInboxLink" : "leaveRequestLink").removeAttribute("aria-current");
}

function action(label, decision, requestId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-btn";
  button.textContent = label;
  button.dataset.decision = decision;
  button.dataset.requestId = requestId;
  return button;
}

function renderRequests() {
  tbody.replaceChildren();
  const visible = requests.filter(request => !filter.value || request.status === filter.value);
  for (const request of visible) {
    const row = tbody.insertRow();
    const employee = employees.get(request.employeeId?.toUpperCase());
    const state = request.status === "APPROVED" ? (request.paid === false ? "Approved · unpaid" : "Approved · paid") : request.status;
    for (const value of [employee?.name || request.employeeId, request.from + " to " + request.to,
      types[request.type] || request.type, request.reason || "—", state]) {
      row.insertCell().textContent = value;
    }
    const cell = row.insertCell();
    if (request.status === "PENDING") {
      const controls = document.createElement("div");
      controls.className = "leave-decisions";
      controls.append(action("Approve paid", "paid", request.id), action("Approve unpaid", "unpaid", request.id),
        action("Reject", "reject", request.id));
      cell.append(controls);
    }
  }
  if (!visible.length) {
    const cell = tbody.insertRow().insertCell();
    cell.colSpan = 6;
    cell.className = "empty";
    cell.textContent = "No requests match this status.";
  }
}

async function refreshRequests() {
  const snapshot = await getDocs(collection(db, "payrollLeaves"));
  requests = snapshot.docs.map(record => ({...record.data(), id: record.id}));
  requests.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  renderRequests();
}

async function start() {
  const snapshot = await getDocs(collection(db, "payrollEmployees"));
  const values = snapshot.docs.map(record => ({employeeId: record.id, ...record.data()}));
  values.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  employees = new Map(values.map(employee => [employee.employeeId.toUpperCase(), employee]));
  for (const employee of values) {
    if (employee.active === false) continue;
    byId("leaveEmployee").add(new Option(employee.name + " (" + employee.employeeId + ")", employee.employeeId));
  }
  if (portalEmployee) {
    const employee = employees.get(portalEmployee.toUpperCase());
    if (!employee || employee.active === false) throw new Error("This employee cannot submit a leave request.");
    const employeeSelect = byId("leaveEmployee");
    employeeSelect.value = employee.employeeId;
    employeeSelect.disabled = true;
    return;
  }
  await refreshRequests();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const employeeId = byId("leaveEmployee").value;
  const employee = employees.get(employeeId.toUpperCase());
  const type = byId("leaveType").value;
  const from = byId("leaveFrom").value;
  const to = byId("leaveTo").value;
  submit.disabled = true;
  try {
    leaveDates(from, to);
    if (!employee || employee.active === false || !types[type]) throw new Error("Select an active employee and leave type.");
    if (employee.startDate && from < employee.startDate) throw new Error("Leave cannot begin before the hire date.");
    await addDoc(collection(db, "payrollLeaves"), {
      employeeId, type, from, to, reason: byId("leaveReason").value.trim(), status: "PENDING",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    if (portalEmployee) {
      const portal = new URL("./employee-portal.html#leave", location.href);
      portal.searchParams.set("employee", employeeId);
      location.href = portal;
      return;
    }
    form.reset();
    filter.value = "PENDING";
    location.hash = "approvals";
    status("Leave request submitted.");
    await refreshRequests();
  } catch (error) {
    status(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

async function review(requestId, decision) {
  const ref = doc(db, "payrollLeaves", requestId);
  const audit = doc(collection(db, "payrollAuditLogs"));
  const nextStatus = decision === "reject" ? "REJECTED" : "APPROVED";
  await runTransaction(db, async transaction => {
    const request = (await transaction.get(ref)).data();
    if (request?.status !== "PENDING") throw new Error("This request has already been reviewed. Reload the inbox.");
    if (nextStatus === "APPROVED") {
      const dates = leaveDates(request.from, request.to);
      const key = encodeURIComponent(request.employeeId.toUpperCase());
      const dayRefs = dates.map(date => doc(db, "payrollLeaveDayClaims", key + "_" + date));
      const claims = await Promise.all(dayRefs.map(dayRef => transaction.get(dayRef)));
      if (claims.some(claim => claim.exists())) throw new Error("This employee already has approved leave on one or more selected dates.");
      for (const dayRef of dayRefs) transaction.set(dayRef, {requestId});
    }
    transaction.update(ref, {
      status: nextStatus, ...(nextStatus === "APPROVED" ? {paid: decision === "paid"} : {}),
      reviewedAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    transaction.set(audit, {
      action: "LEAVE_" + nextStatus, role: "HR (POC)",
      details: {requestId, employeeId: request.employeeId, from: request.from, to: request.to, decision},
      createdAt: serverTimestamp()
    });
  });
}

tbody.addEventListener("click", async event => {
  const button = event.target.closest("button[data-decision]");
  if (!button) return;
  const controls = [...button.parentElement.querySelectorAll("button")];
  controls.forEach(control => { control.disabled = true; });
  try {
    await review(button.dataset.requestId, button.dataset.decision);
    status(button.dataset.decision === "reject" ? "Leave request rejected." : "Leave request approved.");
    await refreshRequests();
  } catch (error) {
    status(error.message, true);
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
});

filter.addEventListener("change", renderRequests);
window.addEventListener("hashchange", showView);
if (portalEmployee) {
  const back = new URL("./employee-portal.html#leave", location.href);
  back.searchParams.set("employee", portalEmployee);
  const link = byId("leaveInboxLink");
  link.href = back;
  link.textContent = "Back to my leave";
  byId("leaveRequestLink").hidden = true;
}
showView();
start().catch(error => status("Could not load leave requests. " + error.message, true));
