import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PendingInscriptions,
  extractCalDavUrl,
} from "../src/commands/rappels.js";

test("extractCalDavUrl: prefers a La Suite caldav URL over other links", () => {
  const body =
    "Voici mon lien: https://messagerie.numerique.gouv.fr/dav/caldav/abc123/ (cf https://autre.example.org/x)";
  assert.equal(
    extractCalDavUrl(body),
    "https://messagerie.numerique.gouv.fr/dav/caldav/abc123/",
  );
});

test("extractCalDavUrl: falls back to the first http(s) URL", () => {
  assert.equal(
    extractCalDavUrl("mon agenda: https://cal.example.org/dav/u1"),
    "https://cal.example.org/dav/u1",
  );
});

test("extractCalDavUrl: trims trailing punctuation", () => {
  assert.equal(
    extractCalDavUrl("(https://cal.example.org/dav/u1)."),
    "https://cal.example.org/dav/u1",
  );
});

test("extractCalDavUrl: returns null when there is no URL", () => {
  assert.equal(extractCalDavUrl("bonjour, je ne sais pas où le trouver"), null);
});

test("PendingInscriptions: awaits only in the DM room it was started for", () => {
  const p = new PendingInscriptions();
  const t0 = 1_000_000;
  p.start("@u:ex", "!dm:ex", t0);
  assert.equal(p.isAwaiting("@u:ex", "!dm:ex", t0), true);
  assert.equal(p.isAwaiting("@u:ex", "!autre:ex", t0), false);
  assert.equal(p.isAwaiting("@autre:ex", "!dm:ex", t0), false);
});

test("PendingInscriptions: clear() stops awaiting", () => {
  const p = new PendingInscriptions();
  const t0 = 1_000_000;
  p.start("@u:ex", "!dm:ex", t0);
  p.clear("@u:ex");
  assert.equal(p.isAwaiting("@u:ex", "!dm:ex", t0), false);
});

test("PendingInscriptions: entry expires after the TTL", () => {
  const p = new PendingInscriptions(1000);
  const t0 = 1_000_000;
  p.start("@u:ex", "!dm:ex", t0);
  assert.equal(p.isAwaiting("@u:ex", "!dm:ex", t0 + 500), true);
  assert.equal(p.isAwaiting("@u:ex", "!dm:ex", t0 + 1500), false);
});
