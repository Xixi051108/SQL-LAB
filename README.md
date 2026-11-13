# SQL Lab 智能 SQL 考试系统

Vue 3 + Express + MySQL 8.0，DeepSeek 辅助出题。面向数据库课程本机演示，支持七类 SQL、限时考试、自动保存、程序判分及参考解析。

## 启动

环境：Node.js 22.12+、MySQL 8.0。**无需 Docker**。

```powershell
git clone https://github.com/Xixi051108/SQL-LAB.git
cd SQL-LAB
npm install
node scripts/init-env.js
# 在本机编辑 .env，填写 DB_USER、DB_PASSWORD、DEEPSEEK_API_KEY
npm run setup
npm run build
npm start
```

打开 http://127.0.0.1:3000 。开发模式使用 `npm run dev`，打开 http://127.0.0.1:5173 。

初始化会创建业务库 `sql_exam`、练习库 `sql_exam_judge` 和受限账号 `sql_exam_runner`，只操作这些项目资源。首次初始化需要能建库、建表及创建用户并授权的本机 MySQL 账号。重复运行不会覆盖账号密码或重复插入示例题目。`JUDGE_PASSWORD` 和会话密钥由初始化环境脚本随机生成。

默认演示账号（仅本机教学使用）：

| 身份 | 用户名  | 默认密码    |
| ---- | ------- | ----------- |
| 教师 | teacher | Teacher123! |
| 学生 | student | Student123! |

如果首次初始化前修改了 `.env` 中对应密码，以本机配置为准；后续改配置不会重置已有账号。学生也可自行注册。初始示例考试开放 24 小时，过期后请以教师身份创建并发布新考试。

## 功能

- 教师：DeepSeek 生成草稿、手动新增/修改/删除题目、执行验证审核、草稿组卷编辑、发布冻结快照、查看成绩与异常重判。
- 学生：注册登录、进入开放考试、每 5 秒及切题时保存、刷新恢复、提前交卷、截止自动交卷、查看本人分数与解析。
- 七类单条 SQL：SELECT、INSERT、UPDATE、DELETE、CREATE TABLE、ALTER TABLE、DROP TABLE。
- 题库样例 7 题，示例试卷 100 分。查询比较结果集，DML/DDL 比较执行后的整个教学库数据和结构；两组测试数据，全部通过方可得分。
- 角色与答卷归属由后端检查；考试截止以服务端为准。已发布考试保留题目快照，不受题库改动或删除影响。

## 判题安全与边界

运行学生 SQL 使用专用账号，仅授予练习库的 SELECT、INSERT、UPDATE、DELETE、CREATE、ALTER、DROP、INDEX、REFERENCES。判题前后重建练习库；**练习库中的数据都是可丢弃的测试数据，请勿存放其他内容**。

AST 校验限制表名、语句类型、函数及单条语句；不支持注释、变量、跨库访问、显式锁、管理语句。执行默认限时 3 秒、结果最多 1000 行/约 200 KB；超限终止查询。语法错误记答错，数据库连接或参考答案异常记判题异常，成绩留空且教师可重试。

为本机课堂演示采用单进程串行队列；不要同时运行两个后端，也不要在正常考试期间运行判题集成测试。共享 MySQL 实例隔离强度低于独立实例，不作为公开执行任意 SQL 的服务。允许课程常见 SQL，不实现所有 MySQL 方言；比较按题目要求保留列顺序和重复行，约束名称不参与比较。不声称数学意义上证明任意 SQL 等价。

DeepSeek 调用仅在教师生成题目时发生，超时 45 秒。密钥仅存在后端 `.env` 中。AI 草稿必须由教师核对语义并通过执行审核；已发布考试的交卷和评分不依赖模型。

## 验证

```powershell
npm test
npm run test:live
node --env-file-if-exists=.env scripts/check-ai.js
# 停止正常后端后，运行真实进程重启检查
node --env-file-if-exists=.env scripts/check-restart.js
# 启动正常后端后，运行页面检查（需安装 Microsoft Edge）
node --env-file-if-exists=.env scripts/check-ui.js
```

`test:live` 会在业务库创建临时测试用户、题目和考试，结束后清理，并反复重建专用判题库。请勿并行运行判题测试和正常考试。详细测试记录见 `docs/tests.md`。

## 材料

- `docs/design.md`：需求、架构、中文数据字典、关系与接口、判题规则。
- `docs/er.svg`：中文 E-R 图。
- `db/schema.sql`：六张核心业务表与会话表的建表 SQL。
- `scripts/setup.js`：建库、受限授权、初始账号、七题验证及示例试卷初始化。
- `docs/demo.md`：演示脚本、报告素材和限制说明。
- [实验报告](docs/实验报告.docx)：14 页 Word 报告，含需求分析、转表、数据字典、前后端设计、实测结果与中文 E-R 图。
- [测试用例表](docs/测试用例.xlsx)：60 条业务场景用例，可筛选和编辑，包含步骤、预期结果、实际结果与验证依据。
- [报告在线版](docs/report.md)、[用例在线版](docs/cases.md)：便于在 GitHub 直接查看。
- [教师端视频](demo/教师端.mp4)、[学生端视频](demo/学生端.mp4)：1080p 字幕版实操，无配音；内容与播放说明见 [视频说明](demo/说明.md)。

报告封面的姓名、学号、班级、实验日期与分工需由小组据实填写。SQL 参考答案统一使用多行排版，学生编辑器提供“格式化”按钮。

## 常见问题

- `ER_ACCESS_DENIED_ERROR`：核对 `.env` 的本机 MySQL 账号；不要把密码贴进终端命令或聊天。
- 判题环境未就绪：先执行 `npm run setup`；确保初始化账号有授权权限，`JUDGE_PORT` 与本机 MySQL 端口相同。
- DeepSeek HTTP 错误：核对 API 地址、可用模型名和额度，重启后端后再试。
- 到期答卷：后台每秒扫描。后端离线期间无法执行交卷，恢复时按数据库里最后保存答案补交，提交时间记录为考试截止时间。
- 判题异常：学生成绩保留空值；教师修复环境后在“成绩记录”点击“重新判题”。
