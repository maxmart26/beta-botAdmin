import { config } from "../config.js";
import { listRecords, type GristRecord } from "../connectors/grist.js";

// Member lists stored in Grist (table `Membres`): one row per (person, list).
// Used by /liste-membre (display names), /invite and /salon --liste (invite the
// members' Matrix IDs into a room/space).

export interface Membre {
  nom: string;
  // Matrix ID — used for invitations, never shown to users.
  mxid: string;
}

const C = {
  liste: "Liste",
  nom: "Nom",
  mxid: "MatrixUserId",
} as const;

function toMembre(r: GristRecord): Membre {
  const f = r.fields;
  const mxid = String(f[C.mxid] ?? "").trim();
  const nom = String(f[C.nom] ?? "").trim();
  // Fall back to the localpart of the mxid when no display name is set.
  const fallback = mxid.replace(/^@/, "").split(":")[0] ?? mxid;
  return { nom: nom || fallback, mxid };
}

// Members of a named list. Rows without a Matrix ID are dropped (they can't be
// invited). Order follows Grist's row order.
export async function listMembers(liste: string): Promise<Membre[]> {
  const records = await listRecords(config.grist.tableMembres, {
    [C.liste]: [liste],
  });
  return records.map(toMembre).filter((m) => m.mxid.length > 0);
}

// Distinct list names present in the table (for help / "unknown list" hints).
export async function listNames(): Promise<string[]> {
  const records = await listRecords(config.grist.tableMembres);
  const names = new Set<string>();
  for (const r of records) {
    const l = String(r.fields[C.liste] ?? "").trim();
    if (l) names.add(l);
  }
  return [...names].sort();
}
