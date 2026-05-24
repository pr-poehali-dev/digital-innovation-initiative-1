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
    document_roles?: { document_id: number; role: string }[];
  }) => request(URLS.tasks, "/", "POST", data),
  get: (id: number) =>
    request(URLS.tasks, "/", "POST", { action: "get_task", task_id: id }),
  updateDocuments: (taskId: number, documentRoles: { document_id: number; role: string }[]) =>
    request(URLS.tasks, "/", "POST", { action: "update_task_documents", task_id: taskId, document_roles: documentRoles }),
};

export const generateApi = {
  run: (taskId: number, prompt?: string, revisionOf?: number, useWebSearch = false) =>
    request(URLS.generate, "/", "POST", { task_id: taskId, prompt, revision_of: revisionOf, use_web_search: useWebSearch }),
  getRun: (runId: number) =>
    request(URLS.generate, "/", "POST", { action: "get_run", run_id: runId }),
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