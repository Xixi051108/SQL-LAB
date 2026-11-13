import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { pool, query } from "../server/db.js";
let server, base;
const numbers = [];
function client() {
  let cookie = "";
  return async (url, method = "GET", body) => {
    const r = await fetch(base + "/api" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return { status: r.status, data: await r.json() };
  };
}
test.before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
  for (const n of numbers) {
    await query(
      "DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(data,'$.user.username'))=?",
      [n],
    );
    await query("DELETE FROM users WHERE username=?", [n]);
    await query("DELETE FROM roster WHERE number=?", [n]);
  }
  await new Promise((r) => server.close(r));
  await pool.end();
});
async function teacher() {
  const t = client();
  assert.equal(
    (
      await t("/auth/login", "POST", {
        username: "T2026001",
        password: process.env.TEACHER_PASSWORD || "Teacher123!",
      })
    ).status,
    200,
  );
  return t;
}
async function person(t, role = "student") {
  const number =
    "R" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
  numbers.push(number);
  const r = await t("/roster", "POST", {
    number,
    name: "名册测试",
    role,
    enabled: true,
  });
  assert.equal(r.status, 201);
  return { number, id: r.data.id };
}
const data = (p) => ({
  username: p.number,
  name: "名册测试",
  password: "Roster123!",
});
test("名册外编号及姓名不匹配均不得注册", async () => {
  const t = await teacher(),
    p = await person(t),
    s = client();
  assert.equal(
    (
      await s("/auth/register", "POST", {
        ...data(p),
        username: "UNKNOWN_2026",
      })
    ).status,
    403,
  );
  assert.equal(
    (await s("/auth/register", "POST", { ...data(p), name: "错误姓名" }))
      .status,
    403,
  );
});
test("学生身份来自名册，不能通过请求伪造教师身份", async () => {
  const t = await teacher(),
    p = await person(t),
    s = client();
  const r = await s("/auth/register", "POST", { ...data(p), role: "teacher" });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, "student");
  assert.equal(r.data.user.name, "名册测试");
  assert.equal((await s("/roster")).status, 403);
});
test("名单中的教师可注册，按工号登录并显示名册姓名", async () => {
  const t = await teacher(),
    p = await person(t, "teacher"),
    s = client();
  assert.equal(
    (await s("/auth/register", "POST", data(p))).data.user.role,
    "teacher",
  );
  await s("/auth/logout", "POST", {});
  const r = await s("/auth/login", "POST", {
    username: p.number.toLowerCase(),
    password: "Roster123!",
    name: "冒名",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.name, "名册测试");
  assert.equal(r.data.user.username, p.number);
  assert.equal((await s("/roster")).status, 200);
});
test("停用未注册人员阻止注册，启用后可注册", async () => {
  const t = await teacher(),
    p = await person(t),
    s = client();
  assert.equal(
    (
      await t("/roster/" + p.id, "PUT", {
        number: p.number,
        name: "名册测试",
        role: "student",
        enabled: false,
      })
    ).status,
    200,
  );
  assert.equal((await s("/auth/register", "POST", data(p))).status, 403);
  await t("/roster/" + p.id, "PUT", {
    number: p.number,
    name: "名册测试",
    role: "student",
    enabled: true,
  });
  assert.equal((await s("/auth/register", "POST", data(p))).status, 201);
});
test("并发重复注册只创建一个账号", async () => {
  const t = await teacher(),
    p = await person(t);
  const responses = await Promise.all([
    client()("/auth/register", "POST", data(p)),
    client()("/auth/register", "POST", data(p)),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
});
test("已注册人员锁定编号身份，姓名更正同步展示", async () => {
  const t = await teacher(),
    p = await person(t),
    s = client();
  await s("/auth/register", "POST", data(p));
  const body = {
    number: p.number,
    name: "更正姓名",
    role: "student",
    enabled: true,
  };
  assert.equal(
    (await t("/roster/" + p.id, "PUT", { ...body, role: "teacher" })).status,
    409,
  );
  assert.equal(
    (await t("/roster/" + p.id, "PUT", { ...body, number: p.number + "X" }))
      .status,
    409,
  );
  assert.equal((await t("/roster/" + p.id, "PUT", body)).status, 200);
  assert.equal(
    (
      await s("/auth/login", "POST", {
        username: p.number,
        password: "Roster123!",
      })
    ).data.user.name,
    "更正姓名",
  );
});
test("停用已注册账号使会话和再次登录失效", async () => {
  const t = await teacher(),
    p = await person(t),
    s = client();
  await s("/auth/register", "POST", data(p));
  await t("/roster/" + p.id, "PUT", {
    number: p.number,
    name: "名册测试",
    role: "student",
    enabled: false,
  });
  assert.equal((await s("/auth/me")).data.user, null);
  assert.equal((await s("/exams")).status, 401);
  assert.equal(
    (
      await s("/auth/login", "POST", {
        username: p.number,
        password: "Roster123!",
      })
    ).status,
    401,
  );
  assert.equal((await t("/roster/" + p.id, "DELETE", {})).status, 409);
});
test("未注册名册可修改删除，编号唯一且不能停用自己", async () => {
  const t = await teacher(),
    p = await person(t);
  assert.equal(
    (
      await t("/roster", "POST", {
        number: p.number,
        name: "重复记录",
        role: "student",
        enabled: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await t("/roster/" + p.id, "PUT", {
        number: p.number,
        name: "更新姓名",
        role: "student",
        enabled: true,
      })
    ).status,
    200,
  );
  assert.equal((await t("/roster/" + p.id, "DELETE", {})).status, 200);
  const self = (await t("/roster")).data.find((r) => r.number === "T2026001");
  assert.equal(
    (await t("/roster/" + self.id, "PUT", { ...self, enabled: false })).status,
    409,
  );
});
