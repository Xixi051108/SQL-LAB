<script setup>
import { ref, onMounted, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowRight,
  Plus,
  BookOpen,
  Clock3,
  CheckCircle2,
  Layers3,
  Code2,
  Activity,
  Database,
} from "lucide-vue-next";
import { api, state, notify, dateTime, statuses } from "../state.js";
const router = useRouter(),
  exams = ref([]),
  questions = ref([]),
  results = ref([]),
  system = ref(null),
  loading = ref(true),
  now = ref(Date.now()),
  offset = ref(0);
const teacher = computed(() => state.user.role === "teacher");
const approved = computed(
  () => questions.value.filter((q) => q.status === "approved").length,
);
const timer = setInterval(() => (now.value = Date.now() + offset.value), 1000);
onUnmounted(() => clearInterval(timer));
const phase = (e) =>
  now.value < new Date(e.starts_at)
    ? "未开始"
    : now.value >= new Date(e.ends_at)
      ? "已结束"
      : "进行中";
async function load() {
  try {
    const data = await api("/exams");
    exams.value = data.exams;
    offset.value = new Date(data.server_time).getTime() - Date.now();
    now.value = Date.now() + offset.value;
    if (teacher.value) {
      [questions.value, results.value, system.value] = await Promise.all([
        api("/questions"),
        api("/results"),
        api("/system"),
      ]);
    }
  } catch (e) {
    notify(e.message, true);
  } finally {
    loading.value = false;
  }
}
async function enter(e) {
  try {
    const a = await api(`/exams/${e.id}/start`, { method: "POST", body: {} });
    router.push(
      `/${e.attempt_status && e.attempt_status !== "active" ? "result" : "attempt"}/${a.id}`,
    );
  } catch (err) {
    notify(err.message, true);
  }
}
onMounted(load);
</script>
<template>
  <div class="page-heading intro-panel">
    <div>
      <h1>{{ teacher ? "从一道好题开始。" : "今天，检验你的 SQL 能力。" }}</h1>
      <p>
        {{
          teacher
            ? "管理题目、安排考试，关注每一次进步。"
            : "查看考试安排，完成作答并获取反馈。"
        }}
      </p>
      <RouterLink v-if="teacher" to="/questions?new=1" class="button primary"
        ><Plus :size="18" />创建题目</RouterLink
      >
    </div>
    <img class="intro-art" src="/lab.svg" alt="" aria-hidden="true" />
  </div>
  <div v-if="loading" class="empty-state">正在加载教学空间…</div>
  <template v-else>
    <div class="metric-grid">
      <div class="metric">
        <span
          ><BookOpen :size="18" />{{ teacher ? "题库总量" : "开放考试" }}</span
        ><strong
          >{{ teacher ? questions.length : exams.length
          }}<small>{{ teacher ? "道" : "场" }}</small></strong
        >
        <p>
          {{
            teacher
              ? `${approved} 道已审核，可用于组卷`
              : "查看时间安排，按时进入考试"
          }}
        </p>
      </div>
      <div class="metric">
        <span
          ><Clock3 :size="18" />{{
            teacher ? "已发布考试" : "进行中的考试"
          }}</span
        ><strong
          >{{
            exams.filter((e) =>
              teacher ? e.status === "published" : phase(e) === "进行中",
            ).length
          }}<small>场</small></strong
        >
      </div>
      <div class="metric">
        <span
          ><CheckCircle2 :size="18" />{{
            teacher ? "完成答卷" : "完成考试"
          }}</span
        ><strong
          >{{
            teacher
              ? results.filter((r) => r.status === "graded").length
              : exams.filter((e) => e.attempt_status === "graded").length
          }}<small>份</small></strong
        >
      </div>
    </div>
    <div class="overview-grid">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">EXAM SCHEDULE</span>
            <h2>{{ teacher ? "考试安排" : "我的考试" }}</h2>
          </div>
          <RouterLink v-if="teacher" to="/exams" class="text-button"
            >管理考试 <ArrowRight :size="16" /></RouterLink
          ><button v-else class="text-button" @click="load">刷新列表</button>
        </div>
        <div v-if="!exams.length" class="empty-state">
          暂无考试。{{
            teacher ? "创建试卷后即可发布。" : "教师发布考试后将在这里显示。"
          }}
        </div>
        <div v-for="e in exams" :key="e.id" class="exam-row">
          <div class="exam-icon"><Code2 :size="24" /></div>
          <div class="exam-row-body">
            <div class="exam-title-line">
              <h3>{{ e.title }}</h3>
              <span
                :class="['badge', phase(e) === '进行中' ? 'blue' : 'gray']"
                >{{ e.status === "draft" ? "草稿" : phase(e) }}</span
              >
            </div>
            <p>{{ dateTime(e.starts_at) }} — {{ dateTime(e.ends_at) }}</p>
            <div class="exam-facts">
              <span>{{ e.question_count }} 道题</span
              ><span>{{ e.total_points }} 分</span
              ><span v-if="e.attempt_status">{{
                statuses[e.attempt_status]
              }}</span>
            </div>
          </div>
          <RouterLink
            v-if="teacher"
            to="/exams"
            class="icon-button"
            aria-label="管理考试"
            ><ArrowRight :size="20" /></RouterLink
          ><button
            v-else-if="e.attempt_id || phase(e) === '进行中'"
            class="button"
            @click="enter(e)"
          >
            {{
              e.attempt_status && e.attempt_status !== "active"
                ? "查看结果"
                : e.attempt_id
                  ? "继续答题"
                  : "进入考试"
            }}<ArrowRight :size="16" /></button
          ><span v-else class="muted small">{{
            phase(e) === "未开始" ? "等待开考" : "已截止"
          }}</span>
        </div>
      </section>
      <aside class="overview-side">
        <section class="panel schema-card">
          <div class="panel-heading">
            <h2>教学库结构</h2>
            <Database :size="18" />
          </div>
          <div class="mini-schema">
            <div>
              <b>students</b><small>id <i>PK</i> · name · major · age</small>
            </div>
            <span class="schema-connector">1 ───── N</span>
            <div>
              <b>enrollments</b
              ><small>student_id <i>FK</i> · course_id <i>FK</i> · score</small>
            </div>
            <span class="schema-connector">N ───── 1</span>
            <div>
              <b>courses</b><small>id <i>PK</i> · name · credits</small>
            </div>
          </div>
        </section>
        <section v-if="teacher && system" class="panel system-card">
          <h3><Activity :size="17" />环境状态</h3>
          <div
            v-for="s in [
              { name: '业务数据库', ok: system.database },
              { name: 'SQL 判题环境', ok: system.judge },
              { name: 'DeepSeek 出题', ok: system.deepseek },
            ]"
            :key="s.name"
          >
            <span>{{ s.name }}</span
            ><span :class="['status-text', { bad: !s.ok }]"
              ><i></i>{{ s.ok ? "已就绪" : "待配置" }}</span
            >
          </div>
        </section>
      </aside>
    </div></template
  >
</template>
