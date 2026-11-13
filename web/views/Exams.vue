<script setup>
import { ref, onMounted, computed } from "vue";
import { Plus, X, Send, Pencil, Trash2, CalendarClock } from "lucide-vue-next";
import { api, notify, labels, dateTime } from "../state.js";
import { useDialog } from "../dialog.js";
const exams = ref([]),
  bank = ref([]),
  editing = ref(false),
  busy = ref(false),
  error = ref(""),
  form = ref({});
useDialog(editing, busy);
const localTime = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const total = computed(
  () =>
    form.value.questions?.reduce((n, q) => n + Number(q.points || 0), 0) || 0,
);
async function load() {
  const [data, q] = await Promise.all([api("/exams"), api("/questions")]);
  exams.value = data.exams;
  bank.value = q.filter((x) => x.status === "approved");
}
async function edit(exam) {
  error.value = "";
  try {
    if (exam) {
      const e = await api(`/exams/${exam.id}`);
      form.value = {
        ...e,
        starts_at: localTime(new Date(e.starts_at)),
        ends_at: localTime(new Date(e.ends_at)),
        questions: e.questions.map((q) => ({
          id: q.question_id,
          points: q.points,
        })),
      };
    } else
      form.value = {
        title: "",
        starts_at: localTime(new Date(Date.now() + 60000)),
        ends_at: localTime(new Date(Date.now() + 61 * 60000)),
        questions: [],
      };
    editing.value = true;
  } catch (e) {
    notify(e.message, true);
  }
}
function selected(id) {
  return form.value.questions?.find((q) => q.id === id);
}
function toggle(q) {
  const item = selected(q.id);
  if (item)
    form.value.questions = form.value.questions.filter((x) => x.id !== q.id);
  else form.value.questions.push({ id: q.id, points: 10 });
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    const f = form.value;
    await api(f.id ? `/exams/${f.id}` : "/exams", {
      method: f.id ? "PUT" : "POST",
      body: {
        ...f,
        starts_at: new Date(f.starts_at).toISOString(),
        ends_at: new Date(f.ends_at).toISOString(),
      },
    });
    editing.value = false;
    notify("考试草稿已保存");
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function publish(e) {
  if (!confirm("发布后题目、分值和考试时间将冻结。确认发布？")) return;
  try {
    await api(`/exams/${e.id}/publish`, { method: "POST", body: {} });
    notify("考试已发布");
    await load();
  } catch (err) {
    notify(err.message, true);
  }
}
async function remove(e) {
  if (!confirm("删除这场草稿考试？")) return;
  try {
    await api(`/exams/${e.id}`, { method: "DELETE", body: {} });
    await load();
    notify("草稿考试已删除");
  } catch (err) {
    notify(err.message, true);
  }
}
onMounted(() => load().catch((e) => notify(e.message, true)));
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">EXAM MANAGEMENT</span>
      <h1>考试管理</h1>
      <p>从已审核的题库组卷，统一安排考试时间。</p>
    </div>
    <button class="button primary" @click="edit()">
      <Plus :size="18" />创建考试
    </button>
  </div>
  <section class="panel">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>考试名称</th>
            <th>考试时间</th>
            <th>题量 / 总分</th>
            <th>状态</th>
            <th class="align-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in exams" :key="e.id">
            <td>
              <strong>{{ e.title }}</strong
              ><small class="table-sub"
                >EXAM #{{ String(e.id).padStart(3, "0") }}</small
              >
            </td>
            <td>
              {{ dateTime(e.starts_at)
              }}<small class="table-sub">至 {{ dateTime(e.ends_at) }}</small>
            </td>
            <td>{{ e.question_count }} 道 / {{ e.total_points }} 分</td>
            <td>
              <span
                :class="['badge', e.status === 'published' ? 'green' : 'amber']"
                >{{ e.status === "published" ? "已发布" : "草稿" }}</span
              >
            </td>
            <td>
              <div v-if="e.status === 'draft'" class="row-actions">
                <button class="text-button" @click="publish(e)">
                  <Send :size="15" />发布</button
                ><button
                  class="icon-button"
                  aria-label="编辑考试"
                  @click="edit(e)"
                >
                  <Pencil :size="16" /></button
                ><button
                  class="icon-button danger-text"
                  aria-label="删除考试"
                  @click="remove(e)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <span v-else class="small muted">已冻结题目快照</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!exams.length" class="empty-state">
      还没有考试。先审核题目，再创建第一份试卷。
    </div>
  </section>
  <div
    v-if="editing"
    class="modal-backdrop"
    @click.self="!busy && (editing = false)"
  >
    <section
      class="modal wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-heading"
    >
      <div class="modal-header">
        <div>
          <span class="eyebrow">BUILD AN EXAM</span>
          <h2 id="exam-heading">{{ form.id ? "编辑考试" : "创建考试" }}</h2>
        </div>
        <button
          class="icon-button"
          aria-label="关闭组卷"
          :disabled="busy"
          @click="editing = false"
        >
          <X :size="21" />
        </button>
      </div>
      <form @submit.prevent="save">
        <label
          >考试名称<input
            v-model.trim="form.title"
            required
            maxlength="160"
            placeholder="例如：数据库原理 · SQL 综合测验"
        /></label>
        <div class="form-columns">
          <label
            >开始时间<input
              v-model="form.starts_at"
              type="datetime-local"
              required /></label
          ><label
            >结束时间<input
              v-model="form.ends_at"
              type="datetime-local"
              required
          /></label>
        </div>
        <div class="selection-heading">
          <h3>选择题目</h3>
          <span class="muted small"
            >已选 {{ form.questions.length }} 题 · {{ total }} 分</span
          >
        </div>
        <div v-if="!bank.length" class="empty-state">
          没有已审核题目，请先到题库完成验证审核。
        </div>
        <div class="question-select">
          <div
            v-for="q in bank"
            :key="q.id"
            :class="['question-option', { selected: selected(q.id) }]"
          >
            <label class="checkbox-label"
              ><input
                type="checkbox"
                :checked="!!selected(q.id)"
                @change="toggle(q)"
              /><span
                ><strong>{{ q.title }}</strong
                ><small>{{ labels[q.type] }}</small></span
              ></label
            ><label v-if="selected(q.id)" class="point-input"
              >分值<input
                v-model.number="selected(q.id).points"
                type="number"
                min="1"
                max="100"
                required
                :aria-label="q.title + '分值'"
            /></label>
          </div>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="modal-footer">
          <span class="muted small">保存后可再次编辑，发布后冻结</span
          ><button
            type="button"
            class="button"
            @click="editing = false"
            :disabled="busy"
          >
            取消</button
          ><button
            class="button primary"
            :disabled="busy || !form.questions.length"
          >
            {{ busy ? "保存中…" : "保存草稿" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
