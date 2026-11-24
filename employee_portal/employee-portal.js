import {initializeApp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {collection, getDocs, initializeFirestore, query, where} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {listContractAttachments, documentDecision, recordDocumentDecision, downloadAttachment} from "../pr/portal-documents.js";

const db = initializeFirestore(initializeApp({projectId: "driva-pwa", appId: "1:299138219722:web:623ff6b0a067ea822dfe33"}), {}, "drver-task");
const byId = id => document.getElementById(id);
const picker = byId("portalEmployee");
const period = byId("portalPeriod");
const employees = new Map();
const money = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
let payslips = [];
let selection = 0;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text ?? "";
  return node;
}

function notice(text) {
  const box = byId("portalMessage");
  box.hidden = !text;
  box.textContent = text;
}

function showPanel() {
  const routes = ["profile", "payslips", "leave", "documents"];
  const route = routes.includes(location.hash.slice(1)) ? location.hash.slice(1) : "profile";
  for (const panel of document.querySelectorAll("[data-portal-panel]")) {
    panel.hidden = panel.dataset.portalPanel !== route;
  }
  for (const link of document.querySelectorAll(".portal-navigation a")) {
    if (link.hash === "#" + route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function facts(container, entries) {
  container.replaceChildren();
  for (const [label, value] of entries) {
    const item = document.createElement("div");
    item.append(element("dt", label), element("dd", value ?? "—"));
    container.append(item);
  }
}

function renderPayslip() {
  const box = byId("portalPayslip");
  const selected = payslips.find(run => run.id === period.value);
  if (!selected) {
    const empty = element("p", "No payslip selected.");
    empty.className = "empty";
    box.replaceChildren(empty);
    return;
  }
  const row = selected.row;
  const list = document.createElement("dl");
  list.className = "portal-facts";
  facts(list, [
    ["Basic pay", money.format(row.basicPay || 0)], ["Overtime and premiums", money.format(row.attendancePremium || 0)],
    ["Bonuses", money.format(row.bonusPay || 0)], ["Driver earnings", money.format(row.driverEarnings || 0)],
    ["Other earnings", money.format(row.additions || 0)], ["Gross pay", money.format(row.grossPay || 0)],
    ["SSS", money.format(row.sss || 0)], ["PhilHealth", money.format(row.philHealth || 0)],
    ["Pag-IBIG", money.format(row.pagIbig || 0)], ["Withholding tax", money.format(row.withholdingTax || 0)],
    ["Other deductions", money.format(row.otherDeductions || 0)], ["Total deductions", money.format(row.deductions || 0)]
  ]);
  const net = element("div", "Net pay " + money.format(row.netPay || 0));
  net.className = "net-pay portal-net";
  box.replaceChildren(list, net);
}

async function loadPayslips(id, version) {
  const snapshot = await getDocs(collection(db, "payrollRuns"));
  if (version !== selection) return;
  payslips = snapshot.docs.map(record => ({id: record.id, ...record.data()}))
    .filter(run => ["FINALIZED", "PAID"].includes(run.status))
    .flatMap(run => {
      const row = run.rows?.find(entry => entry.employeeId === id);
      return row ? [{...run, row}] : [];
    }).sort((a, b) => String(b.periodTo).localeCompare(String(a.periodTo)));
  period.replaceChildren(new Option(payslips.length ? "Select a period" : "No payslips available", ""));
  for (const run of payslips) period.add(new Option(run.periodFrom + " to " + run.periodTo, run.id));
  if (payslips.length) period.value = payslips[0].id;
  renderPayslip();
}

async function loadLeave(id, version) {
  const snapshot = await getDocs(query(collection(db, "payrollLeaves"), where("employeeId", "==", id)));
  if (version !== selection) return;
  const rows = byId("portalLeaveRows");
  rows.replaceChildren();
  const leaves = snapshot.docs.map(record => record.data()).sort((a, b) => String(b.from).localeCompare(String(a.from)));
  for (const leave of leaves) {
    const row = rows.insertRow();
    const status = leave.status === "APPROVED" ? (leave.paid === false ? "Approved · unpaid" : "Approved · paid") : leave.status;
    for (const value of [leave.type === "SICK_LEAVE" ? "Sick leave" : "Vacation leave", leave.from + " to " + leave.to, status]) {
      row.insertCell().textContent = value;
    }
  }
  if (!leaves.length) {
    const cell = rows.insertRow().insertCell();
    cell.colSpan = 3;
    cell.className = "empty";
    cell.textContent = "No leave requests yet.";
  }
}

async function loadDocuments(id, version) {
  const files = await listContractAttachments(id);
  const decisions = await Promise.all(files.map(file => documentDecision(file.id)));
  if (version !== selection) return;
  const list = byId("portalDocuments");
  list.replaceChildren();
  if (!files.length) list.append(element("p", "No documents are available for this employee in this browser."));
  files.forEach(({id: documentId, file}, index) => {
    const item = document.createElement("article");
    item.className = "portal-document";
    const download = element("button", "Download");
    download.type = "button";
    download.addEventListener("click", () => downloadAttachment(file));
    item.append(element("h3", file.name), download);
    const decision = decisions[index];
    if (decision) {
      item.append(element("p", decision.action + " by " + decision.name + " on " +
        decision.date.toLocaleDateString("en-PH", {timeZone: "Asia/Manila"})));
    } else {
      const form = document.createElement("form");
      const name = document.createElement("input");
      name.required = true;
      name.maxLength = 120;
      const label = element("label", "Type your name to confirm");
      label.className = "field";
      label.append(name);
      form.append(label);
      for (const action of ["Sign", "Approve agreement", "Acknowledge"]) {
        const button = element("button", action);
        button.type = "submit";
        button.value = action;
        form.append(button);
      }
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const signedName = name.value.trim();
        if (!signedName || !event.submitter) return;
        const buttons = [...form.querySelectorAll("button")];
        buttons.forEach(button => { button.disabled = true; });
        try {
          const actions = {Sign: "Signed", "Approve agreement": "Agreement approved", Acknowledge: "Acknowledged"};
          await recordDocumentDecision(documentId, actions[event.submitter.value], signedName);
          if (version === selection) await loadDocuments(id, version);
        } catch (error) {
          if (version === selection) notice("Could not record the decision. " + error.message);
        } finally {
          buttons.forEach(button => { button.disabled = false; });
        }
      });
      item.append(form);
    }
    list.append(item);
  });
}

async function chooseEmployee() {
  const version = ++selection;
  const id = picker.value;
  const employee = employees.get(id);
  notice("");
  byId("portalWorkspace").hidden = !employee;
  if (!employee) return;
  const url = new URL(location.href);
  url.searchParams.set("employee", id);
  history.replaceState(null, "", url);
  const leaveUrl = new URL("../pr/leave.html#request", location.href);
  leaveUrl.searchParams.set("employee", id);
  byId("portalLeaveLink").href = leaveUrl;
  facts(byId("portalProfile"), [
    ["Employee ID", id], ["Name", employee.name], ["Department", employee.department || "—"],
    ["Position", employee.position || "—"], ["Employment type", employee.employmentType],
    ["Hire date", employee.startDate || "—"], ["Pay type", employee.payType],
    ["Rate", employee.rate == null && employee.dailyRate == null ? "—" : money.format(employee.rate ?? employee.dailyRate)],
    ["Shift start", employee.shiftStart || "—"], ["Scheduled hours per day", employee.shiftHours]
  ]);
  payslips = [];
  period.replaceChildren(new Option("Loading payslips…", ""));
  byId("portalPayslip").replaceChildren();
  byId("portalLeaveRows").replaceChildren();
  byId("portalDocuments").replaceChildren();
  const results = await Promise.allSettled([loadPayslips(id, version), loadLeave(id, version), loadDocuments(id, version)]);
  if (version === selection) {
    const failed = results.flatMap((result, i) => result.status === "rejected" ? [ ["payslips", "leave requests", "documents"][i] ] : []);
    if (failed.length) notice("Could not load " + failed.join(", ") + ".");
  }
}

async function start() {
  const snapshot = await getDocs(collection(db, "payrollEmployees"));
  const values = snapshot.docs.map(record => ({employeeId: record.id, ...record.data()}))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const employee of values) {
    employees.set(employee.employeeId, employee);
    picker.add(new Option(employee.name + " (" + employee.employeeId + ")", employee.employeeId));
  }
  picker.value = new URLSearchParams(location.search).get("employee") || "";
  await chooseEmployee();
}

period.addEventListener("change", renderPayslip);
picker.addEventListener("change", chooseEmployee);
window.addEventListener("hashchange", showPanel);
showPanel();
start().catch(error => notice("Could not start the employee portal. " + error.message));
