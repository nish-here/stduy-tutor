"""The only file that talks to your AI API. It uses the OpenAI chat-completions format,
which many providers and local servers support. If yours is different, change chat() only."""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path


class LLMError(Exception):
    pass


def _load_dotenv():
    """Read KEY=VALUE lines from backend/.env, without overriding variables already set in the terminal."""
    path = Path(__file__).with_name(".env")
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_dotenv()


def chat(system: str, messages: list[dict]) -> str:
    """Send the conversation ([{role, content}, ...]) and return the reply text."""
    model = os.environ.get("LLM_MODEL")
    if not model:
        raise LLMError("The tutor is not set up yet. Set LLM_API_KEY, LLM_MODEL and (if not Gemini) LLM_BASE_URL, then restart app.py.")
    base = os.environ.get("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").rstrip("/")
    headers = {"Content-Type": "application/json"}
    if os.environ.get("LLM_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['LLM_API_KEY']}"
    body = {"model": model, "messages": [{"role": "system", "content": system}, *messages]}
    request = urllib.request.Request(f"{base}/chat/completions", json.dumps(body).encode(), headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as r:
            text = json.load(r)["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        raise LLMError(f"Your API answered {e.code}: {e.read().decode(errors='replace')[:300]}") from e
    except (urllib.error.URLError, KeyError, IndexError, TypeError, ValueError) as e:
        raise LLMError(f"Could not get a reply from your API: {e}") from e
    if not text:
        raise LLMError("Your API returned an empty reply.")
    return text