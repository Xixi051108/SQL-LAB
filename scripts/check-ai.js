import { generateQuestion } from "../server/ai.js";
import { validateReference } from "../server/judge.js";
import { pool } from "../server/db.js";
try {
  const q = await generateQuestion(
    "select",
    "查询学生的 id 和 name，按 id 排序，简单题",
  );
  await validateReference(q);
  console.log("DeepSeek 实际出题及两组 MySQL 参考答案验证通过：" + q.title);
} catch (e) {
  console.error("DeepSeek 检查未通过：" + e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
