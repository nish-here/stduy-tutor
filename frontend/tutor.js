"use strict";
(() => {
    const $ = (id) => document.getElementById(id);
    let chat = [];
    let busy = false;
    function add(role, text) {
        const li = document.createElement("li");
        li.className = `msg msg-${role}`;
        li.textContent = text; // plain text only, so nothing from the AI can run as HTML
        $("log").appendChild(li);
        li.scrollIntoView({ block: "end", behavior: "smooth" });
        return li;
    }
    function reset() {
        chat = [];
        $("log").innerHTML = "";
        $("starters").classList.remove("hidden");
    }
    async function send() {
        const box = $("ask");
        const text = box.value.trim();
        if (!text || busy)
            return;
        busy = true;
        $("send").disabled = true;
        box.value = "";
        $("starters").classList.add("hidden");
        chat.push({ role: "user", content: text });
        add("user", text);
        const bubble = add("assistant", "Thinking…");
        try {
            const res = await fetch("/api/tutor/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: $("subject").value, messages: chat }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const { reply } = (await res.json());
            chat.push({ role: "assistant", content: reply });
            bubble.textContent = reply;
        }
        catch (e) {
            bubble.textContent = e.message;
            bubble.classList.add("msg-error");
        }
        finally {
            busy = false;
            $("send").disabled = false;
            bubble.scrollIntoView({ block: "end", behavior: "smooth" });
            box.focus();
        }
    }
    $("send").onclick = send;
    $("reset").onclick = reset;
    $("subject").onchange = reset; // a new subject starts a fresh conversation
    $("ask").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    document.querySelectorAll("#starters [data-fill]").forEach(b => {
        b.onclick = () => { const box = $("ask"); box.value = b.dataset.fill; box.focus(); };
    });
    fetch("/api/tutor/subjects").then(r => r.json()).then((names) => {
        $("subject").insertAdjacentHTML("beforeend", names.map(n => {
            const o = document.createElement("option");
            o.value = o.textContent = n;
            return o.outerHTML;
        }).join(""));
    }).catch(() => { });
})();