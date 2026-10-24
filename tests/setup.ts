import { randomBytes } from "node:crypto";

const k = () => randomBytes(32).toString("base64");
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://unused",
  FIELD_KEY_1: k(),
  FIELD_KEY_2: k(),
  FIELD_KEY_CURRENT: "1",
  BLIND_INDEX_KEY: k(),
  APP_URL: "http://localhost:3000",
});
