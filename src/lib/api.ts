const URLS = {
  auth: "https://functions.poehali.dev/be0bd4a6-9b46-46f0-ae8e-bee273a46b38",
  globalSearch: "https://functions.poehali.dev/9a05cfc9-9a18-4ac0-8dfb-02924fe1b7b1",
  searchIndexer: "https://functions.poehali.dev/a671ae90-49e6-47a9-889e-ffe10ff53191",
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
  wallet: "https://functions.poehali.dev/72142b3b-2b3e-4f59-9d16-7008e7cea33d",
  adminUsers: "https://functions.poehali.dev/8a915c0f-1259-4816-a8e3-14280bdb94ae",
  adminProjects: "https://functions.poehali.dev/31ce72f9-002e-4250-8da4-614aebf97e54",
  adminAudit: "https://functions.poehali.dev/f647adda-565a-4846-9b28-4462ebcf2ade",
  adminActivity: "https://functions.poehali.dev/c3350df2-e2f0-424c-acc4-036e65286249",
  learning: "https://functions.poehali.dev/e328c6f8-e450-4345-a38d-bc8e77e742e1",
  workspace: "https://functions.poehali.dev/6524fd83-ede7-4d1c-9424-8e67293d2495",
  goals: "https://functions.poehali.dev/97ab26dc-af56-4172-abc5-579979e30b01",
  learningPack: "https://functions.poehali.dev/8ad151d1-d688-49c2-822a-5f5d366a8b3b",
  deptFunctions: "https://functions.poehali.dev/7e9accad-43d6-44e2-b388-14d15b7a8153",
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
    const trace = data?.detail?.trace_id ? ` [${data.detail.trace_id}]` : "";
    const stage = data?.detail?.stage ? ` (${data.detail.stage})` : "";
    const msg = data?.error?.message || data?.error || "Ошибка запроса";
    throw new Error(`${msg}${stage}${trace}`);
  }
  // Новый формат v1: {ok, data?, error?, request_id, ...}
  if (data && typeof data === "object" && data !== null && Object.prototype.hasOwnProperty.call(data, "ok")) {
    if (data.ok === false) {
      const trace = data?.detail?.trace_id ? ` [${data.detail.trace_id}]` : "";
      const stage = data?.detail?.stage ? ` (${data.detail.stage})` : "";
      const errMsg = (data.error && data.error.message) || data.error || "Ошибка";
      throw new Error(`${errMsg}${stage}${trace}`);
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

export async function uploadDocumentChunked(
  projectId: number,
  file: File,
  category: string,
  onProgress?: (pct: number) => void,
): Promise<{ id: number; filename: string; file_type: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const CHUNK_SIZE = 512 * 1024; // 512 KB
  onProgress?.(5);

  // Шаг 1: инициализация
  const init = await request(URLS.documents, "/", "POST", {
    action: "document.upload_init",
    project_id: projectId,
    filename: file.name,
    file_type: ext,
    total_size: file.size,
  }) as { session_id: string; s3_key: string };

  const { session_id, s3_key } = init;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Шаг 2: отправляем чанки
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkB64 = await readChunkAsBase64(file, start, end);
    await request(URLS.documents, "/", "POST", {
      action: "document.upload_chunk",
      session_id,
      s3_key,
      chunk_b64: chunkB64,
      chunk_index: i,
    });
    onProgress?.(10 + Math.round(((i + 1) / totalChunks) * 80));
  }

  // Шаг 3: завершаем — сервер склеивает, извлекает текст, сохраняет в БД
  const result = await request(URLS.documents, "/", "POST", {
    action: "document.upload_complete",
    project_id: projectId,
    session_id,
    s3_key,
    filename: file.name,
    file_type: ext,
    total_chunks: totalChunks,
    category,
  }) as { id: number; filename: string; file_type: string };

  onProgress?.(100);
  return result;
}

export const documentsApi = {
  list: (projectId: number) =>
    request(URLS.documents, "/", "POST", { action: "list_documents", project_id: projectId }),
  upload: (projectId: number, filename: string, fileType: string, fileData: string, category = "other") =>
    request(URLS.documents, "/", "POST", { project_id: projectId, filename, file_type: fileType, file_data: fileData, category }),
  getUploadUrl: (projectId: number, filename: string, fileType: string) =>
    request(URLS.documents, "/", "POST", { action: "document.get_upload_url", project_id: projectId, filename, file_type: fileType }),
  confirmUpload: (projectId: number, s3Key: string, filename: string, fileType: string, fileSize: number, category: string) =>
    request(URLS.documents, "/", "POST", { action: "document.confirm_upload", project_id: projectId, s3_key: s3Key, filename, file_type: fileType, file_size: fileSize, category }),
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
  deleteFile: (fileId: number) =>
    request(URLS.education, "/", "POST", { action: "education.delete_file", file_id: fileId }),
  analyze: (id: number) =>
    request(URLS.education, "/", "POST", { action: "education.analyze", id }),
  confirm: (id: number, overrides?: Record<string, unknown>) =>
    request(URLS.education, "/", "POST", { action: "education.confirm", id, overrides }),
  profileSummary: () =>
    request(URLS.education, "/", "POST", { action: "education.profile_summary" }),
};

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// Читает кусок файла как base64-строку (без data: префикса)
function readChunkAsBase64(file: File, start: number, end: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(start, end);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(slice);
  });
}

// Чанковая загрузка PPTX через бэкенд — куски по 512KB, без проблем с лимитом тела
export async function uploadPptxDirect(
  projectId: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const MAX_BYTES = 200 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error(`Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)} МБ. Максимум — 200 МБ`);
  if (!file.name.toLowerCase().endsWith(".pptx")) throw new Error("Поддерживается только формат PPTX (.pptx)");

  const CHUNK_SIZE = 512 * 1024; // 512 KB

  onProgress?.(5);

  // Шаг 1: инициализируем сессию
  const init = await request(URLS.audit, "/", "POST", {
    action: "audit.upload_init",
    project_id: projectId,
    filename: file.name,
    total_size: file.size,
  }) as { session_id: string };

  const sessionId = init.session_id;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  // Шаг 2: отправляем чанки
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkB64 = await readChunkAsBase64(file, start, end);

    await request(URLS.audit, "/", "POST", {
      action: "audit.upload_chunk",
      session_id: sessionId,
      chunk_index: i,
      chunk_b64: chunkB64,
    });

    const pct = 10 + Math.round(((i + 1) / totalChunks) * 80);
    onProgress?.(pct);
  }

  // Шаг 3: завершаем загрузку (бэкенд склеивает чанки)
  const complete = await request(URLS.audit, "/", "POST", {
    action: "audit.upload_complete",
    session_id: sessionId,
    total_chunks: totalChunks,
  }) as { upload_id: string };

  onProgress?.(100);
  return complete.upload_id;
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

  downloadRevised: (auditId: number) =>
    request(URLS.audit, "/", "POST", { action: "audit.download_revised", audit_id: auditId }),

  getRevisionStatus: (auditId: number) =>
    request(URLS.audit, "/", "POST", { action: "audit.get_revision_status", audit_id: auditId }),

  runReaudit: (auditId: number, documents: { document_id: number; role: string; instruction?: string }[]) =>
    request(URLS.audit, "/", "POST", { action: "audit.run_reaudit", audit_id: auditId, documents }),

  exportReport: (auditId: number) =>
    request(URLS.exportDocx, "/", "POST", { action: "audit_report", audit_id: auditId }),
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

const CHUNK_SIZE = 512 * 1024; // 512 KB — безопасно до лимита 1 МБ

function detectMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", heic: "image/heic", webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

export async function uploadEducationFile(itemId: number, file: File): Promise<{ warning?: string; extracted?: Record<string, unknown>; parse_status?: string }> {
  const mime = detectMime(file);
  if (file.size <= CHUNK_SIZE) {
    const fileData = await fileToBase64(file);
    return educationApi.uploadFile(itemId, file.name, mime, fileData);
  }
  const { upload_session_id } = await request(URLS.education, "/", "POST", {
    action: "education.upload_init",
    id: itemId,
    filename: file.name,
    mime,
  }) as { upload_session_id: string };

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkB64 = await readChunkAsBase64(file, start, end);
    await request(URLS.education, "/", "POST", {
      action: "education.upload_chunk",
      upload_session_id,
      chunk_index: i,
      chunk_b64: chunkB64,
    });
  }

  return request(URLS.education, "/", "POST", {
    action: "education.upload_complete",
    upload_session_id,
    total_chunks: totalChunks,
  }) as Promise<{ warning?: string }>;
}

export const learningPackApi = {
  generate: (milestone_id: number, goal_id: number) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.generate", milestone_id, goal_id }),
  list: (milestone_id: number) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.list", milestone_id }),
  reader: (material_id: number) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.reader", material_id }),
  summarize: (material_id: number, milestone_id: number) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.summarize", material_id, milestone_id }),
  progress: (material_id: number, milestone_id: number, status: string) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.progress", material_id, milestone_id, status }),
  status: (milestone_id: number) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.status", milestone_id }),
  readingList: (milestone_id: number, goal_id: number) =>
    request(URLS.learningPack, "/", "POST", { action: "lp.reading_list", milestone_id, goal_id }),
};

export const goalsApi = {
  list: (status?: string) =>
    request(URLS.goals, "/", "POST", { action: "goals.list", status }),
  get: (id: number) =>
    request(URLS.goals, "/", "POST", { action: "goals.get", id }),
  create: (data: Record<string, unknown>) =>
    request(URLS.goals, "/", "POST", { action: "goals.create", ...data }),
  update: (id: number, fields: Record<string, unknown>) =>
    request(URLS.goals, "/", "POST", { action: "goals.update", id, ...fields }),
  archive: (id: number) =>
    request(URLS.goals, "/", "POST", { action: "goals.archive", id }),
  analyze: (id: number) =>
    request(URLS.goals, "/", "POST", { action: "goals.analyze", id }),
  generatePath: (id: number) =>
    request(URLS.goals, "/", "POST", { action: "goals.generate_path", id }),
  updateMilestone: (id: number, status: string) =>
    request(URLS.goals, "/", "POST", { action: "goals.update_milestone", id, status }),
};

export const walletApi = {
  getBalance: () =>
    request(URLS.wallet, "/", "POST", { action: "wallet.get_balance" }),
  getTransactions: (limit = 20, offset = 0) =>
    request(URLS.wallet, "/", "POST", { action: "wallet.get_transactions", limit, offset }),
  createTopup: (amount_rub: number) =>
    request(URLS.wallet, "/", "POST", { action: "wallet.create_topup", amount_rub }),
  getPaymentStatus: (payment_id: number) =>
    request(URLS.wallet, "/", "POST", { action: "wallet.get_payment_status", payment_id }),
};

export const TOPIC_STATUSES = [
  { value: "not_started", label: "Не начато",           color: "text-slate-400",  bg: "bg-slate-100",      dot: "bg-slate-400"   },
  { value: "studying",    label: "Изучаю",               color: "text-blue-600",   bg: "bg-blue-50",        dot: "bg-blue-500"    },
  { value: "understood",  label: "Понимаю концептуально", color: "text-violet-600", bg: "bg-violet-50",      dot: "bg-violet-500"  },
  { value: "applied",     label: "Могу применить",        color: "text-emerald-600",bg: "bg-emerald-50",     dot: "bg-emerald-500" },
] as const;

export type TopicStatus = typeof TOPIC_STATUSES[number]["value"];

export const learningApi = {
  getGoals: () => request(URLS.learning, "/?action=goals", "GET"),
  createGoal: (title: string, description?: string) =>
    request(URLS.learning, "/?action=create_goal", "POST", { title, description }),
  updateGoal: (goal_id: number, fields: { title?: string; description?: string; status?: string }) =>
    request(URLS.learning, "/?action=update_goal", "PUT", { goal_id, ...fields }),
  generatePlan: (title: string, description: string, goal_id?: number) =>
    request(URLS.learning, "/?action=generate_plan", "POST", { title, description, goal_id }),
  getTopics: (goal_id: number) => request(URLS.learning, `/?action=topics&goal_id=${goal_id}`, "GET"),
  updateTopic: (topic_id: number, status: TopicStatus) =>
    request(URLS.learning, "/?action=update_topic", "PUT", { topic_id, status }),
  getNotes: (goal_id?: number, topic_id?: number) => {
    const qs = topic_id ? `&topic_id=${topic_id}` : goal_id ? `&goal_id=${goal_id}` : "";
    return request(URLS.learning, `/?action=notes${qs}`, "GET");
  },
  addNote: (data: { content: string; kind?: string; title?: string; url?: string; goal_id?: number; topic_id?: number }) =>
    request(URLS.learning, "/?action=add_note", "POST", data),
  askAi: (question: string, goal_title: string, topic_title?: string) =>
    request(URLS.learning, "/?action=ask_ai", "POST", { question, goal_title, topic_title }),
  getProgress: (goal_id: number) => request(URLS.learning, `/?action=progress&goal_id=${goal_id}`, "GET"),
  setStartDate: (goal_id: number, start_date: string) =>
    request(URLS.learning, "/?action=set_start_date", "PUT", { goal_id, start_date }),
  saveCheckin: (data: { goal_id: number; goal_title: string; learned: string; clearer_now: string; gaps: string; next_focus: string }) =>
    request(URLS.learning, "/?action=save_checkin", "POST", data),
  getCheckins: (goal_id: number) => request(URLS.learning, `/?action=checkins&goal_id=${goal_id}`, "GET"),
  topicLearn: (data: { topic_id?: number; topic_title: string; goal_title?: string; mode: "full" | "explain" | "materials" | "quiz" | "session"; minutes?: number }) =>
    request(URLS.learning, "/?action=topic_learn", "POST", data),
  saveQuizResult: (data: { goal_id: number; topic_id: number; quiz_payload: unknown[]; user_answers: Record<string, number>; duration_sec?: number }) =>
    request(URLS.learning, "/?action=save_quiz_result", "POST", data),
  getTopicMemory: (goal_id: number, topic_id: number) =>
    request(URLS.learning, `/?action=topic_memory&goal_id=${goal_id}&topic_id=${topic_id}`, "GET"),
  getReviewTopics: (goal_id: number) =>
    request(URLS.learning, `/?action=review_topics&goal_id=${goal_id}`, "GET"),
};

export const workspaceApi = {
  getContext: (projectId: number) =>
    request(URLS.workspace, `/?action=context&project_id=${projectId}`, "GET"),
  updateContext: (projectId: number, data: { goals_text?: string; constraints_text?: string; key_facts_text?: string; stakeholders_text?: string }) =>
    request(URLS.workspace, "/?action=context", "PUT", { project_id: projectId, ...data }),
  getHypotheses: (projectId: number) =>
    request(URLS.workspace, `/?action=hypotheses&project_id=${projectId}`, "GET"),
  createHypothesis: (data: { project_id: number; title: string; statement?: string; assumptions?: string; success_criteria?: string; priority?: string }) =>
    request(URLS.workspace, "/?action=create_hypothesis", "POST", data),
  updateHypothesis: (data: { id: number; title?: string; statement?: string; assumptions?: string; success_criteria?: string; status?: string; conclusion?: string; priority?: string }) =>
    request(URLS.workspace, "/?action=update_hypothesis", "PUT", data),
  getArtifacts: (projectId: number) =>
    request(URLS.workspace, `/?action=artifacts&project_id=${projectId}`, "GET"),
  getArtifact: (id: number) =>
    request(URLS.workspace, `/?action=artifact&id=${id}`, "GET"),
  getAiRuns: (projectId: number) =>
    request(URLS.workspace, `/?action=ai_runs&project_id=${projectId}`, "GET"),
  copilot: (data: { project_id: number; message: string; mode?: string; save_as_artifact?: boolean; artifact_title?: string; artifact_type?: string }) =>
    request(URLS.workspace, "/?action=copilot", "POST", data),
  // ── Transformation Workbench ──────────────────────────────────────
  getProcesses: (projectId: number) =>
    request(URLS.workspace, `/?action=processes&project_id=${projectId}`, "GET"),
  createProcess: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=processes", "POST", data),
  updateProcess: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=processes", "PUT", data),
  createProcessStep: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=process_steps", "POST", data),
  updateProcessStep: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=process_steps", "PUT", data),
  getPainPoints: (projectId: number) =>
    request(URLS.workspace, `/?action=pain_points&project_id=${projectId}`, "GET"),
  createPainPoint: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=pain_points", "POST", data),
  updatePainPoint: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=pain_points", "PUT", data),
  getBenchmarks: (projectId: number) =>
    request(URLS.workspace, `/?action=benchmarks&project_id=${projectId}`, "GET"),
  createBenchmark: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=benchmarks", "POST", data),
  updateBenchmark: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=benchmarks", "PUT", data),
  getAiOpportunities: (projectId: number) =>
    request(URLS.workspace, `/?action=ai_opportunities&project_id=${projectId}`, "GET"),
  createAiOpportunity: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=ai_opportunities", "POST", data),
  updateAiOpportunity: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=ai_opportunities", "PUT", data),
  aiAnalyze: (projectId: number) =>
    request(URLS.workspace, "/?action=ai_analyze", "POST", { project_id: projectId }),
  aiStatus: (projectId: number) =>
    request(URLS.workspace, `/?action=ai_status&project_id=${projectId}`, "GET"),
  aiAssess: (projectId: number, processDescription: string) =>
    request(URLS.workspace, "/?action=ai_assess", "POST", { project_id: projectId, process_description: processDescription }),
  aiExtractPains: (projectId: number, text: string) =>
    request(URLS.workspace, "/?action=ai_extract_pains", "POST", { project_id: projectId, text }),
  getInitiatives: (projectId: number) =>
    request(URLS.workspace, `/?action=initiatives&project_id=${projectId}`, "GET"),
  createInitiative: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=initiatives", "POST", data),
  updateInitiative: (data: Record<string, unknown>) =>
    request(URLS.workspace, "/?action=initiatives", "PUT", data),
};

export const deptFunctionsApi = {
  getFunctions: (projectId: number) =>
    request(URLS.deptFunctions, `/?action=functions&project_id=${projectId}`, "GET"),
  createFunction: (data: Record<string, unknown>) =>
    request(URLS.deptFunctions, "/?action=create_function", "POST", data),
  updateFunction: (data: Record<string, unknown>) =>
    request(URLS.deptFunctions, "/?action=update_function", "PUT", data),
  extractFunctions: (data: { project_id: number; image_b64: string; dept_name?: string }) =>
    request(URLS.deptFunctions, "/?action=extract_functions", "POST", data),
  getAutomation: (projectId: number) =>
    request(URLS.deptFunctions, `/?action=automation&project_id=${projectId}`, "GET"),
  updateAutomation: (data: Record<string, unknown>) =>
    request(URLS.deptFunctions, "/?action=update_automation", "PUT", data),
  aiRecommend: (data: { project_id: number; function_id: number }) =>
    request(URLS.deptFunctions, "/?action=ai_recommend", "POST", data),
};