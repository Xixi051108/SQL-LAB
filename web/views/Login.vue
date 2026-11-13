<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Database, ArrowRight } from "lucide-vue-next";
import { api, state } from "../state.js";
const router = useRouter(),
  register = ref(false),
  busy = ref(false),
  error = ref("");
const form = ref({ username: "", name: "", password: "" });
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    state.user = (
      await api(register.value ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: form.value,
      })
    ).user;
    router.push("/");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="login-page">
    <section class="login-story">
      <div class="login-brand"><Database :size="28" />SQL Lab</div>
      <div class="login-copy">
        <span class="eyebrow light">数据库学习与测评</span>
        <h1>理解数据，<br />从一行 SQL 开始。</h1>
        <p>出题、考试与反馈，在这里连接。</p>
        <img
          class="login-illustration"
          src="/lab.svg"
          alt=""
          aria-hidden="true"
        />
      </div>
    </section>
    <section class="login-form-section">
      <div class="login-form">
        <h2>{{ register ? "创建学生账号" : "欢迎回到实验台" }}</h2>
        <p class="muted">
          {{ register ? "填写信息，开启学习。" : "登录以继续。" }}
        </p>
        <form @submit.prevent="submit">
          <label
            >用户名<input
              v-model.trim="form.username"
              autocomplete="username"
              required
              minlength="3"
              maxlength="32"
              placeholder="输入用户名" /></label
          ><label v-if="register"
            >姓名<input
              v-model.trim="form.name"
              autocomplete="name"
              required
              maxlength="40"
              placeholder="输入你的姓名" /></label
          ><label
            >密码<input
              v-model="form.password"
              :autocomplete="register ? 'new-password' : 'current-password'"
              required
              :minlength="register ? 8 : 1"
              maxlength="128"
              type="password"
              placeholder="输入密码"
          /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button primary login-submit" :disabled="busy">
            {{ busy ? "正在连接…" : register ? "注册并进入" : "进入工作台"
            }}<ArrowRight :size="18" />
          </button>
        </form>
        <p class="login-switch">
          {{ register ? "已有账号？" : "还没有学生账号？"
          }}<button
            class="text-button"
            @click="
              register = !register;
              error = '';
            "
          >
            {{ register ? "返回登录" : "立即注册" }}
          </button>
        </p>
      </div>
    </section>
  </div>
</template>
