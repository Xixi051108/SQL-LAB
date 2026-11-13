# SQL Lab 测试用例表

执行日期：2026 年 11 月 13 日。下表按业务场景拆分，一条自动化测试可覆盖多条用例，因此条数与测试函数数量不同。

前置环境：本机 MySQL 8.0.44、Node.js 22.23.2、已初始化业务库与专用判题库。只在无正常判题任务时运行集成测试。

|编号|模块|用例名称|前置条件|步骤及输入|预期结果|实际结果|状态|验证依据|
|---|---|---|---|---|---|---|---|---|
|TC-001|身份认证|密码摘要与随机盐|测试环境可调用密码模块|分别对同一密码生成两次摘要；验证正确密码，再验证错误密码。|摘要不同；正确密码验证成功，错误密码验证失败。|两份摘要不同，验证结果分别为 true、false。|通过|tests/security.test.js：密码使用随机盐与 scrypt 验证|
|TC-002|SQL 安全|业务库越权|题型设为查询题，调用 SQL 校验器|提交：SELECT * FROM sql_exam.users|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-003|SQL 安全|系统库越权|题型设为查询题，调用 SQL 校验器|提交：SELECT * FROM mysql.user|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-004|SQL 安全|多语句提交|题型设为查询题，调用 SQL 校验器|提交：SELECT * FROM students; DROP TABLE students|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-005|SQL 安全|延时函数|题型设为查询题，调用 SQL 校验器|提交：SELECT SLEEP(5)|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-006|SQL 安全|文件读取|题型设为查询题，调用 SQL 校验器|提交：SELECT LOAD_FILE('/tmp/x')|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-007|SQL 安全|系统变量|题型设为查询题，调用 SQL 校验器|提交：SELECT @@version|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-008|SQL 安全|可执行注释|题型设为查询题，调用 SQL 校验器|提交：SELECT * FROM students /*! INTO OUTFILE 'x' */|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-009|SQL 安全|显式加锁|题型设为查询题，调用 SQL 校验器|提交：SELECT * FROM students FOR UPDATE|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-010|SQL 安全|超量字符串函数|题型设为查询题，调用 SQL 校验器|提交：SELECT REPEAT('x',1000000)|执行前抛出 InvalidSQL，不访问业务或系统资源。|均被校验器拒绝。|通过|tests/security.test.js：拒绝危险 SQL|
|TC-011|SQL 校验|别名与连接聚合|教学库结构已固定|提交 SELECT s.id,COUNT(e.course_id) FROM students s LEFT JOIN enrollments e ON s.id=e.student_id GROUP BY s.id;|单条带别名、连接和聚合的 SQL 可通过校验。|校验成功，末尾分号不被当成第二条语句。|通过|tests/security.test.js：允许别名、连接、聚合和单条末尾分号|
|TC-012|SQL 校验|题型与语句不符|当前题型为 delete|向 DELETE 题提交 DROP TABLE students。|拒绝语句类型不匹配。|抛出 InvalidSQL。|通过|tests/security.test.js：类型必须与题目一致|
|TC-013|SQL 校验|保留字符串字面值|当前题型为 insert|校验 INSERT INTO old_records(id,note) VALUES(100,'engine user@example.com -- #')。|字符串中的邮箱、关键字和注释符号不误判。|校验成功。|通过|tests/security.test.js：字符串中的邮箱、注释符号和关键字不被误判|
|TC-014|结果比较|重复行与无序比较|可调用结果标准化函数|比较 [[2],[1],[1]] 与 [[1],[2],[1]]；再比较 [[1],[1]] 与 [[1]]；有序比较 [[1],[2]] 与 [[2],[1]]。|第一组相等；第二、三组不相等。|无序行顺序被忽略，重复行及有序题顺序均保留。|通过|tests/security.test.js：比较保留重复行，无序题忽略顺序，有序题保留顺序|
|TC-015|七类判题|查询正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：SELECT id,name,age FROM students WHERE major='计算机' ORDER BY id|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-016|七类判题|查询错误答案|同上；使用对应题型的参考答案|提交错误 SQL：SELECT * FROM students|因输出列和筛选范围不符合题干判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-017|七类判题|插入正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：INSERT INTO students(id,name,major,age) VALUES(100,'新同学','软件工程',20)|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-018|七类判题|插入错误答案|同上；使用对应题型的参考答案|提交错误 SQL：INSERT INTO students VALUES(100,'新同学','软件工程',21)|因年龄错误判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-019|七类判题|更新正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：UPDATE enrollments SET score=score+5 WHERE course_id=1 AND score<80|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-020|七类判题|更新错误答案|同上；使用对应题型的参考答案|提交错误 SQL：UPDATE enrollments SET score=score+5|因更新范围过大判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-021|七类判题|删除正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：DELETE FROM old_records WHERE id=1|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-022|七类判题|删除错误答案|同上；使用对应题型的参考答案|提交错误 SQL：DELETE FROM old_records|因误删其他记录判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-023|七类判题|建表正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：CREATE TABLE study_notes (id INT PRIMARY KEY,student_id INT NOT NULL,content VARCHAR(200) NOT NULL,FOREIGN KEY(student_id) REFERENCES students(id))|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-024|七类判题|建表错误答案|同上；使用对应题型的参考答案|提交错误 SQL：CREATE TABLE study_notes(id INT PRIMARY KEY,student_id INT NOT NULL,content VARCHAR(200) NOT NULL)|因遗漏外键判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-025|七类判题|改表正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：ALTER TABLE students ADD COLUMN email VARCHAR(100) NULL DEFAULT NULL, ADD UNIQUE (email)|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-026|七类判题|改表错误答案|同上；使用对应题型的参考答案|提交错误 SQL：ALTER TABLE students ADD COLUMN email VARCHAR(100) NULL|因遗漏唯一约束判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-027|七类判题|删表正确答案|专用判题库与受限账号可连接；初始数据由判题器重建|分别在两组初始数据上独立执行参考答案与学生答案。学生 SQL：DROP TABLE old_records|两组数据均一致，verdict=correct。|正确答案通过两组数据验证。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-028|七类判题|删表错误答案|同上；使用对应题型的参考答案|提交错误 SQL：DROP TABLE enrollments|因删除了错误目标表判为 wrong。|错误答案被判为 wrong。|通过|tests/flow.live.js：真实 MySQL 判题|
|TC-029|等价 SQL|等价查询与别名|查询样题按 id 升序输出计算机专业学生|使用表别名 s、IN ('计算机') 和显式 ASC 替代参考答案中的等值条件。|结果一致时接受等价写法。|verdict=correct。|通过|tests/flow.live.js：等价 SQL、别名和不同约束名称可通过|
|TC-030|等价 SQL|约束名称不同|建表题要求同样的列、主键与外键|创建 study_notes，使用 INTEGER 同义类型并将外键命名为 other_name。|不因约束名称不同误判。|verdict=correct。|通过|tests/flow.live.js：等价 SQL、别名和不同约束名称可通过|
|TC-031|查询语义|错误去重|参考答案 SELECT major FROM students，不要求行排序|提交 SELECT DISTINCT major FROM students。|原数据有重复值时判错。|verdict=wrong。|通过|tests/flow.live.js：真实 MySQL 比较重复行及排序|
|TC-032|查询语义|错误排序|参考答案要求按 id 升序|提交同样筛选条件但 ORDER BY id DESC。|有序题行序不符应判错。|verdict=wrong。|通过|tests/flow.live.js：真实 MySQL 比较重复行及排序|
|TC-033|环境恢复|删表后继续判题|专用判题库可正常重建|先对 DROP TABLE old_records 判题；随后执行删除 id=1 记录的 DELETE 样题。|第二题仍能使用完整初始表和数据。|两道题均判 correct，环境恢复成功。|通过|tests/flow.live.js：每次判题恢复初始环境|
|TC-034|改表语法|增删改列与约束|每条 SQL 分别在重建后的初始环境执行|逐次验证：修改 age 为 SMALLINT；删除 age；删除 old_records 主键；删除 fk_student 外键；新增 student_id 及外键；为 courses.name 新增唯一约束。|六种常见改表操作均可执行并正确比较结构。|六项均 verdict=correct。|通过|tests/flow.live.js：改表支持修改/删除列、增删主外键与唯一约束|
|TC-035|权限隔离|真实判题账号越权|通过受限判题账号建立 MySQL 连接|直接执行 SELECT * FROM sql_exam.users。|MySQL 权限层拒绝读取业务用户表。|收到数据库访问或表访问拒绝错误。|通过|tests/flow.live.js：判题账号不能读取业务库|
|TC-036|资源限制|执行超时与后续恢复|测试中暂将执行限时设为 100 毫秒|提交 12 次 students 笛卡尔积计数；恢复限时后执行正常查询。|耗时查询被终止；后续正常题仍可通过。|前一答案 wrong，后一答案 correct。|通过|tests/flow.live.js：真实执行超时被终止，后续判题仍然可用|
|TC-037|资源限制|结果行数上限|查询结果限制为 1000 行|提交多表笛卡尔积返回大量 id 行。|流式读取达到上限时终止查询。|判为 wrong，反馈包含“结果过大”。|通过|tests/flow.live.js：流式结果上限保护|
|TC-038|身份认证|学生注册与教师登录|数据库已初始化，教师演示账号存在|注册新的学生 A、B；使用本机教师账号登录。|注册成功且角色固定为 student；教师登录成功。|注册返回 201，教师登录返回 200。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-039|角色权限|学生访问教师功能|学生 A 已登录|请求题目列表及 AI 生成题目接口。|学生不得管理题库或消耗教师出题接口。|两个请求均返回 403。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-040|题库管理|新增修改审核删除|教师登录，判题库可用|新增查询草稿；审核；发布进试卷；修改题库题目；最后删除题库题目。|操作成功；已发布考试仍保留原题干与参考答案。|草稿创建 201，审核/修改/删除 200；快照内容未变。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-041|作答安全|交卷前隐藏答案|学生 A 已进入考试，尚未交卷|读取本人答卷详情并检查题目字段。|响应不能含 reference_sql 和参考解析。|未出现 reference_sql 字段。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-042|作答安全|他人答卷访问|学生 A 与 B 均登录，A 有答卷|B 读取 A 的答卷并尝试替 A 交卷。|均因答卷归属不符被拒绝。|读取和提交均返回 403。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-043|考试流程|每场一次作答|学生已进入某场考试|对同一场考试重复调用开始接口。|重复开始返回原有答卷编号。|两次返回相同 attempt id。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-044|答案保存|保存后恢复|学生有 active 答卷|保存正确 SQL，随后重新获取答卷详情。|恢复出的 SQL 与保存内容一致。|保存返回 200，重新读取答案一致。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-045|交卷计分|重复交卷与正确得分|试卷为一道 10 分查询题，已保存正确答案|连续两次交卷，运行判题队列；读取成绩；再尝试修改答案。|交卷幂等，成绩 10 分，公开本人参考答案；修改被拒绝。|两次交卷 200，状态 graded、总分 10，修改返回 409。|通过|tests/flow.live.js：注册、权限、题库 CRUD、审核、快照及完整交卷计分|
|TC-046|截止控制|保留最后保存答案|考试有已保存的正确答案|在测试数据库将考试设为已到期；提交新的错误答案；处理到期与判题队列。|拒绝晚到答案，按截止前保存内容判分。|保存返回 409，原 SQL 保留，总分 10。|通过|tests/flow.live.js：截止后拒绝写入，并按最后保存答案自动交卷|
|TC-047|截止控制|截止后不得新进入|考试已到期；另一新学生尚未参加|新学生请求进入该场考试。|不能创建新的答卷。|返回 409。|通过|tests/flow.live.js：截止后拒绝写入，并按最后保存答案自动交卷|
|TC-048|模型异常|模型不可用不影响考试|已审核题目已发布；测试中暂禁用 DeepSeek 配置|教师生成题目；学生在已发布考试提交正确答案并判题。|生成接口提示不可用；考试仍可正常完成。|生成接口 503，答卷 graded，总分 10。|通过|tests/flow.live.js：DeepSeek 不可用时，已发布考试仍可提交并计分|
|TC-049|判题异常|连接失败不得记零分|学生已提交非空答案；测试中暂令判题凭据无效|运行队列并获取答卷结果。|标为 error，成绩留空。|状态 error，score=NULL。|通过|tests/flow.live.js：判题异常保留空成绩，教师可重试；恢复函数找回中断任务|
|TC-050|判题异常|教师重试权限与恢复|前一异常答卷存在；已恢复正确判题配置|学生尝试重试；教师重试；构造 grading 状态后调用启动恢复函数并重新判题。|学生不能重试，教师可重试，中断状态能恢复。|学生 403，教师 200；最终状态 graded。|通过|tests/flow.live.js：判题异常保留空成绩，教师可重试；恢复函数找回中断任务|
|TC-051|重启恢复|真实进程停止与重启|3101 测试端口空闲；未并行运行其他判题服务|启动测试后端、登录并保存两份答案；停止进程；构造待恢复状态和离线到期考试；重新启动后端。|会话保留；中断任务与到期答卷恢复并得正确分数。|原会话可识别用户，两份答卷均 graded、各 10 分。|通过|scripts/check-restart.js|
|TC-052|AI 出题|真实 DeepSeek 生成与验证|后端已配置可用 DeepSeek API；判题库可用|请求一条按 id 排序查询学生 id/name 的题目；将生成参考 SQL 在两组教学数据上验证。|返回完整题目草稿，参考 SQL 可解析且两组均可执行。|实际 API 调用成功，参考答案验证通过。|通过|scripts/check-ai.js|
|TC-053|浏览器流程|教师题库与组卷|本机服务已启动，Edge 可用|通过教师页面新增、修改、审核题目；创建两题试卷、设置时间、发布；流程结束后删除临时题目。|页面状态和数据库一致，无脚本异常。|教师操作完成，临时数据清理成功。|通过|scripts/check-ui.js|
|TC-054|浏览器流程|学生注册与保存恢复|前一流程已发布两题试卷|学生通过页面注册、进入考试；作答后等待自动保存；切换题目，再刷新页面。|自动保存提示出现；切题和刷新不丢失已保存答案。|已保存提示可见，刷新后 SQL 与保存内容一致。|通过|scripts/check-ui.js|
|TC-055|浏览器流程|交卷后立即查看成绩|两题分别为查询与建表，各 10 分|填写两题正确答案；确认交卷；等待结果页面。|展示总分 20/20、逐题得分及参考解析。|实际显示 20/20，未出现页面脚本异常。|通过|scripts/check-ui.js|
|TC-056|浏览器布局|手机结果页无横向溢出|已打开结果页|将视口设置为 390×844，比较文档宽度和视口宽度。|文档宽度不超过视口宽度。|宽度检查通过。|通过|scripts/check-ui.js|
|TC-057|SQL 排版|查询子句换行|格式化模块可用|格式化 select id,name,age from students where major='计算机' order by id；比较规范化语法树。|关键字大写，字段与子句换行；语法意义保持一致。|存在换行且语法树一致。|通过|tests/sql.test.js|
|TC-058|SQL 排版|建表缩进与字面值|格式化模块可用|格式化包含主外键、NOT NULL、字符串默认值的 CREATE TABLE。|字段和约束多行缩进；字符串默认值内容不改变。|多行缩进正确，字符串 select from 保留，语法树一致。|通过|tests/sql.test.js|
|TC-059|SQL 排版|重复格式化与未完成 SQL|格式化模块可用|连续格式化同一查询；再格式化未闭合引号和空答案。|格式化幂等，无法解析的输入保留原文。|输出幂等，未完成语句与空字符串保持原样。|通过|tests/sql.test.js|
|TC-060|SQL 排版|真实数据库验证排版后答案|判题库可用，查询及建表样题存在|分别将查询和建表参考答案格式化，再作为学生答案判题。|排版不影响执行与判题结果。|查询和建表均 verdict=correct。|通过|tests/flow.live.js：格式化后的查询与建表答案保持判题结果|
