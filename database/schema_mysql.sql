-- MySQL 8.x schema for Digital Personal Finance Management and Expense Tracker
-- The Flask app creates these tables automatically (db.create_all()); this file is for reference
-- or for creating the schema manually.

CREATE DATABASE IF NOT EXISTS finance_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finance_tracker;

CREATE TABLE users (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    name VARCHAR(100) NOT NULL, 
    email VARCHAR(150) NOT NULL, 
    password_hash VARCHAR(255) NOT NULL, 
    currency VARCHAR(3) NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE categories (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    name VARCHAR(50) NOT NULL, 
    type VARCHAR(10) NOT NULL, 
    colour VARCHAR(7) NOT NULL, 
    is_default BOOL NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_category_user_name_type UNIQUE (user_id, name, type), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_categories_user_id ON categories (user_id);

CREATE TABLE notifications (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    kind VARCHAR(30) NOT NULL, 
    title VARCHAR(120) NOT NULL, 
    message VARCHAR(255) NOT NULL, 
    ref_key VARCHAR(80), 
    is_read BOOL NOT NULL, 
    is_dismissed BOOL NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_notifications_ref_key ON notifications (ref_key);
CREATE INDEX ix_notifications_user_id ON notifications (user_id);

CREATE TABLE savings_goals (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    title VARCHAR(100) NOT NULL, 
    goal_type VARCHAR(30) NOT NULL, 
    target_amount NUMERIC(12, 2) NOT NULL, 
    saved_amount NUMERIC(12, 2) NOT NULL, 
    target_date DATE, 
    status VARCHAR(12) NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_savings_goals_user_id ON savings_goals (user_id);

CREATE TABLE budgets (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    category_id INTEGER NOT NULL, 
    month INTEGER NOT NULL, 
    year INTEGER NOT NULL, 
    limit_amount NUMERIC(12, 2) NOT NULL, 
    alert_threshold INTEGER NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_budget_user_cat_month_year UNIQUE (user_id, category_id, month, year), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_budgets_user_id ON budgets (user_id);

CREATE TABLE goal_contributions (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    goal_id INTEGER NOT NULL, 
    amount NUMERIC(12, 2) NOT NULL, 
    date DATE NOT NULL, 
    note VARCHAR(255), 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(goal_id) REFERENCES savings_goals (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_goal_contributions_goal_id ON goal_contributions (goal_id);

CREATE TABLE transactions (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    category_id INTEGER NOT NULL, 
    type VARCHAR(10) NOT NULL, 
    amount NUMERIC(12, 2) NOT NULL, 
    date DATE NOT NULL, 
    payment_method VARCHAR(20) NOT NULL, 
    note VARCHAR(255), 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_transactions_user_id ON transactions (user_id);
CREATE INDEX ix_transactions_category_id ON transactions (category_id);
CREATE INDEX ix_transactions_date ON transactions (date);
