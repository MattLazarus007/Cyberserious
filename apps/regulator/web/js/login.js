/* Lab sign-in: password first, console code second. */

document.addEventListener("DOMContentLoaded", function () {

    const passwordForm = document.getElementById("passwordForm");
    const otpForm = document.getElementById("otpForm");
    const loginMessage = document.getElementById("loginMessage");
    const otpMessage = document.getElementById("otpMessage");

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
