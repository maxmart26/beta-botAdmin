import { test } from "node:test";
import assert from "node:assert/strict";

import { parseListName, parseInviteArgs } from "../src/commands/membres.js";

test("parseListName: takes the argument after the verb", () => {
  assert.equal(parseListName("/liste-membre pole-tech"), "pole-tech");
});

test("parseListName: strips wrapping quotes (name with spaces)", () => {
  assert.equal(parseListName('/liste-membre "Pole Tech"'), "Pole Tech");
});

test("parseListName: empty when no argument", () => {
  assert.equal(parseListName("/liste-membre"), "");
});

test("parseInviteArgs: --salon target", () => {
  assert.deepEqual(parseInviteArgs("/invite pole-tech --salon MonSalon"), {
    liste: "pole-tech",
    kind: "salon",
    target: "MonSalon",
  });
});

test("parseInviteArgs: --espace target", () => {
  assert.deepEqual(parseInviteArgs("/invite pole-tech --espace MonEspace"), {
    liste: "pole-tech",
    kind: "espace",
    target: "MonEspace",
  });
});

test("parseInviteArgs: quoted list and target with spaces", () => {
  assert.deepEqual(
    parseInviteArgs('/invite "Pole Tech" --espace "Fabrique Numérique"'),
    { liste: "Pole Tech", kind: "espace", target: "Fabrique Numérique" },
  );
});

test("parseInviteArgs: room ID as target", () => {
  assert.deepEqual(
    parseInviteArgs("/invite pole-tech --salon !abc:serveur.fr"),
    { liste: "pole-tech", kind: "salon", target: "!abc:serveur.fr" },
  );
});

test("parseInviteArgs: null when no flag", () => {
  assert.equal(parseInviteArgs("/invite pole-tech MonSalon"), null);
});

test("parseInviteArgs: null when list missing", () => {
  assert.equal(parseInviteArgs("/invite --salon MonSalon"), null);
});
