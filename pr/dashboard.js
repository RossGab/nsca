import { earningsCategories, payrollTrend } from "./payroll-trend.js";
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";import{collection,getDocs,initializeFirestore,query,where}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";const cfg={apiKey:"AIzaSyDFW61pnwLvh6HGKWt10zLYNr860fI8vkg",authDomain:"driva-pwa.firebaseapp.com",projectId:"driva-pwa",appId:"1:299138219722:web:623ff6b0a067ea822dfe33"},db=initializeFirestore(initializeApp(cfg),{},"drver-task"),$=id=>document.getElementById(id),money=new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}),today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Manila"});async function load(){try{const day=today(),[e,a,l,p]=await Promise.all([getDocs(collection(db,"payrollEmployees")),getDocs(query(collection(db,"payrollAttendance"),where("date","==",day))),getDocs(collection(db,"payrollLeaves")),getDocs(collection(db,"payrollRuns"))]);let active=0,present=0,pending=0,unpaid=0,runs=[];e.forEach(d=>{if(d.data().active!==false)active++});a.forEach(d=>{if(d.data().status==="PRESENT")present++});l.forEach(d=>{if(d.data().status==="PENDING")pending++});p.forEach(d=>{const x={id:d.id,...d.data()};runs.push(x);if(x.status!=="PAID")unpaid++});$("activeEmployees").textContent=active;$("attendanceToday").textContent=present;$("pendingLeaves").textContent=pending;$("unpaidRuns").textContent=unpaid;renderTrend(runs);runs.sort((x,y)=>String(y.periodTo).localeCompare(String(x.periodTo)));$("recent").innerHTML=runs.length?runs.slice(0,8).map(x=>`<tr><td>${x.periodFrom} to ${x.periodTo}</td><td><span class="status-pill ${x.status}">${x.status}</span></td><td class="number">${x.totals?.employeeCount||0}</td><td class="number gross">${money.format(x.totals?.netPay??x.totals?.grossPay??0)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty">No saved payroll.</td></tr>';$("message").hidden=true;}catch(x){console.error(x);$("trendBasis").textContent="Payout history could not be loaded.";$("message").hidden=false;$("message").className="message error";$("message").textContent=`Unable to load dashboard: ${x.message||x}`;}}

const monthLabel = new Intl.DateTimeFormat("en-PH", {month: "short", year: "numeric", timeZone: "UTC"});

function renderTrend(runs) {
  const {history, forecast, baselineMonths} = payrollTrend(runs);
  const points = [...history, ...forecast];
  const max = Math.max(1, ...points.map(point => point.amount ?? 0));
  const chart = $("trendChart");
  const table = $("trendRows");
  chart.replaceChildren();
  table.replaceChildren();
  $("trendBasis").textContent = baselineMonths
    ? `Forecast uses the average of the latest ${baselineMonths} completed payout ${baselineMonths === 1 ? "month" : "months"}. The current month shows payouts to date.`
    : forecast[0].amount !== null
      ? "Forecast uses two payouts at this month's average payout. The current month shows payouts to date."
      : "No dated, paid runs with gross totals are available for a forecast.";
  points.forEach(({month, amount, breakdown}, index) => {
    const estimated = index >= history.length;
    const label = monthLabel.format(new Date(month + "-01T00:00:00Z"));
    const type = estimated ? "Forecast" : "Paid";
    const value = amount === null ? (estimated ? "Unavailable" : "No payouts") : money.format(amount);
    const accessibleLabel = `${label}, ${type}: ${value}`;
    const column = document.createElement("div");
    column.className = "trend-column" + (estimated ? " forecast" : "");
    column.title = accessibleLabel;
    column.setAttribute("role", "img");
    column.setAttribute("aria-label", accessibleLabel);
    const track = document.createElement("div");
    track.className = "trend-track";
    if (breakdown && amount > 0) {
      const stack = document.createElement("div");
      stack.className = "trend-stack";
      stack.style.height = amount / max * 100 + "%";
      for (const [key, name] of earningsCategories) {
        if (!breakdown[key]) continue;
        const segment = document.createElement("span");
        segment.className = "trend-segment earnings-" + key;
        segment.style.flexGrow = breakdown[key];
        segment.title = `${label} ? ${type} ? ${name}: ${money.format(breakdown[key])}`;
        stack.append(segment);
      }
      track.append(stack);
    }
    const caption = document.createElement("span");
    caption.className = "trend-month";
    caption.textContent = label.split(" ")[0];
    if (index === 0 || month.endsWith("-01")) {
      const year = document.createElement("small");
      year.textContent = month.slice(0, 4);
      caption.append(year);
    }
    column.append(track, caption);
    chart.append(column);

    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = type;
    for (const [key] of earningsCategories) {
      const cell = row.insertCell();
      cell.className = "number";
      cell.textContent = breakdown ? money.format(breakdown[key]) : "?";
    }
    const cell = row.insertCell();
    cell.className = "number gross";
    cell.textContent = value;
  });
}
$("refresh").addEventListener("click", load);
load();
