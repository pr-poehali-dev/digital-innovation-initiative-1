CREATE TABLE IF NOT EXISTS exec_milestone (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    title VARCHAR(500) NOT NULL,
    milestone_type VARCHAR(64),
    plan_date_original DATE,
    plan_date DATE,
    fact_date DATE,
    status VARCHAR(32) DEFAULT 'not_started',
    responsible_person_id INTEGER REFERENCES exec_person(id),
    depends_on_milestone_id INTEGER REFERENCES exec_milestone(id),
    decision_id INTEGER REFERENCES exec_decision_instance(id),
    achievement_criteria TEXT,
    achievement_evidence TEXT,
    confirmed_by_person_id INTEGER REFERENCES exec_person(id),
    confirmed_at TIMESTAMP,
    reschedule_reason TEXT,
    reschedule_approved_by VARCHAR(255),
    rescheduled_at TIMESTAMP,
    reschedule_count INTEGER DEFAULT 0,
    comment TEXT,
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    source_note TEXT,
    created_by VARCHAR(255),
    confirmed_verification_by VARCHAR(255),
    confirmed_verification_at TIMESTAMP,
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_milestone_status_chk CHECK (
        status IN ('not_started','in_progress','achieved','cancelled')
    ),
    CONSTRAINT exec_milestone_achieved_chk CHECK (
        status <> 'achieved' OR (achievement_evidence IS NOT NULL AND fact_date IS NOT NULL)
    ),
    CONSTRAINT exec_milestone_no_self_dep CHECK (depends_on_milestone_id IS NULL OR depends_on_milestone_id <> id)
);

CREATE TABLE IF NOT EXISTS exec_issue (
    id SERIAL PRIMARY KEY,
    initiative_id INTEGER NOT NULL REFERENCES exec_initiative(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    detected_at DATE,
    category VARCHAR(64),
    criticality VARCHAR(32) DEFAULT 'medium',
    criticality_auto_raised BOOLEAN DEFAULT false,
    impact_deadline BOOLEAN DEFAULT false,
    impact_result BOOLEAN DEFAULT false,
    impact_cost BOOLEAN DEFAULT false,
    impact_quality BOOLEAN DEFAULT false,
    impact_compliance BOOLEAN DEFAULT false,
    root_cause TEXT,
    owner_person_id INTEGER REFERENCES exec_person(id),
    responsible_person_id INTEGER REFERENCES exec_person(id),
    action_plan TEXT,
    due_at DATE,
    status VARCHAR(32) DEFAULT 'open',
    resolution_criteria TEXT,
    resolution_result TEXT,
    resolved_at DATE,
    resolved_confirmed_by_person_id INTEGER REFERENCES exec_person(id),
    needs_escalation BOOLEAN DEFAULT false,
    escalation_level VARCHAR(64),
    is_blocking BOOLEAN DEFAULT false,
    block_what TEXT,
    block_since DATE,
    block_who_can_lift TEXT,
    block_requirements TEXT,
    block_escalation_level VARCHAR(64),
    block_deadline DATE,
    block_status VARCHAR(32),
    block_lifted_at DATE,
    block_lifted_by VARCHAR(255),
    block_lift_result TEXT,
    block_lift_confirmed_by VARCHAR(255),
    verification_status VARCHAR(32) DEFAULT 'user_draft',
    source_note TEXT,
    created_by VARCHAR(255),
    confirmed_verification_by VARCHAR(255),
    confirmed_verification_at TIMESTAMP,
    is_test_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT exec_issue_status_chk CHECK (
        status IN ('open','in_progress','awaiting_decision','resolved','closed','irrelevant')
    ),
    CONSTRAINT exec_issue_criticality_chk CHECK (
        criticality IN ('low','medium','high','critical')
    ),
    CONSTRAINT exec_issue_resolved_chk CHECK (
        status NOT IN ('resolved','closed')
        OR (resolution_criteria IS NOT NULL AND resolution_result IS NOT NULL
            AND resolved_at IS NOT NULL AND resolved_confirmed_by_person_id IS NOT NULL)
    ),
    CONSTRAINT exec_issue_block_chk CHECK (
        is_blocking = false
        OR (block_what IS NOT NULL AND block_since IS NOT NULL
            AND block_who_can_lift IS NOT NULL AND block_requirements IS NOT NULL
            AND block_escalation_level IS NOT NULL AND block_deadline IS NOT NULL)
    ),
    CONSTRAINT exec_issue_block_status_chk CHECK (
        block_status IS NULL OR block_status IN ('active','lifted')
    ),
    CONSTRAINT exec_issue_block_lift_chk CHECK (
        block_status <> 'lifted'
        OR (block_lifted_at IS NOT NULL AND block_lifted_by IS NOT NULL AND block_lift_result IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_exec_milestone_init ON exec_milestone(initiative_id);
CREATE INDEX IF NOT EXISTS idx_exec_milestone_plan ON exec_milestone(plan_date);
CREATE INDEX IF NOT EXISTS idx_exec_issue_init ON exec_issue(initiative_id);
CREATE INDEX IF NOT EXISTS idx_exec_issue_status ON exec_issue(status);
