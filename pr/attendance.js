import{initializeApp}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";import{collection,deleteDoc,doc,getDoc,getDocs,initializeFirestore,query,runTransaction,serverTimestamp,setDoc,where}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
const cfg={apiKey:"AIzaSyDFW61pnwLvh6HGKWt10zLYNr860fI8vkg",authDomain:"driva-pwa.firebaseapp.com",projectId:"driva-pwa",appId:"1:299138219722:web:623ff6b0a067ea822dfe33"},db=initializeFirestore(initializeApp(cfg),{},"drver-task"),$=id=>document.getElementById(id),ui={message:$("message"),search:$("employeeSearch"),list:$("employeeList"),month:$("month"),previous:$("previousMonth"),next:$("nextMonth"),selected:$("selectedEmployee"),calendar:$("calendar")};
const labels={PRESENT:"Present",VACATION_LEAVE:"Vacation Leave",SICK_LEAVE:"Sick Leave",ABSENT:"Absent",HOLIDAY:"Holiday",REST_DAY:"Rest Day"},classes={PRESENT:"present",VACATION_LEAVE:"vacation",SICK_LEAVE:"sick",ABSENT:"absent",HOLIDAY:"holiday",REST_DAY:"rest"};let employees=[],employeeId="",selectedStatus="PRESENT",records=new Map(),approvedLeaves=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);function msg(t,e=false){ui.message.className=`message ${e?"error":"success"}`;ui.message.textContent=t;}function monthBounds(){const [y,m]=ui.month.value.split("-").map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return{year:y,month:m,from:`${y}-${String(m).padStart(2,"0")}-01`,to:`${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`,last};}
async function loadEmployees(){const s=await getDocs(collection(db,"payrollEmployees"));employees=[];s.forEach(d=>{const x=d.data();if(x.active!==false)employees.push({...x,employeeId:x.employeeId||d.id});});employees.sort((a,b)=>String(a.name).localeCompare(String(b.name)));renderEmployees();}
function renderEmployees(){const term=ui.search.value.toLowerCase().trim(),rows=employees.filter(e=>`${e.employeeId} ${e.name} ${e.department||""}`.toLowerCase().includes(term));ui.list.innerHTML=rows.length?rows.map(e=>`<button class="employee-option ${e.employeeId===employeeId?"active":""}" data-id="${esc(e.employeeId)}"><strong>${esc(e.name)}</strong><small>${esc(e.employeeId)} · ${esc(e.department||e.position||"")}</small></button>`).join(""):'<div class="empty">No active employees.</div>';}
async function chooseEmployee(id){employeeId=id;const e=employees.find(x=>x.employeeId===id);ui.selected.textContent=e?`${e.name} (${e.employeeId})`:"Select an employee";renderEmployees();await loadMonth();}
async function loadMonth(){records=new Map();approvedLeaves=[];if(!employeeId){renderCalendar();return;}const b=monthBounds();try{const [a,l]=await Promise.all([getDocs(query(collection(db,"payrollAttendance"),where("date",">=",b.from),where("date","<=",b.to))),getDocs(collection(db,"payrollLeaves"))]);a.forEach(d=>{const x=d.data();if(String(x.employeeId).toUpperCase()===employeeId.toUpperCase())records.set(x.date,x);});l.forEach(d=>{const x=d.data();if(String(x.employeeId).toUpperCase()===employeeId.toUpperCase()&&x.status==="APPROVED"&&x.to>=b.from&&x.from<=b.to)approvedLeaves.push(x);});renderCalendar();msg(`Calendar loaded for ${ui.selected.textContent}.`);}catch(x){console.error(x);msg(`Unable to load calendar: ${x.message||x}`,true);}}
function leaveOn(date){return approvedLeaves.find(x=>date>=x.from&&date<=x.to);}
function renderCalendar(){const b=monthBounds(),firstDay=new Date(Date.UTC(b.year,b.month-1,1)).getUTCDay(),cells=[];for(let i=0;i<42;i++){const day=i-firstDay+1,date=new Date(Date.UTC(b.year,b.month-1,day)),text=date.toISOString().slice(0,10),inside=date.getUTCMonth()===b.month-1,record=records.get(text),leave=leaveOn(text),status=record?.status||(leave?(leave.type==="SICK_LEAVE"?"SICK_LEAVE":"VACATION_LEAVE"):""),source=!record&&leave?"Approved leave":"";cells.push(`<button class="calendar-day ${inside?"":"outside"}" data-date="${text}" ${!employeeId||!inside?"disabled":""}><span class="day-number">${date.getUTCDate()}</span>${status?`<span class="day-status ${classes[status]||""}">${labels[status]||status}${source?`<br><small>${source}</small>`:""}</span>`:""}${Number.isFinite(record?.workedMinutes)?`<small>${record.workedMinutes} min worked ? ${record.lateMinutes||0} min late ? ${record.undertimeMinutes||0} min undertime</small>`:""}</button>`);}ui.calendar.innerHTML=cells.join("");}
async function setDay(date){if(!employeeId)return msg("Select an employee first.",true);try{const ref=doc(db,"payrollAttendance",`${employeeId}_${date}`);if(records.get(date)?.clockInAt&&!records.get(date)?.clockOutAt)return msg("Clock out the open shift before editing this date.",true);if(selectedStatus==="HOURS"){
  const existing = records.get(date);
  if (!existing || !["PRESENT", "HOLIDAY", "REST_DAY"].includes(existing.status)) {
    return msg("Record a worked day before entering premium hours.",true);
  }
  const hours = {};
  for (const [key,label] of [["overtimeHours","Overtime"],["holidayHours","Holiday"],["nightHours","Night"]]) {
    const answer = prompt(label + " hours on " + date, existing[key] ?? 0);
    if (answer === null) return;
    const value = Number(answer);
    if (!Number.isFinite(value) || value < 0 || value > 24) return msg("Enter hours from 0 to 24.",true);
    hours[key] = value;
  }
  await setDoc(ref,{...hours,updatedAt:serverTimestamp()},{merge:true});
  records.set(date,{...existing,...hours});
  msg("Premium hours saved for " + date + ".");
}else if(selectedStatus==="CLEAR"){await deleteDoc(ref);records.delete(date);msg(`Attendance cleared for ${date}.`);}else{let reason="";const paidLeave=$("paidLeave").checked;if(["VACATION_LEAVE","SICK_LEAVE"].includes(selectedStatus)){reason=prompt(`Reason for ${labels[selectedStatus]} on ${date}:`)||"";if(!confirm(`Record this as ${paidLeave?"paid":"unpaid"} ${labels[selectedStatus]}?`))return;}const data={employeeId,date,status:selectedStatus,leaveApproved:["VACATION_LEAVE","SICK_LEAVE"].includes(selectedStatus),paidLeave:["VACATION_LEAVE","SICK_LEAVE"].includes(selectedStatus)?paidLeave:null,overtimeHours:0,holidayHours:0,nightHours:0,notes:reason,updatedAt:serverTimestamp()};await setDoc(ref,data,{merge:true});records.set(date,data);msg(`${labels[selectedStatus]} saved for ${date}.`);}renderCalendar();}catch(x){console.error(x);msg(`Unable to update attendance: ${x.message||x}`,true);}}
function moveMonth(amount){const [y,m]=ui.month.value.split("-").map(Number),d=new Date(Date.UTC(y,m-1+amount,1));ui.month.value=d.toISOString().slice(0,7);loadMonth();}
ui.search.addEventListener("input",renderEmployees);ui.list.addEventListener("click",e=>{const button=e.target.closest("[data-id]");if(button)chooseEmployee(button.dataset.id);});document.querySelector(".status-tools").addEventListener("click",e=>{const button=e.target.closest("[data-status]");if(!button)return;selectedStatus=button.dataset.status;document.querySelectorAll("[data-status]").forEach(b=>b.classList.toggle("active",b===button));});ui.calendar.addEventListener("click",e=>{const day=e.target.closest("[data-date]");if(day&&!day.disabled)setDay(day.dataset.date);});ui.month.addEventListener("change",loadMonth);ui.previous.addEventListener("click",()=>moveMonth(-1));ui.next.addEventListener("click",()=>moveMonth(1));ui.month.value=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Manila"}).slice(0,7);loadEmployees().then(()=>{if(employees[0])chooseEmployee(employees[0].employeeId);else renderCalendar();});

const manilaDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
});

async function clock(clockOut) {
  const id = employeeId;
  const employee = employees.find(entry => entry.employeeId === id);
  if (!employee) return msg("Select an employee first.", true);
  const date = manilaDate.format(new Date());
  const settings = await getDoc(doc(db, "payrollSettings", "general"));
  const shiftHours = Number(employee.shiftHours) || Number(settings.data()?.hoursPerDay) || 8;
  const activeRef = doc(db, "payrollOpenShifts", id);
  await runTransaction(db, async transaction => {
    const active = (await transaction.get(activeRef)).data();
    if (clockOut && !active) throw new Error("This employee has no open shift.");
    if (!clockOut && active) throw new Error("Clock out the open shift first.");
    const shiftDate = active?.date || date;
    const ref = doc(db, "payrollAttendance", id + "_" + shiftDate);
    const entry = (await transaction.get(ref)).data();
    if (!clockOut) {
      if (entry?.clockInAt || (entry?.status && !["PRESENT", "HOLIDAY", "REST_DAY"].includes(entry.status))) {
        throw new Error("Review the existing attendance entry for this date first.");
      }
      transaction.set(activeRef, {date: shiftDate});
      transaction.set(ref, {
        employeeId: id, date: shiftDate, status: entry?.status || "PRESENT",
        clockInAt: serverTimestamp(), shiftHours, shiftStart: employee.shiftStart || "",
        updatedAt: serverTimestamp()
      }, {merge: true});
      return;
    }
    const started = entry?.clockInAt?.toDate();
    if (!started) throw new Error("The clock-in record is missing.");
    const now = Date.now();
    if (now < started.getTime()) throw new Error("Clock-out is earlier than clock-in.");
    const workedMinutes = Math.floor((now - started.getTime()) / 60000);
    const scheduledMinutes = Math.round((entry.shiftHours || shiftHours) * 60);
    const scheduledStart = entry.shiftStart ? Date.parse(shiftDate + "T" + entry.shiftStart + ":00+08:00") : NaN;
    const lateMinutes = Number.isFinite(scheduledStart) ? Math.max(0, Math.floor((started - scheduledStart) / 60000)) : 0;
    const scheduledEnd = Number.isFinite(scheduledStart) ? scheduledStart + scheduledMinutes * 60000 : started.getTime() + scheduledMinutes * 60000;
    const undertimeMinutes = Math.max(0, Math.floor((scheduledEnd - now) / 60000));
    transaction.update(ref, {
      clockOutAt: serverTimestamp(), workedMinutes, lateMinutes, undertimeMinutes,
      overtimeHours: Math.max(0, workedMinutes - scheduledMinutes) / 60,
      updatedAt: serverTimestamp()
    });
    transaction.delete(activeRef);
  });
  if (employeeId === id) await loadMonth();
  msg(clockOut ? "Clock-out recorded." : "Clock-in recorded.");
}

for (const [buttonId, clockOut] of [["clockIn", false], ["clockOut", true]]) {
  const button = $(buttonId);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await clock(clockOut);
    } catch (error) {
      msg(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}
