import { format } from "sql-formatter";

export function formatSQL(sql) {
  if (!sql?.trim()) return sql || "";
  try {
    return format(sql, {
      language: "mysql",
      tabWidth: 2,
      keywordCase: "upper",
      dataTypeCase: "upper",
      functionCase: "upper",
      expressionWidth: 70,
    });
  } catch {
    // 未完成或无法解析的学生答案保留原文，格式化不承担语法判定。
    return sql;
  }
}
