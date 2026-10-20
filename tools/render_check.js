// Renders each page in a real DOM and checks what a user sees.
// Needs a static server on 8023 (`python3 -m http.server 8023`) and jsdom:
//   npm install jsdom --no-save
// Run: node tools/render_check.js
const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = "http://localhost:8023";
let failures = 0;

function check(label, actual, expected) {
    const ok = String(actual) === String(expected);
    if (!ok) failures++;
    console.log(`${ok ? "pass" : "FAIL"}  ${label}: ${JSON.stringify(actual)}` +
        (ok ? "" : ` (expected ${JSON.stringify(expected)})`));
}

async function load(path) {
    const vc = new VirtualConsole();
    vc.on("jsdomError", () => {});
    const dom = await JSDOM.fromURL(`${BASE}/${path}`, {
        runScripts: "dangerously",
        resources: "usable",
        pretendToBeVisual: true,
        virtualConsole: vc,
    });
    await new Promise(resolve => {
        if (dom.window.document.readyState === "complete") return resolve();
        dom.window.addEventListener("load", resolve);
    });
    await new Promise(resolve => setTimeout(resolve, 150));
    return dom.window;
}

function textOf(win, selector) {
    const node = win.document.querySelector(selector);
    return node ? node.textContent.trim() : "(missing)";
}

(async () => {
    console.log("== dashboard ==");
    let win = await load("index.html");
    check("notifications received", textOf(win, "#totalNotifications"), "6");
    check("open cases", textOf(win, "#pendingCases"), "5");
    check("active alerts", textOf(win, "#activeAlerts"), "3");
    check("recent activity rows", win.document.querySelectorAll("#recentActivity tr").length, 5);
    check("priority alert cards", win.document.querySelectorAll("#priorityAlerts .alert-item").length, 3);
    const firstRowId = win.document.querySelector("#recentActivity tr td").textContent.trim();
    check("newest incident first", firstRowId, "BR-2026-001");
    check("banner present", win.document.querySelectorAll(".demo-banner").length, 1);
    win.close();

    console.log("== notifications ==");
    win = await load("notifications.html");
    check("table rows", win.document.querySelectorAll("#notificationsTableBody tr").length, 7);
    check("count text", textOf(win, "#notificationCount"), "7 of 7 records");
    check("status filter options", win.document.querySelectorAll("#statusFilter option").length, 5);
    const statusSelect = win.document.getElementById("statusFilter");
    statusSelect.value = "Awaiting Information";
    statusSelect.dispatchEvent(new win.Event("change"));
    await new Promise(r => setTimeout(r, 80));
    check("filtered rows (Awaiting Information)", win.document.querySelectorAll("#notificationsTableBody tr").length, 1);
    check("filtered count text", textOf(win, "#notificationCount"), "1 of 7 records");
    win.close();

    console.log("== alerts ==");
    win = await load("alerts.html");
    check("alert cards", win.document.querySelectorAll("#alertList .alert-card").length, 3);
    check("badge text", textOf(win, "#activeAlertCount"), "3 active alerts");
    const ruleSelect = win.document.getElementById("alertType");
    ruleSelect.value = "No submission on record";
    ruleSelect.dispatchEvent(new win.Event("change"));
    await new Promise(r => setTimeout(r, 80));
    check("filtered cards", win.document.querySelectorAll("#alertList .alert-card").length, 1);
    check("investigate link target",
        win.document.querySelector("#alertList .alert-card a").getAttribute("href"),
        "breach.html?id=BR-2026-007");
    win.close();

    console.log("== breach detail, valid id ==");
    win = await load("breach.html?id=BR-2026-003");
    check("title", textOf(win, "#caseTitle"), "Breach Case #BR-2026-003");
    check("organisation", textOf(win, "#organisationName"), "Highveld Municipal Services");
    check("header badge follows the record", textOf(win, "#headerStatus"), "Pending");
    check("priority display", textOf(win, "#priorityDisplay"), "HIGH");
    check("severity", textOf(win, "#detailSeverity"), "High");
    check("affected subjects", textOf(win, "#detailAffectedSubjects"), "5,100");
    check("a renamed case still binds its own fields", textOf(win, "#detailCaseId"), "BR-2026-003");
    check("activity items", win.document.querySelectorAll("#activityHistory > div").length, 3);
    check("status dropdown follows the record", win.document.getElementById("caseStatus").value, "Pending");
    check("status options", win.document.querySelectorAll("#caseStatus option").length, 4);
    win.close();

    console.log("== breach detail, unknown id ==");
    win = await load("breach.html?id=nope");
    check("title", textOf(win, "#caseTitle"), "Case not found");
    check("message", textOf(win, "#organisationName"), "No case matches the reference nope.");
    check("detail grid hidden", win.document.querySelector(".detail-grid").hidden, true);
    check("badge hidden", win.document.getElementById("headerStatus").hidden, true);
    win.close();

    console.log("== breach detail, no id ==");
    win = await load("breach.html");
    check("title", textOf(win, "#caseTitle"), "Case not found");
    check("message", textOf(win, "#organisationName"), "This page needs a case reference in the link.");
    win.close();

    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
})();