// Pure parsing for `/invite <liste> --salon <nom>` / `--espace <nom>`.
// The bot parses + resolves the target room, then forwards to n8n (which reads
// the member list and performs the invitations).

export interface InviteArgs {
  liste: string;
  kind: "salon" | "espace";
  target: string;
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
