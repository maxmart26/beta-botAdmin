import { config } from "../config.js";

// Minimal CalDAV read client for La Suite (Open-Xchange), used by the
// meeting-reminder feature (see docs/rappels-calendrier.md). Phase 1 (POC):
// fetch the events starting in a given time window via a REPORT
// calendar-query, then parse the returned iCalendar VEVENTs.

export interface CalEvent {
  uid: string;
  summary: string;
  start: Date | null;
  end: Date | null;
  location: string;
  organizer: string;
  attendees: string[];
  // First meeting URL found (LOCATION, X-*-URL, or a URL in DESCRIPTION).
  meetingUrl: string;
}

export interface CalDavResult {
  ok: boolean;
  status: number;
  events: CalEvent[];
  error?: string;
}

// A 2xx multistatus (207) or plain 200/201 is a success. Bug already hit in
// the doc: 201 was wrongly treated as an error.
function isCalDavOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function basicAuthHeader(): string | undefined {
  if (!config.caldav.user || !config.caldav.password) return undefined;
  const raw = `${config.caldav.user}:${config.caldav.password}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

// Format a Date as an iCalendar UTC timestamp: 20260715T133000Z.
function toICalUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Build the calendar-query REPORT body restricting to VEVENTs whose time
// overlaps [start, end].
function calendarQueryBody(start: Date, end: Date): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toICalUtc(start)}" end="${toICalUtc(end)}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}

// Query a calendar for events overlapping [start, end].
export async function fetchEvents(
  url: string,
  start: Date,
  end: Date,
): Promise<CalDavResult> {
  const auth = basicAuthHeader();
  if (!auth) {
    return {
      ok: false,
      status: 0,
      events: [],
      error: "CalDAV non configuré: CALDAV_USER / CALDAV_PASSWORD manquants",
    };
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "REPORT",
      headers: {
        Authorization: auth,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body: calendarQueryBody(start, end),
    });
  } catch (e) {
    return { ok: false, status: 0, events: [], error: String(e) };
  }
  const text = await res.text();
  if (!isCalDavOk(res.status)) {
    return {
      ok: false,
      status: res.status,
      events: [],
      error: text.slice(0, 500),
    };
  }
  const events = parseMultistatus(text);
  return { ok: true, status: res.status, events };
}

// Parse a DAV multistatus response body into a flat list of events. Exported
// so the parsing can be unit-tested without a live CalDAV server.
export function parseMultistatus(xml: string): CalEvent[] {
  return extractCalendarData(xml).flatMap(parseVEvents);
}

// Pull each <calendar-data> payload out of the DAV multistatus XML. We avoid a
// full XML parser (no dep) — the calendar-data is CDATA-free text between the
// element tags, possibly namespaced (cal:calendar-data, C:calendar-data, …).
function extractCalendarData(xml: string): string[] {
  const out: string[] = [];
  const re =
    /<(?:[a-zA-Z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?calendar-data>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXmlEntities(m[1]));
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

// Unfold RFC 5545 line folding: a CRLF followed by a space or tab continues
// the previous line.
function unfold(ical: string): string[] {
  return ical.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

// Parse every VEVENT block from an iCalendar string.
function parseVEvents(ical: string): CalEvent[] {
  const lines = unfold(ical);
  const events: CalEvent[] = [];
  let cur: Partial<CalEvent> & { attendees: string[] } = { attendees: [] };
  let inEvent = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = { attendees: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent) events.push(finalizeEvent(cur));
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const rawName = line.slice(0, idx);
    const value = line.slice(idx + 1);
    // Strip parameters after the property name (e.g. DTSTART;TZID=...:).
    const name = rawName.split(";")[0].toUpperCase();
    switch (name) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = unescapeText(value);
        break;
      case "DTSTART":
        cur.start = parseICalDate(rawName, value);
        break;
      case "DTEND":
        cur.end = parseICalDate(rawName, value);
        break;
      case "LOCATION":
        cur.location = unescapeText(value);
        break;
      case "ORGANIZER":
        cur.organizer = value.replace(/^mailto:/i, "");
        break;
      case "ATTENDEE":
        cur.attendees.push(value.replace(/^mailto:/i, ""));
        break;
      case "DESCRIPTION":
        if (!cur.meetingUrl) {
          const url = firstUrl(unescapeText(value));
          if (url) cur.meetingUrl = url;
        }
        break;
      default:
        // X-GOOGLE-CONFERENCE, X-MICROSOFT-SKYPETEAMSMEETINGURL, etc.
        if (name.startsWith("X-") && !cur.meetingUrl) {
          const url = firstUrl(value);
          if (url) cur.meetingUrl = url;
        }
    }
  }
  return events;
}

function finalizeEvent(cur: Partial<CalEvent> & { attendees: string[] }): CalEvent {
  const location = cur.location ?? "";
  const meetingUrl = cur.meetingUrl ?? firstUrl(location) ?? "";
  return {
    uid: cur.uid ?? "",
    summary: cur.summary ?? "(sans titre)",
    start: cur.start ?? null,
    end: cur.end ?? null,
    location,
    organizer: cur.organizer ?? "",
    attendees: cur.attendees,
    meetingUrl,
  };
}

function firstUrl(s: string): string {
  const m = s.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[.,;)]+$/, "") : "";
}

// Unescape RFC 5545 TEXT values: \\, \; \, \n.
function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parse an iCal date/date-time value. Handles:
//   20260715T133000Z          (UTC)
//   20260715T133000           (floating / local — treated as UTC for POC)
//   VALUE=DATE 20260715       (all-day)
function parseICalDate(rawName: string, value: string): Date | null {
  if (/VALUE=DATE(?![-])/i.test(rawName) || /^\d{8}$/.test(value)) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (!m) return null;
  return new Date(
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
  );
}
