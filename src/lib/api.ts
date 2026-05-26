const URLS = {
  auth: "https://functions.poehali.dev/be0bd4a6-9b46-46f0-ae8e-bee273a46b38",
  projects: "https://functions.poehali.dev/d439f270-aaa6-4a75-9c30-6ef538ff5bdd",
  documents: "https://functions.poehali.dev/94029017-e75a-4ce2-a3b7-17adc33fa8a1",
  tasks: "https://functions.poehali.dev/363a1c77-0e9a-41a6-a862-b1cf2a632688",
  generate: "https://functions.poehali.dev/90160450-b2a6-44cd-8e78-089f457c619d",
  export: "https://functions.poehali.dev/9d47e96e-4b93-40c5-9d52-d87273385119",
  exportDocx: "https://functions.poehali.dev/e4caace1-0466-484f-907e-9e141db67523",
  webSearch: "https://functions.poehali.dev/d68c20bc-5049-4096-a8bb-ae7a7f5afe57",
  search: "https://functions.poehali.dev/54999e08-24f7-478d-92d8-8d66785f0a00",
  mediaUpload: "https://functions.poehali.dev/c3f6a32b-87f2-4ebb-8954-ccbae46e81a3",
  education: "https://functions.poehali.dev/54faac64-7c7d-43d5-8590-e64e08067d56",
  audit: "https://functions.poehali.dev/0ac33ef6-6473-4be1-a1e6-a9565e6289a7",
};

function getSession(): string {
  return localStorage.getItem("session_id") || "";
}

async function request(base: string, path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sid = getSession();
  if (sid) headers["X-Session-Id"] = sid;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || "Ошибка запроса";
    throw new Error(msg);
  }
  // Новый формат v1: {ok, data?, error?, request_id, ...}
  if (data && typeof data === "object" && data !== null && Object.prototype.hasOwnProperty.call(data, "ok")) {
    if (data.ok === false) {
      const errMsg = (data.error && data.error.message) || "Ошибка";
      throw new Error(errMsg);
    }
    // Если есть поле data — возвращаем его (полный v1 контракт, как projects)
    if (Object.prototype.hasOwnProperty.call(data, "data")) {
      return data.data;
    }
    // Иначе — обратная совместимость: копируем всё кроме служебных полей
    const result: Record<string, unknown> = {};
    for (const key in data) {
      if (key !== "ok" && key !== "request_id" && Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = data[key];
      }
    }
    return result;
  }
  return data;
}

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request(URLS.auth, "/", "POST", { action: "register", email, password, name }),
  login: (email: string, password: string) =>
    request(URLS.auth, "/", "POST", { action: "login", email, password }),
  logout: () => request(URLS.auth, "/", "POST", { action: "logout" }),
  me: () => request(URLS.auth, "/", "GET"),
  resetPassword: (email: string) =>
    request(URLS.auth, "/", "POST", { action: "reset_password", email }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request(URLS.auth, "/", "POST", { action: "change_password", old_password: oldPassword, new_password: newPassword }),
};

export const projectsApi = {
  // v1 API: единый action namespace
  list: () => request(URLS.projects, "/", "POST", { action: "project.list" }),
  create: (title: string, description?: string) =>
    request(URLS.projects, "/", "POST", { action: "project.create", title, description }),
  get: (id: number) =>
    request(URLS.projects, "/", "POST", { action: "project.get", project_id: id }),
  update: (id: number, title: string, description?: string) =>
    request(URLS.projects, "/", "POST", { action: "project.update", project_id: id, title, description }),
  archive: (id: number) =>
    request(URLS.projects, "/", "POST", { action: "project.archive", project_id: id }),
  restore: (id: number) =>
    request(URLS.projects, "/", "POST", { action: "project.restore", project_id: id }),
  invite: (projectId: number, email: string) =>
    request(URLS.projects, "/", "POST", { action: "project.invite", project_id: projectId, email }),
};

export const documentsApi = {
  list: (projectId: number) =>
    request(URLS.documents, "/", "POST", { action: "list_documents", project_id: projectId }),
  upload: (projectId: number, filename: string, fileType: string, fileData: string, category = "other") =>
    request(URLS.documents, "/", "POST", { project_id: projectId, filename, file_type: fileType, file_data: fileData, category }),
  getText: (docId: number) =>
    request(URLS.documents, "/", "POST", { action: "get_text", document_id: docId }),
  setCategory: (docId: number, category: string) =>
    request(URLS.documents, "/", "POST", { action: "set_category", document_id: docId, category }),
  getUrl: (docId: number) =>
    request(URLS.documents, "/", "POST", { action: "document.get_url", document_id: docId }),
  delete: (docId: number) =>
    request(URLS.documents, "/", "POST", { action: "document.delete", document_id: docId }),
  rename: (docId: number, newName: string) =>
    request(URLS.documents, "/", "POST", { action: "document.rename", document_id: docId, new_name: newName }),
};

export const tasksApi = {
  list: (projectId: number) =>
    request(URLS.tasks, "/", "POST", { action: "list_tasks", project_id: projectId }),
  create: (data: {
    project_id: number;
    title: string;
    task_type: string;
    topic?: string;
    goal?: string;
    audience?: string;
    language?: string;
    style?: string;
    requested_slide_count?: number;
    additional_instructions?: string;
    document_roles?: {
      document_id: number;
      role: string;
      usage_mode?: string;
      priority?: string;
      must_use?: boolean;
      instruction?: string;
    }[];
  }) => request(URLS.tasks, "/", "POST", data),
  get: (id: number) =>
    request(URLS.tasks, "/", "POST", { action: "get_task", task_id: id }),
  updateDocuments: (taskId: number, documentRoles: { document_id: number; role: string }[]) =>
    request(URLS.tasks, "/", "POST", { action: "update_task_documents", task_id: taskId, document_roles: documentRoles }),
  updateSettings: (taskId: number, fields: {
    title?: string; topic?: string; goal?: string; audience?: string;
    style?: string; requested_slide_count?: number;
    additional_instructions?: string; style_preset?: string;
  }) => request(URLS.tasks, "/", "POST", { action: "update_task_settings", task_id: taskId, ...fields }),
  setDocRole: (taskId: number, documentId: number, fields: {
    role: string; usage_mode?: string; priority?: string;
    must_use?: boolean; instruction?: string;
  }) => request(URLS.tasks, "/", "POST", { action: "set_doc_role", task_id: taskId, document_id: documentId, ...fields }),
  attachDocument: (taskId: number, documentId: number, role: string, instruction?: string) =>
    request(URLS.tasks, "/", "POST", { action: "attach_document", task_id: taskId, document_id: documentId, role, instruction }),
  detachDocument: (taskId: number, documentId: number) =>
    request(URLS.tasks, "/", "POST", { action: "detach_document", task_id: taskId, document_id: documentId }),
  listProjectDocuments: (taskId: number) =>
    request(URLS.tasks, "/", "POST", { action: "list_project_documents", task_id: taskId }),
};

export const generateApi = {
  run: (taskId: number, prompt?: string, revisionOf?: number, useWebSearch = false,
        useVisuals = true, allowAiImages = true) =>
    request(URLS.generate, "/", "POST", {
      task_id: taskId, prompt, revision_of: revisionOf,
      use_web_search: useWebSearch,
      use_visuals: useVisuals,
      allow_ai_images: allowAiImages,
    }),
  getRun: (runId: number) =>
    request(URLS.generate, "/", "POST", { action: "get_run", run_id: runId }),
  explainBlock: (runId: number, blockText: string) =>
    request(URLS.generate, "/", "POST", { action: "explain_block", run_id: runId, block_text: blockText }),
  refineBlock: (runId: number, blockText: string, instruction: string) =>
    request(URLS.generate, "/", "POST", { action: "refine_block", run_id: runId, block_text: blockText, instruction }),
  renderVisual: (runId: number, slideIndex: number, prompt?: string) =>
    request(URLS.generate, "/", "POST", { action: "render_visual", run_id: runId, slide_index: slideIndex, prompt }),
  getVisualUploadUrl: (runId: number, slideIndex: number, filename: string, mime: string) =>
    request(URLS.generate, "/", "POST", { action: "visual.get_upload_url", run_id: runId, slide_index: slideIndex, filename, mime }),
  confirmVisualOverride: (runId: number, slideIndex: number, s3Key: string, mime: string, filename: string) =>
    request(URLS.generate, "/", "POST", { action: "visual.confirm_override", run_id: runId, slide_index: slideIndex, s3_key: s3Key, mime, filename }),
  restoreAiVisual: (runId: number, slideIndex: number) =>
    request(URLS.generate, "/", "POST", { action: "visual.restore_ai", run_id: runId, slide_index: slideIndex }),
};

export const exportApi = {
  exportPptx: (runId: number) =>
    request(URLS.export, "/", "POST", { run_id: runId }),
  exportDocx: (runId: number) =>
    request(URLS.exportDocx, "/", "POST", { run_id: runId }),
};

export const webSearchApi = {
  search: (query: string, taskId?: number) =>
    request(URLS.webSearch, "/", "POST", { query, task_id: taskId }),
};

export const searchApi = {
  searchKnowledge: (projectId: number, query: string) =>
    request(URLS.search, "/", "POST", { action: "search_knowledge", project_id: projectId, query }),
  chatWithDocument: (documentId: number, question: string) =>
    request(URLS.search, "/", "POST", { action: "chat_with_document", document_id: documentId, question }),
  getChatHistory: (documentId: number) =>
    request(URLS.search, "/", "POST", { action: "get_chat_history", document_id: documentId }),
};

export const mediaApi = {
  upload: (projectId: number, filename: string, fileData: string, mediaType: "image" | "audio", category = "notes") =>
    request(URLS.mediaUpload, "/", "POST", {
      project_id: projectId, filename, file_data: fileData, media_type: mediaType, category,
    }),
};

export const educationApi = {
  list: (kindFilter?: string, statusFilter?: string) =>
    request(URLS.education, "/", "POST", {
      action: "education.list",
      kind_filter: kindFilter, status_filter: statusFilter,
    }),
  get: (id: number) =>
    request(URLS.education, "/", "POST", { action: "education.get", id }),
  create: (data: Record<string, unknown>) =>
    request(URLS.education, "/", "POST", { action: "education.create", ...data }),
  update: (id: number, fields: Record<string, unknown>) =>
    request(URLS.education, "/", "POST", { action: "education.update", id, ...fields }),
  archive: (id: number) =>
    request(URLS.education, "/", "POST", { action: "education.archive", id }),
  uploadFile: (id: number, filename: string, mime: string, fileData: string) =>
    request(URLS.education, "/", "POST", {
      action: "education.upload_file", id, filename, mime, file_data: fileData,
    }),
  getUploadUrl: (id: number, filename: string, mime: string) =>
    request(URLS.education, "/", "POST", { action: "education.get_upload_url", id, filename, mime }),
  fileReady: (id: number, filename: string, mime: string, s3Key: string, fileSize: number) =>
    request(URLS.education, "/", "POST", { action: "education.file_ready", id, filename, mime, s3_key: s3Key, file_size: fileSize }),
  getFileUrl: (fileId: number) =>
    request(URLS.education, "/", "POST", { action: "education.get_file_url", file_id: fileId }),
  analyze: (id: number) =>
    request(URLS.education, "/", "POST", { action: "education.analyze", id }),
  confirm: (id: number, overrides?: Record<string, unknown>) =>
    request(URLS.education, "/", "POST", { action: "education.confirm", id, overrides }),
  profileSummary: () =>
    request(URLS.education, "/", "POST", { action: "education.profile_summary" }),
};

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// Прямая загрузка PPTX в S3 через presigned PUT URL (без base64, без чанков)
export async function uploadPptxDirect(
  projectId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error(`Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)} МБ. Максимум — 50 МБ`);
  if (!file.name.toLowerCase().endsWith(".pptx")) throw new Error("Поддерживается только формат PPTX (.pptx)");

  // Шаг 1: получаем presigned PUT URL от бэкенда
  onProgress?.(5);
  const prep = await request(URLS.audit, "/", "POST", {
    action: "audit.prepare_upload",
    project_id: projectId,
    filename: file.name,
    size_bytes: file.size,
  }) as { upload_id: string; upload_url: string; content_type: string };

  // Шаг 2: грузим файл напрямую в S3 через PUT
  onProgress?.(15);
  const putRes = await fetch(prep.upload_url, {
    method: "PUT",
    headers: { "Content-Type": prep.content_type || PPTX_MIME },
    body: file,
  });

  if (!putRes.ok) {
    let bodyText = "";
    try { bodyText = await putRes.text(); } catch (_e) { /* ignore */ }
    console.error("[upload] PUT failed", putRes.status, putRes.statusText, bodyText, "url=", prep.upload_url.slice(0, 80));
    throw new Error(`Ошибка загрузки в хранилище: ${putRes.status} ${putRes.statusText}${bodyText ? " — " + bodyText.slice(0, 200) : ""}`);
  }
  console.log("[upload] PUT ok", putRes.status, "upload_id=", prep.upload_id);

  onProgress?.(100);
  return prep.upload_id;
}

// Обратная совместимость — фронт вызывает uploadPptxChunked, перенаправляем на новую функцию
export async function uploadPptxChunked(
  projectId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return uploadPptxDirect(projectId, file, onProgress);
}

export const auditApi = {
  setupCors: (token: string) =>
    request(URLS.audit, "/", "POST", { action: "audit.setup_cors", token }),

  run: (projectId: number, uploadId: string, documents: { document_id: number; role: string; instruction?: string }[]) =>
    request(URLS.audit, "/", "POST", { action: "audit.run", project_id: projectId, upload_id: uploadId, documents }),

  get: (auditId: number) =>
    request(URLS.audit, "/", "POST", { action: "audit.get", audit_id: auditId }),
  list: (projectId: number) =>
    request(URLS.audit, "/", "POST", { action: "audit.list", project_id: projectId }),

  buildRevisionPlan: (
    auditId: number,
    options: {
      severity_filter?: string[];
      exclude_low_confidence?: boolean;
      revision_mode?: string;
      keep_slide_count?: boolean;
      allow_add_slides?: boolean;
      keep_visuals?: boolean;
    },
  ) => request(URLS.audit, "/", "POST", { action: "audit.build_revision_plan", audit_id: auditId, options }),

  createRevisionRun: (
    auditId: number,
    documents: { document_id: number; role: string; instruction?: string }[],
    taskId?: number,
    confirmedPlanItems?: string[],
  ) => request(URLS.audit, "/", "POST", {
    action: "audit.create_revision_run",
    audit_id: auditId,
    documents,
    task_id: taskId,
    confirmed_plan_items: confirmedPlanItems,
  }),

  getRevisionStatus: (auditId: number) =>
    request(URLS.audit, "/", "POST", { action: "audit.get_revision_status", audit_id: auditId }),

  runReaudit: (auditId: number, documents: { document_id: number; role: string; instruction?: string }[]) =>
    request(URLS.audit, "/", "POST", { action: "audit.run_reaudit", audit_id: auditId, documents }),
};

export function downloadBase64File(base64Data: string, filename: string, mimeType: string) {
  const byteChars = atob(base64Data);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function putFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const mime = file.type || "application/octet-stream";
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status} ${res.statusText}`);
}

export async function uploadFileViaPresigned(
  file: File,
  getUploadUrlFn: (filename: string, mime: string) => Promise<{ upload_url: string; s3_key: string }>,
): Promise<{ s3_key: string; file_size: number }> {
  const mime = file.type || "application/octet-stream";
  const { upload_url, s3_key } = await getUploadUrlFn(file.name, mime);
  const res = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!res.ok) throw new Error(`Ошибка загрузки файла: ${res.status} ${res.statusText}`);
  return { s3_key, file_size: file.size };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}