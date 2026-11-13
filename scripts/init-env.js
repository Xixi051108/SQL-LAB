import fs from "node:fs";
import crypto from "node:crypto";
if (!fs.existsSync(".env")) {
  let data = fs.readFileSync(".env.example", "utf8");
  for (const key of ["SESSION_SECRET", "JUDGE_PASSWORD"]) {
    data = data.replace(
      new RegExp(`^${key}=$`, "m"),
      `${key}=${crypto.randomBytes(32).toString("hex")}`,
    );
  }
  fs.writeFileSync(".env", data, { mode: 0o600 });
  console.log(".env 已创建；仅在本机编辑连接信息与 API 密钥。");
}
