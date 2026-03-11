const TELEGRAM_API = "https://api.telegram.org";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

export function isConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function hasChatId(): boolean {
  return !!process.env.TELEGRAM_CHAT_ID;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[Telegram] sendMessage failed:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Telegram] sendMessage error:", err);
    return false;
  }
}

export async function detectChatId(): Promise<{ chatId: string; title: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getUpdates?limit=20`);
    if (!res.ok) return null;
    const data = await res.json();
    const updates = data.result || [];
    for (const update of updates.reverse()) {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      if (chat && (chat.type === "group" || chat.type === "supergroup")) {
        return { chatId: String(chat.id), title: chat.title || "" };
      }
    }
    for (const update of updates) {
      const chat = update.message?.chat;
      if (chat) {
        return { chatId: String(chat.id), title: chat.title || chat.first_name || "" };
      }
    }
    return null;
  } catch (err) {
    console.error("[Telegram] detectChatId error:", err);
    return null;
  }
}

export async function testConnection(): Promise<{ ok: boolean; botName?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, botName: data.result?.username || "" };
  } catch {
    return { ok: false };
  }
}

let lastUpdateOffset = 0;

export async function fetchNewMessages(
  saveFn: (msg: { messageId: number; text: string; fromName: string; chatId: string }) => Promise<void>
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const url = `${TELEGRAM_API}/bot${token}/getUpdates?offset=${lastUpdateOffset}&limit=50&timeout=0`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const updates = data.result || [];

  for (const update of updates) {
    const msg = update.message;
    if (msg && msg.text && msg.chat.type === "private") {
      const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";
      try {
        await saveFn({
          messageId: msg.message_id,
          text: msg.text,
          fromName,
          chatId: String(msg.chat.id),
        });
      } catch (err) {
        console.error("[Telegram] Failed to save memo, will retry:", err);
        return;
      }
    }
    lastUpdateOffset = update.update_id + 1;
  }
}

let pollingActive = false;

export function startPolling(saveFn: (msg: { messageId: number; text: string; fromName: string; chatId: string }) => Promise<void>) {
  if (pollingActive) return;
  pollingActive = true;

  async function poll() {
    try {
      await fetchNewMessages(saveFn);
    } catch (err) {
      console.error("[Telegram] Polling error:", err);
    }
    if (pollingActive) {
      setTimeout(poll, 30000);
    }
  }
  poll();
}

export function notifyInquiry(action: string, inquiry: any): void {
  const status = inquiry.status === "won" ? "수주" : inquiry.status === "lost" ? "실주" : inquiry.status === "active" ? "진행" : inquiry.status || "";
  const lines = [
    `📋 <b>[인콰이어리 ${esc(action)}]</b>`,
    `번호: ${esc(inquiry.inquiryNumber || "")}`,
    `고객: ${esc(inquiry.customerName || "")}`,
    inquiry.productInfo ? `제품: ${esc(inquiry.productInfo)}` : "",
    status ? `상태: ${esc(status)}` : "",
    inquiry.probability != null ? `확률: ${inquiry.probability}%` : "",
  ].filter(Boolean);
  sendTelegramMessage(lines.join("\n"));
}

export function notifyProject(action: string, project: any): void {
  const statusMap: Record<string, string> = {
    active: "진행중", completed: "완료", delayed: "지연", warranty: "하자보수",
  };
  const lines = [
    `🏗 <b>[프로젝트 ${esc(action)}]</b>`,
    `번호: ${esc(project.projectNumber || "")}`,
    `고객: ${esc(project.customerName || "")}`,
    project.description ? `내용: ${esc(project.description)}` : "",
    project.status ? `상태: ${esc(statusMap[project.status] || project.status)}` : "",
  ].filter(Boolean);
  sendTelegramMessage(lines.join("\n"));
}

export function notifyPayment(action: string, payment: any): void {
  const typeLabel = payment.type === "income" ? "입금" : "출금";
  const lines = [
    `💰 <b>[${esc(typeLabel)} ${esc(action)}]</b>`,
    payment.companyName ? `거래처: ${esc(payment.companyName)}` : "",
    payment.description ? `내용: ${esc(payment.description)}` : "",
    `금액: ${((payment.actualAmount || payment.amount) || 0).toLocaleString()}원`,
    payment.actualDate ? `일자: ${payment.actualDate}` : "",
  ].filter(Boolean);
  sendTelegramMessage(lines.join("\n"));
}

export function notifyTask(action: string, task: any, category: string, parentInfo?: string): void {
  const typeLabel = task.taskType === "schedule" ? "일정" : "할일";
  const lines = [
    `${task.taskType === "schedule" ? "📅" : "✅"} <b>[${esc(category)} ${esc(typeLabel)} ${esc(action)}]</b>`,
    parentInfo && parentInfo !== "_" ? esc(parentInfo) : "",
    `내용: ${esc(task.content || "")}`,
    task.dueDate ? `기한: ${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ""}` : "",
  ].filter(Boolean);
  sendTelegramMessage(lines.join("\n"));
}
