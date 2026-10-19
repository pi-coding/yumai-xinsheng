<div align="center">

# 语脉新生

**古风网络用语溯源核验 · 古籍书库 · 语言改编工坊**

[![Stack](https://img.shields.io/badge/stack-Web%20%C2%B7%20MiniProgram%20%C2%B7%20Spring%20Boot-blueviolet)](https://github.com/pi-coding/yumai-xinsheng)
[![Backend](https://img.shields.io/badge/Spring%20Boot-2.7.18-6DB33F)](https://github.com/pi-coding/yumai-xinsheng)
[![Data](https://img.shields.io/badge/data-MySQL%208%20%2B%20Redis-4479A1)](https://github.com/pi-coding/yumai-xinsheng)
[![Corpus](https://img.shields.io/badge/corpus-2000%20%E6%9D%A1-informational)](https://github.com/pi-coding/yumai-xinsheng)
[![License](https://img.shields.io/badge/license-%E6%9C%AA%E5%A3%B0%E6%98%8E-lightgrey)](https://github.com/pi-coding/yumai-xinsheng)
[![Repo Size](https://img.shields.io/github/repo-size/pi-coding/yumai-xinsheng)](https://github.com/pi-coding/yumai-xinsheng)

网上到处流传的「无人与我立黄昏，无人问我粥可温」「山河远阔，人间烟火」，常被标成李白、沈复、
林徽因写的 —— 大多数其实一个字的原文都找不到。

**语脉新生**就是用来查这件事的：粘贴一句话，逐句告诉你哪些有真实出处（到篇名）、哪些是现代人写的、
哪些是被改了字。顺手也帮你把大白话改成规范的古风表达，并能查到 60 部经典里可用的名句。
**同一套数据与判定口径，Web 端与微信小程序共用。**

</div>

---

## 目录

- [界面预览](#界面预览)
- [核心特性](#核心特性)
- [六种核验结论](#六种核验结论)
- [功能模块详解](#功能模块详解)
- [快速开始](#快速开始)
- [接口一览](#接口一览)
- [技术栈](#技术栈)
- [数据口径](#数据口径)
- [验收与自检](#验收与自检)
- [常见问题](#常见问题)
- [项目结构](#项目结构)
- [相关文档](#相关文档)
- [License](#license)

---

## 界面预览

<table>
  <tr>
    <td width="50%"><img src="https://cdn.jsdelivr.net/gh/pi-coding/yumai-xinsheng@main/preview/home.png" alt="工作台总览"></td>
    <td width="50%"><img src="https://cdn.jsdelivr.net/gh/pi-coding/yumai-xinsheng@main/preview/verify.png" alt="溯源核验"></td>
  </tr>
  <tr>
    <td align="center"><b>工作台总览</b> · 三个主入口与今日一词</td>
    <td align="center"><b>溯源核验</b> · 逐句判定 + 三段依据</td>
  </tr>
  <tr>
    <td width="50%"><img src="https://cdn.jsdelivr.net/gh/pi-coding/yumai-xinsheng@main/preview/books.png" alt="古籍书库"></td>
    <td width="50%"><img src="https://cdn.jsdelivr.net/gh/pi-coding/yumai-xinsheng@main/preview/workshop.png" alt="语言改编工坊"></td>
  </tr>
  <tr>
    <td align="center"><b>古籍书库</b> · 60 部经典按部类检索</td>
    <td align="center"><b>语言改编工坊</b> · 白话改古风，摊开用了哪条规则</td>
  </tr>
  <tr>
    <td width="50%"><img src="https://cdn.jsdelivr.net/gh/pi-coding/yumai-xinsheng@main/preview/calendar.png" alt="每日一词 · 科普日历"></td>
    <td width="50%"><img src="https://cdn.jsdelivr.net/gh/pi-coding/yumai-xinsheng@main/preview/corpus.png" alt="古风网络语言语料库"></td>
  </tr>
  <tr>
    <td align="center"><b>每日一词 · 科普日历</b> · 16 条词条按日期排</td>
    <td align="center"><b>语料库</b> · 原句 / 变体 / 合成逐条标注</td>
  </tr>
</table>

## 核心特性

- **逐句判定，不是整段打分**：一段文案可以有好几句，每句单独给结论；真假混着写时会直接提示「真伪混杂，建议分开处理」。
- **三段依据一起给**：`实际情况`（这句到底是什么、错在哪）、`修改建议`（想用该怎么写、怎么标注）、`核验方式`（全文核对 / 篇名比对 / 语料检索）。
- **六档结论有明确口径**：伪古风、出处讹变、出处存疑、真伪混杂、有据可考、未收录，每档都对应可复现的判定依据，不是模型自由发挥。
- **未收录 ≠ 伪古风**：没检索到只说明本库没有，界面与接口都如实标注，不把「没查到」当成「假的」。
- **古籍书库只给可信的部分**：60 部经典提供书目元数据、要旨与带篇名的名句，**不提供全文** —— 手上的语料里就没有全文，与其拼一个来路不明的电子版，不如老实说明。
- **改编工坊把规则摊开**：改完会列出用了哪条规则、出自哪部书，不是给一段没法查证的「古风腔」。
- **语料分两档且界面标注**：真实语料 118 条与模板扩写 1896 条分开存，默认只显示真实那部分，绝不把模板语料当调研样本。
- **三端一致有基线守**：Web 端、小程序端、后端共用同一套判定与改编逻辑，1920 组输入的输出指纹固化在基线文件里，任何一端改了逻辑都会被发现。
- **断网也能用**：小程序端服务端优先、本地兜底，所有页面标注数据来源，离线就写「离线」，不假装在线。
- **零构建前端**：原生 ES Module + CSS，没有打包步骤，改完刷新即可。

## 六种核验结论

| 结论 | 含义 | 怎么用 |
| --- | --- | --- |
| 有据可考 | 能在收录的典籍里找到对应原文 | 可以直接引用，注明篇名 |
| 出处讹变 | 有相近原文，但字句被改过 | 想用就对回原文，别按流传版本引 |
| 出处存疑 | 归属存疑，或版本差异较大 | 引用前请自行复核纸本 |
| 伪古风 | 查无出处，通常为现代人仿写 | 不要标成古人所作 |
| 真伪混杂 | 一段话里真假句子并存 | 分开处理，真的照引、假的改掉 |
| 未收录 | 语料库中未检索到 | **不等于伪古风**，只说明本库没查到 |

## 功能模块详解

### 溯源核验 `#/verify`

- 整段粘贴，逐句拆开判定，每句独立给结论与三段依据
- 内置 43 条误传案例 + 47 条真典对照，可按结论档位筛选查看
- 匿名可用；登录后核验记录才会保存（只存前 1000 字），匿名只做计数

### 古籍书库 `#/books`

- 60 部经典，按经 / 史 / 子 / 集等部类检索，可按关键词搜书名与要旨
- 详情页给：要旨、名句（带篇名）、同部类参考、同作者作品
- 引用关系分「直接引用 / 同部类参考 / 同作者作品」三类标注，不混为一谈

### 语言改编工坊 `#/workshop`

- 输入白话 → 选语境（书面 / 社交 / 题赠）、语气、语法形式 → 输出古风表达
- 结果附带：用了哪条规则、参考了哪本书、为什么这么改
- 改完可就地跳去核验，确认改写没有引入新的假出处

### 每日一词 · 科普日历 `#/calendar`

- 每日一词：出处、语法分析、正确用法、常见误用
- 科普日历：16 条词条按日期排布，支持分类筛选与搜索

### 答题闯关 `#/quiz`

- 从语料与误传案例中出题，交卷后进日榜
- 答错会给出正确出处，不只是一句「错了」

### 我的 `#/me`

- 古籍收藏、改编作品、核验历史；登录后跨设备同步
- 未登录也能收藏，存在本地，登录时合并到账号

### 数据看板 `#/dashboard`

- 语料分类分布、核验结论计数、热门检索
- 统计口径与语料档位在页面上写明，避免误读

## 快速开始

```bash
git clone https://github.com/pi-coding/yumai-xinsheng.git
cd yumai-xinsheng
```

**环境要求**：JDK 11、Maven、MySQL 8、Redis。前端零构建，不需要 Node。

**第一步 · 起后端**（建表脚本幂等，首次运行会建库建表并导入种子数据）

```bash
cd server
./start.ps1          # Windows PowerShell；也可直接双击 start.bat
```

服务默认跑在 <http://localhost:8081>，健康检查 `GET /api/health`。

**第二步 · 打开 Web 端**

前端由后端静态托管：启动时会从工作目录向上自动探测 `frontend/`，直接访问 <http://localhost:8081> 即可，
**改前端不用重新打包**；也支持 `yumai.web.dir` 显式指定目录。

**第三步 · 微信小程序**

用微信开发者工具导入 `miniprogram/` 目录，后端地址在小程序「设置」页填写（默认 `http://localhost:8081`，
真机调试改成局域网 IP）。连不上后端会自动切离线兜底，并标注数据来源。

> 注意：`server/backend/src/main/resources/application.yml` 里的数据库与 Redis 地址按本机环境修改；
> `SERVER_PORT` 环境变量会覆盖配置里的端口。

## 接口一览

12 个 REST 模块，统一 `/api` 前缀，返回 `{code, message, data}`；未登录或令牌无效返回 **HTTP 200 + `code:401`**。

| 模块 | 前缀 | 说明 |
| --- | --- | --- |
| 鉴权 | `/api/auth` | 注册 / 登录 / 当前用户，JWT |
| 书库 | `/api/books` | 60 部书目、部类、详情与名句 |
| 古籍收藏 | `/api/book-favorites` | 小程序按书目名收藏，`/merge` 只增不删 |
| 核验 | `/api/verify` | 逐句判定、案例库、判定口径 |
| 改编 | `/api/adapt` | 规则改编与历史记录 |
| 语料 | `/api/corpus` | 语料检索，区分 REAL / TEMPLATE |
| 日历 | `/api/calendar` | 每日一词与词条日历 |
| 答题 | `/api/quiz` | 出题、交卷、日榜 |
| 统计 | `/api/stats` | 看板数据与热门检索 |
| 归档 | `/api/archive` | 本地离线存档（可选，缺失只影响该页） |
| 每日一句 | `/api/daily` | 今日一句与健康检查 |
| 用户收藏 | `/api/favorites` | 语料行收藏（与书目录收藏是两套） |

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Web 前端 | 原生 ES Module + CSS，零构建零 CDN，11 个视图 |
| 小程序端 | 微信原生 WXML / WXSS / JS，9 页 / tabBar 5 项 |
| 后端 | Spring Boot 2.7.18 + JDK 11，12 个 REST 模块 |
| 鉴权 | JWT + 拦截器，另有独立限流与统计拦截器 |
| 存储 | MySQL 8（业务数据）+ Redis（缓存、计数、限流） |
| 一致性 | 三端共享判定与改编逻辑，1920 组输出指纹基线 |
| 自检 | 82 项接口自检 + 小程序静态校验 + 运行时冒烟 |

## 数据口径

1. **语料分两档，界面上会标出来。** 真正出自调研的只有 **118 条**，其余 **1896 条**是按模板扩充的，合计 2000 条。
   默认只显示真实那部分 —— 模板语料不会被当作调研样本给你看。
2. **「可信度」是派生指标，不是学术结论。** 它按 `100 − 伪×35 − 讹×22 − 疑×12 − 现代×3` 折算，
   未收录时不给分。**不要**把它当成调研统计结果引用。
3. **古籍只给要旨与名句，不给全文。** 引用关系分「直接引用 / 同部类参考 / 同作者作品」三类分别标注。

## 验收与自检

```bash
# 后端接口自检（82 项，需先启动服务）
cd server && node _tools/e2e.js

# 小程序：静态校验 + 数据/引擎保真度
node miniprogram/_tools/verify_mp.js

# 小程序：运行时冒烟（mock wx 环境）
node miniprogram/_tools/smoke_mp.js
```

`verify_mp.js` 会用 `miniprogram/_tools/adapt-baseline.json` 里的 1920 组指纹逐条比对改编输出，
确保三端逻辑没有漂移；本地若留有报告附录的 H5 存档，则改为直接逐条比对原文。

## 常见问题

**Q：查不到出处就说明这句话是假的吗？**
A：不是。结论里专门有一档「未收录」，含义只是本库没有检索到。只有在有对照依据时才会下更重的结论。

**Q：为什么只有 60 部书，而且没有全文？**
A：手上的语料就是这个规模，且不含全文。与其拼一个来路不明的电子版，不如只给确有其据的要旨与名句。

**Q：断网还能用吗？**
A：Web 端需要后端；小程序端有本地兜底，离线时部分功能可用，且每个页面都会标明数据来源。

**Q：我输入的内容会被保存吗？**
A：未登录只做匿名计数（按结论类别累加），不落原文；登录后才会保存核验记录，且只存前 1000 字。

**Q：前端为什么不用框架？**
A：项目面向演示与评审，原生 ES Module 零依赖、零构建，改完刷新即可，也便于逐行核对判定逻辑。

**Q：界面上的数字和报告里的对不上？**
A：报告有几处数据本身存疑（如卡方值、方差解释率），本仓库如实标注、不修改原文；
界面与本文的口径以代码实际行为为准。

## 项目结构

```text
yumai-xinsheng/
├── frontend/                  Web 前端（原生 ES Module，零构建，11 个视图）
│   ├── index.html             入口
│   ├── css/app.css            全站样式
│   └── js/
│       ├── app.js             路由与全局状态
│       ├── api.js             接口封装
│       ├── ui.js              公共组件与提示
│       └── views/             11 个视图
├── server/                    Spring Boot 后端
│   ├── backend/               Maven 工程（pom.xml / src / target）
│   │   └── src/main/resources/
│   │       ├── application.yml
│   │       ├── db/schema.sql  幂等建表脚本
│   │       └── seed/          种子数据（书库 / 语料 / 判定 / 名句 / 归档）
│   ├── docs/                  接口文档、Redis 设计
│   ├── _tools/e2e.js          82 项接口自检
│   ├── start.ps1 / start.bat  一键启动
│   └── stop.bat               停止服务
├── miniprogram/               微信小程序（9 页 / tabBar 5 项）
│   ├── pages/                 页面
│   ├── utils/                 api / repo / config（服务端优先 + 本地兜底）
│   └── _tools/                静态校验、运行时冒烟、改编指纹基线
├── preview/                   README 界面截图（6 张）
├── 开发者文档.md              工程细节：结构、运行、接口、校验、已知限制
└── README.md                  本文件
```

## 相关文档

- [开发者文档.md](开发者文档.md) — 目录结构、本地运行、接口清单、三套校验脚本、数据口径技术版、已知限制
- [server/docs/接口文档.md](server/docs/接口文档.md) — 12 个 REST 模块的请求与返回

## License

仓库暂未声明开源许可证，默认保留所有权利。想用请开 Issue 说明用途。
