"use strict";
const $ = (id) => document.getElementById(id);
let chart;
async function api(url, body) {
    const res = await fetch(url, body === undefined ? undefined : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
const say = (msg) => { $("status").textContent = msg; };
const pct = (v, max) => (max > 0 ? +((v / max) * 100).toFixed(1) : 0);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => s.replace(/[&<>"]/g, c => ESC[c]);
const rowEls = () => Array.from(document.querySelectorAll("#inputs [data-subject]"));
const field = (el, name) => el.querySelector(`[name=${name}]`);
const NOTE = { "Random guess": "note-random", "Subject average": "", "Learned model": "note-model" };
const RING = `<svg class="ring" viewBox="0 0 120 64" aria-hidden="true"><path pathLength="1" d="M62 5C27 3 6 16 7 34c1 17 27 26 58 25 31-1 49-14 47-30C110 13 88 2 52 8"/></svg>`;
function buildForm(subjects) {
    $("inputs").innerHTML = Object.entries(subjects).map(([s, max]) => `
    <li class="row" data-subject="${esc(s)}">
      <div class="min-w-0">
        <h3 class="text-xl font-bold leading-tight">${esc(s)}</h3>
        <p class="src note">–</p>
      </div>
      <div class="flex items-center gap-1">
        <span class="ringbox">${RING}<span class="pred">–</span></span>
        <span class="of text-dust">/ ${max}</span>
      </div>
      <label class="block"><span class="text-sm text-dust">Real mark</span>
        <input name="actual" type="number" min="0" step="any" inputmode="decimal" placeholder="after the exam" class="field hand"></label>
      <label class="block"><span class="text-sm text-dust">Out of</span>
        <input name="max" type="number" min="1" step="any" inputmode="decimal" value="${max}" class="field"></label>
    </li>`).join("");
}
// Ask the model for its next guess in every subject; each guess is remembered so it can be scored later.
async function refreshGuesses() {
    const subjects = {};
    rowEls().forEach(r => { subjects[r.dataset.subject] = +field(r, "max").value; });
    const guesses = await api("/api/predict", { subjects });
    guesses.forEach(g => {
        const r = rowEls().find(x => x.dataset.subject === g.subject);
        r.dataset.pred = String(g.predicted);
        r.querySelector(".pred").textContent = String(g.predicted);
        r.querySelector(".of").textContent = `/ ${g.max}`;
        r.querySelector(".src").textContent = g.source;
        r.querySelector(".src").className = `src note ${NOTE[g.source] ?? ""}`;
        const ring = r.querySelector(".ring"); // redraw the circle so a new guess is noticed
        ring.classList.remove("draw");
        void ring.getBoundingClientRect();
        ring.classList.add("draw");
    });
}
function render(m) {
    const { rmse, baseline_rmse: base, live } = m;
    $("model").textContent = m.model;
    $("rows").textContent = String(m.rows);
    $("bars").classList.toggle("hidden", rmse === null || base === null);
    if (rmse !== null && base !== null) {
        const top = Math.max(rmse, base) || 1;
        $("bar-m").style.width = `${(rmse / top) * 100}%`;
        $("bar-b").style.width = `${(base / top) * 100}%`;
        $("bar-mv").textContent = rmse.toFixed(1);
        $("bar-bv").textContent = base.toFixed(1);
        const better = base > 0 ? Math.round((1 - rmse / base) * 100) : 0;
        $("verdict").textContent = `On exams it hasn't seen, it misses by about ${rmse.toFixed(1)} marks.`;
        $("vs").textContent = better > 0
            ? `That is ${better}% closer than guessing your average (${base.toFixed(1)} marks).`
            : "That is no better than guessing your average, so for now it uses your average.";
    }
    else {
        $("verdict").textContent = m.rows === 0
            ? "It has no marks to learn from yet, so its first guesses are random."
            : "It is still learning. Keep adding your real marks.";
        $("vs").textContent = "Enter your real marks after each exam. It trains on them straight away and tests itself once it has enough.";
    }
    $("live").textContent = live
        ? `The guesses you saw before each exam were off by about ${live.rmse.toFixed(1)} marks (${live.count} checked).`
        : "";
    const hasChart = m.comparison.length > 0 && typeof Chart !== "undefined";
    $("chart-wrap").classList.toggle("hidden", !hasChart);
    $("chart-empty").classList.toggle("hidden", hasChart);
    chart?.destroy();
    chart = undefined;
    if (!hasChart)
        return;
    const pts = m.comparison.map(c => ({ x: pct(c.actual, c.max), y: pct(c.predicted, c.max), s: c.subject }));
    const lo = Math.max(0, Math.floor(Math.min(...pts.map(p => Math.min(p.x, p.y))) / 10) * 10 - 10);
    const axis = (title) => ({
        min: lo, max: 100, title: { display: true, text: title, color: "#8fa6a3" },
        ticks: { color: "#8fa6a3" }, grid: { color: "rgba(238,240,228,.1)" }, border: { color: "rgba(238,240,228,.2)" },
    });
    chart = new Chart($("history"), {
        type: "scatter",
        data: { datasets: [
                { label: "Exams", data: pts, backgroundColor: "#f2d16b", pointRadius: 5, pointHoverRadius: 7 },
                { type: "line", label: "Perfect guess", data: [{ x: lo, y: lo }, { x: 100, y: 100 }],
                    borderColor: "rgba(238,240,228,.4)", borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0 },
            ] },
        options: {
            maintainAspectRatio: false,
            scales: { x: axis("Real mark (%)"), y: axis("Predicted (%)") },
            plugins: { legend: { display: false }, tooltip: { callbacks: {
                        label: (c) => (c.raw.s ? `${c.raw.s}: real ${c.raw.x}%, predicted ${c.raw.y}%` : ""),
                    } } },
        },
    });
}
function showFeedback(items) {
    $("feedback-panel").classList.toggle("hidden", items.length === 0);
    $("feedback").innerHTML = items.map(f => `
    <li class="fb">
      <div><div class="font-bold">${esc(f.subject)}</div><div class="note">guessed ${f.predicted}, got ${f.actual} out of ${f.max}</div></div>
      <span class="err">off by ${Math.abs(f.predicted - f.actual).toFixed(1)}</span>
    </li>`).join("");
}
$("save").onclick = async () => {
    const results = rowEls().filter(r => field(r, "actual").value !== "").map(r => ({
        subject: r.dataset.subject, max_marks: +field(r, "max").value, actual_marks: +field(r, "actual").value,
        predicted_marks: r.dataset.pred === undefined ? undefined : +r.dataset.pred,
    }));
    if (!results.length)
        return say("Type your real marks for at least one subject.");
    const btn = $("save");
    btn.disabled = true;
    try {
        const m = await api("/api/results", { rows: results });
        render(m);
        showFeedback(m.feedback ?? []);
        rowEls().forEach(r => { field(r, "actual").value = ""; });
        await refreshGuesses(); // the model has retrained, so these are its new guesses
        say(`Saved ${results.length} result(s) and retrained.`);
    }
    catch (e) {
        say(e.message);
    }
    finally {
        btn.disabled = false;
    }
};
$("inputs").addEventListener("change", e => {
    if (e.target.name === "max")
        refreshGuesses().catch(err => say(err.message));
});
api("/api/metrics")
    .then(async (m) => { buildForm(m.subjects); render(m); await refreshGuesses(); })
    .catch(e => say(e.message));