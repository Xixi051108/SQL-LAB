import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { createApp } from "../server/app.js";
import { query, pool } from "../server/db.js";
import { config } from "../server/config.js";
import { grade } from "../server/judge.js";
import { seedQuestions } from "../server/fixtures.js";
import { expireAttempts, processQueue, recoverQueue } from "../server/exams.js";
let server, base;
const users = [],
  examIds = [],
  questionIds = [];
const wrong = [
  "SELECT * FROM students",
  "INSERT INTO students VALUES(100,'新同学','软件工程',21)",
  "UPDATE enrollments SET score=score+5",
  "DELETE FROM old_records",
  "CREATE TABLE study_notes(id INT PRIMARY KEY,student_id INT NOT NULL,content VARCHAR(200) NOT NULL)",
  "ALTER TABLE students ADD COLUMN email VARCHAR(100) NULL",
  "DROP TABLE enrollments",
];
test.before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
  for (const id of examIds) {
    await query(
      "DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id=?)",
      [id],
    );
    await query("DELETE FROM attempts WHERE exam_id=?", [id]);
    await query("DELETE FROM exam_questions WHERE exam_id=?", [id]);
    await query("DELETE FROM exams WHERE id=?", [id]);
  }
  for (const id of questionIds)
    await query("DELETE FROM questions WHERE id=?", [id]);
  for (const id of users) await query("DELETE FROM users WHERE id=?", [id]);
  await new Promise((r) => server.close(r));
  await pool.end();
});
function client() {
  let cookie = "";
  return async (path, method = "GET", body) => {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data: await response.json() };
  };
}
async function register(c) {
  const username =
    "test_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const r = await c("/auth/register", "POST", {
    username,
    name: "测试学生",
    password: "Pass12345!",
  });
  assert.equal(r.status, 201);
  users.push(r.data.user.id);
  return r.data.user;
}
async function teacher() {
  const c = client();
  assert.equal(
    (
      await c("/auth/login", "POST", {
        username: "teacher",
        password: process.env.TEACHER_PASSWORD || "Teacher123!",
      })
    ).status,
    200,
  );
  return c;
}
async function makeExam(t, questions, delta = 3600000) {
  const r = await t("/exams", "POST", {
    title: "集成测试 " + Date.now(),
    starts_at: new Date(Date.now() - 60000),
    ends_at: new Date(Date.now() + delta),
    questions: questions.map((q) => ({ id: q.id, points: 10 })),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  examIds.push(r.data.id);
  assert.equal(
    (await t(`/exams/${r.data.id}/publish`, "POST", {})).status,
    200,
  );
  return r.data.id;
}
for (const [i, q] of seedQuestions.entries())
  test("真实 MySQL 判题：" + q.type + " 正确及错误答案", async () => {
    assert.equal((await grade(q, q.reference_sql)).verdict, "correct");
    assert.equal((await grade(q, wrong[i])).verdict, "wrong");
  });
test("等价 SQL、别名和不同约束名称可通过", async () => {
  assert.equal(
    (
      await grade(
        seedQuestions[0],
        "SELECT s.id,s.name,s.age FROM students AS s WHERE s.major IN ('计算机') ORDER BY s.id ASC",
      )
    ).verdict,
    "correct",
  );
  assert.equal(
    (
      await grade(
        seedQuestions[4],
        "CREATE TABLE study_notes (id INTEGER PRIMARY KEY,student_id INT NOT NULL,content VARCHAR(200) NOT NULL,CONSTRAINT other_name FOREIGN KEY(student_id) REFERENCES students(id))",
      )
    ).verdict,
    "correct",
  );
});
test("真实 MySQL 比较重复行及排序", async () => {
  const q = {
    ...seedQuestions[0],
    reference_sql: "SELECT major FROM students",
    ordered: false,
  };
  assert.equal(
    (await grade(q, "SELECT DISTINCT major FROM students")).verdict,
    "wrong",
  );
  assert.equal(
    (
      await grade(
        seedQuestions[0],
        "SELECT id,name,age FROM students WHERE major='计算机' ORDER BY id DESC",
      )
    ).verdict,
    "wrong",
  );
});
test("每次判题恢复初始环境", async () => {
  await grade(seedQuestions[6], seedQuestions[6].reference_sql);
  assert.equal(
    (await grade(seedQuestions[3], seedQuestions[3].reference_sql)).verdict,
    "correct",
  );
});
test("改表支持修改/删除列、增删主外键与唯一约束", async () => {
  for (const sql of [
    "ALTER TABLE students MODIFY COLUMN age SMALLINT NULL",
    "ALTER TABLE students DROP COLUMN age",
    "ALTER TABLE old_records DROP PRIMARY KEY",
    "ALTER TABLE enrollments DROP FOREIGN KEY fk_student",
    "ALTER TABLE old_records ADD COLUMN student_id INT NULL, ADD FOREIGN KEY(student_id) REFERENCES students(id)",
    "ALTER TABLE courses ADD UNIQUE(name)",
  ]) {
    const q = { ...seedQuestions[5], reference_sql: sql };
    assert.equal((await grade(q, sql)).verdict, "correct", sql);
  }
});
test("判题账号不能读取业务库", async () => {
  const cx = await mysql.createConnection(config.judge);
  try {
    await assert.rejects(
      cx.query(`SELECT * FROM ${mysql.escapeId(config.db.database)}.users`),
      (e) =>
        ["ER_TABLEACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR"].includes(
          e.code,
        ),
    );
  } finally {
    await cx.end();
  }
});
test("真实执行超时被终止，后续判题仍然可用", async () => {
  const timeout = config.timeout;
  config.timeout = 100;
  try {
    const huge =
      "SELECT COUNT(*) FROM " +
      Array.from({ length: 12 }, (_, i) => "students s" + i).join(
        " CROSS JOIN ",
      );
    assert.equal(
      (
        await grade(
          { ...seedQuestions[0], reference_sql: "SELECT 1", ordered: false },
          huge,
        )
      ).verdict,
      "wrong",
    );
  } finally {
    config.timeout = timeout;
  }
  assert.equal(
    (await grade(seedQuestions[0], seedQuestions[0].reference_sql)).verdict,
    "correct",
  );
});
test("流式结果上限保护", async () => {
  const huge =
    "SELECT a.id FROM students a CROSS JOIN students b CROSS JOIN students c CROSS JOIN students d CROSS JOIN students e CROSS JOIN students f";
  const r = await grade(
    { ...seedQuestions[0], reference_sql: "SELECT 1", ordered: false },
    huge,
  );
  assert.equal(r.verdict, "wrong");
  assert.match(r.feedback, /结果过大/);
});
test("注册、权限、题库 CRUD、审核、快照及完整交卷计分", async () => {
  const t = await teacher(),
    a = client(),
    b = client();
  await register(a);
  await register(b);
  assert.equal((await a("/questions")).status, 403);
  assert.equal(
    (await a("/questions/generate", "POST", { type: "select" })).status,
    403,
  );
  const created = await t("/questions", "POST", {
    ...seedQuestions[0],
    ordered: true,
  });
  assert.equal(created.status, 201);
  questionIds.push(created.data.id);
  assert.equal(
    (await t(`/questions/${created.data.id}/approve`, "POST", {})).status,
    200,
  );
  const q = { id: created.data.id };
  const examId = await makeExam(t, [q]);
  assert.equal(
    (
      await t(`/questions/${q.id}`, "PUT", {
        ...seedQuestions[0],
        ordered: true,
        title: "已编辑的新标题",
      })
    ).status,
    200,
  );
  const start = await a(`/exams/${examId}/start`, "POST", {});
  assert.equal(start.status, 200);
  const aid = start.data.id;
  assert.equal((await a(`/exams/${examId}/start`, "POST", {})).data.id, aid);
  const details = await a(`/attempts/${aid}`);
  assert.equal(details.data.questions[0].title, seedQuestions[0].title);
  assert(!("reference_sql" in details.data.questions[0]));
  assert(!JSON.stringify(details.data).includes("reference_sql"));
  assert.equal((await b(`/attempts/${aid}`)).status, 403);
  assert.equal((await b(`/attempts/${aid}/submit`, "POST", {})).status, 403);
  const eqid = details.data.questions[0].id;
  assert.equal(
    (
      await a(`/attempts/${aid}/answers`, "PUT", {
        answers: [{ question_id: eqid, sql: seedQuestions[0].reference_sql }],
      })
    ).status,
    200,
  );
  assert.equal(
    (await a(`/attempts/${aid}`)).data.questions[0].sql,
    seedQuestions[0].reference_sql,
  );
  assert.equal((await a(`/attempts/${aid}/submit`, "POST", {})).status, 200);
  assert.equal((await a(`/attempts/${aid}/submit`, "POST", {})).status, 200);
  await processQueue();
  const result = await a(`/attempts/${aid}`);
  assert.equal(result.data.status, "graded");
  assert.equal(result.data.score, 10);
  assert.equal(
    result.data.questions[0].reference_sql,
    seedQuestions[0].reference_sql,
  );
  assert.equal(
    (
      await a(`/attempts/${aid}/answers`, "PUT", {
        answers: [{ question_id: eqid, sql: "SELECT 1" }],
      })
    ).status,
    409,
  );
  assert.equal((await t(`/questions/${q.id}`, "DELETE", {})).status, 200);
  assert.equal(
    (await a(`/attempts/${aid}`)).data.questions[0].reference_sql,
    seedQuestions[0].reference_sql,
  );
});
test("截止后拒绝写入，并按最后保存答案自动交卷", async () => {
  const t = await teacher(),
    a = client();
  await register(a);
  const bank = (await t("/questions")).data;
  const q = bank.find((x) => x.type === "select" && x.status === "approved");
  const eid = await makeExam(t, [q]);
  const aid = (await a(`/exams/${eid}/start`, "POST", {})).data.id;
  const eq = (await a(`/attempts/${aid}`)).data.questions[0];
  await a(`/attempts/${aid}/answers`, "PUT", {
    answers: [{ question_id: eq.id, sql: q.reference_sql }],
  });
  await query("UPDATE exams SET starts_at=?,ends_at=? WHERE id=?", [
    new Date(Date.now() - 120000),
    new Date(Date.now() - 60000),
    eid,
  ]);
  assert.equal(
    (
      await a(`/attempts/${aid}/answers`, "PUT", {
        answers: [{ question_id: eq.id, sql: "SELECT 1" }],
      })
    ).status,
    409,
  );
  await expireAttempts();
  await processQueue();
  const r = await a(`/attempts/${aid}`);
  assert.equal(r.data.score, 10);
  assert.equal(r.data.questions[0].sql, q.reference_sql);
  const b = client();
  await register(b);
  assert.equal((await b(`/exams/${eid}/start`, "POST", {})).status, 409);
});
test("DeepSeek 不可用时，已发布考试仍可提交并计分", async () => {
  const previous = config.deepseek.key;
  config.deepseek.key = "";
  try {
    const t = await teacher(), a = client();
    assert.equal((await t("/questions/generate", "POST", { type: "select" })).status, 503);
    await register(a);
    const q = (await t("/questions")).data.find(x => x.type === "select" && x.status === "approved");
    const eid = await makeExam(t, [q]);
    const aid = (await a(`/exams/${eid}/start`, "POST", {})).data.id;
    const eq = (await a(`/attempts/${aid}`)).data.questions[0];
    await a(`/attempts/${aid}/submit`, "POST", { answers: [{ question_id: eq.id, sql: q.reference_sql }] });
    await processQueue();
    const result = await a(`/attempts/${aid}`);
    assert.equal(result.data.status, "graded");
    assert.equal(result.data.score, 10);
  } finally { config.deepseek.key = previous; }
});
test("判题异常保留空成绩，教师可重试；恢复函数找回中断任务", async () => {
  const t = await teacher(),
    a = client();
  await register(a);
  const q = (await t("/questions")).data.find((x) => x.status === "approved");
  const eid = await makeExam(t, [q]);
  const aid = (await a(`/exams/${eid}/start`, "POST", {})).data.id;
  const eq = (await a(`/attempts/${aid}`)).data.questions[0];
  await a(`/attempts/${aid}/submit`, "POST", {
    answers: [{ question_id: eq.id, sql: q.reference_sql }],
  });
  const password = config.judge.password;
  config.judge.password = "invalid-test-password";
  try {
    await processQueue();
  } finally {
    config.judge.password = password;
  }
  const r = await a(`/attempts/${aid}`);
  assert.equal(r.data.status, "error");
  assert.equal(r.data.score, null);
  assert.equal((await a(`/attempts/${aid}/retry`, "POST", {})).status, 403);
  assert.equal((await t(`/attempts/${aid}/retry`, "POST", {})).status, 200);
  await query("UPDATE attempts SET status='grading' WHERE id=?", [aid]);
  await recoverQueue();
  await processQueue();
  assert.equal((await a(`/attempts/${aid}`)).data.status, "graded");
});
