import { taskCompletion, driverCredits } from "./driver-earnings.js";
import { selectContractEmployee } from "./contract-attachments.js?v=5";
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import{collection,doc,getDoc,getDocs,initializeFirestore,query,runTransaction,serverTimestamp,setDoc,where}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import{calculatePhilippineDeductions}from"./statutory.js?v=3";
const cfg={apiKey:"AIzaSyDFW61pnwLvh6HGKWt10zLYNr860fI8vkg",authDomain:"driva-pwa.firebaseapp.com",projectId:"driva-pwa",appId:"1:299138219722:web:623ff6b0a067ea822dfe33"},db=initializeFirestore(initializeApp(cfg),{},"drver-task"),$=id=>document.getElementById(id),peso=new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"});
const ids=["dateFrom","dateTo","loadBtn","refreshDriverDraft","saveDraftBtn","finalizeBtn","markPaidBtn","exportBtn","printBtn","searchBox","message","runStatus","periodLabel","payrollBody","employeeCount","workdayCount","grossTotal","netTotal","employeeForm","employeeFormTitle","employeeId","employeeName","employeeDepartment","employeePosition","employeeStartDate","employmentType","shiftStart","shiftHours","driverId","payType","employeeRate","employeeSss","employeePhilHealth","employeePagIbig","employeeTin","employeeActive","saveEmployeeBtn","employeeSearch","employeeBody","historyBody","refreshHistoryBtn"],ui=Object.fromEntries(ids.map(id=>[id,$(id)]));
let employees=new Map(),rows=[],history=[],editing="",run=null;
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]),money=v=>peso.format(Number(v)||0),round=v=>Math.round((Number(v)||0)*100)/100,runId=()=>`${ui.dateFrom.value}_${ui.dateTo.value}`;
function msg(text,type=""){ui.message.hidden=!text;ui.message.className=`message${type?` ${type}`:""}`;ui.message.textContent=text}function dateText(v){if(!v)return"—";const d=typeof v.toDate==="function"?v.toDate():new Date(v);return isNaN(d)?"—":d.toLocaleString("en-PH")}
const workspaces = {
  "": ["payrollView", "Payroll"],
  "#employees": ["employeesView", "Employees"],
  "#history": ["historyView", "Payroll history"],
  "#special-pay": ["specialPayView", "Special pay"],
  "#driver-reconciliation": ["driverReconciliationView", "Driver reconciliation"]
};

async function showWorkspace() {
  const route = location.hash;
  const isEmployeeRecord = route === "#employee/new" || route.startsWith("#employee/edit/");
  const [id, heading] = isEmployeeRecord
    ? ["employeeRecordView", "Employees"]
    : workspaces[route] || workspaces[""];
  if (isEmployeeRecord) {
    resetForm();
    if (route !== "#employee/new") {
      try {
        const employeeId = decodeURIComponent(route.slice("#employee/edit/".length));
        if (!employees.has(employeeId.toUpperCase())) await loadEmployees(true);
        if (location.hash !== route) return;
        if (!employees.has(employeeId.toUpperCase())) throw new Error("Employee record was not found.");
        editEmployee(employeeId);
      } catch (error) {
        if (location.hash !== route) return;
        historyReplaceEmployees(error.message);
        return;
      }
    } else if (!employees.size) {
      loadEmployees();
    }
  }
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("hidden", view.id !== id));
  $("workspaceHeading").textContent = heading;
  if (id === "employeesView") loadEmployees();
  if (id === "historyView") loadHistory();
  if (id === "driverReconciliationView") renderDriverReconciliation();
}

function historyReplaceEmployees(error) {
  window.history.replaceState(null, "", "#employees");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  msg(error, "error");
}

window.addEventListener("hashchange", () => {
  msg("");
  showWorkspace();
});
async function loadEmployees(propagateError=false){ui.employeeBody.innerHTML='<tr><td colspan="8" class="empty">Loading employees...</td></tr>';try{const s=await getDocs(collection(db,"payrollEmployees"));employees=new Map();s.forEach(d=>{const x=d.data(),id=String(x.employeeId||d.id);employees.set(id.toUpperCase(),{...x,employeeId:id})});renderEmployees()}catch(e){if(propagateError)throw e;console.error(e);msg(`Unable to load employees: ${e.message||e}`,"error")}}
function renderEmployees(){const term=ui.employeeSearch.value.toLowerCase(),list=[...employees.values()].filter(x=>`${x.employeeId} ${x.name} ${x.department} ${x.position}`.toLowerCase().includes(term)).sort((a,b)=>a.employeeId.localeCompare(b.employeeId));ui.employeeBody.innerHTML=list.length?list.map(x=>`<tr><td><strong>${esc(x.employeeId)}</strong></td><td>${esc(x.name)}</td><td>${esc(x.department||"—")}<small class="subtext">${esc(x.position||"—")}</small></td><td>${esc(x.employmentType||"REGULAR")}</td><td>${esc(x.payType||"DAILY")}</td><td class="number">${money(x.rate??x.dailyRate)}</td><td><span class="status-pill ${x.active===false?"inactive":"active"}">${x.active===false?"Inactive":"Active"}</span></td><td><div class="action-row"><button class="small-btn" data-edit="${esc(x.employeeId)}">Edit</button><button class="small-btn" data-toggle="${esc(x.employeeId)}">${x.active===false?"Activate":"Deactivate"}</button></div></td></tr>`).join(""):'<tr><td colspan="8" class="empty">No employees found.</td></tr>'}
function resetForm(){selectContractEmployee("");editing="";ui.employeeForm.reset();ui.employeeActive.checked=true;ui.employeeId.readOnly=false;ui.employeeFormTitle.textContent="Add employee";ui.saveEmployeeBtn.textContent="Save Employee";}
function editEmployee(id){const x=employees.get(id.toUpperCase());if(!x)return;editing=x.employeeId;selectContractEmployee(editing);ui.employeeId.value=x.employeeId;ui.employeeId.readOnly=true;ui.employeeName.value=x.name||"";ui.employeeDepartment.value=x.department||"";ui.employeePosition.value=x.position||"";ui.employeeStartDate.value=x.startDate||"";ui.employmentType.value=x.employmentType||"REGULAR";ui.shiftStart.value=x.shiftStart||"";ui.shiftHours.value=x.shiftHours??"";ui.driverId.value=x.driverId||"";ui.payType.value=x.payType||"DAILY";ui.employeeRate.value=x.rate??x.dailyRate??0;ui.employeeSss.value=x.governmentIds?.sss||"";ui.employeePhilHealth.value=x.governmentIds?.philHealth||"";ui.employeePagIbig.value=x.governmentIds?.pagIbig||"";ui.employeeTin.value=x.governmentIds?.tin||"";ui.employeeActive.checked=x.active!==false;ui.employeeFormTitle.textContent=x.name||"Edit employee";ui.saveEmployeeBtn.textContent="Save Changes";scrollTo({top:0,behavior:"smooth"})}
async function saveEmployee(e){e.preventDefault();const id=ui.employeeId.value.trim(),rate=Number(ui.employeeRate.value);if(!id||!ui.employeeName.value.trim())return msg("Employee ID and name are required.","error");if(/[/.#$\[\]]/.test(id))return msg("Employee ID contains a character Firebase cannot use.","error");if(!Number.isFinite(rate)||rate<0)return msg("Enter a valid compensation rate.","error");if(!editing&&employees.has(id.toUpperCase()))return msg("That Employee ID already exists.","error");ui.saveEmployeeBtn.disabled=true;try{await setDoc(doc(db,"payrollEmployees",id),{employeeId:id,name:ui.employeeName.value.trim(),department:ui.employeeDepartment.value.trim(),position:ui.employeePosition.value.trim(),startDate:ui.employeeStartDate.value,employmentType:ui.employmentType.value,shiftStart:ui.shiftStart.value,shiftHours:ui.shiftHours.value?Number(ui.shiftHours.value):null,driverId:ui.driverId.value.trim(),payType:ui.payType.value,rate,dailyRate:ui.payType.value==="DAILY"?rate:null,governmentIds:{sss:ui.employeeSss.value.trim(),philHealth:ui.employeePhilHealth.value.trim(),pagIbig:ui.employeePagIbig.value.trim(),tin:ui.employeeTin.value.trim()},active:ui.employeeActive.checked,updatedAt:serverTimestamp(),...(!editing?{createdAt:serverTimestamp()}:{})},{merge:true});msg(`Employee ${id} saved.`,"success");await loadEmployees();if(!editing&&location.hash==="#employee/new")location.hash="employee/edit/"+encodeURIComponent(id)}catch(x){console.error(x);msg(`Employee could not be saved: ${x.message||x}`,"error")}finally{ui.saveEmployeeBtn.disabled=false}}
async function toggleEmployee(id){const x=employees.get(id.toUpperCase());if(!x)return;try{await setDoc(doc(db,"payrollEmployees",x.employeeId),{active:x.active===false,updatedAt:serverTimestamp()},{merge:true});await loadEmployees()}catch(e){msg(`Status could not be changed: ${e.message||e}`,"error")}}
async function payrollInputs(from,to){const [a,l,s]=await Promise.all([getDocs(query(collection(db,"payrollAttendance"),where("date",">=",from),where("date","<=",to))),getDocs(collection(db,"payrollLeaves")),getDoc(doc(db,"payrollSettings","general"))]);const attendance=[],leaves=[],settings=s.exists()?s.data():{};a.forEach(d=>attendance.push(d.data()));l.forEach(d=>{const x=d.data();if(x.status==="APPROVED"&&x.to>=from&&x.from<=to)leaves.push(x)});return{attendance,leaves,paidStatuses:settings.paidStatuses||["PRESENT","VACATION_LEAVE","SICK_LEAVE","HOLIDAY"],hoursPerDay:Number(settings.hoursPerDay)||8,monthlyWorkdays:Number(settings.monthlyWorkdays)||22,companyName:settings.companyName||"NSCA",rules:settings.rules||{}}}
function eachDate(from,to){const out=[],end=new Date(`${to}T00:00:00Z`);for(let d=new Date(`${from}T00:00:00Z`);d<=end;d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));return out}
function buildRows(input, from, to){const workedHours=new Map(input.attendance.filter(x=>Number.isFinite(x.workedMinutes)).map(x=>[String(x.employeeId).toUpperCase()+"|"+x.date,x.workedMinutes/60]));const paid=new Map(),absent=new Map();input.attendance.forEach(x=>{const key=String(x.employeeId).toUpperCase();if(x.status==="ABSENT"||x.paidLeave===false)absent.set(key,(absent.get(key)||0)+1);if(x.paidLeave===true||(x.paidLeave!==false&&input.paidStatuses.includes(x.status))){if(!paid.has(key))paid.set(key,new Set());paid.get(key).add(x.date)}});const attendanceDates=new Set(input.attendance.map(x=>String(x.employeeId).toUpperCase()+"|"+x.date));const leaveDays = new Set();
for (const leave of input.leaves) {
  const key = String(leave.employeeId).toUpperCase();
  for (const date of eachDate(leave.from < from ? from : leave.from, leave.to > to ? to : leave.to)) {
    const id = key + "|" + date;
    if (!attendanceDates.has(id) && !leaveDays.has(id)) {
      leaveDays.add(id);
      if (leave.paid === false) absent.set(key, (absent.get(key) || 0) + 1);
      else {
        if (!paid.has(key)) paid.set(key, new Set());
        paid.get(key).add(date);
      }
    }
  }
}
return[...employees.values()].filter(x=>x.active!==false&&(!x.startDate||x.startDate<=to)).map(x=>{const key=x.employeeId.toUpperCase(),paidDays=paid.get(key)?.size||0,absentDays=absent.get(key)||0,payType=x.payType||"DAILY",rate=Number(x.rate??x.dailyRate)||0,absenceDeduction=payType==="MONTHLY"?absentDays*(rate/input.monthlyWorkdays):0,basicPay=payType==="MONTHLY"?Math.max(0,rate/2-absenceDeduction):payType==="HOURLY"?[...(paid.get(key)||[])].reduce((hours,date)=>hours+(workedHours.get(key+"|"+date)??(x.shiftHours||input.hoursPerDay)),0)*rate:paidDays*rate;return calculatePhilippineDeductions({employeeId:x.employeeId,name:x.name,department:x.department||"",position:x.position||"",employmentType:x.employmentType||"REGULAR",payType,rate,shiftHours:x.shiftHours||input.hoursPerDay,paidDays,absentDays,absenceDeduction:round(absenceDeduction),basicPay:round(basicPay),additions:0,otherDeductions:0})}).sort((a,b)=>a.employeeId.localeCompare(b.employeeId))}
function applyAttendancePremiums(rows, input) {
  const hoursByEmployee = new Map();
  for (const entry of input.attendance) {
    const id = String(entry.employeeId).toUpperCase();
    const hours = hoursByEmployee.get(id) || {};
    for (const key of ["overtime", "holiday", "night"]) {
      const value = Number(entry[key + "Hours"]);
      if (Number.isFinite(value) && value > 0) hours[key] = (hours[key] || 0) + value;
    }
    hoursByEmployee.set(id, hours);
  }
  return rows.map(row => {
    const hours = hoursByEmployee.get(row.employeeId.toUpperCase()) || {};
    const dailyRate = row.payType === "MONTHLY" ? row.rate / input.monthlyWorkdays : row.rate;
    const hourlyRate = row.payType === "HOURLY" ? row.rate : dailyRate / row.shiftHours;
    const overtimePay = round(hourlyRate * (hours.overtime || 0) * (Number(input.rules.overtimePercent) || 0) / 100);
    const attendancePremium = round(["overtime", "holiday", "night"].reduce((total, key) =>
      total + hourlyRate * (hours[key] || 0) * (Number(input.rules[key + "Percent"]) || 0) / 100, 0));
    return calculatePhilippineDeductions({ ...row, attendancePremium, overtimePay });
  });
}

async function applyDriverEarnings(rows, input, from, to) {
  const linked = new Map();
  const rowByEmployee = new Map(rows.map(row => [row.employeeId.toUpperCase(), row]));
  for (const employee of employees.values()) {
    const driverId = employee.driverId?.trim();
    const row = rowByEmployee.get(employee.employeeId.toUpperCase());
    if (!driverId || !row) continue;
    if (linked.has(driverId)) throw new Error("Driver " + driverId + " is linked to multiple payroll employees.");
    linked.set(driverId, {row, startDate: employee.startDate, tasks: []});
  }
  if (!linked.size) return rows;
  const end = new Date(to + "T00:00:00+08:00");
  end.setTime(end.getTime() + 86400000);
  const snapshot = await getDocs(query(collection(db, "TASK"),
    where("completedAt", ">=", new Date(from + "T00:00:00+08:00")),
    where("completedAt", "<", end)));
  const tasks = [];
  for (const record of snapshot.docs) {
    const completion = taskCompletion(record.data());
    const match = linked.get(completion?.driverId);
    if (match && (!match.startDate || completion.date >= match.startDate)) {
      tasks.push({taskId: record.id, ...completion});
    }
  }
  const claims = await Promise.all(tasks.map(task => getDoc(doc(db, "payrollTaskClaims", task.taskId))));
  tasks.forEach((task, index) => {
    if (!claims[index].exists()) linked.get(task.driverId).tasks.push(task);
  });
  for (const {row, tasks} of linked.values()) {
    const employee = row.employeeId.toUpperCase();
    const recordedDates = input.attendance.filter(record => String(record.employeeId).toUpperCase() === employee)
      .map(record => record.date);
    for (const leave of input.leaves) {
      if (String(leave.employeeId).toUpperCase() === employee) {
        recordedDates.push(...eachDate(leave.from < from ? from : leave.from, leave.to > to ? to : leave.to));
      }
    }
    const dates = [...new Set(tasks.map(task => task.date))];
    if (row.payType === "DAILY" && dates.length) {
      const driverId = tasks[0].driverId;
      const dayClaims = await Promise.all(dates.map(date =>
        getDoc(doc(db, "payrollDriverDayClaims", encodeURIComponent(driverId) + "_" + date))));
      dates.forEach((date, index) => {
        if (dayClaims[index].exists()) recordedDates.push(date);
      });
    }
    row.driverTasks = driverCredits(tasks, row, recordedDates);
    row.driverEarnings = round(row.driverTasks.reduce((total, task) => total + task.amount, 0));
  }
  return rows.map(calculatePhilippineDeductions);
}

function renderDriverReconciliation() {
  const table = $("driverReconciliation");
  $("driverReconciliationPeriod").textContent = run
    ? run.id.replace("_", " to ") + " ? " + run.status.toLowerCase()
    : "Generate or open a payroll run to review its driver tasks.";
  table.replaceChildren();
  for (const row of rows) {
    for (const task of row.driverTasks || []) {
      const line = table.insertRow();
      for (const value of [row.employeeId, task.driverId, task.taskId, task.date, row.payType,
        money(row.rate), money(task.amount)]) line.insertCell().textContent = value;
    }
  }
  $("driverReconciliationEmpty").hidden = table.rows.length > 0;
}

function totals(){return{employeeCount:rows.length,paidDays:rows.reduce((s,x)=>s+Number(x.paidDays||0),0),grossPay:round(rows.reduce((s,x)=>s+Number(x.grossPay||0),0)),deductions:round(rows.reduce((s,x)=>s+Number(x.deductions||0),0)),netPay:round(rows.reduce((s,x)=>s+Number(x.netPay||0),0))}}
function recalc(i,field,value){if(!run||!["UNSAVED","DRAFT"].includes(run.status))return;rows[i][field]=Math.max(0,Number(value)||0);rows[i]=calculatePhilippineDeductions(rows[i]);renderPayroll()}
function setStatus(status=run?.status||"UNSAVED"){ui.runStatus.className=`run-status ${status}`;ui.runStatus.textContent=status==="UNSAVED"?"Unsaved payroll":`Payroll status: ${status}`;const has=rows.length>0,edit=["UNSAVED","DRAFT"].includes(status);ui.saveDraftBtn.disabled=!has||!edit;ui.finalizeBtn.disabled=!has||!edit;ui.markPaidBtn.disabled=!has||status!=="FINALIZED";ui.loadBtn.classList.toggle("primary",!has||status==="PAID");ui.finalizeBtn.classList.toggle("primary",has&&edit);ui.markPaidBtn.classList.toggle("primary",has&&status==="FINALIZED");ui.exportBtn.disabled=!has;ui.printBtn.disabled=!has}
function renderPayroll(){renderDriverReconciliation();const editable=["UNSAVED","DRAFT"].includes(run?.status||"UNSAVED"),term=ui.searchBox.value.toLowerCase(),list=rows.map((x,i)=>({...x,i})).filter(x=>`${x.employeeId} ${x.name} ${x.department} ${x.position}`.toLowerCase().includes(term));ui.payrollBody.innerHTML=list.length?list.map(x=>`<tr><td><strong>${esc(x.name)}</strong><small class="subtext">${esc(x.employeeId)} · ${esc(x.department||x.position||"—")}</small></td><td>${esc(x.payType)}<small class="subtext">${money(x.rate)}</small></td><td class="number">${x.paidDays}</td><td class="number">${money(x.basicPay)}</td><td class="number">${editable?`<input class="money-input" type="number" min="0" step=".01" data-row="${x.i}" data-field="additions" value="${Number(x.additions||0)}">`:money(x.additions)}${editable ? `<label class="subtext">Bonus <input class="money-input" type="number" min="0" step=".01" data-row="${x.i}" data-field="bonusPay" value="${Number(x.bonusPay||0)}"></label>` : x.bonusPay ? `<small class="subtext">Bonus ${money(x.bonusPay)}</small>` : ""}${x.attendancePremium ? `<small class="subtext">Premium ${money(x.attendancePremium)}</small>` : ""}${x.driverEarnings ? `<small class="subtext">Driver earnings ${money(x.driverEarnings)}</small>` : ""}</td><td class="number">${editable?`<input class="money-input" type="number" min="0" step=".01" data-row="${x.i}" data-field="otherDeductions" value="${Number(x.otherDeductions||0)}">`:money(x.otherDeductions)}</td><td class="number">${money(Number(x.sss)+Number(x.philHealth)+Number(x.pagIbig)+Number(x.withholdingTax))}</td><td class="number gross">${money(x.netPay)}</td></tr>`).join(""):'<tr><td colspan="8" class="empty">No matching payroll records.</td></tr>';const t=totals();ui.employeeCount.textContent=t.employeeCount;ui.workdayCount.textContent=t.paidDays;ui.grossTotal.textContent=money(t.grossPay);ui.netTotal.textContent=money(t.netPay);ui.periodLabel.textContent=ui.dateFrom.value?`${ui.dateFrom.value} to ${ui.dateTo.value} · Compensation based on employee records and approved attendance.`:"Generate a payroll period to see results.";setStatus()}
async function generate() {
  const from = ui.dateFrom.value;
  const to = ui.dateTo.value;
  if (!from || !to || from > to) return msg("Select a valid payroll period.", "error");
  const id = runId();
  const refresh = ui.refreshDriverDraft.checked;
  ui.loadBtn.disabled = true;
  try {
    await loadEmployees(true);
    const snapshot = await getDoc(doc(db, "payrollRuns", id));
    const saved = snapshot.data();
    let nextRun;
    let nextRows;
    if (saved && !(refresh && saved.status === "DRAFT")) {
      nextRun = {id, ...saved};
      nextRows = saved.rows || [];
    } else {
      const input = await payrollInputs(from, to);
      if (input.attendance.some(entry => entry.clockInAt && !entry.clockOutAt)) {
        throw new Error("Close open attendance shifts in this period before generating payroll.");
      }
      nextRows = await applyDriverEarnings(applyAttendancePremiums(buildRows(input, from, to), input), input, from, to);
      const previous = new Map((saved?.rows || []).map(row => [row.employeeId, row]));
      nextRows = nextRows.map(row => {
        const old = previous.get(row.employeeId);
        return old ? calculatePhilippineDeductions({
          ...row, additions: old.additions || 0, otherDeductions: old.otherDeductions || 0, bonusPay: old.bonusPay || 0
        }) : row;
      });
      nextRun = {id, status: saved ? "DRAFT" : "UNSAVED"};
    }
    if (id !== runId()) throw new Error("The selected period changed. Generate it again.");
    rows = nextRows;
    run = nextRun;
    renderPayroll();
    msg(saved && nextRun.rows ? "Loaded existing payroll." :
      `Generated payroll for ${rows.length} active employee(s). Review amounts before finalizing.`, "success");
  } catch (error) {
    msg("Payroll could not be generated. " + error.message, "error");
  } finally {
    ui.loadBtn.disabled = false;
  }
}

async function updateRun(id, allowedStatuses, payload, action) {
  const runRef = doc(db, "payrollRuns", id);
  const auditRef = doc(collection(db, "payrollAuditLogs"));
  const tasks = action === "FINALIZED" ? payload.rows.flatMap(row =>
    (row.driverTasks || []).map(task => ({...task, employeeId: row.employeeId, rate: row.rate}))) : [];
  const dayKeys = [...new Set(tasks.filter(task => task.payableDay)
    .map(task => encodeURIComponent(task.driverId) + "_" + task.date))];
  if (tasks.length + dayKeys.length > 498) {
    throw new Error("This run exceeds the POC transaction limit. Split it into smaller periods.");
  }
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(runRef);
    const currentStatus = snapshot.exists() ? snapshot.data().status : "UNSAVED";
    if (!allowedStatuses.includes(currentStatus)) {
      throw new Error("Payroll status changed. Reload the period before continuing.");
    }
    const taskRecords = await Promise.all(tasks.map(async task => {
      const claimRef = doc(db, "payrollTaskClaims", task.taskId);
      const [claim, source] = await Promise.all([
        transaction.get(claimRef), transaction.get(doc(db, "TASK", task.taskId))
      ]);
      const completion = taskCompletion(source.data());
      if (claim.exists() || completion?.driverId !== task.driverId ||
          completion?.completedAtMs !== task.completedAtMs) {
        throw new Error("Task " + task.taskId + " changed or was already credited. Regenerate the draft.");
      }
      return {task, claimRef};
    }));
    const dayRefs = await Promise.all(dayKeys.map(async key => {
      const ref = doc(db, "payrollDriverDayClaims", key);
      if ((await transaction.get(ref)).exists()) {
        throw new Error("A driver day was already credited in another run. Review overlapping periods.");
      }
      return ref;
    }));
    for (const {task, claimRef} of taskRecords) transaction.set(claimRef, {...task, payrollRunId: id});
    for (const ref of dayRefs) transaction.set(ref, {payrollRunId: id});
    transaction.set(runRef, payload, { merge: true });
    transaction.set(auditRef, {
      payrollRunId: id, action, role: "HR", createdAt: serverTimestamp()
    });
  });
}

async function save(status) {
  if (!rows.length || !run || run.id !== runId()) {
    throw new Error("Load the selected payroll period before saving.");
  }
  const id = run.id;
  const payload = {
    periodFrom: ui.dateFrom.value, periodTo: ui.dateTo.value,
    payFrequency: "SEMI_MONTHLY", status, rows, totals: totals(),
    preparedByRole: "HR", updatedAt: serverTimestamp(),
    ...(status === "DRAFT" ? { draftedAt: serverTimestamp() } : { finalizedAt: serverTimestamp() })
  };
  await updateRun(id, ["UNSAVED", "DRAFT"], payload, status);
  if (run?.id === id) {
    run = { id, ...payload };
    renderPayroll();
  }
}

async function saveDraft() {
  try {
    await save("DRAFT");
    msg("Payroll draft saved.", "success");
  } catch (e) {
    msg(`Draft could not be saved: ${e.message || e}`, "error");
  }
}

async function finalize() {
  if (!confirm("Finalize and lock this payroll?")) return;
  try {
    await save("FINALIZED");
    msg("Payroll finalized.", "success");
  } catch (e) {
    msg(`Payroll could not be finalized: ${e.message || e}`, "error");
  }
}

async function markPaid() {
  if (!run || run.status !== "FINALIZED" || !confirm("Mark this payroll as paid?")) return;
  const id = run.id;
  try {
    await updateRun(id, ["FINALIZED"], {
      status: "PAID", paidAt: serverTimestamp(), updatedAt: serverTimestamp()
    }, "MARK_PAID");
    if (run?.id === id) {
      run.status = "PAID";
      setStatus();
    }
    msg("Payroll marked as paid.", "success");
  } catch (e) {
    msg(`Payment status failed: ${e.message || e}`, "error");
  }
}
async function loadHistory(){try{const s=await getDocs(collection(db,"payrollRuns"));history=[];s.forEach(d=>history.push({id:d.id,...d.data()}));history.sort((a,b)=>String(b.periodTo).localeCompare(String(a.periodTo)));ui.historyBody.innerHTML=history.length?history.map(x=>`<tr><td>${esc(x.periodFrom)} to ${esc(x.periodTo)}</td><td><span class="status-pill ${esc(x.status)}">${esc(x.status)}</span></td><td class="number">${x.totals?.employeeCount||0}</td><td class="number">${x.totals?.paidDays||0}</td><td class="number">${money(x.totals?.grossPay)}</td><td class="number gross">${money(x.totals?.netPay)}</td><td>${dateText(x.paidAt)}</td><td><button class="small-btn" data-view-run="${esc(x.id)}">View</button></td></tr>`).join(""):'<tr><td colspan="8" class="empty">No payroll history.</td></tr>'}catch(e){msg(`History could not be loaded: ${e.message||e}`,"error")}}
function viewRun(id){const x=history.find(r=>r.id===id);if(!x)return;ui.dateFrom.value=x.periodFrom;ui.dateTo.value=x.periodTo;rows=x.rows||[];run=x;location.hash="";showWorkspace();renderPayroll()}
const csv=v=>`"${String(v??"").replace(/"/g,'""')}"`;function exportCsv(){const head=["Period From","Period To","Employee ID","Name","Department","Position","Pay Type","Rate","Paid Days","Basic Pay","Other Earnings","SSS","PhilHealth","Pag-IBIG","Withholding Tax","Other Deductions","Gross Pay","Net Pay","Status"],lines=[head.map(csv).join(",")];rows.forEach(x=>lines.push([ui.dateFrom.value,ui.dateTo.value,x.employeeId,x.name,x.department,x.position,x.payType,x.rate,x.paidDays,x.basicPay,Number(x.additions||0)+Number(x.attendancePremium||0)+Number(x.driverEarnings||0)+Number(x.bonusPay||0),x.sss,x.philHealth,x.pagIbig,x.withholdingTax,x.otherDeductions,x.grossPay,x.netPay,run?.status||"UNSAVED"].map(csv).join(",")));const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`payroll_${runId()}.csv`;a.click();URL.revokeObjectURL(url)}
ui.employeeForm.addEventListener("submit",saveEmployee);ui.employeeSearch.addEventListener("input",renderEmployees);ui.employeeBody.addEventListener("click",e=>{if(e.target.dataset.edit)location.hash="employee/edit/"+encodeURIComponent(e.target.dataset.edit);if(e.target.dataset.toggle)toggleEmployee(e.target.dataset.toggle)});ui.payrollBody.addEventListener("change",e=>{if(e.target.dataset.field)recalc(Number(e.target.dataset.row),e.target.dataset.field,e.target.value)});ui.loadBtn.addEventListener("click",generate);ui.saveDraftBtn.addEventListener("click",saveDraft);ui.finalizeBtn.addEventListener("click",finalize);ui.markPaidBtn.addEventListener("click",markPaid);ui.exportBtn.addEventListener("click",exportCsv);ui.printBtn.addEventListener("click",()=>print());ui.searchBox.addEventListener("input",renderPayroll);ui.refreshHistoryBtn.addEventListener("click",loadHistory);ui.historyBody.addEventListener("click",e=>{if(e.target.dataset.viewRun)viewRun(e.target.dataset.viewRun)});
const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Manila"}),day=Number(today.slice(8));ui.dateFrom.value=`${today.slice(0,7)}-${day<=15?"01":"16"}`;ui.dateTo.value=day<=15?`${today.slice(0,7)}-15`:today;showWorkspace();
