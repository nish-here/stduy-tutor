
"""The only file that talks to your AI API."""

import json
import os
import urllib.error
import urllib.request
from pathlib import Path


class LLMError(Exception):
    pass


def _load_dotenv():
    """Load backend/.env without overriding existing environment variables."""
    path = Path(__file__).with_name(".env")

    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()

            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(
                    key.strip(),
                    value.strip().strip("\"'")
                )


_load_dotenv()


def chat(system: str, messages: list[dict]) -> str:
    """Send a conversation to an OpenAI-compatible API."""

    model = os.environ.get("LLM_MODEL")
    api_key = os.environ.get("LLM_API_KEY")
    base = os.environ.get(
        "LLM_BASE_URL",
        "https://api.groq.com/openai/v1"
    ).rstrip("/")

    if not model or not api_key:
        raise LLMError(
            "Set LLM_API_KEY and LLM_MODEL in backend/.env, "
            "then restart app.py."
        )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "SubjectScoreAI/1.0",
    }

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            *messages,
        ],
    }

    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)

        text = result["choices"][0]["message"]["content"]

    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise LLMError(
            f"Your API answered {error.code}: {details[:500]}"
        ) from error

    except (
        urllib.error.URLError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
    ) as error:
        raise LLMError(
            f"Could not get a reply from your API: {error}"
        ) from error

    if not isinstance(text, str) or not text.strip():
        raise LLMError("Your API returned an empty reply.")

    return text
