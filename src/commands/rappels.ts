// Inscription flow for meeting reminders (docs/rappels-calendrier.md §5.1).
//
// This module holds the parts that don't touch Matrix: the conversational
// state (who is waiting to send their CalDAV URL in a DM), URL extraction, and
// the message templates. The MatrixConnector wires these to the actual DM
// send/receive and the CalDAV test + Grist upsert.

// A user who ran /rappels-calendrier and now owes us a CalDAV URL in their DM.
interface Pending {
  dmRoomId: string;
  since: number;
}

// Tracks the in-flight inscriptions, keyed by Matrix user id. In-memory only:
// on a bot restart the user simply re-runs the command. A pending entry is
// dropped after `ttlMs` so a stale prompt doesn't capture an unrelated message
// weeks later.
export class PendingInscriptions {
  private readonly map = new Map<string, Pending>();

  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}

  start(userId: string, dmRoomId: string, now: number): void {
    this.map.set(userId, { dmRoomId, since: now });
  }

  // Is this user awaiting URL entry in this specific DM room (and not expired)?
  isAwaiting(userId: string, dmRoomId: string, now: number): boolean {
    const p = this.map.get(userId);
    if (!p) return false;
    if (now - p.since > this.ttlMs) {
      this.map.delete(userId);
      return false;
    }
    return p.dmRoomId === dmRoomId;
  }

  clear(userId: string): void {
    this.map.delete(userId);
  }
}

// Pull a CalDAV URL out of a free-text DM reply. Prefers a La Suite
// (messagerie.numerique.gouv.fr) DAV URL, else falls back to the first http(s)
// URL in the message. Trailing punctuation is trimmed.
export function extractCalDavUrl(body: string): string | null {
  const urls = body.match(/https?:\/\/\S+/g) ?? [];
  const cleaned = urls.map((u) => u.replace(/[.,;)\]]+$/, ""));
  const preferred = cleaned.find(
    (u) => /messagerie\.numerique\.gouv\.fr/i.test(u) && /caldav|dav/i.test(u),
  );
  return preferred ?? cleaned[0] ?? null;
}

// ─── Message templates ───────────────────────────────────────────────────────

export function buildWelcomeMessage(
  helpUrl: string,
  serviceAccount: string,
): string {
  return [
    "Bonjour 👋 Je viens vers toi pour configurer tes **rappels de réunion**.",
    "",
    "**2 étapes** :",
    `1. Partage ton agenda avec \`${serviceAccount}\` en **lecture seule** ` +
      "(menu de l'agenda → *Partage / Droits*).",
    "2. Envoie-moi ton **URL CalDAV** (menu de l'agenda → *Propriétés* → " +
      "champ *URL CalDAV*).",
    "",
    `Guide illustré : [trouver mon lien CalDAV](${helpUrl})`,
    "",
    "Colle simplement l'URL dans ce message privé, je m'occupe du reste.",
  ].join("\n");
}

// Shown in the OPS/command room where the command was typed.
export function buildStartedInRoomMessage(): string {
  return "📨 Je t'ai envoyé un message privé pour configurer tes rappels.";
}

export function buildNoUrlMessage(): string {
  return [
    "🤔 Je n'ai pas trouvé d'URL dans ton message.",
    "",
    "Envoie-moi le lien CalDAV complet (il commence par `https://`).",
  ].join("\n");
}

export function buildSuccessMessage(): string {
  return "✅ C'est bon, tu seras prévenu·e avant ton prochain rendez-vous.";
}

export function buildAccessErrorMessage(
  serviceAccount: string,
  contact?: string,
): string {
  const who = contact ? contact : "Maxime ou Julien";
  return [
    "⛔ Je n'arrive pas à lire ton agenda avec ce lien.",
    "",
    `As-tu bien partagé ton agenda avec \`${serviceAccount}\` en lecture ? ` +
      "C'est nécessaire pour que je puisse le lire.",
    "",
    `Si le souci persiste, préviens ${who}.`,
  ].join("\n");
}

export function buildStopMessage(): string {
  return "🔕 C'est noté, tu ne recevras plus de rappels. Retape `/rappels-calendrier` pour te réinscrire.";
}

export function buildStopNotFoundMessage(): string {
  return "ℹ️ Tu n'étais pas inscrit·e aux rappels.";
}
