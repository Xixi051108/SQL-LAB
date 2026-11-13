import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Login from "./views/Login.vue";
import Dashboard from "./views/Dashboard.vue";
import Questions from "./views/Questions.vue";
import Exams from "./views/Exams.vue";
import Workspace from "./views/Workspace.vue";
import Result from "./views/Result.vue";
import Results from "./views/Results.vue";
import { api, state } from "./state.js";
import "./style.css";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/", component: Dashboard },
    { path: "/questions", component: Questions, meta: { teacher: true } },
    { path: "/exams", component: Exams, meta: { teacher: true } },
    { path: "/results", component: Results, meta: { teacher: true } },
    { path: "/attempt/:id", component: Workspace },
    { path: "/result/:id", component: Result },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
router.beforeEach((to) => {
  if (!state.user && to.path !== "/login") return "/login";
  if (state.user && to.path === "/login") return "/";
  if (to.meta.teacher && state.user?.role !== "teacher") return "/";
});
async function boot() {
  try {
    state.user = (await api("/auth/me")).user;
  } catch {}
  createApp(App).use(router).mount("#app");
}
boot();
