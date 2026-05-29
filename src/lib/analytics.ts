// Продуктовая аналитика — лёгкий хелпер
// Провайдер: PostHog (инициализирован в main.tsx).
// Для смены провайдера — замени тело sendEvent, интерфейсы не трогать.
import posthog from 'posthog-js';

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
};

// --- Ядро ---
function sendEvent<K extends keyof AnalyticsEvents>(
  name: K,
  props: AnalyticsEvents[K],
): void {
  if (import.meta.env.DEV) {
    console.debug(`[analytics] ${name}`, props);
  }
  posthog.capture(name, props);
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

  projectFilesEmptyState(projectId: number, filesTotalCount: number) {
    sendEvent("project_files_empty_state_shown", {
      project_id: projectId,
      files_count_total: filesTotalCount,
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