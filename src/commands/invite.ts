// Pure parsing for `/invite <liste> --salon <nom>` / `--espace <nom>`.
// The bot parses + resolves the target room, then forwards to n8n (which reads
// the member list and performs the invitations).

export interface InviteArgs {
  liste: string;
  kind: "salon" | "espace";
  target: string;
}

// True for `/invite`, `/invite help` or `/invite aide` (show the help card).
export function isInviteHelp(text: string): boolean {
  const arg = text.replace(/^\/invite\s*/i, "").trim().toLowerCase();
  return arg === "" || arg === "help" || arg === "aide";
}

export function buildInviteHelp(): string {
  return [
    "# `/invite` — inviter une liste de membres",
    "",
    "Invite tous les membres d'une **liste** dans un salon ou un espace.",
    "",
    "| Commande | Effet |",
    "|---|---|",
    "| `/invite <liste> --salon <nom>` | Invite la liste dans le **salon** <nom> |",
    "| `/invite <liste> --espace <nom>` | Invite la liste dans l'**espace** <nom> |",
    "| `/invite help` | Affiche cette aide |",
    "",
    "- Le salon/espace est cherché **sous l'espace géré** (par nom, ou ID `!…:serveur`).",
    "- Tu dois être **membre** du salon/espace ciblé.",
    "- Les listes se gèrent dans Grist ; vois les membres avec `/liste-membre <liste>`.",
    "- Un nom avec des espaces : entre guillemets — `/invite \"Pole Tech\" --espace \"Fabrique\"`.",
    "",
    "**Exemple** : `/invite pole-tech --salon Coordination`",
  ].join("\n");
}

// Returns null when the syntax doesn't match. Values may be quoted.
export function parseInviteArgs(text: string): InviteArgs | null {
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
