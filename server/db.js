import mysql from "mysql2/promise";
import { config } from "./config.js";
export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 8,
  timezone: "Z",
  charset: "utf8mb4",
  multipleStatements: false,
});
pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});
export async function query(sql, values = [], executor = pool) {
  const [rows] = await executor.execute(sql, values);
  return rows;
}
export async function transaction(fn) {
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    const result = await fn(cx);
    await cx.commit();
    return result;
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
}
export const json = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
