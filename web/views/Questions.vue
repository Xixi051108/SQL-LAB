<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import {
  Plus,
  Sparkles,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  X,
  ArrowRight,
} from "lucide-vue-next";
import { api, notify, labels, statuses } from "../state.js";
import { useDialog } from "../dialog.js";
const route = useRoute(),
  questions = ref([]),
  search = ref(""),
  type = ref(""),
  editing = ref(false),
  busy = ref(false),
  error = ref(""),
  form = ref({}),
  ai = ref(""),
  schema = ref("");
useDialog(editing, busy);
const filtered = computed(() =>
  questions.value.filter(
    (q) =>
      (!type.value || q.type === type.value) &&
      (!search.value ||
        q.title.includes(search.value) ||
        q.prompt.includes(search.value)),
  ),
);
const blank = () => ({
  title: "",
  type: "select",
  prompt: "",
  reference_sql: "",
  explanation: "",
  target_table: "students",
  ordered: false,
  source: "manual",
});
function edit(q) {
  form.value = q ? { ...q, ordered: Boolean(q.ordered) } : blank();
  error.value = "";
  ai.value = "";
  editing.value = true;
}
async function load() {
  questions.value = await api("/questions");
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await api(form.value.id ? `/questions/${form.value.id}` : "/questions", {
      method: form.value.id ? "PUT" : "POST",
      body: form.value,
    });
    editing.value = false;
    notify("题目草稿已保存，审核通过后可用于组卷");
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function generate() {
  busy.value = true;
  error.value = "";
  try {
    form.value = {
      ...(await api("/questions/generate", {
        method: "POST",
        body: { type: form.value.type, requirement: ai.value },
      })),
    };
    notify("草稿已生成");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function approve(q) {
  busy.value = true;
  try {
    await api(`/questions/${q.id}/approve`, { method: "POST", body: {} });
    notify("题目已审核");
    await load();
  } catch (e) {
    notify(e.message, true);
  } finally {
    busy.value = false;
  }
}
async function remove(q) {
  if (!confirm("删除此题？已发布考试的题目快照会保留。")) return;
  try {
    await api(`/questions/${q.id}`, { method: "DELETE", body: {} });
    notify("题目已删除");
    await load();
  } catch (e) {
    notify(e.message, true);
  }
}
onMounted(async () => {
  try {
    await load();
    schema.value = (await api("/schema")).description;
    if (route.query.new) edit();
  } catch (e) {
    notify(e.message, true);
  }
});
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">QUESTION LIBRARY</span>
      <h1>题库管理</h1>
      <p>管理题目与参考答案。</p>
    </div>
    <button class="button primary" @click="edit()">
      <Plus :size="18" />创建题目
    </button>
  </div>
  <section class="panel">
    <div class="toolbar">
      <div class="search-field">
        <Search :size="17" /><input
          v-model="search"
          aria-label="搜索题目"
          placeholder="搜索题目或题干"
        />
      </div>
      <select v-model="type" aria-label="按题型筛选">
        <option value="">全部题型</option>
        <option v-for="(name, key) in labels" :key="key" :value="key">
          {{ name }}
        </option></select
      ><span class="muted small">共 {{ filtered.length }} 道题目</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>题目</th>
            <th>题型</th>
            <th>来源</th>
            <th>审核状态</th>
            <th class="align-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="q in filtered" :key="q.id">
            <td>
              <strong>{{ q.title }}</strong
              ><small class="table-sub"
                >{{ q.prompt.slice(0, 65)
                }}{{ q.prompt.length > 65 ? "…" : "" }}</small
              >
            </td>
            <td>
              <span class="type-tag">{{ labels[q.type] }}</span>
            </td>
            <td>
              <span :class="['source-tag', { ai: q.source === 'deepseek' }]"
                ><Sparkles v-if="q.source === 'deepseek'" :size="13" />{{
                  q.source === "deepseek" ? "DeepSeek" : "手动录入"
                }}</span
              >
            </td>
            <td>
              <span
                :class="['badge', q.status === 'approved' ? 'green' : 'amber']"
                >{{ statuses[q.status] }}</span
              >
            </td>
            <td>
              <div class="row-actions">
                <button
                  v-if="q.status !== 'approved'"
                  class="text-button"
                  :disabled="busy"
                  @click="approve(q)"
                >
                  <CheckCircle2 :size="15" />验证审核</button
                ><button
                  class="icon-button"
                  :aria-label="'编辑 ' + q.title"
                  @click="edit(q)"
                >
                  <Pencil :size="16" /></button
                ><button
                  class="icon-button danger-text"
                  :aria-label="'删除 ' + q.title"
                  @click="remove(q)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!filtered.length" class="empty-state">
      没有匹配的题目。创建一道题，或调整筛选条件。
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
      aria-labelledby="question-heading"
    >
      <div class="modal-header">
        <div>
          <span class="eyebrow">QUESTION EDITOR</span>
          <h2 id="question-heading">{{ form.id ? "编辑题目" : "创建题目" }}</h2>
        </div>
        <button
          class="icon-button"
          aria-label="关闭编辑器"
          :disabled="busy"
          @click="editing = false"
        >
          <X :size="21" />
        </button>
      </div>
      <form @submit.prevent="save">
        <div class="form-columns">
          <label
            >题型<select v-model="form.type">
              <option v-for="(name, key) in labels" :key="key" :value="key">
                {{ name }}
              </option>
            </select></label
          ><label
            >目标表<select v-model="form.target_table">
              <option
                v-for="t in [
                  'students',
                  'courses',
                  'enrollments',
                  'old_records',
                  'study_notes',
                ]"
                :key="t"
              >
                {{ t }}
              </option>
            </select></label
          >
        </div>
        <div class="ai-compose">
          <div>
            <Sparkles :size="18" /><strong>用 DeepSeek 构思题目</strong
            ><span class="badge blue">AI 草稿</span>
          </div>
          <div>
            <input
              v-model="ai"
              aria-label="AI 出题要求"
              maxlength="1000"
              placeholder="例如：考查聚合函数与分组，中等难度"
            /><button
              type="button"
              class="button"
              :disabled="busy"
              @click="generate"
            >
              {{ busy ? "处理中…" : "生成草稿" }}<ArrowRight :size="15" />
            </button>
          </div>
          <small>保存后需审核，才能用于组卷。</small>
        </div>
        <label
          >题目标题<input
            v-model.trim="form.title"
            required
            maxlength="160" /></label
        ><label
          >完整题干<textarea
            v-model="form.prompt"
            required
            rows="3"
            maxlength="6000"
            placeholder="写清输出字段、影响范围及表结构要求"
          /></label
        ><label
          >参考 SQL<textarea
            v-model="form.reference_sql"
            class="code-input"
            required
            rows="4"
            maxlength="8000"
            spellcheck="false"
          /></label
        ><label class="checkbox-label"
          ><input
            type="checkbox"
            v-model="form.ordered"
          />查询结果需要严格匹配行顺序</label
        ><label
          >参考解析<textarea
            v-model="form.explanation"
            required
            rows="3"
            maxlength="6000"
          />
        </label>
        <details>
          <summary>查看教学库结构</summary>
          <pre class="schema-text">{{ schema }}</pre>
        </details>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="modal-footer">
          <span class="muted small">编辑后将恢复为待审核草稿</span
          ><button
            type="button"
            class="button"
            :disabled="busy"
            @click="editing = false"
          >
            取消</button
          ><button class="button primary" :disabled="busy">
            {{ busy ? "处理中…" : "保存草稿" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
