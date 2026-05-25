"""
Visual Parser — извлечение визуальных промптов из текстов документов, PPTX notes, инструкций.

Поддерживаемые маркеры (EN):
  [[image: ...]]   [[diagram: ...]]   [[timeline: ...]]
  [[process: ...]] [[matrix: ...]]    [[orgchart: ...]]
  [[comparison: ...]] [[chart: ...]]  [[cycle: ...]]

Поддерживаемые маркеры (RU):
  [КАРТИНКА: ...]  [СХЕМА: ...]      [ТАЙМЛАЙН: ...]
  [ДИАГРАММА: ...]  [ОРГСХЕМА: ...]  [СРАВНЕНИЕ: ...]
  [ПРОЦЕСС: ...]   [ЦИКЛ: ...]      [МАТРИЦА: ...]
"""
import re

# ------------------------------------------------------------------ #
#  Маппинг тип → render_mode                                          #
# ------------------------------------------------------------------ #
VISUAL_TYPE_MAP = {
    # EN маркеры
    "image":      ("image",      "ai_image"),
    "diagram":    ("diagram",    "pptx_shapes"),
    "timeline":   ("timeline",   "pptx_shapes"),
    "process":    ("process",    "pptx_shapes"),
    "cycle":      ("cycle",      "pptx_shapes"),
    "matrix":     ("matrix",     "pptx_shapes"),
    "orgchart":   ("orgchart",   "pptx_shapes"),
    "comparison": ("comparison", "pptx_shapes"),
    "chart":      ("chart",      "fallback_text"),   # нужны данные — дефолт fallback
    "table":      ("table",      "fallback_text"),
    # RU маркеры
    "картинка":   ("image",      "ai_image"),
    "иллюстрация":("image",      "ai_image"),
    "схема":      ("diagram",    "pptx_shapes"),
    "таймлайн":   ("timeline",   "pptx_shapes"),
    "дорожная карта": ("timeline", "pptx_shapes"),
    "процесс":    ("process",    "pptx_shapes"),
    "цикл":       ("cycle",      "pptx_shapes"),
    "матрица":    ("matrix",     "pptx_shapes"),
    "оргсхема":   ("orgchart",   "pptx_shapes"),
    "сравнение":  ("comparison", "pptx_shapes"),
    "диаграмма":  ("diagram",    "pptx_shapes"),
    "график":     ("chart",      "fallback_text"),
}

# EN: [[type: prompt]]
_PATTERN_EN = re.compile(
    r'\[\[(\w+)\s*:\s*([^\]]+?)\]\]',
    re.IGNORECASE | re.DOTALL,
)

# RU: [ТИП: prompt]
_RU_KEYWORDS = "|".join(re.escape(k) for k in [
    "КАРТИНКА", "ИЛЛЮСТРАЦИЯ", "СХЕМА", "ТАЙМЛАЙН", "ДОРОЖНАЯ КАРТА",
    "ПРОЦЕСС", "ЦИКЛ", "МАТРИЦА", "ОРГСХЕМА", "СРАВНЕНИЕ", "ДИАГРАММА", "ГРАФИК",
])
_PATTERN_RU = re.compile(
    rf'\[({_RU_KEYWORDS})\s*:\s*([^\]]+?)\]',
    re.IGNORECASE | re.DOTALL,
)


def _resolve_type(raw_type: str):
    """Возвращает (visual_type, render_mode) по ключевому слову маркера."""
    key = raw_type.strip().lower()
    if key in VISUAL_TYPE_MAP:
        return VISUAL_TYPE_MAP[key]
    return ("image", "ai_image")


def extract_visual_prompts(text: str, source_doc_id=None, source_doc_name: str = "", source_type: str = "text") -> list:
    """
    Ищет визуальные маркеры в тексте и возвращает список visual prompt объектов.

    Args:
        text:             Текст (extracted_text документа, notes PPTX и т.д.)
        source_doc_id:    ID документа (None для task instructions)
        source_doc_name:  Имя документа для display
        source_type:      'pptx_notes' | 'pptx_text' | 'docx' | 'pdf' | 'task_instruction' | 'doc_instruction'

    Returns:
        list of {
            visual_type, render_mode, source_prompt,
            source_doc_id, source_doc_name, source_type,
            char_offset  (позиция в тексте для привязки к слайду)
        }
    """
    found = []

    for m in _PATTERN_EN.finditer(text or ""):
        raw_type = m.group(1)
        prompt = m.group(2).strip()
        visual_type, render_mode = _resolve_type(raw_type)
        found.append({
            "visual_type": visual_type,
            "render_mode": render_mode,
            "source_prompt": prompt,
            "source_doc_id": source_doc_id,
            "source_doc_name": source_doc_name,
            "source_type": source_type,
            "char_offset": m.start(),
            "raw_marker": m.group(0),
        })

    for m in _PATTERN_RU.finditer(text or ""):
        raw_type = m.group(1)
        prompt = m.group(2).strip()
        visual_type, render_mode = _resolve_type(raw_type)
        found.append({
            "visual_type": visual_type,
            "render_mode": render_mode,
            "source_prompt": prompt,
            "source_doc_id": source_doc_id,
            "source_doc_name": source_doc_name,
            "source_type": source_type,
            "char_offset": m.start(),
            "raw_marker": m.group(0),
        })

    # Сортируем по позиции в тексте
    found.sort(key=lambda x: x["char_offset"])
    return found


def collect_visual_prompts_from_documents(documents: list) -> list:
    """
    Собирает все визуальные промпты из всех документов задания.

    documents — список dict с полями:
      id, name, file_type, text (extracted_text), structure (structure_json dict), instruction, role
    """
    all_prompts = []

    for doc in documents:
        doc_id = doc.get("id")
        doc_name = doc.get("name", "")
        file_type = (doc.get("file_type") or "").lower()

        # 1. Из extracted_text документа
        text = doc.get("text") or ""
        if text:
            prompts = extract_visual_prompts(
                text, doc_id, doc_name,
                source_type="pptx_text" if "pptx" in file_type else "docx" if "docx" in file_type else "pdf" if "pdf" in file_type else "text",
            )
            all_prompts.extend(prompts)

        # 2. Из speaker notes (хранятся в structure_json для PPTX)
        structure = doc.get("structure") or {}
        if isinstance(structure, dict):
            notes_text = structure.get("notes_text") or structure.get("speaker_notes") or ""
            if not notes_text:
                # Пробуем достать из slides[].notes
                slides_data = structure.get("slides") or []
                notes_parts = []
                for slide in slides_data:
                    if isinstance(slide, dict):
                        n = slide.get("notes") or slide.get("speaker_notes") or ""
                        if n:
                            notes_parts.append(n)
                notes_text = "\n".join(notes_parts)

            if notes_text:
                prompts = extract_visual_prompts(
                    notes_text, doc_id, doc_name, source_type="pptx_notes",
                )
                all_prompts.extend(prompts)

        # 3. Из user instruction к документу (поле instruction)
        instruction = doc.get("instruction") or ""
        if instruction:
            prompts = extract_visual_prompts(
                instruction, doc_id, doc_name, source_type="doc_instruction",
            )
            all_prompts.extend(prompts)

    return all_prompts


def collect_visual_prompts_from_task(task: dict) -> list:
    """Извлекает визуальные промпты из additional_instructions задачи."""
    instructions = task.get("additional_instructions") or ""
    return extract_visual_prompts(instructions, None, "Задание", source_type="task_instruction")


def build_visual_plan_entry(
    slide_index: int,
    slide_title: str,
    prompt_obj: dict,
    placement_hint: str = "content_area",
) -> dict:
    """Строит один элемент visual_plan для result_json."""
    return {
        "slide_index": slide_index,
        "slide_title": slide_title,
        "visual_type": prompt_obj["visual_type"],
        "render_mode": prompt_obj["render_mode"],
        "source_prompt": prompt_obj["source_prompt"],
        "normalized_prompt": prompt_obj["source_prompt"],   # будет обогащён AI
        "source_doc_id": prompt_obj.get("source_doc_id"),
        "source_doc_name": prompt_obj.get("source_doc_name", ""),
        "source_type": prompt_obj.get("source_type", "text"),
        "placement_hint": placement_hint,
        "generation_status": "pending",
        "asset_s3_key": None,
        "asset_url": None,
        "warnings": [],
    }
