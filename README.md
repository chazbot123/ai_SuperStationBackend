# AI SuperWeb Demo

当前项目是一个基于 `React + TypeScript + Vite + Zustand` 的后台原型 Demo，用于承接完整后台产品的前端交互验证。

当前阶段结论：

- 部署形态：模块化单体 + Worker + Docker Compose 单机部署
- 推荐正式栈：`React + NestJS + PostgreSQL + Redis + MinIO + BullMQ + Nginx`
- 使用边界：独立服务器本地部署、单机部署、单企业多部门、允许依赖外部 AI / API

---

## 当前已完成的业务原型

### 1. 企业名片

已新增 `企业名片` 模块，位于 `产品管理` 附近，具备以下能力：

- 每个后台账号一张企业名片
- 名片与后台账号强绑定
- 支持编辑公司名字、运营岗位、手机号、邮箱、主营业务
- 支持封面图上传
- 支持模板选择、预览、保存
- 名片预览使用封面图作为整张文字信息区背景
- 小程序 / H5 名片页复用后台账号体系与名片数据

### 2. 商品英文名

商品已新增英文名字段：

- 字段：`englishName`
- 录入中文产品名时自动生成英文产品名
- 用户可手动修改
- 商品列表与搜索已支持英文名

当前已内置示例映射：

- `智能名片系统 -> Smart Business Card System`
- `AI电热采暖系统 -> AI Electric Heating System`
- `石墨烯节能墙暖 -> Graphene Energy-saving Wall Heater`
- `模块化地暖控制器 -> Modular Floor Heating Controller`

### 3. 登录设备限制

正式设计已明确以下登录策略：

- 后台账号最多同时登录 `2` 个设备
- 第 `3` 台登录自动挤掉最早设备
- 登录时间不主动过期

---

## 当前 Demo 技术说明

- 前端：React 18 + TypeScript + Vite
- 状态管理：Zustand
- 路由：React Router
- UI：Tailwind CSS + 自建组件
- 当前核心数据仍以本地 store / 本地持久化为主
- 当前阶段目标：先把完整后台交互和信息结构跑通，再迁移正式后端

---

## 已更新的关键页面/模块

- `产品管理`
- `企业名片`
- `前台配置中心 -> AI形象`
- 权限与路由接入 `business_cards`

---

## 测试与构建

已验证：

- `src/store/appStore.test.ts` 通过
- 企业名片一人一张并可更新
- 中文产品名可自动生成英文产品名
- `npm run build` 通过

## 启动

```bash
npm install
npm run dev -- --host 0.0.0.0
```

默认开发访问地址示例：

- 本地：`http://localhost:5174/`
- 局域网：按实际机器 IP 访问
