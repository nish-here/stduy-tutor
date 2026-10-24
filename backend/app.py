"""Flask API + static frontend. Run: python app.py  ->  http://127.0.0.1:5000"""
import csv

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

from predict import predict
from train import DATA, train
from tutor import bp as tutor_bp

LOG = DATA.with_name("predictions_log.csv")  # every guess made before the real marks were known
app = Flask(__name__, static_folder="../frontend", static_url_path="")
app.register_blueprint(tutor_bp)
state = {"metrics": train()}


def live_stats():
    """RMSE (in marks) of the guesses you saw before entering the real marks."""
    if not LOG.exists():
        return None
    log = pd.read_csv(LOG)
    return {"count": len(log), "rmse": float(np.sqrt(((log.predicted_marks - log.actual_marks) ** 2).mean()))}


def payload(**extra):
    return jsonify({**state["metrics"], "live": live_stats(), **extra})


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/metrics")
def metrics():
    return payload()


@app.post("/api/predict")
def api_predict():
    try:
        return jsonify(predict(request.get_json()["subjects"]))
    except (KeyError, TypeError, ValueError) as e:
        return f"Bad input: {e}", 400


@app.post("/api/results")
def add_results():
    """Score the earlier guesses, store the real marks, then retrain automatically."""
    try:
        sent = request.get_json()["rows"]
        if any(not 0 <= float(r["actual_marks"]) <= float(r["max_marks"]) for r in sent):
            return "Real marks must be between 0 and the maximum.", 400
        rows = [[r["subject"], r["max_marks"], r["actual_marks"]] for r in sent]
        feedback = [
            {"subject": r["subject"], "max": float(r["max_marks"]),
             "predicted": float(r["predicted_marks"]), "actual": float(r["actual_marks"])}
            for r in sent if r.get("predicted_marks") is not None
        ]
    except (KeyError, TypeError, ValueError) as e:
        return f"Bad input: {e}", 400
    with open(DATA, "a", newline="") as f:
        csv.writer(f).writerows(rows)
    if feedback:
        is_new = not LOG.exists()
        with open(LOG, "a", newline="") as f:
            w = csv.writer(f)
            if is_new:
                w.writerow(["subject", "max_marks", "predicted_marks", "actual_marks"])
            w.writerows([[x["subject"], x["max"], x["predicted"], x["actual"]] for x in feedback])
    state["metrics"] = train()
    return payload(feedback=feedback)


if __name__ == "__main__":
    app.run(debug=False)