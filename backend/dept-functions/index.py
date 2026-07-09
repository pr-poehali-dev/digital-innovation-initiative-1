"""
dept-functions — управление функциями подразделения.

Actions:
  GET  functions          — список функций проекта
  POST create_function    — создать функцию вручную
  PUT  update_function    — обновить функцию
  POST extract_functions  — AI извлекает функции из base64-изображения (скрин), PDF (текстовый слой или скан ≤1 стр. через OCR) или DOCX. Возвращает черновик, ничего не сохраняет.
  POST confirm_functions  — сохраняет подтверждённый/отредактированный пользователем список функций из черновика
  GET  automation         — список записей автоматизации
  PUT  update_automation  — обновить запись автоматизации
  POST ai_recommend       — AI генерирует рекомендации по автоматизации функции
  GET  function_processes — список процессов, связанных с функцией
  POST link_process       — привязать существующий процесс к функции
  DELETE unlink_process    — отвязать процесс от функции
  POST create_and_link_process — создать новый процесс (в wb_processes) и сразу связать с функцией
  GET  org_tree           — оргдерево проекта (узлы + число функций + непривязанные)
  GET  org_functions      — функции узла (роли, направления, автоматизация); include_children=true — с дочерними
  GET  unassigned_functions — функции без привязки к оргединице
  POST assign_org_unit    — привязать функцию к узлу (owner/co_executor/participant/reviewer)
  DELETE unassign_org_unit — снять привязку функции к узлу
  POST assign_direction   — привязать код направления (18, 93, 32.2…) к функции
  DELETE unassign_direction — снять направление
  GET  overlaps_report    — отчёт «Пересечения функций»: кластеры дублей между узлами + матрица узел×узел + связь с автоматизацией
  POST create_org_unit    — создать дочерний узел оргструктуры (code уникален, path/level считает бэкенд)
  PUT  rename_org_unit    — переименовать узел (пересчёт path у узла и потомков)
  DELETE archive_org_unit — архивировать узел (soft; запрещено при активных детях или привязанных функциях)
  GET  operating_profile  — операционный профиль функции (signal-поля для будущего мэтчинга)
  POST save_operating_profile — сохранить/обновить операционный профиль (upsert)
  GET  operating_profiles_status — статусы заполненности профилей по проекту (empty/partial/full)
  GET  process_cards      — процессные карточки функции (внутри функции; include_archived=true для архива)
  GET  process_cards_counts — счётчики активных карточек по функциям проекта
  POST create_process_card / update_process_card — создать/обновить карточку (controlled values валидируются)
  POST archive_process_card / restore_process_card — soft-архив и восстановление карточки
  GET  function_practices — привязанные к функции практики улучшения (+ краткие поля практики и capability_count)
  GET  function_practices_counts — счётчики активных привязок практик по функциям проекта
  POST add_function_practice / update_function_practice — привязать/обновить практику (explainability обязателен)
  POST archive_function_practice / restore_function_practice — снять/восстановить привязку (без hard delete)
  GET  function_capabilities — derived capability view функции (агрегация practices→capabilities, need/priority, explainability; без persisted-модели)
  GET  function_capabilities_counts — счётчики active/required capability по функциям проекта (badge)
  GET  function_module_candidates — derived: под каждую capability функции — кандидатные модули (supply), group-by-capability, gaps не теряются, 3 независимые оси need/priority/coverage, explainability до практик; без persisted-модели
  GET  function_module_candidates_counts — краткий summary (distinct modules, gaps) для badge
  GET  function_module_bundles — derived: кандидатные наборы модулей (≤3) с coverage profile (без общего score), dominance pruning, det. sort, explainability до практик и module contribution; без persisted-модели
  GET  function_shortlists — сохранённые наборы (persisted) с current-derived покрытием и drift-флагами
  GET  function_shortlists_counts — счётчики active/preferred/rejected по функциям (badge)
  GET  function_shortlist_detail — детали набора: snapshot + current-derived coverage/explainability + drift
  POST create_function_shortlist — сохранить bundle как shortlist (immutable module set; bundle_key канонизируется на бэкенде; snapshot; dedup active; restore архивного)
  POST update_function_shortlist — только metadata (title/status/note); состав неизменяем; note обязателен для preferred/rejected; ≤1 preferred на функцию
  POST archive_function_shortlist / restore_function_shortlist — soft-архив с проверкой конфликтов при восстановлении
  GET  function_decision_summary — derived read-only сводка решения над active preferred shortlist (selection_state, flags, residual required/supporting gaps, drift, archived supply; без авто-выбора и новой таблицы)
"""
import base64
import io
import itertools
import json
import os
import re
import urllib.error
import urllib.request

import psycopg2

DB = os.environ["DATABASE_URL"]
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p61016064_digital_innovation_i")
YANDEX_GPT_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")
YANDEX_FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "")
YANDEX_VISION_API_KEY = os.environ.get("YANDEX_GPT_API_KEY", "")

HORIZONS = {"short": "до 3 мес", "medium": "3–12 мес", "long": "1–3 года"}
STATUSES = {"manual": "Ручной", "partial": "Частично автоматизирован", "automated": "Автоматизирован", "planned": "Планируется"}

# Controlled values для процессных карточек (валидация на бэкенде)
PC_TRIGGER = {"incoming_request", "document_received", "scheduled", "system_event",
              "manager_assignment", "customer_action", "external_signal", "manual_start", "other", "unknown"}
PC_INPUT = {"structured_data", "semi_structured", "documents", "email", "scans", "external_sources"}
PC_OUTPUT = {"decision", "document", "approval", "report", "notification", "data_update"}
PC_SLA = {"none", "soft", "hard", "regulatory", "unknown"}
PC_PAIN = {"manual_reentry", "long_cycle_time", "many_approvals", "low_visibility", "high_error_rate",
           "knowledge_dependency", "document_heaviness", "bottlenecks", "compliance_risk"}

# Controlled values для привязки практик к функциям (function_practice_mappings)
FPM_RELEVANCE = {"primary", "supporting", "explore"}
FPM_SOURCE = {"manual", "interview", "workshop", "analysis"}
FPM_REASON = {"reduce_manual_work", "reduce_cycle_time", "reduce_errors", "reduce_approvals",
              "improve_visibility", "improve_compliance", "reduce_knowledge_dependency",
              "improve_service_quality", "scale_volume", "standardize_execution"}

# Shortlist статусы решений
SHORTLIST_STATUS = {"shortlisted", "preferred", "rejected"}

# Ранги для агрегации derived capability view (чем больше — тем сильнее)
NEED_RANK = {"required": 3, "supporting": 2, "optional": 1}
PRIORITY_RANK = {"primary": 3, "supporting": 2, "explore": 1}
NEED_BY_RANK = {3: "required", 2: "supporting", 1: "optional"}
PRIORITY_BY_RANK = {3: "primary", 2: "supporting", 1: "explore"}
COVERAGE_RANK = {"core": 3, "supporting": 2, "limited": 1}
COVERAGE_BY_RANK = {3: "core", 2: "supporting", 1: "limited", 0: None}


def build_function_capability_supply(cur, schema, func_id, include_arch_caps=False, include_arch_modules=False):
    """Общая derivation demand+supply для функции.
    Возвращает: список capability-групп (need/priority/source_practices) + модули, покрывающие их.
    Используется и candidate-view, и bundle-view — единый источник, без дублирования логики."""
    cur.execute(
        f"""SELECT c.id, c.slug, c.name, c.category, c.status,
                   pcm.relation_type,
                   m.relevance_level, m.reason_tags, m.rationale_note,
                   p.id, p.name, p.slug
            FROM {schema}.function_practice_mappings m
            JOIN {schema}.solution_practices p ON p.id = m.practice_id
            JOIN {schema}.solution_practice_capability_map pcm ON pcm.practice_id = p.id
            JOIN {schema}.solution_capabilities c ON c.id = pcm.capability_id
            WHERE m.function_id = %s AND m.is_archived = false""",
        (func_id,),
    )
    caps = {}
    for r in cur.fetchall():
        (cap_id, cap_slug, cap_name, cap_cat, cap_status, relation_type,
         relevance, reason_tags, rationale, p_id, p_name, p_slug) = r
        if cap_id not in caps:
            caps[cap_id] = {"capability_id": cap_id, "slug": cap_slug, "name": cap_name, "category": cap_cat,
                            "status": cap_status, "_need_rank": 0, "_priority_rank": 0,
                            "source_practices": [], "modules": {}}
        a = caps[cap_id]
        a["_need_rank"] = max(a["_need_rank"], NEED_RANK.get(relation_type, 0))
        a["_priority_rank"] = max(a["_priority_rank"], PRIORITY_RANK.get(relevance, 0))
        a["source_practices"].append({
            "practice_id": p_id, "practice_name": p_name, "practice_slug": p_slug,
            "practice_relevance": relevance, "relation_type": relation_type,
            "reason_tags": reason_tags or [], "rationale_note": rationale,
        })

    cap_ids = [cid for cid, a in caps.items() if include_arch_caps or a["status"] == "active"]
    if cap_ids:
        mod_filter = "" if include_arch_modules else \
            "AND md.status = 'active' AND pr.status = 'active' AND ve.status = 'active'"
        cur.execute(
            f"""SELECT mc.capability_id, mc.coverage_level,
                       md.id, md.slug, md.name, md.category, md.status,
                       pr.id, pr.name, pr.status, pr.deployment_types,
                       ve.id, ve.name, ve.status
                FROM {schema}.solution_module_capability_map mc
                JOIN {schema}.solution_product_modules md ON md.id = mc.module_id
                JOIN {schema}.solution_products pr ON pr.id = md.product_id
                JOIN {schema}.solution_vendors ve ON ve.id = pr.vendor_id
                WHERE mc.capability_id = ANY(%s) {mod_filter}""",
            (cap_ids,),
        )
        for s in cur.fetchall():
            (scap_id, coverage_level, mod_id, mod_slug, mod_name, mod_cat, mod_status,
             prod_id, prod_name, prod_status, depl_types, ven_id, ven_name, ven_status) = s
            caps[scap_id]["modules"][mod_id] = {
                "module_id": mod_id, "module_slug": mod_slug, "module_name": mod_name,
                "module_category": mod_cat, "module_status": mod_status, "coverage_level": coverage_level,
                "product_id": prod_id, "product_name": prod_name, "product_status": prod_status,
                "deployment_types": depl_types or [],
                "vendor_id": ven_id, "vendor_name": ven_name, "vendor_status": ven_status,
            }
    groups = []
    for cid in cap_ids:
        a = caps[cid]
        a["need_level"] = NEED_BY_RANK.get(a["_need_rank"], "optional")
        a["priority_level"] = PRIORITY_BY_RANK.get(a["_priority_rank"], "explore")
        a.pop("_need_rank"); a.pop("_priority_rank")
        groups.append(a)
    return groups


def canonical_bundle_key(module_slugs):
    """Канонический identity набора: отсортированные slug через '-'. Строится на бэкенде."""
    return "-".join(sorted(module_slugs))


def evaluate_single_bundle(groups, module_ids):
    """Current-derived оценка одного фиксированного набора модулей против capability функции.
    Возвращает тот же shape, что и один bundle в build_module_bundles (coverage profile,
    capability_results, uncovered, module_contributions) + список неизвестных/архивных модулей."""
    # module_info из текущих capability групп (только модули, реально покрывающие нужные capability)
    module_info = {}
    mod_cap_cov = {}
    for g in groups:
        for mid, m in g["modules"].items():
            module_info[mid] = m
            mod_cap_cov.setdefault(mid, {})[g["capability_id"]] = COVERAGE_RANK.get(m["coverage_level"], 0)

    cap_meta = {g["capability_id"]: g for g in groups}
    required_total = sum(1 for g in groups if g["need_level"] == "required")
    supporting_total = sum(1 for g in groups if g["need_level"] == "supporting")
    optional_total = sum(1 for g in groups if g["need_level"] == "optional")

    combo = [mid for mid in module_ids if mid in module_info]
    # модули, которые в наборе, но уже ничего не покрывают из нужного функции (drift-сигнал)
    non_contributing_ids = [mid for mid in module_ids if mid not in module_info]

    best = {}
    for mid in combo:
        for cid, rank in mod_cap_cov.get(mid, {}).items():
            if rank > best.get(cid, 0):
                best[cid] = rank

    prof = {
        "required_covered": 0, "supporting_covered": 0, "optional_covered": 0,
    }
    for cid, rank in best.items():
        if rank > 0:
            prof[f"{cap_meta[cid]['need_level']}_covered"] += 1

    capability_results, uncovered = [], []
    module_contrib = {mid: {"required": 0, "supporting": 0, "optional": 0, "caps": []} for mid in combo}
    for g in groups:
        cid = g["capability_id"]
        rank = best.get(cid, 0)
        covered = rank > 0
        best_lvl = COVERAGE_BY_RANK[rank]
        best_modules = []
        if covered:
            for mid in combo:
                if mod_cap_cov.get(mid, {}).get(cid, 0) == rank:
                    best_modules.append({"module_id": mid, "module_name": module_info[mid]["module_name"]})
                    mc = module_contrib[mid]
                    mc[g["need_level"]] += 1
                    mc["caps"].append(g["name"])
        capability_results.append({
            "capability_id": cid, "capability_name": g["name"], "capability_category": g["category"],
            "need_level": g["need_level"], "priority_level": g["priority_level"],
            "covered": covered, "best_coverage_level": best_lvl,
            "best_modules": best_modules, "source_practices": g["source_practices"],
        })
        if not covered:
            uncovered.append({"capability_id": cid, "capability_name": g["name"],
                              "need_level": g["need_level"], "priority_level": g["priority_level"],
                              "source_practices": g["source_practices"]})

    capability_results.sort(key=lambda e: (
        -NEED_RANK.get(e["need_level"], 0),
        0 if (e["need_level"] == "required" and not e["covered"]) else 1,
        0 if not e["covered"] else 1,
        -PRIORITY_RANK.get(e["priority_level"], 0),
        e["capability_name"],
    ))

    contributions = []
    for mid in sorted(combo, key=lambda x: module_info[x]["module_name"]):
        mc = module_contrib[mid]
        contributions.append({
            "module_id": mid, "module_name": module_info[mid]["module_name"],
            "unique_required_coverage_count": mc["required"],
            "unique_supporting_coverage_count": mc["supporting"],
            "unique_optional_coverage_count": mc["optional"],
            "best_covered_capabilities": mc["caps"],
        })

    return {
        "required_total": required_total, "required_covered": prof["required_covered"],
        "required_uncovered": required_total - prof["required_covered"],
        "supporting_total": supporting_total, "supporting_covered": prof["supporting_covered"],
        "supporting_uncovered": supporting_total - prof["supporting_covered"],
        "optional_total": optional_total, "optional_covered": prof["optional_covered"],
        "optional_uncovered": optional_total - prof["optional_covered"],
        "capability_results": capability_results,
        "uncovered_capabilities": uncovered,
        "module_contributions": contributions,
        "non_contributing_module_ids": non_contributing_ids,
    }


def build_module_bundles(groups, max_size=3, limit=10, only_full_required=False):
    """Derived bundle-view: наборы модулей ≤ max_size, покрытие агрегируется по best coverage
    per capability. Без общего score — coverage profile + лексикографическая сортировка +
    dominance pruning. bundle = набор модулей; продукт/вендор — атрибуты модулей."""
    # Реестр модулей и карта module_id -> {capability_id: coverage_rank}
    module_info = {}
    mod_cap_cov = {}
    for g in groups:
        for mid, m in g["modules"].items():
            module_info[mid] = m
            mod_cap_cov.setdefault(mid, {})[g["capability_id"]] = COVERAGE_RANK.get(m["coverage_level"], 0)

    cap_meta = {g["capability_id"]: g for g in groups}
    required_total = sum(1 for g in groups if g["need_level"] == "required")
    supporting_total = sum(1 for g in groups if g["need_level"] == "supporting")
    optional_total = sum(1 for g in groups if g["need_level"] == "optional")

    candidate_module_ids = sorted(module_info.keys())
    evaluated = 0
    raw = []

    def evaluate(combo):
        # best coverage rank по каждой capability из модулей набора
        best = {}
        for mid in combo:
            for cid, rank in mod_cap_cov.get(mid, {}).items():
                if rank > best.get(cid, 0):
                    best[cid] = rank
        prof = {
            "required_covered": 0, "required_covered_core": 0, "required_covered_supporting": 0, "required_covered_limited": 0,
            "supporting_covered": 0, "supporting_covered_core": 0, "supporting_covered_supporting": 0, "supporting_covered_limited": 0,
            "optional_covered": 0, "optional_covered_core": 0, "optional_covered_supporting": 0, "optional_covered_limited": 0,
        }
        for cid, rank in best.items():
            if rank <= 0:
                continue
            need = cap_meta[cid]["need_level"]
            lvl = COVERAGE_BY_RANK[rank]
            prof[f"{need}_covered"] += 1
            prof[f"{need}_covered_{lvl}"] += 1
        return best, prof

    for size in range(1, max_size + 1):
        for combo in itertools.combinations(candidate_module_ids, size):
            evaluated += 1
            best, prof = evaluate(combo)
            if only_full_required and prof["required_covered"] < required_total:
                continue
            # отбрасываем наборы, где какой-то модуль ничего не добавил (не best ни по одной capability)
            contributes = set()
            for cid, rank in best.items():
                for mid in combo:
                    if mod_cap_cov.get(mid, {}).get(cid, 0) == rank and rank > 0:
                        contributes.add(mid)
            if len(contributes) < len(combo):
                continue
            raw.append({"combo": combo, "best": best, "prof": prof})

    # Dominance pruning: A доминирует B, если по всем осям покрытия A >= B,
    # по качеству required core A >= B и модулей не больше, при этом строго лучше хотя бы в одном.
    def dominates(a, b):
        ap, bp = a["prof"], b["prof"]
        keys = ["required_covered", "required_covered_core", "supporting_covered",
                "supporting_covered_core", "optional_covered"]
        ge_all = all(ap[k] >= bp[k] for k in keys) and len(a["combo"]) <= len(b["combo"])
        gt_any = any(ap[k] > bp[k] for k in keys) or len(a["combo"]) < len(b["combo"])
        return ge_all and gt_any

    kept = []
    for b in raw:
        if any(dominates(a, b) for a in raw if a is not b):
            continue
        kept.append(b)

    def products_vendors(combo):
        ps = {module_info[mid]["product_id"] for mid in combo}
        vs = {module_info[mid]["vendor_id"] for mid in combo}
        return len(ps), len(vs)

    def sort_key(b):
        prof = b["prof"]
        req_unc = required_total - prof["required_covered"]
        pc, vc = products_vendors(b["combo"])
        return (
            req_unc,
            -prof["required_covered_core"],
            -prof["required_covered"],
            -prof["supporting_covered"],
            -prof["optional_covered"],
            len(b["combo"]), pc, vc,
            "-".join(module_info[mid]["module_slug"] for mid in sorted(b["combo"])),
        )

    kept.sort(key=sort_key)
    returned = kept[:limit]

    # Финализация выдачи
    bundles = []
    for b in returned:
        combo, best, prof = b["combo"], b["best"], b["prof"]
        pc, vc = products_vendors(combo)
        modules_out = [module_info[mid] for mid in sorted(combo, key=lambda x: (module_info[x]["product_name"], module_info[x]["module_name"]))]

        capability_results = []
        uncovered = []
        module_contrib = {mid: {"required": 0, "supporting": 0, "optional": 0, "caps": []} for mid in combo}
        for g in groups:
            cid = g["capability_id"]
            rank = best.get(cid, 0)
            covered = rank > 0
            best_lvl = COVERAGE_BY_RANK[rank]
            best_modules = []
            if covered:
                for mid in combo:
                    if mod_cap_cov.get(mid, {}).get(cid, 0) == rank:
                        best_modules.append({"module_id": mid, "module_name": module_info[mid]["module_name"]})
                        mc = module_contrib[mid]
                        mc[g["need_level"]] += 1
                        mc["caps"].append(g["name"])
            entry = {
                "capability_id": cid, "capability_name": g["name"], "capability_category": g["category"],
                "need_level": g["need_level"], "priority_level": g["priority_level"],
                "covered": covered, "best_coverage_level": best_lvl,
                "best_modules": best_modules, "source_practices": g["source_practices"],
            }
            capability_results.append(entry)
            if not covered:
                uncovered.append({"capability_id": cid, "capability_name": g["name"],
                                  "need_level": g["need_level"], "priority_level": g["priority_level"],
                                  "source_practices": g["source_practices"]})

        # порядок capability_results: сначала непокрытые required, затем по need/priority
        capability_results.sort(key=lambda e: (
            -NEED_RANK.get(e["need_level"], 0),
            0 if (e["need_level"] == "required" and not e["covered"]) else 1,
            0 if not e["covered"] else 1,
            -PRIORITY_RANK.get(e["priority_level"], 0),
            e["capability_name"],
        ))

        contributions = []
        for mid in sorted(combo, key=lambda x: module_info[x]["module_name"]):
            mc = module_contrib[mid]
            contributions.append({
                "module_id": mid, "module_name": module_info[mid]["module_name"],
                "unique_required_coverage_count": mc["required"],
                "unique_supporting_coverage_count": mc["supporting"],
                "unique_optional_coverage_count": mc["optional"],
                "best_covered_capabilities": mc["caps"],
            })

        bundles.append({
            "bundle_key": "-".join(module_info[mid]["module_slug"] for mid in sorted(combo)),
            "modules_count": len(combo), "products_count": pc, "vendors_count": vc,
            "required_total": required_total, "required_covered": prof["required_covered"],
            "required_uncovered": required_total - prof["required_covered"],
            "supporting_total": supporting_total, "supporting_covered": prof["supporting_covered"],
            "supporting_uncovered": supporting_total - prof["supporting_covered"],
            "optional_total": optional_total, "optional_covered": prof["optional_covered"],
            "optional_uncovered": optional_total - prof["optional_covered"],
            "coverage_breakdown": prof,
            "modules": modules_out,
            "capability_results": capability_results,
            "uncovered_capabilities": uncovered,
            "module_contributions": contributions,
        })

    best_req_uncovered = min((required_total - b["prof"]["required_covered"] for b in kept), default=required_total)
    summary = {
        "candidate_modules_count": len(candidate_module_ids),
        "evaluated_bundles_count": evaluated,
        "returned_bundles_count": len(bundles),
        "required_total": required_total, "supporting_total": supporting_total, "optional_total": optional_total,
        "best_required_uncovered": best_req_uncovered,
        "best_required_covered": max((b["prof"]["required_covered"] for b in kept), default=0),
        "best_supporting_covered": max((b["prof"]["supporting_covered"] for b in kept), default=0),
        "full_required_bundle_exists": (required_total > 0 and best_req_uncovered == 0),
    }
    return summary, bundles


def _clean_scalar(v, allowed):
    """None/'' -> None; недопустимое значение из controlled-набора -> None."""
    if v in ("", None):
        return None
    return v if v in allowed else None


def _clean_arr(v, allowed):
    """Оставляет только допустимые controlled-значения, единообразно возвращает list."""
    if not isinstance(v, list):
        return []
    return [x for x in v if x in allowed]


def _clean_free_arr(v):
    """Свободные теги: строки без пустых, единообразно list."""
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if str(x).strip()]


def cors(body: dict, code: int = 200) -> dict:
    return {
        "statusCode": code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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


def check_project_access(conn, project_id: int, user_id: int) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT 1 FROM {SCHEMA}.projects p
                LEFT JOIN {SCHEMA}.project_members m ON m.project_id = p.id AND m.user_id = %s
                WHERE p.id = %s AND (p.owner_id = %s OR m.user_id = %s) AND p.archived_at IS NULL""",
            (user_id, project_id, user_id, user_id),
        )
        return cur.fetchone() is not None


def yandex_gpt(prompt: str, system: str = "", max_tokens: int = 3000) -> str:
    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    messages = []
    if system:
        messages.append({"role": "system", "text": system})
    messages.append({"role": "user", "text": prompt})
    payload = json.dumps({
        "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": max_tokens},
        "messages": messages,
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {YANDEX_GPT_API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=55) as resp:
        data = json.loads(resp.read())
    return data["result"]["alternatives"][0]["message"]["text"]


def yandex_vision_ocr(content_b64: str, mime_type: str = "image/png") -> str:
    """OCR через Yandex Vision API. Поддерживает изображения (JPEG/PNG) и PDF (до 1 страницы —
    ограничение самого Yandex Vision API для формата PDF)."""
    url = "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText"
    payload = json.dumps({
        "mimeType": mime_type,
        "languageCodes": ["ru", "en"],
        "content": content_b64,
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {YANDEX_VISION_API_KEY}",
            "x-folder-id": YANDEX_FOLDER_ID,
            "x-data-logging-enabled": "false",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode(errors="replace")
        print(f"[VISION_OCR] HTTPError {e.code}: {err_body}")
        raise RuntimeError(f"Vision API {e.code}: {err_body}") from e
    except Exception as e:
        print(f"[VISION_OCR] {type(e).__name__}: {e}")
        raise
    blocks = data.get("result", {}).get("textAnnotation", {}).get("blocks", [])
    lines = []
    for block in blocks:
        for line in block.get("lines", []):
            text = " ".join(w.get("text", "") for w in line.get("words", []))
            if text.strip():
                lines.append(text.strip())
    return "\n".join(lines)


MAX_TEXT_LEN = 60000


def pdf_page_count(data: bytes) -> int:
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    return len(reader.pages)


def extract_text_from_pdf(data: bytes) -> str:
    """Извлекает текст из PDF с текстовым слоем."""
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    parts = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(parts)[:MAX_TEXT_LEN]


def extract_text_from_docx(data: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)[:MAX_TEXT_LEN]


# Служебные/стоп-слова, которые не несут смысла при сравнении функций
_STOP_WORDS = {
    "и", "в", "во", "на", "по", "с", "со", "к", "о", "об", "от", "для", "при",
    "а", "также", "или", "их", "его", "ее", "том", "числе", "части", "рамках",
    "целях", "том числе", "банка", "подразделения", "деятельности",
}

# Приведение частых глагольных форм к канону (грубая лемматизация «действия»)
_VERB_CANON = [
    (r"осуществлени\w*|осуществля\w*", "осуществление"),
    (r"обеспечени\w*|обеспечива\w*", "обеспечение"),
    (r"разработк\w*|разрабат\w*", "разработка"),
    (r"проведени\w*|провод\w*", "проведение"),
    (r"организаци\w*|организу\w*", "организация"),
    (r"подготовк\w*|подготов\w*", "подготовка"),
    (r"участи\w*|участв\w*", "участие"),
    (r"консультировани\w*|консультир\w*|методическ\w+ помощ\w*", "консультирование"),
    (r"выявлени\w*|выявля\w*", "выявление"),
    (r"контрол\w*", "контроль"),
    (r"мониторинг\w*", "мониторинг"),
    (r"оценк\w*|оценива\w*", "оценка"),
    (r"анализ\w*|анализир\w*", "анализ"),
    (r"взаимодействи\w*", "взаимодействие"),
    (r"формировани\w*|формиру\w*", "формирование"),
    (r"согласовани\w*|согласу\w*", "согласование"),
    (r"рассмотрени\w*|рассматрив\w*", "рассмотрение"),
]


def normalize_function_text(text: str) -> str:
    """Нормализует формулировку функции для exact/normalized-сравнения:
    lower-case, чистка пунктуации, лемматизация частых глаголов, удаление стоп-слов."""
    t = (text or "").lower().replace("ё", "е")
    t = re.sub(r"[^\w\s]", " ", t)
    for pattern, canon in _VERB_CANON:
        t = re.sub(pattern, canon, t)
    words = [w for w in t.split() if w and w not in _STOP_WORDS and len(w) > 2]
    words.sort()
    return " ".join(words)


def find_org_unit_by_code(conn, project_id: int, code: str):
    """Находит id узла оргдерева по коду раздела (4.1.2 / 4.3.3...)."""
    code = (code or "").strip().rstrip(".")
    if not code:
        return None
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id FROM {SCHEMA}.org_units WHERE project_id = %s AND code = %s AND is_archived = false LIMIT 1",
            (project_id, code),
        )
        row = cur.fetchone()
    return row[0] if row else None


def get_or_create_automation(conn, function_id: int, project_id: int) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, current_tools, current_status, planned_tools, ai_potential_score, ai_recommendation, ai_recommendation_generated, implementation_horizon, notes FROM {SCHEMA}.dept_automation WHERE function_id = %s",
            (function_id,),
        )
        row = cur.fetchone()
        if row:
            return {"id": row[0], "current_tools": row[1], "current_status": row[2], "planned_tools": row[3],
                    "ai_potential_score": row[4], "ai_recommendation": row[5],
                    "ai_recommendation_generated": row[6], "implementation_horizon": row[7], "notes": row[8]}
        cur.execute(
            f"INSERT INTO {SCHEMA}.dept_automation (function_id, project_id) VALUES (%s, %s) RETURNING id",
            (function_id, project_id),
        )
        new_id = cur.fetchone()[0]
    return {"id": new_id, "current_tools": "", "current_status": "manual", "planned_tools": "",
            "ai_potential_score": 0, "ai_recommendation": "", "ai_recommendation_generated": False,
            "implementation_horizon": "medium", "notes": ""}


def handler(event: dict, context) -> dict:
    """Управление функциями подразделения: CRUD + AI-распознавание скринов + рекомендации по автоматизации."""
    if event.get("httpMethod") == "OPTIONS":
        return cors({})

    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id", "")
    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    conn = psycopg2.connect(DB)
    try:
        user_id = get_user(conn, session_id)
        if not user_id:
            return cors({"ok": False, "error": "Unauthorized"}, 401)

        project_id = int(qs.get("project_id") or body.get("project_id") or 0)
        if not project_id:
            return cors({"ok": False, "error": "project_id required"}, 400)
        if not check_project_access(conn, project_id, user_id):
            return cors({"ok": False, "error": "Нет доступа"}, 403)

        # ── Список функций ────────────────────────────────────────
        if method == "GET" and action == "functions":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, dept_name, title, description, goals, category, priority, source_image_url, created_at
                        FROM {SCHEMA}.dept_functions
                        WHERE project_id = %s ORDER BY priority, id""",
                    (project_id,),
                )
                rows = cur.fetchall()
            functions = [
                {"id": r[0], "dept_name": r[1], "title": r[2], "description": r[3],
                 "goals": r[4], "category": r[5], "priority": r[6], "source_image_url": r[7],
                 "created_at": r[8]}
                for r in rows
            ]
            return cors({"ok": True, "functions": functions})

        # ── Создать функцию вручную ───────────────────────────────
        if method == "POST" and action == "create_function":
            title = (body.get("title") or "").strip()
            if not title:
                return cors({"ok": False, "error": "title required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.dept_functions
                        (project_id, dept_name, title, description, goals, category, priority, created_by)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (project_id, body.get("dept_name", ""), title,
                     body.get("description", ""), body.get("goals", ""),
                     body.get("category", "operational"),
                     int(body.get("priority", 0)), user_id),
                )
                func_id = cur.fetchone()[0]
            get_or_create_automation(conn, func_id, project_id)
            conn.commit()
            return cors({"ok": True, "id": func_id})

        # ── Обновить функцию ──────────────────────────────────────
        if method == "PUT" and action == "update_function":
            func_id = int(body.get("id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.dept_functions
                        SET dept_name=%s, title=%s, description=%s, goals=%s, category=%s, priority=%s, updated_at=NOW()
                        WHERE id=%s AND project_id=%s""",
                    (body.get("dept_name", ""), body.get("title", ""), body.get("description", ""),
                     body.get("goals", ""), body.get("category", "operational"),
                     int(body.get("priority", 0)), func_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── AI извлечение функций из скрина / документа (PDF, DOCX) ─
        if method == "POST" and action == "extract_functions":
            image_b64 = body.get("image_b64", "")
            image_mime = (body.get("image_mime") or "image/png").lower()
            if image_mime not in ("image/png", "image/jpeg", "image/jpg"):
                image_mime = "image/png"
            if image_mime == "image/jpg":
                image_mime = "image/jpeg"
            file_b64 = body.get("file_b64", "")
            file_type = (body.get("file_type") or "").lower()
            dept_name = (body.get("dept_name") or "").strip()
            if not image_b64 and not file_b64:
                return cors({"ok": False, "error": "image_b64 или file_b64 required"}, 400)

            print(f"[EXTRACT] image_b64={bool(image_b64)} mime={image_mime} file_type={file_type} vision_key_len={len(YANDEX_VISION_API_KEY)} folder={bool(YANDEX_FOLDER_ID)}")
            try:
                if image_b64:
                    ocr_text = yandex_vision_ocr(image_b64, image_mime)
                    print(f"[EXTRACT] ocr_text_len={len(ocr_text)}")
                else:
                    try:
                        file_bytes = base64.b64decode(file_b64, validate=True)
                    except Exception:
                        return cors({"ok": False, "error": "Файл повреждён или имеет неверный формат"}, 400)
                    if file_type == "pdf":
                        ocr_text = extract_text_from_pdf(file_bytes)
                        if not ocr_text.strip():
                            # Похоже на скан без текстового слоя — пробуем распознать через Vision OCR.
                            # Ограничение самого Yandex Vision API: PDF поддерживается только на 1 страницу.
                            pages = pdf_page_count(file_bytes)
                            if pages > 1:
                                return cors({"ok": False, "error": f"Это скан без текстового слоя на {pages} страниц. Распознавание сканов поддерживает только 1 страницу за раз — загрузите документ постранично как отдельные изображения (скрины)."}, 400)
                            ocr_text = yandex_vision_ocr(file_b64, "application/pdf")
                            if not ocr_text.strip():
                                return cors({"ok": False, "error": "Не удалось распознать текст в PDF."}, 400)
                    elif file_type == "docx":
                        ocr_text = extract_text_from_docx(file_bytes)
                        if not ocr_text.strip():
                            return cors({"ok": False, "error": "Не удалось извлечь текст из DOCX."}, 400)
                    else:
                        return cors({"ok": False, "error": "file_type должен быть pdf или docx"}, 400)
            except RuntimeError as e:
                return cors({"ok": False, "error": f"Не удалось распознать файл: {e}"}, 400)
            except Exception:
                return cors({"ok": False, "error": "Файл повреждён, имеет неверный формат или не поддерживается"}, 400)

            system = """Ты эксперт по организационному анализу банковских подразделений.
Ты анализируешь текст, распознанный OCR из положения о подразделении (часто это таблица).
Отвечай ТОЛЬКО валидным JSON-массивом объектов, без пояснений и markdown."""

            prompt = f"""Ниже — текст (распознан OCR, возможны опечатки и разрывы) из положения о подразделении банка.
Обычно это таблица: слева — название управления/отдела/группы (например «4.1. Управление методологии и организации процессов»),
а напротив него в соседней колонке маркированным списком (буллетами «•») перечислены ВЫПОЛНЯЕМЫЕ ИМ ФУНКЦИИ.
Также встречаются колонки «Направление деятельности» и «Область специализации».

ВАЖНО:
- Каждый пункт маркированного списка (каждый буллет/абзац действия — «Разработка…», «Осуществление…», «Проведение…», «Организация…», «Обеспечение…», «Подготовка…», «Участие…», «Консультирование…» и т.п.) — это ОТДЕЛЬНАЯ ФУНКЦИЯ. Извлекай их все.
- Слово «функция» в тексте явно НЕ пишется — определяй функции по смыслу: это описание действия/деятельности подразделения.
- Не пропускай функции из-за того, что текст выглядит как обычный абзац. Сопоставляй и извлекай смысл.
- Если функций много — верни их все, каждую отдельным объектом.

Текст:
{ocr_text}

Верни JSON-массив. Каждый объект:
{{
  "title": "краткое название функции глаголом/отглагольным существительным, до 10 слов",
  "description": "полный текст функции из документа (можно слегка причесать опечатки OCR)",
  "goals": "цель функции, если понятна из контекста, иначе пустая строка",
  "category": "одно из: regulatory (нормативка, ПВК, методология), operational (операционная деятельность), analytical (анализ, аналитика, оценка рисков), communication (консультирование, взаимодействие, ответы на обращения), control (контроль, проверки, мониторинг, выявление), planning (планирование, разработка ТЗ, автоматизация)",
  "source_section_code": "код структурного пункта (например 4.1.2, 4.3.3), из блока которого взята функция; если рядом с функцией стоит номер управления/отдела/группы — укажи его, иначе пустая строка"
}}

Только JSON-массив, без текста до и после."""

            def parse_functions(text: str) -> list:
                t = text.strip()
                if "```" in t:
                    t = t.replace("```json", "```").replace("```JSON", "```")
                    parts = t.split("```")
                    for part in parts:
                        if "[" in part and "]" in part:
                            t = part
                            break
                s = t.find("[")
                e = t.rfind("]") + 1
                if s < 0 or e <= s:
                    return []
                try:
                    data = json.loads(t[s:e])
                    return data if isinstance(data, list) else []
                except json.JSONDecodeError as err:
                    print(f"[EXTRACT] JSON parse error: {err}")
                    return []

            extracted = []
            for attempt in range(2):
                raw = yandex_gpt(prompt, system, max_tokens=8000)
                print(f"[EXTRACT] attempt={attempt} gpt_raw_len={len(raw)} preview={raw[:150]!r}")
                extracted = parse_functions(raw)
                if extracted:
                    break
                print(f"[EXTRACT] attempt={attempt} empty, retrying" if attempt == 0 else "[EXTRACT] final empty")
            print(f"[EXTRACT] extracted_count={len(extracted)}")

            if not extracted:
                return cors({"ok": False, "error": "ИИ не смог выделить функции из текста. Проверьте, что на скрине есть перечень функций подразделения, или добавьте функции вручную.", "ocr_text": ocr_text}, 200)

            # Ничего не сохраняем в БД — только возвращаем черновик для проверки пользователем.
            # Сохранение происходит через action=confirm_functions после подтверждения.
            draft = [
                {"title": f.get("title", ""), "description": f.get("description", ""),
                 "goals": f.get("goals", ""), "category": f.get("category", "operational"),
                 "source_section_code": (f.get("source_section_code") or "").strip()}
                for f in extracted
            ]
            return cors({"ok": True, "functions": draft, "dept_name": dept_name, "ocr_text": ocr_text})

        # ── Подтверждение черновика функций после проверки пользователем ─
        if method == "POST" and action == "confirm_functions":
            items = body.get("functions") or []
            if not isinstance(items, list) or not items:
                return cors({"ok": False, "error": "functions (непустой список) required"}, 400)

            created_ids = []
            auto_linked = 0
            for i, f in enumerate(items):
                title = (f.get("title") or "").strip()
                if not title:
                    continue
                section_code = (f.get("source_section_code") or "").strip()
                normalized = normalize_function_text(title)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.dept_functions
                            (project_id, dept_name, title, description, goals, category, priority, created_by,
                             normalized_title, source_section_code)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                        (project_id, (f.get("dept_name") or "").strip(), title,
                         f.get("description", ""), f.get("goals", ""),
                         f.get("category", "operational"), i, user_id,
                         normalized, section_code),
                    )
                    func_id = cur.fetchone()[0]
                get_or_create_automation(conn, func_id, project_id)
                # Автопредзаполнение в узел дерева по коду раздела источника
                unit_id = find_org_unit_by_code(conn, project_id, section_code)
                if unit_id:
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.function_org_units (function_id, org_unit_id, role, confidence, source_ref)
                                VALUES (%s, %s, 'owner', 0.7, %s)
                                ON CONFLICT (function_id, org_unit_id, role) DO NOTHING""",
                            (func_id, unit_id, f"auto:{section_code}"),
                        )
                    auto_linked += 1
                created_ids.append(func_id)

            conn.commit()

            # Итог дозагрузки (source of truth для post-import баннера)
            unmatched_ids = []
            if created_ids:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT f.id FROM {SCHEMA}.dept_functions f
                            WHERE f.id = ANY(%s)
                              AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)
                            ORDER BY f.id""",
                        (created_ids,),
                    )
                    unmatched_ids = [r[0] for r in cur.fetchall()]
            left_unmatched = len(unmatched_ids)
            # статус покрытия после импорта: partial, если остались тонкие управления или unmatched
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)""",
                    (project_id,),
                )
                total_unassigned = cur.fetchone()[0]
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.org_units u
                        WHERE u.project_id = %s AND u.is_archived = false AND u.type = 'management'
                          AND (SELECT COUNT(*) FROM {SCHEMA}.function_org_units l WHERE l.org_unit_id = u.id) < 3""",
                    (project_id,),
                )
                thin_mgmt = cur.fetchone()[0]
            coverage_status_after = "partial" if (total_unassigned > 0 or thin_mgmt > 0) else "complete"

            return cors({"ok": True, "created": len(created_ids), "ids": created_ids,
                         "auto_linked": auto_linked, "left_unmatched": left_unmatched,
                         "unmatched_function_ids": unmatched_ids,
                         "coverage_status_after": coverage_status_after})

        # ── Список автоматизации ──────────────────────────────────
        if method == "GET" and action == "automation":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT a.id, a.function_id, f.title, f.dept_name, f.category,
                               a.current_tools, a.current_status, a.planned_tools,
                               a.ai_potential_score, a.ai_recommendation, a.ai_recommendation_generated,
                               a.implementation_horizon, a.notes
                        FROM {SCHEMA}.dept_automation a
                        JOIN {SCHEMA}.dept_functions f ON f.id = a.function_id
                        WHERE a.project_id = %s ORDER BY a.ai_potential_score DESC, f.priority""",
                    (project_id,),
                )
                rows = cur.fetchall()
            result = [
                {"id": r[0], "function_id": r[1], "function_title": r[2], "dept_name": r[3],
                 "category": r[4], "current_tools": r[5], "current_status": r[6],
                 "planned_tools": r[7], "ai_potential_score": r[8], "ai_recommendation": r[9],
                 "ai_recommendation_generated": r[10], "implementation_horizon": r[11], "notes": r[12]}
                for r in rows
            ]
            return cors({"ok": True, "automation": result})

        # ── Обновить автоматизацию ────────────────────────────────
        if method == "PUT" and action == "update_automation":
            auto_id = int(body.get("id") or 0)
            if not auto_id:
                return cors({"ok": False, "error": "id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.dept_automation
                        SET current_tools=%s, current_status=%s, planned_tools=%s,
                            implementation_horizon=%s, notes=%s, updated_at=NOW()
                        WHERE id=%s AND project_id=%s""",
                    (body.get("current_tools", ""), body.get("current_status", "manual"),
                     body.get("planned_tools", ""), body.get("implementation_horizon", "medium"),
                     body.get("notes", ""), auto_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── AI рекомендация по автоматизации функции ─────────────
        if method == "POST" and action == "ai_recommend":
            func_id = int(body.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT f.title, f.description, f.goals, f.category,
                               a.id, a.current_tools, a.current_status, a.notes
                        FROM {SCHEMA}.dept_functions f
                        LEFT JOIN {SCHEMA}.dept_automation a ON a.function_id = f.id
                        WHERE f.id = %s AND f.project_id = %s""",
                    (func_id, project_id),
                )
                row = cur.fetchone()
            if not row:
                return cors({"ok": False, "error": "Функция не найдена"}, 404)

            title, desc, goals, category, auto_id, cur_tools, cur_status, notes = row

            system = """Ты эксперт по цифровой трансформации и автоматизации бизнес-процессов в госсекторе и корпоративной среде.
Давай конкретные, реалистичные рекомендации с примерами реальных инструментов."""

            prompt = f"""Оцени потенциал автоматизации и дай рекомендации для следующей функции подразделения:

Функция: {title}
Описание: {desc}
Цели: {goals}
Категория: {category}
Текущие инструменты: {cur_tools or 'не указаны'}
Текущий статус: {cur_status}
Заметки: {notes or 'нет'}

Дай ответ строго в JSON:
{{
  "ai_potential_score": <число от 0 до 10, где 10 = максимальный потенциал автоматизации>,
  "ai_recommendation": "<подробный текст 200-400 слов: что автоматизировать, какими инструментами (RPA, AI, low-code, конкретные системы), ожидаемый эффект, риски, приоритет внедрения>",
  "implementation_horizon": "<short|medium|long>",
  "quick_wins": ["<конкретное действие 1>", "<конкретное действие 2>", "<конкретное действие 3>"]
}}

Только JSON, без пояснений."""

            raw = yandex_gpt(prompt, system, max_tokens=2000)
            start = raw.find("{")
            end = raw.rfind("}") + 1
            rec = json.loads(raw[start:end]) if start >= 0 else {}

            score = int(rec.get("ai_potential_score", 5))
            recommendation = rec.get("ai_recommendation", raw)
            horizon = rec.get("implementation_horizon", "medium")
            quick_wins = rec.get("quick_wins", [])

            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.dept_automation
                        SET ai_potential_score=%s, ai_recommendation=%s,
                            implementation_horizon=%s, ai_recommendation_generated=TRUE, updated_at=NOW()
                        WHERE id=%s""",
                    (score, recommendation, horizon, auto_id),
                )
            conn.commit()

            return cors({
                "ok": True,
                "ai_potential_score": score,
                "ai_recommendation": recommendation,
                "implementation_horizon": horizon,
                "quick_wins": quick_wins,
            })

        # ── Список процессов, связанных с функцией ───────────────
        if method == "GET" and action == "function_processes":
            func_id = int(qs.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s""",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT p.id, p.title, p.description, p.department, p.maturity_level,
                               p.digital_maturity, p.ai_potential,
                               COUNT(s.id) as step_count
                        FROM {SCHEMA}.dept_function_process_links lnk
                        JOIN {SCHEMA}.wb_processes p ON p.id = lnk.process_id
                        LEFT JOIN {SCHEMA}.wb_process_steps s ON s.process_id = p.id AND s.is_archived = FALSE
                        WHERE lnk.function_id = %s AND p.is_archived = FALSE
                        GROUP BY p.id ORDER BY p.created_at DESC""",
                    (func_id,),
                )
                rows = cur.fetchall()
            linked = [
                {"id": r[0], "title": r[1], "description": r[2], "department": r[3],
                 "maturity_level": r[4], "digital_maturity": r[5], "ai_potential": r[6], "step_count": r[7]}
                for r in rows
            ]
            return cors({"ok": True, "processes": linked})

        # ── Привязать существующий процесс к функции ─────────────
        if method == "POST" and action == "link_process":
            func_id = int(body.get("function_id") or 0)
            proc_id = int(body.get("process_id") or 0)
            if not func_id or not proc_id:
                return cors({"ok": False, "error": "function_id и process_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                cur.execute(
                    f"""SELECT 1 FROM {SCHEMA}.wb_processes p
                        JOIN {SCHEMA}.wb_case_process_links lnk ON lnk.process_id = p.id AND lnk.case_id = %s
                        WHERE p.id = %s AND p.is_archived = FALSE""",
                    (project_id, proc_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Процесс не найден в этом проекте"}, 404)
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.dept_function_process_links (function_id, process_id, created_by)
                        VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                    (func_id, proc_id, user_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Отвязать процесс от функции ───────────────────────────
        if method == "DELETE" and action == "unlink_process":
            func_id = int(qs.get("function_id") or body.get("function_id") or 0)
            proc_id = int(qs.get("process_id") or body.get("process_id") or 0)
            if not func_id or not proc_id:
                return cors({"ok": False, "error": "function_id и process_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                cur.execute(
                    f"""DELETE FROM {SCHEMA}.dept_function_process_links
                        WHERE function_id = %s AND process_id = %s""",
                    (func_id, proc_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Создать новый процесс и сразу связать с функцией ─────
        if method == "POST" and action == "create_and_link_process":
            func_id = int(body.get("function_id") or 0)
            title = (body.get("title") or "").strip()
            if not func_id or not title:
                return cors({"ok": False, "error": "function_id и title required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT dept_name FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                dept_name = row[0]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.wb_processes
                        (user_id, title, description, department, maturity_level, digital_maturity, ai_potential)
                        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (user_id, title, body.get("description", ""), dept_name,
                     body.get("maturity_level", "initial"), body.get("digital_maturity", "paper"),
                     body.get("ai_potential", "unknown")),
                )
                proc_id = cur.fetchone()[0]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.wb_case_process_links (case_id, process_id)
                        VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                    (project_id, proc_id),
                )
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.dept_function_process_links (function_id, process_id, created_by)
                        VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                    (func_id, proc_id, user_id),
                )
            conn.commit()
            return cors({"ok": True, "id": proc_id})

        # ── Отчёт «Пересечения функций» (exact/normalized match) ──
        if method == "GET" and action == "overlaps_report":
            with conn.cursor() as cur:
                # Берём функции проекта, у которых есть привязка хотя бы к одному узлу,
                # группируем по нормализованной формулировке.
                cur.execute(
                    f"""SELECT f.id, f.title, f.normalized_title, f.category,
                               a.current_status, a.ai_potential_score
                        FROM {SCHEMA}.dept_functions f
                        LEFT JOIN {SCHEMA}.dept_automation a ON a.function_id = f.id
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND COALESCE(f.normalized_title, '') <> ''""",
                    (project_id,),
                )
                frows = cur.fetchall()
                # id -> инфо
                finfo = {r[0]: {"id": r[0], "title": r[1], "norm": r[2], "category": r[3],
                                "automation_status": r[4] or "manual", "ai": r[5] or 0} for r in frows}
                fids = list(finfo.keys())
                # узлы каждой функции
                units_by_func: dict = {}
                dirs_by_func: dict = {}
                if fids:
                    cur.execute(
                        f"""SELECT l.function_id, l.role, u.id, u.code, u.name
                            FROM {SCHEMA}.function_org_units l
                            JOIN {SCHEMA}.org_units u ON u.id = l.org_unit_id
                            WHERE l.function_id = ANY(%s)""",
                        (fids,),
                    )
                    for r in cur.fetchall():
                        units_by_func.setdefault(r[0], []).append(
                            {"role": r[1], "unit_id": r[2], "code": r[3], "name": r[4]})
                    cur.execute(
                        f"""SELECT function_id, direction_code FROM {SCHEMA}.function_directions
                            WHERE function_id = ANY(%s)""",
                        (fids,),
                    )
                    for r in cur.fetchall():
                        dirs_by_func.setdefault(r[0], set()).add(r[1])

            # группировка по нормализованной формулировке
            groups: dict = {}
            for fid, info in finfo.items():
                groups.setdefault(info["norm"], []).append(fid)

            clusters = []
            matrix: dict = {}
            for norm, group_fids in groups.items():
                # уникальные узлы среди всех функций группы
                unit_ids = set()
                member_units = []
                for fid in group_fids:
                    for u in units_by_func.get(fid, []):
                        unit_ids.add(u["unit_id"])
                        member_units.append(u)
                # пересечение = одна и та же функция в 2+ разных узлах
                if len(unit_ids) < 2:
                    continue
                statuses = [finfo[fid]["automation_status"] for fid in group_fids]
                ais = [finfo[fid]["ai"] for fid in group_fids if finfo[fid]["ai"] > 0]
                all_dirs = set()
                for fid in group_fids:
                    all_dirs |= dirs_by_func.get(fid, set())
                # дедуп узлов для карточки
                seen = {}
                for u in member_units:
                    seen[u["unit_id"]] = u
                units_list = list(seen.values())
                clusters.append({
                    "canonical_name": finfo[group_fids[0]]["title"],
                    "normalized_key": norm,
                    "function_ids": group_fids,
                    "repeat_count": len(group_fids),
                    "unit_count": len(unit_ids),
                    "units": units_list,
                    "directions": sorted(all_dirs),
                    "manual_count": sum(1 for s in statuses if s == "manual"),
                    "avg_ai_potential": round(sum(ais) / len(ais)) if ais else 0,
                })
                # матрица узел×узел
                ulist = sorted(unit_ids)
                for a in range(len(ulist)):
                    for b in range(a + 1, len(ulist)):
                        key = f"{ulist[a]}_{ulist[b]}"
                        matrix[key] = matrix.get(key, 0) + 1

            clusters.sort(key=lambda c: (c["unit_count"], c["repeat_count"]), reverse=True)
            # имена узлов для матрицы
            unit_names = {}
            for c in clusters:
                for u in c["units"]:
                    unit_names[u["unit_id"]] = {"code": u["code"], "name": u["name"]}
            matrix_list = [
                {"unit_a": int(k.split("_")[0]), "unit_b": int(k.split("_")[1]), "count": v,
                 "a": unit_names.get(int(k.split("_")[0])), "b": unit_names.get(int(k.split("_")[1]))}
                for k, v in matrix.items()
            ]
            matrix_list.sort(key=lambda m: m["count"], reverse=True)
            return cors({"ok": True, "clusters": clusters, "matrix": matrix_list,
                         "total_overlaps": len(clusters)})

        # ── Создать дочерний узел оргструктуры ────────────────────
        if method == "POST" and action == "create_org_unit":
            code = (body.get("code") or "").strip().rstrip(".")
            name = (body.get("name") or "").strip()
            utype = (body.get("type") or "division").strip()
            parent_id = body.get("parent_id")
            if not code or not name:
                return cors({"ok": False, "error": "code и name обязательны"}, 400)
            if utype not in ("department", "management", "division", "group", "center"):
                return cors({"ok": False, "error": "недопустимый тип узла"}, 400)
            with conn.cursor() as cur:
                # code уникален в проекте
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.org_units WHERE project_id = %s AND code = %s",
                    (project_id, code),
                )
                if cur.fetchone():
                    return cors({"ok": False, "error": f"Код {code} уже существует"}, 400)
                parent_path = ""
                parent_level = -1
                if parent_id:
                    cur.execute(
                        f"SELECT path, level FROM {SCHEMA}.org_units WHERE id = %s AND project_id = %s AND is_archived = false",
                        (int(parent_id), project_id),
                    )
                    prow = cur.fetchone()
                    if not prow:
                        return cors({"ok": False, "error": "Родительский узел не найден"}, 400)
                    parent_path, parent_level = prow[0], prow[1]
                elif utype != "department":
                    return cors({"ok": False, "error": "parent_id обязателен для не-корневого узла"}, 400)
                # path и level считает бэкенд
                new_path = (parent_path + " / " + name) if parent_path else name
                new_level = parent_level + 1
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.org_units
                        (project_id, code, name, type, parent_id, path, level, sort_order, source_ref)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'manual_editor') RETURNING id""",
                    (project_id, code, name, utype, parent_id or None, new_path, new_level, 999),
                )
                new_id = cur.fetchone()[0]
            conn.commit()
            return cors({"ok": True, "id": new_id})

        # ── Переименовать узел (пересчёт path у узла и потомков) ────
        if method == "PUT" and action == "rename_org_unit":
            unit_id = int(body.get("org_unit_id") or 0)
            name = (body.get("name") or "").strip()
            if not unit_id or not name:
                return cors({"ok": False, "error": "org_unit_id и name обязательны"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT path FROM {SCHEMA}.org_units WHERE id = %s AND project_id = %s",
                    (unit_id, project_id),
                )
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "Узел не найден"}, 404)
                old_path = row[0]
                # новый path текущего узла
                if " / " in old_path:
                    new_path = old_path.rsplit(" / ", 1)[0] + " / " + name
                else:
                    new_path = name
                cur.execute(
                    f"UPDATE {SCHEMA}.org_units SET name = %s, path = %s, updated_at = now() WHERE id = %s",
                    (name, new_path, unit_id),
                )
                # пересчёт path у всех потомков (заменяем префикс)
                cur.execute(
                    f"""UPDATE {SCHEMA}.org_units
                        SET path = %s || substring(path from %s), updated_at = now()
                        WHERE project_id = %s AND path LIKE %s AND id <> %s""",
                    (new_path, len(old_path) + 1, project_id, old_path + " / %", unit_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Архивировать узел (soft) с защитой ────────────────────
        if method == "DELETE" and action == "archive_org_unit":
            unit_id = int(qs.get("org_unit_id") or body.get("org_unit_id") or 0)
            if not unit_id:
                return cors({"ok": False, "error": "org_unit_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.org_units WHERE parent_id = %s AND is_archived = false",
                    (unit_id,),
                )
                if cur.fetchone():
                    return cors({"ok": False, "error": "Нельзя архивировать узел с активными дочерними узлами"}, 400)
                cur.execute(
                    f"SELECT COUNT(*) FROM {SCHEMA}.function_org_units WHERE org_unit_id = %s",
                    (unit_id,),
                )
                if cur.fetchone()[0] > 0:
                    return cors({"ok": False, "error": "К узлу привязаны функции — сначала перепривяжите их"}, 400)
                cur.execute(
                    f"UPDATE {SCHEMA}.org_units SET is_archived = true, updated_at = now() WHERE id = %s AND project_id = %s",
                    (unit_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Оргдерево: список узлов с числом функций ──────────────
        if method == "GET" and action == "org_tree":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT u.id, u.code, u.name, u.type, u.parent_id, u.path, u.level, u.sort_order,
                               COALESCE(o.own_cnt, 0) AS own_cnt
                        FROM {SCHEMA}.org_units u
                        LEFT JOIN (
                            SELECT org_unit_id, COUNT(*) AS own_cnt
                            FROM {SCHEMA}.function_org_units GROUP BY org_unit_id
                        ) o ON o.org_unit_id = u.id
                        WHERE u.project_id = %s AND u.is_archived = false
                        ORDER BY u.sort_order, u.code""",
                    (project_id,),
                )
                nodes = [{"id": r[0], "code": r[1], "name": r[2], "type": r[3], "parent_id": r[4],
                          "path": r[5], "level": r[6], "sort_order": r[7], "own_count": r[8]}
                         for r in cur.fetchall()]
                # непривязанные функции проекта (без единой связи с оргединицей)
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)""",
                    (project_id,),
                )
                unassigned = cur.fetchone()[0]
                # Признак неполноты источника: управления (level=1, management) с малым числом
                # собственных функций + наличие функций с пустым source_section_code.
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND COALESCE(f.source_section_code, '') = ''""",
                    (project_id,),
                )
                missing_code_cnt = cur.fetchone()[0]

            # Управления с подозрительно малым покрытием (< 3 функций на узле)
            THIN_THRESHOLD = 3
            thin_mgmt = [
                {"code": n["code"], "name": n["name"], "own_count": n["own_count"]}
                for n in nodes
                if n["type"] == "management" and n["own_count"] < THIN_THRESHOLD
            ]
            coverage = {
                "status": "partial" if (thin_mgmt or unassigned > 0 or missing_code_cnt > 0) else "complete",
                "thin_managements": thin_mgmt,
                "missing_section_code_count": missing_code_cnt,
                "show_upload_reminder": bool(thin_mgmt or unassigned > 0 or missing_code_cnt > 0),
            }
            return cors({"ok": True, "nodes": nodes, "unassigned": unassigned, "coverage": coverage})

        # ── Функции узла (с ролями, направлениями, автоматизацией) ─
        if method == "GET" and action == "org_functions":
            org_unit_id = int(qs.get("org_unit_id") or 0)
            include_children = (qs.get("include_children") or "false").lower() == "true"
            if not org_unit_id:
                return cors({"ok": False, "error": "org_unit_id required"}, 400)
            with conn.cursor() as cur:
                if include_children:
                    cur.execute(
                        f"""WITH RECURSIVE sub AS (
                                SELECT id FROM {SCHEMA}.org_units WHERE id = %s
                                UNION ALL
                                SELECT c.id FROM {SCHEMA}.org_units c JOIN sub ON c.parent_id = sub.id
                            ) SELECT id FROM sub""",
                        (org_unit_id,),
                    )
                    unit_ids = [r[0] for r in cur.fetchall()]
                else:
                    unit_ids = [org_unit_id]
                cur.execute(
                    f"""SELECT DISTINCT f.id, f.title, f.description, f.category, f.priority,
                               l.role, l.org_unit_id, u.code AS unit_code,
                               a.current_status, a.ai_potential_score
                        FROM {SCHEMA}.function_org_units l
                        JOIN {SCHEMA}.dept_functions f ON f.id = l.function_id
                        JOIN {SCHEMA}.org_units u ON u.id = l.org_unit_id
                        LEFT JOIN {SCHEMA}.dept_automation a ON a.function_id = f.id
                        WHERE l.org_unit_id = ANY(%s)
                        ORDER BY f.priority DESC, f.title""",
                    (unit_ids,),
                )
                rows = cur.fetchall()
                fids = list({r[0] for r in rows})
                dirs_map: dict = {}
                if fids:
                    cur.execute(
                        f"""SELECT function_id, direction_code, direction_name
                            FROM {SCHEMA}.function_directions WHERE function_id = ANY(%s)
                            ORDER BY direction_code""",
                        (fids,),
                    )
                    for fr in cur.fetchall():
                        dirs_map.setdefault(fr[0], []).append({"code": fr[1], "name": fr[2]})
            funcs = [{"id": r[0], "title": r[1], "description": r[2], "category": r[3],
                      "priority": r[4], "role": r[5], "org_unit_id": r[6], "unit_code": r[7],
                      "automation_status": r[8] or "manual", "ai_potential_score": r[9] or 0,
                      "directions": dirs_map.get(r[0], [])}
                     for r in rows]
            return cors({"ok": True, "functions": funcs})

        # ── Непривязанные функции проекта ─────────────────────────
        if method == "GET" and action == "unassigned_functions":
            # Опциональный фильтр по конкретным id (свежие unmatched последней дозагрузки)
            ids_param = (qs.get("ids") or "").strip()
            with conn.cursor() as cur:
                base_sql = f"""SELECT f.id, f.title, f.dept_name, f.category, COALESCE(f.source_section_code, '')
                        FROM {SCHEMA}.dept_functions f
                        WHERE f.project_id = %s
                          AND f.dept_name NOT LIKE '[SMOKETEST%%'
                          AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.function_org_units l WHERE l.function_id = f.id)"""
                params = [project_id]
                if ids_param:
                    try:
                        id_list = [int(x) for x in ids_param.split(",") if x.strip()]
                    except ValueError:
                        id_list = []
                    if id_list:
                        base_sql += " AND f.id = ANY(%s)"
                        params.append(id_list)
                base_sql += " ORDER BY f.title"
                cur.execute(base_sql, tuple(params))
                rows = cur.fetchall()
                # Детерминированный preselect: ровно один активный узел с таким кодом
                codes = list({r[4] for r in rows if r[4]})
                code_to_units: dict = {}
                if codes:
                    cur.execute(
                        f"""SELECT code, id, name FROM {SCHEMA}.org_units
                            WHERE project_id = %s AND is_archived = false AND code = ANY(%s)""",
                        (project_id, codes),
                    )
                    for cr in cur.fetchall():
                        code_to_units.setdefault(cr[0], []).append({"id": cr[1], "name": cr[2]})
                funcs = []
                for r in rows:
                    section = r[4]
                    preselect = None
                    cands = code_to_units.get(section, [])
                    if section and len(cands) == 1:
                        preselect = {"org_unit_id": cands[0]["id"], "code": section, "name": cands[0]["name"]}
                    funcs.append({"id": r[0], "title": r[1], "dept_name": r[2], "category": r[3],
                                  "source_section_code": section, "preselect_unit": preselect})
            return cors({"ok": True, "functions": funcs})

        # ── Операционный профиль функции: чтение ──────────────────
        if method == "GET" and action == "operating_profile":
            func_id = int(qs.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT frequency_band, volume_band, manual_share_band, rule_based_share_band,
                               expert_judgment_share_band, exception_rate_band, sla_criticality, audit_required,
                               input_types, output_types, participants_band, systems_involved,
                               sensitive_data_level, ai_policy, deployment_constraint, pain_points,
                               source_kind, source_note, updated_at
                        FROM {SCHEMA}.function_operating_profiles WHERE function_id = %s""",
                    (func_id,),
                )
                row = cur.fetchone()
            if not row:
                return cors({"ok": True, "profile": None})
            profile = {
                "frequency_band": row[0], "volume_band": row[1], "manual_share_band": row[2],
                "rule_based_share_band": row[3], "expert_judgment_share_band": row[4],
                "exception_rate_band": row[5], "sla_criticality": row[6], "audit_required": row[7],
                "input_types": row[8] or [], "output_types": row[9] or [], "participants_band": row[10],
                "systems_involved": row[11], "sensitive_data_level": row[12], "ai_policy": row[13],
                "deployment_constraint": row[14], "pain_points": row[15] or [], "source_kind": row[16],
                "source_note": row[17], "updated_at": row[18],
            }
            return cors({"ok": True, "profile": profile})

        # ── Операционный профиль функции: сохранение (upsert) ─────
        if method == "POST" and action == "save_operating_profile":
            func_id = int(body.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            p = body.get("profile") or {}
            scalar_fields = ["frequency_band", "volume_band", "manual_share_band", "rule_based_share_band",
                             "expert_judgment_share_band", "exception_rate_band", "sla_criticality",
                             "participants_band", "systems_involved", "sensitive_data_level", "ai_policy",
                             "deployment_constraint", "source_kind", "source_note"]
            vals = {f: (p.get(f) if p.get(f) not in ("", None) else None) for f in scalar_fields}
            audit_required = p.get("audit_required")
            input_types = p.get("input_types") or []
            output_types = p.get("output_types") or []
            pain_points = p.get("pain_points") or []
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.function_operating_profiles
                        (function_id, project_id, frequency_band, volume_band, manual_share_band,
                         rule_based_share_band, expert_judgment_share_band, exception_rate_band,
                         sla_criticality, audit_required, input_types, output_types, participants_band,
                         systems_involved, sensitive_data_level, ai_policy, deployment_constraint,
                         pain_points, source_kind, source_note, updated_by, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (function_id) DO UPDATE SET
                          frequency_band = EXCLUDED.frequency_band, volume_band = EXCLUDED.volume_band,
                          manual_share_band = EXCLUDED.manual_share_band, rule_based_share_band = EXCLUDED.rule_based_share_band,
                          expert_judgment_share_band = EXCLUDED.expert_judgment_share_band, exception_rate_band = EXCLUDED.exception_rate_band,
                          sla_criticality = EXCLUDED.sla_criticality, audit_required = EXCLUDED.audit_required,
                          input_types = EXCLUDED.input_types, output_types = EXCLUDED.output_types,
                          participants_band = EXCLUDED.participants_band, systems_involved = EXCLUDED.systems_involved,
                          sensitive_data_level = EXCLUDED.sensitive_data_level, ai_policy = EXCLUDED.ai_policy,
                          deployment_constraint = EXCLUDED.deployment_constraint, pain_points = EXCLUDED.pain_points,
                          source_kind = EXCLUDED.source_kind, source_note = EXCLUDED.source_note,
                          updated_by = EXCLUDED.updated_by, updated_at = now()""",
                    (func_id, project_id, vals["frequency_band"], vals["volume_band"], vals["manual_share_band"],
                     vals["rule_based_share_band"], vals["expert_judgment_share_band"], vals["exception_rate_band"],
                     vals["sla_criticality"], audit_required, input_types, output_types, vals["participants_band"],
                     vals["systems_involved"], vals["sensitive_data_level"], vals["ai_policy"],
                     vals["deployment_constraint"], pain_points, vals["source_kind"], vals["source_note"], user_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Статусы заполненности профилей по проекту ─────────────
        if method == "GET" and action == "operating_profiles_status":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT function_id,
                               (frequency_band IS NOT NULL)::int + (volume_band IS NOT NULL)::int
                             + (manual_share_band IS NOT NULL)::int + (sla_criticality IS NOT NULL)::int
                             + (COALESCE(array_length(input_types,1),0) > 0)::int
                             + (ai_policy IS NOT NULL)::int AS filled_key
                        FROM {SCHEMA}.function_operating_profiles WHERE project_id = %s""",
                    (project_id,),
                )
                status = {}
                for r in cur.fetchall():
                    filled = r[1]
                    status[r[0]] = "full" if filled >= 6 else ("partial" if filled > 0 else "empty")
            return cors({"ok": True, "statuses": status})

        # ── Процессные карточки функции: список ───────────────────
        if method == "GET" and action == "process_cards":
            func_id = int(qs.get("function_id") or 0)
            include_archived = (qs.get("include_archived") or "false").lower() == "true"
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, name, summary, sort_order, trigger_type, trigger_note,
                               input_types, input_note, output_types, output_note,
                               systems_used, participants, sla_criticality, sla_note,
                               pain_points, automation_notes, is_archived, updated_at
                        FROM {SCHEMA}.function_process_cards
                        WHERE function_id = %s {'' if include_archived else 'AND is_archived = false'}
                        ORDER BY is_archived, sort_order, created_at""",
                    (func_id,),
                )
                cards = [{
                    "id": r[0], "name": r[1], "summary": r[2], "sort_order": r[3],
                    "trigger_type": r[4], "trigger_note": r[5],
                    "input_types": r[6] or [], "input_note": r[7],
                    "output_types": r[8] or [], "output_note": r[9],
                    "systems_used": r[10] or [], "participants": r[11] or [],
                    "sla_criticality": r[12], "sla_note": r[13],
                    "pain_points": r[14] or [], "automation_notes": r[15],
                    "is_archived": r[16], "updated_at": r[17],
                } for r in cur.fetchall()]
            return cors({"ok": True, "cards": cards})

        # ── Процессные карточки: счётчики по функциям (индикатор) ──
        if method == "GET" and action == "process_cards_counts":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT function_id, COUNT(*) FROM {SCHEMA}.function_process_cards
                        WHERE project_id = %s AND is_archived = false GROUP BY function_id""",
                    (project_id,),
                )
                counts = {r[0]: r[1] for r in cur.fetchall()}
            return cors({"ok": True, "counts": counts})

        # ── Процессная карточка: создать / обновить ───────────────
        if method == "POST" and action in ("create_process_card", "update_process_card"):
            p = body.get("card") or {}
            name = (p.get("name") or "").strip()
            if not name:
                return cors({"ok": False, "error": "Название обязательно"}, 400)
            fields = dict(
                summary=(p.get("summary") or "").strip() or None,
                trigger_type=_clean_scalar(p.get("trigger_type"), PC_TRIGGER),
                trigger_note=(p.get("trigger_note") or "").strip() or None,
                input_types=_clean_arr(p.get("input_types"), PC_INPUT),
                input_note=(p.get("input_note") or "").strip() or None,
                output_types=_clean_arr(p.get("output_types"), PC_OUTPUT),
                output_note=(p.get("output_note") or "").strip() or None,
                systems_used=_clean_free_arr(p.get("systems_used")),
                participants=_clean_free_arr(p.get("participants")),
                sla_criticality=_clean_scalar(p.get("sla_criticality"), PC_SLA),
                sla_note=(p.get("sla_note") or "").strip() or None,
                pain_points=_clean_arr(p.get("pain_points"), PC_PAIN),
                automation_notes=(p.get("automation_notes") or "").strip() or None,
            )
            if action == "create_process_card":
                func_id = int(body.get("function_id") or 0)
                if not func_id:
                    return cors({"ok": False, "error": "function_id required"}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"SELECT COALESCE(MAX(sort_order), 0) + 1 FROM {SCHEMA}.function_process_cards WHERE function_id = %s",
                        (func_id,),
                    )
                    next_order = cur.fetchone()[0]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.function_process_cards
                            (function_id, project_id, name, summary, sort_order, trigger_type, trigger_note,
                             input_types, input_note, output_types, output_note, systems_used, participants,
                             sla_criticality, sla_note, pain_points, automation_notes, updated_by)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (func_id, project_id, name, fields["summary"], next_order, fields["trigger_type"],
                         fields["trigger_note"], fields["input_types"], fields["input_note"], fields["output_types"],
                         fields["output_note"], fields["systems_used"], fields["participants"], fields["sla_criticality"],
                         fields["sla_note"], fields["pain_points"], fields["automation_notes"], user_id),
                    )
                    new_id = cur.fetchone()[0]
                conn.commit()
                return cors({"ok": True, "id": new_id})
            else:
                card_id = int(p.get("id") or body.get("card_id") or 0)
                if not card_id:
                    return cors({"ok": False, "error": "card id required"}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.function_process_cards SET
                              name=%s, summary=%s, trigger_type=%s, trigger_note=%s,
                              input_types=%s, input_note=%s, output_types=%s, output_note=%s,
                              systems_used=%s, participants=%s, sla_criticality=%s, sla_note=%s,
                              pain_points=%s, automation_notes=%s, updated_by=%s, updated_at=now()
                            WHERE id=%s AND project_id=%s""",
                        (name, fields["summary"], fields["trigger_type"], fields["trigger_note"],
                         fields["input_types"], fields["input_note"], fields["output_types"], fields["output_note"],
                         fields["systems_used"], fields["participants"], fields["sla_criticality"], fields["sla_note"],
                         fields["pain_points"], fields["automation_notes"], user_id, card_id, project_id),
                    )
                conn.commit()
                return cors({"ok": True})

        # ── Процессная карточка: архив / восстановление ───────────
        if method == "POST" and action in ("archive_process_card", "restore_process_card"):
            card_id = int(body.get("card_id") or 0)
            if not card_id:
                return cors({"ok": False, "error": "card_id required"}, 400)
            archived = action == "archive_process_card"
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.function_process_cards SET is_archived=%s, updated_at=now() WHERE id=%s AND project_id=%s",
                    (archived, card_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Практики улучшения функции: список привязок ───────────
        if method == "GET" and action == "function_practices":
            func_id = int(qs.get("function_id") or 0)
            include_archived = (qs.get("include_archived") or "false").lower() == "true"
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.id, m.relevance_level, m.reason_tags, m.rationale_note, m.source_kind, m.is_archived,
                               p.id, p.slug, p.name, p.category, p.summary, p.is_digital, p.status,
                               (SELECT COUNT(*) FROM {SCHEMA}.solution_practice_capability_map x WHERE x.practice_id = p.id)
                        FROM {SCHEMA}.function_practice_mappings m
                        JOIN {SCHEMA}.solution_practices p ON p.id = m.practice_id
                        WHERE m.function_id = %s {'' if include_archived else 'AND m.is_archived = false'}
                        ORDER BY m.is_archived,
                                 CASE m.relevance_level WHEN 'primary' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END,
                                 p.name""",
                    (func_id,),
                )
                items = [{
                    "id": r[0], "relevance_level": r[1], "reason_tags": r[2] or [], "rationale_note": r[3],
                    "source_kind": r[4], "is_archived": r[5],
                    "practice_id": r[6], "practice_slug": r[7], "practice_name": r[8], "practice_category": r[9],
                    "practice_summary": r[10], "practice_is_digital": r[11], "practice_status": r[12],
                    "capability_count": r[13],
                } for r in cur.fetchall()]
            return cors({"ok": True, "items": items})

        # ── Счётчики привязанных практик по функциям (badge) ──────
        if method == "GET" and action == "function_practices_counts":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.function_id, COUNT(*) FROM {SCHEMA}.function_practice_mappings m
                        JOIN {SCHEMA}.dept_functions f ON f.id = m.function_id
                        WHERE f.project_id = %s AND m.is_archived = false GROUP BY m.function_id""",
                    (project_id,),
                )
                counts = {r[0]: r[1] for r in cur.fetchall()}
            return cors({"ok": True, "counts": counts})

        # ── Привязать / обновить практику функции ─────────────────
        if method == "POST" and action in ("add_function_practice", "update_function_practice"):
            p = body.get("mapping") or {}
            relevance = p.get("relevance_level") or "supporting"
            if relevance not in FPM_RELEVANCE:
                return cors({"ok": False, "error": "Недопустимый уровень релевантности"}, 400)
            source_kind = p.get("source_kind") or "manual"
            if source_kind not in FPM_SOURCE:
                return cors({"ok": False, "error": "Недопустимый источник"}, 400)
            reason_tags = [t for t in (p.get("reason_tags") or []) if t in FPM_REASON]
            rationale = (p.get("rationale_note") or "").strip() or None
            # Explainability: нельзя сохранить пустое обоснование
            if not reason_tags and not rationale:
                return cors({"ok": False, "error": "Укажите причину: теги или текстовое обоснование"}, 400)

            if action == "add_function_practice":
                func_id = int(body.get("function_id") or 0)
                practice_id = int(p.get("practice_id") or 0)
                if not func_id or not practice_id:
                    return cors({"ok": False, "error": "function_id и practice_id обязательны"}, 400)
                with conn.cursor() as cur:
                    # практика должна существовать и быть активной
                    cur.execute(f"SELECT status FROM {SCHEMA}.solution_practices WHERE id = %s", (practice_id,))
                    prow = cur.fetchone()
                    if not prow:
                        return cors({"ok": False, "error": "Практика не найдена"}, 404)
                    if prow[0] != "active":
                        return cors({"ok": False, "error": "Нельзя привязать архивную/черновую практику"}, 400)
                    # уже есть активная связь?
                    cur.execute(
                        f"""SELECT id FROM {SCHEMA}.function_practice_mappings
                            WHERE function_id = %s AND practice_id = %s AND is_archived = false""",
                        (func_id, practice_id),
                    )
                    if cur.fetchone():
                        return cors({"ok": False, "error": "Практика уже привязана к функции"}, 409)
                    # есть архивная связь? — restore + update вместо дубля
                    cur.execute(
                        f"""SELECT id FROM {SCHEMA}.function_practice_mappings
                            WHERE function_id = %s AND practice_id = %s AND is_archived = true
                            ORDER BY updated_at DESC LIMIT 1""",
                        (func_id, practice_id),
                    )
                    arch = cur.fetchone()
                    if arch:
                        cur.execute(
                            f"""UPDATE {SCHEMA}.function_practice_mappings SET
                                  is_archived = false, relevance_level = %s, reason_tags = %s,
                                  rationale_note = %s, source_kind = %s, updated_by = %s, updated_at = now()
                                WHERE id = %s RETURNING id""",
                            (relevance, reason_tags, rationale, source_kind, user_id, arch[0]),
                        )
                        new_id = cur.fetchone()[0]
                    else:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.function_practice_mappings
                                (function_id, practice_id, relevance_level, reason_tags, rationale_note, source_kind, updated_by)
                                VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                            (func_id, practice_id, relevance, reason_tags, rationale, source_kind, user_id),
                        )
                        new_id = cur.fetchone()[0]
                conn.commit()
                return cors({"ok": True, "id": new_id})
            else:
                mapping_id = int(p.get("id") or body.get("mapping_id") or 0)
                if not mapping_id:
                    return cors({"ok": False, "error": "mapping id required"}, 400)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.function_practice_mappings m SET
                              relevance_level = %s, reason_tags = %s, rationale_note = %s,
                              source_kind = %s, updated_by = %s, updated_at = now()
                            FROM {SCHEMA}.dept_functions f
                            WHERE m.id = %s AND m.function_id = f.id AND f.project_id = %s""",
                        (relevance, reason_tags, rationale, source_kind, user_id, mapping_id, project_id),
                    )
                conn.commit()
                return cors({"ok": True})

        # ── Практика функции: архив / восстановление ──────────────
        if method == "POST" and action in ("archive_function_practice", "restore_function_practice"):
            mapping_id = int(body.get("mapping_id") or 0)
            if not mapping_id:
                return cors({"ok": False, "error": "mapping_id required"}, 400)
            archived = action == "archive_function_practice"
            with conn.cursor() as cur:
                if not archived:
                    # при восстановлении проверяем, что нет активного дубля и практика активна
                    cur.execute(
                        f"""SELECT m.function_id, m.practice_id, p.status
                            FROM {SCHEMA}.function_practice_mappings m
                            JOIN {SCHEMA}.solution_practices p ON p.id = m.practice_id
                            JOIN {SCHEMA}.dept_functions f ON f.id = m.function_id
                            WHERE m.id = %s AND f.project_id = %s""",
                        (mapping_id, project_id),
                    )
                    row = cur.fetchone()
                    if not row:
                        return cors({"ok": False, "error": "Связь не найдена"}, 404)
                    if row[2] != "active":
                        return cors({"ok": False, "error": "Практика больше не активна — восстановление запрещено"}, 400)
                    cur.execute(
                        f"""SELECT 1 FROM {SCHEMA}.function_practice_mappings
                            WHERE function_id = %s AND practice_id = %s AND is_archived = false AND id <> %s""",
                        (row[0], row[1], mapping_id),
                    )
                    if cur.fetchone():
                        return cors({"ok": False, "error": "Активная связь с этой практикой уже существует"}, 409)
                cur.execute(
                    f"""UPDATE {SCHEMA}.function_practice_mappings m SET is_archived = %s, updated_at = now()
                        FROM {SCHEMA}.dept_functions f
                        WHERE m.id = %s AND m.function_id = f.id AND f.project_id = %s""",
                    (archived, mapping_id, project_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Derived capability view функции (без persisted-модели) ─
        if method == "GET" and action == "function_capabilities":
            func_id = int(qs.get("function_id") or 0)
            include_archived_caps = (qs.get("include_archived_capabilities") or "false").lower() == "true"
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                # Раскрываем активные practice-привязки функции через practice↔capability map
                cur.execute(
                    f"""SELECT c.id, c.slug, c.name, c.category, c.description, c.status,
                               pcm.relation_type,
                               m.relevance_level, m.reason_tags, m.rationale_note,
                               p.id, p.name, p.slug, p.category
                        FROM {SCHEMA}.function_practice_mappings m
                        JOIN {SCHEMA}.solution_practices p ON p.id = m.practice_id
                        JOIN {SCHEMA}.solution_practice_capability_map pcm ON pcm.practice_id = p.id
                        JOIN {SCHEMA}.solution_capabilities c ON c.id = pcm.capability_id
                        WHERE m.function_id = %s AND m.is_archived = false""",
                    (func_id,),
                )
                rows = cur.fetchall()

            agg: dict = {}
            for r in rows:
                (cap_id, cap_slug, cap_name, cap_cat, cap_desc, cap_status,
                 relation_type, relevance, reason_tags, rationale,
                 p_id, p_name, p_slug, p_cat) = r
                if cap_id not in agg:
                    agg[cap_id] = {
                        "capability_id": cap_id, "slug": cap_slug, "name": cap_name,
                        "category": cap_cat, "description": cap_desc, "status": cap_status,
                        "_need_rank": 0, "_priority_rank": 0, "source_practices": [],
                    }
                a = agg[cap_id]
                a["_need_rank"] = max(a["_need_rank"], NEED_RANK.get(relation_type, 0))
                a["_priority_rank"] = max(a["_priority_rank"], PRIORITY_RANK.get(relevance, 0))
                a["source_practices"].append({
                    "practice_id": p_id, "practice_name": p_name, "practice_slug": p_slug,
                    "practice_category": p_cat, "practice_relevance": relevance,
                    "relation_type": relation_type, "reason_tags": reason_tags or [],
                    "rationale_note": rationale,
                })

            items = []
            summary = {"required_count": 0, "supporting_count": 0, "optional_count": 0,
                       "active_count": 0, "archived_count": 0}
            for a in agg.values():
                if a["status"] != "active" and not include_archived_caps:
                    # архивную capability не теряем в счётчиках, но не выводим в список
                    summary["archived_count"] += 1
                    continue
                need = NEED_BY_RANK.get(a["_need_rank"], "optional")
                priority = PRIORITY_BY_RANK.get(a["_priority_rank"], "explore")
                a["need_level"] = need
                a["priority_level"] = priority
                a["source_practices_count"] = len(a["source_practices"])
                a.pop("_need_rank"); a.pop("_priority_rank")
                items.append(a)
                summary[f"{need}_count"] += 1
                if a["status"] == "active":
                    summary["active_count"] += 1
                else:
                    summary["archived_count"] += 1

            items.sort(key=lambda x: (
                -NEED_RANK.get(x["need_level"], 0),
                -PRIORITY_RANK.get(x["priority_level"], 0),
                -x["source_practices_count"],
                x["name"],
            ))
            return cors({"ok": True, "items": items, "summary": summary})

        # ── Счётчики derived capability по функциям проекта (badge) ─
        if method == "GET" and action == "function_capabilities_counts":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.function_id,
                               COUNT(DISTINCT pcm.capability_id) FILTER (WHERE c.status = 'active'),
                               COUNT(DISTINCT pcm.capability_id) FILTER (WHERE c.status = 'active' AND pcm.relation_type = 'required')
                        FROM {SCHEMA}.function_practice_mappings m
                        JOIN {SCHEMA}.dept_functions f ON f.id = m.function_id
                        JOIN {SCHEMA}.solution_practice_capability_map pcm ON pcm.practice_id = m.practice_id
                        JOIN {SCHEMA}.solution_capabilities c ON c.id = pcm.capability_id
                        WHERE f.project_id = %s AND m.is_archived = false
                        GROUP BY m.function_id""",
                    (project_id,),
                )
                counts = {r[0]: {"active": r[1], "required": r[2]} for r in cur.fetchall()}
            return cors({"ok": True, "counts": counts})

        # ── Derived: кандидатные модули под capability функции ────
        if method == "GET" and action in ("function_module_candidates", "function_module_candidates_counts"):
            func_id = int(qs.get("function_id") or 0)
            counts_only = action == "function_module_candidates_counts"
            include_arch_caps = (qs.get("include_archived_capabilities") or "false").lower() == "true"
            include_arch_modules = (qs.get("include_archived_modules") or "false").lower() == "true"
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)

            with conn.cursor() as cur:
                # 1) demand-side: capability функции из активных практик (+ explainability)
                cur.execute(
                    f"""SELECT c.id, c.slug, c.name, c.category, c.description, c.status,
                               pcm.relation_type,
                               m.relevance_level, m.reason_tags, m.rationale_note,
                               p.id, p.name, p.slug
                        FROM {SCHEMA}.function_practice_mappings m
                        JOIN {SCHEMA}.solution_practices p ON p.id = m.practice_id
                        JOIN {SCHEMA}.solution_practice_capability_map pcm ON pcm.practice_id = p.id
                        JOIN {SCHEMA}.solution_capabilities c ON c.id = pcm.capability_id
                        WHERE m.function_id = %s AND m.is_archived = false""",
                    (func_id,),
                )
                demand = cur.fetchall()

                caps: dict = {}
                for r in demand:
                    (cap_id, cap_slug, cap_name, cap_cat, cap_desc, cap_status,
                     relation_type, relevance, reason_tags, rationale, p_id, p_name, p_slug) = r
                    if cap_id not in caps:
                        caps[cap_id] = {
                            "capability_id": cap_id, "slug": cap_slug, "name": cap_name, "category": cap_cat,
                            "description": cap_desc, "status": cap_status,
                            "_need_rank": 0, "_priority_rank": 0, "source_practices": [], "candidates": [],
                        }
                    a = caps[cap_id]
                    a["_need_rank"] = max(a["_need_rank"], NEED_RANK.get(relation_type, 0))
                    a["_priority_rank"] = max(a["_priority_rank"], PRIORITY_RANK.get(relevance, 0))
                    a["source_practices"].append({
                        "practice_id": p_id, "practice_name": p_name, "practice_slug": p_slug,
                        "practice_relevance": relevance, "relation_type": relation_type,
                        "reason_tags": reason_tags or [], "rationale_note": rationale,
                    })

                # фильтр архивных capability
                cap_ids = [cid for cid, a in caps.items() if include_arch_caps or a["status"] == "active"]

                # 2) supply-side: модули, покрывающие эти capability
                if cap_ids:
                    mod_filter = "" if include_arch_modules else \
                        "AND md.status = 'active' AND pr.status = 'active' AND ve.status = 'active'"
                    cur.execute(
                        f"""SELECT mc.capability_id, mc.coverage_level, mc.note, mc.source_note, mc.source_url,
                                   md.id, md.slug, md.name, md.category, md.summary, md.status,
                                   pr.id, pr.slug, pr.name, pr.category, pr.status, pr.deployment_types,
                                   ve.id, ve.slug, ve.name, ve.status
                            FROM {SCHEMA}.solution_module_capability_map mc
                            JOIN {SCHEMA}.solution_product_modules md ON md.id = mc.module_id
                            JOIN {SCHEMA}.solution_products pr ON pr.id = md.product_id
                            JOIN {SCHEMA}.solution_vendors ve ON ve.id = pr.vendor_id
                            WHERE mc.capability_id = ANY(%s) {mod_filter}""",
                        (cap_ids,),
                    )
                    for s in cur.fetchall():
                        (scap_id, coverage_level, cov_note, src_note, src_url,
                         mod_id, mod_slug, mod_name, mod_cat, mod_summary, mod_status,
                         prod_id, prod_slug, prod_name, prod_cat, prod_status, depl_types,
                         ven_id, ven_slug, ven_name, ven_status) = s
                        caps[scap_id]["candidates"].append({
                            "module_id": mod_id, "module_slug": mod_slug, "module_name": mod_name,
                            "module_category": mod_cat, "module_summary": mod_summary, "module_status": mod_status,
                            "coverage_level": coverage_level, "coverage_note": cov_note,
                            "source_note": src_note, "source_url": src_url,
                            "product_id": prod_id, "product_slug": prod_slug, "product_name": prod_name,
                            "product_category": prod_cat, "product_status": prod_status,
                            "deployment_types": depl_types or [],
                            "vendor_id": ven_id, "vendor_slug": ven_slug, "vendor_name": ven_name, "vendor_status": ven_status,
                        })

            # 3) финализация групп + summary
            distinct_modules, distinct_products, distinct_vendors = set(), set(), set()
            groups = []
            summary = {"capabilities_total": 0, "capabilities_with_candidates": 0,
                       "capabilities_without_candidates": 0, "required_total": 0,
                       "required_without_candidates": 0, "distinct_modules_count": 0,
                       "distinct_products_count": 0, "distinct_vendors_count": 0}
            for cid in cap_ids:
                a = caps[cid]
                a["need_level"] = NEED_BY_RANK.get(a["_need_rank"], "optional")
                a["priority_level"] = PRIORITY_BY_RANK.get(a["_priority_rank"], "explore")
                a["source_practices_count"] = len(a["source_practices"])
                a["candidates"].sort(key=lambda x: (
                    -COVERAGE_RANK.get(x["coverage_level"], 0), x["product_name"], x["module_name"]))
                a["candidates_count"] = len(a["candidates"])
                a.pop("_need_rank"); a.pop("_priority_rank")

                summary["capabilities_total"] += 1
                if a["candidates_count"] > 0:
                    summary["capabilities_with_candidates"] += 1
                else:
                    summary["capabilities_without_candidates"] += 1
                if a["need_level"] == "required":
                    summary["required_total"] += 1
                    if a["candidates_count"] == 0:
                        summary["required_without_candidates"] += 1
                for c in a["candidates"]:
                    distinct_modules.add(c["module_id"]); distinct_products.add(c["product_id"]); distinct_vendors.add(c["vendor_id"])
                groups.append(a)

            summary["distinct_modules_count"] = len(distinct_modules)
            summary["distinct_products_count"] = len(distinct_products)
            summary["distinct_vendors_count"] = len(distinct_vendors)

            if counts_only:
                return cors({"ok": True, "summary": {
                    "distinct_modules_count": summary["distinct_modules_count"],
                    "capabilities_without_candidates": summary["capabilities_without_candidates"],
                    "required_without_candidates": summary["required_without_candidates"],
                }})

            # required gaps наверх, затем required с покрытием, затем supporting, optional; внутри — по priority и имени
            groups.sort(key=lambda g: (
                -NEED_RANK.get(g["need_level"], 0),
                0 if (g["need_level"] == "required" and g["candidates_count"] == 0) else 1,
                -PRIORITY_RANK.get(g["priority_level"], 0),
                g["name"],
            ))
            return cors({"ok": True, "summary": summary, "capability_groups": groups})

        # ── Derived: кандидатные наборы модулей (bundle-view) ─────
        if method == "GET" and action == "function_module_bundles":
            func_id = int(qs.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            max_size = int(qs.get("max_bundle_size") or 3)
            max_size = max(1, min(3, max_size))
            limit = int(qs.get("limit") or 10)
            limit = max(1, min(30, limit))
            only_full_required = (qs.get("only_full_required") or "false").lower() == "true"
            include_arch = (qs.get("include_archived_supply") or "false").lower() == "true"
            with conn.cursor() as cur:
                groups = build_function_capability_supply(
                    cur, SCHEMA, func_id, include_arch_caps=False, include_arch_modules=include_arch)
            summary, bundles = build_module_bundles(groups, max_size=max_size, limit=limit,
                                                    only_full_required=only_full_required)
            return cors({"ok": True, "summary": summary, "bundles": bundles})

        # ── Shortlist решений: список ─────────────────────────────
        if method == "GET" and action == "function_shortlists":
            func_id = int(qs.get("function_id") or 0)
            include_archived = (qs.get("include_archived") or "false").lower() == "true"
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, bundle_key, title, decision_status, decision_note,
                               saved_required_total, saved_required_covered, saved_required_uncovered,
                               saved_supporting_total, saved_supporting_covered, saved_supporting_uncovered,
                               saved_optional_total, saved_optional_covered, saved_optional_uncovered,
                               is_archived, updated_at
                        FROM {SCHEMA}.function_solution_shortlists
                        WHERE function_id = %s {'' if include_archived else 'AND is_archived = false'}
                        ORDER BY is_archived,
                                 CASE decision_status WHEN 'preferred' THEN 0 WHEN 'shortlisted' THEN 1 ELSE 2 END,
                                 updated_at DESC""",
                    (func_id,),
                )
                rows = cur.fetchall()
                sl_ids = [r[0] for r in rows]
                mods_by_sl = {}
                if sl_ids:
                    cur.execute(
                        f"""SELECT sm.shortlist_id, m.id, m.name, m.status, p.name, v.name
                            FROM {SCHEMA}.function_solution_shortlist_modules sm
                            JOIN {SCHEMA}.solution_product_modules m ON m.id = sm.module_id
                            JOIN {SCHEMA}.solution_products p ON p.id = m.product_id
                            JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                            WHERE sm.shortlist_id = ANY(%s)""",
                        (sl_ids,),
                    )
                    for r in cur.fetchall():
                        mods_by_sl.setdefault(r[0], []).append(
                            {"module_id": r[1], "module_name": r[2], "module_status": r[3],
                             "product_name": r[4], "vendor_name": r[5]})

            # current-derived для drift
            with conn.cursor() as cur:
                groups = build_function_capability_supply(cur, SCHEMA, func_id,
                                                          include_arch_caps=False, include_arch_modules=True)
            items = []
            for r in rows:
                mods = mods_by_sl.get(r[0], [])
                cur_eval = evaluate_single_bundle(groups, [m["module_id"] for m in mods])
                drift_flags = []
                if cur_eval["required_covered"] != r[6]:
                    drift_flags.append("required_coverage_changed")
                if cur_eval["supporting_covered"] != r[9]:
                    drift_flags.append("supporting_coverage_changed")
                if cur_eval["optional_covered"] != r[12]:
                    drift_flags.append("optional_coverage_changed")
                if any(m["module_status"] != "active" for m in mods):
                    drift_flags.append("module_archived")
                items.append({
                    "id": r[0], "bundle_key": r[1], "title": r[2], "decision_status": r[3], "decision_note": r[4],
                    "saved": {
                        "required_total": r[5], "required_covered": r[6], "required_uncovered": r[7],
                        "supporting_total": r[8], "supporting_covered": r[9], "supporting_uncovered": r[10],
                        "optional_total": r[11], "optional_covered": r[12], "optional_uncovered": r[13],
                    },
                    "current": {
                        "required_covered": cur_eval["required_covered"], "required_uncovered": cur_eval["required_uncovered"],
                        "supporting_covered": cur_eval["supporting_covered"], "optional_covered": cur_eval["optional_covered"],
                    },
                    "has_drift": len(drift_flags) > 0, "drift_flags": drift_flags,
                    "modules": mods, "is_archived": r[14],
                })
            return cors({"ok": True, "items": items})

        # ── Shortlist: счётчики по функциям (badge) ───────────────
        if method == "GET" and action == "function_shortlists_counts":
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT s.function_id,
                               COUNT(*),
                               COUNT(*) FILTER (WHERE s.decision_status = 'preferred'),
                               COUNT(*) FILTER (WHERE s.decision_status = 'rejected')
                        FROM {SCHEMA}.function_solution_shortlists s
                        JOIN {SCHEMA}.dept_functions f ON f.id = s.function_id
                        WHERE f.project_id = %s AND s.is_archived = false
                        GROUP BY s.function_id""",
                    (project_id,),
                )
                counts = {r[0]: {"active": r[1], "preferred": r[2], "rejected": r[3]} for r in cur.fetchall()}
            return cors({"ok": True, "counts": counts})

        # ── Shortlist: детали (current-derived + snapshot + drift) ─
        if method == "GET" and action == "function_shortlist_detail":
            sl_id = int(qs.get("shortlist_id") or 0)
            if not sl_id:
                return cors({"ok": False, "error": "shortlist_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT s.id, s.function_id, s.bundle_key, s.title, s.decision_status, s.decision_note,
                               s.saved_required_total, s.saved_required_covered, s.saved_required_uncovered,
                               s.saved_supporting_total, s.saved_supporting_covered, s.saved_supporting_uncovered,
                               s.saved_optional_total, s.saved_optional_covered, s.saved_optional_uncovered, s.is_archived
                        FROM {SCHEMA}.function_solution_shortlists s
                        JOIN {SCHEMA}.dept_functions f ON f.id = s.function_id
                        WHERE s.id = %s AND f.project_id = %s""",
                    (sl_id, project_id),
                )
                row = cur.fetchone()
                if not row:
                    return cors({"ok": False, "error": "not found"}, 404)
                func_id = row[1]
                cur.execute(
                    f"""SELECT m.id, m.name, m.category, m.status, m.summary,
                               p.name, p.status, p.deployment_types, v.name, v.status
                        FROM {SCHEMA}.function_solution_shortlist_modules sm
                        JOIN {SCHEMA}.solution_product_modules m ON m.id = sm.module_id
                        JOIN {SCHEMA}.solution_products p ON p.id = m.product_id
                        JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                        WHERE sm.shortlist_id = %s""",
                    (sl_id,),
                )
                modules = [{"module_id": r[0], "module_name": r[1], "module_category": r[2], "module_status": r[3],
                            "module_summary": r[4], "product_name": r[5], "product_status": r[6],
                            "deployment_types": r[7] or [], "vendor_name": r[8], "vendor_status": r[9]}
                           for r in cur.fetchall()]
                groups = build_function_capability_supply(cur, SCHEMA, func_id,
                                                          include_arch_caps=False, include_arch_modules=True)
            cur_eval = evaluate_single_bundle(groups, [m["module_id"] for m in modules])
            saved = {"required_total": row[6], "required_covered": row[7], "required_uncovered": row[8],
                     "supporting_total": row[9], "supporting_covered": row[10], "supporting_uncovered": row[11],
                     "optional_total": row[12], "optional_covered": row[13], "optional_uncovered": row[14]}
            drift_flags = []
            if cur_eval["required_covered"] != saved["required_covered"]:
                drift_flags.append("required_coverage_changed")
            if cur_eval["supporting_covered"] != saved["supporting_covered"]:
                drift_flags.append("supporting_coverage_changed")
            if cur_eval["optional_covered"] != saved["optional_covered"]:
                drift_flags.append("optional_coverage_changed")
            if any(m["module_status"] != "active" for m in modules):
                drift_flags.append("module_archived")
            shortlist = {
                "id": row[0], "function_id": func_id, "bundle_key": row[2], "title": row[3],
                "decision_status": row[4], "decision_note": row[5], "is_archived": row[15],
                "modules": modules, "saved": saved, "current": cur_eval,
                "has_drift": len(drift_flags) > 0, "drift_flags": drift_flags,
            }
            return cors({"ok": True, "shortlist": shortlist})

        # ── Shortlist: создать из bundle (immutable module set) ────
        if method == "POST" and action == "create_function_shortlist":
            func_id = int(body.get("function_id") or 0)
            module_ids = body.get("module_ids") or []
            if not func_id or not module_ids:
                return cors({"ok": False, "error": "function_id и module_ids обязательны"}, 400)
            module_ids = list(dict.fromkeys(int(x) for x in module_ids))  # уникальные, порядок
            if len(module_ids) > 3:
                return cors({"ok": False, "error": "Максимум 3 модуля в наборе"}, 400)
            status = body.get("decision_status") or "shortlisted"
            if status not in SHORTLIST_STATUS:
                return cors({"ok": False, "error": "Недопустимый статус"}, 400)
            note = (body.get("decision_note") or "").strip() or None
            title = (body.get("title") or "").strip() or None
            if status in ("preferred", "rejected") and not note:
                return cors({"ok": False, "error": "Для preferred/rejected нужно обоснование"}, 400)

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT m.id, m.slug, m.status, p.status, v.status
                        FROM {SCHEMA}.solution_product_modules m
                        JOIN {SCHEMA}.solution_products p ON p.id = m.product_id
                        JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                        WHERE m.id = ANY(%s)""",
                    (module_ids,),
                )
                mrows = {r[0]: r for r in cur.fetchall()}
                if len(mrows) != len(module_ids):
                    return cors({"ok": False, "error": "Некоторые модули не найдены"}, 404)
                for mid in module_ids:
                    _, _, mst, pst, vst = mrows[mid]
                    if mst != "active" or pst != "active" or vst != "active":
                        return cors({"ok": False, "error": "Нельзя сохранить набор с архивным модулем/продуктом/вендором"}, 400)
                bundle_key = canonical_bundle_key([mrows[mid][1] for mid in module_ids])

                # snapshot текущего покрытия
                groups = build_function_capability_supply(cur, SCHEMA, func_id,
                                                          include_arch_caps=False, include_arch_modules=False)
                ev = evaluate_single_bundle(groups, module_ids)

                # активный дубль?
                cur.execute(
                    f"""SELECT id FROM {SCHEMA}.function_solution_shortlists
                        WHERE function_id = %s AND bundle_key = %s AND is_archived = false""",
                    (func_id, bundle_key),
                )
                if cur.fetchone():
                    return cors({"ok": False, "error": "Этот набор уже в шортлисте"}, 409)
                # preferred-конфликт
                if status == "preferred":
                    cur.execute(
                        f"""SELECT 1 FROM {SCHEMA}.function_solution_shortlists
                            WHERE function_id = %s AND is_archived = false AND decision_status = 'preferred'""",
                        (func_id,),
                    )
                    if cur.fetchone():
                        return cors({"ok": False, "error": "У функции уже есть preferred-набор"}, 409)
                # архивный дубль -> restore + update
                cur.execute(
                    f"""SELECT id FROM {SCHEMA}.function_solution_shortlists
                        WHERE function_id = %s AND bundle_key = %s AND is_archived = true
                        ORDER BY updated_at DESC LIMIT 1""",
                    (func_id, bundle_key),
                )
                arch = cur.fetchone()
                if arch:
                    sl_id = arch[0]
                    cur.execute(
                        f"""UPDATE {SCHEMA}.function_solution_shortlists SET
                              is_archived = false, title = %s, decision_status = %s, decision_note = %s,
                              saved_required_total=%s, saved_required_covered=%s, saved_required_uncovered=%s,
                              saved_supporting_total=%s, saved_supporting_covered=%s, saved_supporting_uncovered=%s,
                              saved_optional_total=%s, saved_optional_covered=%s, saved_optional_uncovered=%s,
                              updated_by=%s, updated_at=now()
                            WHERE id = %s""",
                        (title, status, note,
                         ev["required_total"], ev["required_covered"], ev["required_uncovered"],
                         ev["supporting_total"], ev["supporting_covered"], ev["supporting_uncovered"],
                         ev["optional_total"], ev["optional_covered"], ev["optional_uncovered"],
                         user_id, sl_id),
                    )
                else:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.function_solution_shortlists
                            (function_id, bundle_key, title, decision_status, decision_note,
                             saved_required_total, saved_required_covered, saved_required_uncovered,
                             saved_supporting_total, saved_supporting_covered, saved_supporting_uncovered,
                             saved_optional_total, saved_optional_covered, saved_optional_uncovered, updated_by)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (func_id, bundle_key, title, status, note,
                         ev["required_total"], ev["required_covered"], ev["required_uncovered"],
                         ev["supporting_total"], ev["supporting_covered"], ev["supporting_uncovered"],
                         ev["optional_total"], ev["optional_covered"], ev["optional_uncovered"], user_id),
                    )
                    sl_id = cur.fetchone()[0]
                    for mid in module_ids:
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.function_solution_shortlist_modules (shortlist_id, module_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                            (sl_id, mid),
                        )
            conn.commit()
            return cors({"ok": True, "id": sl_id})

        # ── Shortlist: обновить metadata (состав неизменяем) ──────
        if method == "POST" and action == "update_function_shortlist":
            sl_id = int(body.get("shortlist_id") or 0)
            if not sl_id:
                return cors({"ok": False, "error": "shortlist_id required"}, 400)
            status = body.get("decision_status") or "shortlisted"
            if status not in SHORTLIST_STATUS:
                return cors({"ok": False, "error": "Недопустимый статус"}, 400)
            note = (body.get("decision_note") or "").strip() or None
            title = (body.get("title") or "").strip() or None
            if status in ("preferred", "rejected") and not note:
                return cors({"ok": False, "error": "Для preferred/rejected нужно обоснование"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT s.function_id FROM {SCHEMA}.function_solution_shortlists s
                        JOIN {SCHEMA}.dept_functions f ON f.id = s.function_id
                        WHERE s.id = %s AND f.project_id = %s AND s.is_archived = false""",
                    (sl_id, project_id),
                )
                srow = cur.fetchone()
                if not srow:
                    return cors({"ok": False, "error": "Набор не найден"}, 404)
                if status == "preferred":
                    cur.execute(
                        f"""SELECT 1 FROM {SCHEMA}.function_solution_shortlists
                            WHERE function_id = %s AND is_archived = false AND decision_status = 'preferred' AND id <> %s""",
                        (srow[0], sl_id),
                    )
                    if cur.fetchone():
                        return cors({"ok": False, "error": "У функции уже есть preferred-набор"}, 409)
                cur.execute(
                    f"""UPDATE {SCHEMA}.function_solution_shortlists
                        SET title = %s, decision_status = %s, decision_note = %s, updated_by = %s, updated_at = now()
                        WHERE id = %s""",
                    (title, status, note, user_id, sl_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Shortlist: архив / восстановление ─────────────────────
        if method == "POST" and action in ("archive_function_shortlist", "restore_function_shortlist"):
            sl_id = int(body.get("shortlist_id") or 0)
            if not sl_id:
                return cors({"ok": False, "error": "shortlist_id required"}, 400)
            archived = action == "archive_function_shortlist"
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT s.function_id, s.bundle_key, s.decision_status
                        FROM {SCHEMA}.function_solution_shortlists s
                        JOIN {SCHEMA}.dept_functions f ON f.id = s.function_id
                        WHERE s.id = %s AND f.project_id = %s""",
                    (sl_id, project_id),
                )
                srow = cur.fetchone()
                if not srow:
                    return cors({"ok": False, "error": "Набор не найден"}, 404)
                if not archived:
                    cur.execute(
                        f"""SELECT 1 FROM {SCHEMA}.function_solution_shortlists
                            WHERE function_id = %s AND bundle_key = %s AND is_archived = false AND id <> %s""",
                        (srow[0], srow[1], sl_id),
                    )
                    if cur.fetchone():
                        return cors({"ok": False, "error": "Активный набор с тем же составом уже существует"}, 409)
                    if srow[2] == "preferred":
                        cur.execute(
                            f"""SELECT 1 FROM {SCHEMA}.function_solution_shortlists
                                WHERE function_id = %s AND is_archived = false AND decision_status = 'preferred' AND id <> %s""",
                            (srow[0], sl_id),
                        )
                        if cur.fetchone():
                            return cors({"ok": False, "error": "У функции уже есть preferred-набор"}, 409)
                cur.execute(
                    f"UPDATE {SCHEMA}.function_solution_shortlists SET is_archived = %s, updated_at = now() WHERE id = %s",
                    (archived, sl_id),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Сводка решения по функции (derived над preferred) ─────
        if method == "GET" and action == "function_decision_summary":
            func_id = int(qs.get("function_id") or 0)
            if not func_id:
                return cors({"ok": False, "error": "function_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, title FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                frow = cur.fetchone()
                if not frow:
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                function = {"id": frow[0], "name": frow[1]}

                # сводка по shortlist (только активные)
                cur.execute(
                    f"""SELECT decision_status, COUNT(*)
                        FROM {SCHEMA}.function_solution_shortlists
                        WHERE function_id = %s AND is_archived = false
                        GROUP BY decision_status""",
                    (func_id,),
                )
                by_status = {r[0]: r[1] for r in cur.fetchall()}
                shortlists_summary = {
                    "active_count": sum(by_status.values()),
                    "preferred_count": by_status.get("preferred", 0),
                    "rejected_count": by_status.get("rejected", 0),
                    "shortlisted_count": by_status.get("shortlisted", 0),
                }

                # active preferred (единственный по индексу)
                cur.execute(
                    f"""SELECT id, title, decision_note, updated_at,
                               saved_required_covered, saved_supporting_covered, saved_optional_covered
                        FROM {SCHEMA}.function_solution_shortlists
                        WHERE function_id = %s AND is_archived = false AND decision_status = 'preferred'
                        LIMIT 1""",
                    (func_id,),
                )
                pref = cur.fetchone()

                preferred_modules = []
                if pref:
                    cur.execute(
                        f"""SELECT m.id, m.name, m.status, p.id, p.name, p.status, v.id, v.name, v.status
                            FROM {SCHEMA}.function_solution_shortlist_modules sm
                            JOIN {SCHEMA}.solution_product_modules m ON m.id = sm.module_id
                            JOIN {SCHEMA}.solution_products p ON p.id = m.product_id
                            JOIN {SCHEMA}.solution_vendors v ON v.id = p.vendor_id
                            WHERE sm.shortlist_id = %s""",
                        (pref[0],),
                    )
                    preferred_modules = cur.fetchall()

                groups = build_function_capability_supply(
                    cur, SCHEMA, func_id, include_arch_caps=False, include_arch_modules=True)

            # selection_state — без авто-подмены
            if shortlists_summary["active_count"] == 0:
                selection_state = "no_shortlist"
            elif not pref:
                selection_state = "no_preferred"
            else:
                selection_state = "preferred_selected"

            preferred_summary = None
            residual_gaps = {"required": [], "supporting": []}
            flags = {
                "has_preferred": bool(pref), "has_required_gaps": False, "required_gaps_count": 0,
                "has_supporting_gaps": False, "supporting_gaps_count": 0, "has_drift": False,
                "has_archived_supply": False, "full_required_coverage": False,
            }

            if pref:
                module_ids = [m[0] for m in preferred_modules]
                ev = evaluate_single_bundle(groups, module_ids)
                products = {(m[3], m[4], m[5]) for m in preferred_modules}
                vendors = {(m[6], m[7], m[8]) for m in preferred_modules}
                arch_modules = [m for m in preferred_modules if m[2] != "active"]
                arch_products = [pp for pp in products if pp[2] != "active"]
                arch_vendors = [vv for vv in vendors if vv[2] != "active"]

                drift_reasons = []
                if ev["required_covered"] != (pref[4] or 0):
                    drift_reasons.append("required_coverage_changed")
                if ev["supporting_covered"] != (pref[5] or 0):
                    drift_reasons.append("supporting_coverage_changed")
                if ev["optional_covered"] != (pref[6] or 0):
                    drift_reasons.append("optional_coverage_changed")
                if arch_modules or arch_products or arch_vendors:
                    drift_reasons.append("archived_supply")

                for cr in ev["capability_results"]:
                    if not cr["covered"] and cr["need_level"] in ("required", "supporting"):
                        residual_gaps[cr["need_level"]].append({
                            "capability_id": cr["capability_id"], "name": cr["capability_name"],
                            "category": cr["capability_category"], "need_level": cr["need_level"],
                            "priority_level": cr["priority_level"],
                            "source_practices_count": len(cr["source_practices"]),
                            "source_practices": cr["source_practices"],
                        })

                flags["has_required_gaps"] = ev["required_uncovered"] > 0
                flags["required_gaps_count"] = ev["required_uncovered"]
                flags["has_supporting_gaps"] = ev["supporting_uncovered"] > 0
                flags["supporting_gaps_count"] = ev["supporting_uncovered"]
                flags["has_drift"] = len(drift_reasons) > 0
                flags["has_archived_supply"] = bool(arch_modules or arch_products or arch_vendors)
                flags["full_required_coverage"] = (ev["required_total"] > 0 and ev["required_uncovered"] == 0)

                preferred_summary = {
                    "shortlist_id": pref[0], "title": pref[1], "decision_status": "preferred",
                    "decision_note": pref[2], "updated_at": pref[3],
                    "modules_count": len(preferred_modules), "products_count": len(products), "vendors_count": len(vendors),
                    "modules": [{"module_id": m[0], "module_name": m[1], "module_status": m[2]} for m in preferred_modules],
                    "products": [{"product_id": pp[0], "product_name": pp[1], "product_status": pp[2]} for pp in products],
                    "vendors": [{"vendor_id": vv[0], "vendor_name": vv[1], "vendor_status": vv[2]} for vv in vendors],
                    "coverage": {
                        "required_total": ev["required_total"], "required_covered": ev["required_covered"], "required_uncovered": ev["required_uncovered"],
                        "supporting_total": ev["supporting_total"], "supporting_covered": ev["supporting_covered"], "supporting_uncovered": ev["supporting_uncovered"],
                        "optional_total": ev["optional_total"], "optional_covered": ev["optional_covered"], "optional_uncovered": ev["optional_uncovered"],
                    },
                    "drift": {"has_drift": len(drift_reasons) > 0, "drift_reasons": drift_reasons},
                    "archived_supply": {
                        "archived_modules_count": len(arch_modules),
                        "archived_products_count": len(arch_products),
                        "archived_vendors_count": len(arch_vendors),
                    },
                }

            # decision_health — производный label для UI (истина — в selection_state + flags)
            if selection_state == "no_shortlist":
                decision_health = "none"
            elif selection_state == "no_preferred":
                decision_health = "pending"
            else:
                gaps = flags["has_required_gaps"]
                drift = flags["has_drift"]
                if gaps and drift:
                    decision_health = "preferred_with_required_gaps_and_drift"
                elif gaps:
                    decision_health = "preferred_with_required_gaps"
                elif drift:
                    decision_health = "preferred_with_drift"
                else:
                    decision_health = "preferred_ok"

            return cors({"ok": True, "function": function, "selection_state": selection_state,
                         "decision_health": decision_health, "shortlists_summary": shortlists_summary,
                         "decision_flags": flags, "preferred_summary": preferred_summary,
                         "residual_gaps": residual_gaps})

        # ── Привязать функцию к узлу (owner/co_executor/...) ───────
        if method == "POST" and action == "assign_org_unit":
            func_id = int(body.get("function_id") or 0)
            org_unit_id = int(body.get("org_unit_id") or 0)
            role = (body.get("role") or "owner").strip()
            if role not in ("owner", "co_executor", "participant", "reviewer"):
                return cors({"ok": False, "error": "invalid role"}, 400)
            if not func_id or not org_unit_id:
                return cors({"ok": False, "error": "function_id и org_unit_id required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.dept_functions WHERE id = %s AND project_id = %s",
                    (func_id, project_id),
                )
                if not cur.fetchone():
                    return cors({"ok": False, "error": "Функция не найдена"}, 404)
                # правило "один owner": при назначении owner снимаем прежнего
                if role == "owner":
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.function_org_units WHERE function_id = %s AND role = 'owner'",
                        (func_id,),
                    )
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.function_org_units (function_id, org_unit_id, role, source_ref)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (function_id, org_unit_id, role) DO NOTHING""",
                    (func_id, org_unit_id, role, body.get("source_ref", "manual")),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Снять привязку функции к узлу ─────────────────────────
        if method == "DELETE" and action == "unassign_org_unit":
            func_id = int(qs.get("function_id") or body.get("function_id") or 0)
            org_unit_id = int(qs.get("org_unit_id") or body.get("org_unit_id") or 0)
            role = (qs.get("role") or body.get("role") or "").strip()
            if not func_id or not org_unit_id:
                return cors({"ok": False, "error": "function_id и org_unit_id required"}, 400)
            with conn.cursor() as cur:
                if role:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.function_org_units WHERE function_id = %s AND org_unit_id = %s AND role = %s",
                        (func_id, org_unit_id, role),
                    )
                else:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.function_org_units WHERE function_id = %s AND org_unit_id = %s",
                        (func_id, org_unit_id),
                    )
            conn.commit()
            return cors({"ok": True})

        # ── Привязать направление к функции ───────────────────────
        if method == "POST" and action == "assign_direction":
            func_id = int(body.get("function_id") or 0)
            code = (body.get("direction_code") or "").strip()
            if not func_id or not code:
                return cors({"ok": False, "error": "function_id и direction_code required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.function_directions (function_id, direction_code, direction_name, source_ref)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (function_id, direction_code) DO UPDATE SET direction_name = EXCLUDED.direction_name""",
                    (func_id, code, body.get("direction_name", ""), body.get("source_ref", "manual")),
                )
            conn.commit()
            return cors({"ok": True})

        # ── Снять направление ─────────────────────────────────────
        if method == "DELETE" and action == "unassign_direction":
            func_id = int(qs.get("function_id") or body.get("function_id") or 0)
            code = (qs.get("direction_code") or body.get("direction_code") or "").strip()
            if not func_id or not code:
                return cors({"ok": False, "error": "function_id и direction_code required"}, 400)
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {SCHEMA}.function_directions WHERE function_id = %s AND direction_code = %s",
                    (func_id, code),
                )
            conn.commit()
            return cors({"ok": True})

        return cors({"ok": False, "error": f"Unknown action: {action}"}, 400)

    finally:
        conn.close()