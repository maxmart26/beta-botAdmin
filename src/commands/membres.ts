import { listMembers, listNames } from "../tools/membres-store.js";

// /liste-membre <nom> — show the display names of a member list. Matrix IDs are
// never shown (they're only used for invitations by /invite and /salon --liste).

export interface CmdResult {
  reaction: string;
  message: string;
}

// Extract the list name from the raw command text (everything after the verb),
// stripping wrapping quotes so a name with spaces works.
export function parseListName(text: string): string {
  const arg = text.replace(/^\/\S+\s*/, "").trim();
  return arg.replace(/^["']|["']$/g, "").trim();
}

// Parse `/invite <liste> --salon <nom>` or `/invite <liste> --espace <nom>`.
// Returns null when the syntax doesn't match. Values may be quoted.
export function parseInviteArgs(
  text: string,
): { liste: string; kind: "salon" | "espace"; target: string } | null {
  const rawArg = text.replace(/^\/invite\s*/i, "").trim();
  const flag = rawArg.match(/\s--(salon|espace)\s+(.+)$/i);
  if (!flag) return null;
  const liste = rawArg
    .slice(0, flag.index)
    .trim()
    .replace(/^["']|["']$/g, "");
  const kind = flag[1]!.toLowerCase() as "salon" | "espace";
  const target = flag[2]!.trim().replace(/^["']|["']$/g, "");
  if (!liste || !target) return null;
  return { liste, kind, target };
}

export async function handleListeMembreCommand(text: string): Promise<CmdResult> {
  const liste = parseListName(text);
  if (!liste) {
    const names = await listNames().catch(() => []);
    const hint = names.length
      ? `\n\nListes disponibles : ${names.map((n) => `\`${n}\``).join(", ")}`
      : "";
    return {
      reaction: "❌",
      message: `❌ Usage : \`/liste-membre <nom>\`${hint}`,
    };
  }

  let membres;
  try {
    membres = await listMembers(liste);
  } catch (err) {
    return {
      reaction: "❌",
      message: `❌ Erreur d'accès à la liste : ${String(err instanceof Error ? err.message : err).slice(0, 200)}`,
    };
  }

  if (membres.length === 0) {
    const names = await listNames().catch(() => []);
    const hint = names.length
      ? `\n\nListes disponibles : ${names.map((n) => `\`${n}\``).join(", ")}`
      : "";
    return {
      reaction: "📭",
      message: `📭 Aucune liste **${liste}** (ou elle est vide).${hint}`,
    };
  }

  const noms = membres.map((m) => m.nom).join(", ");
  return {
    reaction: "📋",
    message: `📋 Liste **${liste}** (${membres.length} membre${membres.length > 1 ? "s" : ""}) : ${noms}`,
  };
}
