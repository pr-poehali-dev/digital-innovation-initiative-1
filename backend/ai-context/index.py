import json
import os
import hashlib
from datetime import timezone, datetime
import psycopg2

DB = os.environ["DATABASE_URL"]
_s = os.environ.get("MAIN_DB_SCHEMA", "").strip()
S = _s if _s else "t_p61016064_digital_innovation_i"

EXPORT_VERSION = 1
MAX_ITEMS = 20
MAX_NOTE_CHARS = 1500


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
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


def trim(text: str, limit: int = MAX_NOTE_CHARS) -> str:
    if not text:
        return ""
    text = text.strip()
    if len(text) > limit:
        return text[:limit] + "…"
    return text


def stable_hash(obj) -> str:
    """Детерминированный MD5 от объекта — массивы сортируются по JSON-ключу."""
    canonical = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.md5(canonical.encode()).hexdigest()


# ── HQ ────────────────────────────────────────────────────────────────────────
def fetch_hq(conn) -> dict:
    hq = {"goals": [], "rules": [], "decisions": [], "risks": [], "ideas": [], "blocks": {}}
    with conn.cursor() as cur:

        cur.execute(f"""
            SELECT section_key, content, updated_at, updated_by
            FROM {S}.hq_blocks WHERE content != '' LIMIT 10
        """)
        for r in cur.fetchall():
            hq["blocks"][r[0]] = {"content": trim(r[1]), "updated_at": str(r[2]), "updated_by": r[3]}

        cur.execute(f"""
            SELECT title, horizon, description, success_criteria, status
            FROM {S}.hq_goals ORDER BY created_at LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            hq["goals"].append({"title": r[0], "horizon": r[1], "description": trim(r[2]),
                                 "success_criteria": trim(r[3]), "status": r[4]})

        cur.execute(f"""
            SELECT title, category, description, rationale
            FROM {S}.hq_rules ORDER BY category, created_at LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            hq["rules"].append({"title": r[0], "category": r[1],
                                 "description": trim(r[2]), "rationale": trim(r[3])})

        cur.execute(f"""
            SELECT title, what, why, impact, decided_at
            FROM {S}.hq_decisions ORDER BY decided_at DESC LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            hq["decisions"].append({"title": r[0], "what": trim(r[1]), "why": trim(r[2]),
                                     "impact": trim(r[3]), "decided_at": str(r[4])})

        cur.execute(f"""
            SELECT title, description, probability, impact, mitigation, status
            FROM {S}.hq_risks ORDER BY probability DESC, impact DESC LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            hq["risks"].append({"title": r[0], "description": trim(r[1]),
                                 "probability": r[2], "impact": r[3],
                                 "mitigation": trim(r[4]), "status": r[5]})

        cur.execute(f"""
            SELECT title, description, category, priority
            FROM {S}.hq_ideas ORDER BY priority DESC, created_at DESC LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            hq["ideas"].append({"title": r[0], "description": trim(r[1]),
                                 "category": r[2], "priority": r[3]})

    return hq


# ── Project ───────────────────────────────────────────────────────────────────
def fetch_project(conn) -> dict:
    proj = {"sections": {}, "conflicts_open": [], "waves": [], "decisions": []}
    with conn.cursor() as cur:

        cur.execute(f"""
            SELECT section_key, content, updated_at, updated_by
            FROM {S}.project_sections WHERE content != '' LIMIT 10
        """)
        for r in cur.fetchall():
            proj["sections"][r[0]] = {"content": trim(r[1]), "updated_at": str(r[2]), "updated_by": r[3]}

        cur.execute(f"""
            SELECT title, description, gap_type, status
            FROM {S}.project_gaps WHERE status = 'open' ORDER BY created_at LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            proj["conflicts_open"].append({"title": r[0], "description": trim(r[1]),
                                           "type": r[2], "status": r[3]})

        cur.execute(f"""
            SELECT w.wave_num, w.title, w.goal, w.status,
                   COUNT(wi.id) as total,
                   SUM(CASE WHEN wi.status = 'done' THEN 1 ELSE 0 END) as done_cnt
            FROM {S}.project_waves w
            LEFT JOIN {S}.project_wave_items wi ON wi.wave_id = w.id
            GROUP BY w.wave_num, w.title, w.goal, w.status
            ORDER BY w.wave_num LIMIT 10
        """)
        for r in cur.fetchall():
            proj["waves"].append({"num": r[0], "title": r[1], "goal": trim(r[2]),
                                   "status": r[3], "total": r[4],
                                   "done": int(r[5]) if r[5] else 0})

        cur.execute(f"""
            SELECT what, why, changed, decided_at
            FROM {S}.project_decisions ORDER BY decided_at DESC LIMIT {MAX_ITEMS}
        """)
        for r in cur.fetchall():
            proj["decisions"].append({"what": trim(r[0]), "why": trim(r[1]),
                                       "changed": trim(r[2]), "decided_at": str(r[3])})

    return proj


# ── Passport ──────────────────────────────────────────────────────────────────
def fetch_passport(conn) -> dict:
    pp = {"modules": [], "entities": [], "overlaps_open": [], "notes": ""}
    with conn.cursor() as cur:

        cur.execute(f"""
            SELECT name, slug, category, layer, status, owner_email,
                   backup_owner_email, primary_route, description
            FROM {S}.passport_modules ORDER BY category, name LIMIT 30
        """)
        for r in cur.fetchall():
            pp["modules"].append({
                "name": r[0], "slug": r[1], "category": r[2], "layer": r[3],
                "status": r[4], "owner_email": r[5], "backup_owner_email": r[6],
                "primary_route": r[7], "description": trim(r[8], 200),
            })

        cur.execute(f"""
            SELECT e.name, e.kind, e.status, e.owner_email,
                   e.source_of_truth_details, sm.name as sot_module
            FROM {S}.passport_entities e
            LEFT JOIN {S}.passport_modules sm ON sm.id = e.source_of_truth_module_id
            ORDER BY e.kind, e.name LIMIT 30
        """)
        for r in cur.fetchall():
            pp["entities"].append({
                "name": r[0], "kind": r[1], "status": r[2], "owner_email": r[3],
                "source_of_truth_details": trim(r[4], 200), "sot_module": r[5],
            })

        cur.execute(f"""
            SELECT title, overlap_type, description
            FROM {S}.passport_overlaps WHERE status = 'open' ORDER BY id LIMIT 10
        """)
        for r in cur.fetchall():
            pp["overlaps_open"].append({"title": r[0], "type": r[1], "description": trim(r[2])})

        cur.execute(f"SELECT content FROM {S}.passport_notes WHERE id = 1")
        row = cur.fetchone()
        pp["notes"] = trim(row[0]) if row else ""

    return pp


# ── Section hashes ─────────────────────────────────────────────────────────────
def compute_section_hashes(hq: dict, proj: dict, pp: dict) -> dict:
    """Детерминированные хеши по каждой секции — sorted keys, без updated_at шума."""

    def clean_hq(d):
        return {
            "goals":     sorted([{k: v for k, v in g.items() if k != "updated_at"} for g in d["goals"]], key=lambda x: x.get("title","")),
            "rules":     sorted([{k: v for k, v in r.items() if k != "updated_at"} for r in d["rules"]], key=lambda x: x.get("title","")),
            "decisions": sorted([{k: v for k, v in r.items() if k not in ("updated_at","decided_at")} for r in d["decisions"]], key=lambda x: x.get("title","")),
            "risks":     sorted([{k: v for k, v in r.items() if k != "updated_at"} for r in d["risks"]], key=lambda x: x.get("title","")),
            "ideas":     sorted([{k: v for k, v in r.items() if k != "updated_at"} for r in d["ideas"]], key=lambda x: x.get("title","")),
            "blocks":    {k: v["content"] for k, v in d["blocks"].items()},
        }

    def clean_project(d):
        return {
            "sections":       {k: v["content"] for k, v in d["sections"].items()},
            "conflicts_open": sorted(d["conflicts_open"], key=lambda x: x.get("title","")),
            "waves":          sorted([{k: v for k, v in w.items()} for w in d["waves"]], key=lambda x: x.get("num", 0)),
            "decisions":      sorted([{k: v for k, v in r.items() if k not in ("updated_at","decided_at")} for r in d["decisions"]], key=lambda x: x.get("what","")[:40]),
        }

    def clean_passport(d):
        return {
            "modules":       sorted([{k: v for k, v in m.items() if k != "description"} for m in d["modules"]], key=lambda x: x.get("slug","")),
            "entities":      sorted([{k: v for k, v in e.items()} for e in d["entities"]], key=lambda x: x.get("name","")),
            "overlaps_open": sorted(d["overlaps_open"], key=lambda x: x.get("title","")),
            "notes":         d["notes"],
        }

    hq_h   = stable_hash(clean_hq(hq))
    proj_h = stable_hash(clean_project(proj))
    pp_h   = stable_hash(clean_passport(pp))
    full_h = stable_hash({"hq": hq_h, "project": proj_h, "passport": pp_h})

    return {
        "hq":      hq_h,
        "project": proj_h,
        "passport":pp_h,
        "full":    full_h,
    }


# ── Last export lookup ─────────────────────────────────────────────────────────
def get_last_export(conn, scope: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT source_hash, hq_hash, project_hash, passport_hash,
                   section_hashes_json, item_counts_json, generated_at, generated_by
            FROM {S}.admin_ai_context_exports
            WHERE scope = %s
            ORDER BY generated_at DESC LIMIT 1
        """, (scope,))
        row = cur.fetchone()
    if not row:
        return None
    return {
        "source_hash":          row[0],
        "hq_hash":              row[1],
        "project_hash":         row[2],
        "passport_hash":        row[3],
        "section_hashes":       row[4] or {},
        "item_counts":          row[5] or {},
        "generated_at":         str(row[6]),
        "generated_by":         row[7],
    }


def _audit(conn, actor: str, action: str,
           entity_type: str, entity_id: int,
           before: dict, after: dict, reason: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {S}.admin_audit_log "
            f"(actor_email, actor_role, action, entity_type, entity_id, "
            f"before_json, after_json, reason) "
            f"VALUES (%s,'super_admin',%s,%s,%s,%s,%s,%s)",
            (actor, action, entity_type, entity_id,
             json.dumps(before, default=str),
             json.dumps(after, default=str),
             reason),
        )
    conn.commit()


def log_export(conn, scope: str, fmt: str, hashes: dict, counts: dict, actor: str) -> None:
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {S}.admin_ai_context_exports
              (scope, format, source_hash, hq_hash, project_hash, passport_hash,
               section_hashes_json, item_counts_json, generated_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            scope, fmt,
            hashes.get("full",""), hashes.get("hq",""),
            hashes.get("project",""), hashes.get("passport",""),
            json.dumps(hashes), json.dumps(counts),
            actor,
        ))
    conn.commit()


# ── Freshness ──────────────────────────────────────────────────────────────────
def freshness_status(live_hashes: dict, last: dict | None, scope: str) -> dict:
    if not last:
        return {
            "status":           "never_exported",
            "changed_sections": [],
            "last_exported_at": None,
            "last_exported_by": None,
            "last_hash":        None,
        }

    changed = []
    for sec in ("hq", "project", "passport"):
        live_h = live_hashes.get(sec, "")
        prev_h = last.get("section_hashes", {}).get(sec, "") or last.get(f"{sec}_hash", "")
        if live_h and prev_h and live_h != prev_h:
            changed.append(sec)

    # для scope != full сравниваем только нужную секцию
    if scope != "full":
        scope_hash_live = live_hashes.get(scope, "")
        scope_hash_last = last.get("source_hash", "")
        st = "fresh" if scope_hash_live == scope_hash_last else "changed"
        return {
            "status":           st,
            "changed_sections": [scope] if st == "changed" else [],
            "last_exported_at": last["generated_at"],
            "last_exported_by": last["generated_by"],
            "last_hash":        last["source_hash"],
        }

    live_full = live_hashes.get("full", "")
    st = "fresh" if live_full == last["source_hash"] else "changed"
    return {
        "status":           st,
        "changed_sections": changed,
        "last_exported_at": last["generated_at"],
        "last_exported_by": last["generated_by"],
        "last_hash":        last["source_hash"],
    }


# ── Markdown renderer ─────────────────────────────────────────────────────────
def render_markdown(meta: dict, hq: dict, proj: dict, pp: dict) -> str:
    lines = []
    a = lines.append

    a("# Unified AI Context")
    a("")
    a("## Meta")
    a(f"- Generated at: {meta['generated_at']}")
    a(f"- Generated by: {meta['generated_by']}")
    a(f"- Scope: {meta['scope']}")
    a(f"- Export version: {meta['export_version']}")
    a("")

    a("## Constraints / One source of truth rules")
    a("- HQ — стратегия: зачем и по каким правилам движется проект")
    a("- Project — архитектурный переход: as-is, to-be, conflicts, waves")
    a("- Passport — инвентаризация: модули, сущности, owners, SOT")
    a("- Plan — выполнение: backlog, спринты, задачи, дедлайны")
    a("")

    # ── HQ ────────────────────────────────────────────────────────────────────
    a("## HQ — Стратегическая память")
    a("")
    for key, label in [("vision","### Vision"), ("mission","### Mission"), ("focus","### Focus")]:
        block = hq["blocks"].get(key)
        if block and block["content"]:
            a(label)
            a(block["content"])
            a(f"*Updated: {block['updated_at'][:10]} by {block['updated_by']}*")
            a("")

    if hq["goals"]:
        a("### Goals")
        for g in hq["goals"]:
            a(f"- **{g['title']}**{' [' + g['status'] + ']' if g.get('status') else ''}{' | horizon: ' + g['horizon'] if g.get('horizon') else ''}")
            if g.get("success_criteria"):
                a(f"  - Success: {g['success_criteria']}")
        a("")

    if hq["rules"]:
        a("### Rules")
        by_cat: dict[str, list] = {}
        for r in hq["rules"]:
            by_cat.setdefault(r.get("category","general"), []).append(r)
        for cat, rules in by_cat.items():
            a(f"**{cat}**")
            for r in rules:
                a(f"- {r['title']}: {r['description']}")
        a("")

    if hq["decisions"]:
        a("### Strategic Decisions")
        for d in hq["decisions"]:
            a(f"- **{d['title']}** ({d['decided_at'][:10]}): {d['what']}")
            if d.get("why"):
                a(f"  - Why: {d['why']}")
        a("")

    if hq["risks"]:
        a("### Risks")
        for r in hq["risks"]:
            a(f"- **{r['title']}** [{r['status']}] p={r['probability']} i={r['impact']}")
            if r.get("mitigation"):
                a(f"  - Mitigation: {r['mitigation']}")
        a("")

    if hq["ideas"]:
        a("### Ideas / Parking Lot")
        for i in hq["ideas"]:
            a(f"- [{i.get('priority','?')}] {i['title']}")
        a("")

    # ── Project ───────────────────────────────────────────────────────────────
    a("## Project — Архитектурный переход")
    a("")
    as_is  = proj["sections"].get("as_is", {})
    to_be  = proj["sections"].get("to_be", {})
    notes_sec = proj["sections"].get("notes", {})

    if as_is.get("content"):
        a("### As-is")
        a(as_is["content"])
        a("")
    if to_be.get("content"):
        a("### To-be")
        a(to_be["content"])
        a("")

    if proj["conflicts_open"]:
        a("### Open Conflicts")
        for c in proj["conflicts_open"]:
            a(f"- **[{c['type']}]** {c['title']}")
            if c.get("description"):
                a(f"  {c['description'][:300]}")
        a("")
    else:
        a("### Open Conflicts")
        a("*No open conflicts.*")
        a("")

    if proj["waves"]:
        a("### Waves of Change")
        for w in proj["waves"]:
            done  = w.get("done", 0)
            total = w.get("total", 0)
            prog  = f" {done}/{total}" if total else ""
            a(f"- **{w['title']}** [{w['status']}]{prog} — {w['goal']}")
        a("")

    if proj["decisions"]:
        a("### Architecture Decisions")
        for d in proj["decisions"]:
            a(f"- **{d['what'][:120]}**")
            if d.get("why"):
                a(f"  - Why: {d['why'][:200]}")
        a("")

    if notes_sec.get("content"):
        a("### Project Notes")
        a(notes_sec["content"])
        a("")

    # ── Passport ──────────────────────────────────────────────────────────────
    a("## Passport — Реестр платформы")
    a("")
    if pp["modules"]:
        a("### Modules")
        for m in pp["modules"]:
            a(f"- **{m['name']}** ({m['category']}) | status: {m['status']} | owner: {m['owner_email'] or 'no owner'} | route: {m['primary_route'] or '—'}")
        a("")

    if pp["entities"]:
        a("### Entities")
        for e in pp["entities"]:
            a(f"- `{e['name']}` ({e['kind']}) | SOT: {e.get('sot_module') or 'no SOT'} | owner: {e['owner_email'] or 'no owner'}")
        a("")

    if pp["overlaps_open"]:
        a("### Open Overlaps")
        for o in pp["overlaps_open"]:
            a(f"- **[{o['type']}]** {o['title']}")
        a("")
    else:
        a("### Open Overlaps")
        a("*No open overlaps.*")
        a("")

    no_owner_m = sum(1 for m in pp["modules"] if not m["owner_email"])
    no_sot_e   = sum(1 for e in pp["entities"] if not e.get("sot_module"))
    a("### Normalization")
    a(f"- Modules without owner: {no_owner_m}")
    a(f"- Entities without SOT: {no_sot_e}")
    a("")

    if pp["notes"]:
        a("### Passport Notes")
        a(pp["notes"])
        a("")

    a("## Current Priorities")
    for w in proj["waves"]:
        if w["status"] == "in_progress":
            a(f"- Active wave: {w['title']} — {w['goal']}")
    n_conf = len(proj["conflicts_open"])
    n_over = len(pp["overlaps_open"])
    if n_conf:
        a(f"- Resolve {n_conf} open architecture conflict(s)")
    if n_over:
        a(f"- Close {n_over} open passport overlap(s)")
    a("")

    return "\n".join(lines)


# ── Handler ───────────────────────────────────────────────────────────────────
def handler(event: dict, context) -> dict:
    """Unified AI context — сборка HQ + Project + Passport, freshness signal, export log."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    token = headers.get("x-admin-token") or headers.get("X-Admin-Token", "")

    conn = psycopg2.connect(DB)
    try:
        actor = get_actor(conn, token)
        if not actor:
            return cors({"ok": False, "error": {"message": "Не авторизован"}}, 401)

        qs     = event.get("queryStringParameters") or {}
        action = qs.get("action", "")
        fmt    = qs.get("format", "json")
        scope  = qs.get("scope", "full")

        # ── STATUS (no side-effects, not logged) ──────────────────────────────
        if action == "status":
            hq_data   = fetch_hq(conn)
            proj_data = fetch_project(conn)
            pp_data   = fetch_passport(conn)

            live_hashes = compute_section_hashes(hq_data, proj_data, pp_data)

            # для scope != full берём только нужный хеш как source_hash
            if scope == "full":
                last = get_last_export(conn, "full")
            else:
                last = get_last_export(conn, scope)
                # пересчитываем source_hash как хеш конкретной секции
                if last:
                    last["source_hash"] = last.get("section_hashes", {}).get(scope, last["source_hash"])

            fresh = freshness_status(live_hashes, last, scope)

            return cors({
                "ok": True,
                "scope": scope,
                "live_hashes": live_hashes,
                "freshness": fresh,
            })

        # ── EXPORT (logged) ───────────────────────────────────────────────────
        if action == "export":
            now_iso = datetime.now(timezone.utc).isoformat()

            if scope == "hq":
                hq_data   = fetch_hq(conn)
                proj_data = {"sections":{}, "conflicts_open":[], "waves":[], "decisions":[]}
                pp_data   = {"modules":[], "entities":[], "overlaps_open":[], "notes":""}
            elif scope == "project":
                hq_data   = {"goals":[], "rules":[], "decisions":[], "risks":[], "ideas":[], "blocks":{}}
                proj_data = fetch_project(conn)
                pp_data   = {"modules":[], "entities":[], "overlaps_open":[], "notes":""}
            elif scope == "passport":
                hq_data   = {"goals":[], "rules":[], "decisions":[], "risks":[], "ideas":[], "blocks":{}}
                proj_data = {"sections":{}, "conflicts_open":[], "waves":[], "decisions":[]}
                pp_data   = fetch_passport(conn)
            else:
                hq_data   = fetch_hq(conn)
                proj_data = fetch_project(conn)
                pp_data   = fetch_passport(conn)

            # Всегда считаем полные хеши (нужны для section_hashes_json)
            full_hq   = hq_data   if scope == "full" else fetch_hq(conn)
            full_proj = proj_data if scope == "full" else fetch_project(conn)
            full_pp   = pp_data   if scope == "full" else fetch_passport(conn)
            all_hashes = compute_section_hashes(full_hq, full_proj, full_pp)

            counts = {
                "goals":     len(hq_data.get("goals",[])),
                "rules":     len(hq_data.get("rules",[])),
                "decisions": len(hq_data.get("decisions",[])),
                "risks":     len(hq_data.get("risks",[])),
                "ideas":     len(hq_data.get("ideas",[])),
                "conflicts":  len(proj_data.get("conflicts_open",[])),
                "waves":      len(proj_data.get("waves",[])),
                "modules":    len(pp_data.get("modules",[])),
                "entities":   len(pp_data.get("entities",[])),
            }

            meta = {
                "generated_at":   now_iso,
                "generated_by":   actor,
                "export_version": EXPORT_VERSION,
                "scope":          scope,
                "source_hash":    all_hashes.get(scope if scope != "full" else "full", all_hashes["full"]),
                "section_hashes": all_hashes,
            }

            rendered_md = render_markdown(meta, hq_data, proj_data, pp_data)

            # Логируем экспорт + audit trail
            log_export(conn, scope, fmt, all_hashes, counts, actor)
            _audit(conn, actor, "ai_context.exported", "ai_context", 0,
                   {}, {"scope": scope, "format": fmt,
                        "source_hash": all_hashes.get("full","")[:12],
                        "items": counts},
                   reason=f"scope={scope} format={fmt}")

            if fmt == "markdown":
                return {
                    "statusCode": 200,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                        "Content-Type": "text/plain; charset=utf-8",
                    },
                    "body": rendered_md,
                }

            return cors({
                "ok": True,
                "meta": meta,
                "summary": counts,
                "hq": hq_data,
                "project": proj_data,
                "passport": pp_data,
                "rendered_markdown": rendered_md,
            })

        return cors({"ok": False, "error": {"message": "Нужен ?action=export|status"}}, 400)

    finally:
        conn.close()