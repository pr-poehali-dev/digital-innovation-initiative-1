CREATE UNIQUE INDEX IF NOT EXISTS uq_exec_link_unique
    ON exec_link (link_type, src_kind, src_id, tgt_kind, tgt_id)
    WHERE archived_at IS NULL;
