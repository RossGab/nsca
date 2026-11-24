import {initializeApp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {collection, getDocs, initializeFirestore, query, where} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {listContractAttachments, documentDecision, recordDocumentDecision, downloadAttachment, loadProfilePhoto, saveProfilePhoto} from "../pr/portal-documents.js?v=2";

const db = initializeFirestore(initializeApp({projectId: "driva-pwa", appId: "1:299138219722:web:623ff6b0a067ea822dfe33"}), {}, "drver-task");
const byId = id => document.getElementById(id);
const picker = byId("portalEmployee");
const period = byId("portalPeriod");
const employees = new Map();
const money = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
let payslips = [];
let selection = 0;
let hideRate = () => {};

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
  hideRate();
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
    const detail = document.createElement("dd");
    detail.append(value ?? "\u2014");
    item.append(element("dt", label), detail);
    container.append(item);
  }
}

function rateControl(rate) {
  if (rate == null) return "Unavailable";
  const control = document.createElement("span");
  const button = element("button", "Show rate");
  const amount = element("span");
  amount.id = "portalRateAmount";
  amount.hidden = true;
  button.type = "button";
  button.className = "small-btn";
  button.setAttribute("aria-controls", amount.id);
  button.setAttribute("aria-expanded", "false");
  hideRate = () => {
    amount.hidden = true;
    amount.textContent = "";
    button.textContent = "Show rate";
    button.setAttribute("aria-expanded", "false");
  };
  button.addEventListener("click", () => {
    if (!amount.hidden) return hideRate();
    amount.textContent = money.format(rate);
    amount.hidden = false;
    button.textContent = "Hide rate";
    button.setAttribute("aria-expanded", "true");
  });
  control.append(button, " ", amount);
  return control;
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
  const summary = document.createElement("div");
  summary.className = "portal-statement-summary";
  const heading = document.createElement("div");
  heading.append(element("span", "Net pay"), element("strong", money.format(row.netPay ?? 0)));
  summary.append(heading);
  if (row.netPay < 0) summary.append(element("span", "Needs payroll review"));

  const tables = document.createElement("div");
  tables.className = "portal-statement-tables";
  tables.append(
    statementTable("Earnings", [
      ["Basic pay", row.basicPay], ["Overtime and premiums", row.attendancePremium],
      ["Bonuses", row.bonusPay], ["Driver earnings", row.driverEarnings], ["Other earnings", row.additions]
    ], ["Gross pay", row.grossPay]),
    statementTable("Deductions", [
      ["SSS", row.sss], ["PhilHealth", row.philHealth], ["Pag-IBIG", row.pagIbig],
      ["Withholding tax", row.withholdingTax], ["Other deductions", row.otherDeductions]
    ], ["Total deductions", row.deductions])
  );
  box.replaceChildren(tables, summary);
}

function statementTable(title, entries, total) {
  const table = document.createElement("table");
  table.className = "portal-statement-table";
  table.createCaption().textContent = title;
  const header = table.createTHead().insertRow();
  for (const label of ["Description", "Amount"]) {
    const cell = element("th", label);
    cell.scope = "col";
    header.append(cell);
  }
  const addLine = (section, [label, amount]) => {
    const line = section.insertRow();
    const description = element("th", label);
    description.scope = "row";
    line.append(description);
    line.insertCell().textContent = money.format(amount ?? 0);
  };
  const body = table.createTBody();
  for (const entry of entries) addLine(body, entry);
  addLine(table.createTFoot(), total);
  return table;
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

const photoInput = byId("portalPhotoFile");
const photoButton = byId("portalPhotoButton");
const photoImage = byId("portalPhoto");
let photoUrl;

function showProfilePhoto(file) {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = file ? URL.createObjectURL(file) : undefined;
  photoImage.hidden = !photoUrl;
  byId("portalInitials").hidden = Boolean(photoUrl);
  if (photoUrl) photoImage.src = photoUrl;
  else photoImage.removeAttribute("src");
  photoButton.textContent = photoUrl ? "Change photo" : "Upload photo";
}

async function refreshProfilePhoto(id, version) {
  const file = await loadProfilePhoto(id);
  if (version === selection) showProfilePhoto(file);
}

photoButton.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", async () => {
  const [file] = photoInput.files;
  photoInput.value = "";
  const id = picker.value;
  const version = selection;
  if (!file || !employees.has(id)) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
    notice("Choose a JPEG, PNG, or WebP photo up to 5 MB.");
    return;
  }
  photoButton.disabled = true;
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    await saveProfilePhoto(id, file);
    if (version === selection) {
      showProfilePhoto(file);
      notice("");
    }
  } catch (error) {
    if (version === selection) notice("Could not save the photo. " + error.message);
  } finally {
    photoButton.disabled = false;
  }
});

async function chooseEmployee() {
  hideRate();
  hideRate = () => {};
  const version = ++selection;
  showProfilePhoto();
  const id = picker.value;
  const employee = employees.get(id);
  notice("");
  byId("portalWorkspace").hidden = !employee;
  byId("portalWelcome").hidden = Boolean(employee);
  if (!employee) return;
  const name = employee.name?.trim() || "Employee " + id;
  byId("portalName").textContent = name;
  byId("portalInitials").textContent = name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  byId("portalRole").textContent = [employee.position, employee.department].filter(Boolean).join(" ? ") || "Employee " + id;
  const url = new URL(location.href);
  url.searchParams.set("employee", id);
  history.replaceState(null, "", url);
  const leaveUrl = new URL("../pr/leave.html#request", location.href);
  leaveUrl.searchParams.set("employee", id);
  byId("portalLeaveLink").href = leaveUrl;
  facts(byId("portalProfile"), [
    ["Employee ID", id], ["Department", employee.department || "?"],
    ["Position", employee.position || "?"], ["Employment type", employee.employmentType],
    ["Hire date", employee.startDate || "?"]
  ]);
  const payTypes = {DAILY: "Daily", MONTHLY: "Monthly", HOURLY: "Hourly"};
  facts(byId("portalCompensation"), [
    ["Pay type", payTypes[employee.payType] || (employee.dailyRate != null ? "Daily" : employee.payType)],
    ["Rate", rateControl(employee.rate ?? employee.dailyRate)],
    ["Shift start", employee.shiftStart || "?"], ["Scheduled hours per day", employee.shiftHours]
  ]);
  payslips = [];
  period.replaceChildren(new Option("Loading payslips…", ""));
  byId("portalPayslip").replaceChildren();
  byId("portalLeaveRows").replaceChildren();
  byId("portalDocuments").replaceChildren();
  const results = await Promise.allSettled([loadPayslips(id, version), loadLeave(id, version), loadDocuments(id, version), refreshProfilePhoto(id, version)]);
  if (version === selection) {
    const failed = results.flatMap((result, i) => result.status === "rejected" ? [ ["payslips", "leave requests", "documents", "profile photo"][i] ] : []);
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
window.addEventListener("blur", () => hideRate());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hideRate();
});
showPanel();
start().catch(error => notice("Could not start the employee portal. " + error.message));
