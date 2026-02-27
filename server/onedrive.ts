import { storage } from "./storage";

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const OAUTH_AUTHORITY = 'https://login.microsoftonline.com/common';
const OAUTH_TOKEN_URL = `${OAUTH_AUTHORITY}/oauth2/v2.0/token`;
const OAUTH_AUTH_URL = `${OAUTH_AUTHORITY}/oauth2/v2.0/authorize`;
const SCOPES = 'openid profile email offline_access Files.ReadWrite.All User.Read';

let cachedAccessToken: string | null = null;
let cachedTokenExpiry: number = 0;

function getOAuthConfig() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Azure Client ID/Secret이 설정되지 않았습니다.');
  }
  return { clientId, clientSecret };
}

function getRedirectUri(host?: string): string {
  if (host) {
    const proto = host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}/api/onedrive/callback`;
  }
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const deployDomain = process.env.REPLIT_DEPLOYMENT_URL;
  if (deployDomain) {
    return `${deployDomain}/api/onedrive/callback`;
  }
  if (devDomain) {
    return `https://${devDomain}/api/onedrive/callback`;
  }
  return 'http://localhost:5000/api/onedrive/callback';
}

export function getAuthUrl(host?: string): string {
  const { clientId } = getOAuthConfig();
  const redirectUri = getRedirectUri(host);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'consent',
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, host?: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; accountName?: string; accountEmail?: string }> {
  const { clientId, clientSecret } = getOAuthConfig();
  const redirectUri = getRedirectUri(host);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: SCOPES,
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[OneDrive OAuth] 토큰 교환 실패:', errBody);
    throw new Error(`토큰 교환 실패 (HTTP ${res.status})`);
  }

  const data = await res.json();

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  let accountName: string | undefined;
  let accountEmail: string | undefined;
  try {
    const me = await graphFetchDirect('/me', data.access_token, { select: 'displayName,mail,userPrincipalName' });
    accountName = me.displayName;
    accountEmail = me.mail || me.userPrincipalName;
  } catch (e) {
    console.warn('[OneDrive] 계정 정보 조회 실패:', (e as Error).message);
  }

  await storage.saveOnedriveToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    accountName,
    accountEmail,
  });

  cachedAccessToken = data.access_token;
  cachedTokenExpiry = expiresAt.getTime();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    accountName,
    accountEmail,
  };
}

async function refreshAccessToken(): Promise<string> {
  const tokenRecord = await storage.getOnedriveToken();
  if (!tokenRecord || !tokenRecord.refreshToken) {
    throw new Error('OneDrive가 연결되지 않았습니다. OneDrive 연결 버튼을 눌러 주세요.');
  }

  const { clientId, clientSecret } = getOAuthConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokenRecord.refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES,
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[OneDrive OAuth] 토큰 갱신 실패:', errBody);
    await storage.deleteOnedriveToken();
    cachedAccessToken = null;
    cachedTokenExpiry = 0;
    throw new Error('OneDrive 토큰이 만료되었습니다. OneDrive를 다시 연결해 주세요.');
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  await storage.saveOnedriveToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokenRecord.refreshToken,
    expiresAt,
    accountName: tokenRecord.accountName || undefined,
    accountEmail: tokenRecord.accountEmail || undefined,
  });

  cachedAccessToken = data.access_token;
  cachedTokenExpiry = expiresAt.getTime();

  console.log('[OneDrive] 토큰 자동 갱신 성공');
  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedTokenExpiry > Date.now() + 60000) {
    return cachedAccessToken;
  }

  const tokenRecord = await storage.getOnedriveToken();
  if (!tokenRecord) {
    throw new Error('OneDrive가 연결되지 않았습니다. OneDrive 연결 버튼을 눌러 주세요.');
  }

  if (tokenRecord.expiresAt.getTime() > Date.now() + 60000) {
    cachedAccessToken = tokenRecord.accessToken;
    cachedTokenExpiry = tokenRecord.expiresAt.getTime();
    return tokenRecord.accessToken;
  }

  return await refreshAccessToken();
}

export function resetTokenCache() {
  cachedAccessToken = null;
  cachedTokenExpiry = 0;
}

type GraphErrorType = 'token_expired' | 'token_invalid' | 'needs_reauth' | 'needs_consent' | 'client_error' | 'transient' | 'unknown';

function classifyGraphError(statusCode: number, errorBody: any): { type: GraphErrorType; code: string; message: string; needsReconnect: boolean } {
  const message = errorBody?.error?.message || errorBody?.message || String(errorBody);
  const code = errorBody?.error?.code || errorBody?.code || statusCode.toString();
  const fullText = `${code} ${message}`.toLowerCase();

  if (fullText.includes('invalid_grant')) {
    return { type: 'needs_reauth', code, message, needsReconnect: true };
  }
  if (fullText.includes('interaction_required') || fullText.includes('consent_required')) {
    return { type: 'needs_consent', code, message, needsReconnect: true };
  }
  if (fullText.includes('invalid_client') || fullText.includes('unauthorized_client')) {
    return { type: 'client_error', code, message, needsReconnect: true };
  }
  if (fullText.includes('aadsts')) {
    return { type: 'needs_reauth', code, message, needsReconnect: true };
  }
  if (statusCode === 401 || fullText.includes('invalidauthenticationtoken') || fullText.includes('unauthorized')) {
    return { type: 'token_invalid', code, message, needsReconnect: false };
  }
  if (fullText.includes('expired') || fullText.includes('token has expired')) {
    return { type: 'token_expired', code, message, needsReconnect: false };
  }
  if (statusCode === 429 || statusCode === 503 || fullText.includes('throttl') || fullText.includes('service unavailable')) {
    return { type: 'transient', code, message, needsReconnect: false };
  }

  return { type: 'unknown', code, message, needsReconnect: false };
}

async function graphFetchDirect(path: string, token: string, options?: {
  method?: string;
  body?: any;
  select?: string;
}): Promise<any> {
  const method = options?.method || 'GET';
  let url = `${GRAPH_BASE}${path}`;

  if (options?.select) {
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}$select=${options.select}`;
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };

  let body: any = undefined;
  if (options?.body !== undefined) {
    if (Buffer.isBuffer(options.body)) {
      headers['Content-Type'] = 'application/octet-stream';
      body = options.body;
    } else if (typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    } else {
      body = options.body;
    }
  }

  const res = await fetch(url, { method, headers, body });

  if (!res.ok) {
    let errorBody: any;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = { message: `HTTP ${res.status} ${res.statusText}` };
    }
    const classified = classifyGraphError(res.status, errorBody);
    const err: any = new Error(classified.message);
    err.statusCode = res.status;
    err.graphError = classified;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  return Buffer.from(await res.arrayBuffer());
}

async function graphCallWithRetry<T>(
  operationFactory: (token: string) => Promise<T>,
  operationName: string
): Promise<T> {
  const token = await getAccessToken();
  try {
    return await operationFactory(token);
  } catch (firstErr: any) {
    const classified = firstErr.graphError || classifyGraphError(firstErr.statusCode || 0, firstErr);
    console.warn(`[OneDrive] ${operationName} 실패 (1차): type=${classified.type}, code=${classified.code}`);

    if (classified.needsReconnect) {
      throw new Error(`OneDrive 재연결 필요 (${classified.type}): ${classified.message}`);
    }

    if (classified.type === 'transient') {
      await new Promise(r => setTimeout(r, 1000));
      return await operationFactory(token);
    }

    if (classified.type === 'token_expired' || classified.type === 'token_invalid') {
      console.log(`[OneDrive] 토큰 문제로 갱신 후 재시도 (${classified.type})`);
      resetTokenCache();
      try {
        const freshToken = await refreshAccessToken();
        return await operationFactory(freshToken);
      } catch (retryErr: any) {
        const retryClassified = retryErr.graphError || classifyGraphError(retryErr.statusCode || 0, retryErr);
        if (retryClassified.needsReconnect || retryClassified.type === 'token_invalid') {
          await storage.deleteOnedriveToken();
          throw new Error('OneDrive 토큰이 만료되었습니다. OneDrive를 다시 연결해 주세요.');
        }
        throw retryErr;
      }
    }

    throw firstErr;
  }
}

export async function checkConnectionStatus(host?: string): Promise<{
  connected: boolean;
  message: string;
  expiresAt?: string;
  accountInfo?: string;
  errorType?: string;
  authUrl?: string;
}> {
  try {
    const tokenRecord = await storage.getOnedriveToken();
    if (!tokenRecord) {
      return {
        connected: false,
        message: 'OneDrive가 연결되지 않았습니다.',
        errorType: 'not_configured',
        authUrl: getAuthUrl(host),
      };
    }

    const token = await getAccessToken();
    const me = await graphFetchDirect('/me', token, { select: 'displayName,mail,userPrincipalName' });

    return {
      connected: true,
      message: `OneDrive 연결됨 (${me.displayName || me.mail || '계정 확인됨'})`,
      expiresAt: tokenRecord.expiresAt.toISOString(),
      accountInfo: me.displayName || me.mail,
    };
  } catch (err: any) {
    console.error('[OneDrive] checkConnectionStatus 실패:', err.message);
    return {
      connected: false,
      message: err.message || 'OneDrive 연결 확인 실패',
      errorType: 'exception',
      authUrl: getAuthUrl(host),
    };
  }
}

export interface OneDriveFolder {
  id: string;
  name: string;
  webUrl: string;
  createdDateTime?: string;
}

export interface OneDriveFile {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  mimeType?: string;
}

export async function listRootSalesFolder(): Promise<OneDriveFolder[]> {
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect('/me/drive/root:/1.영업:/children', token, { select: 'id,name,webUrl,folder,createdDateTime' }),
    'listRootSalesFolder'
  );

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      createdDateTime: item.createdDateTime,
    }));
}

export async function listYearFolders(yearFolderName: string): Promise<OneDriveFolder[]> {
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/root:/1.영업/${yearFolderName}:/children`, token, { select: 'id,name,webUrl,folder,createdDateTime' }),
    'listYearFolders'
  );

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      createdDateTime: item.createdDateTime,
    }));
}

export async function createInquiryFolder(yearFolderName: string, folderName: string): Promise<OneDriveFolder> {
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/root:/1.영업/${yearFolderName}:/children`, token, {
      method: 'POST',
      body: {
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      },
    }),
    'createInquiryFolder'
  );

  return {
    id: result.id,
    name: result.name,
    webUrl: result.webUrl,
  };
}

export async function listFolderFiles(folderId: string): Promise<OneDriveFile[]> {
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/items/${folderId}/children`, token, { select: 'id,name,webUrl,size,file' }),
    'listFolderFiles'
  );

  return (result.value || [])
    .filter((item: any) => item.file)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      size: item.size,
      mimeType: item.file?.mimeType,
    }));
}

export async function downloadFile(itemId: string): Promise<Buffer> {
  const buffer = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/items/${itemId}/content`, token),
    'downloadFile'
  );
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function readInfoJson(folderId: string): Promise<Record<string, any> | null> {
  try {
    const children = await graphCallWithRetry(
      (token) => graphFetchDirect(`/me/drive/items/${folderId}/children`, token, { select: 'id,name,file' }),
      'readInfoJson.list'
    );

    const infoFile = (children.value || []).find(
      (item: any) => item.file && item.name === '_info.json'
    );
    if (!infoFile) return null;

    const buffer = await graphCallWithRetry(
      (token) => graphFetchDirect(`/me/drive/items/${infoFile.id}/content`, token),
      'readInfoJson.download'
    );

    const content = (Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)).toString('utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`Failed to read _info.json from folder ${folderId}:`, (err as Error).message);
    return null;
  }
}

export async function writeInfoJson(folderId: string, data: Record<string, any>): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const folderItem = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/items/${folderId}`, token, { select: 'parentReference,name' }),
    'writeInfoJson.getFolder'
  );
  const driveId = folderItem.parentReference?.driveId;

  const uploadPath = driveId
    ? `/drives/${driveId}/items/${folderId}:/_info.json:/content`
    : `/me/drive/items/${folderId}:/_info.json:/content`;

  await graphCallWithRetry(
    (token) => graphFetchDirect(uploadPath, token, { method: 'PUT', body: Buffer.from(content, 'utf-8') }),
    'writeInfoJson.put'
  );
}

export async function uploadFileToFolder(folderId: string, fileName: string, content: Buffer): Promise<void> {
  const folderItem = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/items/${folderId}`, token, { select: 'parentReference,name' }),
    'uploadFileToFolder.getFolder'
  );
  const driveId = folderItem.parentReference?.driveId;
  const encodedName = encodeURIComponent(fileName);

  const uploadPath = driveId
    ? `/drives/${driveId}/items/${folderId}:/${encodedName}:/content`
    : `/me/drive/items/${folderId}:/${encodedName}:/content`;

  await graphCallWithRetry(
    (token) => graphFetchDirect(uploadPath, token, { method: 'PUT', body: content }),
    'uploadFileToFolder.put'
  );
}

export async function listFilesByPath(path: string): Promise<OneDriveFile[]> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/root:/${encodedPath}:/children`, token, { select: 'id,name,webUrl,size,file' }),
    'listFilesByPath'
  );

  return (result.value || [])
    .filter((item: any) => item.file)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      size: item.size,
      mimeType: item.file?.mimeType,
    }));
}

export async function listFoldersByPath(path: string): Promise<OneDriveFolder[]> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/root:/${encodedPath}:/children`, token, { select: 'id,name,webUrl,folder,createdDateTime' }),
    'listFoldersByPath'
  );

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      createdDateTime: item.createdDateTime,
    }));
}

export async function getFolderMetadata(folderId: string): Promise<{ createdDateTime?: string }> {
  const result = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/items/${folderId}`, token, { select: 'id,createdDateTime' }),
    'getFolderMetadata'
  );
  return { createdDateTime: result.createdDateTime };
}

export async function uploadFileByPath(path: string, content: Buffer): Promise<void> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/root:/${encodedPath}:/content`, token, {
      method: 'PUT',
      body: content,
    }),
    'uploadFileByPath'
  );
}

export async function downloadFileByPath(path: string): Promise<Buffer> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const buffer = await graphCallWithRetry(
    (token) => graphFetchDirect(`/me/drive/root:/${encodedPath}:/content`, token),
    'downloadFileByPath'
  );
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function findFileInFolder(folderNames: string[], fileName: string): Promise<Buffer> {
  const token = await getAccessToken();

  let currentFolderId: string | null = null;

  for (const folderName of folderNames) {
    const navPath = currentFolderId
      ? `/me/drive/items/${currentFolderId}/children`
      : '/me/drive/root/children';
    const result = await graphFetchDirect(navPath, token, { select: 'id,name,folder' });

    const folder = (result.value || []).find(
      (item: any) => item.folder && item.name === folderName
    );

    if (!folder) {
      const available = (result.value || [])
        .filter((item: any) => item.folder)
        .map((item: any) => item.name);
      throw new Error(`폴더 '${folderName}'을 찾을 수 없습니다. 사용 가능한 폴더: ${available.join(', ')}`);
    }
    currentFolderId = folder.id;
  }

  const filesResult = await graphFetchDirect(`/me/drive/items/${currentFolderId}/children`, token, { select: 'id,name,file' });

  const file = (filesResult.value || []).find(
    (item: any) => item.file && item.name === fileName
  );

  if (!file) {
    const available = (filesResult.value || [])
      .filter((item: any) => item.file)
      .map((item: any) => item.name);
    throw new Error(`파일 '${fileName}'을 찾을 수 없습니다. 사용 가능한 파일: ${available.join(', ')}`);
  }

  const buffer = await graphFetchDirect(`/me/drive/items/${file.id}/content`, token);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export function parseInquiryFolderName(folderName: string, year: number): {
  inquiryNumber: string;
  customerName: string;
  productInfo: string;
} | null {
  const parts = folderName.split('_');

  if (year >= 2023) {
    if (parts.length < 2) return null;
    const inquiryNumber = parts[0].trim();
    const customerName = parts[1].trim();
    const productInfo = parts.slice(2).join('_').trim();
    if (!inquiryNumber || !customerName) return null;
    return { inquiryNumber, customerName, productInfo };
  }

  if (year >= 2021) {
    if (parts.length >= 2) {
      const inquiryNumber = parts[0].trim();
      const customerName = parts[1].replace(/\(.*\)$/, '').trim();
      const productInfo = parts.slice(2).join('_').trim();
      if (!inquiryNumber || !customerName) return null;
      return { inquiryNumber, customerName, productInfo };
    }
    return null;
  }

  if (parts.length >= 2) {
    const first = parts[0].trim();
    const customerName = parts[1].replace(/\(.*\)$/, '').trim();
    const productInfo = parts.slice(2).join('_').trim();
    if (!customerName) return null;
    const inquiryNumber = first;
    return { inquiryNumber, customerName, productInfo };
  }

  return null;
}
