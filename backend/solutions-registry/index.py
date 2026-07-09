"""
Реестр практик и capability (taxonomy-слой базы решений).
Только taxonomy: solution_practices, solution_capabilities, solution_practice_capability_map.
Продукты/вендоры/офферы/scoring — вне scope этой функции.

  GET  practices          — список практик (+ count связанных capability)
  GET  capabilities        — список capability (+ count связанных practices)
  GET  practice_detail?slug= — практика + связанные capability
  GET  capability_detail?slug= — capability + связанные practices
  POST import              — controlled ingestion из CSV-контента (practices/capabilities/mapping),
                             upsert по slug, проверка ссылочной целостности и допустимых значений
"""
import csv
import io
import json
import os

import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p61016064_digital_innovation_i")

STATUSES = {"draft", "active", "archived"}
RELATIONS = {"required", "supporting", "optional"}


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_user(conn, session_id: str):
    if not session_id:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT user_id FROM {SCHEMA}.sessions WHERE id = %s AND expires_at > NOW()",
            (session_id,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _norm(v):
    v = (v or "").strip()
    return v or None


def _bool(v):
    return str(v or "").strip().lower() in ("1", "true", "yes", "да", "y")


def _rows(csv_text: str):
    if not csv_text or not csv_text.strip():
        return []
    reader = csv.DictReader(io.StringIO(csv_text))
    return [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in reader]


def import_practices(cur, rows, errors):
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        slug = _norm(r.get("slug"))
        name = _norm(r.get("name"))
        if not slug:
            errors.append(f"practices стр.{i}: пустой slug"); continue
        if not name:
            errors.append(f"practices стр.{i}: пустой name"); continue
        if slug in seen:
            errors.append(f"practices стр.{i}: дубль slug '{slug}'"); continue
        seen.add(slug)
        status = _norm(r.get("status")) or "active"
        if status not in STATUSES:
            errors.append(f"practices стр.{i}: недопустимый status '{status}'"); continue
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_practices
                (slug, name, category, summary, is_digital, status, sort_order, source_note, source_url, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (slug) DO UPDATE SET
                  name=EXCLUDED.name, category=EXCLUDED.category, summary=EXCLUDED.summary,
                  is_digital=EXCLUDED.is_digital, status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
                  source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url, updated_at=now()""",
            (slug, name, _norm(r.get("category")) or "", _norm(r.get("summary")), _bool(r.get("is_digital")),
             status, int(r.get("sort_order") or 0), _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


def import_capabilities(cur, rows, errors):
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        slug = _norm(r.get("slug"))
        name = _norm(r.get("name"))
        if not slug:
            errors.append(f"capabilities стр.{i}: пустой slug"); continue
        if not name:
            errors.append(f"capabilities стр.{i}: пустой name"); continue
        if slug in seen:
            errors.append(f"capabilities стр.{i}: дубль slug '{slug}'"); continue
        seen.add(slug)
        status = _norm(r.get("status")) or "active"
        if status not in STATUSES:
            errors.append(f"capabilities стр.{i}: недопустимый status '{status}'"); continue
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_capabilities
                (slug, name, category, description, status, sort_order, source_note, source_url, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (slug) DO UPDATE SET
                  name=EXCLUDED.name, category=EXCLUDED.category, description=EXCLUDED.description,
                  status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
                  source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url, updated_at=now()""",
            (slug, name, _norm(r.get("category")) or "", _norm(r.get("description")), status,
             int(r.get("sort_order") or 0), _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


def import_mapping(cur, rows, errors):
    # словари slug->id
    cur.execute(f"SELECT slug, id FROM {SCHEMA}.solution_practices")
    p_by_slug = {s: i for s, i in cur.fetchall()}
    cur.execute(f"SELECT slug, id FROM {SCHEMA}.solution_capabilities")
    c_by_slug = {s: i for s, i in cur.fetchall()}
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        p_slug = _norm(r.get("practice_slug")) or _norm(r.get("practice_id"))
        c_slug = _norm(r.get("capability_slug")) or _norm(r.get("capability_id"))
        if not p_slug or not c_slug:
            errors.append(f"mapping стр.{i}: не заданы practice/capability"); continue
        pid = p_by_slug.get(p_slug)
        cid = c_by_slug.get(c_slug)
        if pid is None:
            errors.append(f"mapping стр.{i}: практика '{p_slug}' не найдена"); continue
        if cid is None:
            errors.append(f"mapping стр.{i}: capability '{c_slug}' не найдена"); continue
        rel = _norm(r.get("relation_type")) or "supporting"
        if rel not in RELATIONS:
            errors.append(f"mapping стр.{i}: недопустимый relation_type '{rel}'"); continue
        key = (pid, cid, rel)
        if key in seen:
            errors.append(f"mapping стр.{i}: дубль {p_slug}+{c_slug}+{rel}"); continue
        seen.add(key)
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_practice_capability_map
                (practice_id, capability_id, relation_type, note, source_note, source_url)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (practice_id, capability_id, relation_type) DO UPDATE SET
                  note=EXCLUDED.note, source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url""",
            (pid, cid, rel, _norm(r.get("note")), _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


def handler(event: dict, context) -> dict:
    """Реестр практик/capability: read-only списки + controlled CSV-импорт taxonomy."""
    method = event.get("httpMethod", "GET")
    if method == "OPTIONS":
        return cors({}, 200)

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id") or headers.get("x-session-id") or ""

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user(conn, session_id)
        if not user_id:
            return cors({"ok": False, "error": "unauthorized"}, 401)

        if method == "GET" and action == "practices":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT p.id, p.slug, p.name, p.category, p.summary, p.is_digital, p.status,
                               p.source_note, p.source_url,
                               (SELECT COUNT(*) FROM {SCHEMA}.solution_practice_capability_map m WHERE m.practice_id = p.id)
                        FROM {SCHEMA}.solution_practices p
                        ORDER BY p.sort_order, p.name""",
                )
                items = [{"id": r[0], "slug": r[1], "name": r[2], "category": r[3], "summary": r[4],
                          "is_digital": r[5], "status": r[6], "source_note": r[7], "source_url": r[8],
                          "capability_count": r[9]} for r in cur.fetchall()]
            return cors({"ok": True, "items": items})

        if method == "GET" and action == "capabilities":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT c.id, c.slug, c.name, c.category, c.description, c.status,
                               c.source_note, c.source_url,
                               (SELECT COUNT(*) FROM {SCHEMA}.solution_practice_capability_map m WHERE m.capability_id = c.id)
                        FROM {SCHEMA}.solution_capabilities c
                        ORDER BY c.sort_order, c.name""",
                )
                items = [{"id": r[0], "slug": r[1], "name": r[2], "category": r[3], "description": r[4],
                          "status": r[5], "source_note": r[6], "source_url": r[7],
                          "practice_count": r[8]} for r in cur.fetchall()]
            return cors({"ok": True, "items": items})

        if method == "GET" and action == "practice_detail":
            slug = qs.get("slug") or ""
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, slug, name, category, summary, is_digital, status, source_note, source_url
                        FROM {SCHEMA}.solution_practices WHERE slug = %s""", (slug,))
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "not found"}, 404)
                practice = {"id": row[0], "slug": row[1], "name": row[2], "category": row[3], "summary": row[4],
                            "is_digital": row[5], "status": row[6], "source_note": row[7], "source_url": row[8]}
                cur.execute(
                    f"""SELECT c.slug, c.name, c.category, m.relation_type, m.note
                        FROM {SCHEMA}.solution_practice_capability_map m
                        JOIN {SCHEMA}.solution_capabilities c ON c.id = m.capability_id
                        WHERE m.practice_id = %s ORDER BY m.relation_type, c.name""", (row[0],))
                practice["capabilities"] = [{"slug": r[0], "name": r[1], "category": r[2],
                                             "relation_type": r[3], "note": r[4]} for r in cur.fetchall()]
            return cors({"ok": True, "practice": practice})

        if method == "GET" and action == "capability_detail":
            slug = qs.get("slug") or ""
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, slug, name, category, description, status, source_note, source_url
                        FROM {SCHEMA}.solution_capabilities WHERE slug = %s""", (slug,))
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "not found"}, 404)
                cap = {"id": row[0], "slug": row[1], "name": row[2], "category": row[3], "description": row[4],
                       "status": row[5], "source_note": row[6], "source_url": row[7]}
                cur.execute(
                    f"""SELECT p.slug, p.name, p.category, m.relation_type, m.note
                        FROM {SCHEMA}.solution_practice_capability_map m
                        JOIN {SCHEMA}.solution_practices p ON p.id = m.practice_id
                        WHERE m.capability_id = %s ORDER BY m.relation_type, p.name""", (row[0],))
                cap["practices"] = [{"slug": r[0], "name": r[1], "category": r[2],
                                     "relation_type": r[3], "note": r[4]} for r in cur.fetchall()]
            return cors({"ok": True, "capability": cap})

        if method == "POST" and action == "import":
            body = json.loads(event.get("body") or "{}")
            errors: list = []
            result = {"practices": 0, "capabilities": 0, "mapping": 0}
            with conn.cursor() as cur:
                # порядок важен: сначала справочники, потом связи
                if body.get("practices_csv"):
                    result["practices"] = import_practices(cur, _rows(body["practices_csv"]), errors)
                if body.get("capabilities_csv"):
                    result["capabilities"] = import_capabilities(cur, _rows(body["capabilities_csv"]), errors)
                if body.get("mapping_csv"):
                    result["mapping"] = import_mapping(cur, _rows(body["mapping_csv"]), errors)
                if errors:
                    conn.rollback()
                    return cors({"ok": False, "errors": errors, "imported": result}, 400)
            conn.commit()
            return cors({"ok": True, "imported": result})

        return cors({"ok": False, "error": "unknown action"}, 400)
    finally:
        conn.close()
