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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function createTaskEvent(title: string, date: string, time?: string | null): Promise<string | null> {
  try {
    const calendar = await getCalendarClient();
    let requestBody: any;
    if (time) {
      const [hh, mm] = time.split(':').map(Number);
      const endHH = String(Math.min(hh + 1, 23)).padStart(2, '0');
      const endMM = String(mm).padStart(2, '0');
      requestBody = {
        summary: title,
        start: { dateTime: `${date}T${time}:00`, timeZone: 'Asia/Seoul' },
        end: { dateTime: `${date}T${endHH}:${endMM}:00`, timeZone: 'Asia/Seoul' },
      };
    } else {
      requestBody = {
        summary: title,
        start: { date },
        end: { date },
      };
    }
    const res = await calendar.events.insert({ calendarId: 'primary', requestBody });
    return res.data.id || null;
  } catch (err) {
    console.error('Google Calendar task event creation failed:', err);
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    await calendar.events.delete({ calendarId: 'primary', eventId });
    return true;
  } catch (err) {
    console.error('Google Calendar event deletion failed:', err);
    return false;
  }
}

export async function createQuoteSentEvent(inquiryNumber: string, customerName: string, quoteDate: string) {
  try {
    const calendar = await getCalendarClient();
    const title = `${inquiryNumber}_${customerName}_견적발송`;
    const eventDate = quoteDate || new Date().toISOString().split('T')[0];

    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        start: { date: eventDate },
        end: { date: eventDate },
      },
    });
    return true;
  } catch (err) {
    console.error('Google Calendar event creation failed:', err);
    return false;
  }
}
