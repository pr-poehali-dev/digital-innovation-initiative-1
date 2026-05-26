"""
Diagram Renderer для PPTX export.
Только схемы через python-pptx shapes (без YandexArt/S3 — это уже сделано при генерации).
"""
import re


def _rgb(hex_str: str):
    from pptx.dml.color import RGBColor
    h = hex_str.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _darken(hex_color: str, factor: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return "#{:02X}{:02X}{:02X}".format(
        max(0, int(r * (1 - factor))),
        max(0, int(g * (1 - factor))),
        max(0, int(b * (1 - factor))),
    )


def _lighten(hex_color: str, factor: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return "#{:02X}{:02X}{:02X}".format(
        min(255, int(r + (255 - r) * factor)),
        min(255, int(g + (255 - g) * factor)),
        min(255, int(b + (255 - b) * factor)),
    )


def _parse_steps(prompt: str) -> list:
    """
    Извлекает список шагов из промпта.
    Поддерживает:
      - стрелки: → / -> (и em-dash — как разделитель)
      - нумерацию: 1. шаг 2. шаг
      - запятые: шаг1, шаг2
    Автоматически убирает prefix "N этапов:" / "Дорожная карта:".
    """
    # Нормализуем разделители: → / -> / — все в ->
    norm = prompt.replace("→", "->").replace("—", ",")

    if "->" in norm:
        parts = norm.split("->")
        cleaned = []
        for s in parts:
            s = s.strip().strip(".,;")
            # Убираем prefix вида "5 этапов: " / "Дорожная карта на 6 месяцев: "
            if ":" in s:
                prefix, _, rest = s.partition(":")
                # Если prefix короткий (< 40 симв.) и не содержит слов-ключей шага
                if len(prefix.strip()) < 40:
                    s = rest.strip()
            if s:
                cleaned.append(s[:60])
        if len(cleaned) >= 2:
            return cleaned[:8]

    # Нормализованный промпт для запятых (уже em-dash → запятая)
    # Нумерованный список: "1. анализ 2. дизайн"
    numbered = re.findall(r'(?:^|\b)(\d+)[.\)]\s*([^\d\n;]+?)(?=\s*\d+[.\)]|\Z)', norm)
    if len(numbered) >= 2:
        return [v.strip().strip(",")[:60] for _, v in numbered][:8]

    # Запятые (norm уже содержит em-dash → запятые)
    parts = [p.strip()[:60] for p in norm.split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[:8]

    return [prompt[:60]]


def _add_rect(slide, x, y, w, h, fill_hex, text, font_size=10, text_hex="#FFFFFF", bold=True):
    from pptx.util import Inches, Pt
    from pptx.enum.text import PP_ALIGN
    from pptx.enum.shapes import MSO_SHAPE
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(fill_hex)
    shape.line.color.rgb = _rgb(fill_hex)
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = _rgb(text_hex)
    return shape


def _add_connector(slide, x1, y1, x2, y2, color_hex):
    from pptx.util import Inches, Emu
    c = slide.shapes.add_connector(1, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = _rgb(color_hex)
    c.line.width = Emu(20000)
    return c


# ------------------------------------------------------------------ #
#  Renderers                                                          #
# ------------------------------------------------------------------ #

def render_process(prompt, slide, style, W=13.33, H=7.5):
    from pptx.util import Inches
    steps = _parse_steps(prompt)
    n = len(steps)
    if not n:
        return False
    acc = "#{:02X}{:02X}{:02X}".format(*style.get("accent", (0x60, 0x8B, 0xC4)))
    txt = "#{:02X}{:02X}{:02X}".format(*style.get("title", (0xFF, 0xFF, 0xFF)))

    mx = 0.6
    total_w = W - mx * 2
    bw = min(2.0, (total_w - 0.25 * (n - 1)) / n)
    gap = (total_w - bw * n) / max(n - 1, 1) if n > 1 else 0
    bh = 1.4
    by = 2.5 + (3.0 - bh) / 2

    for i, step in enumerate(steps):
        x = mx + i * (bw + gap)
        fill = acc if i % 2 == 0 else _darken(acc, 0.22)
        _add_rect(slide, x, by, bw, bh, fill, step, font_size=10, text_hex=txt, bold=True)
        if i < n - 1:
            _add_connector(slide, x + bw + 0.02, by + bh / 2,
                           x + bw + gap - 0.04, by + bh / 2, acc)
    return True


def render_timeline(prompt, slide, style, W=13.33, H=7.5):
    from pptx.util import Inches, Pt, Emu
    from pptx.enum.text import PP_ALIGN
    steps = _parse_steps(prompt)
    n = len(steps)
    if not n:
        return False
    acc = "#{:02X}{:02X}{:02X}".format(*style.get("accent", (0x60, 0x8B, 0xC4)))
    txt = "#{:02X}{:02X}{:02X}".format(*style.get("title", (0xFF, 0xFF, 0xFF)))

    mx = 0.9
    axis_y = 4.2
    total_w = W - mx * 2

    # Ось
    c = slide.shapes.add_connector(1, Inches(mx), Inches(axis_y), Inches(W - mx), Inches(axis_y))
    c.line.color.rgb = _rgb(acc)
    c.line.width = Emu(30000)

    sg = total_w / max(n - 1, 1) if n > 1 else total_w / 2

    for i, step in enumerate(steps):
        sx = mx + i * sg
        # Точка (OVAL = MSO_SHAPE.OVAL)
        from pptx.enum.shapes import MSO_SHAPE as _MS
        dot = slide.shapes.add_shape(_MS.OVAL, Inches(sx - 0.11), Inches(axis_y - 0.11),
                                     Inches(0.22), Inches(0.22))
        dot.fill.solid()
        dot.fill.fore_color.rgb = _rgb(acc)
        dot.line.fill.background()
        # Метка — чередование вверх/вниз
        ty = (axis_y - 1.5) if i % 2 == 0 else (axis_y + 0.35)
        tb = slide.shapes.add_textbox(Inches(sx - 0.85), Inches(ty), Inches(1.7), Inches(0.85))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = step[:50]
        run.font.size = Pt(9)
        run.font.bold = i in (0, n - 1)
        run.font.color.rgb = _rgb(txt)
        # Линия к метке
        ly1 = axis_y - 0.11 if i % 2 == 0 else axis_y + 0.11
        ly2 = ty + (0.85 if i % 2 == 0 else 0)
        _add_connector(slide, sx, ly1, sx, ly2, acc)
    return True


def render_comparison(prompt, slide, style, W=13.33, H=7.5):
    from pptx.util import Inches, Pt
    from pptx.enum.text import PP_ALIGN
    acc = "#{:02X}{:02X}{:02X}".format(*style.get("accent", (0x60, 0x8B, 0xC4)))
    txt = "#{:02X}{:02X}{:02X}".format(*style.get("title", (0xFF, 0xFF, 0xFF)))

    parts = re.split(r'\bи\b|vs\.?|versus|\bпротив\b', prompt, flags=re.IGNORECASE)
    left = parts[0].strip()[:40] if len(parts) >= 2 else "Вариант А"
    right = parts[1].strip()[:40] if len(parts) >= 2 else "Вариант Б"

    cw, ch, cy = 5.0, 3.8, 2.4
    _add_rect(slide, 0.7, cy, cw, ch, acc, left, font_size=13, text_hex=txt, bold=True)
    _add_rect(slide, W - 0.7 - cw, cy, cw, ch, _darken(acc, 0.25), right,
              font_size=13, text_hex=txt, bold=True)
    vb = slide.shapes.add_textbox(Inches(W / 2 - 0.32), Inches(cy + ch / 2 - 0.28),
                                   Inches(0.64), Inches(0.56))
    tf = vb.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = "VS"
    from pptx.util import Pt as Pt2
    run.font.size = Pt2(16)
    run.font.bold = True
    run.font.color.rgb = _rgb(txt)
    return True


def render_matrix(prompt, slide, style, W=13.33, H=7.5):
    acc = "#{:02X}{:02X}{:02X}".format(*style.get("accent", (0x60, 0x8B, 0xC4)))
    txt = "#{:02X}{:02X}{:02X}".format(*style.get("title", (0xFF, 0xFF, 0xFF)))
    colors = [_darken(acc, 0.3), acc, _lighten(acc, 0.3), _darken(acc, 0.12)]
    labels = ["Низкий / Низкий", "Высокий / Низкий", "Низкий / Высокий", "Высокий / Высокий"]
    size = 2.2
    sx = (W - size * 2 - 0.12) / 2
    sy = 2.3
    for idx in range(4):
        col, row = idx % 2, idx // 2
        _add_rect(slide, sx + col * (size + 0.12), sy + row * (size + 0.12),
                  size, size, colors[idx], labels[idx], font_size=9, text_hex=txt, bold=False)
    return True


def render_orgchart(prompt, slide, style, W=13.33, H=7.5):
    acc = "#{:02X}{:02X}{:02X}".format(*style.get("accent", (0x60, 0x8B, 0xC4)))
    txt = "#{:02X}{:02X}{:02X}".format(*style.get("title", (0xFF, 0xFF, 0xFF)))
    steps = _parse_steps(prompt)
    if not steps:
        return False
    root = steps[0]
    children = steps[1:] if len(steps) > 1 else ["Команда"]
    rw, rh, ry = 3.0, 0.85, 2.1
    rx = (W - rw) / 2
    _add_rect(slide, rx, ry, rw, rh, acc, root, font_size=12, text_hex=txt, bold=True)
    cw = min(2.3, (W - 1.4) / len(children))
    total_cw = cw * len(children) + 0.18 * (len(children) - 1)
    csx = (W - total_cw) / 2
    cy = ry + rh + 0.85
    for i, child in enumerate(children):
        cx = csx + i * (cw + 0.18)
        _add_rect(slide, cx, cy, cw, 0.75, _darken(acc, 0.2), child,
                  font_size=9, text_hex=txt, bold=False)
        _add_connector(slide, rx + rw / 2, ry + rh, cx + cw / 2, cy, acc)
    return True


# ------------------------------------------------------------------ #
#  Dispatcher                                                         #
# ------------------------------------------------------------------ #

def render_diagram(visual_type: str, prompt: str, slide, style: dict,
                   slide_width=13.33, slide_height=7.5) -> bool:
    """Рисует схему на слайде. Возвращает True при успехе."""
    RENDERERS = {
        "process":    render_process,
        "diagram":    render_process,
        "cycle":      render_process,
        "timeline":   render_timeline,
        "comparison": render_comparison,
        "matrix":     render_matrix,
        "orgchart":   render_orgchart,
    }
    fn = RENDERERS.get(visual_type)
    if not fn:
        return False
    try:
        return fn(prompt, slide, style, slide_width, slide_height)
    except Exception:
        return False