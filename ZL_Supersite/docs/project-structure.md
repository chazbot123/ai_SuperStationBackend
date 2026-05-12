# 项目结构说明

## 当前结构

```text
ZL_Supersite/
├─ index.html
├─ assets/
│  └─ images/
│     ├─ landing/
│     ├─ products/
│     └─ raw/
├─ pages/
│  └─ experiments/
├─ scripts/
│  └─ archive/
├─ docs/
│  └─ notes/
├─ task_plan.md
├─ findings.md
└─ progress.md
```

## 目录职责

- `index.html`：当前正式落地页入口。
- `assets/images/landing`：正式页面使用的图片资源。
- `assets/images/products`：产品图资源。
- `assets/images/raw`：原始素材、历史素材。
- `pages/experiments`：非正式页面、实验页。
- `scripts/archive`：历史处理脚本，默认不作为正式构建流程。
- `docs`：项目文档。

## 后续工程化建议

- 如果继续保持静态页：在当前结构基础上拆出 `styles/` 和 `scripts/` 即可。
- 如果开始接真实 API：建议迁移到框架工程，并按下面结构落地：

```text
src/
├─ pages/
├─ components/
├─ services/
├─ types/
├─ hooks/
├─ utils/
└─ constants/
```

## 框架建议

- 单页官网 + 表单提交 + 少量接口：`Vue 3 + Vite + TypeScript`
- 如果后续很重 SEO、多页面、服务端渲染：`Nuxt 3`
- 当前项目不建议继续长期维护为单个大 HTML 文件
