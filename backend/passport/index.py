import json
import os
import hashlib
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_actor(conn, token: str) -> str | None:
    if not token:
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT actor_email FROM {S}.admin_sessions "
            f"WHERE session_token_hash = %s AND expires_at > NOW() AND revoked_at IS NULL LIMIT 1",
            (h,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def upsert_fields(conn, table: str, row_id: int, body: dict, allowed: list, actor: str) -> None:
    fields, vals = [], []
    for f in allowed:
        if f in body:
            fields.append(f"{f} = %s")
            vals.append(body[f])
    if fields:
        vals += [actor, row_id]
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {S}.{table} SET {', '.join(fields)}, updated_at = NOW(), updated_by = %s WHERE id = %s",
                vals,
            )
        conn.commit()


def handler(event: dict, context) -> dict:
    """Platform Passport — реестр модулей, routes, сущностей, зависимостей, overlaps."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")

    conn = psycopg2.connect(DB)
    try:
        actor = get_actor(conn, token)
        if not actor:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        method = event.get("httpMethod", "GET")
        qs = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # ── GET all ────────────────────────────────────────────────────────────
        if method == "GET" and action == "all":
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, name, slug, category, layer, description, status,
                           owner_email, backup_owner_email, primary_route,
                           source_of_truth, notes, updated_at, updated_by
                    FROM {S}.passport_modules ORDER BY category, name
                """)
                modules = [{
                    "id": r[0], "name": r[1], "slug": r[2], "category": r[3],
                    "layer": r[4], "description": r[5], "status": r[6],
                    "owner_email": r[7], "backup_owner_email": r[8],
                    "primary_route": r[9], "source_of_truth": r[10], "notes": r[11],
                    "updated_at": str(r[12]), "updated_by": r[13],
                } for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT r.id, r.module_id, r.title, r.route, r.route_type,
                           r.description, r.status, r.owner_email, r.updated_at, r.updated_by,
                           m.name as module_name
                    FROM {S}.passport_routes r
                    LEFT JOIN {S}.passport_modules m ON m.id = r.module_id
                    ORDER BY r.module_id, r.route
                """)
                routes = [{
                    "id": r[0], "module_id": r[1], "title": r[2], "route": r[3],
                    "route_type": r[4], "description": r[5], "status": r[6],
                    "owner_email": r[7], "updated_at": str(r[8]), "updated_by": r[9],
                    "module_name": r[10],
                } for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT e.id, e.name, e.kind, e.description, e.module_id,
                           e.source_of_truth_module_id, e.source_of_truth_details,
                           e.owner_email, e.data_class, e.status, e.notes,
                           e.updated_at, e.updated_by,
                           m.name as module_name, sm.name as sot_module_name
                    FROM {S}.passport_entities e
                    LEFT JOIN {S}.passport_modules m ON m.id = e.module_id
                    LEFT JOIN {S}.passport_modules sm ON sm.id = e.source_of_truth_module_id
                    ORDER BY e.kind, e.name
                """)
                entities = [{
                    "id": r[0], "name": r[1], "kind": r[2], "description": r[3],
                    "module_id": r[4], "source_of_truth_module_id": r[5],
                    "source_of_truth_details": r[6], "owner_email": r[7],
                    "data_class": r[8], "status": r[9], "notes": r[10],
                    "updated_at": str(r[11]), "updated_by": r[12],
                    "module_name": r[13], "sot_module_name": r[14],
                } for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT d.id, d.from_module_id, d.to_module_id, d.dep_type,
                           d.criticality, d.notes, d.updated_at, d.updated_by,
                           fm.name as from_name, tm.name as to_name
                    FROM {S}.passport_dependencies d
                    LEFT JOIN {S}.passport_modules fm ON fm.id = d.from_module_id
                    LEFT JOIN {S}.passport_modules tm ON tm.id = d.to_module_id
                    ORDER BY d.criticality DESC, d.from_module_id
                """)
                dependencies = [{
                    "id": r[0], "from_module_id": r[1], "to_module_id": r[2],
                    "dep_type": r[3], "criticality": r[4], "notes": r[5],
                    "updated_at": str(r[6]), "updated_by": r[7],
                    "from_name": r[8], "to_name": r[9],
                } for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT o.id, o.overlap_type, o.status, o.title, o.description,
                           o.related_module_id, o.resolution, o.updated_at, o.updated_by,
                           m.name as module_name
                    FROM {S}.passport_overlaps o
                    LEFT JOIN {S}.passport_modules m ON m.id = o.related_module_id
                    ORDER BY CASE o.status WHEN 'open' THEN 1 ELSE 2 END, o.id
                """)
                overlaps = [{
                    "id": r[0], "overlap_type": r[1], "status": r[2], "title": r[3],
                    "description": r[4], "related_module_id": r[5], "resolution": r[6],
                    "updated_at": str(r[7]), "updated_by": r[8], "module_name": r[9],
                } for r in cur.fetchall()]

                cur.execute(f"SELECT content, updated_at, updated_by FROM {S}.passport_notes WHERE id = 1")
                nr = cur.fetchone()
                notes = {"content": nr[0] if nr else "", "updated_at": str(nr[1]) if nr else "", "updated_by": nr[2] if nr else ""}

                # summary counts
                no_owner_m  = sum(1 for m in modules  if not m["owner_email"])
                no_sot_e    = sum(1 for e in entities if not e["source_of_truth_module_id"])
                open_overlaps = sum(1 for o in overlaps if o["status"] == "open")
                total = len(modules)
                normalized = sum(1 for m in modules if m["owner_email"] and m["primary_route"] and m["description"])
                norm_pct = round(normalized / total * 100) if total > 0 else 0

            return cors({
                "ok": True,
                "modules": modules, "routes": routes, "entities": entities,
                "dependencies": dependencies, "overlaps": overlaps, "notes": notes,
                "summary": {
                    "total_modules": len(modules),
                    "total_routes": len(routes),
                    "total_entities": len(entities),
                    "no_owner_modules": no_owner_m,
                    "no_sot_entities": no_sot_e,
                    "open_overlaps": open_overlaps,
                    "norm_pct": norm_pct,
                },
            })

        # ── Modules ────────────────────────────────────────────────────────────
        if method == "POST" and action == "add_module":
            name = body.get("name", "").strip()
            slug = body.get("slug", "").strip()
            if not name or not slug:
                return cors({"ok": False, "error": {"message": "Нужны name и slug"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.passport_modules (name,slug,category,layer,description,status,owner_email,primary_route,source_of_truth,notes,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (name, slug, body.get("category","platform"), body.get("layer","admin"),
                     body.get("description",""), body.get("status","active"),
                     body.get("owner_email",""), body.get("primary_route",""),
                     body.get("source_of_truth",""), body.get("notes",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_module":
            mid = body.get("id")
            if not mid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            upsert_fields(conn, "passport_modules", mid, body,
                ["name","slug","category","layer","description","status",
                 "owner_email","backup_owner_email","primary_route","source_of_truth","notes"], actor)
            return cors({"ok": True})

        # ── Routes ─────────────────────────────────────────────────────────────
        if method == "POST" and action == "add_route":
            title = body.get("title","").strip()
            route = body.get("route","").strip()
            module_id = body.get("module_id")
            if not title or not route or not module_id:
                return cors({"ok": False, "error": {"message": "Нужны title, route, module_id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.passport_routes (module_id,title,route,route_type,description,status,owner_email,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (module_id, title, route, body.get("route_type","page"),
                     body.get("description",""), body.get("status","active"),
                     body.get("owner_email",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_route":
            rid = body.get("id")
            if not rid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            upsert_fields(conn, "passport_routes", rid, body,
                ["title","route","route_type","description","status","owner_email"], actor)
            return cors({"ok": True})

        # ── Entities ───────────────────────────────────────────────────────────
        if method == "POST" and action == "add_entity":
            name = body.get("name","").strip()
            if not name:
                return cors({"ok": False, "error": {"message": "Нужен name"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.passport_entities (name,kind,description,module_id,source_of_truth_module_id,source_of_truth_details,owner_email,data_class,status,notes,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (name, body.get("kind","business"), body.get("description",""),
                     body.get("module_id") or None, body.get("source_of_truth_module_id") or None,
                     body.get("source_of_truth_details",""), body.get("owner_email",""),
                     body.get("data_class","internal"), body.get("status","active"),
                     body.get("notes",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_entity":
            eid = body.get("id")
            if not eid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            upsert_fields(conn, "passport_entities", eid, body,
                ["name","kind","description","module_id","source_of_truth_module_id",
                 "source_of_truth_details","owner_email","data_class","status","notes"], actor)
            return cors({"ok": True})

        # ── Dependencies ───────────────────────────────────────────────────────
        if method == "POST" and action == "add_dependency":
            fid = body.get("from_module_id")
            tid = body.get("to_module_id")
            if not fid or not tid:
                return cors({"ok": False, "error": {"message": "Нужны from_module_id и to_module_id"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.passport_dependencies (from_module_id,to_module_id,dep_type,criticality,notes,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (fid, tid, body.get("dep_type","reads"), body.get("criticality","medium"),
                     body.get("notes",""), actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        # ── Overlaps ───────────────────────────────────────────────────────────
        if method == "POST" and action == "add_overlap":
            title = body.get("title","").strip()
            if not title:
                return cors({"ok": False, "error": {"message": "Нужен title"}}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {S}.passport_overlaps (overlap_type,status,title,description,related_module_id,resolution,created_by,updated_by) "
                    f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (body.get("overlap_type","unclear_boundary"), body.get("status","open"),
                     title, body.get("description",""),
                     body.get("related_module_id") or None, body.get("resolution",""),
                     actor, actor),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        if method == "PUT" and action == "update_overlap":
            oid = body.get("id")
            if not oid:
                return cors({"ok": False, "error": {"message": "Нужен id"}}, 400)
            upsert_fields(conn, "passport_overlaps", oid, body,
                ["overlap_type","status","title","description","related_module_id","resolution"], actor)
            return cors({"ok": True})

        # ── Notes ──────────────────────────────────────────────────────────────
        if method == "PUT" and action == "save_notes":
            content = body.get("content","")
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {S}.passport_notes SET content = %s, updated_at = NOW(), updated_by = %s WHERE id = 1",
                    (content, actor),
                )
            conn.commit()
            return cors({"ok": True})

        return cors({"ok": False, "error": {"message": "Неизвестное действие"}}, 400)

    finally:
        conn.close()
