const page = location.pathname.split("/").pop() || "dashboard.html";
const nav = document.querySelector(".tabs");
const items = [
  ["dashboard.html", "Dashboard"],
  ["index.html", "Payroll"],
  ["index.html#employees", "Employees"],
  ["attendance.html", "Attendance & Leave"],
  ["index.html#special-pay", "Special pay"],
  ["index.html#history", "History"],
  ["payslips.html", "Payslips"],
  ["reports.html", "Reports"],
  ["audit.html", "Audit Log"],
  ["settings.html", "Settings"]
];

function renderNav() {
  if (!nav) return;
  nav.replaceChildren();
  for (const [href, label] of items) {
    const [target, hash = ""] = href.split("#");
    const link = document.createElement("a");
    link.href = "./" + href;
    link.textContent = label;
    const active = page === target && (location.hash.slice(1) === hash ||
      (href === "index.html" && location.hash === "#driver-reconciliation") ||
      (hash === "employees" && location.hash.startsWith("#employee/")));
    if (active) {
      link.className = "active";
      link.setAttribute("aria-current", "page");
    }
    nav.append(link);
  }
}

renderNav();
window.addEventListener("hashchange", renderNav);
