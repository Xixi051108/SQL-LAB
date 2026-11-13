export const config = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "sql_exam",
  },
  judge: {
    host: process.env.JUDGE_HOST || process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.JUDGE_PORT || process.env.DB_PORT || 3306),
    user: process.env.JUDGE_USER || "sql_exam_runner",
    password: process.env.JUDGE_PASSWORD || "",
    database: process.env.JUDGE_DB || "sql_exam_judge",
  },
  timeout: Math.max(
    100,
    Math.min(10000, Number(process.env.JUDGE_TIMEOUT_MS || 3000)),
  ),
  sessionSecret: process.env.SESSION_SECRET,
  deepseek: {
    key: process.env.DEEPSEEK_API_KEY || "",
    base: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(
      /\/$/,
      "",
    ),
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
};
if (
  !/^[a-z][a-z0-9_]{0,40}$/.test(config.db.database) ||
  !/^sql_exam_judge[a-z0-9_]*$/.test(config.judge.database)
)
  throw new Error("数据库名称不符合安全规则");
if (config.judge.database === config.db.database)
  throw new Error("业务库和判题库必须不同");
