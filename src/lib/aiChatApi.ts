const AI_CHAT_URL = "https://functions.poehali.dev/50f13de1-3c4a-46f1-a216-af655d709148";

function getSession(): string {
  return localStorage.getItem("session_id") || "";
}

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const sid = getSession();
  const res = await fetch(AI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sid ? { "X-Session-Id": sid } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data.answer;
}
