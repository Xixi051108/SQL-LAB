<script setup>
import { ref, computed, onMounted } from "vue";
import { Plus, Search, Pencil, Trash2, X } from "lucide-vue-next";
import { api, state, notify } from "../state.js";
import { useDialog } from "../dialog.js";
const rows = ref([]),
  search = ref(""),
  role = ref(""),
  editing = ref(false),
  busy = ref(false),
  error = ref(""),
  form = ref({});
useDialog(editing, busy);
const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      (!role.value || r.role === role.value) &&
      (!search.value ||
        r.number.includes(search.value.toUpperCase()) ||
        r.name.includes(search.value)),
  ),
);
async function load() {
  rows.value = await api("/roster");
}
function edit(row) {
  form.value = row
    ? { ...row, enabled: Boolean(row.enabled) }
    : { number: "", name: "", role: "student", enabled: true };
  error.value = "";
  editing.value = true;
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await api(form.value.id ? "/roster/" + form.value.id : "/roster", {
      method: form.value.id ? "PUT" : "POST",
      body: form.value,
    });
    editing.value = false;
    notify("名册已保存");
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function remove(row) {
  if (!confirm("删除这条尚未注册的名单？")) return;
  try {
    await api("/roster/" + row.id, { method: "DELETE", body: {} });
    notify("名单已删除");
    await load();
  } catch (e) {
    notify(e.message, true);
  }
}
onMounted(() => load().catch((e) => notify(e.message, true)));
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ROSTER</span>
      <h1>师生名册</h1>
      <p>注册时核对学号、工号与姓名。</p>
    </div>
    <button class="button primary" @click="edit()">
      <Plus :size="18" />录入人员
    </button>
  </div>
  <section class="panel">
    <div class="toolbar">
      <div class="search-field">
        <Search :size="17" /><input
          v-model.trim="search"
          placeholder="搜索学号、工号或姓名"
          aria-label="搜索名册"
        />
      </div>
      <select v-model="role" aria-label="筛选身份">
        <option value="">全部身份</option>
        <option value="teacher">教师</option>
        <option value="student">学生</option></select
      ><span class="muted small">{{ filtered.length }} 人</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>学号 / 工号</th>
            <th>姓名</th>
            <th>身份</th>
            <th>账号</th>
            <th>状态</th>
            <th class="align-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.id">
            <td>
              <strong>{{ r.number }}</strong>
            </td>
            <td>{{ r.name }}</td>
            <td>{{ r.role === "teacher" ? "教师" : "学生" }}</td>
            <td>
              <span :class="['badge', r.user_id ? 'blue' : 'gray']">{{
                r.user_id ? "已注册" : "未注册"
              }}</span>
            </td>
            <td>
              <span :class="['badge', r.enabled ? 'green' : 'gray']">{{
                r.enabled ? "启用" : "停用"
              }}</span>
            </td>
            <td>
              <div class="row-actions">
                <button
                  class="icon-button"
                  :aria-label="'编辑 ' + r.name"
                  @click="edit(r)"
                >
                  <Pencil :size="16" /></button
                ><button
                  class="icon-button danger-text"
                  :aria-label="'删除 ' + r.name"
                  :disabled="!!r.user_id"
                  @click="remove(r)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!filtered.length" class="empty-state">没有匹配的人员。</div>
  </section>
  <div
    v-if="editing"
    class="modal-backdrop"
    @click.self="!busy && (editing = false)"
  >
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-heading"
    >
      <div class="modal-header">
        <h2 id="roster-heading">{{ form.id ? "编辑人员" : "录入人员" }}</h2>
        <button
          class="icon-button"
          aria-label="关闭名册编辑"
          :disabled="busy"
          @click="editing = false"
        >
          <X :size="20" />
        </button>
      </div>
      <form @submit.prevent="save">
        <label
          >学号/工号<input
            v-model.trim="form.number"
            required
            minlength="3"
            maxlength="32"
            :readonly="!!form.user_id"
            placeholder="输入校内编号" /></label
        ><label
          >姓名<input
            v-model.trim="form.name"
            required
            maxlength="40"
            placeholder="输入姓名" /></label
        ><label
          >身份<select v-model="form.role" :disabled="!!form.user_id">
            <option value="student">学生</option>
            <option value="teacher">教师</option>
          </select></label
        ><label class="checkbox-label"
          ><input
            type="checkbox"
            v-model="form.enabled"
            :disabled="form.number === state.user.username"
          />允许注册和登录</label
        >
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="modal-footer">
          <span v-if="form.user_id" class="muted small"
            >已注册账号的编号和身份已锁定</span
          ><button
            type="button"
            class="button"
            :disabled="busy"
            @click="editing = false"
          >
            取消</button
          ><button class="button primary" :disabled="busy">
            {{ busy ? "保存中…" : "保存" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
