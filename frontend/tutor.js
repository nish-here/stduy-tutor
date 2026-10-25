"use strict";
(() => {
    const $ = (id) => document.getElementById(id);
    const STORE = "tutor.chats.v1";
    // <render>
    const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    const esc = (s) => s.replace(/[&<>"]/g, c => ESC[c]);
    /** Turn a message into safe HTML. LaTeX maths becomes KaTeX; replies from the AI also get Markdown. */
    function renderRich(src, markdown) {
        const math = [];
        const hold = (tex, display) => {
            math.push(typeof katex === "undefined"
                ? esc(display ? `$$${tex}$$` : `$${tex}$`)
                : katex.renderToString(tex, { displayMode: display, throwOnError: false }));
            return `@@M${math.length - 1}@@`; // markdown must not touch the maths, so it waits here
        };
        const text = src
            .replace(/\$\$([\s\S]+?)\$\$/g, (_m, t) => hold(t, true))
            .replace(/\\\[([\s\S]+?)\\\]/g, (_m, t) => hold(t, true))
            .replace(/\\\(([\s\S]+?)\\\)/g, (_m, t) => hold(t, false))
            .replace(/(?<![\\$])\$(?![\s$])([^\n$]+?)(?<![\s\\])\$(?!\d)/g, (_m, t) => hold(t, false));
        const html = markdown && typeof marked !== "undefined" && typeof DOMPurify !== "undefined"
            ? DOMPurify.sanitize(marked.parse(text))
            : esc(text); // without the libraries, show plain text rather than unchecked HTML
        return html.replace(/@@M(\d+)@@/g, (_m, i) => math[+i]);
    }
    // </render>
    const uid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}${Math.random()}`);
    const subjectBox = () => $("subject");
    function loadChats() {
        try {
            const data = JSON.parse(localStorage.getItem(STORE) || "[]");
            return Array.isArray(data) ? data.filter(c => c && Array.isArray(c.messages) && c.messages.length) : [];
        }
        catch {
            return [];
        }
    }
    const save = () => {
        try {
            localStorage.setItem(STORE, JSON.stringify(chats.filter(c => c.messages.length)));
        }
        catch { /* storage blocked or full */ }
    };
    let chats = loadChats();
    let busy = false;
    function startChat() {
        const c = { id: uid(), title: "New chat", subject: subjectBox().value, messages: [], updated: Date.now() };
        chats.unshift(c);
        return c;
    }
    let current = startChat();
    function addMsg(role, content) {
        const li = document.createElement("li");
        li.className = `msg msg-${role}`;
        li.innerHTML = renderRich(content, role === "assistant");
        $("log").appendChild(li);
        li.scrollIntoView({ block: "end" });
        return li;
    }
    function renderLog() {
        $("log").innerHTML = "";
        current.messages.forEach(m => addMsg(m.role, m.content));
        $("hero").classList.toggle("hidden", current.messages.length > 0);
        $("scroll").scrollTop = $("scroll").scrollHeight;
    }
    function renderSidebar() {
        const list = $("chats");
        list.innerHTML = "";
        chats.slice().sort((a, b) => b.updated - a.updated).forEach(c => {
            const li = document.createElement("li");
            li.className = "chatitem";
            if (c === current)
                li.setAttribute("aria-current", "true");
            const pick = document.createElement("button");
            pick.className = "pick";
            const title = document.createElement("span");
            title.className = "t";
            title.textContent = c.title;
            const sub = document.createElement("span");
            sub.className = "s";
            sub.textContent = c.subject || "Any subject";
            pick.append(title, sub);
            pick.onclick = () => select(c);
            const del = document.createElement("button");
            del.className = "del";
            del.textContent = "×";
            del.setAttribute("aria-label", `Delete chat: ${c.title}`);
            del.onclick = () => remove(c);
            li.append(pick, del);
            list.append(li);
        });
    }
    function select(c) {
        const prev = current;
        current = c;
        if (prev !== c && !prev.messages.length)
            chats = chats.filter(x => x !== prev); // drop an unused empty chat
        subjectBox().value = c.subject;
        renderLog();
        renderSidebar();
        $("sidebar").classList.remove("open");
    }
    function remove(c) {
        if (c.messages.length && !confirm(`Delete "${c.title}"?`))
            return;
        chats = chats.filter(x => x !== c);
        save();
        if (c === current)
            select(startChat());
        else
            renderSidebar();
    }
    async function send() {
        const box = $("ask");
        const btn = $("send");
        const text = box.value.trim();
        if (!text || busy)
            return;
        busy = true;
        btn.disabled = true;
        box.value = "";
        const chat = current; // the reply belongs to this chat even if you switch away while waiting
        chat.subject = subjectBox().value;
        chat.messages.push({ role: "user", content: text });
        if (chat.title === "New chat")
            chat.title = text.replace(/\s+/g, " ").slice(0, 40);
        chat.updated = Date.now();
        $("hero").classList.add("hidden");
        addMsg("user", text);
        const bubble = addMsg("assistant", "Thinking…");
        renderSidebar();
        save();
        try {
            const res = await fetch("/api/tutor/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: chat.subject, messages: chat.messages }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const { reply } = (await res.json());
            chat.messages.push({ role: "assistant", content: reply });
            chat.updated = Date.now();
            save();
            bubble.innerHTML = renderRich(reply, true);
        }
        catch (e) {
            bubble.textContent = e.message;
            bubble.classList.add("msg-error");
        }
        finally {
            busy = false;
            btn.disabled = false;
            renderSidebar();
            if (current === chat) {
                bubble.scrollIntoView({ block: "end" });
                box.focus();
            }
        }
    }
    $("send").onclick = send;
    $("new").onclick = () => { if (current.messages.length)
        select(startChat());
    else
        $("sidebar").classList.remove("open"); $("ask").focus(); };
    $("show-chats").onclick = () => $("sidebar").classList.add("open");
    $("hide-chats").onclick = () => $("sidebar").classList.remove("open");
    subjectBox().onchange = () => { current.subject = subjectBox().value; renderSidebar(); save(); };
    $("ask").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    document.querySelectorAll("#starters [data-fill]").forEach(b => {
        b.onclick = () => { const box = $("ask"); box.value = b.dataset.fill; box.focus(); };
    });
    select(current);
    fetch("/api/tutor/subjects").then(r => r.json()).then((names) => {
        names.forEach(n => { const o = document.createElement("option"); o.value = o.textContent = n; subjectBox().appendChild(o); });
        subjectBox().value = current.subject;
    }).catch(() => { });
})();