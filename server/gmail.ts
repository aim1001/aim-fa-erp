import { Resend } from 'resend';

export type EmailAttachment = { filename: string; content: Buffer; mimeType?: string };

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmailWithAttachment(options: {
  to: string;
  subject: string;
  htmlBody: string;
  attachment?: EmailAttachment;
  attachments?: EmailAttachment[];
  from?: string;
  cc?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const fromAddress = `AIM <sales@aim-fa.com>`;

  const allAttachments: EmailAttachment[] = [];
  if (options.attachments && options.attachments.length > 0) {
    allAttachments.push(...options.attachments);
  } else if (options.attachment) {
    allAttachments.push(options.attachment);
  }

  const result = await resend.emails.send({
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.htmlBody,
    cc: options.cc ? options.cc.split(',').map(e => e.trim()) : undefined,
    attachments: allAttachments.map(att => ({
      filename: att.filename,
      content: att.content,
    })),
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    success: true,
    messageId: result.data?.id,
  };
}
