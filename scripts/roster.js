import { pool } from "../server/db.js";
import { migrateRoster } from "../server/roster.js";
let cx;
try {
  cx = await pool.getConnection();
  await migrateRoster(cx);
  console.log(
    "模拟名册已就绪，原题目、考试和答卷关联保留。教师工号 T2026001，学生学号 2026001001；原密码不变。",
  );
} catch (e) {
  console.error("名册升级失败：" + (e.code || e.message));
  process.exitCode = 1;
} finally {
  cx?.release();
  await pool.end();
}
