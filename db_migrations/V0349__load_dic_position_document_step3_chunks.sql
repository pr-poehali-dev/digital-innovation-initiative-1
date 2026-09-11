INSERT INTO exec_knowledge_chunk (knowledge_id, chunk_index, page_number, content, content_length)
SELECT 6,
       row_number() OVER (ORDER BY start_pos) - 1,
       NULL,
       substring(exec_knowledge.body FROM start_pos + 1 FOR 1500),
       length(substring(exec_knowledge.body FROM start_pos + 1 FOR 1500))
FROM exec_knowledge, generate_series(0, length(exec_knowledge.body) - 1, 1300) AS start_pos
WHERE exec_knowledge.id = 6
  AND length(trim(substring(exec_knowledge.body FROM start_pos + 1 FOR 1500))) > 0;
