# 邮件与 Agent 运行逻辑

## 两条独立后台流程

- Inbox：首次完整读取邮箱，此后每分钟通过 Gmail History API 获取变化，只下载变更会话。手动同步使用相同路径。
- Agent：每小时检查本地已同步会话；初次启用检查现有未读邮件，之后检查新内容、手动标为未读的请求和上轮失败事项。不会每小时把整个邮箱发给 AI。
- 首次 Agent 检查在邮箱首次同步完成且 AI 已配置后开始。检查周期和逐会话记录保存在 SQLite，重启不重置周期。每轮内部逐条处理，避免同时发起大量 AI 请求。

## 选择与去重

1. 对邮件正文、参与人、消息 ID 和附件元数据生成内容指纹；标签变化不算新正文。
2. 本系统“标为未读”写入独立检查计数，下一次每小时检查时消费；不更改 Gmail 的已读状态。
3. 已经回复、已审核、同内容已有待办、已忽视、垃圾箱/垃圾邮件和人工标为无关的会话不重新起草。
4. 新内容即使已读也会被检查。初始历史邮件中已读的会话只建立基线，不主动批量起草。
5. 同一会话的自动建议更新原卡片。已有人工草稿时保留文本，并提示核对新邮件；手动起草仍可保留历史版本。
6. 已忽视的相同内容不会因未读标记而恢复提醒；新邮件改变内容后重新判断。
7. 已回答、仅致谢、无需处理的自动通知等，AI 返回 wait，不进入待办。

## 卡片与发送

- 绿色：有可审核草稿，且没有待确认信息。
- 橙色：需要决策、核对信息或人工草稿遇到新回复。
- 红色：退信、检查失败，或发送失败/结果不明。
- 灰色：已延后任务。颜色同时配文字标签。

所有颜色均不会自动发送。只有用户点击发送，才进入独立发送模块：刷新 Gmail 会话、核验收件人/正文/附件、检查草稿版本与发送锁，然后调用 Gmail。成功凭据写入数据库并立即补入 Inbox；结果不明时阻止重复发送。

自动检查使用已同步正文和现有批准政策、启用模板；来信附件只提供元数据，尚不解析内容。只有对方明确索要 Brand Overview 或 Lookbook，才选择模板绑定的对应文件。

## 代码模块

| 文件 | 责任 |
| --- | --- |
| server.mjs | HTTP 服务、Lark 登录、会话与后台流程启停 |
| lib/api.mjs | 权限/CSRF、Inbox 与 Agent 接口、未读标记、忽视与人工编辑 |
| lib/integrations.mjs | Google OAuth、Gmail 增量同步、邮件规范化、AI 请求及结果校验 |
| lib/agent-worker.mjs | 每小时检查、检查进度、跳过/去重、人工草稿保护、错误重试与颜色规则 |
| lib/mail-send.mjs | 人工触发发送、MIME、发送去重与不明结果锁定 |
| lib/mail-content.mjs | 正文整理及已发送邮件的本地补入合并 |
| lib/mail-library.mjs | 私有附件库、启用模板与附件绑定 |
| lib/store.mjs | SQLite 持久化、事务、版本检查、操作审计 |
| public/workspace.js / public/style.css | 工作台页面、卡片、编辑与发送交互、颜色 |
| public/mail-view.mjs | 邮件正文与历史引用展示 |

新增数据库表：agent_jobs（每小时周期与状态）、agent_checks（逐会话检查指纹与结果）、agent_rechecks（手动未读请求）。继续使用 agent_ignored 记录忽视范围，records 保存邮件和建议，mail_sends 保存真实发送凭据。凭证仍仅在服务器受限配置/加密连接记录中，不写入 Git。

## 验证边界

自动分析及发送回归测试使用虚构邮件与模拟服务，不向真实联系人发送测试邮件。自动检查的实际 AI 调用会在生产定时流程内使用已配置的服务；失败会显示卡片并在下一小时重试。

## Reply identity checks
AI context explicitly identifies Jay Lee / MeeDoo as the sender and labels each message inbound or outbound. Actionable decision-required mail still needs a cautious draft. Obvious reversed greetings/signatures and missing actionable drafts trigger one regeneration; invalid results are not saved as sendable drafts. Existing unedited reversed AI suggestions are cleared and queued for repair; manual edits and sent/uncertain sends are preserved.

## CSV column matching
Upload CSV, map each source column to a MeeDoo field (or skip that column), review aggregate counts and confirm a single bulk import. The UI does not ask for a decision on every Creator. Samples show up to three values per column. The backend validates mappings, filters invalid cells and preserves the other usable fields. A valid name, account or email is sufficient to retain a record. Only records without usable identity or with ambiguous identity matches are withheld and listed as exceptions. Matching existing accounts are linked without overwriting existing data; duplicates within the file are also linked. Multiple tags/notes columns are supported; Owner and follower counts are source metadata, not application permissions or verified metrics. Selected mapping and file content jointly determine idempotency. The commit rechecks current database identities in a transaction. Imported file data is not committed to Git.

## Reply necessity comes first
A polite decline that closes the current offer, future openness without a current request, and simple acknowledgments produce `wait` with no draft. Quoted old questions are excluded from the closing-message check. A new concrete question or action request remains eligible for analysis. Green AI cards now require a stated reply reason and evidence pointing to the latest incoming message; missing evidence becomes a decision card. The UI shows the reason. This is conservative triage, not a guarantee that every green draft should be sent.

## 手动检查与 Creator 联系状态

Agent 页的「立即检查」先排队执行 Gmail 增量同步（首次连接时继续完整同步），同步成功后立即检查新增内容及未读请求，不受每小时间隔限制。重复点击不会重复建立检查任务，已发送、已审核或已忽视的同一内容继续跳过；不会自动发送邮件。页面显示同步/检查状态和错误，完成后更新待办。

Creators 列表支持下拉修改联系状态，默认「未联系」。可选：未联系、已联系、已回复、有意向、仅付费合作、已拒绝、未回复、稍后跟进、暂无邮箱、邮件退信。旧记录缺省显示未联系，新建及导入写入默认值。修改沿用权限、版本冲突与审计机制；该状态由用户调整，与合作里程碑独立。

## 起草质量与资料声明

起草上下文包含仓库中 2026-10-07 保存的 Playbook 摘要（并非实时读取 Lark）；已批准政策及已接受个别条款优先。初次表示兴趣时只介绍相关合作事实并建议一个下一步，不提前索取尺寸、国家、平台、受众或档期，不虚构时间承诺。后续阶段仅询问当下缺失且必要的信息。

对无真实附件的附档声明，以及典型初次兴趣回复中提前索取物流/平台资料，生成阶段会重试一次，仍不合格则不保存。发送预览也拦截无附件却声称已附上的正文。真实文件仍须上传设置资料库并绑定启用模板；一般兴趣不会触发自动附档。

## 2026-10-09 主动分享规则

取代此前仅明确索要才附档的限制：对方表示有兴趣或希望进一步了解合作时，主动分享 Brand Overview 和 Product Lookbook，简述已知 Level 1 条款，并邀请选款，不再询问是否要资料。优先选择模板绑定的对应文件；没有模板绑定时，使用该类别唯一的有效文件。存在多版本或缺失资料时提示人工选择，不猜测。拒绝、仅付费询价和结束会话不触发这条主动分享规则。

## 发送成功后更新 Creator 状态

仅对已关联 Creator 的会话，在 Google 确认发送成功后，根据最新来信的明确兴趣、仅付费或拒绝信息更新状态；普通有效来信可从未联系/已联系/未回复变为已回复。起草和发送失败不更新。保留已拒绝、仅付费、稍后跟进、退信等人工处理结果；审核到发送之间 Creator 被修改或会话有新内容时不覆盖。每次变更记录会话与发送依据。Inbox 独立显示当前 Creator 状态，未关联显示横线。
