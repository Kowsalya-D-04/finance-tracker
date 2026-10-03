"""Dependency-free machine-learning helpers for personal finance insights.

The project intentionally implements its small ML models in pure Python so the feature
works with the existing Flask installation and does not depend on scikit-learn being
installed correctly on the user's machine.

Models:
* Expense forecasting: ordinary least-squares linear regression over monthly totals.
* Category prediction: multinomial Naive Bayes over token counts with Laplace smoothing.
"""
from collections import Counter, defaultdict
from datetime import date
import math
import re

from ..models import Transaction
from ..utils import shift_month, month_bounds


BOOTSTRAP_CATEGORY_TEXT = {
    "Food": ["swiggy dinner", "zomato lunch", "restaurant", "groceries", "supermarket", "coffee", "milk bakery", "vegetables"],
    "Rent": ["house rent", "monthly rent", "apartment rent", "room rent"],
    "Transport": ["uber ride", "ola cab", "rapido ride", "petrol", "fuel", "metro recharge", "auto fare", "train ticket"],
    "Shopping": ["amazon order", "flipkart order", "myntra clothes", "shopping mall", "shoes", "home essentials"],
    "Bills": ["electricity bill", "tneb bill", "mobile recharge", "broadband", "internet bill", "water bill", "gas bill"],
    "Healthcare": ["pharmacy", "doctor consultation", "hospital", "lab test", "medicine", "medical"],
    "Education": ["online course", "college fees", "tuition", "book purchase", "exam fee"],
    "Entertainment": ["movie tickets", "netflix", "spotify", "concert", "gaming", "bowling"],
    "Travel": ["flight ticket", "hotel booking", "vacation", "trip", "airbnb", "travel"],
    "EMI": ["loan emi", "bike emi", "car emi", "home loan", "monthly emi"],
}

TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text):
    return TOKEN_RE.findall((text or "").lower())


def _monthly_expense_points(user_id, months=6):
    today = date.today()
    points = []
    for offset in range(-(months - 1), 1):
        year, month = shift_month(today.year, today.month, offset)
        start, end = month_bounds(year, month)
        rows = Transaction.query.filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        ).all()
        total = round(sum(float(r.amount) for r in rows), 2)
        points.append({"year": year, "month": month, "total": total})
    return points


def _linear_regression(y):
    """Return slope, intercept and R² for x = 0..n-1, implemented from scratch."""
    n = len(y)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(y) / n
    ss_x = sum((x - mean_x) ** 2 for x in xs)
    slope = 0.0 if ss_x == 0 else sum((x - mean_x) * (v - mean_y) for x, v in zip(xs, y)) / ss_x
    intercept = mean_y - slope * mean_x

    fitted = [intercept + slope * x for x in xs]
    ss_tot = sum((v - mean_y) ** 2 for v in y)
    ss_res = sum((v - f) ** 2 for v, f in zip(y, fitted))
    r2 = 1.0 if ss_tot == 0 else 1.0 - (ss_res / ss_tot)
    return slope, intercept, r2


def forecast_expenses(user_id, months=6):
    """Forecast next month's expenses using ordinary least-squares linear regression."""
    points = _monthly_expense_points(user_id, max(int(months or 6), 6))
    nonzero = [p for p in points if p["total"] > 0]
    if len(nonzero) < 3:
        return {
            "available": False,
            "message": "Add expenses across at least 3 different months to generate an ML forecast.",
            "history": points,
        }

    y = [float(p["total"]) for p in points]
    slope, intercept, r2 = _linear_regression(y)
    predicted = max(0.0, intercept + slope * len(points))

    last = points[-1]["total"]
    change = None if last == 0 else round((predicted - last) / last * 100, 1)
    next_year, next_month = shift_month(date.today().year, date.today().month, 1)

    return {
        "available": True,
        "algorithm": "Linear Regression (pure Python)",
        "training_months": len(points),
        "predicted_expense": round(predicted, 2),
        "next_month": next_month,
        "next_year": next_year,
        "change_vs_current_month": change,
        "r2_score": round(r2, 3),
        "history": points,
        "explanation": "The model fits a least-squares trend to your monthly expense totals and projects the trend one month forward.",
    }


def _category_training_data(user_id):
    examples = []
    for label, texts in BOOTSTRAP_CATEGORY_TEXT.items():
        examples.extend((text, label) for text in texts)

    rows = Transaction.query.filter_by(user_id=user_id, type="expense").all()
    personal_count = 0
    for tx in rows:
        text = " ".join(part for part in [tx.note or "", tx.payment_method or ""] if part).strip()
        if not text or not tx.category:
            continue
        # Weight personal history twice so repeated user wording matters more than bootstrap data.
        examples.append((text, tx.category.name))
        examples.append((text, tx.category.name))
        personal_count += 1
    return examples, personal_count


def _train_naive_bayes(examples):
    class_docs = Counter()
    class_words = defaultdict(Counter)
    class_word_totals = Counter()
    vocab = set()

    for text, label in examples:
        toks = _tokens(text)
        if not toks:
            continue
        class_docs[label] += 1
        class_words[label].update(toks)
        class_word_totals[label] += len(toks)
        vocab.update(toks)

    return class_docs, class_words, class_word_totals, vocab


def _softmax_log_scores(scores):
    """Convert log-probability scores to normalized probabilities safely."""
    max_score = max(scores.values())
    exp_scores = {k: math.exp(v - max_score) for k, v in scores.items()}
    total = sum(exp_scores.values()) or 1.0
    return {k: v / total for k, v in exp_scores.items()}


def predict_category(user_id, description):
    """Predict an expense category from transaction text using multinomial Naive Bayes."""
    cleaned = (description or "").strip()
    tokens = _tokens(cleaned)
    if not tokens:
        return {"available": False, "message": "Enter a short expense description first."}

    examples, personal_count = _category_training_data(user_id)
    class_docs, class_words, class_word_totals, vocab = _train_naive_bayes(examples)
    if len(class_docs) < 2:
        return {"available": False, "message": "Not enough category examples to train the classifier."}

    total_docs = sum(class_docs.values())
    vocab_size = max(len(vocab), 1)
    alpha = 1.0
    scores = {}
    for label, doc_count in class_docs.items():
        # Prior P(class), then token likelihoods P(word|class) with Laplace smoothing.
        score = math.log(doc_count / total_docs)
        denom = class_word_totals[label] + alpha * vocab_size
        for token in tokens:
            score += math.log((class_words[label][token] + alpha) / denom)
        scores[label] = score

    probs = _softmax_log_scores(scores)
    ranked = sorted(probs.items(), key=lambda item: item[1], reverse=True)[:3]
    return {
        "available": True,
        "algorithm": "Multinomial Naive Bayes (pure Python)",
        "description": cleaned,
        "predicted_category": ranked[0][0],
        "confidence": round(ranked[0][1] * 100, 1),
        "top_predictions": [
            {"category": label, "confidence": round(prob * 100, 1)} for label, prob in ranked
        ],
        "personal_training_examples": personal_count,
        "explanation": "The classifier learns how strongly words are associated with each expense category and uses Naive Bayes probabilities to select the most likely category.",
    }


def spending_insights(user_id):
    """Return ML-supported insight data for the ML page."""
    forecast = forecast_expenses(user_id)
    rows = Transaction.query.filter_by(user_id=user_id, type="expense").all()
    by_category = defaultdict(float)
    for tx in rows:
        if tx.category:
            by_category[tx.category.name] += float(tx.amount)
    top = sorted(by_category.items(), key=lambda item: item[1], reverse=True)[:5]
    return {
        "forecast": forecast,
        "top_expense_categories": [{"category": name, "amount": round(amount, 2)} for name, amount in top],
        "expense_transactions_used": len(rows),
    }
