import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    const cached = connectionSettings.settings.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    if (cached) return cached;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar/Tasks not connected');
  }
  return accessToken;
}

async function getTasksClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

export async function createGoogleTask(title: string, dueDate?: string | null): Promise<string | null> {
  try {
    const tasksClient = await getTasksClient();
    const requestBody: any = { title, status: 'needsAction' };
    if (dueDate) {
      requestBody.due = `${dueDate}T00:00:00.000Z`;
    }
    const res = await tasksClient.tasks.insert({
      tasklist: '@default',
      requestBody,
    });
    return res.data.id || null;
  } catch (err) {
    console.error('Google Tasks 생성 실패:', err);
    return null;
  }
}

export async function updateGoogleTask(taskId: string, title: string): Promise<boolean> {
  try {
    const tasksClient = await getTasksClient();
    await tasksClient.tasks.patch({
      tasklist: '@default',
      task: taskId,
      requestBody: { title },
    });
    return true;
  } catch (err) {
    console.error('Google Tasks 제목 업데이트 실패:', err);
    return false;
  }
}

export async function completeGoogleTask(taskId: string): Promise<boolean> {
  try {
    const tasksClient = await getTasksClient();
    await tasksClient.tasks.patch({
      tasklist: '@default',
      task: taskId,
      requestBody: { status: 'completed' },
    });
    return true;
  } catch (err) {
    console.error('Google Tasks 완료 처리 실패:', err);
    return false;
  }
}

export async function deleteGoogleTask(taskId: string): Promise<boolean> {
  try {
    const tasksClient = await getTasksClient();
    await tasksClient.tasks.delete({
      tasklist: '@default',
      task: taskId,
    });
    return true;
  } catch (err) {
    console.error('Google Tasks 삭제 실패:', err);
    return false;
  }
}
