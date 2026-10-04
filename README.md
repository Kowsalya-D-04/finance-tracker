# Digital Personal Finance Management and Expense Tracker

MCA full-stack project. A responsive web application where each user records income and expenses, sets monthly category budgets, tracks savings goals, receives alerts, generates reports, and uses machine learning for next-month expense forecasting and automatic expense-category prediction.

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, Axios, Recharts, HTML5, CSS3, JavaScript ES6+ (Vite dev server) |
| Backend | Python 3.11+, Flask 3, Flask-CORS, Flask-SQLAlchemy, Flask-JWT-Extended, Werkzeug, ReportLab, scikit-learn |
| Database | SQLite by default; MySQL 8.x by changing one environment variable |

---

## 1. Quick start

You need **Python 3.11+** and **Node.js 18+** installed.

### Backend (terminal 1)

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# macOS / Linux:  source venv/bin/activate
pip install -r requirements.txt
python seed.py          # optional: loads demo data
python run.py           # API runs on http://127.0.0.1:5000
```

### Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev             # app runs on http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server forwards every `/api/...` request to Flask on port 5000, so no extra configuration is needed.

Alternatively, run `start-windows.bat` (Windows) or `./start.sh` (macOS/Linux) from the project root; they perform the steps above and open both servers.

### Demo account

| Email | Password |
|---|---|
| `demo@financetracker.com` | `Demo@1234` |

The demo user has six months of Indian-context transactions (salary, rent, UPI food orders, EMI and so on), budgets for the current and previous month (Food is exceeded and Rent is at its limit, so alerts are visible), and four savings goals, one of them completed. The login page has a link that fills in these credentials.

To rebuild the demo data from scratch: `python seed.py --reset` (this deletes all data).

---

## 2. Features mapped to the specification

| Requirement | Where it is implemented |
|---|---|
| Landing page with login/register and feature cards | `frontend/src/pages/Landing.jsx` |
| Registration with validation (required fields, email format, password rules, confirmation, unique email, currency) | `Register.jsx`, `backend/app/routes/auth.py` |
| Login with show/hide password, remembered session, error handling, redirect | `Login.jsx`, `context/AuthContext.jsx` |
| Protected pages | `components/ProtectedRoute.jsx` (frontend) and `@jwt_required()` on every API route (backend) |
| Dashboard cards: balance, income, expenses, savings (calculated from the database) | `pages/Dashboard.jsx`, `routes/dashboard.py`, `services/finance.py` |
| Dashboard charts: income vs expense, monthly spending trend, category-wise expense, budget usage | `components/Charts.jsx` |
| Recent transactions with view all, edit, delete | Dashboard |
| Budget overview, savings goal overview, recent notifications | Dashboard |
| Automatic recalculation after any change | `AppContext.dataChanged()` bumps a version that every page watches |
| Transaction CRUD, search, sort, filters (type, category, date range, payment method, text), delete confirmation, pagination | `pages/Transactions.jsx`, `routes/transactions.py` |
| Default and custom categories with type and colour; category must match transaction type | `pages/Categories.jsx`, `routes/categories.py`, `routes/transactions.py` |
| Monthly category budgets, usage %, status (Under Budget / Near Limit / Exceeded), duplicate prevention | `pages/Budgets.jsx`, `routes/budgets.py` (plus a database unique constraint) |
| Warning and exceeded notifications | `services/notifications.py` |
| Savings goals with initial amount, contributions, withdrawals, history, progress, completion | `pages/Goals.jsx`, `routes/goals.py` |
| Reports by month/year or date range, type and category; summary, category-wise, monthly comparison, trend, transaction list | `pages/Reports.jsx`, `routes/reports.py` |
| Export CSV and PDF | `routes/reports.py`, `services/pdf_report.py` |
| Notifications page (read, mark all read, remove, filter) | `pages/Notifications.jsx`, `routes/notifications.py` |
| Profile update and password change | `pages/Profile.jsx`, `routes/profile.py` |
| ML expense forecasting using Linear Regression | `pages/MLInsights.jsx`, `routes/ml.py`, `services/ml.py` |
| Automatic expense-category prediction using TF-IDF + Multinomial Naive Bayes | `MLInsights.jsx`, `TransactionModal.jsx`, `routes/ml.py`, `services/ml.py` |
| Responsive layout (desktop, tablet, mobile) | `styles.css` media queries |

---

## 3. Calculations

| Figure | Formula |
|---|---|
| Balance | Total income − Total expenses (all time) |
| Savings | Income − Expenses for the selected period |
| Savings rate | Savings ÷ Income × 100 |
| Budget usage % | Category expenses in the budget's month ÷ Budget limit × 100 |
| Budget status | **Exceeded** if spent > limit; **Near Limit** if usage ≥ the budget's alert threshold (default 80%); otherwise **Under Budget** |
| Goal progress % | Saved amount ÷ Target amount × 100 (Completed at 100%) |
| Monthly amount needed for a goal | Remaining ÷ months left until the target date |

On the dashboard, the "This month / All time" toggle changes the income, expense and savings cards; the balance card is always all-time.

Money is stored as `DECIMAL(12,2)` (`Numeric` in SQLAlchemy) and calculated with Python `Decimal`, so there are no floating-point rounding errors.

### How notifications are generated

After every transaction is created, edited or deleted, the backend re-checks the budget for that category and month:

* crossing the alert threshold creates a **budget warning**;
* crossing 100% creates a **budget exceeded** alert;
* each alert has a unique key (for example `budget:4:exceeded`) so it is raised only once; if spending later drops back below the level (an expense was edited or deleted), the key is released and the alert can fire again.

Goal contributions raise **goal progress** alerts at 25%, 50% and 75%, and a **goal completed** alert at 100%.

---

## 4. Project structure

```
finance-tracker/
├── backend/
│   ├── app/
│   │   ├── __init__.py            Application factory, error handlers, JWT setup
│   │   ├── extensions.py          db, jwt, cors instances
│   │   ├── models.py              User, Category, Transaction, Budget, SavingsGoal,
│   │   │                          GoalContribution, Notification
│   │   ├── utils.py               Validation helpers, ownership checks
│   │   ├── routes/                One Flask blueprint per module
│   │   │   ├── auth.py  profile.py  categories.py  transactions.py
│   │   │   ├── budgets.py  goals.py  dashboard.py  reports.py  notifications.py  ml.py
│   │   └── services/
│   │       ├── finance.py         Totals, category breakdown, monthly series, budget status
│   │       ├── notifications.py   Budget and goal alert rules
│   │       ├── ml.py              Expense forecasting and category classification
│   │       └── pdf_report.py      PDF generation (ReportLab)
│   ├── tests/test_api.py          15 API tests (pytest)
│   ├── config.py                  Settings, database URL
│   ├── seed.py                    Demo data
│   ├── run.py                     Starts the server
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api.js                 Axios instance, token header, 401 handling, file download
│   │   ├── context/               AuthContext (session), AppContext (toasts, refresh, modal)
│   │   ├── components/            Layout, charts, modal, transaction form, UI pieces, icons
│   │   ├── pages/                 Landing, Login, Register, Dashboard, Transactions,
│   │   │                          Budgets, Goals, Reports, MLInsights, Categories, Notifications, Profile
│   │   ├── utils/format.js        Currency (Indian digit grouping), dates, errors
│   │   └── styles.css
│   ├── index.html  vite.config.js  package.json
├── database/schema_mysql.sql      MySQL 8 DDL for reference / manual creation
├── start-windows.bat  start.sh
└── README.md
```

---

## 5. Database

Tables: `users`, `categories`, `transactions`, `budgets`, `savings_goals`, `goal_contributions`, `notifications`.

Key constraints:

* `users.email` is unique.
* `categories (user_id, name, type)` is unique.
* `budgets (user_id, category_id, month, year)` is unique, so duplicate budgets are impossible even if the API check were bypassed.
* Every financial table has a `user_id` foreign key with `ON DELETE CASCADE`.

Tables are created automatically on first run (`db.create_all()`). With SQLite the file is `backend/instance/finance_tracker.db`.

### Switching to MySQL 8.x

1. Create the database and a user:
   ```sql
   CREATE DATABASE finance_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'finance_user'@'localhost' IDENTIFIED BY 'strong_password';
   GRANT ALL PRIVILEGES ON finance_tracker.* TO 'finance_user'@'localhost';
   ```
2. Install the driver: `pip install PyMySQL cryptography`
3. Copy `backend/.env.example` to `backend/.env` and set
   ```
   DATABASE_URL=mysql+pymysql://finance_user:strong_password@localhost:3306/finance_tracker?charset=utf8mb4
   ```
4. Run `python seed.py` (optional) and `python run.py`. No code changes are needed; all queries go through SQLAlchemy, and date grouping is done in Python so it behaves identically on both databases.

`database/schema_mysql.sql` contains the equivalent MySQL DDL if your guide wants the schema in the report.

---

## 6. REST API

All endpoints except register and login need the header `Authorization: Bearer <token>`. Request and response bodies are JSON. Validation errors return `422` with an `errors` object keyed by field name.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account (adds default categories), returns token |
| POST | `/api/auth/login` | Returns access token and user |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Logout (client discards token) |
| GET / PUT | `/api/profile` | View profile with stats / update name, email, currency |
| PUT | `/api/profile/password` | Change password |
| GET | `/api/dashboard/summary?period=month\|all` | Cards, chart data, budgets, goals, recent transactions, alerts |
| GET | `/api/transactions` | List with `search, type, category_id, payment_method, start_date, end_date, min_amount, max_amount, sort_by, sort_dir, page, per_page` |
| POST | `/api/transactions` | Create |
| GET / PUT / DELETE | `/api/transactions/{id}` | Read / update / delete |
| GET / POST | `/api/categories` | List (optional `type`) / create custom |
| PUT / DELETE | `/api/categories/{id}` | Update / delete (custom and unused only) |
| GET | `/api/budgets?month=&year=` | Budgets with spent, remaining, usage, status and a summary |
| POST | `/api/budgets` | Create |
| PUT / DELETE | `/api/budgets/{id}` | Update / delete |
| POST | `/api/budgets/copy-previous` | Copy last month's budgets into the given month |
| GET / POST | `/api/goals` | List with summary / create |
| GET / PUT / DELETE | `/api/goals/{id}` | Read (with history) / update / delete |
| POST | `/api/goals/{id}/contributions` | Add money (`withdraw: true` to withdraw) |
| DELETE | `/api/goals/{id}/contributions/{cid}` | Remove a history entry |
| GET | `/api/reports/monthly` | Report for `month`+`year` or `start_date`+`end_date`, optional `type`, `category_id` |
| GET | `/api/reports/export/csv` | Same filters, CSV download |
| GET | `/api/reports/export/pdf` | Same filters, PDF download |
| GET | `/api/notifications` | List (optional `unread=true`, `kind=budget\|goal`) |
| GET | `/api/notifications/unread-count` | Unread count |
| PUT | `/api/notifications/{id}/read`, `/api/notifications/read-all` | Mark read |
| DELETE | `/api/notifications/{id}`, `/api/notifications` | Remove one / clear all |
| GET | `/api/ml/forecast` | Train Linear Regression on monthly expense totals and forecast next month |
| POST | `/api/ml/predict-category` | Predict expense category from a transaction description |
| GET | `/api/ml/insights` | Combined ML forecast and training-data summary for the ML Insights page |

---

## Machine learning module

The project now contains two real machine-learning workflows implemented with **scikit-learn**:

1. **Expense forecasting:** monthly expense totals from the logged-in user's transaction history are used to train a `LinearRegression` model. The model projects the learned time trend one month forward and returns the prediction, R² score and training history. A minimum of three months containing expenses is required.
2. **Automatic expense categorization:** transaction descriptions are converted to numeric text features with `TfidfVectorizer`, then classified using `MultinomialNB`. The classifier combines a small cold-start vocabulary with the user's own previously categorized expense notes. The Add Expense dialog can apply the suggested category directly.

All training happens locally inside the Flask backend. No transaction data is sent to an external AI service. Open **ML Insights** from the sidebar to demonstrate the models.

---

## 7. Security measures

* Passwords are hashed with Werkzeug (`generate_password_hash`, salted scrypt); plain passwords are never stored or logged.
* JWT access tokens (24-hour expiry, configurable) protect every financial endpoint.
* **Data isolation:** every read, update and delete looks the record up with `get_owned_or_404`, which returns 404 if the record belongs to someone else. Category IDs sent by the client are also checked for ownership.
* All database access goes through the SQLAlchemy ORM with bound parameters (no string-built SQL).
* Input is validated on the frontend for fast feedback and again on the backend, which is the authority.
* CORS is restricted to the origins listed in `CORS_ORIGINS`.
* Secrets come from environment variables (`.env`). Change `SECRET_KEY` and `JWT_SECRET_KEY` before deploying.
* No bank passwords, card numbers or PINs are collected.

---

## 8. Testing

```bash
cd backend
python -m pytest -v
```

The 15 tests use an in-memory SQLite database and cover registration validation, duplicate email, login and protected routes, the balance formula (₹75,000 − ₹29,500 = ₹45,500), category/type matching, positive amounts, update/delete/search/sort/filter, cross-user access (returns 404), budget usage and status transitions with de-duplicated alerts, duplicate budget prevention, goal progress and completion, and report totals with CSV and PDF export.

For manual API testing, import the endpoints above into Postman: call `/api/auth/login`, copy the `token`, and add it as a Bearer token.

---

## 9. Deployment notes

* Build the frontend: `cd frontend && npm run build` produces static files in `frontend/dist/`.
* If the API is on a different host, set `VITE_API_URL=https://your-api-host` in `frontend/.env` before building, and add the frontend's URL to `CORS_ORIGINS` in `backend/.env`.
* Run Flask with a production server, for example `pip install gunicorn` then `gunicorn -w 3 -b 0.0.0.0:5000 "app:create_app()"` (Linux) or `waitress-serve --call app:create_app` (Windows).
* Serve over HTTPS.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach the server" on login | The Flask backend is not running. Start it with `python run.py` in `backend/`. |
| `ModuleNotFoundError: flask_jwt_extended` | Activate the virtual environment, then `pip install -r requirements.txt`. |
| Port 5000 already in use (macOS AirPlay uses it) | Change the port in `run.py` and the proxy target in `frontend/vite.config.js`. |
| Session expired message | Tokens last 24 hours; log in again, or change `JWT_EXPIRES_HOURS` in `.env`. |
| Want a clean database | Delete `backend/instance/finance_tracker.db`, or run `python seed.py --reset`. |

---

## 11. Future enhancements

Recurring transactions and bill reminders, receipt scanning with OCR, bank statement import with duplicate detection, multi-currency conversion and shared family budgets, Progressive Web App support with push notifications, and rule-based spending suggestions.

## Finance Chatbot
The application includes a login-protected Finance Chatbot at `/chatbot`.
It requires no external API key. The chatbot answers from the signed-in user's own stored finance data and supports questions about:
- current balance and monthly savings
- monthly income and expenses
- top spending categories
- budget status
- savings goals
- recent transactions
- ML expense forecast
- basic personalized saving guidance

API endpoints:
- `POST /api/chatbot/message` with `{ "message": "What is my balance?" }`
- `GET /api/chatbot/suggestions`
