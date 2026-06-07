-- Package B: Benchmark products, patterns, strategy decisions
CREATE TABLE benchmark_products (
  id                   serial PRIMARY KEY,
  slug                 varchar(64) NOT NULL UNIQUE,
  name                 varchar(128) NOT NULL,
  category             varchar(64) NOT NULL DEFAULT '',
  target_audience      text NOT NULL DEFAULT '',
  best_at              text NOT NULL DEFAULT '',
  main_jtbd            text NOT NULL DEFAULT '',
  ux_strengths         jsonb NOT NULL DEFAULT '[]',
  ux_weaknesses        jsonb NOT NULL DEFAULT '[]',
  ideas_to_borrow      jsonb NOT NULL DEFAULT '[]',
  anti_patterns        jsonb NOT NULL DEFAULT '[]',
  relevance            varchar(16) NOT NULL DEFAULT 'medium',
  recommendation       varchar(16) NOT NULL DEFAULT 'adapt',
  notes                text NOT NULL DEFAULT '',
  reviewed_at          date NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE benchmark_patterns (
  id                   serial PRIMARY KEY,
  slug                 varchar(64) NOT NULL UNIQUE,
  title                varchar(256) NOT NULL,
  area                 varchar(64) NOT NULL DEFAULT '',
  source_products      jsonb NOT NULL DEFAULT '[]',
  pattern_description  text NOT NULL DEFAULT '',
  why_it_works         text NOT NULL DEFAULT '',
  recommendation       varchar(16) NOT NULL DEFAULT 'borrow',
  impact               varchar(16) NOT NULL DEFAULT 'medium',
  effort               varchar(16) NOT NULL DEFAULT 'medium',
  priority             varchar(4) NOT NULL DEFAULT 'p1',
  notes                text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE strategy_decisions (
  id                   serial PRIMARY KEY,
  slug                 varchar(64) NOT NULL UNIQUE,
  title                varchar(256) NOT NULL,
  problem_statement    text NOT NULL DEFAULT '',
  source_patterns      jsonb NOT NULL DEFAULT '[]',
  decision             text NOT NULL DEFAULT '',
  module               varchar(64) NOT NULL DEFAULT '',
  expected_user_value  text NOT NULL DEFAULT '',
  expected_biz_value   text NOT NULL DEFAULT '',
  effort               varchar(16) NOT NULL DEFAULT 'medium',
  impact               varchar(16) NOT NULL DEFAULT 'high',
  priority             varchar(4) NOT NULL DEFAULT 'p1',
  status               varchar(32) NOT NULL DEFAULT 'idea',
  owner                varchar(128) NOT NULL DEFAULT '',
  reviewed_at          date NULL,
  notes                text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmark_products_relevance ON benchmark_products(relevance);
CREATE INDEX idx_benchmark_products_recommendation ON benchmark_products(recommendation);
CREATE INDEX idx_benchmark_patterns_area ON benchmark_patterns(area);
CREATE INDEX idx_benchmark_patterns_priority ON benchmark_patterns(priority);
CREATE INDEX idx_strategy_decisions_priority ON strategy_decisions(priority);
CREATE INDEX idx_strategy_decisions_status ON strategy_decisions(status);
