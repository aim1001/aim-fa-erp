const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

let connectionSettings: any;
let lastTokenFetchTime: number = 0;
const TOKEN_CACHE_MAX_AGE = 5 * 60 * 1000;

function maskToken(token: string): string {
  if (!token) return `[null/empty]`;
  return `[len=${token.length}, hasDots=${token.includes('.')}, dotCount=${(token.match(/\./g) || []).length}, startsWithBearer=${token.startsWith('Bearer ')}, type=${token.includes('.') ? 'jwt-like' : 'opaque'}]`;
}

function deepKeys(obj: any, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...deepKeys(obj[key], fullKey));
    }
  }
  return keys;
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

function getConnectorHeaders(): { hostname: string; token: string } {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Replit 커넥터 환경 변수를 찾을 수 없습니다. 서버를 재시작해 주세요.');
  }
  return { hostname, token: xReplitToken };
}

function extractAccessToken(conn: any): string | null {
  if (!conn) return null;

  const candidates = [
    conn.settings?.access_token,
    conn.settings?.oauth?.credentials?.access_token,
    conn.settings?.oauth?.access_token,
    conn.settings?.token,
    conn.settings?.credentials?.access_token,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      if (candidate.startsWith('Bearer ')) {
        return candidate.substring(7);
      }
      return candidate;
    }
  }

  return null;
}

async function fetchConnectionFromReplit(): Promise<any> {
  const { hostname, token } = getConnectorHeaders();
  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=onedrive',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': token,
      }
    }
  );
  if (!res.ok) {
    throw new Error(`OneDrive 커넥터 API 요청 실패 (HTTP ${res.status})`);
  }
  const data = await res.json();
  const conn = data.items?.[0] || null;

  if (conn) {
    const schemaKeys = deepKeys(conn.settings || {});
    const accessToken = extractAccessToken(conn);
    console.log('[OneDrive 진단] 커넥터 응답 스키마:', JSON.stringify(schemaKeys));
    console.log('[OneDrive 진단] 토큰 추출 결과:', accessToken ? maskToken(accessToken) : 'null (토큰 없음)');
  } else {
    console.warn('[OneDrive 진단] 커넥터 응답에 연결 항목 없음');
  }

  return conn;
}

export function resetTokenCache() {
  connectionSettings = null;
  lastTokenFetchTime = 0;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  const cacheStale = (now - lastTokenFetchTime) > TOKEN_CACHE_MAX_AGE;

  if (connectionSettings && !cacheStale) {
    const cached = extractAccessToken(connectionSettings);
    if (cached) return cached;
  }

  connectionSettings = await fetchConnectionFromReplit();
  lastTokenFetchTime = now;

  const accessToken = extractAccessToken(connectionSettings);

  if (!connectionSettings || !accessToken) {
    throw new Error('OneDrive가 연결되지 않았습니다. Replit 도구 패널에서 OneDrive를 연결해 주세요.');
  }
  return accessToken;
}

async function graphFetch(path: string, token: string, options?: {
  method?: string;
  body?: any;
  select?: string;
  rawResponse?: boolean;
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

  if (options?.rawResponse) {
    return res;
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
    console.warn(`[OneDrive] ${operationName} 실패 (1차): type=${classified.type}, code=${classified.code}, message=${classified.message}`);

    if (classified.needsReconnect) {
      console.error(`[OneDrive] 재연결 필요: ${classified.type}. 사용자가 Replit 도구 패널에서 OneDrive를 다시 연결해야 합니다.`);
      throw new Error(`OneDrive 재연결 필요 (${classified.type}): ${classified.message}`);
    }

    if (classified.type === 'transient') {
      await new Promise(r => setTimeout(r, 1000));
      try {
        return await operationFactory(token);
      } catch (retryErr: any) {
        console.error(`[OneDrive] ${operationName} 재시도 실패 (transient):`, retryErr.message);
        throw retryErr;
      }
    }

    if (classified.type === 'token_expired' || classified.type === 'token_invalid') {
      console.log(`[OneDrive] 토큰 문제로 캐시 초기화 후 재시도 (${classified.type})`);
      resetTokenCache();

      try {
        const freshToken = await getAccessToken();
        return await operationFactory(freshToken);
      } catch (retryErr: any) {
        const retryClassified = retryErr.graphError || classifyGraphError(retryErr.statusCode || 0, retryErr);
        console.error(`[OneDrive] ${operationName} 재시도 실패: type=${retryClassified.type}, message=${retryClassified.message}`);
        if (retryClassified.needsReconnect) {
          throw new Error(`OneDrive 재연결 필요 (${retryClassified.type}): ${retryClassified.message}`);
        }
        throw retryErr;
      }
    }

    throw firstErr;
  }
}

export async function checkConnectionStatus(): Promise<{
  connected: boolean;
  message: string;
  expiresAt?: string;
  accountInfo?: string;
  errorType?: string;
}> {
  try {
    resetTokenCache();
    const conn = await fetchConnectionFromReplit();
    if (!conn) {
      return { connected: false, message: 'OneDrive 연결이 설정되지 않았습니다. Replit 도구 패널에서 OneDrive를 연결해 주세요.', errorType: 'not_configured' };
    }

    const accessToken = extractAccessToken(conn);
    if (!accessToken) {
      const schemaKeys = deepKeys(conn.settings || {});
      console.error('[OneDrive 진단] 토큰 추출 실패. 스키마:', JSON.stringify(schemaKeys));
      return { connected: false, message: 'OneDrive 액세스 토큰을 찾을 수 없습니다. 커넥터 응답 구조가 변경되었을 수 있습니다.', errorType: 'token_not_found' };
    }

    connectionSettings = conn;
    lastTokenFetchTime = Date.now();

    try {
      const me = await graphFetch('/me', accessToken, { select: 'displayName,mail' });
      return {
        connected: true,
        message: `OneDrive 연결됨 (${me.displayName || me.mail || '계정 확인됨'})`,
        expiresAt: conn.settings?.expires_at,
        accountInfo: me.displayName || me.mail,
      };
    } catch (graphErr: any) {
      const classified = graphErr.graphError || classifyGraphError(graphErr.statusCode || 0, graphErr);
      console.warn(`[OneDrive 진단] Graph /me 호출 실패: type=${classified.type}, code=${classified.code}, msg=${classified.message}`);
      console.log('[OneDrive 진단] 사용한 토큰:', maskToken(accessToken));

      if (classified.type === 'token_expired' || classified.type === 'token_invalid') {
        console.log('[OneDrive 진단] 토큰 문제 → 커넥터에서 재발급 시도');
        resetTokenCache();
        const retryConn = await fetchConnectionFromReplit();
        const retryToken = extractAccessToken(retryConn);

        if (!retryToken) {
          return { connected: false, message: 'OneDrive 토큰 갱신 실패. Replit 도구 패널에서 OneDrive를 다시 연결해 주세요.', errorType: 'token_refresh_failed' };
        }

        connectionSettings = retryConn;
        lastTokenFetchTime = Date.now();

        try {
          const me = await graphFetch('/me', retryToken, { select: 'displayName,mail' });
          return {
            connected: true,
            message: `OneDrive 연결됨 (${me.displayName || me.mail || '계정 확인됨'})`,
            expiresAt: retryConn.settings?.expires_at,
            accountInfo: me.displayName || me.mail,
          };
        } catch (retryGraphErr: any) {
          const retryClassified = retryGraphErr.graphError || classifyGraphError(retryGraphErr.statusCode || 0, retryGraphErr);
          console.error(`[OneDrive 진단] 재시도 후에도 실패: type=${retryClassified.type}, msg=${retryClassified.message}`);
          return {
            connected: false,
            message: retryClassified.needsReconnect
              ? `OneDrive 재연결 필요: ${retryClassified.message}`
              : `OneDrive API 오류: ${retryClassified.message}`,
            errorType: retryClassified.type,
          };
        }
      }

      return {
        connected: false,
        message: classified.needsReconnect
          ? `OneDrive 재연결 필요: ${classified.message}`
          : `OneDrive 연결 오류: ${classified.message}`,
        errorType: classified.type,
      };
    }
  } catch (err: any) {
    console.error('[OneDrive 진단] checkConnectionStatus 예외:', err.message);
    return {
      connected: false,
      message: `OneDrive 연결 확인 실패: ${err.message}`,
      errorType: 'exception',
    };
  }
}

export interface OneDriveFolder {
  id: string;
  name: string;
  webUrl: string;
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
    (token) => graphFetch('/me/drive/root:/1.영업:/children', token, { select: 'id,name,webUrl,folder' }),
    'listRootSalesFolder'
  );

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
    }));
}

export async function listYearFolders(yearFolderName: string): Promise<OneDriveFolder[]> {
  const result = await graphCallWithRetry(
    (token) => graphFetch(`/me/drive/root:/1.영업/${yearFolderName}:/children`, token, { select: 'id,name,webUrl,folder' }),
    'listYearFolders'
  );

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
    }));
}

export async function createInquiryFolder(yearFolderName: string, folderName: string): Promise<OneDriveFolder> {
  const result = await graphCallWithRetry(
    (token) => graphFetch(`/me/drive/root:/1.영업/${yearFolderName}:/children`, token, {
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
    (token) => graphFetch(`/me/drive/items/${folderId}/children`, token, { select: 'id,name,webUrl,size,file' }),
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
    (token) => graphFetch(`/me/drive/items/${itemId}/content`, token),
    'downloadFile'
  );
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function readInfoJson(folderId: string): Promise<Record<string, any> | null> {
  try {
    const children = await graphCallWithRetry(
      (token) => graphFetch(`/me/drive/items/${folderId}/children`, token, { select: 'id,name,file' }),
      'readInfoJson.list'
    );

    const infoFile = (children.value || []).find(
      (item: any) => item.file && item.name === '_info.json'
    );
    if (!infoFile) return null;

    const buffer = await graphCallWithRetry(
      (token) => graphFetch(`/me/drive/items/${infoFile.id}/content`, token),
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
    (token) => graphFetch(`/me/drive/items/${folderId}`, token, { select: 'parentReference,name' }),
    'writeInfoJson.getFolder'
  );
  const driveId = folderItem.parentReference?.driveId;

  const uploadPath = driveId
    ? `/drives/${driveId}/items/${folderId}:/_info.json:/content`
    : `/me/drive/items/${folderId}:/_info.json:/content`;

  await graphCallWithRetry(
    (token) => graphFetch(uploadPath, token, { method: 'PUT', body: Buffer.from(content, 'utf-8') }),
    'writeInfoJson.put'
  );
}

export async function listFilesByPath(path: string): Promise<OneDriveFile[]> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const result = await graphCallWithRetry(
    (token) => graphFetch(`/me/drive/root:/${encodedPath}:/children`, token, { select: 'id,name,webUrl,size,file' }),
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
    (token) => graphFetch(`/me/drive/root:/${encodedPath}:/children`, token, { select: 'id,name,webUrl,folder' }),
    'listFoldersByPath'
  );

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
    }));
}

export async function downloadFileByPath(path: string): Promise<Buffer> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const buffer = await graphCallWithRetry(
    (token) => graphFetch(`/me/drive/root:/${encodedPath}:/content`, token),
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
    const result = await graphFetch(navPath, token, { select: 'id,name,folder' });

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

  const filesResult = await graphFetch(`/me/drive/items/${currentFolderId}/children`, token, { select: 'id,name,file' });

  const file = (filesResult.value || []).find(
    (item: any) => item.file && item.name === fileName
  );

  if (!file) {
    const available = (filesResult.value || [])
      .filter((item: any) => item.file)
      .map((item: any) => item.name);
    throw new Error(`파일 '${fileName}'을 찾을 수 없습니다. 사용 가능한 파일: ${available.join(', ')}`);
  }

  const buffer = await graphFetch(`/me/drive/items/${file.id}/content`, token);
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
