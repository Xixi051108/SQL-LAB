import crypto from "node:crypto";
import { promisify } from "node:util";
import session from "express-session";
import { query, json } from "./db.js";
const scrypt = promisify(crypto.scrypt);
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, hash) {
  const [salt, stored] = hash.split(":");
  const candidate = await scrypt(password, salt, 64);
  const actual = Buffer.from(stored, "hex");
  return (
    actual.length === candidate.length &&
    crypto.timingSafeEqual(actual, candidate)
  );
}
export class MySQLSessionStore extends session.Store {
  get(sid, callback) {
    query("SELECT data FROM sessions WHERE sid=? AND expires_at>?", [
      sid,
      new Date(),
    ])
      .then((rows) => callback(null, rows[0] ? json(rows[0].data) : null))
      .catch(callback);
  }
  set(sid, data, callback = () => {}) {
    query(
      "INSERT INTO sessions(sid,data,expires_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),expires_at=VALUES(expires_at)",
      [sid, JSON.stringify(data), new Date(Date.now() + 12 * 3600000)],
    )
      .then(() => callback())
      .catch(callback);
  }
  destroy(sid, callback = () => {}) {
    query("DELETE FROM sessions WHERE sid=?", [sid])
      .then(() => callback())
      .catch(callback);
  }
  touch(sid, data, callback = () => {}) {
    query("UPDATE sessions SET expires_at=? WHERE sid=?", [
      new Date(Date.now() + 12 * 3600000),
      sid,
    ])
      .then(() => callback())
      .catch(callback);
  }
}
export function loggedIn(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "请先登录" });
  next();
}
export function teacher(req, res, next) {
  if (req.session.user?.role !== "teacher")
    return res.status(403).json({ error: "需要教师权限" });
  next();
}
export function student(req, res, next) {
  if (req.session.user?.role !== "student")
    return res.status(403).json({ error: "需要学生权限" });
  next();
}
