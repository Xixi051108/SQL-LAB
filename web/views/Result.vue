<script setup>
import { formatSQL } from "../../shared/sql.js";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import {
  CheckCircle2,
  XCircle,
  Clock3,
  ArrowLeft,
  RotateCw,
} from "lucide-vue-next";
import { api, notify, labels, state, statuses } from "../state.js";
const route = useRoute(),
  attempt = ref(null),
  error = ref("");
let timer;
const total = computed(
  () => attempt.value?.questions.reduce((n, q) => n + q.points, 0) || 0,
);
const correct = computed(
  () =>
    attempt.value?.questions.filter((q) => q.verdict === "correct").length || 0,
);
async function load() {
  try {
    attempt.value = await api(`/attempts/${route.params.id}`);
    error.value = "";
    if (["graded", "error", "active"].includes(attempt.value.status))
      clearInterval(timer);
  } catch (e) {
    error.value = e.message;
    clearInterval(timer);
  }
}
async function retry() {
  try {
    await api(`/attempts/${attempt.value.id}/retry`, {
      method: "POST",
      body: {},
    });
    await load();
    timer = setInterval(load, 2000);
  } catch (e) {
    notify(e.message, true);
  }
}
onMounted(() => {
  load();
  timer = setInterval(load, 2000);
});
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <RouterLink to="/" class="back-link"
    ><ArrowLeft :size="16" />返回工作台</RouterLink
  >
  <div v-if="error" class="form-error" role="alert">{{ error }}</div>
  <div v-else-if="!attempt" class="empty-state">正在读取答卷…</div>
  <template v-else
    ><div class="page-heading">
      <div>
        <span class="eyebrow">EXAM RESULTS</span>
        <h1>{{ attempt.title }}</h1>
        <p>考试成绩与逐题反馈。</p>
      </div>
      <span
        :class="['badge', attempt.status === 'graded' ? 'green' : 'amber']"
        >{{ statuses[attempt.status] }}</span
      >
    </div>
    <div v-if="attempt.status === 'active'" class="info-banner">
      答卷尚未提交。<RouterLink :to="'/attempt/' + attempt.id"
        >返回作答</RouterLink
      >
    </div>
    <div v-else-if="attempt.status !== 'graded'" class="panel grading-state">
      <Clock3 :size="30" />
      <h2>
        {{
          attempt.status === "error" ? "判题暂未完成" : "答卷已提交，正在判题"
        }}
      </h2>
      <p>
        {{
          attempt.status === "error"
            ? attempt.error_message
            : "系统正在独立环境中验证每道题，结果会自动更新。"
        }}
      </p>
      <button
        v-if="attempt.status === 'error' && state.user.role === 'teacher'"
        class="button"
        @click="retry"
      >
        <RotateCw :size="16" />重新判题
      </button>
    </div>
    <template v-if="attempt.status === 'graded'"
      ><section class="result-summary">
        <div class="score-block">
          <span class="eyebrow">YOUR SCORE</span
          ><strong
            >{{ attempt.score }}<small>/ {{ total }}</small></strong
          ><span>考试总分</span>
        </div>
        <div class="result-stat">
          <strong
            >{{ correct
            }}<small>/ {{ attempt.questions.length }}</small></strong
          ><span>通过题目</span>
        </div>
        <div class="result-summary-note">
          <CheckCircle2 :size="24" />
          <h3>本次考试已完成</h3>
        </div>
      </section>
      <section
        v-for="q in attempt.questions"
        :key="q.id"
        class="panel result-question"
      >
        <div class="result-question-heading">
          <div>
            <component
              :is="q.verdict === 'correct' ? CheckCircle2 : XCircle"
              :size="21"
              :class="q.verdict === 'correct' ? 'success-text' : 'danger-text'"
            />
            <h2>{{ q.position }}. {{ q.title }}</h2>
            <span class="type-tag">{{ labels[q.type] }}</span>
          </div>
          <strong>{{ q.score }} / {{ q.points }} 分</strong>
        </div>
        <p class="problem-text">{{ q.prompt }}</p>
        <p
          :class="[
            'verdict-line',
            q.verdict === 'correct' ? 'success-text' : 'danger-text',
          ]"
        >
          {{ q.feedback }}
        </p>
        <div class="answer-comparison">
          <div>
            <h4>我的答案</h4>
            <pre>{{ formatSQL(q.sql) || "未作答" }}</pre>
          </div>
          <div>
            <h4>参考答案</h4>
            <pre>{{ formatSQL(q.reference_sql) }}</pre>
          </div>
        </div>
        <div class="explanation">
          <strong>解题思路</strong>
          <p>{{ q.explanation }}</p>
        </div>
      </section></template
    ></template
  >
</template>
