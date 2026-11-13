import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { query, pool } from "../server/db.js";
import { seedQuestions } from "../server/fixtures.js";
let browser;
const userIds = [],
  examIds = [],
  qids = [];
fs.mkdirSync("output/playwright", { recursive: true });
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000");
  await page.getByRole("heading", { name: "欢迎回到实验台" }).waitFor();
  await page.screenshot({
    path: "output/playwright/login.png",
    fullPage: true,
  });
  await page.getByLabel("用户名", { exact: true }).fill("teacher");
  await page
    .getByLabel("密码", { exact: true })
    .fill(process.env.TEACHER_PASSWORD || "Teacher123!");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("heading", { name: "从一道好题开始。" }).waitFor();
  await page.getByText("业务数据库", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/overview.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "题库管理", exact: true }).click();
  await page.getByRole("heading", { name: "题库管理", exact: true }).waitFor();
  await page.getByRole("button", { name: "创建题目", exact: true }).click();
  const title = "UI 验证题 " + Date.now();
  await page.getByLabel("题目标题", { exact: true }).fill(title);
  await page
    .getByLabel("完整题干", { exact: true })
    .fill(seedQuestions[0].prompt);
  await page
    .getByLabel("参考 SQL", { exact: true })
    .fill(seedQuestions[0].reference_sql);
  await page
    .getByLabel("参考解析", { exact: true })
    .fill(seedQuestions[0].explanation);
  await page.getByLabel("查询结果需要严格匹配行顺序").check();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  let row = page.getByRole("row").filter({ hasText: title });
  await row.waitFor();
  const [created] = await query("SELECT id FROM questions WHERE title=?", [
    title,
  ]);
  qids.push(created.id);
  await row.getByRole("button", { name: "编辑 " + title, exact: true }).click();
  await page.getByLabel("题目标题", { exact: true }).fill(title + " 修改");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  row = page.getByRole("row").filter({ hasText: title + " 修改" });
  await row.getByRole("button", { name: "验证审核", exact: true }).click();
  await row.getByText("已审核", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/questions.png",
    fullPage: true,
  });
  // 通过真实教师页面创建并发布两题试卷，随后通过真实学生页面作答。
  await page.getByRole("link", { name: "考试管理", exact: true }).click();
  await page.getByRole("button", { name: "创建考试", exact: true }).click();
  const examTitle = "UI 综合验收 " + Date.now();
  await page.getByLabel("考试名称", { exact: true }).fill(examTitle);
  const dt = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  await page
    .getByLabel("开始时间", { exact: true })
    .fill(dt(new Date(Date.now() - 60000)));
  await page
    .getByLabel("结束时间", { exact: true })
    .fill(dt(new Date(Date.now() + 3600000)));
  await page.getByRole("checkbox", { name: /创建学习笔记表/ }).check();
  await page
    .getByRole("checkbox", { name: new RegExp(title + " 修改") })
    .check();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.getByRole("row").filter({ hasText: examTitle }).waitFor();
  const [exam] = await query("SELECT id FROM exams WHERE title=?", [examTitle]);
  examIds.push(exam.id);
  row = page.getByRole("row").filter({ hasText: examTitle });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "发布", exact: true }).click();
  await row.getByText("已发布", { exact: true }).waitFor();
  row = page.getByRole("row").filter({ hasText: examTitle });
  await page.screenshot({
    path: "output/playwright/exams.png",
    fullPage: true,
  });
  const studentCtx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    student = await studentCtx.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto("http://127.0.0.1:3000");
  await student.getByRole("button", { name: "立即注册" }).click();
  const username = "ui_" + Date.now();
  await student.getByLabel("用户名", { exact: true }).fill(username);
  await student.getByLabel("姓名", { exact: true }).fill("验收同学");
  await student.getByLabel("密码", { exact: true }).fill("UiPass123!");
  await student.getByRole("button", { name: "注册并进入" }).click();
  await student
    .getByRole("heading", { name: "今天，检验你的 SQL 能力。" })
    .waitFor();
  const [u] = await query("SELECT id FROM users WHERE username=?", [username]);
  userIds.push(u.id);
  await student
    .locator(".exam-row")
    .filter({ hasText: examTitle })
    .getByRole("button", { name: "进入考试" })
    .click();
  await student.getByLabel("SQL 答案", { exact: true }).waitFor();
  const firstTitle = await student.locator(".question-panel h2").textContent();
  assert.equal(firstTitle, "创建学习笔记表");
  await student
    .getByLabel("SQL 答案", { exact: true })
    .fill(seedQuestions[4].reference_sql);
  await student
    .locator(".editor-status")
    .filter({ hasText: /已保存/ })
    .waitFor({ timeout: 10000 });
  await student.getByRole("button", { name: "下一题", exact: true }).click();
  await student
    .locator(".question-panel h2")
    .filter({ hasText: title })
    .waitFor();
  await student
    .getByLabel("SQL 答案", { exact: true })
    .fill(seedQuestions[0].reference_sql);
  await student.getByRole("button", { name: "上一题", exact: true }).click();
  await student.reload();
  await student.getByLabel("SQL 答案", { exact: true }).waitFor();
  assert.equal(
    await student.getByLabel("SQL 答案", { exact: true }).inputValue(),
    seedQuestions[4].reference_sql,
  );
  await student.screenshot({
    path: "output/playwright/workspace.png",
    fullPage: true,
  });
  student.once("dialog", (d) => d.accept());
  await student
    .getByRole("button", { name: "交卷并查看结果", exact: true })
    .click();
  await student
    .getByRole("heading", { name: "本次考试已完成" })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await student.locator(".score-block>strong").textContent(),
    "20/ 20",
  );
  await student.screenshot({
    path: "output/playwright/result.png",
    fullPage: true,
  });
  await student.setViewportSize({ width: 390, height: 844 });
  await student.screenshot({
    path: "output/playwright/mobile.png",
    fullPage: true,
  });
  assert(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("link", { name: "题库管理", exact: true }).click();
  row = page.getByRole("row").filter({ hasText: title + " 修改" });
  await row
    .getByRole("button", { name: "删除 " + title + " 修改", exact: true })
    .click();
  await row.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log(
    "浏览器验收通过：教师登录、题目新增/修改/审核/删除、页面组卷发布、学生注册、DDL/查询作答、切题保存、刷新恢复、交卷满分、移动端无横向溢出；无页面脚本异常。",
  );
} catch (e) {
  console.error("浏览器验收失败：" + e.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const id of examIds) {
    await query(
      "DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id=?)",
      [id],
    );
    await query("DELETE FROM attempts WHERE exam_id=?", [id]);
    await query("DELETE FROM exam_questions WHERE exam_id=?", [id]);
    await query("DELETE FROM exams WHERE id=?", [id]);
  }
  for (const id of qids) await query("DELETE FROM questions WHERE id=?", [id]);
  for (const id of userIds) await query("DELETE FROM users WHERE id=?", [id]);
  await pool.end();
}
