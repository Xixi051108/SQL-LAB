import { reactive } from "vue";
export const state = reactive({ user: null, toast: null });
let toastTimer;
export function notify(message, error = false) {
  state.toast = { message, error };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (state.toast = null), 6000);
}
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  } catch {
    throw new Error("无法连接服务，请检查后端是否启动");
  }
  const data = await response.json().catch(() => ({ error: "服务返回异常" }));
  if (!response.ok) {
    const e = new Error(data.error || "操作失败");
    e.status = response.status;
    throw e;
  }
  return data;
}
export const labels = {
  select: "查询",
  insert: "插入",
  update: "更新",
  delete: "删除",
  create_table: "建表",
  alter_table: "改表",
  drop_table: "删表",
};
export const statuses = {
  active: "答题中",
  queued: "等待判题",
  grading: "判题中",
  graded: "已完成",
  error: "判题异常",
  draft: "草稿",
  approved: "已审核",
  published: "已发布",
};
export const dateTime = (date) =>
  date
    ? new Date(date).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
