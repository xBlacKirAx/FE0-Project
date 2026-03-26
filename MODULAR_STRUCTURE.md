# App.js 模块化拆分说明

## 📁 项目结构

```
f:\FE0 Project\
├── app.js                    # 主应用文件（简化版）
├── index.html               # HTML 入口
├── server.js                # Express 服务器
├── style.css                # 样式文件
│
├── modules/                 # 模块文件夹
│   ├── state.js             # 游戏状态管理
│   ├── rules.js             # 游戏规则引擎
│   ├── cardOps.js           # 卡片操作逻辑
│   ├── dragDrop.js          # 拖拽交互处理
│   ├── turnManagement.js    # 回合管理逻辑
│   └── socketHandler.js     # 网络同步处理
│
└── [其他原有文件...]
```

## 🔧 各模块职责

### 1. **state.js** - 游戏状态管理
- 集中管理所有响应式数据（ref）
- 导出：`createGameState()` 函数
- 返回：所有游戏相关的状态对象

### 2. **rules.js** - 游戏规则引擎
- 判定玩家操作是否合法
- 核心函数：`canPerformAction(actionType)`
- 支持规则类型：羁绊、出击、撤回等

### 3. **cardOps.js** - 卡片操作逻辑
- 卡片移动、翻转、抽取等核心逻辑
- 导出函数：
  - `moveTo()` - 移动卡片
  - `toggleBondFace()` - 翻转羁绊
  - `drawCard()` - 抽取卡牌
  - `getArea()`, `getAreaName()`, `getAreaArray()` - 区域管理

### 4. **dragDrop.js** - 拖拽交互处理
- 鼠标拖拽和触摸交互
- 导出函数：
  - `onDragStart()`, `onDragOver()`, `onDrop()`
  - `onTouchStart()`, `onTouchMove()`, `onTouchEnd()`

### 5. **turnManagement.js** - 回合管理
- 游戏阶段控制
- 导出函数：
  - `nextPhase()` - 进入下一阶段
  - `endTurn()` - 结束回合
  - `setupTurnListener()` - 监听对手回合结束

### 6. **socketHandler.js** - 网络同步
- 处理所有 Socket.IO 事件
- 导出函数：
  - `setupSocketListeners()` - 初始化监听器
  - `handleOpponentCardMoved()` - 处理对手卡片移动

## 🎯 app.js 的简化

### 原始 app.js 行数：350+ 行
### 拆分后 app.js 行数：130+ 行

**变化**：
- ✅ 移除所有业务逻辑函数定义（转到各模块）
- ✅ 移除所有状态定义（转到 state.js）
- ✅ 保留模块组装和 Vue 应用挂载
- ✅ 保留必要的 onMounted 钩子和 UI 辅助函数

## 🚀 使用方法

### 加载顺序（在 index.html 中）
```html
<script src="modules/state.js"></script>
<script src="modules/rules.js"></script>
<script src="modules/cardOps.js"></script>
<script src="modules/dragDrop.js"></script>
<script src="modules/turnManagement.js"></script>
<script src="modules/socketHandler.js"></script>
<script src="app.js"></script>
```

### 模块依赖关系
```
state.js
  ↓
rules.js (依赖 state)
cardOps.js (依赖 state)
dragDrop.js (依赖 state, cardOps, rules)
turnManagement.js (依赖 state)
socketHandler.js (依赖 state, cardOps)
  ↓
app.js (组装所有模块)
```

## 💡 优势

1. **代码复用性**：每个模块可独立测试和复用
2. **可维护性**：一个文件一个职责，易于定位问题
3. **扩展性**：新增功能时，只需修改对应模块
4. **易读性**：模块小，函数逻辑清晰
5. **团队协作**：不同开发者可同时修改不同模块

## 🔄 后续优化建议

1. **单元测试**：为每个模块编写单元测试
2. **TypeScript**：考虑迁移到 TypeScript 获得更好的类型检查
3. **Pinia**：将状态管理迁移到 Pinia（比 Vuex 更适合 Vue 3）
4. **组件化UI**：将模板拆分为可复用的 Vue 组件
5. **构建工具**：使用 Vite 或 Webpack 进行模块打包和优化

## 📝 文件对应关系

| 原 app.js 中的函数 | 现在位置 |
|------------------|--------|
| 状态定义（ref） | state.js |
| canPerformAction | rules.js |
| getArea, moveTo 等 | cardOps.js |
| onDragStart, onDrop 等 | dragDrop.js |
| nextPhase, endTurn | turnManagement.js |
| Socket 监听 | socketHandler.js |
| UI 辅助函数 | app.js |

## ✅ 验证步骤

1. 启动服务器：`node server.js`
2. 打开浏览器：http://localhost:3000
3. 检查浏览器控制台，确保没有错误
4. 测试拖拽、点击、翻面等交互功能

祝你使用愉快！🎮
