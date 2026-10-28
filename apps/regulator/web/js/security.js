/* Security page. Reads one server summary and writes text nodes only. */

(function () {
    "use strict";

    function text(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function hourLabel(hours) {
        if (hours === null || hours === undefined) return "No archive";
        if (hours < 1) return "Under an hour";
        return hours + (hours === 1 ? " hour" : " hours");
    }

    function renderHeartbeats(items) {
        const body = document.getElementById("heartbeatRows");
        if (!body) return;
        body.replaceChildren();
        if (!items.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 4;
            cell.textContent = "No heartbeat recorded yet.";
            row.append(cell);
            body.append(row);
            return;
        }
        for (const item of items) {
            const row = document.createElement("tr");
            const source = document.createElement("td");
            source.textContent = item.source;
            const seen = document.createElement("td");
            seen.textContent = new Date(item.lastSeenAt).toLocaleString();
            const age = document.createElement("td");
            age.textContent = item.ageSeconds + " s";
            const state = document.createElement("td");
            state.textContent = item.silent ? "Silent" : "Alive";
            row.append(source, seen, age, state);
            body.append(row);
        }
    }

    function renderExports(items) {
        const body = document.getElementById("exportRows");
        if (!body) return;
        body.replaceChildren();
        if (!items.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 6;
            cell.textContent = "No export recorded yet.";
            row.append(cell);
            body.append(row);
            return;
        }
        for (const item of items) {
            const row = document.createElement("tr");
            const when = document.createElement("td");
            when.textContent = new Date(item.createdAt).toLocaleString();
            const actor = document.createElement("td");
            actor.textContent = item.actor;
            const resource = document.createElement("td");
            resource.textContent = item.kind + " " + item.resource;
            const rows = document.createElement("td");
            rows.textContent = String(item.rows);
            const bytes = document.createElement("td");
            bytes.textContent = String(item.bytes);
            const pii = document.createElement("td");
            pii.textContent = Object.entries(item.pii || {}).map(function (pair) {
                return pair[0] + " " + pair[1];
            }).join(", ") || "none";
            row.append(when, actor, resource, rows, bytes, pii);
            body.append(row);
        }
    }

    function renderBans(items) {
        const body = document.getElementById("banRows");
        if (!body) return;
        body.replaceChildren();
        if (!items.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.textContent = "No address is banned.";
            row.append(cell);
            body.append(row);
            return;
        }
        for (const item of items) {
            const row = document.createElement("tr");
            const ip = document.createElement("td");
            ip.textContent = item.ip;
            const reason = document.createElement("td");
            reason.textContent = item.reason || "not stated";
            const at = document.createElement("td");
            at.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : "unknown";
            const until = document.createElement("td");
            until.textContent = item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "manual";
            const action = document.createElement("td");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn-secondary";
            button.textContent = "Unban";
            button.addEventListener("click", async function () {
                button.disabled = true;
                try {
                    await Api.unbanIp(item.ip);
                    await load();
                } catch (err) {
                    button.disabled = false;
                }
            });
            action.append(button);
            row.append(ip, reason, at, until, action);
            body.append(row);
        }
    }

    async function load() {
        const error = document.getElementById("securityError");
        try {
            const state = await Api.getSecurityState();
            text("eventTotal", String(state.events.total));
            text("eventNote", state.events.last24h + " in the last 24 hours, " + state.events.high24h + " high");
            text("chainState", state.events.chain.ok ? "Intact" : "Broken");
            text("chainNote", state.events.chain.checked + " rows checked");
            const open = state.alerts.high + state.alerts.medium + state.alerts.low;
            text("alertTotal", String(open));
            text("alertNote", state.alerts.high + " high, " + state.alerts.medium + " medium, " + state.alerts.low + " low");
            text("backupAge", hourLabel(state.backup.ageHours));
            text("backupNote", state.backup.latest || "No sealed archive found");
            renderHeartbeats(state.heartbeats || []);
            renderExports(state.exports || []);
            renderBans(state.bannedIps || []);
            if (state.trip.locked) {
                const note = document.createElement("li");
                note.textContent = "The trip wire is locked. Normal routes answer 503 until an operator clears it.";
                document.getElementById("securityNotes").append(note);
            }
        } catch (err) {
            if (error) {
                error.hidden = false;
                error.textContent = err && err.status === 403
                    ? "This page needs an audit or security role."
                    : "The security summary is not available right now.";
            }
        }
    }

    const button = document.getElementById("verifyButton");
    if (button) {
        button.addEventListener("click", async function () {
            button.disabled = true;
            try {
                const result = await Api.verifySecurity();
                text("chainState", result.ok ? "Intact" : "Broken");
                text("chainNote", result.checked + " rows checked just now");
            } catch (err) {
                const error = document.getElementById("securityError");
                if (error) {
                    error.hidden = false;
                    error.textContent = "Chain verification needs an audit or security role.";
                }
            } finally {
                button.disabled = false;
            }
        });
    }

    load();
})();
