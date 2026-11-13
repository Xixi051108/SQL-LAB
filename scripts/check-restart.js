import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { once } from "node:events";
import { query, pool } from "../server/db.js";
let child, userId;
const exams = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function start() {
  child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "server/index.js"],
    {
      env: { ...process.env, PORT: "3101" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3101/api/health")).ok) return;
    } catch {}
    await pause(100);
  }
  throw new Error("测试服务未启动");
}
async function stop() {
  if (child && !child.killed) {
    const closed = once(child, "close");
    child.kill();
    await closed;
  }
}
function client() {
  let cookie = "";
  return async (path, method = "GET", body) => {
    const r = await fetch("http://127.0.0.1:3101/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  };
}
try {
  await start();
  const t = client(),
    s = client();
  await t("/auth/login", "POST", {
    username: "teacher",
    password: process.env.TEACHER_PASSWORD || "Teacher123!",
  });
  const u = await s("/auth/register", "POST", {
    username: "restart_" + Date.now(),
    name: "恢复测试",
    password: "Restart123!",
  });
  userId = u.user.id;
  const q = (await t("/questions")).find(
    (q) => q.type === "select" && q.status === "approved",
  );
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    const e = await t("/exams", "POST", {
      title: "重启测试 " + i,
      starts_at: new Date(Date.now() - 60000),
      ends_at: new Date(Date.now() + 3600000),
      questions: [{ id: q.id, points: 10 }],
    });
    exams.push(e.id);
    await t(`/exams/${e.id}/publish`, "POST", {});
    const a = await s(`/exams/${e.id}/start`, "POST", {});
    attempts.push(a.id);
    const detail = await s(`/attempts/${a.id}`);
    await s(`/attempts/${a.id}/answers`, "PUT", {
      answers: [{ question_id: detail.questions[0].id, sql: q.reference_sql }],
    });
  }
  await stop();
  await query(
    "UPDATE attempts SET status='grading',submitted_at=? WHERE id=?",
    [new Date(), attempts[0]],
  );
  await query("UPDATE exams SET starts_at=?,ends_at=? WHERE id=?", [
    new Date(Date.now() - 120000),
    new Date(Date.now() - 60000),
    exams[1],
  ]);
  await start();
  assert.equal((await s("/auth/me")).user.id, userId);
  for (let i = 0; i < 100; i++) {
    const results = await Promise.all(
      attempts.map((id) => s(`/attempts/${id}`)),
    );
    if (results.every((r) => r.status === "graded")) {
      for (const r of results) assert.equal(r.score, 10);
      break;
    }
    if (i === 99) throw new Error("恢复任务未完成");
    await pause(100);
  }
  console.log(
    "真实进程重启检查通过：登录会话保留，中断判题任务恢复，离线期间到期答卷按最后保存答案交卷，成绩正确。",
  );
} catch (e) {
  console.error("重启检查失败：" + e.message);
  process.exitCode = 1;
} finally {
  await stop();
  for (const id of exams) {
    await query(
      "DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id=?)",
      [id],
    );
    await query("DELETE FROM attempts WHERE exam_id=?", [id]);
    await query("DELETE FROM exam_questions WHERE exam_id=?", [id]);
    await query("DELETE FROM exams WHERE id=?", [id]);
  }
  if (userId) await query("DELETE FROM users WHERE id=?", [userId]);
  await pool.end();
}
