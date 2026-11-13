<script setup>
import { ref, onMounted } from "vue";
import { RotateCw, ArrowUpRight } from "lucide-vue-next";
import { api, notify, statuses, dateTime } from "../state.js";
const results = ref([]);
async function load() {
  try {
    results.value = await api("/results");
  } catch (e) {
    notify(e.message, true);
  }
}
async function retry(r) {
  try {
    await api(`/attempts/${r.id}/retry`, { method: "POST", body: {} });
    notify("已重新加入判题队列");
    await load();
  } catch (e) {
    notify(e.message, true);
  }
}
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">LEARNING RECORDS</span>
      <h1>成绩记录</h1>
      <p>查看每份答卷的结果，定位需要帮助的学生。</p>
    </div>
    <button class="button" @click="load">
      <RotateCw :size="17" />刷新记录
    </button>
  </div>
  <section class="panel">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>学生</th>
            <th>考试</th>
            <th>交卷时间</th>
            <th>成绩</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in results" :key="r.id">
            <td>
              <strong>{{ r.name }}</strong
              ><small class="table-sub">{{ r.username }}</small>
            </td>
            <td>{{ r.title }}</td>
            <td>{{ dateTime(r.submitted_at) }}</td>
            <td>
              <strong>{{ r.score ?? "—" }}</strong>
              <span class="muted">/ {{ r.total_points }}</span>
            </td>
            <td>
              <span
                :class="[
                  'badge',
                  r.status === 'graded'
                    ? 'green'
                    : r.status === 'error'
                      ? 'red'
                      : 'amber',
                ]"
                >{{ statuses[r.status] }}</span
              >
            </td>
            <td>
              <div class="row-actions">
                <RouterLink :to="'/result/' + r.id" class="text-button"
                  >查看答卷<ArrowUpRight :size="15" /></RouterLink
                ><button
                  v-if="r.status === 'error'"
                  class="text-button"
                  @click="retry(r)"
                >
                  重新判题
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!results.length" class="empty-state">
      暂无作答记录。学生进入考试后会在这里显示。
    </div>
  </section>
</template>
