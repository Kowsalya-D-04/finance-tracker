import { useEffect, useState } from "react";
import api from "../api";
import Icon from "../components/Icon";
import { Loader } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { errorMessage, formatMoney } from "../utils/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MLInsights() {
  const { currency } = useAuth();
  const [insights, setInsights] = useState(null);
  const [description, setDescription] = useState("");
  const [prediction, setPrediction] = useState(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/ml/insights")
      .then((r) => { setInsights(r.data); setError(""); })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const predict = async (e) => {
    e.preventDefault();
    setLoadingPrediction(true);
    setPrediction(null);
    try {
      const r = await api.post("/ml/predict-category", { description });
      setPrediction(r.data);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingPrediction(false);
    }
  };

  if (error && !insights) return <div className="alert danger">{error}</div>;
  if (!insights) return <Loader label="Training finance models" />;

  const forecast = insights.forecast;
  const money = (value) => formatMoney(value, currency);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>ML Insights</h1>
          <p>Machine-learning predictions trained from your expense history.</p>
        </div>
        <span className="ml-badge"><Icon name="brain" size={16} /> ML enabled</span>
      </div>

      <section className="grid-2 ml-grid">
        <div className="panel ml-hero-panel">
          <div className="panel-head">
            <div>
              <h2>Next-month expense forecast</h2>
              <span className="muted">Linear Regression · Pure Python</span>
            </div>
            <Icon name="trend" size={24} />
          </div>
          {forecast.available ? (
            <>
              <div className="ml-forecast-value">{money(forecast.predicted_expense)}</div>
              <p className="muted">Predicted for {MONTHS[forecast.next_month - 1]} {forecast.next_year}</p>
              <div className="ml-metrics">
                <span><small>Training months</small><strong>{forecast.training_months}</strong></span>
                <span><small>Model R²</small><strong>{forecast.r2_score}</strong></span>
                <span><small>Vs current month</small><strong>{forecast.change_vs_current_month == null ? "—" : `${forecast.change_vs_current_month > 0 ? "+" : ""}${forecast.change_vs_current_month}%`}</strong></span>
              </div>
              <p className="ml-explain">{forecast.explanation}</p>
            </>
          ) : (
            <div className="empty compact"><p>{forecast.message}</p></div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Automatic category prediction</h2><span className="muted">Naive Bayes · Pure Python</span></div>
          <form onSubmit={predict} className="ml-predict-form">
            <label className="field">
              <span>Expense description</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Swiggy dinner, Uber to office" />
            </label>
            <button className="btn primary" disabled={loadingPrediction || description.trim().length < 2}>
              <Icon name="brain" size={16} /> {loadingPrediction ? "Predicting…" : "Predict category"}
            </button>
          </form>
          {prediction && prediction.available && (
            <div className="prediction-result">
              <span className="prediction-label">Predicted category</span>
              <strong>{prediction.predicted_category}</strong>
              <em>{prediction.confidence}% confidence</em>
              <div className="prediction-bars">
                {prediction.top_predictions.map((item) => (
                  <div key={item.category} className="prediction-row">
                    <span>{item.category}</span>
                    <div className="prediction-track"><i style={{ width: `${Math.max(item.confidence, 2)}%` }} /></div>
                    <b>{item.confidence}%</b>
                  </div>
                ))}
              </div>
              <small className="muted">Personal examples used: {prediction.personal_training_examples}. {prediction.explanation}</small>
            </div>
          )}
          {prediction && !prediction.available && <div className="alert warning">{prediction.message}</div>}
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Expense history used by forecast</h2><span className="muted">Recent monthly totals</span></div>
          <div className="ml-history">
            {forecast.history.map((row) => {
              const max = Math.max(...forecast.history.map((x) => x.total), 1);
              return (
                <div className="ml-history-row" key={`${row.year}-${row.month}`}>
                  <span>{MONTHS[row.month - 1].slice(0, 3)} {String(row.year).slice(-2)}</span>
                  <div className="ml-history-track"><i style={{ width: `${row.total / max * 100}%` }} /></div>
                  <strong>{money(row.total)}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Training data summary</h2><Icon name="database" size={20} /></div>
          <div className="ml-training-summary">
            <span><small>Expense transactions</small><strong>{insights.expense_transactions_used}</strong></span>
            <span><small>Forecast model</small><strong>Linear Regression</strong></span>
            <span><small>Text classifier</small><strong>Naive Bayes</strong></span>
          </div>
          <h3 className="ml-subhead">Top expense categories</h3>
          <ul className="ml-top-list">
            {insights.top_expense_categories.map((item) => (
              <li key={item.category}><span>{item.category}</span><strong>{money(item.amount)}</strong></li>
            ))}
          </ul>
          <p className="ml-explain">Models are trained inside the Flask backend. Your finance data is read from the existing database and is not sent to an external AI service.</p>
        </div>
      </section>
    </div>
  );
}
