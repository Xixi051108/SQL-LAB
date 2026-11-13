# SQL Lab 需求与系统设计

## 实验目标

实现数据库课程的 AI SQL 出题、组卷、限时作答与执行判题。面向教师和学生，完成数据库 Web 应用、中文 E-R 图、数据字典、实体与参照完整性、增删改演示和测试材料。AI 生成内容只作为待审核草稿，程序判分与模型服务解耦。

## 业务流程

教师创建题目或通过 DeepSeek 生成题目草稿，核对题干与答案，执行两组测试数据验证后审核。组卷时选择已审核题目和分值，设定统一开始/结束时间，发布时冻结题目快照。

学生注册登录，进入开放考试创建唯一答卷；每 5 秒、切题时保存，刷新从服务端恢复。交卷或到期后答卷进入队列，按题独立重建数据并判分，完成后开放本人结果和解析。数据库连接等基础设施故障不计零分，教师修复后可重新判题。

每题一条 SQL，允许常见查询、数据增删改及建表、改表、删表。改表支持增删改列与主外键、唯一约束。第一版不支持存储过程、触发器、任意数据集导入、监考、倒计时之外的防作弊或公网部署。

## 架构与数据流

浏览器 Vue 3 → `/api` JSON 接口 → Express 身份与业务校验 → MySQL 业务库。

教师出题接口 → DeepSeek → 结构与 SQL 校验 → 草稿 → 人工审核与执行验证。

交卷 → MySQL 持久化队列状态 → 单进程串行工作器 → 独立判题库受限账号 → 两组参考答案/学生答案执行 → 比较结果 → 事务保存逐题判定和总分。

本机现有 MySQL 提供两个数据库：`sql_exam` 保存业务数据，`sql_exam_judge` 保存可重建练习数据。SQL 只能操作固定教学表，受限账号没有业务库或全局管理权限。

## 中文 E-R 图与关系模式

图见同目录 `er.svg`。用户分教师和学生；通过角色属性区分，不重复建账号表。

- 用户 1:N 题目、用户 1:N 考试：教师创建。
- 考试 1:N 考试题目；题目 1:N 考试题目，通过中间实体实现组卷，并保存分值、顺序及快照。
- 用户 1:N 作答、考试 1:N 作答；`(考试,用户)` 唯一。
- 作答 1:N 答案、考试题目 1:N 答案；`(作答,考试题目)` 唯一。

关系模式：用户(用户编号,用户名,姓名,密码摘要,角色,创建时间)；题目(题目编号,标题,题型,题干,参考SQL,解析,目标表,排序要求,来源,审核状态,创建教师,创建时间)；考试(考试编号,名称,开始时间,结束时间,发布状态,创建教师,创建时间)；考试题目(编号,考试编号,题目编号,题序,分值,快照)；作答(编号,考试编号,学生编号,状态,开始时间,交卷时间,总分,异常说明)；答案(编号,作答编号,考试题目编号,SQL文本,保存时间,得分,判定,反馈)。

## 数据字典

所有表使用 InnoDB、utf8mb4；业务时间由应用按 UTC 写入，界面按浏览器本地时区显示。完整字段类型和约束见 `db/schema.sql`。

### 用户 users

| 字段          | 类型            | 含义与约束                                |
| ------------- | --------------- | ----------------------------------------- |
| id            | BIGINT UNSIGNED | 自增主键                                  |
| username      | VARCHAR(32)     | 唯一、非空，3–32 位字母数字下划线         |
| name          | VARCHAR(40)     | 非空显示姓名                              |
| password_hash | VARCHAR(200)    | 随机盐和 scrypt 摘要，不保存明文密码      |
| role          | ENUM            | teacher / student；注册接口固定为 student |
| created_at    | DATETIME(3)     | 创建时间                                  |

### 题目 questions

| 字段                                 | 类型            | 含义与约束                                                                  |
| ------------------------------------ | --------------- | --------------------------------------------------------------------------- |
| id / created_by                      | BIGINT UNSIGNED | 主键 / 创建教师外键                                                         |
| title                                | VARCHAR(160)    | 非空标题                                                                    |
| type                                 | ENUM            | select / insert / update / delete / create_table / alter_table / drop_table |
| prompt / reference_sql / explanation | TEXT            | 非空题干、参考 SQL、参考解析                                                |
| target_table                         | VARCHAR(64)     | 固定教学表之一                                                              |
| ordered                              | BOOLEAN         | 是否严格比较查询行顺序                                                      |
| source                               | ENUM            | manual / deepseek                                                           |
| status                               | ENUM            | draft / approved；修改后恢复 draft                                          |
| created_at                           | DATETIME(3)     | 创建时间                                                                    |

### 考试 exams

| 字段                | 类型            | 含义与约束                        |
| ------------------- | --------------- | --------------------------------- |
| id / created_by     | BIGINT UNSIGNED | 主键 / 创建教师外键               |
| title               | VARCHAR(160)    | 非空名称                          |
| starts_at / ends_at | DATETIME(3)     | 统一起止时间；CHECK 结束晚于开始  |
| status              | ENUM            | draft / published；发布后不可编辑 |
| created_at          | DATETIME(3)     | 创建时间                          |

### 考试题目 exam_questions

| 字段        | 类型                 | 含义与约束                           |
| ----------- | -------------------- | ------------------------------------ |
| id          | BIGINT UNSIGNED      | 自增主键                             |
| exam_id     | BIGINT UNSIGNED      | 考试外键，删除草稿考试级联删除       |
| question_id | BIGINT UNSIGNED NULL | 题库外键；题库删除时置空，保留快照   |
| position    | INT UNSIGNED         | 题序，与考试编号联合唯一             |
| points      | INT UNSIGNED         | CHECK 1–100 分                       |
| snapshot    | JSON                 | 发布时冻结题干、参考 SQL、解析等内容 |

同一试卷不能重复选择同一题目。

### 作答 attempts

| 字段              | 类型              | 含义与约束                                               |
| ----------------- | ----------------- | -------------------------------------------------------- |
| id                | BIGINT UNSIGNED   | 主键                                                     |
| exam_id / user_id | BIGINT UNSIGNED   | 考试、学生外键；二者联合唯一                             |
| status            | ENUM              | active → queued → grading → graded；异常为 error，可重试 |
| started_at        | DATETIME(3)       | 首次进入时间                                             |
| submitted_at      | DATETIME(3) NULL  | 提前交卷时间；到期自动交卷记录截止时间                   |
| score             | INT UNSIGNED NULL | 判题完成后的总分；异常时保留 NULL                        |
| error_message     | VARCHAR(300) NULL | 面向教师和学生的异常说明                                 |

### 答案 answers

| 字段             | 类型              | 含义与约束                       |
| ---------------- | ----------------- | -------------------------------- |
| id               | BIGINT UNSIGNED   | 主键                             |
| attempt_id       | BIGINT UNSIGNED   | 作答外键                         |
| exam_question_id | BIGINT UNSIGNED   | 考试题目外键，与作答编号联合唯一 |
| sql_text         | TEXT              | 学生答案，接口最多 8000 字符     |
| saved_at         | DATETIME(3)       | 最近保存时间                     |
| score            | INT UNSIGNED NULL | 单题得分                         |
| verdict          | ENUM NULL         | correct / wrong / blank / error  |
| feedback         | TEXT NULL         | 执行与判题反馈                   |

辅助表 `sessions(sid,data,expires_at)` 持久化登录会话，并建立过期时间索引。它属于技术支持表，不计入六类核心实体。

## 接口与一致性

| 接口组    | 主要接口                                                                                       | 权限                             |
| --------- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| 身份      | POST /auth/register、/auth/login、/auth/logout；GET /auth/me                                   | 注册固定学生角色                 |
| 题库      | GET/POST /questions；PUT/DELETE /questions/:id                                                 | 教师                             |
| AI 与审核 | POST /questions/generate、/questions/:id/approve                                               | 教师                             |
| 考试      | GET/POST /exams；GET/PUT/DELETE /exams/:id；POST /exams/:id/publish                            | 学生仅可列出已发布考试，其余教师 |
| 答题      | POST /exams/:id/start；GET /attempts/:id；PUT /attempts/:id/answers；POST /attempts/:id/submit | 学生操作本人，教师可查看         |
| 成绩      | GET /results；POST /attempts/:id/retry                                                         | 教师；学生通过本人答卷接口查看   |

所有接口加 `/api` 前缀，返回 JSON。错误返回 `{error:说明}`。未登录 401，越权 403，状态冲突 409，判题不可用 503，AI 超时 504。参数使用预处理语句，禁止注册时指定教师角色，写接口校验来源和 JSON 内容类型。

答卷保存与交卷使用事务和行锁。保存时核对答卷归属、状态、数据库记录的截止时间及题目归属；重复交卷幂等。发布考试冻结题目快照，后续修改题库不影响成绩。后台每秒扫描到期答卷并处理队列；启动时将中断的 grading 任务恢复为 queued，补交离线期间到期的 active 答卷。

## 判题规则

- 每题两组测试数据。参考 SQL 与学生 SQL 分别在重建后的相同初始环境执行。
- SELECT 比较输出列顺序、NULL、重复行；题干要求排序时比较行顺序，别名不影响结果。
- DML 比较全部教学表最终数据及结构，防止误改其他表。
- DDL 比较列顺序、字段类型、可空性、默认值、额外属性、主外键、唯一约束、外键动作及保留的数据；不比较约束名称。
- 空答案零分，正确答案单题满分，错误答案零分；连接故障、参考答案故障不得当作学生错误。
- 题目执行验证只能证明参考 SQL 可执行；题干与参考 SQL 语义一致性仍由教师审核。
