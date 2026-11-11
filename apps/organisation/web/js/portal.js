/* Organisation portal: drafts from writing to receipt. */

document.addEventListener("DOMContentLoaded", function () {

    const list = document.getElementById("draftList");
    const message = document.getElementById("portalMessage");
    let role = null;

    if (!list) return;

    function say(text, bad) {
        message.style.color = bad ? "#b42323" : "#13784f";
        message.textContent = text;
    }

    async function call(path, opts) {
        const res = await fetch(path, opts);
        if (res.status === 401 || res.status === 403) {
            throw new Error("Sign in as steward1 or io1 first.");
        }
        if (!res.ok) {
            const body = await res.json().catch(function () { return {}; });
            throw new Error(body.error || ("Request failed: " + res.status));
        }
        return res.json();
    }

    function button(label, fn) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-secondary";
        btn.textContent = label;
        btn.addEventListener("click", fn);
        return btn;
    }

    function metaLine(text) {
        const line = document.createElement("p");
        line.className = "draft-meta";
        line.textContent = text;
        return line;
    }

    function stamp(value) {
        if (!value) return "no time recorded";
        return String(value).slice(0, 16).replace("T", " ") + " UTC";
    }

    function runHistory(items) {
        const box = document.createElement("div");
        box.className = "run-list";
        if (items.length === 0) {
            box.textContent = "No affected-person notice is recorded for this draft yet.";
            return box;
        }
        items.forEach(function (run) {
            box.append(metaLine(
                "Recorded dispatch (lab simulation): " + run.sentCount + " of " +
                run.affectedTotal + " sent by " + run.channel + ", " +
                run.failedCount + " failed on " + stamp(run.completedAt) +
                ". Regulator report: " + run.regulatorStatus + "."
            ));
        });
        return box;
    }

    async function refresh() {
        let page;
        try {
            page = await call("/api/v1/drafts");
        } catch (err) {
            list.replaceChildren();
            const line = document.createElement("p");
            line.textContent = err.message;
            list.append(line);
            return;
        }
        list.replaceChildren();
        if (page.items.length === 0) {
            const line = document.createElement("p");
            line.textContent = "No drafts yet.";
            list.append(line);
        }
        page.items.forEach(function (draft) {
            const card = document.createElement("div");
            card.className = "draft-card";

            const head = document.createElement("h3");
            head.textContent = draft.publicId + " · revision " + draft.revision + " ";

            const tag = document.createElement("span");
            tag.className = "draft-status";
            tag.textContent = draft.status;
            head.append(tag);

            const body = document.createElement("p");
            body.textContent = draft.category + ": " + draft.narrative;

            const countLine = metaLine(
                draft.affectedCount === null || draft.affectedCount === undefined
                    ? "Affected people: not recorded."
                    : "Affected people: " + draft.affectedCount + "."
            );

            const actions = document.createElement("div");
            actions.className = "draft-actions";
            actions.append(
                button("Send for approval", async function () {
                    await call("/api/v1/drafts/" + draft.publicId + "/submit", { method: "POST" });
                    say(draft.publicId + " waits for the information officer.");
                    refresh();
                }),
                button("Approve (IO only)", async function () {
                    await call("/api/v1/drafts/" + draft.publicId + "/approve", { method: "POST" });
                    say(draft.publicId + " approved at its current revision.");
                    refresh();
                }),
                button("Sign and send", async function () {
                    try {
                        const done = await call("/api/v1/drafts/" + draft.publicId + "/send", { method: "POST" });
                        say("Receipt kept: case " + done.receipt.caseRef + ".");
                    } catch (err) {
                        say(err.message, true);
                    }
                    refresh();
                })
            );

            const parts = [head, body, countLine];
            if (draft.receipt) {
                const receipt = document.createElement("p");
                receipt.textContent = "Receipt: case " + draft.receipt.caseRef + ", test receiver.";
                parts.push(receipt);
            }
            parts.push(actions);

            if (role === "information_officer" &&
                    (draft.status === "Approved" || draft.status === "Acknowledged")) {
                const channel = document.createElement("select");
                channel.setAttribute("aria-label", "Notice channel for " + draft.publicId);
                [["email", "Email"], ["letter", "Letter"], ["website", "Website notice"],
                 ["news", "News media"], ["sms", "SMS"], ["phone", "Phone call"]]
                    .forEach(function (pair) {
                        const option = document.createElement("option");
                        option.value = pair[0];
                        option.textContent = pair[1];
                        channel.append(option);
                    });
                // Section 22(5) wants four particulars in the notice. The
                // officer edits these before the notice goes out.
                const consequences = document.createElement("textarea");
                consequences.setAttribute("aria-label", "Possible consequences for " + draft.publicId);
                consequences.value = "Unauthorised access may expose the " + draft.category +
                    " information recorded in submission " + draft.publicId + ".";
                const measures = document.createElement("textarea");
                measures.setAttribute("aria-label", "Measures taken for " + draft.publicId);
                measures.value = "The case is contained, the affected account is disabled and the register is sealed.";
                const advice = document.createElement("textarea");
                advice.setAttribute("aria-label", "Advice for the affected person in " + draft.publicId);
                advice.value = "Change your password and report unexpected contact to the information officer.";
                actions.append(consequences, measures, advice, channel,
                    button("Notify affected people (IO only)", async function () {
                    try {
                        const done = await call("/api/v1/drafts/" + draft.publicId + "/notify", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                                channel: channel.value,
                                consequencesText: consequences.value,
                                measuresText: measures.value,
                                adviceText: advice.value
                            })
                        });
                        const run = done.runs[0];
                        const text = "Recorded dispatch (lab simulation): " + run.sentCount +
                            " of " + run.affectedTotal + " sent by " + run.channel + ", " +
                            run.failedCount + " failed." +
                            (done.warning
                                ? " " + done.warning
                                : " The regulator accepted the affected notice.");
                        say(text, Boolean(done.warning));
                        refresh();
                    } catch (err) {
                        say(err.message, true);
                    }
                }));
                parts.push(metaLine("Recorded dispatch (lab simulation). No real message leaves this machine."));
            }

            parts.forEach(function (part) { card.append(part); });
            list.append(card);

            call("/api/v1/drafts/" + draft.publicId + "/notifications")
                .then(function (page) { card.append(runHistory(page.items)); })
                .catch(function () { card.append(runHistory([])); });
        });
    }

    document.getElementById("createDraft").addEventListener("click", async function () {
        const category = document.getElementById("newCategory").value.trim();
        const narrative = document.getElementById("newNarrative").value.trim();
        const raw = document.getElementById("newAffectedCount").value.trim();
        const affectedCount = raw === "" ? null : Number(raw);
        if (!category || !narrative) {
            say("A draft needs a category and a narrative.", true);
            return;
        }
        if (affectedCount !== null && (!Number.isInteger(affectedCount) || affectedCount < 0)) {
            say("Affected people must be a whole number, 0 or more.", true);
            return;
        }
        try {
            await call("/api/v1/drafts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    category: category,
                    narrative: narrative,
                    affectedCount: affectedCount
                })
            });
            document.getElementById("newCategory").value = "";
            document.getElementById("newNarrative").value = "";
            document.getElementById("newAffectedCount").value = "";
            say("Draft saved.");
            refresh();
        } catch (err) {
            say(err.message, true);
        }
    });

    async function loadRole() {
        try {
            const me = await call("/api/v1/drafts/whoami");
            role = me.role;
        } catch (err) {
            role = null;
        }
        if (role) {
            const hint = document.getElementById("signInHint");
            if (hint) hint.hidden = true;
        }
    }

    loadRole().then(refresh);

});
