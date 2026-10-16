/* Shared fetch layer for the regulator pages.
   One place owns HTTP, sign-in prompts and display wording. */

var Api = (function () {

    function signInBar() {
        if (document.getElementById("signin-bar")) return;
        const bar = document.createElement("div");
        bar.id = "signin-bar";
        bar.className = "demo-banner";
        const link = document.createElement("a");
        link.href = "login.html";
        link.textContent = "Sign in";
        bar.append("This workspace needs a signed-in analyst. ", link, ".");
        document.body.prepend(bar);
    }

    async function call(path, opts) {
        let res;
        try {
            res = await fetch(path, opts);
        } catch (err) {
            throw new Error("The server is not answering. Start it with npm run dev.");
        }
        if (res.status === 401 || res.status === 403) {
            signInBar();
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
