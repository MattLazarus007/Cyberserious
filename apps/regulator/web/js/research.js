/* Research register page. Reads the register, writes rows. */

document.addEventListener("DOMContentLoaded", async function () {

    const summary = document.getElementById("methodSummary");
    const caseBox = document.getElementById("researchCases");
    const sourceBox = document.getElementById("researchSources");
    const findingBox = document.getElementById("researchFindings");
    const policyBox = document.getElementById("policyVersion");

    if (!caseBox) return;

    let register;

    try {

        register = await Api.getResearch();

    } catch (err) {

        caseBox.textContent = "Sign in to read the register.";
        return;

    }

    summary.textContent =
        "Secondary-source analysis of four South African incidents between " +
        "January and May 2026, drawn from regulator guidance, the POPIA text, " +
        "national press and peer-reviewed background. No interviews, no live " +
        "systems were touched.";

    caseBox.replaceChildren();

    register.cases.forEach(function (row) {

        const head = document.createElement("h3");
        head.textContent = row.name;

        const meta = document.createElement("p");
        const tag = document.createElement("span");
        tag.className = "confidence";
        tag.textContent = row.confidence + " confidence";
        meta.append(row.sector + " · " + row.period + " · ", tag);

        const body = document.createElement("p");
        body.textContent = row.summary;

        caseBox.append(head, meta, body);

    });

    sourceBox.replaceChildren();

    register.sources.forEach(function (row) {

        const line = document.createElement("div");
        line.className = "source-row";

        const title = document.createElement("strong");
        title.textContent = row.title;

        const tag = document.createElement("span");
        tag.className = "confidence";
        tag.textContent = row.confidence;

        line.append(title, document.createTextNode(" " + row.outlet + " · "), tag);

        if (row.note) {

            const note = document.createElement("p");
            note.textContent = row.note;
            line.append(note);

        }

        sourceBox.append(line);

    });

    findingBox.replaceChildren();

    register.findings.forEach(function (row) {

        const line = document.createElement("div");
        line.className = "finding-row";

        const func = document.createElement("strong");
        func.textContent = row.csf + ": ";

        const tag = document.createElement("span");
        tag.className = "confidence";
        tag.textContent = row.confidence;

        line.append(func, document.createTextNode(row.finding + " "), tag);
        findingBox.append(line);

    });

    policyBox.replaceChildren();

    if (register.policy) {

        const body = document.createElement("p");
        body.textContent = register.policy.body;

        const meta = document.createElement("p");
        meta.textContent =
            "Version " + register.policy.version +
            ", in force from " + register.policy.effectiveFrom + ".";

        policyBox.append(body, meta);

    }

});
