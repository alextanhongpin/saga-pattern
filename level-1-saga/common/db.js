import pg from "pg";

export default function createDb() {
  const client = new pg.Client({
    password: process.env.DB_PASS,
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    timeout: 10
  });
  client.connect();
  return client;
}
