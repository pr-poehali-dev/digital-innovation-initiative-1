#!/usr/bin/env python3
"""
Идемпотентная ручная загрузка функций ДФМ из data/dfm_manual_functions.json.

Правила:
  - Автопривязка к узлу оргдерева ТОЛЬКО по exact match: source_section_code == org_units.code.
    Никаких догадок по родителю/названию.
  - Идемпотентность: ключ (project_id, normalized_title, source_section_code).
    Повторный запуск не создаёт дублей.
  - Всё несматченное не теряется — попадает в отчёт reports/dfm_load_report.json с причиной:
      org_unit_not_found | section_code_missing | text_not_confident

Запуск (нужен DATABASE_URL в окружении и psycopg2):
    DATABASE_URL=... python3 scripts/load_dfm_manual.py
"""
import json
import os
import re
import sys

import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p61016064_digital_innovation_i")
DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "dfm_manual_functions.json")
REPORT_FILE = os.path.join(os.path.dirname(__file__), "..", "reports", "dfm_load_report.json")

_STOP_WORDS = {
    "и", "в", "во", "на", "по", "с", "со", "к", "о", "об", "от", "для", "при",
    "а", "также", "или", "их", "его", "ее", "том", "числе", "части", "рамках",
    "целях", "банка", "подразделения", "деятельности",
}
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


def normalize(text: str) -> str:
    t = (text or "").lower().replace("ё", "е")
    t = re.sub(r"[^\w\s]", " ", t)
    for pattern, canon in _VERB_CANON:
        t = re.sub(pattern, canon, t)
    words = [w for w in t.split() if w and w not in _STOP_WORDS and len(w) > 2]
    words.sort()
    return " ".join(words)


def main() -> int:
    with open(DATA_FILE, encoding="utf-8") as fh:
        payload = json.load(fh)
    meta = payload["_meta"]
    project_id = meta["project_id"]
    dept_name = meta.get("dept_name", "")
    functions = payload["functions"]

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    report = {"total": len(functions), "inserted": 0, "already_present": 0,
              "auto_linked": 0, "unmatched": [], "missing_unit_codes": set()}
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT code, id FROM {SCHEMA}.org_units WHERE project_id = %s AND is_archived = false", (project_id,))
            code_to_unit = {r[0]: r[1] for r in cur.fetchall()}

        for i, f in enumerate(functions):
            title = f["title"].strip()
            norm = normalize(title)
            section = (f.get("source_section_code") or "").strip().rstrip(".")
            conf = f.get("confidence", "high")

            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id FROM {SCHEMA}.dept_functions
                        WHERE project_id = %s AND normalized_title = %s AND source_section_code = %s""",
                    (project_id, norm, section),
                )
                row = cur.fetchone()
                if row:
                    func_id = row[0]
                    report["already_present"] += 1
                else:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.dept_functions
                            (project_id, dept_name, title, description, goals, category, priority,
                             normalized_title, source_section_code)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (project_id, dept_name, title, f.get("description", ""), f.get("goals", ""),
                         f.get("category", "operational"), i, norm, section),
                    )
                    func_id = cur.fetchone()[0]
                    report["inserted"] += 1
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.dept_automation (function_id, project_id)
                            VALUES (%s,%s) ON CONFLICT DO NOTHING""",
                        (func_id, project_id),
                    )
                # направления
                for d in f.get("directions", []):
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.function_directions (function_id, direction_code, direction_name, source_ref)
                            VALUES (%s,%s,%s,%s) ON CONFLICT (function_id, direction_code) DO NOTHING""",
                        (func_id, d["code"], d.get("name", ""), "manual_from_screenshot"),
                    )

            # автопривязка ТОЛЬКО по exact match
            if not section:
                report["unmatched"].append({"title": title, "reason": "section_code_missing"})
                continue
            if conf != "high":
                report["unmatched"].append({"title": title, "section": section, "reason": "text_not_confident"})
                continue
            unit_id = code_to_unit.get(section)
            if not unit_id:
                report["missing_unit_codes"].add(section)
                report["unmatched"].append({"title": title, "section": section, "reason": "org_unit_not_found"})
                continue
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.function_org_units (function_id, org_unit_id, role, confidence, source_ref)
                        VALUES (%s,%s,'owner',0.9,%s)
                        ON CONFLICT (function_id, org_unit_id, role) DO NOTHING""",
                    (func_id, unit_id, f"manual:{section}"),
                )
            report["auto_linked"] += 1

        conn.commit()
    finally:
        conn.close()

    report["missing_unit_codes"] = sorted(report["missing_unit_codes"])
    os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)
    with open(REPORT_FILE, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
