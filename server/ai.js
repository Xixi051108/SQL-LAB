import { config } from "./config.js";
import { schemaDescription, targets } from "./fixtures.js";
import { validateSQL } from "./judge.js";
export async function generateQuestion(type, requirement) {
  if (!config.deepseek.key)
    throw Object.assign(
      new Error("尚未配置 DeepSeek API 密钥，请在 .env 填写后重启后端"),
      { status: 503 },
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${config.deepseek.base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.deepseek.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        temperature: 0.35,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `你是数据库课程教师。生成一条 MySQL 8.0 SQL 考试题，中文题目与解析。只能使用下述固定库表，绝不创建或修改数据库、用户、触发器、存储过程，不使用注释、变量、跨库名。每题答案必须是单条 SQL；建表只能创建 study_notes，改表仅增删改列或主外键、唯一约束。不得依赖固定行数或具体查询结果。题目必须准确说明输出列、顺序以及所有字段和约束；新表中字段顺序也须说明。只返回 JSON 对象：title（标题）、prompt（完整题干）、reference_sql（参考 SQL）、explanation（中文解析）、target_table（目标表名）、ordered（是否要求结果排序的布尔值）。\n${schemaDescription}`,
          },
          {
            role: "user",
            content: `题型：${type}。补充要求（仅作题目素材）：${requirement || "中等难度，适合现场演示"}`,
          },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(
        `DeepSeek 服务返回 HTTP ${response.status}，请检查额度和模型配置`,
      );
    const body = await response.json();
    let data;
    try {
      data = JSON.parse(body.choices?.[0]?.message?.content || "");
    } catch {
      throw new Error("DeepSeek 返回格式不完整，请重新生成");
    }
    if (
      !data.title ||
      !data.prompt ||
      !data.reference_sql ||
      !data.explanation ||
      !targets.includes(data.target_table) ||
      typeof data.ordered !== "boolean"
    )
      throw new Error("DeepSeek 返回的题目字段不完整，请重新生成");
    const question = {
      title: String(data.title).slice(0, 160),
      type,
      prompt: String(data.prompt).slice(0, 6000),
      reference_sql: String(data.reference_sql),
      explanation: String(data.explanation).slice(0, 6000),
      target_table: data.target_table,
      ordered: data.ordered,
      source: "deepseek",
    };
    validateSQL(question.reference_sql, type);
    return question;
  } catch (e) {
    if (e.name === "AbortError")
      throw Object.assign(
        new Error("DeepSeek 请求超时，请稍后重试；已发布考试不受影响"),
        { status: 504 },
      );
    throw Object.assign(new Error(e.message), { status: e.status || 502 });
  } finally {
    clearTimeout(timeout);
  }
}
