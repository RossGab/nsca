const page=location.pathname.split("/").pop()||"dashboard.html";
const items=[["dashboard.html","Dashboard"],["index.html","Payroll"],["index.html?view=employees#employees","Employees"],["attendance.html","Attendance & Leave"],["index.html?view=history#history","History"],["payslips.html","Payslips"],["reports.html","Reports"],["audit.html","Audit Log"],["settings.html","Settings"]];
const nav=document.querySelector(".tabs");
if(nav)nav.innerHTML=items.map(([href,label])=>{const target=href.split(/[?#]/)[0],hash=href.includes("#")?`#${href.split("#")[1]}`:"",active=page===target&&(hash?location.hash===hash:page!=="index.html"||!location.hash);return`<a class="${active?"active":""}" href="./${href}">${label}</a>`}).join("");
