"""Guess the marks for each subject's next exam."""
import random

import joblib
import numpy as np
import pandas as pd

from train import FEATURES, MODEL, load, next_features


def predict(subjects: dict) -> list[dict]:
    """subjects: {name: max_marks}. Random guess -> subject average -> learned model, as data arrives."""
    df = load()
    model = joblib.load(MODEL) if MODEL.exists() else None
    out = []
    for subject, max_marks in subjects.items():
        f = next_features(df, subject)
        if f is None:  # no results yet: random guess, the same until new data arrives
            pct, source = random.Random(f"{subject}-{len(df)}").uniform(40, 90), "Random guess"
        elif model is not None:
            pct = float(np.clip(model.predict(pd.DataFrame([f], columns=FEATURES))[0], 0, 100))
            source = "Learned model"
        else:
            pct, source = f[1], "Subject average"
        out.append({"subject": subject, "max": max_marks, "predicted": round(pct * max_marks / 100, 1), "source": source})
    return out