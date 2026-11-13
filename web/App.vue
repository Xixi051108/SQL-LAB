<script setup>
import { computed, onErrorCaptured } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Database,
  LayoutDashboard,
  Library,
  CalendarClock,
  ChartNoAxesCombined,
  LogOut,
} from "lucide-vue-next";
import { api, state, notify } from "./state.js";
const route = useRoute(),
  router = useRouter();
const nav = computed(() => [
  {
    path: "/",
    label: state.user?.role === "teacher" ? "教学概览" : "我的考试",
    icon: LayoutDashboard,
  },
  ...(state.user?.role === "teacher"
    ? [
        { path: "/questions", label: "题库管理", icon: Library },
        { path: "/exams", label: "考试管理", icon: CalendarClock },
        { path: "/results", label: "成绩记录", icon: ChartNoAxesCombined },
      ]
    : []),
]);
async function logout() {
  try {
    await api("/auth/logout", { method: "POST", body: {} });
    state.user = null;
    router.push("/login");
  } catch (e) {
    notify(e.message, true);
  }
}
onErrorCaptured((e) => {
  notify(e.message, true);
  return false;
});
</script>
<template>
  <div v-if="state.user" class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-mark"><Database :size="23" /></span
        ><span
          >SQL<span class="brand-light"> Lab</span
          ><small>数据库学习与测评</small></span
        ></RouterLink
      >
      <div class="nav-caption">
        {{ state.user.role === "teacher" ? "教学工作台" : "学习工作台" }}
      </div>
      <nav aria-label="主导航">
        <RouterLink
          v-for="item in nav"
          :key="item.path"
          :to="item.path"
          :class="['nav-link', { active: route.path === item.path }]"
          ><component :is="item.icon" :size="19" />{{ item.label }}</RouterLink
        >
      </nav>
      <div class="user-panel">
        <span class="avatar">{{ state.user.name.slice(0, 1) }}</span>
        <div>
          <strong>{{ state.user.name }}</strong
          ><small
            >{{ state.user.role === "teacher" ? "教师" : "学生" }} ·
            {{ state.user.username }}</small
          >
        </div>
        <button class="icon-button" aria-label="退出登录" @click="logout">
          <LogOut :size="17" />
        </button>
      </div>
    </aside>
    <div class="page-shell">
      <header class="topbar">
        <span>数据库原理 <span class="crumb-slash">/</span> SQL 能力测评</span
        ><span class="topbar-end">{{
          state.user.role === "teacher" ? "教师工作台" : "学生工作台"
        }}</span>
      </header>
      <main id="main"><RouterView /></main>
    </div>
  </div>
  <RouterView v-else />
  <div
    v-if="state.toast"
    :class="['toast', { error: state.toast.error }]"
    role="status"
  >
    {{ state.toast.message
    }}<button aria-label="关闭提示" @click="state.toast = null">×</button>
  </div>
</template>
