import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;
let lastTokenFetchTime: number = 0;
const TOKEN_CACHE_MAX_AGE = 5 * 60 * 1000;

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
  return data.items?.[0] || null;
}

export function resetTokenCache() {
  connectionSettings = null;
  lastTokenFetchTime = 0;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  const tokenExpiry = connectionSettings?.settings?.expires_at
    ? new Date(connectionSettings.settings.expires_at).getTime()
    : 0;
  const cacheStale = (now - lastTokenFetchTime) > TOKEN_CACHE_MAX_AGE;

  if (connectionSettings && tokenExpiry > now && !cacheStale) {
    const cached = connectionSettings.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    if (cached) return cached;
  }

  connectionSettings = await fetchConnectionFromReplit();
  lastTokenFetchTime = now;

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('OneDrive가 연결되지 않았습니다. Replit 도구 패널에서 OneDrive를 연결해 주세요.');
  }
  return accessToken;
}

export async function checkConnectionStatus(): Promise<{
  connected: boolean;
  message: string;
  expiresAt?: string;
  accountInfo?: string;
}> {
  try {
    resetTokenCache();
    const conn = await fetchConnectionFromReplit();
    if (!conn) {
      return { connected: false, message: 'OneDrive 연결이 설정되지 않았습니다. Replit 도구 패널에서 OneDrive를 연결해 주세요.' };
    }

    const accessToken = conn.settings?.access_token || conn.settings?.oauth?.credentials?.access_token;
    if (!accessToken) {
      return { connected: false, message: 'OneDrive 액세스 토큰이 없습니다. Replit 도구 패널에서 OneDrive를 다시 연결해 주세요.' };
    }

    connectionSettings = conn;
    lastTokenFetchTime = Date.now();

    const makeClient = () => Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () =>
          connectionSettings.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token,
      },
    });

    try {
      const client = makeClient();
      const me = await client.api('/me').select('displayName,mail').get();
      return {
        connected: true,
        message: `OneDrive 연결됨 (${me.displayName || me.mail || '계정 확인됨'})`,
        expiresAt: conn.settings?.expires_at,
        accountInfo: me.displayName || me.mail,
      };
    } catch (graphErr: any) {
      resetTokenCache();
      const retryConn = await fetchConnectionFromReplit();
      const retryToken = retryConn?.settings?.access_token || retryConn?.settings?.oauth?.credentials?.access_token;
      if (!retryToken) {
        return { connected: false, message: 'OneDrive 토큰이 만료되었고 갱신에 실패했습니다. Replit 도구 패널에서 OneDrive를 다시 연결해 주세요.' };
      }
      connectionSettings = retryConn;
      lastTokenFetchTime = Date.now();

      try {
        const retryClient = makeClient();
        const me = await retryClient.api('/me').select('displayName,mail').get();
        return {
          connected: true,
          message: `OneDrive 연결됨 (${me.displayName || me.mail || '계정 확인됨'})`,
          expiresAt: retryConn.settings?.expires_at,
          accountInfo: me.displayName || me.mail,
        };
      } catch {
        return { connected: false, message: `OneDrive API 호출 실패: ${graphErr.message}. Replit 도구 패널에서 OneDrive를 다시 연결해 주세요.` };
      }
    }
  } catch (err: any) {
    return {
      connected: false,
      message: `OneDrive 연결 확인 실패: ${err.message}`,
    };
  }
}

async function getClient(): Promise<Client> {
  const accessToken = await getAccessToken();
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
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
  const client = await getClient();
  const result = await client
    .api('/me/drive/root:/1.영업:/children')
    .select('id,name,webUrl,folder')
    .get();

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
    }));
}

export async function listYearFolders(yearFolderName: string): Promise<OneDriveFolder[]> {
  const client = await getClient();
  const result = await client
    .api(`/me/drive/root:/1.영업/${yearFolderName}:/children`)
    .select('id,name,webUrl,folder')
    .get();

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
    }));
}

export async function createInquiryFolder(yearFolderName: string, folderName: string): Promise<OneDriveFolder> {
  const client = await getClient();
  const result = await client
    .api(`/me/drive/root:/1.영업/${yearFolderName}:/children`)
    .post({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    });

  return {
    id: result.id,
    name: result.name,
    webUrl: result.webUrl,
  };
}

export async function listFolderFiles(folderId: string): Promise<OneDriveFile[]> {
  const client = await getClient();
  const result = await client
    .api(`/me/drive/items/${folderId}/children`)
    .select('id,name,webUrl,size,file')
    .get();

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
  const client = await getClient();
  const stream = await client
    .api(`/me/drive/items/${itemId}/content`)
    .getStream();

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readInfoJson(folderId: string): Promise<Record<string, any> | null> {
  try {
    const client = await getClient();
    const children = await client
      .api(`/me/drive/items/${folderId}/children`)
      .select('id,name,file')
      .get();

    const infoFile = (children.value || []).find(
      (item: any) => item.file && item.name === '_info.json'
    );
    if (!infoFile) return null;

    const stream = await client
      .api(`/me/drive/items/${infoFile.id}/content`)
      .getStream();

    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`Failed to read _info.json from folder ${folderId}:`, (err as Error).message);
    return null;
  }
}

export async function writeInfoJson(folderId: string, data: Record<string, any>): Promise<void> {
  const client = await getClient();
  const content = JSON.stringify(data, null, 2);
  const folderItem = await client.api(`/me/drive/items/${folderId}`).select('parentReference,name').get();
  const driveId = folderItem.parentReference?.driveId;

  if (driveId) {
    await client
      .api(`/drives/${driveId}/items/${folderId}:/_info.json:/content`)
      .put(Buffer.from(content, 'utf-8'));
  } else {
    await client
      .api(`/me/drive/items/${folderId}:/_info.json:/content`)
      .put(Buffer.from(content, 'utf-8'));
  }
}

export async function listFilesByPath(path: string): Promise<OneDriveFile[]> {
  const client = await getClient();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const result = await client
    .api(`/me/drive/root:/${encodedPath}:/children`)
    .select('id,name,webUrl,size,file')
    .get();

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
  const client = await getClient();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const result = await client
    .api(`/me/drive/root:/${encodedPath}:/children`)
    .select('id,name,webUrl,folder')
    .get();

  return (result.value || [])
    .filter((item: any) => item.folder)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
    }));
}

export async function downloadFileByPath(path: string): Promise<Buffer> {
  const client = await getClient();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const stream = await client
    .api(`/me/drive/root:/${encodedPath}:/content`)
    .getStream();

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function findFileInFolder(folderNames: string[], fileName: string): Promise<Buffer> {
  const client = await getClient();

  let currentPath = '/me/drive/root/children';
  let currentFolderId: string | null = null;

  for (const folderName of folderNames) {
    const result = await client
      .api(currentFolderId ? `/me/drive/items/${currentFolderId}/children` : currentPath)
      .select('id,name,folder')
      .get();

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

  const filesResult = await client
    .api(`/me/drive/items/${currentFolderId}/children`)
    .select('id,name,file')
    .get();

  const file = (filesResult.value || []).find(
    (item: any) => item.file && item.name === fileName
  );

  if (!file) {
    const available = (filesResult.value || [])
      .filter((item: any) => item.file)
      .map((item: any) => item.name);
    throw new Error(`파일 '${fileName}'을 찾을 수 없습니다. 사용 가능한 파일: ${available.join(', ')}`);
  }

  const stream = await client
    .api(`/me/drive/items/${file.id}/content`)
    .getStream();

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
