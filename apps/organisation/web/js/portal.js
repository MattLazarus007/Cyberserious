/* Organisation portal: drafts from writing to receipt. */

document.addEventListener("DOMContentLoaded", function () {

    const list = document.getElementById("draftList");
    const message = document.getElementById("portalMessage");

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
                    const done = await call("/api/v1/drafts/" + draft.publicId + "/send", { method: "POST" });
                    say("Receipt kept: case " + done.receipt.caseRef + ".");
                    refresh();
                })
            );

            if (draft.receipt) {
                const receipt = document.createElement("p");
                receipt.textContent = "Receipt: case " + draft.receipt.caseRef + ", test receiver.";
                card.append(head, body, receipt, actions);
            } else {
                card.append(head, body, actions);
            }
            list.append(card);
        });
    }

    document.getElementById("createDraft").addEventListener("click", async function () {
        const category = document.getElementById("newCategory").value.trim();
        const narrative = document.getElementById("newNarrative").value.trim();
        if (!category || !narrative) {
            say("A draft needs a category and a narrative.", true);
            return;
        }
        try {
            await call("/api/v1/drafts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ category: category, narrative: narrative })
            });
            document.getElementById("newCategory").value = "";
            document.getElementById("newNarrative").value = "";
            say("Draft saved.");
            refresh();
        } catch (err) {
            say(err.message, true);
        }
    });

    refresh();

});
