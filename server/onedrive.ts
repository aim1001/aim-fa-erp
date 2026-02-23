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

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=onedrive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('OneDrive not connected');
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
