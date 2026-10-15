/* =========================================
   CYBERSERIOUS
   Application Data & Functions
   Phase 1 Prototype
   ========================================= */


/* =========================================
   MOCK BREACH DATA
   ========================================= */

const breaches = [

    {
        id: "BR-2026-001",
        organisation: "Standard Bank",
        incidentDate: "12 August 2026",
        notificationDate: "13 August 2026",
        breachType: "Unauthorised Access",
        severity: "High",
        affectedSubjects: 2450,
        status: "Under Review",
        priority: "High",

        description:
            "The organisation reported unauthorised access to an internal system. The incident may have resulted in unauthorised access to personal information belonging to customers. The organisation is currently investigating the extent of the incident.",

        informationAffected: [
            "Names",
            "Contact Information",
            "Account Information",
            "Identification Information"
        ],

        organisationResponse:
            "The organisation has confirmed that an investigation is underway and has indicated that affected systems have been secured. Further information has been requested.",

        notificationReceived: "Yes",
        notificationTiming: "Within expected timeframe",
        assessment: "Under Assessment",

        activity: [
            {
                event: "Notification submitted",
                date: "13 Aug 2026"
            },
            {
                event: "Case assigned for review",
                date: "14 Aug 2026"
            },
            {
                event: "Regulator review started",
                date: "15 Aug 2026"
            }
        ]
    },


    {
        id: "BR-2026-002",
        organisation: "Liberty Group",
        incidentDate: "08 August 2026",
        notificationDate: "08 August 2026",
        breachType: "Unauthorised Access",
        severity: "Medium",
        affectedSubjects: 830,
        status: "Closed",
        priority: "Medium",

        description:
            "The organisation reported an incident involving unauthorised access to an internal application. The organisation investigated the incident and implemented additional security controls.",

        informationAffected: [
            "Names",
            "Contact Information"
        ],

        organisationResponse:
            "The organisation has completed its investigation and implemented additional security controls.",

        notificationReceived: "Yes",
        notificationTiming: "Within expected timeframe",
        assessment: "Compliant",

        activity: [
            {
                event: "Notification submitted",
                date: "08 Aug 2026"
            },
            {
                event: "Case assigned for review",
                date: "09 Aug 2026"
            },
            {
                event: "Case closed",
                date: "15 Aug 2026"
            }
        ]
    },


    {
        id: "BR-2026-003",
        organisation: "Statistics South Africa",
        incidentDate: "02 August 2026",
        notificationDate: "03 August 2026",
        breachType: "Data Exposure",
        severity: "High",
        affectedSubjects: 5100,
        status: "Pending",
        priority: "High",

        description:
            "A potential data exposure incident was identified involving information stored within an organisational system. The extent of the exposure remains under investigation.",

        informationAffected: [
            "Names",
            "Contact Information",
            "Demographic Information"
        ],

        organisationResponse:
            "The organisation has initiated an investigation and is assessing the potential impact on affected data subjects.",

        notificationReceived: "Yes",
        notificationTiming: "Within expected timeframe",
        assessment: "Under Assessment",

        activity: [
            {
                event: "Incident identified",
                date: "02 Aug 2026"
            },
            {
                event: "Notification submitted",
                date: "03 Aug 2026"
            },
            {
                event: "Case pending regulator review",
                date: "04 Aug 2026"
            }
        ]
    },


    {
        id: "BR-2026-004",
        organisation: "Gauteng Provincial Government",
        incidentDate: "25 July 2026",
        notificationDate: "28 July 2026",
        breachType: "Cyberattack",
        severity: "High",
        affectedSubjects: 12000,
        status: "Alert",
        priority: "High",

        description:
            "A cyberattack affected systems operated by the organisation. The incident resulted in disruption to systems and raised concerns regarding potential exposure of personal information.",

        informationAffected: [
            "Names",
            "Identification Information",
            "Contact Information",
            "Government Service Information"
        ],

        organisationResponse:
            "The organisation has reported that affected systems were secured and that an investigation into the incident is ongoing.",

        notificationReceived: "Yes",
        notificationTiming: "Potentially delayed",
        assessment: "Requires Review",

        activity: [
            {
                event: "Incident identified",
                date: "25 Jul 2026"
            },
            {
                event: "Notification received",
                date: "28 Jul 2026"
            },
            {
                event: "Potential compliance alert created",
                date: "29 Jul 2026"
            }
        ]
    },


    {
        id: "BR-2026-005",
        organisation: "Example Healthcare",
        incidentDate: "20 July 2026",
        notificationDate: "21 July 2026",
        breachType: "Personal Information Exposure",
        severity: "Low",
        affectedSubjects: 340,
        status: "Closed",
        priority: "Low",

        description:
            "A limited exposure of personal information was identified within an internal system. The organisation investigated the incident and confirmed that the exposure was contained.",

        informationAffected: [
            "Names",
            "Contact Information"
        ],

        organisationResponse:
            "The organisation confirmed that the incident was contained and corrective measures were implemented.",

        notificationReceived: "Yes",
        notificationTiming: "Within expected timeframe",
        assessment: "Compliant",

        activity: [
            {
                event: "Notification submitted",
                date: "21 Jul 2026"
            },
            {
                event: "Investigation completed",
                date: "25 Jul 2026"
            },
            {
                event: "Case closed",
                date: "28 Jul 2026"
            }
        ]
    },


    {
        id: "BR-2026-006",
        organisation: "Example Financial Services",
        incidentDate: "18 July 2026",
        notificationDate: "20 July 2026",
        breachType: "Unauthorised Access",
        severity: "Medium",
        affectedSubjects: 1700,
        status: "Under Review",
        priority: "Medium",

        description:
            "An unauthorised access incident was identified affecting an internal financial services application.",

        informationAffected: [
            "Names",
            "Contact Information",
            "Financial Information"
        ],

        organisationResponse:
            "The organisation has provided an initial response and additional information has been requested.",

        notificationReceived: "Yes",
        notificationTiming: "Requires verification",
        assessment: "Under Assessment",

        activity: [
            {
                event: "Incident identified",
                date: "18 Jul 2026"
            },
            {
                event: "Notification submitted",
                date: "20 Jul 2026"
            },
            {
                event: "Additional information requested",
                date: "22 Jul 2026"
            }
        ]
    },


    {
        id: "BR-2026-007",
        organisation: "Example Financial Services",
        incidentDate: "14 August 2026",
        notificationDate: null,
        breachType: "Potential Data Breach",
        severity: "High",
        affectedSubjects: 3200,
        status: "Alert",
        priority: "High",

        description:
            "A potential data breach has been identified. No corresponding Section 22 notification has currently been located in the prototype system.",

        informationAffected: [
            "Unknown"
        ],

        organisationResponse:
            "No notification has been received at this stage.",

        notificationReceived: "No",
        notificationTiming: "Not Received",
        assessment: "Potential Non-Compliance",

        activity: [
            {
                event: "Potential incident identified",
                date: "14 Aug 2026"
            },
            {
                event: "Compliance alert created",
                date: "15 Aug 2026"
            }
        ]
    }

];


/* =========================================
   FIND A BREACH
   ========================================= */

function getBreachById(id) {

    return breaches.find(function (breach) {

        return breach.id === id;

    });

}


/* =========================================
   GET ID FROM URL
   ========================================= */

function getBreachIdFromURL() {

    const parameters =
        new URLSearchParams(window.location.search);

    return parameters.get("id");

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
   LOAD BREACH DETAILS
   ========================================= */

function loadBreachDetails() {

    const caseId = getBreachIdFromURL();

    /*
        No ID in the link means
        there is no case to show.
    */

    if (!caseId) {

        showCaseNotFound();

        return;

    }


    const breach = getBreachById(caseId);


    /*
        An unknown ID gets the not-found
        state, not the previous case fields.
    */

    if (!breach) {

        showCaseNotFound(caseId);

        return;

    }


    /* -----------------------------------------
       HEADER
       ----------------------------------------- */

    const caseTitle =
        document.getElementById("caseTitle");

    if (caseTitle) {

        caseTitle.textContent =
            "Breach Case #" + breach.id;

    }


    const organisationName =
        document.getElementById("organisationName");

    if (organisationName) {

        organisationName.textContent =
            breach.organisation;

    }


    /* -----------------------------------------
       INCIDENT INFORMATION
       ----------------------------------------- */

    const detailCaseId =
        document.getElementById("detailCaseId");

    if (detailCaseId) {

        detailCaseId.textContent =
            breach.id;

    }


    const detailOrganisation =
        document.getElementById("detailOrganisation");

    if (detailOrganisation) {

        detailOrganisation.textContent =
            breach.organisation;

    }


    const detailIncidentDate =
        document.getElementById("detailIncidentDate");

    if (detailIncidentDate) {

        detailIncidentDate.textContent =
            breach.incidentDate;

    }


    const detailNotificationDate =
        document.getElementById("detailNotificationDate");

    if (detailNotificationDate) {

        detailNotificationDate.textContent =
            breach.notificationDate ||
            "Not Received";

    }


    const detailBreachType =
        document.getElementById("detailBreachType");

    if (detailBreachType) {

        detailBreachType.textContent =
            breach.breachType;

    }


    const detailSeverity =
        document.getElementById("detailSeverity");

    if (detailSeverity) {

        detailSeverity.textContent =
            breach.severity;

        detailSeverity.className =
            "priority " +
            breach.severity.toLowerCase();

    }


    const detailAffectedSubjects =
        document.getElementById(
            "detailAffectedSubjects"
        );

    if (detailAffectedSubjects) {

        detailAffectedSubjects.textContent =
            breach.affectedSubjects.toLocaleString();

    }


    /* -----------------------------------------
       DESCRIPTION
       ----------------------------------------- */

    const description =
        document.getElementById(
            "detailDescription"
        );

    if (description) {

        description.textContent =
            breach.description;

    }


    /* -----------------------------------------
       INFORMATION AFFECTED
       ----------------------------------------- */

    const information =
        document.getElementById(
            "informationAffected"
        );

    if (information) {

        information.innerHTML = "";


        breach.informationAffected.forEach(
            function (item) {

                const badge =
                    document.createElement("span");

                badge.className =
                    "status review";

                badge.textContent =
                    item;

                information.appendChild(
                    badge
                );

            }
        );

    }


    /* -----------------------------------------
       ORGANISATION RESPONSE
       ----------------------------------------- */

    const response =
        document.getElementById(
            "detailOrganisationResponse"
        );

    if (response) {

        response.textContent =
            breach.organisationResponse;

    }


    /* -----------------------------------------
       SECTION 22 ASSESSMENT
       ----------------------------------------- */

    const notificationReceived =
        document.getElementById(
            "notificationReceived"
        );

    if (notificationReceived) {

        notificationReceived.textContent =
            breach.notificationReceived;

    }


    const notificationTiming =
        document.getElementById(
            "notificationTiming"
        );

    if (notificationTiming) {

        notificationTiming.textContent =
            breach.notificationTiming;

    }


    const assessment =
        document.getElementById(
            "assessment"
        );

    if (assessment) {

        assessment.textContent =
            breach.assessment;

    }


    /* -----------------------------------------
       ACTIVITY HISTORY
       ----------------------------------------- */

    const activityHistory =
        document.getElementById(
            "activityHistory"
        );

    if (activityHistory) {

        activityHistory.innerHTML = "";


        breach.activity.forEach(
            function (activity, index) {

                const activityItem =
                    document.createElement("div");


                activityItem.style.paddingBottom =
                    "15px";

                activityItem.style.marginBottom =
                    "15px";


                if (
                    index <
                    breach.activity.length - 1
                ) {

                    activityItem.style.borderBottom =
                        "1px solid #dfe4ea";

                }


                activityItem.innerHTML = `

                    <strong style="font-size: 13px;">
                        ${activity.event}
                    </strong>

                    <p style="
                        font-size: 12px;
                        color: #6b7280;
                        margin-top: 4px;
                    ">
                        ${activity.date}
                    </p>

                `;


                activityHistory.appendChild(
                    activityItem
                );

            }
        );

    }


    /* -----------------------------------------
       STATUS
       ----------------------------------------- */

    const statusDropdown =
        document.getElementById(
            "caseStatus"
        );

    if (statusDropdown) {

        statusDropdown.value =
            breach.status;

    }

}


/* =========================================
   ADD INTERNAL NOTE
   ========================================= */

function addNote() {

    const notes =
        document.getElementById("notes");

    const message =
        document.getElementById(
            "noteMessage"
        );


    if (!notes || !message) {

        return;

    }


    if (notes.value.trim() === "") {

        message.style.color =
            "#dc3545";

        message.textContent =
            "Please enter a note first.";

        return;

    }


    message.style.color =
        "#198754";

    message.textContent =
        "Note added successfully (prototype only).";


    notes.value = "";

}


/* =========================================
   UPDATE STATUS
   ========================================= */

function updateStatus() {

    const status =
        document.getElementById(
            "caseStatus"
        );

    const message =
        document.getElementById(
            "statusMessage"
        );


    if (!status || !message) {

        return;

    }


    message.style.color =
        "#198754";

    message.textContent =
        "Case status updated to: " +
        status.value +
        " (prototype only).";

}


/* =========================================
   START APPLICATION
   ========================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadBreachDetails();

    }
);

/* =========================================
   NOTIFICATIONS PAGE
   ========================================= */

function loadNotifications() {

    const tableBody =
        document.getElementById(
            "notificationsTableBody"
        );


    /*
        If this element doesn't exist,
        we're not on the Notifications page.
    */

    if (!tableBody) {

        return;

    }


    const searchInput =
        document.getElementById(
            "searchInput"
        );

    const statusFilter =
        document.getElementById(
            "statusFilter"
        );

    const priorityFilter =
        document.getElementById(
            "priorityFilter"
        );


    function renderNotifications() {

        const search =
            searchInput.value
                .toLowerCase()
                .trim();

        const selectedStatus =
            statusFilter.value;

        const selectedPriority =
            priorityFilter.value;


        /*
            Filter the breach data.
        */

        const filteredBreaches =
            breaches.filter(
                function (breach) {


                    /*
                        Search organisation,
                        case ID or breach type.
                    */

                    const matchesSearch =
                        breach.organisation
                            .toLowerCase()
                            .includes(search)

                        ||

                        breach.id
                            .toLowerCase()
                            .includes(search)

                        ||

                        breach.breachType
                            .toLowerCase()
                            .includes(search);


                    /*
                        Check status filter.
                    */

                    const matchesStatus =
                        selectedStatus === "" ||

                        breach.status ===
                            selectedStatus;


                    /*
                        Check priority filter.
                    */

                    const matchesPriority =
                        selectedPriority === "" ||

                        breach.priority ===
                            selectedPriority;


                    return (
                        matchesSearch &&
                        matchesStatus &&
                        matchesPriority
                    );

                }
            );


        /*
            Clear the existing table.
        */

        tableBody.innerHTML = "";


        /*
            Update notification count.
        */

        const count =
            document.getElementById(
                "notificationCount"
            );


        if (count) {

            count.textContent =
                filteredBreaches.length +
                " notification" +
                (
                    filteredBreaches.length === 1
                        ? ""
                        : "s"
                );

        }


        /*
            If nothing matches,
            show a message.
        */

        if (
            filteredBreaches.length === 0
        ) {

            tableBody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        style="
                            text-align: center;
                            padding: 30px;
                            color: #6b7280;
                        "
                    >

                        No notifications found.

                    </td>

                </tr>

            `;

            return;

        }


        /*
            Create a table row for
            every matching breach.
        */

        filteredBreaches.forEach(
            function (breach) {


                const row =
                    document.createElement("tr");


                /*
                    Determine the CSS class
                    for the priority badge.
                */

                const priorityClass =
                    breach.priority
                        .toLowerCase();


                /*
                    Determine the CSS class
                    for the status badge.
                */

                let statusClass =
                    "review";


                if (
                    breach.status ===
                    "Pending"
                ) {

                    statusClass =
                        "pending";

                }

                else if (
                    breach.status ===
                    "Closed"
                ) {

                    statusClass =
                        "closed";

                }

                else if (
                    breach.status ===
                    "Alert"
                ) {

                    statusClass =
                        "alert";

                }


                /*
                    Display a friendly
                    notification date.
                */

                const submitted =
                    breach.notificationDate ||
                    "Not received";


                row.innerHTML = `

                    <td>

                        ${breach.id}

                    </td>


                    <td>

                        ${breach.organisation}

                    </td>


                    <td>

                        ${breach.incidentDate}

                    </td>


                    <td>

                        ${submitted}

                    </td>


                    <td>

                        <span
                            class="priority ${priorityClass}"
                        >

                            ${breach.priority}

                        </span>

                    </td>


                    <td>

                        <span
                            class="status ${statusClass}"
                        >

                            ${breach.status}

                        </span>

                    </td>


                    <td>

                        <a
                            href="breach.html?id=${breach.id}"
                            class="btn btn-secondary"
                        >

                            View

                        </a>

                    </td>

                `;


                tableBody.appendChild(row);

            }
        );

    }


    /*
        Run the table once when the page loads.
    */

    renderNotifications();


    /*
        Re-render when the user searches.
    */

    searchInput.addEventListener(
        "input",
        renderNotifications
    );


    /*
        Re-render when status changes.
    */

    statusFilter.addEventListener(
        "change",
        renderNotifications
    );


    /*
        Re-render when priority changes.
    */

    priorityFilter.addEventListener(
        "change",
        renderNotifications
    );
}


document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadBreachDetails();

        loadDashboard();

        loadNotifications();

    }
);

/* =========================================
   DASHBOARD
   ========================================= */

function loadDashboard() {

    const totalNotifications =
        document.getElementById("totalNotifications");

    const pendingCases =
        document.getElementById("pendingCases");

    const activeAlerts =
        document.getElementById("activeAlerts");


    // If these elements don't exist,
    // we're not on the Dashboard page.

    if (
        !totalNotifications &&
        !pendingCases &&
        !activeAlerts
    ) {
        return;
    }


    // Total number of breach records

    const total =
        breaches.length;


    // All cases that are still ongoing.
    // Anything that is NOT closed counts as ongoing.

    const ongoing =
        breaches.filter(function (breach) {

            return breach.status !== "Closed";

        }).length;


    // Cases currently flagged as alerts

    const alerts =
        breaches.filter(function (breach) {

            return breach.status === "Alert";

        }).length;


    // Put the values into the dashboard

    if (totalNotifications) {

        totalNotifications.textContent =
            total;

    }


    if (pendingCases) {

        pendingCases.textContent =
            ongoing;

    }


    if (activeAlerts) {

        activeAlerts.textContent =
            alerts;

    }

}