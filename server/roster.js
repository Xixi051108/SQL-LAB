import fs from "node:fs";

export async function migrateRoster(cx) {
  const schema = fs.readFileSync("db/schema.sql", "utf8");
  await cx.query(
    schema.slice(0, schema.indexOf("CREATE TABLE IF NOT EXISTS users")),
  );
  const samples = JSON.parse(fs.readFileSync("db/roster.json", "utf8"));
  for (const row of samples)
    await cx.execute(
      "INSERT IGNORE INTO roster(number,name,role) VALUES(?,?,?)",
      [row.number, row.name, row.role],
    );
  const [legacy] = await cx.query("SELECT id,username,name,role FROM users");
  for (const user of legacy) {
    const sample =
      user.username === "teacher"
        ? samples[0]
        : user.username === "student"
          ? samples[2]
          : null;
    if (sample) {
      const [conflict] = await cx.execute(
        "SELECT id FROM users WHERE username=? AND id<>?",
        [sample.number, user.id],
      );
      if (conflict.length)
        throw new Error("目标学工号已存在，请先检查原账号迁移");
      await cx.execute("UPDATE users SET username=?,name=?,role=? WHERE id=?", [
        sample.number,
        sample.name,
        sample.role,
        user.id,
      ]);
    } else {
      await cx.execute(
        "INSERT IGNORE INTO roster(number,name,role) VALUES(?,?,?)",
        [user.username, user.name, user.role],
      );
    }
  }
  const [fk] = await cx.query(
    "SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='users' AND CONSTRAINT_NAME='fk_user_roster'",
  );
  if (!fk.length)
    await cx.query(
      "ALTER TABLE users ADD CONSTRAINT fk_user_roster FOREIGN KEY(username) REFERENCES roster(number)",
    );
  await cx.query("DELETE FROM sessions");
}
