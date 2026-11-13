import test from "node:test";
import assert from "node:assert/strict";
import { validateSQL, normalizedRows, InvalidSQL } from "../server/judge.js";
import { hashPassword, verifyPassword } from "../server/auth.js";
import { pool } from "../server/db.js";
test.after(() => pool.end());
test("密码使用随机盐与 scrypt 验证", async () => {
  const a = await hashPassword("StrongPass123");
  const b = await hashPassword("StrongPass123");
  assert.notEqual(a, b);
  assert(await verifyPassword("StrongPass123", a));
  assert(!(await verifyPassword("bad", a)));
});
for (const sql of [
  "SELECT * FROM sql_exam.users",
  "SELECT * FROM mysql.user",
  "SELECT * FROM students; DROP TABLE students",
  "SELECT SLEEP(5)",
  "SELECT LOAD_FILE('/tmp/x')",
  "SELECT @@version",
  "SELECT * FROM students /*! INTO OUTFILE 'x' */",
  "SELECT * FROM students FOR UPDATE",
  "SELECT REPEAT('x',1000000)",
])
  test("拒绝危险 SQL：" + sql, () =>
    assert.throws(() => validateSQL(sql, "select"), InvalidSQL),
  );
test("允许别名、连接、聚合和单条末尾分号", () => {
  validateSQL(
    "SELECT s.id,COUNT(e.course_id) FROM students s LEFT JOIN enrollments e ON s.id=e.student_id GROUP BY s.id;",
    "select",
  );
});
test("类型必须与题目一致", () =>
  assert.throws(
    () => validateSQL("DROP TABLE students", "delete"),
    InvalidSQL,
  ));
test("字符串中的邮箱、注释符号和关键字不被误判", () => {
  validateSQL(
    "INSERT INTO old_records(id,note) VALUES(100,'engine user@example.com -- #')",
    "insert",
  );
});
test("比较保留重复行，无序题忽略顺序，有序题保留顺序", () => {
  assert.deepEqual(
    normalizedRows([[2], [1], [1]]),
    normalizedRows([[1], [2], [1]]),
  );
  assert.notDeepEqual(normalizedRows([[1], [1]]), normalizedRows([[1]]));
  assert.notDeepEqual(
    normalizedRows([[1], [2]], true),
    normalizedRows([[2], [1]], true),
  );
});
