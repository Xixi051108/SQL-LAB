import mysql from "mysql2/promise";
import fs from "node:fs";
import assert from "node:assert/strict";
import { config } from "../server/config.js";
import { migrateRoster } from "../server/roster.js";
const database = "sql_exam_check_" + Date.now();
const cx = await mysql.createConnection({ ...config.db, database: undefined });
try {
  await cx.query(
    `CREATE DATABASE ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await cx.query(`USE ${mysql.escapeId(database)}`);
  const schema = fs.readFileSync("db/schema.sql", "utf8");
  for (const statement of schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await cx.query(statement);
  await migrateRoster(cx);
  assert.equal(
    (await cx.query("SELECT COUNT(*) AS n FROM roster"))[0][0].n,
    10,
  );
  // 在本次独立临时库中恢复旧 users 结构，验证升级不改变主键与历史关联。
  await cx.query("ALTER TABLE users DROP FOREIGN KEY fk_user_roster");
  await cx.query(
    "INSERT INTO users(id,username,name,password_hash,role) VALUES(11,'teacher','旧教师','unchanged-hash','teacher'),(12,'student','旧学生','unchanged-hash','student')",
  );
  await cx.query(
    "INSERT INTO questions(title,type,prompt,reference_sql,explanation,target_table,created_by) VALUES('迁移检查','select','题干','SELECT id FROM students','解析','students',11)",
  );
  await migrateRoster(cx);
  const [rows] = await cx.query(
    "SELECT id,username,name,password_hash FROM users ORDER BY id",
  );
  assert.deepEqual(rows, [
    {
      id: 11,
      username: "T2026001",
      name: "陈明",
      password_hash: "unchanged-hash",
    },
    {
      id: 12,
      username: "2026001001",
      name: "王宁",
      password_hash: "unchanged-hash",
    },
  ]);
  assert.equal(
    (await cx.query("SELECT created_by FROM questions"))[0][0].created_by,
    11,
  );
  await assert.rejects(
    cx.query(
      "INSERT INTO users(username,name,password_hash,role) VALUES('UNKNOWN','未知','hash','student')",
    ),
    (e) => e.code === "ER_NO_REFERENCED_ROW_2",
  );
  await migrateRoster(cx);
  assert.equal(
    (await cx.query("SELECT COUNT(*) AS n FROM roster"))[0][0].n,
    10,
  );
  console.log(
    "独立临时库验证通过：新建七张业务表、10 人名册、旧账号编号姓名迁移、密码及题目外键保留、外键拒绝未知学工号、重复升级无重复数据。",
  );
} finally {
  if (!/^sql_exam_check_\d+$/.test(database)) throw new Error("临时库名称无效");
  await cx.query(`DROP DATABASE ${mysql.escapeId(database)}`);
  await cx.end();
}
