import { google } from 'googleapis';

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
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function wrapBase64(base64Str: string, lineLength = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < base64Str.length; i += lineLength) {
    lines.push(base64Str.slice(i, i + lineLength));
  }
  return lines.join('\r\n');
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim();
}

function encodeFilename(filename: string): string {
  return `=?UTF-8?B?${Buffer.from(filename).toString('base64')}?=`;
}

export type EmailAttachment = { filename: string; content: Buffer; mimeType?: string };

function buildMimeMessage(
  fromEmail: string,
  to: string,
  subject: string,
  htmlBody: string,
  attachments?: EmailAttachment[],
  cc?: string
): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const safeSubject = sanitizeHeader(subject);
  const mimeSubject = `=?UTF-8?B?${Buffer.from(safeSubject).toString('base64')}?=`;
  const safeTo = sanitizeHeader(to);
  const safeFrom = sanitizeHeader(fromEmail);

  let message = '';
  message += `From: ${safeFrom}\r\n`;
  message += `To: ${safeTo}\r\n`;
  if (cc) {
    message += `Cc: ${sanitizeHeader(cc)}\r\n`;
  }
  message += `Subject: ${mimeSubject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;

  const hasAttachments = attachments && attachments.length > 0;

  if (hasAttachments) {
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += wrapBase64(Buffer.from(htmlBody).toString('base64')) + '\r\n';

    for (const att of attachments) {
      const encodedName = encodeFilename(att.filename);
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${att.mimeType || 'application/pdf'}; name="${encodedName}"\r\n`;
      message += `Content-Disposition: attachment; filename="${encodedName}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n\r\n`;
      message += wrapBase64(att.content.toString('base64')) + '\r\n';
    }

    message += `--${boundary}--\r\n`;
  } else {
    message += `Content-Type: text/html; charset="UTF-8"\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += wrapBase64(Buffer.from(htmlBody).toString('base64')) + '\r\n';
  }

  return message;
}

export async function sendEmailWithAttachment(options: {
  to: string;
  subject: string;
  htmlBody: string;
  attachment?: EmailAttachment;
  attachments?: EmailAttachment[];
  from?: string;
  cc?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const gmail = await getUncachableGmailClient();

  const fromAddress = options.from || 'sales@aim-fa.com';

  const allAttachments: EmailAttachment[] = [];
  if (options.attachments && options.attachments.length > 0) {
    allAttachments.push(...options.attachments);
  } else if (options.attachment) {
    allAttachments.push(options.attachment);
  }

  const rawMessage = buildMimeMessage(
    fromAddress,
    options.to,
    options.subject,
    options.htmlBody,
    allAttachments.length > 0 ? allAttachments : undefined,
    options.cc
  );

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return {
    success: true,
    messageId: result.data.id || undefined,
  };
}
