import test from "node:test";
import assert from "node:assert/strict";
import { errorMessage, databaseStartupMessage } from "../src/errors.js";
import { loadConfig } from "../src/config.js";

test("une erreur de connexion agrégée sans message explique le refus", () => {
  const cause = Object.assign(new Error(), { code: "ECONNREFUSED" });
  assert.match(errorMessage(new AggregateError([cause])), /Connexion refusée/);
});

test("les erreurs gardent leur message ou un libellé non vide", () => {
  assert.equal(errorMessage(new Error("Token invalide")), "Token invalide");
  assert.equal(errorMessage(new AggregateError([])), "AggregateError");
  assert.equal(errorMessage(null), "Erreur inconnue");
});

const railwayConfig = {
  RAILWAY_PROJECT_ID: "project-test",
  DISCORD_TOKEN: "secret-test-token",
  DISCORD_CLIENT_ID: "123456789012345678",
  DEMO_MODE: "false",
};

test("Railway refuse les adresses PostgreSQL locales sans exposer le mot de passe", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "0.0.0.0",
    "[::]",
    "db.localhost",
  ]) {
    assert.throws(
      () =>
        loadConfig({
          ...railwayConfig,
          DATABASE_URL: `postgresql://user:secret-password@${host}:5432/rpg`,
        }),
      (error) => {
        assert.match(error.message, /adresse locale sur Railway/);
        assert.match(error.message, /\$\{\{Postgres.DATABASE_URL\}\}/);
        assert.doesNotMatch(error.message, /secret-password|secret-test-token/);
        return true;
      },
    );
  }
});

test("Railway accepte une base privée et exige une URL résolue et le mode persistant", () => {
  const valid = {
    ...railwayConfig,
    DATABASE_URL:
      "postgresql://user:password@postgres.railway.internal:5432/railway",
  };
  assert.equal(loadConfig(valid).railway, true);
  assert.equal(loadConfig(valid).production, true);
  assert.throws(() => loadConfig({ ...valid, DEMO_MODE: "true" }), /interdit/);
  assert.throws(
    () => loadConfig({ ...valid, DATABASE_URL: "${{Postgres.DATABASE_URL}}" }),
    /Add Reference/,
  );
  assert.throws(
    () => loadConfig({ ...valid, DATABASE_URL: "https://example.com" }),
    /URL PostgreSQL/,
  );
  assert.equal(
    loadConfig({
      ...valid,
      RAILWAY_PROJECT_ID: undefined,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/rpg",
    }).railway,
    false,
  );
});

test("une erreur PostgreSQL en production propose la référence de base et non le mode démo", () => {
  const error = new AggregateError([
    Object.assign(new Error(), { code: "ECONNREFUSED" }),
  ]);
  const message = databaseStartupMessage(error, {
    railway: true,
    production: true,
  });
  assert.match(message, /Add Reference/);
  assert.match(message, /DEMO_MODE=false/);
  assert.doesNotMatch(message, /DEMO_MODE=true/);
  assert.doesNotMatch(
    databaseStartupMessage(error, { production: true }),
    /DEMO_MODE=true/,
  );
  assert.match(databaseStartupMessage(error, {}), /DEMO_MODE=true/);
});
