/* =========================================
   CYBERSERIOUS
   Regulator pages, served data edition
   Phase 3: the browser renders what the
   server returns. Nothing lives here.
   ========================================= */


/* =========================================
   SHARED VOCABULARY
   ========================================= */

const CASE_STATES = [
    "Pending",
    "UnderReview",
    "AwaitingInformation",
    "Closed"
];


/* =========================================
   SMALL HELPERS
   ========================================= */

function getBreachIdFromURL() {

    const parameters =
        new URLSearchParams(window.location.search);

    return parameters.get("id");

}


function formatCount(value) {

    const digits = String(Number(value) || 0);

    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

}


function getStatusClass(status) {

    const normalized =
        String(status || "").toLowerCase().replace(/[\s_]/g, "");

    if (normalized === "pending") {

        return "pending";

    }

    if (normalized === "closed") {

        return "closed";

    }

    return "review";

}


function setText(id, value) {

    const el = document.getElementById(id);

    if (el) el.textContent = value;

    return el;

}


function flagError(message) {

    const count =
        document.getElementById("notificationCount");

    if (count) count.textContent = message;

}


/* =========================================
   SIGNED-IN NAME IN THE TOP BAR
   ========================================= */

async function bindUser() {

    try {

        const me = await Api.getMe();

        const bars =
            document.querySelectorAll(".user span");

        bars.forEach(function (bar) {

            bar.textContent = me.displayName;

        });

    } catch (err) {

        return;

    }

}


/* =========================================
   CASE NOT FOUND
   ========================================= */

function showCaseNotFound(caseId) {

    const title =
        document.getElementById("caseTitle");

    const orgLine =
        document.getElementById("organisationName");

    const badge =
        document.getElementById("headerStatus");

    const grid =
        document.querySelector(".detail-grid");


    if (title) {

        title.textContent = "Case not found";

    }


    if (orgLine) {

        orgLine.textContent = caseId
            ? "No case matches the reference " + caseId + "."
            : "This page needs a case reference in the link.";

    }


    if (badge) {

        badge.hidden = true;

    }


    if (grid) {

        grid.hidden = true;

    }

}


/* =========================================
   BREACH DETAIL PAGE
   ========================================= */

function fillDetail(theCase) {

    setText("caseTitle", "Breach Case #" + theCase.reference);
    setText("organisationName", theCase.orgName);

    const headerStatus =
        document.getElementById("headerStatus");

    if (headerStatus) {

        headerStatus.hidden = false;
        headerStatus.textContent =
            Api.displayState(theCase.state);

        headerStatus.className =
            "status-badge " +
            getStatusClass(theCase.state);

    }

    setText("detailCaseId", theCase.reference);
    setText("detailOrganisation",
        theCase.orgName + " (" + theCase.orgRef + ")");

    const occurred = Api.fmtDate(theCase.occurredAt);
    setText("detailIncidentDate",
        theCase.occurredPrecision &&
        theCase.occurredPrecision !== "exact"
            ? occurred + " (" + theCase.occurredPrecision + " date)"
            : occurred);

    setText("detailNotificationDate",
        "Held in the notification register. Version history ships with the intake work.");

    setText("detailBreachType",
        theCase.category || "Not recorded");

    const severity = setText("detailSeverity",
        theCase.severity ? Api.cap(theCase.severity) : "Not rated");

    if (severity) severity.className = "priority";

    const affected = theCase.affectedCount;
    setText("detailAffectedSubjects",
        affected === null || affected === undefined
            ? "Unknown (" + (theCase.countPrecision || "unconfirmed") + ")"
            : formatCount(affected) +
              (theCase.countPrecision && theCase.countPrecision !== "exact"
                ? " (" + theCase.countPrecision + ")"
                : ""));

    setText("detailDescription",
        theCase.narrative || "No narrative recorded.");

    const infoBox =
        document.getElementById("informationAffected");

    if (infoBox) {

        infoBox.replaceChildren();

        const cats = theCase.dataCategories || [];

        if (cats.length === 0) {

            infoBox.textContent = "No categories recorded.";

        }

        cats.forEach(function (cat) {

            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = cat;
            infoBox.append(chip);

        });

    }

    setText("detailOrganisationResponse",
        "The organisation's own account arrives with its notification versions.");

    const priorityDisplay =
        document.getElementById("priorityDisplay");

    if (priorityDisplay) {

        priorityDisplay.textContent =
            Api.cap(theCase.priority);

        priorityDisplay.className =
            "priority-display p-" +
            String(theCase.priority || "").toLowerCase();

    }

    setText("notificationReceived",
        "Checked against the register when intake history lands.");

    setText("notificationTiming",
        "Measured from evidence, never assumed.");

    setText("assessment",
        "A recorded human finding, not a computed value.");

    const history =
        document.getElementById("activityHistory");

    if (history) {

        history.replaceChildren();

        const line = document.createElement("p");
        line.textContent =
            "Opened " + Api.fmtDate(theCase.openedAt) +
            ". Full history appears here once case work is durable.";
        history.append(line);

    }

    const notesList =
        document.getElementById("notesList");

    if (notesList && !notesList.dataset.ready) {

        notesList.replaceChildren();

        const line = document.createElement("p");
        line.textContent =
            "No notes yet. Notes added here are kept once saving lands.";
        notesList.append(line);

    }

    const dropdown =
        document.getElementById("caseStatus");

    if (dropdown) {

        dropdown.replaceChildren();

        CASE_STATES.forEach(function (state) {

            const option = document.createElement("option");
            option.value = state;
            option.textContent = Api.displayState(state);
            dropdown.append(option);

        });

        dropdown.value = theCase.state;

    }

}


async function loadBreachDetails() {

    if (!document.getElementById("caseTitle")) return;

    const caseId = getBreachIdFromURL();

    if (!caseId) {

        showCaseNotFound();
        return;

    }

    let theCase;

    try {

        theCase = await Api.getCase(caseId);

    } catch (err) {

        if (err.status === 404) showCaseNotFound(caseId);
        return;

    }

    fillDetail(theCase);

    try {

        await Api.getMe();

    } catch (err) {

        const noteMessage =
            document.getElementById("noteMessage");

        if (noteMessage) {

            noteMessage.textContent =
                "Sign in to add notes. Saving arrives with durable case work.";

        }

    }

}


/* =========================================
   NOTE AND STATUS (SAVING ARRIVES IN PHASE 4)
   ========================================= */

function addNote() {

    const notes =
        document.getElementById("notes");

    const message =
        document.getElementById("noteMessage");


    if (!notes || !message) {

        return;

    }


    if (notes.value.trim() === "") {

        message.style.color = "#b42323";
        message.textContent = "Please enter a note first.";
        return;

    }


    message.style.color = "#6b7280";
    message.textContent =
        "Notes are kept once saving lands. For now the text stays in the box.";

}


function updateStatus() {

    const status =
        document.getElementById("caseStatus");

    const message =
        document.getElementById("statusMessage");


    if (!status || !message) {

        return;

    }


    message.style.color = "#6b7280";
    message.textContent =
        "Status changes are kept once transitions land. Nothing was saved.";

}


/* =========================================
   NOTIFICATIONS PAGE
   ========================================= */

const PAGE_SIZE = 20;

function readListParams() {

    const params =
        new URLSearchParams(window.location.search);

    return {
        q: params.get("q") || "",
        state: params.get("state") || "",
        priority: params.get("priority") || "",
        page: Math.max(1, Number(params.get("page")) || 1)
    };

}


function writeListParams(params) {

    const out = new URLSearchParams();

    if (params.q) out.set("q", params.q);
    if (params.state) out.set("state", params.state);
    if (params.priority) out.set("priority", params.priority);
    if (params.page > 1) out.set("page", String(params.page));

    const suffix = out.toString();

    history.replaceState(null, "",
        window.location.pathname + (suffix ? "?" + suffix : ""));

}


function rowFor(tableBody, item) {

    const row = document.createElement("tr");

    const idCell = document.createElement("td");
    idCell.textContent = item.reference;

    const orgCell = document.createElement("td");
    orgCell.textContent = item.orgName;

    const incidentCell = document.createElement("td");
    incidentCell.textContent = Api.fmtDate(item.occurredAt);

    const submittedCell = document.createElement("td");
    submittedCell.textContent =
        item.notified ? "On record" : "Not received";

    const priorityCell = document.createElement("td");
    const priorityBadge = document.createElement("span");
    priorityBadge.className =
        "priority " + String(item.priority || "").toLowerCase();
    priorityBadge.textContent = Api.cap(item.priority);
    priorityCell.append(priorityBadge);

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    statusBadge.className =
        "status " + getStatusClass(item.state);
    statusBadge.textContent = Api.displayState(item.state);
    statusCell.append(statusBadge);

    const actionCell = document.createElement("td");
    const viewLink = document.createElement("a");
    viewLink.className = "btn btn-secondary";
    viewLink.href =
        "breach.html?id=" + encodeURIComponent(item.reference);
    viewLink.textContent = "View";
    actionCell.append(viewLink);

    row.append(
        idCell,
        orgCell,
        incidentCell,
        submittedCell,
        priorityCell,
        statusCell,
        actionCell
    );

    tableBody.append(row);

}


function pagerInto(footer, params, total) {

    footer.replaceChildren();

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const line = document.createElement("span");
    line.textContent =
        "Page " + params.page + " of " + pages +
        " (" + total + " cases)";
    footer.append(line);

    if (params.page > 1) {

        const back = document.createElement("a");
        back.className = "btn btn-secondary";
        back.href = "#";
        back.textContent = "Previous";
        back.addEventListener("click", function (ev) {
            ev.preventDefault();
            params.page -= 1;
            writeListParams(params);
            loadNotifications();
        });
        footer.append(back);

    }

    if (params.page < pages) {

        const next = document.createElement("a");
        next.className = "btn btn-secondary";
        next.href = "#";
        next.textContent = "Next";
        next.addEventListener("click", function (ev) {
            ev.preventDefault();
            params.page += 1;
            writeListParams(params);
            loadNotifications();
        });
        footer.append(next);

    }

}


async function loadNotifications() {

    const tableBody =
        document.getElementById("notificationsTableBody");

    if (!tableBody) return;

    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const priorityFilter = document.getElementById("priorityFilter");

    statusFilter.replaceChildren();

    const allStates = document.createElement("option");
    allStates.value = "";
    allStates.textContent = "All statuses";
    statusFilter.append(allStates);

    CASE_STATES.forEach(function (state) {

        const option = document.createElement("option");
        option.value = state;
        option.textContent = Api.displayState(state);
        statusFilter.append(option);

    });

    const params = readListParams();

    searchInput.value = params.q;
    statusFilter.value = params.state;
    priorityFilter.value = params.priority;

    let page;

    try {

        page = await Api.getCases({
            q: params.q,
            state: params.state,
            page: params.page,
            pageSize: PAGE_SIZE
        });

    } catch (err) {

        flagError("Could not load the register.");
        return;

    }

    let items = page.items;

    if (params.priority) {

        const want = params.priority.toLowerCase();

        items = items.filter(function (item) {

            return String(item.priority || "").toLowerCase() === want;

        });

    }

    tableBody.replaceChildren();

    const count = document.getElementById("notificationCount");

    if (count) {

        count.textContent =
            page.total + " case" +
            (page.total === 1 ? "" : "s") + " on record";

    }

    if (items.length === 0) {

        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.textContent = "No cases match the current filters.";
        row.append(cell);
        tableBody.append(row);

    }

    items.forEach(function (item) {

        rowFor(tableBody, item);

    });

    let footer =
        document.getElementById("registerPager");

    if (!footer) {

        footer = document.createElement("div");
        footer.id = "registerPager";
        footer.className = "pager";
        tableBody.closest(".notifications-card").append(footer);

    }

    pagerInto(footer, params, page.total);

    function refresh() {

        params.q = searchInput.value.trim();
        params.state = statusFilter.value;
        params.priority = priorityFilter.value;
        params.page = 1;
        writeListParams(params);
        loadNotifications();

    }

    searchInput.oninput = refresh;
    statusFilter.onchange = refresh;
    priorityFilter.onchange = refresh;

}


/* =========================================
   DASHBOARD PAGE
   ========================================= */

async function loadDashboard() {

    const totalEl = document.getElementById("totalNotifications");
    const pendingEl = document.getElementById("pendingCases");
    const alertsEl = document.getElementById("activeAlerts");
    const activityEl = document.getElementById("recentActivity");

    if (!totalEl && !pendingEl && !alertsEl && !activityEl) return;

    let metrics;

    try {

        metrics = await Api.getDashboard();

    } catch (err) {

        return;

    }

    if (totalEl) totalEl.textContent = metrics.casesWithNotification;
    if (pendingEl) pendingEl.textContent = metrics.openCases;
    if (alertsEl) alertsEl.textContent = metrics.activeAlerts;

    if (activityEl) {

        let recent;

        try {

            recent = await Api.getCases({ page: 1, pageSize: 5 });

        } catch (err) {

            return;

        }

        activityEl.replaceChildren();

        recent.items.forEach(function (item) {

            const row = document.createElement("tr");

            const idCell = document.createElement("td");
            const idWrap = document.createElement("span");
            idWrap.className = "case-id";
            idWrap.textContent = item.reference;
            idCell.append(idWrap);

            const orgCell = document.createElement("td");
            orgCell.textContent = item.orgName;

            const stateCell = document.createElement("td");
            const badge = document.createElement("span");
            badge.className =
                "status-badge " + getStatusClass(item.state);
            badge.textContent = Api.displayState(item.state);
            stateCell.append(badge);

            row.append(idCell, orgCell, stateCell);
            activityEl.append(row);

        });

    }

    const panel = document.getElementById("priorityAlerts");

    if (panel) {

        let live;

        try {

            live = await Api.getAlerts();

        } catch (err) {

            return;

        }

        const tone = { high: "high", medium: "medium", low: "info" };

        panel.replaceChildren();

        live.items.slice(0, 3).forEach(function (entry) {

            const item = document.createElement("div");
            const symbol = document.createElement("div");
            const copy = document.createElement("div");
            const title = document.createElement("strong");
            const why = document.createElement("p");
            const when = document.createElement("span");

            item.className = "alert-item";
            symbol.className =
                "alert-symbol " + (tone[entry.priority] || "info");
            symbol.setAttribute("aria-hidden", "true");
            symbol.textContent = "!";

            copy.className = "alert-copy";
            title.textContent =
                entry.ruleId + (entry.caseRef ? " · " + entry.caseRef : "");
            why.textContent = entry.reason;
            when.className = "alert-time";
            when.textContent = "Raised " + Api.fmtDate(entry.firstSeenAt);

            copy.append(title, why, when);
            item.append(symbol, copy);
            panel.append(item);

        });

    }

}


/* =========================================
   ALERTS PAGE
   ========================================= */

function alertCard(entry, orgName, occurred) {

    const card = document.createElement("div");
    card.className = "alert-card";
    card.dataset.priority = entry.priority;
    card.dataset.rule = entry.ruleId;

    const header = document.createElement("div");
    header.className = "alert-card-header";

    const titleBox = document.createElement("div");
    const priority = document.createElement("span");
    priority.className =
        "priority-badge " + String(entry.priority).toLowerCase();
    priority.textContent = Api.cap(entry.priority) + " priority";

    const heading = document.createElement("h3");
    heading.textContent = entry.ruleId;

    titleBox.append(priority, heading);

    const pill = document.createElement("span");
    pill.className =
        "status-pill " + (entry.state === "open" ? "action" : "monitoring");
    pill.textContent =
        entry.state === "open" ? "Needs review" : entry.state;

    header.append(titleBox, pill);

    const why = document.createElement("p");
    why.textContent = entry.reason;

    const meta = document.createElement("div");
    meta.className = "alert-meta";

    const rows = [
        ["Alert", entry.ruleId + " v" + entry.ruleVersion],
        ["Organisation", orgName],
        ["Incident", occurred],
        ["Raised", Api.fmtDate(entry.firstSeenAt)]
    ];

    rows.forEach(function ([label, value]) {

        const wrap = document.createElement("span");
        const key = document.createElement("strong");
        key.textContent = label + ":";
        wrap.append(key, document.createTextNode(" " + value));
        meta.append(wrap);

    });

    const actions = document.createElement("div");
    const openLink = document.createElement("a");
    const note = document.createElement("span");

    actions.className = "alert-actions";
    openLink.className = "btn-primary";
    openLink.textContent = "Investigate";

    if (entry.caseRef) {

        openLink.href = "breach.html?id=" + entry.caseRef;

    } else {

        openLink.href = "notifications.html";
        openLink.textContent = "Open register";

    }

    note.className = "alert-note";
    note.textContent =
        "Acknowledge and resolve actions arrive with the rules worker.";

    actions.append(openLink, note);
    card.append(header, why, meta, actions);

    return card;

}


async function loadAlerts() {

    const listEl = document.getElementById("alertList");

    if (!listEl) return;

    const countEl = document.getElementById("activeAlertCount");
    const searchInput = document.getElementById("alertSearch");
    const prioritySelect = document.getElementById("alertPriority");
    const ruleSelect = document.getElementById("alertType");

    let entries;

    try {

        const [alertsPage, casesPage] = await Promise.all([
            Api.getAlerts(),
            Api.getCases({ page: 1, pageSize: 50 })
        ]);

        const byId = {};

        casesPage.items.forEach(function (item) {

            byId[item.id] = item;

        });

        entries = alertsPage.items.map(function (entry) {

            const related = entry.caseId ? byId[entry.caseId] : null;

            return {
                entry: entry,
                org: related ? related.orgName : "Not in this dataset",
                occurred: related ? Api.fmtDate(related.occurredAt) : "Unknown"
            };

        });

    } catch (err) {

        listEl.replaceChildren();

        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Alerts could not be loaded.";
        listEl.append(empty);
        return;

    }

    const rules = [];
    entries.forEach(function (wrap) {
        if (!rules.includes(wrap.entry.ruleId)) rules.push(wrap.entry.ruleId);
    });

    ruleSelect.replaceChildren();

    const allRules = document.createElement("option");
    allRules.value = "";
    allRules.textContent = "All alert rules";
    ruleSelect.append(allRules);

    rules.forEach(function (rule) {
        const option = document.createElement("option");
        option.value = rule;
        option.textContent = rule;
        ruleSelect.append(option);
    });

    function render(shown) {

        listEl.replaceChildren();

        if (shown.length === 0) {

            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "No alerts match the current filters.";
            listEl.append(empty);
            countEl.textContent = "0 active alerts";
            return;

        }

        shown.forEach(function (wrap) {

            listEl.append(alertCard(wrap.entry, wrap.org, wrap.occurred));

        });

        countEl.textContent =
            shown.length + " active alert" +
            (shown.length === 1 ? "" : "s");

    }

    function applyFilters() {

        const term =
            (searchInput.value || "").toLowerCase().trim();

        const shown = entries.filter(function (wrap) {

            const haystack = [
                wrap.entry.ruleId,
                wrap.entry.reason,
                wrap.org
            ].join(" ").toLowerCase();

            return (!term || haystack.includes(term)) &&
                (!prioritySelect.value ||
                    wrap.entry.priority === prioritySelect.value) &&
                (!ruleSelect.value ||
                    wrap.entry.ruleId === ruleSelect.value);

        });

        render(shown);

    }

    render(entries);

    searchInput.addEventListener("input", applyFilters);
    prioritySelect.addEventListener("change", applyFilters);
    ruleSelect.addEventListener("change", applyFilters);

}


/* =========================================
   ONE BOOTSTRAP
   ========================================= */

document.addEventListener("DOMContentLoaded", function () {

    bindUser();
    loadBreachDetails();
    loadDashboard();
    loadNotifications();
    loadAlerts();

});
