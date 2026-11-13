import mysql from "mysql2/promise";
import parserPackage from "node-sql-parser";
import { config } from "./config.js";
import { fixtureStatements, targets } from "./fixtures.js";
const parser = new parserPackage.Parser();
const expectedTypes = {
  select: "select",
  insert: "insert",
  update: "update",
  delete: "delete",
  create_table: "create",
  alter_table: "alter",
  drop_table: "drop",
};
const allowedFunctions = new Set([
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "ROUND",
  "COALESCE",
  "IFNULL",
  "NULLIF",
  "CONCAT",
  "CONCAT_WS",
  "LOWER",
  "UPPER",
  "LENGTH",
  "CHAR_LENGTH",
  "ABS",
  "CEIL",
  "CEILING",
  "FLOOR",
  "MOD",
  "TRIM",
  "LTRIM",
  "RTRIM",
  "SUBSTRING",
  "SUBSTR",
  "LEFT",
  "RIGHT",
  "REPLACE",
  "DATE",
  "YEAR",
  "MONTH",
  "DAY",
  "DATEDIFF",
  "DATE_FORMAT",
  "CAST",
  "CONVERT",
  "IF",
  "ROW_NUMBER",
  "RANK",
  "DENSE_RANK",
]);
export class InvalidSQL extends Error {}
export class JudgeUnavailable extends Error {}
function withoutQuotedValues(sql) {
  let result = "",
    quote = null;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      result += " ";
      if (char === "\\") {
        if (i + 1 < sql.length) {
          result += " ";
          i++;
        }
      } else if (char === quote) {
        if (sql[i + 1] === quote) {
          result += " ";
          i++;
        } else quote = null;
      }
    } else if (char === "'" || char === '"' || char === "`") {
      quote = char;
      result += " ";
    } else result += char;
  }
  return result;
}

export function validateSQL(sql, type) {
  if (typeof sql !== "string" || !sql.trim() || sql.length > 8000)
    throw new InvalidSQL("请输入一条不超过 8000 字符的 SQL");
  // 限定课程语法；注释和管理类语句不进入执行器，包括 MySQL 可执行注释。
  const syntax = withoutQuotedValues(sql);
  if (
    /--|\/\*|\*\/|#|\u0000|@/.test(syntax) ||
    /\b(into\s+(outfile|dumpfile)|load_file|sleep|benchmark|get_lock|release_lock|sys_exec|recursive|procedure|trigger|tablespace|directory|engine|encryption|temporary|rename|truncate)\b/i.test(
      syntax,
    )
  )
    throw new InvalidSQL(
      "只允许课程范围内的单条 SQL，不支持注释、变量、文件或管理操作",
    );
  let ast;
  try {
    ast = parser.astify(sql, { database: "MySQL" });
  } catch {
    throw new InvalidSQL("SQL 语法无法解析，请检查 MySQL 常见语法");
  }
  if (Array.isArray(ast)) {
    if (ast.length !== 1) throw new InvalidSQL("每题只能提交一条 SQL");
    ast = ast[0];
  }
  if (!expectedTypes[type] || ast.type !== expectedTypes[type])
    throw new InvalidSQL("SQL 语句类型与本题不符");
  if (
    ["create", "alter", "drop"].includes(ast.type) &&
    String(ast.keyword || "table").toLowerCase() !== "table"
  )
    throw new InvalidSQL("仅支持表结构操作");
  let size = 0;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (++size > 4000) throw new InvalidSQL("SQL 结构过于复杂");
    if (node.type === "function" || node.type === "aggr_func") {
      const name =
        typeof node.name === "string"
          ? node.name
          : node.name?.name?.map((n) => n.value).join(".");
      if (!allowedFunctions.has(name?.toUpperCase()))
        throw new InvalidSQL("仅支持课程常见的聚合、字符串、数值和日期函数");
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "db" && value)
        throw new InvalidSQL("禁止跨数据库访问，请直接使用教学表名");
      if (
        key === "into" &&
        value &&
        !(typeof value === "object" && !Object.values(value).some(Boolean))
      )
        throw new InvalidSQL("禁止 SELECT INTO");
      if (
        key === "table" &&
        node.type !== "column_ref" &&
        typeof value === "string" &&
        !targets.includes(value.toLowerCase())
      )
        throw new InvalidSQL(`只允许操作教学库中的表：${targets.join("、")}`);
      if (key === "locking_read" && value)
        throw new InvalidSQL("不支持显式加锁查询");
      visit(value);
    }
  }
  visit(ast);
  return ast;
}

export function normalizedRows(rows, ordered = false) {
  const normalized = rows.map((row) =>
    JSON.stringify(Array.isArray(row) ? row : Object.values(row), (_, v) =>
      v instanceof Date
        ? v.toISOString()
        : Buffer.isBuffer(v)
          ? v.toString("hex")
          : v,
    ),
  );
  return ordered ? normalized : normalized.sort();
}
let queue = Promise.resolve();
export function serialized(task) {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}
async function connect() {
  try {
    return await mysql.createConnection({
      ...config.judge,
      database: undefined,
      timezone: "Z",
      multipleStatements: false,
      connectTimeout: 3000,
    });
  } catch {
    throw new JudgeUnavailable(
      "判题库无法连接，请检查受限账号并运行 npm run setup",
    );
  }
}
async function rebuild(control, variant) {
  const name = mysql.escapeId(config.judge.database);
  await control.query(`DROP DATABASE IF EXISTS ${name}`);
  await control.query(
    `CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await control.query(`USE ${name}`);
  for (const sql of fixtureStatements(variant)) await control.query(sql);
}
async function executeSQL(control, sql, isSelect) {
  const cx = await connect();
  let expired = false;
  let timer;
  try {
    await cx.query(`USE ${mysql.escapeId(config.judge.database)}`);
    await cx.query("SET SESSION lock_wait_timeout=2");
    await cx.query("SET SESSION innodb_lock_wait_timeout=2");
    await cx.query(`SET SESSION max_execution_time=${config.timeout}`);
    // SELECT 使用流式读取，超过上限时终止，避免先把巨量结果放入内存。
    const operation = isSelect
      ? (async () => {
          const rows = [];
          let bytes = 0;
          const stream = cx.connection
            .query({ sql, rowsAsArray: true })
            .stream({ highWaterMark: 16 });
          for await (const row of stream) {
            rows.push(row);
            bytes += JSON.stringify(row).length;
            if (rows.length > 1000 || bytes > 200000) {
              await control
                .query(`KILL QUERY ${Number(cx.threadId)}`)
                .catch(() => {});
              stream.destroy();
              throw new InvalidSQL("查询结果过大，请限制结果范围");
            }
          }
          return [rows];
        })()
      : cx.query({ sql, rowsAsArray: true });
    timer = setTimeout(() => {
      expired = true;
      // 同一受限账号可终止自身连接，无须授予全局管理权限。
      control.query(`KILL QUERY ${Number(cx.threadId)}`).catch(() => {});
    }, config.timeout);
    const [rows] = await operation;
    if (expired) throw new InvalidSQL("SQL 执行超时，请简化语句");
    if (
      Array.isArray(rows) &&
      (rows.length > 1000 || JSON.stringify(rows).length > 200000)
    )
      throw new InvalidSQL("查询结果过大，请限制结果范围");
    return rows;
  } catch (e) {
    if (e instanceof InvalidSQL) throw e;
    if (e.code?.startsWith("ER_"))
      throw new InvalidSQL(
        expired ? "SQL 执行超时" : `MySQL：${e.sqlMessage || e.message}`,
      );
    throw new JudgeUnavailable("判题连接中断，请重试判题");
  } finally {
    clearTimeout(timer);
    await cx.end().catch(() => {});
  }
}
async function snapshot(cx) {
  const [tables] = await cx.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME",
    [config.judge.database],
  );
  const state = {};
  for (const { name } of tables) {
    const [[{ count }]] = await cx.query(
      `SELECT COUNT(*) AS count FROM ${mysql.escapeId(name)}`,
    );
    if (count > 1000) throw new InvalidSQL("执行后的表数据超过 1000 行限制");
    const [columns] = await cx.query(
      "SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",
      [config.judge.database, name],
    );
    const [constraints] = await cx.query(
      `SELECT tc.CONSTRAINT_TYPE AS kind,k.COLUMN_NAME AS col,k.ORDINAL_POSITION AS pos,k.REFERENCED_TABLE_NAME AS ref_table,k.REFERENCED_COLUMN_NAME AS ref_col,rc.UPDATE_RULE AS on_update,rc.DELETE_RULE AS on_delete FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.KEY_COLUMN_USAGE k ON tc.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND tc.TABLE_NAME=k.TABLE_NAME AND tc.CONSTRAINT_NAME=k.CONSTRAINT_NAME LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc ON rc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME AND rc.TABLE_NAME=tc.TABLE_NAME WHERE tc.CONSTRAINT_SCHEMA=? AND tc.TABLE_NAME=? ORDER BY tc.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
      [config.judge.database, name],
    );
    // 约束名不影响正确性；保留复合键内字段顺序和外键行为。
    const [indexes] = await cx.query(
      "SELECT INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND NON_UNIQUE=0 ORDER BY INDEX_NAME,SEQ_IN_INDEX",
      [config.judge.database, name],
    );
    const grouped = new Map();
    for (const idx of indexes) {
      const key = idx.INDEX_NAME;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(idx.COLUMN_NAME);
    }
    const uniqueKeys = [...grouped.values()]
      .map((v) => JSON.stringify(v))
      .sort();
    const [rows] = await cx.query({
      sql: `SELECT * FROM ${mysql.escapeId(name)}`,
      rowsAsArray: true,
    });
    state[name] = {
      columns,
      constraints: constraints.map((c) => JSON.stringify(c)).sort(),
      uniqueKeys,
      rows: normalizedRows(rows),
    };
  }
  return state;
}
async function runFixture(control, question, sql, variant) {
  await rebuild(control, variant);
  const result = await executeSQL(control, sql, question.type === "select");
  return question.type === "select"
    ? { rows: normalizedRows(result, Boolean(question.ordered)) }
    : await snapshot(control);
}

export async function grade(question, answer) {
  if (!answer?.trim())
    return { verdict: "blank", feedback: "未作答", passed: false };
  try {
    validateSQL(answer, question.type);
  } catch (e) {
    if (e instanceof InvalidSQL)
      return { verdict: "wrong", feedback: e.message, passed: false };
    throw e;
  }
  return serialized(async () => {
    validateSQL(question.reference_sql, question.type);
    const control = await connect();
    try {
      for (let variant = 0; variant < 2; variant++) {
        let expected;
        try {
          expected = await runFixture(
            control,
            question,
            question.reference_sql,
            variant,
          );
        } catch {
          throw new JudgeUnavailable(
            "题目参考答案验证失败，请教师修正后重试判题",
          );
        }
        let actual;
        try {
          actual = await runFixture(control, question, answer, variant);
        } catch (e) {
          if (e instanceof InvalidSQL)
            return { verdict: "wrong", feedback: e.message, passed: false };
          throw e;
        }
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          return {
            verdict: "wrong",
            feedback:
              question.type === "select"
                ? "查询结果与要求不一致，请检查字段、筛选、重复行和排序。"
                : "执行后的数据或表结构不符合要求，请检查影响范围、字段和约束。",
            passed: false,
          };
      }
      return {
        verdict: "correct",
        feedback: "已通过全部测试数据",
        passed: true,
      };
    } finally {
      try {
        await rebuild(control, 0);
      } finally {
        await control.end();
      }
    }
  });
}
export async function validateReference(question) {
  const result = await grade(question, question.reference_sql);
  if (!result.passed)
    throw new InvalidSQL(`参考答案未通过验证：${result.feedback}`);
}
