import test from "node:test";
import assert from "node:assert/strict";
import parserPackage from "node-sql-parser";
import { formatSQL } from "../shared/sql.js";
const parser = new parserPackage.Parser();
test("查询格式化包含子句换行且保持 SQL 语义", () => {
  const sql = "select id,name,age from students where major='计算机' order by id";
  const result = formatSQL(sql);
  assert.match(result, /\n/); assert.match(result, /SELECT/);
  const normalize = value => JSON.parse(JSON.stringify(parser.astify(value)), (key, item) => key === "constraint_type" && typeof item === "string" ? item.toUpperCase() : item);
  assert.deepEqual(normalize(result), normalize(sql));
});
test("建表答案使用多行缩进且保留约束和字符串", () => {
  const sql = "create table study_notes(id int primary key,student_id int not null,content varchar(200) not null default 'select from',foreign key(student_id) references students(id))";
  const result = formatSQL(sql);
  assert(result.split("\n").length > 5); assert.match(result, /'select from'/);
  const normalize = value => JSON.parse(JSON.stringify(parser.astify(value)), (key, item) => key === "constraint_type" && typeof item === "string" ? item.toUpperCase() : item);
  assert.deepEqual(normalize(result), normalize(sql));
});
test("格式化幂等，未完成语句与空答案保留原文", () => {
  const formatted = formatSQL("SELECT id,name FROM students");
  assert.equal(formatSQL(formatted), formatted);
  assert.equal(formatSQL("SELECT '"), "SELECT '");
  assert.equal(formatSQL(""), "");
});
