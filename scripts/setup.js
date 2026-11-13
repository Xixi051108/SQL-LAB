import fs from "node:fs";
import mysql from "mysql2/promise";
import { config } from "../server/config.js";
import { pool, query } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { seedQuestions } from "../server/fixtures.js";
import { validateReference } from "../server/judge.js";
import { migrateRoster } from "../server/roster.js";
if (!config.judge.password)
  throw new Error(
    "缺少 JUDGE_PASSWORD；请运行 node scripts/init-env.js 并配置 .env",
  );
let admin;
try {
  admin = await mysql.createConnection({
    ...config.db,
    database: undefined,
    timezone: "Z",
    multipleStatements: false,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(config.db.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await admin.query(`USE ${mysql.escapeId(config.db.database)}`);
  const schema = fs.readFileSync("db/schema.sql", "utf8");
  for (const statement of schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await admin.query(statement);
  if (
    config.judge.host !== config.db.host ||
    config.judge.port !== config.db.port
  )
    throw new Error(
      "当前初始化器用于本机同实例判题；独立实例请先手动创建受限账号",
    );
  const existing = await admin.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=?",
    [config.judge.database],
  );
  const ownTables = new Set([
    "students",
    "courses",
    "enrollments",
    "old_records",
    "study_notes",
  ]);
  if (existing[0].some((t) => !ownTables.has(t.name)))
    throw new Error(
      "判题库包含非项目表，已停止。请在 .env 使用新的 JUDGE_DB 名称",
    );
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(config.judge.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  for (const host of ["localhost", "127.0.0.1"]) {
    const account = `${mysql.escape(config.judge.user)}@${mysql.escape(host)}`;
    await admin.query(
      `CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${mysql.escape(config.judge.password)}`,
    );
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,DROP,INDEX,REFERENCES ON ${mysql.escapeId(config.judge.database)}.* TO ${account}`,
    );
  }
  console.log("数据库表和受限判题账号已就绪。");
  await migrateRoster(admin);
  let [teacher] = await query("SELECT id FROM users WHERE username='T2026001'");
  if (!teacher) {
    const result = await query(
      "INSERT INTO users(username,name,password_hash,role) VALUES('T2026001','陈明',?,'teacher')",
      [await hashPassword(process.env.TEACHER_PASSWORD || "Teacher123!")],
    );
    teacher = { id: result.insertId };
  }
  const [student] = await query(
    "SELECT id FROM users WHERE username='2026001001'",
  );
  if (!student)
    await query(
      "INSERT INTO users(username,name,password_hash,role) VALUES('2026001001','王宁',?,'student')",
      [await hashPassword(process.env.STUDENT_PASSWORD || "Student123!")],
    );
  for (const q of seedQuestions) {
    const [exists] = await query("SELECT id FROM questions WHERE title=?", [
      q.title,
    ]);
    if (exists) continue;
    await validateReference(q);
    await query(
      "INSERT INTO questions(title,type,prompt,reference_sql,explanation,target_table,ordered,status,created_by) VALUES(?,?,?,?,?,?,?,'approved',?)",
      [
        q.title,
        q.type,
        q.prompt,
        q.reference_sql,
        q.explanation,
        q.target_table,
        Boolean(q.ordered),
        teacher.id,
      ],
    );
    console.log(`已验证并初始化：${q.title}`);
  }
  const [exam] = await query("SELECT id FROM exams LIMIT 1");
  if (!exam) {
    const result = await query(
      "INSERT INTO exams(title,starts_at,ends_at,status,created_by) VALUES(?,?,?,'published',?)",
      [
        "SQL 综合能力测验",
        new Date(Date.now() - 60000),
        new Date(Date.now() + 24 * 3600000),
        teacher.id,
      ],
    );
    const questions = await query(
      "SELECT * FROM questions WHERE status='approved' ORDER BY id LIMIT 7",
    );
    const points = [10, 10, 15, 10, 25, 20, 10];
    for (const [i, q] of questions.entries())
      await query(
        "INSERT INTO exam_questions(exam_id,question_id,position,points,snapshot) VALUES(?,?,?,?,?)",
        [result.insertId, q.id, i + 1, points[i], JSON.stringify(q)],
      );
  }
  console.log(
    "初始化完成。教师工号 T2026001、学生学号 2026001001，密码见本机 .env 中 TEACHER_PASSWORD / STUDENT_PASSWORD。",
  );
} catch (e) {
  console.error("初始化失败：", e.code || e.message);
  process.exitCode = 1;
} finally {
  await admin?.end();
  await pool.end();
}
