import { createApp } from "./app.js";
import { pool, query } from "./db.js";
import { recoverQueue, expireAttempts, processQueue } from "./exams.js";
import { config } from "./config.js";
let ticking = false;
try {
  await query("SELECT 1 FROM users LIMIT 1");
  await recoverQueue();
  const app = createApp();
  const server = app.listen(config.port, "127.0.0.1", () =>
    console.log(`SQL Lab 已启动：http://127.0.0.1:${config.port}`),
  );
  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await expireAttempts();
      await processQueue();
    } catch (e) {
      console.error("后台任务失败", e.code || e.name);
    } finally {
      ticking = false;
    }
  }, 1000);
  const close = () => {
    clearInterval(timer);
    server.close(() => pool.end().then(() => process.exit()));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
} catch (e) {
  console.error(
    `启动失败：${e.code || e.message}。请填写 .env 后运行 npm run setup。`,
  );
  await pool.end();
  process.exitCode = 1;
}
