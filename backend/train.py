"""Learn from your past marks. Run: python train.py"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression

HERE = Path(__file__).parent
DATA, MODEL = HERE / "data.csv", HERE / "model.joblib"
SUBJECTS = {  # subject -> maximum marks (edit to match your subjects)
    "English 1": 80, "English 2": 80, "Computer Science": 100, "Kannada": 80, "Hindi": 80, "Maths": 80,
    "Biology": 80, "Physics": 80, "Chemistry": 80, "Geo": 80, "History/civics": 80,
}
FEATURES = ["prev_pct", "avg_pct", "n"]  # last result, average so far, number of results so far


def ensure_data_file():
    """Create data.csv with its header if it is missing or empty, and make sure it ends with a newline."""
    text = DATA.read_text(encoding="utf-8") if DATA.exists() else ""
    if not text.strip():
        DATA.write_text("subject,max_marks,actual_marks\n", encoding="utf-8")
    elif not text.endswith("\n"):
        DATA.write_text(text + "\n", encoding="utf-8")


def load() -> pd.DataFrame:
    """data.csv in order, plus what was already known about the subject before each exam."""
    ensure_data_file()
    df = pd.read_csv(DATA, dtype={"max_marks": float, "actual_marks": float})
    df["pct"] = df.actual_marks / df.max_marks * 100
    g = df.groupby("subject").pct
    df["n"] = g.cumcount()
    df["prev_pct"] = g.shift(1)
    df["avg_pct"] = (g.cumsum() - df.pct) / df.n.where(df.n > 0)
    return df


def next_features(df: pd.DataFrame, subject: str):
    """What the model knows about a subject going into its next exam (None = no results yet)."""
    s = df.loc[df.subject == subject, "pct"]
    return [s.iloc[-1], s.mean(), len(s)] if len(s) else None


def train() -> dict:
    df = load()
    MODEL.unlink(missing_ok=True)
    out = {
        "model": "Random guesses" if df.empty else "Subject average",
        "rmse": None, "baseline_rmse": None, "rows": len(df), "comparison": [],
        "subjects": {**SUBJECTS, **df.groupby("subject").max_marks.last().astype(int).to_dict()},
    }
    rows = df.dropna(subset=["prev_pct"])  # exams that have history to learn from
    cut = int(rows.n.max()) // 2 if len(rows) else 0
    fit, test = rows[rows.n <= cut], rows[rows.n > cut]  # learn from earlier exams, test on later ones
    if len(fit) < 5 or len(test) < 3:
        return out  # not enough results yet: predict.py falls back to guesses / averages

    rmse = lambda p: float(np.sqrt(np.mean(((p - test.pct) * test.max_marks / 100) ** 2)))  # in marks
    candidates = {
        "Linear regression": LinearRegression(),
        "Random forest": RandomForestRegressor(n_estimators=200, min_samples_leaf=2, random_state=42),
    }
    preds = {n: m.fit(fit[FEATURES], fit.pct).predict(test[FEATURES]).clip(0, 100) for n, m in candidates.items()}
    best = min(preds, key=lambda n: rmse(preds[n]))
    base = rmse(test.avg_pct)  # baseline: just predict the subject's average so far
    out.update(rmse=min(rmse(preds[best]), base), baseline_rmse=base)

    if rmse(preds[best]) < base:  # only use the model if it beats the simple average
        joblib.dump(candidates[best].fit(rows[FEATURES], rows.pct), MODEL)
        out["model"] = best
        out["comparison"] = [
            {"subject": s, "max": float(m), "actual": float(a), "predicted": round(float(p * m / 100), 1)}
            for s, m, a, p in zip(test.subject, test.max_marks, test.actual_marks, preds[best])
        ]
    return out


if __name__ == "__main__":
    m = train()
    print(f"Predictor: {m['model']}  |  results: {m['rows']}")
    if m["rmse"] is not None:
        print(f"RMSE on unseen results: {m['rmse']:.2f} marks (subject-average baseline {m['baseline_rmse']:.2f})")