import nodemailer from 'nodemailer';

export type EmailAttachment = { filename: string; content: Buffer; mimeType?: string };

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Gmail SMTP 설정이 없습니다. GMAIL_USER, GMAIL_APP_PASSWORD 환경변수를 설정해주세요.');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
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
  const transporter = getTransporter();

  const fromUser = process.env.GMAIL_USER!;
  const fromAddress = options.from
    ? `${options.from} <${fromUser}>`
    : fromUser;

  const allAttachments: EmailAttachment[] = [];
  if (options.attachments && options.attachments.length > 0) {
    allAttachments.push(...options.attachments);
  } else if (options.attachment) {
    allAttachments.push(options.attachment);
  }

  const mailOptions: nodemailer.SendMailOptions = {
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.htmlBody,
    cc: options.cc || undefined,
    replyTo: options.from || undefined,
    attachments: allAttachments.map(att => ({
      filename: att.filename,
      content: att.content,
      contentType: att.mimeType || 'application/pdf',
    })),
  };

  const result = await transporter.sendMail(mailOptions);

  return {
    success: true,
    messageId: result.messageId || undefined,
  };
}
