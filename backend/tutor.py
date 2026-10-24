"""Tutor chat: a study tutor backed by your own AI API (see llm.py)."""
from flask import Blueprint, jsonify, request

from llm import LLMError, chat
from train import SUBJECTS, load

bp = Blueprint("tutor", __name__)
MAX_MESSAGES = 20  # only the latest messages are sent, to keep each request small
RULES = """You are a patient, encouraging study tutor for a school student.
- Explain step by step in simple words, with one small example.
- Guide instead of just handing over homework answers: give a hint first, and the full solution if they are stuck.
- End most replies with one short question that checks they understood.
- Keep replies short. Write plain text only, with no markdown or headings. Use hyphens for lists and write maths like x^2 or 3/4.
- Reply in the language the student writes in. If you are not sure about a fact, say so.
- If the student seems stressed, be kind and suggest one small next step."""


def system_prompt(subject) -> str:
    text = RULES
    if subject in SUBJECTS:
        text += f"\n\nThe student wants help with {subject}."
        df = load()
        recent = df.loc[df.subject == subject, "pct"].round().astype(int).tolist()[-5:]
        if recent:
            text += f" Their recent results in it, oldest to newest, were {recent} percent. Pitch your explanations to match."
    return text


@bp.get("/api/tutor/subjects")
def subjects():
    return jsonify(list(SUBJECTS))


@bp.post("/api/tutor/chat")
def tutor_chat():
    body = request.get_json(silent=True) or {}
    messages = [
        {"role": m["role"], "content": str(m.get("content", "")).strip()[:4000]}
        for m in body.get("messages", [])
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and str(m.get("content", "")).strip()
    ][-MAX_MESSAGES:]
    while messages and messages[0]["role"] == "assistant":  # most APIs want a user message first
        messages.pop(0)
    if not messages or messages[-1]["role"] != "user":
        return "Type a message first.", 400
    try:
        return jsonify(reply=chat(system_prompt(body.get("subject")), messages))
    except LLMError as e:
        return str(e), 502