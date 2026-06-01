import { google } from "googleapis";
import { getOAuth2Client, isGoogleOAuthConfigured } from "./google-auth";

async function getCalendarClient() {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google Calendar not configured");
  }
  const auth = await getOAuth2Client();
  return google.calendar({ version: "v3", auth });
}

export async function createTaskEvent(title: string, date: string, time?: string | null, calendarId: string = "primary"): Promise<string | null> {
  try {
    const calendar = await getCalendarClient();
    let requestBody: any;
    if (time) {
      const [hh, mm] = time.split(":").map(Number);
      const endHH = String(Math.min(hh + 1, 23)).padStart(2, "0");
      const endMM = String(mm).padStart(2, "0");
      requestBody = {
        summary: title,
        start: { dateTime: `${date}T${time}:00`, timeZone: "Asia/Seoul" },
        end: { dateTime: `${date}T${endHH}:${endMM}:00`, timeZone: "Asia/Seoul" },
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
    console.error("Google Calendar task event creation failed:", err);
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string, calendarId: string = "primary"): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    await calendar.events.delete({ calendarId, eventId });
    return true;
  } catch (err) {
    console.error("Google Calendar event deletion failed:", err);
    return false;
  }
}

export async function createDeliveryEvent(orderNumber: string, vendor: string, date: string, calendarId: string = "primary"): Promise<string | null> {
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
    console.error("Google Calendar delivery event creation failed:", err);
    return null;
  }
}

export async function createQuoteSentEvent(inquiryNumber: string, customerName: string, quoteDate: string) {
  try {
    const calendar = await getCalendarClient();
    const title = `${inquiryNumber}_${customerName}_견적발송`;
    const eventDate = quoteDate || new Date().toISOString().split("T")[0];

    await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        start: { date: eventDate },
        end: { date: eventDate },
      },
    });
    return true;
  } catch (err) {
    console.error("Google Calendar event creation failed:", err);
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
    const targetCals = allCals.filter((cal) => {
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

    const TZ = "Asia/Seoul";

    function extractDate(dt: string): string {
      if (!dt.includes("T")) return dt;
      return new Date(dt).toLocaleDateString("en-CA", { timeZone: TZ });
    }
    function extractTime(dt: string): string | null {
      if (!dt.includes("T")) return null;
      return new Date(dt).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    }
    function adjustAllDayEnd(endDate: string, startDate: string): string | null {
      const d = new Date(endDate + "T00:00:00");
      d.setDate(d.getDate() - 1);
      const adjusted = d.toLocaleDateString("en-CA", { timeZone: TZ });
      return adjusted !== startDate ? adjusted : null;
    }

    for (const cal of targetCals) {
      const calId = cal.id!;
      const calName = (cal.summary || "").toLowerCase().trim();
      const eventsRes = await calendar.events.list({
        calendarId: calId,
        timeMin: `${start}T00:00:00+09:00`,
        timeMax: `${end}T23:59:59+09:00`,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 200,
      });
      for (const event of eventsRes.data.items || []) {
        const rawStart = event.start?.dateTime || event.start?.date || "";
        const rawEnd = event.end?.dateTime || event.end?.date || "";
        if (!rawStart) continue;

        const date = extractDate(rawStart);
        const startTime = extractTime(rawStart);
        const endTime = rawEnd ? extractTime(rawEnd) : null;
        let endDate: string | null = null;
        if (rawEnd) {
          if (rawEnd.includes("T")) {
            const d = extractDate(rawEnd);
            endDate = d !== date ? d : null;
          } else {
            endDate = adjustAllDayEnd(rawEnd, date);
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
    console.error("Personal calendar fetch failed:", err);
    return [];
  }
}
