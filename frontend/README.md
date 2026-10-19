# 语脉新生 · Web 前端

零构建、零 CDN 的原生 SPA：**没有 npm、没有打包、没有依赖**。改完直接刷新浏览器即可，
不需要重新打包后端 jar。

## 怎么访问

前端**不单独起服务**，由后端托管：

```powershell
cd ..\server\backend
mvn -DskipTests package
java -jar target/yumai-platform.jar --server.port=8081
```

打开 <http://localhost:8081>。

后端启动时按以下顺序找这个目录，找到就把 `/**` 映射过来：

1. `application.yml` 的 `yumai.web.dir`（绝对路径，或相对工作目录）
2. 从工作目录起逐级向上 5 层，找名为 `frontend` 且含 `index.html` 的目录
3. 都没有 → 退回 jar 内置的自检页（会告诉你目录该放哪，并附 `yumai.web.dir` 配法）

`/api/**` 与 `/archive/**` 的优先级高于这条通配映射，不会被前端目录抢走。

## 目录

```
frontend/
├── index.html            外壳：侧栏导航 + 视图容器
├── css/app.css           全站样式（含深色/浅色语义变量）
└── js/
    ├── app.js            hash 路由（11 条）+ 全局状态
    ├── api.js            fetch 封装：统一解包 ApiResult、带 JWT、401 自动续期
    ├── ui.js             公共渲染helper（卡片、空态、加载骨架、toast）
    └── views/            11 个视图，每个一个文件
        ├── home.js       工作台总览
        ├── books.js      古籍书库（列表 + 详情：要旨/名句/语料关联/同部荐读）
        ├── workshop.js   语言改编工坊
        ├── me.js         我的收藏与作品
        ├── calendar.js   古风科普日历
        ├── verify.js     溯源核验（反伪古风）
        ├── quiz.js       答题闯关
        ├── dashboard.js  数据看板
        ├── archive.js    工具集（需本地存在附录五离线存档，否则显示未挂载提示）
        ├── corpus.js     语料检索
        └── login.js      登录注册
```

## 和后端的数据约定

- 后端统一返回 `{ code, msg, data, timestamp }`，`code === 0` 才算成功；
- 未登录/无权限返回 **HTTP 200 + body `{code:401}`**，所以判定一律看 `body.code`，不要看 HTTP 状态码；
- `spring.jackson.default-property-inclusion: non_null`：值为 `null` 的字段**不会下发**，
  前端按 `undefined` 处理（例如「未收录」时没有 `credibility`）。

## 改前端时的注意

- 视图是原生 ES Module，用 `import()` 动态加载；新增视图要在 `js/app.js` 的路由表与
  `index.html` 的侧栏里同时登记，否则点不到。
- 后端不重新打包也能改前端；但如果你把前端目录挪走，记得同步 `application.yml` 的 `yumai.web.dir`。
