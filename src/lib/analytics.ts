// Продуктовая аналитика — лёгкий хелпер
// Провайдер: Яндекс Метрика (тег уже в index.html, счётчик — window.ym).
// Для смены провайдера — замени тело sendEvent, интерфейсы не трогать.

declare global {
  interface Window {
    ym?: (id: number, action: string, name: string, params?: Record<string, unknown>) => void;
  }
}

const YM_ID = 109707980;

type VisualsSupportsReason =
  | "presentation_task"
  | "revise_visual_plan"
  | "revise_fallback_no_active_run"
  | "unsupported_task_type";

type GenerationErrorCode =
  | "timeout"
  | "validation_422"
  | "rate_limit_429"
  | "server_500"
  | "gateway_502"
  | "unavailable_503"
  | "unknown";

type LookupResult = "found" | "not_found" | "error";

// --- Карта событий ---
export type AnalyticsEvents = {
  // 0. Лендинг — клик по CTA
  landing_cta_clicked: {
    cta_id: string;   // "hero_start_self_assessment" | "hero_learn_more" | etc.
    destination: string;
  };

  // 0b. Guide — открытие страницы
  guide_opened: {
    source: string;  // "direct" | "competency_map_empty_state" | "sidebar" | "landing_nav" | etc.
  };

  // 0c. Guide — клик по CTA внутри guide или ссылке на guide
  guide_cta_clicked: {
    cta_id: string;   // "open_guide" | "hero_primary" | "step_1" | "module_*" | "scenario_*" | etc.
    source: string;   // откуда кликнули: "competency_map_empty_state" | "guide_page" | etc.
  };

  // 1. Переключение вкладки на VisualsPage
  visuals_source_mode_selected: {
    mode: "task" | "project_files";
    project_id: number | null;
    has_presentations: boolean;
    presentations_count: number;
  };

  // 2. Клик по CTA в режиме «По файлам проекта»
  project_file_cta_clicked: {
    action: "create_task" | "find_in_tasks";
    project_id: number | null;
    document_id: number;
    file_type: string;
  };

  // 3. Результат поиска задания по document_id
  project_file_task_lookup_result: {
    project_id: number | null;
    document_id: number;
    result: LookupResult;
    matches_count: number;
    opened_task_id?: number;
    error_code?: string;
  };

  // 4. Переключение «Генерировать визуалы»
  task_visuals_toggle_changed: {
    enabled: boolean;
    task_id: number;
    task_type: string;
    supports_visuals: boolean;
    supports_reason: VisualsSupportsReason;
  };

  // 5. Переключение «Картинки AI»
  task_ai_images_toggle_changed: {
    enabled: boolean;
    task_id: number;
    task_type: string;
    use_visuals_enabled: boolean;
  };

  // 6. Запуск генерации
  task_generation_submitted: {
    task_id: number;
    task_type: string;
    use_visuals: boolean;
    allow_ai_images: boolean;
    supports_visuals: boolean;
    is_revision: boolean;
  };

  // 7. Результат генерации
  task_generation_result: {
    task_id: number;
    task_type: string;
    status: "success" | "error";
    use_visuals: boolean;
    allow_ai_images: boolean;
    error_code?: GenerationErrorCode;
  };

  // 8. Разрешение доступности визуалов (один раз при открытии)
  task_visuals_availability_resolved: {
    task_id: number;
    task_type: string;
    supports_visuals: boolean;
    reason: VisualsSupportsReason;
    has_active_run: boolean;
    has_visual_plan: boolean;
  };

  // 9. Пустое состояние «По файлам проекта»
  project_files_empty_state_shown: {
    project_id: number;
    files_count_total: number;
  };

  // ── Public profile activation funnel ──────────────────────────────
  // 10. Просмотр страницы настроек публичного профиля
  public_profile_settings_viewed: {
    has_slug: boolean;
    is_published: boolean;
  };

  // 11. Slug сохранён
  public_profile_slug_saved: {
    slug_length: number;
  };

  // 12. Ошибка проверки slug (сеть)
  public_profile_slug_check_failed: Record<string, never>;

  // 13. Открыт confirm publish
  public_profile_publish_confirm_opened: {
    has_slug: boolean;
  };

  // 14. Профиль опубликован
  public_profile_published: Record<string, never>;

  // 15. Открыт confirm unpublish
  public_profile_unpublish_confirm_opened: Record<string, never>;

  // 16. Профиль снят с публикации
  public_profile_unpublished: Record<string, never>;

  // 17. Клик «Скопировать ссылку»
  public_profile_copy_link_clicked: {
    source: "dashboard_card" | "settings_page";
  };

  // 18. Ссылка успешно скопирована
  public_profile_copy_link_succeeded: {
    source: "dashboard_card" | "settings_page";
    copy_method: "clipboard" | "execCommand";
  };

  // 19. Автокопирование не удалось (открыт manual dialog)
  public_profile_copy_link_failed: {
    source: "dashboard_card" | "settings_page";
  };

  // 20. Клик «Открыть» публичную страницу
  public_profile_open_link_clicked: {
    source: "settings_page";
    is_published: boolean;
  };

  // 21. Клик по шагу из «Ближайших шагов»
  dashboard_next_step_clicked: {
    step_id: string;
    step_state: string;
  };

  // ── Competency map ────────────────────────────────────────────────
  // 22. Просмотр страницы карты компетенций
  competency_map_viewed: Record<string, never>;

  // 23. (deprecated — shell era, removed W13.5)

  // 27. Клик по компетенции — открытие drilldown
  competency_map_competency_clicked: {
    competency_id: number;
    competency_name: string;
  };

  // 28. Клик по evidence в drilldown
  competency_map_evidence_clicked: {
    evidence_id: number;
  };

  // 29. Раскрытие/скрытие домена
  competency_map_domain_expanded: {
    domain_id: number;
    expanded: boolean;
  };

  // 30. CTA из empty state
  competency_map_empty_cta_clicked: {
    cta_href: string;
  };

  // 31. Карта загружена — операционный сигнал
  competency_map_loaded: {
    status: "empty" | "partial" | "ready";
    total_competencies: number;
    verified_count: number;
    domains_covered: number;
  };

  // 32. Self-assessment: пользователь сохранил уровень компетенции
  competency_map_self_assessed: {
    competency_id: number;
    competency_name: string;
    level: number;
  };

  // 33. Рекомендация показана (fired при рендере блока)
  competency_map_recommendation_shown: {
    map_status: "empty" | "partial" | "ready";
    rec_count: number;
  };

  // 34. Клик по рекомендации
  competency_map_recommendation_clicked: {
    map_status: string;
    rec_kind: string;
    rec_href: string;
  };

  // ── Public profile page (публичная сторона) ───────────────────────
  // 24. Публичный профиль просмотрен посетителем
  public_profile_viewed: {
    slug: string;
  };

  // 25. Клик по проекту на публичной странице
  public_profile_project_clicked: {
    project_id: number;
  };

  // 26. Клик по внешней ссылке на публичной странице
  public_profile_external_link_clicked: {
    link_key: string;
    link_url: string;
  };

  // ── Landing page ───────────────────────────────────────────────────
  // 35. Просмотр лендинга
  landing_view: {
    is_authenticated: boolean;
    source: string;
  };

  // 36. Клик по primary CTA на лендинге
  landing_primary_cta_clicked: {
    cta_label: string;
    location: "hero" | "final_cta";
    is_authenticated: boolean;
  };

  // 37. Клик по secondary CTA на лендинге
  landing_secondary_cta_clicked: {
    cta_label: string;
    location: "hero" | "final_cta";
  };

  // 38. Переключение FAQ-вопроса
  faq_toggled: {
    question_id: string;
    state: "open" | "close";
  };

  // ── Welcome page ───────────────────────────────────────────────────
  // 39. Просмотр welcome-экрана
  welcome_view: {
    state: string;
  };

  // 40. Клик по primary CTA на welcome
  welcome_primary_cta_clicked: {
    state: string;
    cta_label: string;
  };

  // 41. Клик по secondary CTA на welcome
  welcome_secondary_cta_clicked: {
    state: string;
    cta_label: string;
  };

  // 42. Клик по quick link на welcome
  welcome_quick_link_clicked: {
    state: string;
    target: string;
    label: string;
  };

  // ── Strategy / Growth ──────────────────────────────────────────────
  // 43. Просмотр strategy-экрана
  strategy_view: {
    role_id: number | null;
    has_plan: boolean;
    readiness_bucket: "none" | "low" | "mid" | "high";
  };

  // 44. Клик по «Следующему шагу» (первая рекомендация)
  strategy_next_step_clicked: {
    item_type: string;
    item_id: number;
    role_id: number | null;
  };

  // 45. Клик по шагу в плане
  strategy_plan_item_clicked: {
    item_type: string;
    item_id: number;
    status: string;
    priority: string;
  };

  // 46. Смена статуса шага плана
  strategy_plan_item_status_changed: {
    item_id: number;
    from_status: string;
    to_status: string;
    item_type: string;
  };

  // 47. Генерация / обновление плана
  strategy_plan_generated: {
    role_id: number | null;
    trigger: "first_time" | "refresh";
  };

  // ── Admin benchmark ────────────────────────────────────────────────
  // 48. Просмотр страницы benchmark
  admin_benchmark_viewed: {
    tab: string;
  };

  // 49. Смена фильтра
  admin_benchmark_filter_changed: {
    tab: string;
    filter_type: string;
    value: string;
  };

  // 50. Раскрытие строки решения
  admin_benchmark_row_expanded: {
    decision_id: number;
    priority: string;
    current_status: string;
  };

  // 51. Смена статуса решения
  admin_benchmark_status_changed: {
    decision_id: number;
    from_status: string;
    to_status: string;
    priority: string;
  };
};

// --- Ядро ---
function sendEvent<K extends keyof AnalyticsEvents>(
  name: K,
  props: AnalyticsEvents[K],
): void {
  if (import.meta.env.DEV) {
    console.debug(`[analytics] ${name}`, props);
  }
  // reachGoal отправляет цель с параметрами в Яндекс Метрику
  window.ym?.(YM_ID, 'reachGoal', name, props as Record<string, unknown>);
}

// --- Публичные хелперы для каждого события ---
export const analytics = {
  visiualsModeSelected(
    mode: "task" | "project_files",
    projectId: number | null,
    presentations: { count: number },
  ) {
    sendEvent("visuals_source_mode_selected", {
      mode,
      project_id: projectId,
      has_presentations: presentations.count > 0,
      presentations_count: presentations.count,
    });
  },

  projectFileCta(
    action: "create_task" | "find_in_tasks",
    projectId: number | null,
    doc: { id: number; file_type: string },
  ) {
    sendEvent("project_file_cta_clicked", {
      action,
      project_id: projectId,
      document_id: doc.id,
      file_type: doc.file_type,
    });
  },

  projectFileLookupResult(
    projectId: number | null,
    documentId: number,
    result: LookupResult,
    matchesCount: number,
    openedTaskId?: number,
    errorCode?: string,
  ) {
    sendEvent("project_file_task_lookup_result", {
      project_id: projectId,
      document_id: documentId,
      result,
      matches_count: matchesCount,
      opened_task_id: openedTaskId,
      error_code: errorCode,
    });
  },

  visualsToggle(
    enabled: boolean,
    taskId: number,
    taskType: string,
    supportsVisuals: boolean,
    reason: VisualsSupportsReason,
  ) {
    sendEvent("task_visuals_toggle_changed", {
      enabled,
      task_id: taskId,
      task_type: taskType,
      supports_visuals: supportsVisuals,
      supports_reason: reason,
    });
  },

  aiImagesToggle(
    enabled: boolean,
    taskId: number,
    taskType: string,
    useVisualsEnabled: boolean,
  ) {
    sendEvent("task_ai_images_toggle_changed", {
      enabled,
      task_id: taskId,
      task_type: taskType,
      use_visuals_enabled: useVisualsEnabled,
    });
  },

  generationSubmitted(
    taskId: number,
    taskType: string,
    useVisuals: boolean,
    allowAiImages: boolean,
    supportsVisuals: boolean,
    isRevision: boolean,
  ) {
    sendEvent("task_generation_submitted", {
      task_id: taskId,
      task_type: taskType,
      use_visuals: useVisuals,
      allow_ai_images: allowAiImages,
      supports_visuals: supportsVisuals,
      is_revision: isRevision,
    });
  },

  generationResult(
    taskId: number,
    taskType: string,
    status: "success" | "error",
    useVisuals: boolean,
    allowAiImages: boolean,
    errorCode?: GenerationErrorCode,
  ) {
    sendEvent("task_generation_result", {
      task_id: taskId,
      task_type: taskType,
      status,
      use_visuals: useVisuals,
      allow_ai_images: allowAiImages,
      error_code: errorCode,
    });
  },

  visualsAvailabilityResolved(
    taskId: number,
    taskType: string,
    supportsVisuals: boolean,
    reason: VisualsSupportsReason,
    hasActiveRun: boolean,
    hasVisualPlan: boolean,
  ) {
    sendEvent("task_visuals_availability_resolved", {
      task_id: taskId,
      task_type: taskType,
      supports_visuals: supportsVisuals,
      reason,
      has_active_run: hasActiveRun,
      has_visual_plan: hasVisualPlan,
    });
  },

  landingCtaClicked(ctaId: string, destination: string) {
    sendEvent("landing_cta_clicked", { cta_id: ctaId, destination });
  },

  guideOpened(source: string) {
    sendEvent("guide_opened", { source });
  },

  guideCtaClicked(ctaId: string, source: string) {
    sendEvent("guide_cta_clicked", { cta_id: ctaId, source });
  },

  projectFilesEmptyState(projectId: number, filesTotalCount: number) {
    sendEvent("project_files_empty_state_shown", {
      project_id: projectId,
      files_count_total: filesTotalCount,
    });
  },

  // ── Public profile ─────────────────────────────────────────────────

  publicProfileSettingsViewed(hasSlug: boolean, isPublished: boolean) {
    sendEvent("public_profile_settings_viewed", {
      has_slug: hasSlug,
      is_published: isPublished,
    });
  },

  publicProfileSlugSaved(slugLength: number) {
    sendEvent("public_profile_slug_saved", { slug_length: slugLength });
  },

  publicProfileSlugCheckFailed() {
    sendEvent("public_profile_slug_check_failed", {});
  },

  publicProfilePublishConfirmOpened(hasSlug: boolean) {
    sendEvent("public_profile_publish_confirm_opened", { has_slug: hasSlug });
  },

  publicProfilePublished() {
    sendEvent("public_profile_published", {});
  },

  publicProfileUnpublishConfirmOpened() {
    sendEvent("public_profile_unpublish_confirm_opened", {});
  },

  publicProfileUnpublished() {
    sendEvent("public_profile_unpublished", {});
  },

  publicProfileCopyLinkClicked(source: "dashboard_card" | "settings_page") {
    sendEvent("public_profile_copy_link_clicked", { source });
  },

  publicProfileCopyLinkSucceeded(
    source: "dashboard_card" | "settings_page",
    copyMethod: "clipboard" | "execCommand",
  ) {
    sendEvent("public_profile_copy_link_succeeded", { source, copy_method: copyMethod });
  },

  publicProfileCopyLinkFailed(source: "dashboard_card" | "settings_page") {
    sendEvent("public_profile_copy_link_failed", { source });
  },

  publicProfileOpenLinkClicked(isPublished: boolean) {
    sendEvent("public_profile_open_link_clicked", {
      source: "settings_page",
      is_published: isPublished,
    });
  },

  dashboardNextStepClicked(stepId: string, stepState: string) {
    sendEvent("dashboard_next_step_clicked", {
      step_id: stepId,
      step_state: stepState,
    });
  },

  // ── Competency map ─────────────────────────────────────────────────

  competencyMapViewed() {
    sendEvent("competency_map_viewed", {});
  },

  competencyMapCompetencyClicked(competencyId: number, competencyName: string) {
    sendEvent("competency_map_competency_clicked", { competency_id: competencyId, competency_name: competencyName });
  },

  competencyMapEvidenceClicked(evidenceId: number) {
    sendEvent("competency_map_evidence_clicked", { evidence_id: evidenceId });
  },

  competencyMapDomainExpanded(domainId: number, expanded: boolean) {
    sendEvent("competency_map_domain_expanded", { domain_id: domainId, expanded });
  },

  competencyMapEmptyCtaClicked(ctaHref: string) {
    sendEvent("competency_map_empty_cta_clicked", { cta_href: ctaHref });
  },

  competencyMapLoaded(
    status: "empty" | "partial" | "ready",
    summary: { total_competencies: number; verified_count: number; domains_covered: number },
  ) {
    sendEvent("competency_map_loaded", {
      status,
      total_competencies: summary.total_competencies,
      verified_count: summary.verified_count,
      domains_covered: summary.domains_covered,
    });
  },

  competencyMapSelfAssessed(competencyId: number, competencyName: string, level: number) {
    sendEvent("competency_map_self_assessed", {
      competency_id: competencyId,
      competency_name: competencyName,
      level,
    });
  },

  competencyMapRecommendationShown(mapStatus: "empty" | "partial" | "ready", recCount: number) {
    sendEvent("competency_map_recommendation_shown", { map_status: mapStatus, rec_count: recCount });
  },

  competencyMapRecommendationClicked(mapStatus: string, recKind: string, recHref: string) {
    sendEvent("competency_map_recommendation_clicked", { map_status: mapStatus, rec_kind: recKind, rec_href: recHref });
  },

  // ── Public profile page ────────────────────────────────────────────

  publicProfileViewed(slug: string) {
    sendEvent("public_profile_viewed", { slug });
  },

  publicProfileProjectClicked(projectId: number) {
    sendEvent("public_profile_project_clicked", { project_id: projectId });
  },

  publicProfileExternalLinkClicked(linkKey: string, linkUrl: string) {
    sendEvent("public_profile_external_link_clicked", { link_key: linkKey, link_url: linkUrl });
  },

  // ── Landing ────────────────────────────────────────────────────────

  landingView(isAuthenticated: boolean, source = "direct") {
    sendEvent("landing_view", { is_authenticated: isAuthenticated, source });
  },

  landingPrimaryCtaClicked(ctaLabel: string, location: "hero" | "final_cta", isAuthenticated: boolean) {
    sendEvent("landing_primary_cta_clicked", { cta_label: ctaLabel, location, is_authenticated: isAuthenticated });
  },

  landingSecondaryCtaClicked(ctaLabel: string, location: "hero" | "final_cta") {
    sendEvent("landing_secondary_cta_clicked", { cta_label: ctaLabel, location });
  },

  faqToggled(questionId: string, state: "open" | "close") {
    sendEvent("faq_toggled", { question_id: questionId, state });
  },

  // ── Welcome ────────────────────────────────────────────────────────

  welcomeView(state: string) {
    sendEvent("welcome_view", { state });
  },

  welcomePrimaryCtaClicked(state: string, ctaLabel: string) {
    sendEvent("welcome_primary_cta_clicked", { state, cta_label: ctaLabel });
  },

  welcomeSecondaryCtaClicked(state: string, ctaLabel: string) {
    sendEvent("welcome_secondary_cta_clicked", { state, cta_label: ctaLabel });
  },

  welcomeQuickLinkClicked(state: string, target: string, label: string) {
    sendEvent("welcome_quick_link_clicked", { state, target, label });
  },

  // ── Strategy / Growth ──────────────────────────────────────────────

  strategyView(roleId: number | null, hasPlan: boolean, fitPct: number | null) {
    const readiness_bucket: "none" | "low" | "mid" | "high" =
      fitPct === null ? "none" :
      fitPct < 30     ? "low"  :
      fitPct < 60     ? "mid"  : "high";
    sendEvent("strategy_view", { role_id: roleId, has_plan: hasPlan, readiness_bucket });
  },

  strategyNextStepClicked(itemType: string, itemId: number, roleId: number | null) {
    sendEvent("strategy_next_step_clicked", { item_type: itemType, item_id: itemId, role_id: roleId });
  },

  strategyPlanItemClicked(itemType: string, itemId: number, status: string, priority: string) {
    sendEvent("strategy_plan_item_clicked", { item_type: itemType, item_id: itemId, status, priority });
  },

  strategyPlanItemStatusChanged(itemId: number, fromStatus: string, toStatus: string, itemType: string) {
    sendEvent("strategy_plan_item_status_changed", {
      item_id: itemId, from_status: fromStatus, to_status: toStatus, item_type: itemType,
    });
  },

  strategyPlanGenerated(roleId: number | null, trigger: "first_time" | "refresh") {
    sendEvent("strategy_plan_generated", { role_id: roleId, trigger });
  },

  // ── Admin benchmark ────────────────────────────────────────────────

  adminBenchmarkViewed(tab: string) {
    sendEvent("admin_benchmark_viewed", { tab });
  },

  adminBenchmarkFilterChanged(tab: string, filterType: string, value: string) {
    sendEvent("admin_benchmark_filter_changed", { tab, filter_type: filterType, value });
  },

  adminBenchmarkRowExpanded(decisionId: number, priority: string, currentStatus: string) {
    sendEvent("admin_benchmark_row_expanded", {
      decision_id: decisionId, priority, current_status: currentStatus,
    });
  },

  adminBenchmarkStatusChanged(decisionId: number, fromStatus: string, toStatus: string, priority: string) {
    sendEvent("admin_benchmark_status_changed", {
      decision_id: decisionId, from_status: fromStatus, to_status: toStatus, priority,
    });
  },
};

// Нормализует сырую строку ошибки → error_code для аналитики
export function normalizeErrorCode(raw: string): GenerationErrorCode {
  if (raw.includes("timeout") || raw.includes("504")) return "timeout";
  if (raw.includes("422") || raw.includes("validation") || raw.includes("Нужен")) return "validation_422";
  if (raw.includes("429") || raw.includes("rate") || raw.includes("лимит")) return "rate_limit_429";
  if (raw.includes("502")) return "gateway_502";
  if (raw.includes("503")) return "unavailable_503";
  if (raw.includes("500")) return "server_500";
  return "unknown";
}