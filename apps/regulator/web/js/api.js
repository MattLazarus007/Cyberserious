/* Shared fetch layer for the regulator pages.
   One place owns HTTP, sign-in prompts and display wording. */

var Api = (function () {

    function lockScreen() {
        if (document.getElementById("screen-lock")) return;
        const overlay = document.createElement("div");
        overlay.id = "screen-lock";
        overlay.className = "screen-lock";
        overlay.setAttribute("role", "alertdialog");
        overlay.setAttribute("aria-label", "Sign in needed");
        const card = document.createElement("div");
        card.className = "screen-lock-card";
        const title = document.createElement("h2");
        title.textContent = "Sign in needed";
        const copy = document.createElement("p");
        copy.textContent = "This workspace needs a signed-in analyst.";
        const link = document.createElement("a");
        link.href = "login.html";
        link.className = "btn-primary";
        link.textContent = "Sign in";
        card.append(title, copy, link);
        overlay.append(card);
        document.body.append(overlay);
    }

    function unlockScreen() {
        const overlay = document.getElementById("screen-lock");
        if (overlay) overlay.remove();
    }

    async function call(path, opts) {
        let res;
        try {
            res = await fetch(path, opts);
        } catch (err) {
            throw new Error("The server is not answering. Start it with npm run dev.");
        }
        if (res.status === 401 || res.status === 403) {
            lockScreen();
            const err = new Error("Signed in access needed.");
            err.status = res.status;
            throw err;
        }
        if (!res.ok) {
            const err = new Error("Request failed with status " + res.status + ".");
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    const states = {
        Pending: "Pending",
        UnderReview: "Under Review",
        AwaitingInformation: "Awaiting Information",
        Closed: "Closed"
    };

    function displayState(state) {
        return states[state] || state || "Unknown";
    }

    function cap(value) {
        if (!value) return "Not set";
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    function fmtDate(iso) {
        if (!iso) return "Unknown";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "Unknown";
        return d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear();
    }

    let meCache = null;

    async function getMe() {
        if (!meCache) meCache = await call("/api/v1/me");
        return meCache;
    }

    function getDashboard() {
        return call("/api/v1/dashboard");
    }

    function getCases(params) {
        const query = new URLSearchParams();
        if (params) {
            for (const key of ["state", "q", "page", "pageSize"]) {
                if (params[key] !== undefined && params[key] !== "") query.set(key, params[key]);
            }
        }
        const suffix = query.toString();
        return call("/api/v1/cases" + (suffix ? "?" + suffix : ""));
    }

    function getCase(id) {
        return call("/api/v1/cases/" + encodeURIComponent(id));
    }

    function getAlerts() {
        return call("/api/v1/alerts");
    }

    function getResearch() {
        return call("/api/v1/research");
    }

    function getCaseDuties(id) {
        return call("/api/v1/cases/" + encodeURIComponent(id) + "/obligations");
    }

    function alertAction(id, action, body) {
        return call("/api/v1/alerts/" + encodeURIComponent(id) + "/" + action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body || {})
        });
    }

    return {
        lockScreen: lockScreen,
        unlockScreen: unlockScreen,
        getMe: getMe,
        getDashboard: getDashboard,
        getCases: getCases,
        getCase: getCase,
        getAlerts: getAlerts,
        getResearch: getResearch,
        getCaseDuties: getCaseDuties,
        alertAction: alertAction,
        displayState: displayState,
        cap: cap,
        fmtDate: fmtDate
    };

})();
