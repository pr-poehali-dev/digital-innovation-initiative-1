const URLS = {
  auth: "https://functions.poehali.dev/be0bd4a6-9b46-46f0-ae8e-bee273a46b38",
  projects: "https://functions.poehali.dev/d439f270-aaa6-4a75-9c30-6ef538ff5bdd",
  documents: "https://functions.poehali.dev/94029017-e75a-4ce2-a3b7-17adc33fa8a1",
  tasks: "https://functions.poehali.dev/363a1c77-0e9a-41a6-a862-b1cf2a632688",
  generate: "https://functions.poehali.dev/90160450-b2a6-44cd-8e78-089f457c619d",
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
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request(URLS.auth, "/", "POST", { action: "register", email, password, name }),
  login: (email: string, password: string) =>
    request(URLS.auth, "/", "POST", { action: "login", email, password }),
  logout: () => request(URLS.auth, "/", "POST", { action: "logout" }),
  me: () => request(URLS.auth, "/", "GET"),
};

export const projectsApi = {
  list: () => request(URLS.projects, "/"),
  create: (title: string, description?: string) =>
    request(URLS.projects, "/", "POST", { title, description }),
  get: (id: number) => request(URLS.projects, `/${id}`),
  update: (id: number, title: string, description?: string) =>
    request(URLS.projects, `/${id}`, "PUT", { title, description }),
  invite: (projectId: number, email: string) =>
    request(URLS.projects, `/${projectId}/invite`, "POST", { email }),
};

export const documentsApi = {
  list: (projectId: number) => request(URLS.documents, `/project/${projectId}`),
  upload: (projectId: number, filename: string, fileType: string, fileData: string) =>
    request(URLS.documents, "/upload", "POST", { project_id: projectId, filename, file_type: fileType, file_data: fileData }),
  getText: (docId: number) => request(URLS.documents, `/${docId}/text`),
};

export const tasksApi = {
  list: (projectId: number) => request(URLS.tasks, `/project/${projectId}`),
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
  get: (id: number) => request(URLS.tasks, `/${id}`),
  updateDocuments: (taskId: number, documentRoles: { document_id: number; role: string }[]) =>
    request(URLS.tasks, `/${taskId}/documents`, "PUT", { document_roles: documentRoles }),
};

export const generateApi = {
  run: (taskId: number, prompt?: string, revisionOf?: number) =>
    request(URLS.generate, "/run", "POST", { task_id: taskId, prompt, revision_of: revisionOf }),
  getRun: (runId: number) => request(URLS.generate, `/run/${runId}`),
};

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
