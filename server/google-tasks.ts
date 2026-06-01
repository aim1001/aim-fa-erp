import { google } from "googleapis";
import { getOAuth2Client, isGoogleOAuthConfigured } from "./google-auth";

async function getTasksClient() {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google Tasks not configured");
  }
  const auth = await getOAuth2Client();
  return google.tasks({ version: "v1", auth });
}

export async function createGoogleTask(title: string, dueDate?: string | null): Promise<string | null> {
  try {
    const tasksClient = await getTasksClient();
    const requestBody: any = { title, status: "needsAction" };
    if (dueDate) {
      requestBody.due = `${dueDate}T00:00:00.000Z`;
    }
    const res = await tasksClient.tasks.insert({
      tasklist: "@default",
      requestBody,
    });
    return res.data.id || null;
  } catch (err) {
    console.error("Google Tasks 생성 실패:", err);
    return null;
  }
}

export async function updateGoogleTask(taskId: string, title: string): Promise<boolean> {
  try {
    const tasksClient = await getTasksClient();
    await tasksClient.tasks.patch({
      tasklist: "@default",
      task: taskId,
      requestBody: { title },
    });
    return true;
  } catch (err) {
    console.error("Google Tasks 제목 업데이트 실패:", err);
    return false;
  }
}

export async function completeGoogleTask(taskId: string): Promise<boolean> {
  try {
    const tasksClient = await getTasksClient();
    await tasksClient.tasks.patch({
      tasklist: "@default",
      task: taskId,
      requestBody: { status: "completed" },
    });
    return true;
  } catch (err) {
    console.error("Google Tasks 완료 처리 실패:", err);
    return false;
  }
}

export async function deleteGoogleTask(taskId: string): Promise<boolean> {
  try {
    const tasksClient = await getTasksClient();
    await tasksClient.tasks.delete({
      tasklist: "@default",
      task: taskId,
    });
    return true;
  } catch (err) {
    console.error("Google Tasks 삭제 실패:", err);
    return false;
  }
}
