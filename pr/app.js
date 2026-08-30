import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  collection,
  doc,
  getDocs,
  initializeFirestore,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFW61pnwLvh6HGKWt10zLYNr860fI8vkg",
  authDomain: "driva-pwa.firebaseapp.com",
  databaseURL: "https://driva-pwa-default-rtdb.firebaseio.com",
  projectId: "driva-pwa",
  storageBucket: "driva-pwa.firebasestorage.app",
  messagingSenderId: "299138219722",
  appId: "1:299138219722:web:623ff6b0a067ea822dfe33"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, "drver-task");
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const ui = {
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),
  loadBtn: document.getElementById("loadBtn"),
  exportBtn: document.getElementById("exportBtn"),
  printBtn: document.getElementById("printBtn"),
  searchBox: document.getElementById("searchBox"),
  message: document.getElementById("message"),
  body: document.getElementById("payrollBody"),
  employeeCount: document.getElementById("employeeCount"),
  workdayCount: document.getElementById("workdayCount"),
  taskCount: document.getElementById("taskCount"),
  grossTotal: document.getElementById("grossTotal")
};

let payrollRows = [];

function todayPH() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function firstDayOfMonth(dateText) {
  return `${dateText.slice(0, 7)}-01`;
}

function safeText(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function driverIdOf(task) {
  return String(task.agentId || task.driverId || task.completedBy || "").trim();
}

function taskDateOf(task) {
  return String(task.assignedDate || "").slice(0, 10);
}

function isCompleted(task) {
  return String(task.status || "").toUpperCase() === "COMPLETED" ||
    String(task.workStatus || "").toUpperCase() === "COMPLETED";
}

function setMessage(text, type = "") {
  ui.message.className = `message${type ? ` ${type}` : ""}`;
  ui.message.textContent = text;
}

async function loadReferenceData() {
  const [driverSnapshot, rateSnapshot] = await Promise.all([
    getDocs(collection(db, "drivers")),
    getDocs(collection(db, "payrollRates"))
  ]);

  const drivers = new Map();
  driverSnapshot.forEach(item => {
    const data = item.data() || {};
    const id = String(data.driverCode || item.id).trim();
    drivers.set(id.toUpperCase(), { id, name: data.name || "" });
  });

  const rates = new Map();
  rateSnapshot.forEach(item => {
    const data = item.data() || {};
    rates.set(item.id.toUpperCase(), Number(data.dailyRate) || 0);
  });
  return { drivers, rates };
}

async function loadCompletedTasks(from, to) {
  const taskQuery = query(
    collection(db, "TASK"),
    where("assignedDate", ">=", from),
    where("assignedDate", "<=", to)
  );
  const snapshot = await getDocs(taskQuery);
  const tasks = [];
  snapshot.forEach(item => {
    const task = { _key: item.id, ...item.data() };
    if (task.deleted !== true && isCompleted(task)) tasks.push(task);
  });
  return tasks;
}

function buildPayroll(tasks, references) {
  const grouped = new Map();
  tasks.forEach(task => {
    const rawId = driverIdOf(task);
    if (!rawId) return;
    const key = rawId.toUpperCase();
    const driver = references.drivers.get(key) || { id: rawId, name: task.agentName || task.driverName || "" };
    if (!grouped.has(key)) {
      grouped.set(key, { driverId: driver.id, name: driver.name, taskCount: 0, dates: new Set() });
    }
    const row = grouped.get(key);
    row.taskCount++;
    const workDate = taskDateOf(task);
    if (workDate) row.dates.add(workDate);
  });

  return [...grouped.entries()].map(([key, row]) => {
    const dailyRate = references.rates.get(key) || 0;
    const paidDays = row.dates.size;
    return { ...row, key, paidDays, dailyRate, grossPay: paidDays * dailyRate };
  }).sort((a, b) => a.driverId.localeCompare(b.driverId));
}

function render() {
  const term = ui.searchBox.value.trim().toLowerCase();
  const visible = payrollRows.filter(row =>
    `${row.driverId} ${row.name}`.toLowerCase().includes(term)
  );

  if (!visible.length) {
    ui.body.innerHTML = `<tr><td colspan="7" class="empty">No matching payroll records.</td></tr>`;
  } else {
    ui.body.innerHTML = visible.map(row => `
      <tr>
        <td><strong>${safeText(row.driverId)}</strong></td>
        <td>${safeText(row.name || "—")}</td>
        <td class="number">${row.taskCount}</td>
        <td class="number">${row.paidDays}</td>
        <td class="number"><input class="rate-input" type="number" min="0" step="0.01" value="${row.dailyRate || ""}" data-driver="${safeText(row.driverId)}" aria-label="Daily rate for ${safeText(row.driverId)}"></td>
        <td class="number gross">${peso.format(row.grossPay)}</td>
        <td class="${row.dailyRate ? "rate-saved" : "rate-missing"}">${row.dailyRate ? "Saved" : "Enter rate"}</td>
      </tr>`).join("");
  }

  ui.employeeCount.textContent = payrollRows.length.toLocaleString();
  ui.workdayCount.textContent = payrollRows.reduce((sum, row) => sum + row.paidDays, 0).toLocaleString();
  ui.taskCount.textContent = payrollRows.reduce((sum, row) => sum + row.taskCount, 0).toLocaleString();
  ui.grossTotal.textContent = peso.format(payrollRows.reduce((sum, row) => sum + row.grossPay, 0));
  ui.exportBtn.disabled = payrollRows.length === 0;
  ui.printBtn.disabled = payrollRows.length === 0;
}

async function saveRate(input) {
  const driverId = input.dataset.driver;
  const rate = Number(input.value);
  if (!Number.isFinite(rate) || rate < 0) {
    setMessage("Daily rate must be zero or higher.", "error");
    return;
  }
  input.disabled = true;
  try {
    await setDoc(doc(db, "payrollRates", driverId), {
      driverId,
      dailyRate: rate,
      updatedAt: serverTimestamp()
    }, { merge: true });
    const row = payrollRows.find(item => item.driverId === driverId);
    if (row) {
      row.dailyRate = rate;
      row.grossPay = row.paidDays * rate;
    }
    render();
    setMessage(`Daily rate saved for ${driverId}.`, "success");
  } catch (error) {
    console.error("Daily rate save failed:", error);
    setMessage(`Could not save the daily rate for ${driverId}.`, "error");
  } finally {
    input.disabled = false;
  }
}

async function generatePayroll() {
  const from = ui.dateFrom.value;
  const to = ui.dateTo.value;
  if (!from || !to) return setMessage("Select both pay-period dates.", "error");
  if (from > to) return setMessage("The starting date cannot be after the ending date.", "error");

  ui.loadBtn.disabled = true;
  ui.exportBtn.disabled = true;
  ui.printBtn.disabled = true;
  setMessage("Reading completed tasks from Firestore...");
  try {
    const [tasks, references] = await Promise.all([
      loadCompletedTasks(from, to),
      loadReferenceData()
    ]);
    payrollRows = buildPayroll(tasks, references);
    render();
    const missingRates = payrollRows.filter(row => !row.dailyRate).length;
    setMessage(
      payrollRows.length
        ? `Payroll generated. ${missingRates ? `${missingRates} driver(s) still need a daily rate.` : "All daily rates are ready."}`
        : "No completed tasks were found for this pay period.",
      payrollRows.length && !missingRates ? "success" : ""
    );
  } catch (error) {
    console.error("Payroll load failed:", error);
    payrollRows = [];
    render();
    setMessage(`Could not generate payroll: ${error.message || error}`, "error");
  } finally {
    ui.loadBtn.disabled = false;
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv() {
  const headings = ["Pay Period From", "Pay Period To", "Driver ID", "Name", "Completed Tasks", "Paid Days", "Daily Rate", "Gross Pay"];
  const lines = [headings.map(csvCell).join(",")];
  payrollRows.forEach(row => lines.push([
    ui.dateFrom.value, ui.dateTo.value, row.driverId, row.name, row.taskCount,
    row.paidDays, row.dailyRate.toFixed(2), row.grossPay.toFixed(2)
  ].map(csvCell).join(",")));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payroll_${ui.dateFrom.value}_to_${ui.dateTo.value}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const today = todayPH();
ui.dateFrom.value = firstDayOfMonth(today);
ui.dateTo.value = today;
ui.loadBtn.addEventListener("click", generatePayroll);
ui.exportBtn.addEventListener("click", exportCsv);
ui.printBtn.addEventListener("click", () => window.print());
ui.searchBox.addEventListener("input", render);
ui.body.addEventListener("change", event => {
  if (event.target.matches(".rate-input")) saveRate(event.target);
});
