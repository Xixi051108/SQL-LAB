<script setup>
import { formatSQL } from "../../shared/sql.js";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import {
  Clock3,
  CheckCircle2 as CloudCheck,
  CloudOff,
  ChevronLeft,
  ChevronRight,
  Send,
  Database,
  Code2,
} from "lucide-vue-next";
import { api, notify, labels } from "../state.js";
const route = useRoute(),
  router = useRouter(),
  attempt = ref(null),
  index = ref(0),
  answers = ref({}),
  schema = ref(""),
  saving = ref(false),
  saveError = ref(""),
  lastSaved = ref(""),
  submitting = ref(false),
  now = ref(Date.now());
const revision = ref(0),
  savedRevision = ref(0);
let offset = 0,
  savePromise = null,
  clock,
  autosave;
const current = computed(() => attempt.value?.questions[index.value]);
const remaining = computed(() =>
  Math.max(
    0,
    Math.ceil(
      (new Date(attempt.value?.ends_at).getTime() - now.value) / 1000,
    ) || 0,
  ),
);
const countdown = computed(() =>
  [
    Math.floor(remaining.value / 3600),
    Math.floor((remaining.value % 3600) / 60),
    remaining.value % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":"),
);
const answered = computed(
  () => Object.values(answers.value).filter((x) => x.trim()).length,
);
function payload() {
  return Object.entries(answers.value).map(([question_id, sql]) => ({
    question_id: Number(question_id),
    sql,
  }));
}
async function save() {
  if (
    !attempt.value ||
    submitting.value ||
    remaining.value <= 0 ||
    revision.value === savedRevision.value
  )
    return;
  if (savePromise) return savePromise;
  saving.value = true;
  const captured = revision.value;
  savePromise = (async () => {
    try {
      const result = await api(`/attempts/${attempt.value.id}/answers`, {
        method: "PUT",
        body: { answers: payload() },
      });
      savedRevision.value = captured;
      saveError.value = "";
      lastSaved.value = new Date(result.saved_at).toLocaleTimeString("zh-CN", {
        hour12: false,
      });
      offset = new Date(result.server_time).getTime() - Date.now();
    } catch (e) {
      saveError.value = e.message;
      throw e;
    } finally {
      saving.value = false;
      savePromise = null;
    }
  })();
  return savePromise;
}
async function change(i) {
  if (i < 0 || i >= attempt.value.questions.length) return;
  try {
    await save();
  } catch (e) {
    notify(e.message, true);
  }
  index.value = i;
}
async function submit(manual = true) {
  if (submitting.value) return;
  if (
    manual &&
    !confirm(
      `已完成 ${answered.value}/${attempt.value.questions.length} 道题。交卷后不能修改，确认交卷？`,
    )
  )
    return;
  try {
    if (savePromise) await savePromise.catch(() => {});
    submitting.value = true;
    await api(`/attempts/${attempt.value.id}/submit`, {
      method: "POST",
      body: manual && remaining.value > 0 ? { answers: payload() } : {},
    });
    savedRevision.value = revision.value;
    router.replace(`/result/${attempt.value.id}`);
  } catch (e) {
    saveError.value = e.message;
    notify(e.message, true);
  } finally {
    submitting.value = false;
  }
}
function beforeUnload(e) {
  if (revision.value !== savedRevision.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onBeforeRouteLeave(async () => {
  if (submitting.value || remaining.value <= 0) return true;
  try {
    await save();
    return true;
  } catch {
    return confirm("最新答案尚未保存，离开会丢失未保存内容。仍要离开？");
  }
});
onMounted(async () => {
  try {
    const a = await api(`/attempts/${route.params.id}`);
    if (a.status !== "active") {
      router.replace(`/result/${a.id}`);
      return;
    }
    attempt.value = a;
    offset = new Date(a.server_time).getTime() - Date.now();
    now.value = Date.now() + offset;
    for (const q of a.questions) answers.value[q.id] = q.sql;
    const timestamps = a.questions
      .map((q) => q.saved_at)
      .filter(Boolean)
      .sort();
    if (timestamps.length)
      lastSaved.value = new Date(timestamps.at(-1)).toLocaleTimeString(
        "zh-CN",
        { hour12: false },
      );
    schema.value = (await api("/schema")).description;
    clock = setInterval(() => {
      now.value = Date.now() + offset;
      if (remaining.value <= 0) submit(false);
    }, 1000);
    autosave = setInterval(() => save().catch(() => {}), 5000);
    window.addEventListener("beforeunload", beforeUnload);
  } catch (e) {
    notify(e.message, true);
  }
});
onUnmounted(() => {
  clearInterval(clock);
  clearInterval(autosave);
  window.removeEventListener("beforeunload", beforeUnload);
});
function indent(event) {
  const el = event.target,
    start = el.selectionStart,
    end = el.selectionEnd;
  answers.value[current.value.id] =
    el.value.slice(0, start) + "  " + el.value.slice(end);
  revision.value++;
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = start + 2;
  });
}
function prettify() {
  const id = current.value.id;
  const formatted = formatSQL(answers.value[id]);
  if (formatted !== answers.value[id]) {
    answers.value[id] = formatted;
    revision.value++;
  }
}
</script>
<template>
  <div v-if="!attempt" class="empty-state">正在打开答题环境…</div>
  <template v-else
    ><div class="workspace-heading">
      <div>
        <RouterLink to="/" class="back-link"
          ><ChevronLeft :size="16" />我的考试</RouterLink
        >
        <h1>{{ attempt.title }}</h1>
      </div>
      <div class="exam-clock" :class="{ urgent: remaining < 300 }">
        <Clock3 :size="20" />
        <div>
          <small>距离统一截止</small><strong>{{ countdown }}</strong>
        </div>
      </div>
      <button
        class="button primary"
        :disabled="submitting"
        @click="submit(true)"
      >
        <Send :size="17" />{{ submitting ? "正在交卷…" : "交卷并查看结果" }}
      </button>
    </div>
    <div class="workspace-grid">
      <aside class="panel problem-nav">
        <div class="panel-heading">
          <h3>答题进度</h3>
          <span>{{ answered }} / {{ attempt.questions.length }}</span>
        </div>
        <div class="question-numbers">
          <button
            v-for="(q, i) in attempt.questions"
            :key="q.id"
            :class="{ current: i === index, answered: answers[q.id]?.trim() }"
            :aria-label="'第 ' + (i + 1) + ' 题'"
            :aria-current="i === index ? 'step' : undefined"
            @click="change(i)"
          >
            {{ i + 1 }}
          </button>
        </div>
        <div class="progress-track">
          <span
            :style="{
              width: (answered / attempt.questions.length) * 100 + '%',
            }"
          ></span>
        </div>
        <p class="muted small">切题时保存，作答中每 5 秒自动保存。</p>
        <div class="schema-box">
          <h3><Database :size="16" />教学库结构</h3>
          <pre>{{ schema }}</pre>
        </div>
      </aside>
      <section class="answer-panel">
        <div class="panel question-panel">
          <div class="question-meta">
            <span class="eyebrow"
              >QUESTION {{ String(index + 1).padStart(2, "0") }}</span
            ><span class="type-tag">{{ labels[current.type] }}</span
            ><span class="muted small">{{ current.points }} 分</span>
          </div>
          <h2>{{ current.title }}</h2>
          <p class="problem-text">{{ current.prompt }}</p>
          <div class="question-rule">
            每题一条 SQL · 每道题均使用独立初始数据 ·
            {{
              current.ordered ? "结果需按要求排序" : "未指定排序时不比较行顺序"
            }}
          </div>
        </div>
        <div class="editor-panel">
          <div class="editor-toolbar">
            <span><Code2 :size="17" />answer.sql</span>
            <button class="format-button" :disabled="remaining <= 0 || submitting" @click="prettify">格式化</button>
            <small>MySQL 8.0</small>
          </div>
          <div class="editor-body">
            <div class="line-numbers" aria-hidden="true">
              {{
                Array.from(
                  {
                    length: Math.max(
                      14,
                      (answers[current.id] || "").split("\n").length,
                    ),
                  },
                  (_, i) => i + 1,
                ).join("\n")
              }}
            </div>
            <textarea
              :key="current.id"
              v-model="answers[current.id]"
              aria-label="SQL 答案"
              class="sql-editor"
              spellcheck="false"
              placeholder="在这里编写你的 SQL…"
              maxlength="8000"
              :disabled="remaining <= 0 || submitting"
              @input="revision++"
              @keydown.tab.prevent="indent"
            />
          </div>
          <div
            class="editor-status"
            :class="{ failed: saveError }"
            role="status"
          >
            <span
              ><component
                :is="saveError ? CloudOff : CloudCheck"
                :size="15"
              />{{
                saveError
                  ? saveError
                  : saving
                    ? "正在保存…"
                    : revision !== savedRevision
                      ? "有未保存的修改"
                      : lastSaved
                        ? "已保存 " + lastSaved
                        : "尚未作答"
              }}</span
            >
          </div>
        </div>
        <div class="question-bottom">
          <button
            class="button"
            :disabled="index === 0"
            @click="change(index - 1)"
          >
            <ChevronLeft :size="17" />上一题</button
          ><button
            class="button"
            :disabled="index === attempt.questions.length - 1"
            @click="change(index + 1)"
          >
            下一题<ChevronRight :size="17" />
          </button>
        </div>
      </section></div
  ></template>
</template>
