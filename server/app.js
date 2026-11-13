import express from "express";
import session from "express-session";
import path from "node:path";
import { config } from "./config.js";
import { query, transaction, json } from "./db.js";
import {
  MySQLSessionStore,
  hashPassword,
  verifyPassword,
  loggedIn,
  teacher,
  student,
} from "./auth.js";
import { schemaDescription, targets } from "./fixtures.js";
import {
  validateSQL,
  validateReference,
  InvalidSQL,
  JudgeUnavailable,
} from "./judge.js";
import { generateQuestion } from "./ai.js";
import {
  fail,
  getAttempt,
  finalize,
  saveAnswers,
  expireAttempts,
} from "./exams.js";

export const types = [
  "select",
  "insert",
  "update",
  "delete",
  "create_table",
  "alter_table",
  "drop_table",
];
function text(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(`${label}不能为空，且不能超过 ${max} 字符`);
  return value.trim();
}
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw fail("编号无效");
  return n;
}
function questionInput(body) {
  if (
    !types.includes(body.type) ||
    !targets.includes(body.target_table) ||
    typeof body.ordered !== "boolean"
  )
    throw fail("题型、目标表或排序设置无效");
  const q = {
    title: text(body.title, "标题"),
    type: body.type,
    prompt: text(body.prompt, "题干", 6000),
    reference_sql: text(body.reference_sql, "参考 SQL", 8000),
    explanation: text(body.explanation, "解析", 6000),
    target_table: body.target_table,
    ordered: body.ordered,
    source: body.source === "deepseek" ? "deepseek" : "manual",
  };
  validateSQL(q.reference_sql, q.type);
  return q;
}
export function createApp() {
  if (!config.sessionSecret || config.sessionSecret.length < 32)
    throw new Error("请运行 node scripts/init-env.js 创建 SESSION_SECRET");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(express.json({ limit: "500kb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const allowed = new Set([
        `http://127.0.0.1:${config.port}`,
        `http://localhost:${config.port}`,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
      ]);
      if (req.headers.origin && !allowed.has(req.headers.origin))
        return res.status(403).json({ error: "请求来源不允许" });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "请使用 JSON 请求" });
    }
    next();
  });
  app.use(
    session({
      store: new MySQLSessionStore(),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        maxAge: 12 * 3600000,
      },
      name: "sql_lab.sid",
    }),
  );
  const authLimits = new Map();
  app.use(["/api/auth/login", "/api/auth/register"], (req, res, next) => {
    const key = req.ip;
    let entry = authLimits.get(key);
    if (!entry || entry.until < Date.now()) {
      entry = { count: 0, until: Date.now() + 15 * 60000 };
      authLimits.set(key, entry);
    }
    if (authLimits.size > 1000)
      for (const [k, v] of authLimits)
        if (v.until < Date.now()) authLimits.delete(k);
    if (++entry.count > 60)
      return res.status(429).json({ error: "请求过于频繁，请 15 分钟后重试" });
    next();
  });
  app.get("/api/health", async (req, res) => {
    await query("SELECT 1");
    res.json({ ok: true, server_time: new Date() });
  });
  app.get("/api/auth/me", async (req, res, next) => {
    if (!req.session.user) return res.json({ user: null });
    await loggedIn(req, res, () => res.json({ user: req.session.user }));
  });
  async function loginSession(req, user) {
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    };
    await new Promise((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    return req.session.user;
  }
  app.post("/api/auth/register", async (req, res) => {
    const username = text(req.body.username, "学号/工号", 32).toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(username))
      throw fail("学号/工号应为 3–32 位字母、数字、下划线或连字符");
    const name = text(req.body.name, "姓名", 40);
    const password = text(req.body.password, "密码", 128);
    if (password.length < 8) throw fail("密码至少 8 位");
    const hash = await hashPassword(password);
    const created = await transaction(async (cx) => {
      const [entry] = await query(
        "SELECT * FROM roster WHERE number=? FOR UPDATE",
        [username],
        cx,
      );
      if (!entry || !entry.enabled || entry.name !== name)
        throw fail("学号/工号与姓名不匹配，或不在可注册名单中", 403);
      const result = await query(
        "INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)",
        [entry.number, entry.name, hash, entry.role],
        cx,
      );
      return {
        id: result.insertId,
        username: entry.number,
        name: entry.name,
        role: entry.role,
      };
    });
    res.status(201).json({
      user: await loginSession(req, created),
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    const username = text(req.body.username, "学号/工号", 32).toUpperCase(),
      password = text(req.body.password, "密码", 128);
    const [user] = await query(
      "SELECT u.id,u.username,u.password_hash,r.name,r.role,r.enabled FROM users u JOIN roster r ON r.number=u.username WHERE u.username=?",
      [username],
    );
    if (
      !user ||
      !user.enabled ||
      !(await verifyPassword(password, user.password_hash))
    )
      throw fail("学号/工号或密码错误，或账号已停用", 401);
    res.json({ user: await loginSession(req, user) });
  });
  app.post("/api/auth/logout", loggedIn, async (req, res) => {
    await new Promise((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.clearCookie("sql_lab.sid");
    res.json({ ok: true });
  });
  app.use("/api", loggedIn);
  app.get("/api/roster", teacher, async (req, res) =>
    res.json(
      await query(
        "SELECT r.*,u.id AS user_id FROM roster r LEFT JOIN users u ON u.username=r.number ORDER BY r.role,r.number",
      ),
    ),
  );
  function rosterInput(body) {
    const number = text(body.number, "学号/工号", 32).toUpperCase();
    if (
      !/^[A-Z0-9_-]{3,32}$/.test(number) ||
      !["teacher", "student"].includes(body.role) ||
      typeof body.enabled !== "boolean"
    )
      throw fail("名册编号、身份或启用状态无效");
    return {
      number,
      name: text(body.name, "姓名", 40),
      role: body.role,
      enabled: body.enabled,
    };
  }
  app.post("/api/roster", teacher, async (req, res) => {
    const r = rosterInput(req.body);
    const result = await query(
      "INSERT INTO roster(number,name,role,enabled) VALUES(?,?,?,?)",
      [r.number, r.name, r.role, r.enabled],
    );
    res.status(201).json({ id: result.insertId });
  });
  app.put("/api/roster/:id", teacher, async (req, res) => {
    const r = rosterInput(req.body);
    await transaction(async (cx) => {
      const [entry] = await query(
        "SELECT * FROM roster WHERE id=? FOR UPDATE",
        [id(req.params.id)],
        cx,
      );
      if (!entry) throw fail("名单记录不存在", 404);
      const [user] = await query(
        "SELECT id FROM users WHERE username=?",
        [entry.number],
        cx,
      );
      if (user && (r.number !== entry.number || r.role !== entry.role))
        throw fail("已注册人员的编号和身份不能修改", 409);
      if (user?.id === req.session.user.id && !r.enabled)
        throw fail("不能停用当前登录账号", 409);
      await query(
        "UPDATE roster SET number=?,name=?,role=?,enabled=? WHERE id=?",
        [r.number, r.name, r.role, r.enabled, entry.id],
        cx,
      );
      if (user) {
        await query(
          "UPDATE users SET name=? WHERE id=?",
          [r.name, user.id],
          cx,
        );
        await query(
          "DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(data,'$.user.id'))=?",
          [String(user.id)],
          cx,
        );
      }
    });
    res.json({ ok: true });
  });
  app.delete("/api/roster/:id", teacher, async (req, res) => {
    const r = await query(
      "DELETE r FROM roster r LEFT JOIN users u ON u.username=r.number WHERE r.id=? AND u.id IS NULL",
      [id(req.params.id)],
    );
    if (!r.affectedRows) throw fail("已注册人员不能删除，请改为停用", 409);
    res.json({ ok: true });
  });
  app.get("/api/schema", (req, res) =>
    res.json({ description: schemaDescription, types, targets }),
  );
  app.get("/api/system", teacher, async (req, res) => {
    const { createConnection } = await import("mysql2/promise");
    let judge = false;
    try {
      const cx = await createConnection({
        ...config.judge,
        connectTimeout: 2000,
      });
      await cx.query("SELECT 1");
      await cx.end();
      judge = true;
    } catch {}
    res.json({
      database: true,
      judge,
      deepseek: Boolean(config.deepseek.key),
      model: config.deepseek.model,
      server_time: new Date(),
    });
  });
  app.get("/api/questions", teacher, async (req, res) =>
    res.json(await query("SELECT * FROM questions ORDER BY id DESC")),
  );
  app.post("/api/questions/generate", teacher, async (req, res) => {
    if (!types.includes(req.body.type)) throw fail("请选择有效题型");
    const requirement =
      typeof req.body.requirement === "string"
        ? req.body.requirement.slice(0, 1000)
        : "";
    res.json(await generateQuestion(req.body.type, requirement));
  });
  app.post("/api/questions", teacher, async (req, res) => {
    const q = questionInput(req.body);
    const result = await query(
      "INSERT INTO questions(title,type,prompt,reference_sql,explanation,target_table,ordered,source,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        q.title,
        q.type,
        q.prompt,
        q.reference_sql,
        q.explanation,
        q.target_table,
        q.ordered,
        q.source,
        req.session.user.id,
      ],
    );
    res.status(201).json({ id: result.insertId });
  });
  app.put("/api/questions/:id", teacher, async (req, res) => {
    const q = questionInput(req.body);
    const result = await query(
      "UPDATE questions SET title=?,type=?,prompt=?,reference_sql=?,explanation=?,target_table=?,ordered=?,source=?,status='draft' WHERE id=?",
      [
        q.title,
        q.type,
        q.prompt,
        q.reference_sql,
        q.explanation,
        q.target_table,
        q.ordered,
        q.source,
        id(req.params.id),
      ],
    );
    if (!result.affectedRows) throw fail("题目不存在", 404);
    res.json({ ok: true });
  });
  app.post("/api/questions/:id/approve", teacher, async (req, res) => {
    const [q] = await query("SELECT * FROM questions WHERE id=?", [
      id(req.params.id),
    ]);
    if (!q) throw fail("题目不存在", 404);
    await validateReference(q);
    // 验证期间发生编辑时，不把旧版本审核结果写回新题目。
    const update = await query(
      "UPDATE questions SET status='approved' WHERE id=? AND reference_sql=? AND prompt=? AND type=? AND ordered=?",
      [q.id, q.reference_sql, q.prompt, q.type, q.ordered],
    );
    if (!update.affectedRows) throw fail("题目已变更，请重新审核", 409);
    res.json({ ok: true });
  });
  app.delete("/api/questions/:id", teacher, async (req, res) => {
    const result = await query("DELETE FROM questions WHERE id=?", [
      id(req.params.id),
    ]);
    if (!result.affectedRows) throw fail("题目不存在", 404);
    res.json({ ok: true });
  });
  app.get("/api/exams", async (req, res) => {
    await expireAttempts();
    const user = req.session.user;
    const rows = await query(
      `SELECT e.*, (SELECT COUNT(*) FROM exam_questions WHERE exam_id=e.id) AS question_count,(SELECT COALESCE(SUM(points),0) FROM exam_questions WHERE exam_id=e.id) AS total_points,a.id AS attempt_id,a.status AS attempt_status,a.score FROM exams e LEFT JOIN attempts a ON a.exam_id=e.id AND a.user_id=? ${user.role === "student" ? "WHERE e.status='published'" : ""} ORDER BY e.id DESC`,
      [user.id],
    );
    res.json({ exams: rows, server_time: new Date() });
  });
  async function writeExam(body, userId, examId) {
    const title = text(body.title, "考试名称");
    const starts = new Date(body.starts_at),
      ends = new Date(body.ends_at);
    if (
      !Number.isFinite(starts.getTime()) ||
      !Number.isFinite(ends.getTime()) ||
      ends <= starts ||
      ends <= new Date()
    )
      throw fail("考试结束时间须晚于开始时间及当前时间");
    if (
      !Array.isArray(body.questions) ||
      !body.questions.length ||
      body.questions.length > 50
    )
      throw fail("请选择 1–50 道已审核题目");
    const selections = body.questions.map((q) => ({
      id: id(q.id),
      points: Number(q.points),
    }));
    if (
      new Set(selections.map((q) => q.id)).size !== selections.length ||
      selections.some(
        (q) => !Number.isInteger(q.points) || q.points < 1 || q.points > 100,
      )
    )
      throw fail("题目不能重复，每题分值应为 1–100 的整数");
    return transaction(async (cx) => {
      if (examId) {
        const [existing] = await query(
          "SELECT status FROM exams WHERE id=? FOR UPDATE",
          [examId],
          cx,
        );
        if (!existing) throw fail("考试不存在", 404);
        if (existing.status !== "draft") throw fail("已发布考试不可修改", 409);
        await query(
          "UPDATE exams SET title=?,starts_at=?,ends_at=? WHERE id=?",
          [title, starts, ends, examId],
          cx,
        );
        await query("DELETE FROM exam_questions WHERE exam_id=?", [examId], cx);
      } else {
        const result = await query(
          "INSERT INTO exams(title,starts_at,ends_at,created_by) VALUES(?,?,?,?)",
          [title, starts, ends, userId],
          cx,
        );
        examId = result.insertId;
      }
      for (const [index, selection] of selections.entries()) {
        const [q] = await query(
          "SELECT * FROM questions WHERE id=? AND status='approved' FOR SHARE",
          [selection.id],
          cx,
        );
        if (!q) throw fail("所选题目不存在或未审核，请刷新题库");
        await query(
          "INSERT INTO exam_questions(exam_id,question_id,position,points,snapshot) VALUES(?,?,?,?,?)",
          [examId, q.id, index + 1, selection.points, JSON.stringify(q)],
          cx,
        );
      }
      return examId;
    });
  }
  app.post("/api/exams", teacher, async (req, res) =>
    res
      .status(201)
      .json({ id: await writeExam(req.body, req.session.user.id) }),
  );
  app.put("/api/exams/:id", teacher, async (req, res) =>
    res.json({
      id: await writeExam(req.body, req.session.user.id, id(req.params.id)),
    }),
  );
  app.get("/api/exams/:id", teacher, async (req, res) => {
    const [exam] = await query("SELECT * FROM exams WHERE id=?", [
      id(req.params.id),
    ]);
    if (!exam) throw fail("考试不存在", 404);
    exam.questions = await query(
      "SELECT * FROM exam_questions WHERE exam_id=? ORDER BY position",
      [exam.id],
    );
    res.json(exam);
  });
  app.post("/api/exams/:id/publish", teacher, async (req, res) => {
    await transaction(async (cx) => {
      const [exam] = await query(
        "SELECT * FROM exams WHERE id=? FOR UPDATE",
        [id(req.params.id)],
        cx,
      );
      if (
        !exam ||
        exam.status !== "draft" ||
        new Date(exam.ends_at) <= new Date()
      )
        throw fail("只能发布尚未结束的草稿考试");
      const selected = await query(
        "SELECT * FROM exam_questions WHERE exam_id=?",
        [exam.id],
        cx,
      );
      if (!selected.length) throw fail("试卷不能为空");
      for (const item of selected) {
        const [q] = await query(
          "SELECT * FROM questions WHERE id=? AND status='approved' FOR SHARE",
          [item.question_id],
          cx,
        );
        if (!q) throw fail("部分题目被删除或重新编辑，请调整试卷");
        await query(
          "UPDATE exam_questions SET snapshot=? WHERE id=?",
          [JSON.stringify(q), item.id],
          cx,
        );
      }
      await query(
        "UPDATE exams SET status='published' WHERE id=?",
        [exam.id],
        cx,
      );
    });
    res.json({ ok: true });
  });
  app.delete("/api/exams/:id", teacher, async (req, res) => {
    const result = await query(
      "DELETE FROM exams WHERE id=? AND status='draft'",
      [id(req.params.id)],
    );
    if (!result.affectedRows) throw fail("只能删除草稿考试", 409);
    res.json({ ok: true });
  });
  app.post("/api/exams/:id/start", student, async (req, res) => {
    const examId = id(req.params.id);
    const attemptId = await transaction(async (cx) => {
      const [exam] = await query(
        "SELECT * FROM exams WHERE id=? AND status='published' FOR SHARE",
        [examId],
        cx,
      );
      if (!exam) throw fail("考试不存在", 404);
      const [existing] = await query(
        "SELECT id,status FROM attempts WHERE exam_id=? AND user_id=?",
        [examId, req.session.user.id],
        cx,
      );
      if (existing) return existing.id;
      const now = new Date();
      if (now < new Date(exam.starts_at)) throw fail("考试尚未开始", 409);
      if (now >= new Date(exam.ends_at)) throw fail("考试已经结束", 409);
      const result = await query(
        "INSERT INTO attempts(exam_id,user_id,started_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
        [examId, req.session.user.id, now],
        cx,
      );
      return result.insertId;
    });
    await expireAttempts();
    res.json({ id: attemptId });
  });
  app.get("/api/attempts/:id", async (req, res) => {
    await expireAttempts();
    const a = await getAttempt(id(req.params.id), req.session.user);
    const rows = await query(
      "SELECT eq.*,a.sql_text,a.saved_at,a.score,a.verdict,a.feedback FROM exam_questions eq LEFT JOIN answers a ON a.exam_question_id=eq.id AND a.attempt_id=? WHERE eq.exam_id=? ORDER BY eq.position",
      [a.id, a.exam_id],
    );
    const showAnswers =
      req.session.user.role === "teacher" || a.status !== "active";
    a.questions = rows.map((row) => {
      const q = json(row.snapshot);
      return {
        id: row.id,
        points: row.points,
        position: row.position,
        title: q.title,
        type: q.type,
        prompt: q.prompt,
        ordered: q.ordered,
        sql: row.sql_text || "",
        saved_at: row.saved_at,
        score: row.score,
        verdict: row.verdict,
        feedback: row.feedback,
        ...(showAnswers
          ? { reference_sql: q.reference_sql, explanation: q.explanation }
          : {}),
      };
    });
    res.json({ ...a, server_time: new Date() });
  });
  app.put("/api/attempts/:id/answers", student, async (req, res) => {
    await saveAnswers(id(req.params.id), req.session.user, req.body.answers);
    res.json({ saved_at: new Date(), server_time: new Date() });
  });
  app.post("/api/attempts/:id/submit", student, async (req, res) => {
    const attemptId = id(req.params.id);
    await getAttempt(attemptId, req.session.user);
    if (req.body.answers) {
      try {
        await saveAnswers(attemptId, req.session.user, req.body.answers);
      } catch (e) {
        if (e.status !== 409) throw e;
      }
    }
    await finalize(attemptId);
    res.json({ id: attemptId });
  });
  app.get("/api/results", teacher, async (req, res) =>
    res.json(
      await query(
        "SELECT a.*,u.name,u.username,e.title,(SELECT SUM(points) FROM exam_questions WHERE exam_id=e.id) AS total_points FROM attempts a JOIN users u ON u.id=a.user_id JOIN exams e ON e.id=a.exam_id ORDER BY a.id DESC",
      ),
    ),
  );
  app.post("/api/attempts/:id/retry", teacher, async (req, res) => {
    const result = await query(
      "UPDATE attempts SET status='queued',error_message=NULL WHERE id=? AND status='error'",
      [id(req.params.id)],
    );
    if (!result.affectedRows) throw fail("仅异常答卷可以重新判题", 409);
    res.json({ ok: true });
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use((error, req, res, next) => {
    const duplicate = error.code === "ER_DUP_ENTRY";
    const status = duplicate
      ? 409
      : error.status ||
        (error instanceof InvalidSQL
          ? 400
          : error instanceof JudgeUnavailable
            ? 503
            : 500);
    if (status >= 500)
      console.error("请求失败", req.method, req.path, error.code || error.name);
    res.status(status).json({
      error: duplicate
        ? "学号/工号或记录已经存在"
        : status === 500
          ? "服务暂时不可用，请检查数据库连接或联系教师"
          : error.message,
    });
  });
  return app;
}
