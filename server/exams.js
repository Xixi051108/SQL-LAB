import { query, transaction, json } from "./db.js";
import { grade } from "./judge.js";
export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export async function getAttempt(id, user) {
  const rows = await query(
    "SELECT a.*,e.title,e.starts_at,e.ends_at FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=?",
    [id],
  );
  const attempt = rows[0];
  if (!attempt) throw fail("答卷不存在", 404);
  if (user.role !== "teacher" && attempt.user_id !== user.id)
    throw fail("无权查看此答卷", 403);
  return attempt;
}
export async function finalize(id) {
  return transaction(async (cx) => {
    const [a] = await query(
      "SELECT a.*,e.ends_at FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? FOR UPDATE",
      [id],
      cx,
    );
    if (!a) throw fail("答卷不存在", 404);
    if (a.status === "active") {
      const time = new Date(
        Math.min(Date.now(), new Date(a.ends_at).getTime()),
      );
      await query(
        "UPDATE attempts SET status='queued',submitted_at=? WHERE id=?",
        [time, id],
        cx,
      );
    }
    return id;
  });
}
export async function saveAnswers(id, user, answers) {
  if (!Array.isArray(answers) || answers.length > 50)
    throw fail("答案格式错误");
  let expired = false;
  await transaction(async (cx) => {
    const [a] = await query(
      "SELECT a.*,e.ends_at FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? FOR UPDATE",
      [id],
      cx,
    );
    if (!a || a.user_id !== user.id) throw fail("无权操作此答卷", 403);
    if (a.status !== "active") throw fail("已经交卷，不能修改", 409);
    if (new Date(a.ends_at).getTime() <= Date.now()) {
      await query(
        "UPDATE attempts SET status='queued',submitted_at=? WHERE id=?",
        [a.ends_at, id],
        cx,
      );
      expired = true;
      return;
    }
    const questions = await query(
      "SELECT id FROM exam_questions WHERE exam_id=?",
      [a.exam_id],
      cx,
    );
    const allowed = new Set(questions.map((q) => q.id));
    for (const answer of answers) {
      if (
        !allowed.has(Number(answer.question_id)) ||
        typeof answer.sql !== "string" ||
        answer.sql.length > 8000
      )
        throw fail("答案字段无效或不属于当前考试");
      await query(
        "INSERT INTO answers(attempt_id,exam_question_id,sql_text,saved_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE sql_text=VALUES(sql_text),saved_at=VALUES(saved_at)",
        [id, answer.question_id, answer.sql, new Date()],
        cx,
      );
    }
  });
  if (expired) throw fail("考试已经截止，已按最后保存的答案交卷", 409);
}
let workerBusy = false;
export async function processQueue() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const pending = await query(
      "SELECT id FROM attempts WHERE status='queued' ORDER BY submitted_at,id LIMIT 10",
    );
    for (const { id } of pending) {
      const lock = await query(
        "UPDATE attempts SET status='grading',error_message=NULL WHERE id=? AND status='queued'",
        [id],
      );
      if (!lock.affectedRows) continue;
      try {
        const [a] = await query("SELECT exam_id FROM attempts WHERE id=?", [
          id,
        ]);
        const questions = await query(
          "SELECT eq.*,a.sql_text FROM exam_questions eq LEFT JOIN answers a ON a.exam_question_id=eq.id AND a.attempt_id=? WHERE eq.exam_id=? ORDER BY eq.position",
          [id, a.exam_id],
        );
        const results = [];
        let score = 0;
        for (const q of questions) {
          const result = await grade(json(q.snapshot), q.sql_text || "");
          const points = result.passed ? q.points : 0;
          score += points;
          results.push({ id: q.id, sql: q.sql_text || "", points, ...result });
        }
        await transaction(async (cx) => {
          for (const r of results)
            await query(
              "INSERT INTO answers(attempt_id,exam_question_id,sql_text,saved_at,score,verdict,feedback) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),verdict=VALUES(verdict),feedback=VALUES(feedback)",
              [id, r.id, r.sql, new Date(), r.points, r.verdict, r.feedback],
              cx,
            );
          await query(
            "UPDATE attempts SET status='graded',score=?,error_message=NULL WHERE id=?",
            [score, id],
            cx,
          );
        });
      } catch (e) {
        console.error("判题任务失败", id, e.code || e.name);
        await query(
          "UPDATE attempts SET status='error',score=NULL,error_message=? WHERE id=?",
          ["判题未完成，请教师检查判题环境后重试；本次未记零分。", id],
        );
      }
    }
  } finally {
    workerBusy = false;
  }
}
export async function expireAttempts() {
  await query(
    "UPDATE attempts a JOIN exams e ON e.id=a.exam_id SET a.status='queued',a.submitted_at=e.ends_at WHERE a.status='active' AND e.ends_at<=?",
    [new Date()],
  );
}
export async function recoverQueue() {
  await query("UPDATE attempts SET status='queued' WHERE status='grading'");
  await expireAttempts();
}
