## AxtFrame
> An extension Framework!
一个支持多文件/免刷新热重载及更多特性的扩展开发框架

---

## 安装框架
### 1. 克隆本仓库
```
git clone https://github.com/YearnstudioHorizon/AxtFrame
```
### 2. 安装依赖(以pnpm为例)
```
cd AxtFrame
pnpm i
```
### 3. 初始化配置文件
```
pnpm run init
```

---

## 构建 & 开发服务器
> 均以pnpm为例
### 构建
```
pnpm build
```

产物将会输出到dist/extension.js

### 开发服务器
```
pnpm dev
```

必须确保8000端口不被占用, 该端口为Turbowarp官方指定的安全来源URL
按下`y`可以直接打开网页版Turbowarp并自动载入扩展

---

## 其他内容

### 文件格式

**与原版的扩展格式类似**

位于`src`目录下的每一个`.js`或者`.ts`均会被当作一个积木

每个文件必须包含一个`info`, 只需声明即可, 如:
```
const info = {
  opcode: "myBlock",
  blockType: Scratch.BlockType.COMMAND,
  text: "111",
};
```
除此之外, 还需要一个`func`函数, 作为积木的处理函数

需要注意的是, 如果不存在该函数, 框架会注入一个默认函数, 在浏览器控制台提示该积木没有绑定函数, 即不会在构建阶段报错

#### 积木排序

在info中指定index字段, 默认为0

index越高, 排序越靠后

### 智能补全

通过 `extension.d.ts` 实现

### TypeScript支持

支持, 通过esbuild打包, 更多内容见 `main.go`

### 文件说明
```
C:.
├─dist    产物目录
├─scripts
│  └─libs
│    │ ├─banner.js 启动横幅
│    │ ├─ios.js 交互式输入实现
│    │ ├─select.js 选择框实现
│    │ └─blocky-injector.js 外源调用防护实现
|    ├─BaseExtension.ts 外壳扩展
|    ├─builder.js       js打包接口
|    ├─dev.js           开发服务器
|    ├─download.js      打包器产物下载脚本
|    ├─hotloader.js     热重载实现
|    └─init.js          初始化脚本
├─main.go        打包器实现
├─extension.d.ts 类型定义
└─src            源码目录
```

### TODO
```
[ ] 积木内生命周期
[ ] 全局存储
[ ] 运行环境变量
[ ] API函数
```