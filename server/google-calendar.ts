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

export async function createTaskEvent(title: string, date: string, time?: string | null, calendarId: string = 'primary'): Promise<string | null> {
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
    const res = await calendar.events.insert({ calendarId, requestBody });
    return res.data.id || null;
  } catch (err) {
    console.error('Google Calendar task event creation failed:', err);
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string, calendarId: string = 'primary'): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    await calendar.events.delete({ calendarId, eventId });
    return true;
  } catch (err) {
    console.error('Google Calendar event deletion failed:', err);
    return false;
  }
}

export async function createDeliveryEvent(orderNumber: string, vendor: string, date: string, calendarId: string = 'primary'): Promise<string | null> {
  try {
    const calendar = await getCalendarClient();
    const title = `[입고] ${orderNumber} - ${vendor}`;
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        start: { date },
        end: { date },
      },
    });
    return res.data.id || null;
  } catch (err) {
    console.error('Google Calendar delivery event creation failed:', err);
    return null;
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

export async function fetchPersonalCalendarEvents(start: string, end: string): Promise<Array<{
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  calendarName: string;
}>> {
  try {
    const calendar = await getCalendarClient();
    const listRes = await calendar.calendarList.list({});
    const allCals = listRes.data.items || [];
    const TARGET_NAMES = ["houn shim", "yup sim"];
    const targetCals = allCals.filter(cal => {
      const name = (cal.summary || "").toLowerCase().trim();
      return TARGET_NAMES.includes(name);
    });

    const results: Array<{
      id: string;
      title: string;
      date: string;
      endDate: string | null;
      startTime: string | null;
      endTime: string | null;
      calendarName: string;
    }> = [];

    function extractDate(dt: string): string {
      if (dt.includes('T')) {
        const d = new Date(dt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return dt;
    }
    function extractTime(dt: string): string | null {
      if (!dt.includes('T')) return null;
      const d = new Date(dt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    for (const cal of targetCals) {
      const calId = cal.id!;
      const calName = (cal.summary || "").toLowerCase().trim();
      const eventsRes = await calendar.events.list({
        calendarId: calId,
        timeMin: `${start}T00:00:00+09:00`,
        timeMax: `${end}T23:59:59+09:00`,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 200,
      });
      for (const event of (eventsRes.data.items || [])) {
        const rawStart = event.start?.dateTime || event.start?.date || "";
        const rawEnd = event.end?.dateTime || event.end?.date || "";
        if (!rawStart) continue;

        const date = extractDate(rawStart);
        const startTime = extractTime(rawStart);
        const endTime = extractTime(rawEnd);
        let endDate: string | null = null;
        if (rawEnd) {
          if (rawEnd.includes('T')) {
            const d = extractDate(rawEnd);
            endDate = d !== date ? d : null;
          } else {
            const d = new Date(rawEnd + 'T00:00:00');
            d.setDate(d.getDate() - 1);
            const adjustedEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            endDate = adjustedEnd !== date ? adjustedEnd : null;
          }
        }

        results.push({
          id: `gcal-${calId}-${event.id}`,
          title: event.summary || "(제목 없음)",
          date,
          endDate,
          startTime,
          endTime,
          calendarName: calName,
        });
      }
    }
    return results;
  } catch (err) {
    console.error('Personal calendar fetch failed:', err);
    return [];
  }
}
