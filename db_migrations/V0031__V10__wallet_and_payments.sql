
CREATE TABLE wallet_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    balance_kopecks BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'RUB',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT wallet_accounts_user_unique UNIQUE (user_id),
    CONSTRAINT wallet_accounts_balance_nonneg CHECK (balance_kopecks >= 0)
);

CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    wallet_id INTEGER NOT NULL REFERENCES wallet_accounts(id),
    amount_kopecks BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'debit', 'refund', 'adjustment')),
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    source VARCHAR(50),
    payment_id INTEGER,
    description TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    provider VARCHAR(20) NOT NULL DEFAULT 'yookassa',
    provider_payment_id VARCHAR(255),
    amount_kopecks BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'RUB',
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'waiting_for_capture', 'succeeded', 'cancelled', 'failed')),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    confirmation_url TEXT,
    metadata JSONB DEFAULT '{}',
    webhook_processed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE yookassa_webhook_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100),
    provider_payment_id VARCHAR(255),
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_user_id ON wallet_transactions(user_id);
CREATE INDEX idx_wallet_tx_payment_id ON wallet_transactions(payment_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_provider_id ON payments(provider_payment_id);
CREATE INDEX idx_webhook_events_provider_id ON yookassa_webhook_events(provider_payment_id);
