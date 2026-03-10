# Windows 11 EOC 安装排查指南

## 问题描述

Windows 11 下安装 `easy-opencode` 后，OpenCode 中没有出现 EOC 的 agent 和命令。

## 快速检查清单

在 PowerShell 或 Command Prompt 中按顺序运行以下命令：

### 步骤 1: 检查 easy-opencode 是否已安装

```powershell
npm list -g easy-opencode
```

**预期输出:**
```
easy-opencode@1.9.1
```

如果未安装:
```powershell
npm install -g easy-opencode@1.9.1
```

---

### 步骤 2: 查找全局安装位置

```powershell
npm root -g
npm bin -g
```

**典型路径:**
- `C:\Users\<用户名>\AppData\Roaming\npm\node_modules\easy-opencode`
- `C:\Users\<用户名>\AppData\Roaming\npm\eoc-install.cmd`

---

### 步骤 3: 手动运行 EOC 安装程序（关键步骤！）

**重要:** `npm install` 只会安装包，但不会运行 EOC 的安装程序！

```powershell
eoc-install
```

**选择安装类型:**
- 输入 `2` 选择 **Global** 安装（推荐用于所有项目）
- 或输入 `1` 选择 **Project-level**（仅当前项目）

如果 `eoc-install` 命令找不到:
```powershell
node $env:USERPROFILE\AppData\Roaming\npm\node_modules\easy-opencode\scripts\install.js
```

---

### 步骤 4: 验证 OpenCode 配置文件

```powershell
type $env:USERPROFILE\.opencode\opencode.json
```

**应该包含:**
- `agent` 部分，包含 `eoc_build`, `eoc_planner`, `eoc_code_reviewer`
- `command` 部分，包含所有 `/plan`, `/tdd` 等命令

**示例配置:**
```json
{
  "agent": {
    "eoc_build": {
      "description": "EOC - Primary coding agent for development work",
      "mode": "primary",
      "tools": {
        "write": true,
        "edit": true,
        "bash": true,
        "read": true
      }
    }
  },
  "command": {
    "plan": {
      "description": "Create implementation plan",
      "template": "{file:commands/plan.md}\n\n$ARGUMENTS",
      "agent": "eoc_planner",
      "subtask": true
    }
  }
}
```

---

### 步骤 5: 重启 OpenCode

配置文件更新后，需要重启 OpenCode:

1. 完全关闭 OpenCode
2. 重新启动 OpenCode
3. 在项目中运行 `/agents` 命令

**应该看到:**
- 3 个可见代理: `eoc_build`, `eoc_planner`, `eoc_code_reviewer`
- 33+ 命令: `/plan`, `/tdd`, `/code-review`, `/security` 等

---

## 使用诊断脚本

项目提供了一个自动诊断脚本 `diagnose-eoc.ps1`:

```powershell
# 下载或复制 diagnose-eoc.ps1 到本地
# 然后运行:
.\diagnose-eoc.ps1
```

**诊断脚本会检查:**
1. ✅ npm 全局安装状态
2. ✅ eoc-install 命令是否可用
3. ✅ OpenCode 配置目录是否存在
4. ✅ opencode.json 是否包含 EOC 配置
5. ✅ 备用配置位置

**输出示例:**
```
╔═════════════════════════════════════════════════════════╗
║              EOC Installation Diagnostic (Windows 11)               ║
╚═════════════════════════════════════════════════════════╝

【1】检查 npm 全局安装...
────────────────────────────────────────────────────────────────────
   npm root: C:\Users\YourName\AppData\Roaming\npm
   npm bin:  C:\Users\YourName\AppData\Roaming\npm
   ✓ easy-opencode 已安装: C:\Users\YourName\AppData\Roaming\npm\node_modules\easy-opencode
   ✓ 版本: 1.9.1

【2】检查 eoc-install 命令...
────────────────────────────────────────────────────────────────────
   ✓ 找到 eoc-install: C:\Users\YourName\AppData\Roaming\npm\eoc-install.cmd

【3】检查 OpenCode 配置目录...
────────────────────────────────────────────────────────────────────
   预期配置目录: C:\Users\YourName\.opencode
   ✓ 配置目录存在
   ✓ 找到 opencode.json
   ✓ eoc_build agent 已配置
   ✓ 所有 EOC agents 已配置
   ✓ 已配置命令: 33

╔═════════════════════════════════════════════════════════╗
║                           摘要                                     ║
╚═════════════════════════════════════════════════════════╝

状态: ✓ 一切正常

下一步:
1. 重启 OpenCode
2. 运行: /agents
3. 应该看到 eoc_build, eoc_planner, eoc_code_reviewer
```

---

## 常见问题

### 问题 1: eoc-install 命令找不到

**原因:** npm 全局 bin 目录不在 PATH 中

**解决方案 A:** 直接运行 node 脚本

```powershell
node $env:USERPROFILE\AppData\Roaming\npm\node_modules\easy-opencode\scripts\install.js
```

**解决方案 B:** 将 npm 全局 bin 目录添加到 PATH

1. 右键点击"此电脑" → "属性" → "高级系统设置"
2. 点击"环境变量"
3. 在"用户变量"或"系统变量"中找到 `Path`
4. 添加: `%USERPROFILE%\AppData\Roaming\npm`
5. 确定 → 重启终端

---

### 问题 2: 安装程序执行后配置文件未更新

**原因:** 文件权限或路径问题

**解决方案:** 手动复制配置

```powershell
# 1. 创建 .opencode 目录（如果不存在）
if (-not (Test-Path "$env:USERPROFILE\.opencode")) {
    New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.opencode"
}

# 2. 手动复制配置文件
$npmRoot = npm root -g
$eocPath = Join-Path $npmRoot "easy-opencode"

Copy-Item -Force "$eocPath\opencode.json" "$env:USERPROFILE\.opencode\opencode.json"

# 3. 复制其他必需目录
Copy-Item -Force -Recurse "$eocPath\agents" "$env:USERPROFILE\.opencode\agents"
Copy-Item -Force -Recurse "$eocPath\skills" "$env:USERPROFILE\.opencode\skills"
Copy-Item -Force -Recurse "$eocPath\commands" "$env:USERPROFILE\.opencode\commands"
Copy-Item -Force -Recurse "$eocPath\prompts" "$env:USERPROFILE\.opencode\prompts"
Copy-Item -Force "$eocPath\AGENTS.md" "$env:USERPROFILE\.opencode\AGENTS.md"
```

---

### 问题 3: OpenCode 没有加载配置

**原因:** OpenCode 没有读取正确的配置文件

**解决方案:** 检查备用配置位置

```powershell
# 检查常见的配置目录位置
$locations = @(
    "$env:USERPROFILE\.opencode",
    "$env:USERPROFILE\.config\opencode",
    "$env:LOCALAPPDATA\opencode"
)

foreach ($loc in $locations) {
    Write-Host "检查: $loc"
    if (Test-Path $loc) {
        Write-Host "  ✓ 存在"
        if (Test-Path (Join-Path $loc "opencode.json")) {
            Write-Host "  ✓ 包含 opencode.json"
        }
    } else {
        Write-Host "  ✗ 不存在"
    }
}
```

找到正确的配置目录后，将配置文件复制到那里。

---

### 问题 4: PowerShell 脚本执行策略限制

**错误信息:** 
```
无法加载文件 diagnose-eoc.ps1，因为在此系统上禁止运行脚本
```

**解决方案:** 临时允许脚本执行

```powershell
# 方法 1: 临时绕过（仅当前会话）
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
.\diagnose-eoc.ps1

# 方法 2: 为当前用户解除限制
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### 问题 5: 中文显示乱码

**原因:** PowerShell 终端编码问题

**解决方案:** 设置正确的编码

```powershell
# 设置输出编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001

# 然后运行诊断脚本
.\diagnose-eoc.ps1
```

---

## 完整的安装流程

### 方法 1: 使用 npx（推荐，无需全局安装）

```powershell
# 1. 运行安装程序（自动下载最新版本）
npx easy-opencode install

# 2. 选择安装类型
# 输入 2 选择 Global 安装

# 3. 重启 OpenCode
```

### 方法 2: 全局安装后运行 eoc-install

```powershell
# 1. 全局安装 easy-opencode
npm install -g easy-opencode@1.9.1

# 2. 运行安装程序
eoc-install
# 如果命令找不到，使用:
node $env:USERPROFILE\AppData\Roaming\npm\node_modules\easy-opencode\scripts\install.js

# 3. 选择安装类型
# 输入 2 选择 Global 安装

# 4. 重启 OpenCode
```

### 方法 3: 项目级安装

```powershell
# 1. 进入你的项目目录
cd C:\path\to\your\project

# 2. 使用 npx
npx easy-opencode install

# 3. 选择安装类型
# 输入 1 选择 Project-level 安装

# 4. 重启 OpenCode
```

---

## 验证安装成功

在 OpenCode 中运行 `/agents` 命令，应该看到:

### 可见代理（3 个）
- **eoc_build** - EOC - Primary coding agent for development work
- **eoc_planner** - EOC - Expert planning specialist for complex features
- **eoc_code_reviewer** - EOC - Expert code review specialist

### 可用命令（33+ 个）
```
/plan          - Create implementation plan
/tdd           - Enforce TDD workflow
/code-review   - Review code quality
/security      - Security review
/build-fix     - Fix build errors
/e2e           - E2E tests
/refactor-clean - Remove dead code
... 更多命令
```

### 隐藏代理（通过命令调用）
- tdd-guide
- security-reviewer
- build-error-resolver
- e2e-runner
- refactor-cleaner
- doc-updater
- go-reviewer
- go-build-resolver
- database-reviewer
- architect
- python-reviewer

---

## 技术支持

如果以上步骤都无法解决问题，请收集以下信息并提交到 GitHub Issues:

https://github.com/jabing/easy_opencode/issues

**需要收集的信息:**

```powershell
# 系统信息
systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"System Type"

# Node.js 信息
node --version
npm --version

# npm 安装信息
npm list -g easy-opencode
npm root -g
npm bin -g

# 运行诊断脚本
.\diagnose-eoc.ps1 > diagnostic-output.txt
type diagnostic-output.txt

# OpenCode 配置
type $env:USERPROFILE\.opencode\opencode.json
```

**GitHub Issue 模板:**

```
**描述:**
Windows 11 下安装 easy-opencode 后，OpenCode 中没有出现 EOC 的 agent 和命令。

**系统信息:**
- Windows 版本: [填写版本]
- Node.js 版本: [填写版本]
- npm 版本: [填写版本]

**已尝试的步骤:**
- [ ] 运行了 npm install -g easy-opencode
- [ ] 运行了 eoc-install
- [ ] 重启了 OpenCode
- [ ] 运行了诊断脚本

**诊断输出:**
[粘贴 diagnostic-output.txt 的内容]

**错误信息:**
[如果有错误，请粘贴]
```

---

## 相关文档

- [README.md](../README.md) - 项目主页
- [NPM_INSTALLATION.md](NPM_INSTALLATION.md) - npm 安装指南
- [FULL_INSTALLATION_GUIDE.md](FULL_INSTALLATION_GUIDE.md) - 完整安装指南

---

**最后更新:** 2026-03-10  
**EOC 版本:** 1.9.1
