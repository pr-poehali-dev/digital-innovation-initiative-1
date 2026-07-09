"""
Реестр практик и capability (taxonomy-слой базы решений).
Только taxonomy: solution_practices, solution_capabilities, solution_practice_capability_map.
Продукты/вендоры/офферы/scoring — вне scope этой функции.

  GET  practices          — список практик (+ count связанных capability)
  GET  capabilities        — список capability (+ count связанных practices)
  GET  practice_detail?slug= — практика + связанные capability
  GET  capability_detail?slug= — capability + связанные practices
  GET  products            — продукты (+ vendor, modules_count, derived capabilities_count)
  GET  product_detail?slug= — продукт + модули + derived capability summary (из модулей)
  GET  modules             — модули (+ product, vendor, capabilities_count)
  GET  module_detail?slug= — модуль + mapped capability с coverage_level
  POST import              — controlled ingestion из CSV-контента
                             (practices/capabilities/mapping + vendors/products/modules/module_capability),
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
DEPLOYMENTS = {"cloud", "on_prem", "hybrid"}
COVERAGE = {"core", "supporting", "limited"}


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


def _arr(v, allowed=None):
    parts = [x.strip() for x in str(v or "").replace(",", ";").split(";") if x.strip()]
    if allowed is not None:
        parts = [x for x in parts if x in allowed]
    return parts


def import_vendors(cur, rows, errors):
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        slug = _norm(r.get("slug"))
        name = _norm(r.get("name"))
        if not slug:
            errors.append(f"vendors стр.{i}: пустой slug"); continue
        if not name:
            errors.append(f"vendors стр.{i}: пустой name"); continue
        if slug in seen:
            errors.append(f"vendors стр.{i}: дубль slug '{slug}'"); continue
        seen.add(slug)
        status = _norm(r.get("status")) or "active"
        if status not in STATUSES:
            errors.append(f"vendors стр.{i}: недопустимый status '{status}'"); continue
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_vendors
                (slug, name, summary, website_url, status, sort_order, source_note, source_url, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (slug) DO UPDATE SET
                  name=EXCLUDED.name, summary=EXCLUDED.summary, website_url=EXCLUDED.website_url,
                  status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
                  source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url, updated_at=now()""",
            (slug, name, _norm(r.get("summary")), _norm(r.get("website_url")), status,
             int(r.get("sort_order") or 0), _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


def import_products(cur, rows, errors):
    cur.execute(f"SELECT slug, id FROM {SCHEMA}.solution_vendors")
    vendor_by_slug = {s: i for s, i in cur.fetchall()}
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        slug = _norm(r.get("slug"))
        name = _norm(r.get("name"))
        vendor_slug = _norm(r.get("vendor_slug"))
        if not slug:
            errors.append(f"products стр.{i}: пустой slug"); continue
        if not name:
            errors.append(f"products стр.{i}: пустой name"); continue
        if slug in seen:
            errors.append(f"products стр.{i}: дубль slug '{slug}'"); continue
        seen.add(slug)
        vid = vendor_by_slug.get(vendor_slug)
        if vid is None:
            errors.append(f"products стр.{i}: вендор '{vendor_slug}' не найден"); continue
        status = _norm(r.get("status")) or "active"
        if status not in STATUSES:
            errors.append(f"products стр.{i}: недопустимый status '{status}'"); continue
        depls = _arr(r.get("deployment_types"), DEPLOYMENTS)
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_products
                (vendor_id, slug, name, category, summary, deployment_types, website_url, status, sort_order, source_note, source_url, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (slug) DO UPDATE SET
                  vendor_id=EXCLUDED.vendor_id, name=EXCLUDED.name, category=EXCLUDED.category,
                  summary=EXCLUDED.summary, deployment_types=EXCLUDED.deployment_types, website_url=EXCLUDED.website_url,
                  status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
                  source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url, updated_at=now()""",
            (vid, slug, name, _norm(r.get("category")) or "", _norm(r.get("summary")), depls,
             _norm(r.get("website_url")), status, int(r.get("sort_order") or 0),
             _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


def import_modules(cur, rows, errors):
    cur.execute(f"SELECT slug, id FROM {SCHEMA}.solution_products")
    product_by_slug = {s: i for s, i in cur.fetchall()}
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        slug = _norm(r.get("slug"))
        name = _norm(r.get("name"))
        product_slug = _norm(r.get("product_slug"))
        if not slug:
            errors.append(f"modules стр.{i}: пустой slug"); continue
        if not name:
            errors.append(f"modules стр.{i}: пустой name"); continue
        if slug in seen:
            errors.append(f"modules стр.{i}: дубль slug '{slug}'"); continue
        seen.add(slug)
        pid = product_by_slug.get(product_slug)
        if pid is None:
            errors.append(f"modules стр.{i}: продукт '{product_slug}' не найден"); continue
        status = _norm(r.get("status")) or "active"
        if status not in STATUSES:
            errors.append(f"modules стр.{i}: недопустимый status '{status}'"); continue
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_product_modules
                (product_id, slug, name, category, summary, status, sort_order, source_note, source_url, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (slug) DO UPDATE SET
                  product_id=EXCLUDED.product_id, name=EXCLUDED.name, category=EXCLUDED.category,
                  summary=EXCLUDED.summary, status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
                  source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url, updated_at=now()""",
            (pid, slug, name, _norm(r.get("category")) or "", _norm(r.get("summary")), status,
             int(r.get("sort_order") or 0), _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


def import_module_capability_map(cur, rows, errors):
    cur.execute(f"SELECT slug, id FROM {SCHEMA}.solution_product_modules")
    m_by_slug = {s: i for s, i in cur.fetchall()}
    cur.execute(f"SELECT slug, id FROM {SCHEMA}.solution_capabilities")
    c_by_slug = {s: i for s, i in cur.fetchall()}
    seen = set()
    n = 0
    for i, r in enumerate(rows, 2):
        m_slug = _norm(r.get("module_slug"))
        c_slug = _norm(r.get("capability_slug"))
        if not m_slug or not c_slug:
            errors.append(f"module_capability стр.{i}: не заданы module/capability"); continue
        mid = m_by_slug.get(m_slug)
        cid = c_by_slug.get(c_slug)
        if mid is None:
            errors.append(f"module_capability стр.{i}: модуль '{m_slug}' не найден"); continue
        if cid is None:
            errors.append(f"module_capability стр.{i}: capability '{c_slug}' не найдена"); continue
        cov = _norm(r.get("coverage_level")) or "supporting"
        if cov not in COVERAGE:
            errors.append(f"module_capability стр.{i}: недопустимый coverage_level '{cov}'"); continue
        if (mid, cid) in seen:
            errors.append(f"module_capability стр.{i}: дубль {m_slug}+{c_slug}"); continue
        seen.add((mid, cid))
        cur.execute(
            f"""INSERT INTO {SCHEMA}.solution_module_capability_map
                (module_id, capability_id, coverage_level, note, source_note, source_url)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (module_id, capability_id) DO UPDATE SET
                  coverage_level=EXCLUDED.coverage_level, note=EXCLUDED.note,
                  source_note=EXCLUDED.source_note, source_url=EXCLUDED.source_url""",
            (mid, cid, cov, _norm(r.get("note")), _norm(r.get("source_note")), _norm(r.get("source_url"))),
        )
        n += 1
    return n


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

        # ── Продукты: список (+ vendor, derived capability count) ─
        if method == "GET" and action == "products":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT p.id, p.slug, p.name, p.category, p.summary, p.deployment_types, p.status,
                               p.website_url, p.source_url, v.name,
                               (SELECT COUNT(*) FROM {SCHEMA}.solution_product_modules m WHERE m.product_id = p.id),
                               (SELECT COUNT(DISTINCT mc.capability_id)
                                  FROM {SCHEMA}.solution_product_modules m
                                  JOIN {SCHEMA}.solution_module_capability_map mc ON mc.module_id = m.id
                                  WHERE m.product_id = p.id)
                        FROM {SCHEMA}.solution_products p
                        JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                        ORDER BY p.sort_order, p.name""",
                )
                items = [{"id": r[0], "slug": r[1], "name": r[2], "category": r[3], "summary": r[4],
                          "deployment_types": r[5] or [], "status": r[6], "website_url": r[7], "source_url": r[8],
                          "vendor_name": r[9], "modules_count": r[10], "capabilities_count": r[11]}
                         for r in cur.fetchall()]
            return cors({"ok": True, "items": items})

        # ── Продукт: детали + модули + derived capability summary ─
        if method == "GET" and action == "product_detail":
            slug = qs.get("slug") or ""
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT p.id, p.slug, p.name, p.category, p.summary, p.deployment_types, p.status,
                               p.website_url, p.source_note, p.source_url,
                               v.slug, v.name, v.website_url
                        FROM {SCHEMA}.solution_products p
                        JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                        WHERE p.slug = %s""", (slug,))
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "not found"}, 404)
                product = {"id": row[0], "slug": row[1], "name": row[2], "category": row[3], "summary": row[4],
                           "deployment_types": row[5] or [], "status": row[6], "website_url": row[7],
                           "source_note": row[8], "source_url": row[9],
                           "vendor": {"slug": row[10], "name": row[11], "website_url": row[12]}}
                cur.execute(
                    f"""SELECT m.slug, m.name, m.category, m.status,
                               (SELECT COUNT(*) FROM {SCHEMA}.solution_module_capability_map mc WHERE mc.module_id = m.id)
                        FROM {SCHEMA}.solution_product_modules m
                        WHERE m.product_id = %s ORDER BY m.sort_order, m.name""", (row[0],))
                product["modules"] = [{"slug": r[0], "name": r[1], "category": r[2], "status": r[3],
                                       "capabilities_count": r[4]} for r in cur.fetchall()]
                # derived capability summary по продукту (из модулей)
                cur.execute(
                    f"""SELECT c.slug, c.name, c.category,
                               MAX(CASE mc.coverage_level WHEN 'core' THEN 3 WHEN 'supporting' THEN 2 ELSE 1 END)
                        FROM {SCHEMA}.solution_product_modules m
                        JOIN {SCHEMA}.solution_module_capability_map mc ON mc.module_id = m.id
                        JOIN {SCHEMA}.solution_capabilities c ON c.id = mc.capability_id
                        WHERE m.product_id = %s
                        GROUP BY c.slug, c.name, c.category
                        ORDER BY 4 DESC, c.name""", (row[0],))
                cov_by_rank = {3: "core", 2: "supporting", 1: "limited"}
                product["capabilities"] = [{"slug": r[0], "name": r[1], "category": r[2],
                                            "coverage_level": cov_by_rank.get(r[3], "limited")} for r in cur.fetchall()]
            return cors({"ok": True, "product": product})

        # ── Модули: список (+ product, vendor, capability count) ──
        if method == "GET" and action == "modules":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.id, m.slug, m.name, m.category, m.summary, m.status,
                               p.name, v.name,
                               (SELECT COUNT(*) FROM {SCHEMA}.solution_module_capability_map mc WHERE mc.module_id = m.id)
                        FROM {SCHEMA}.solution_product_modules m
                        JOIN {SCHEMA}.solution_products p ON p.id = m.product_id
                        JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                        ORDER BY m.sort_order, m.name""",
                )
                items = [{"id": r[0], "slug": r[1], "name": r[2], "category": r[3], "summary": r[4],
                          "status": r[5], "product_name": r[6], "vendor_name": r[7], "capabilities_count": r[8]}
                         for r in cur.fetchall()]
            return cors({"ok": True, "items": items})

        # ── Модуль: детали + mapped capability с coverage_level ───
        if method == "GET" and action == "module_detail":
            slug = qs.get("slug") or ""
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.id, m.slug, m.name, m.category, m.summary, m.status,
                               m.source_note, m.source_url,
                               p.slug, p.name, v.slug, v.name
                        FROM {SCHEMA}.solution_product_modules m
                        JOIN {SCHEMA}.solution_products p ON p.id = m.product_id
                        JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                        WHERE m.slug = %s""", (slug,))
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "not found"}, 404)
                module = {"id": row[0], "slug": row[1], "name": row[2], "category": row[3], "summary": row[4],
                          "status": row[5], "source_note": row[6], "source_url": row[7],
                          "product": {"slug": row[8], "name": row[9]},
                          "vendor": {"slug": row[10], "name": row[11]}}
                cur.execute(
                    f"""SELECT c.slug, c.name, c.category, mc.coverage_level, mc.note
                        FROM {SCHEMA}.solution_module_capability_map mc
                        JOIN {SCHEMA}.solution_capabilities c ON c.id = mc.capability_id
                        WHERE mc.module_id = %s
                        ORDER BY CASE mc.coverage_level WHEN 'core' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END, c.name""",
                    (row[0],))
                module["capabilities"] = [{"slug": r[0], "name": r[1], "category": r[2],
                                           "coverage_level": r[3], "note": r[4]} for r in cur.fetchall()]
            return cors({"ok": True, "module": module})

        if method == "POST" and action == "import":
            body = json.loads(event.get("body") or "{}")
            errors: list = []
            result = {"practices": 0, "capabilities": 0, "mapping": 0,
                      "vendors": 0, "products": 0, "modules": 0, "module_capability": 0}
            with conn.cursor() as cur:
                # порядок важен: сначала справочники, потом связи
                if body.get("practices_csv"):
                    result["practices"] = import_practices(cur, _rows(body["practices_csv"]), errors)
                if body.get("capabilities_csv"):
                    result["capabilities"] = import_capabilities(cur, _rows(body["capabilities_csv"]), errors)
                if body.get("mapping_csv"):
                    result["mapping"] = import_mapping(cur, _rows(body["mapping_csv"]), errors)
                if body.get("vendors_csv"):
                    result["vendors"] = import_vendors(cur, _rows(body["vendors_csv"]), errors)
                if body.get("products_csv"):
                    result["products"] = import_products(cur, _rows(body["products_csv"]), errors)
                if body.get("modules_csv"):
                    result["modules"] = import_modules(cur, _rows(body["modules_csv"]), errors)
                if body.get("module_capability_csv"):
                    result["module_capability"] = import_module_capability_map(cur, _rows(body["module_capability_csv"]), errors)
                if errors:
                    conn.rollback()
                    return cors({"ok": False, "errors": errors, "imported": result}, 400)
            conn.commit()
            return cors({"ok": True, "imported": result})

        return cors({"ok": False, "error": "unknown action"}, 400)
    finally:
        conn.close()