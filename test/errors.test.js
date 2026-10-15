import test from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../src/errors.js";

test("une erreur de connexion agrégée sans message explique le refus", () => {
  const cause = Object.assign(new Error(), { code: "ECONNREFUSED" });
  assert.match(errorMessage(new AggregateError([cause])), /Connexion refusée/);
});

test("les erreurs gardent leur message ou un libellé non vide", () => {
  assert.equal(errorMessage(new Error("Token invalide")), "Token invalide");
  assert.equal(errorMessage(new AggregateError([])), "AggregateError");
  assert.equal(errorMessage(null), "Erreur inconnue");
});
