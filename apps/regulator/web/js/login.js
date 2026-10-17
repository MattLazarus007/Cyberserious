/* Lab sign-in: password first, console code second. */

document.addEventListener("DOMContentLoaded", function () {

    const passwordForm = document.getElementById("passwordForm");
    const otpForm = document.getElementById("otpForm");
    const loginMessage = document.getElementById("loginMessage");
    const otpMessage = document.getElementById("otpMessage");
    const groupForm = document.getElementById("groupForm");
    const groupMessage = document.getElementById("groupMessage");

    fetch("/api/v1/auth-mode").then(function (res) {
        if (!res.ok) return null;
        return res.json();
    }).then(function (mode) {
        if (!mode || !groupForm) return;
        if (mode.groupOpen) {
            groupForm.hidden = false;
            return;
        }
        groupForm.remove();
    }).catch(function () {
        if (groupForm) groupForm.remove();
    });

    groupForm.addEventListener("submit", async function (ev) {

        ev.preventDefault();
        groupMessage.textContent = "Checking…";

        const passphrase = document.getElementById("groupPassphrase").value;

        let res;
        try {
            res = await fetch("/api/v1/login/group", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ passphrase: passphrase })
            });
        } catch (err) {
            groupMessage.textContent = "The server is not answering.";
            return;
        }

        if (!res.ok) {
            groupMessage.textContent = "Those details did not match.";
            return;
        }

        window.location.href = "index.html";

    });

    passwordForm.addEventListener("submit", async function (ev) {

        ev.preventDefault();
        loginMessage.textContent = "Checking…";

        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        let res;
        try {
            res = await fetch("/api/v1/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ username: username, password: password })
            });
        } catch (err) {
            loginMessage.textContent = "The server is not answering.";
            return;
        }

        if (res.status === 429) {
            loginMessage.textContent = "Too many attempts. Wait a little while.";
            return;
        }

        if (!res.ok) {
            loginMessage.textContent = "Those details did not match.";
            return;
        }

        const body = await res.json();

        if (body.ok) {
            window.location.href = "index.html";
            return;
        }

        passwordForm.hidden = true;
        otpForm.hidden = false;
        otpMessage.textContent =
            "Read the six-digit code from the server terminal, then enter it here.";
        document.getElementById("otp").focus();

    });

    otpForm.addEventListener("submit", async function (ev) {

        ev.preventDefault();
        otpMessage.textContent = "Checking…";

        const code = document.getElementById("otp").value.trim();

        let res;
        try {
            res = await fetch("/api/v1/login/otp", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ code: code })
            });
        } catch (err) {
            otpMessage.textContent = "The server is not answering.";
            return;
        }

        if (!res.ok) {
            otpMessage.textContent = "That code did not match. Try again.";
            return;
        }

        window.location.href = "index.html";

    });

});
