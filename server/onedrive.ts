import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const rawResponse = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=onedrive',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  );
  const responseData = await rawResponse.json();
  connectionSettings = responseData.items?.[0];

  console.log('OneDrive connector response keys:', JSON.stringify(Object.keys(responseData || {})));
  console.log('OneDrive connection item keys:', JSON.stringify(connectionSettings ? Object.keys(connectionSettings) : 'null'));
  if (connectionSettings?.settings) {
    console.log('OneDrive settings keys:', JSON.stringify(Object.keys(connectionSettings.settings)));
    const token = connectionSettings.settings.access_token;
    console.log('OneDrive access_token type:', typeof token, 'length:', token?.length, 'starts:', typeof token === 'string' ? token.substring(0, 20) + '...' : 'N/A');
    console.log('OneDrive access_token has dots:', typeof token === 'string' ? token.split('.').length - 1 : 'N/A');
    if (connectionSettings.settings.oauth) {
      console.log('OneDrive oauth keys:', JSON.stringify(Object.keys(connectionSettings.settings.oauth)));
      if (connectionSettings.settings.oauth.credentials) {
        console.log('OneDrive oauth.credentials keys:', JSON.stringify(Object.keys(connectionSettings.settings.oauth.credentials)));
        const oauthToken = connectionSettings.settings.oauth.credentials.access_token;
        console.log('OneDrive oauth access_token type:', typeof oauthToken, 'length:', oauthToken?.length, 'has dots:', typeof oauthToken === 'string' ? oauthToken.split('.').length - 1 : 'N/A');
      }
    }
  }
  if (connectionSettings?.secrets) {
    console.log('OneDrive secrets keys:', JSON.stringify(Object.keys(connectionSettings.secrets)));
  }
  if (connectionSettings?.settings?.oauth?.credentials) {
    const creds = connectionSettings.settings.oauth.credentials;
    console.log('OneDrive oauth expires_at:', creds.expires_at, 'now:', Date.now(), 'expired:', creds.expires_at < Date.now());
    console.log('OneDrive oauth token_type:', creds.token_type, 'scope:', creds.scope);
  }

  const accessToken = connectionSettings?.settings?.access_token 
    || connectionSettings?.settings?.oauth?.credentials?.access_token
    || connectionSettings?.secrets?.access_token
    || connectionSettings?.secrets?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('OneDrive not connected - no valid access token found');
  }

  const testRes = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  console.log('OneDrive direct API test status:', testRes.status);
  if (testRes.status !== 200) {
    const testBody = await testRes.text();
    console.log('OneDrive direct API test body:', testBody.substring(0, 300));
    connectionSettings = null;
    throw new Error('OneDrive token is invalid (status ' + testRes.status + ')');
  }

  return accessToken;
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
