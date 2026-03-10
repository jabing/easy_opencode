# diagnose-eoc.ps1
# Windows 11 EOC Installation Diagnostic Script

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              EOC Installation Diagnostic (Windows 11)               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$hasErrors = $false

# ============================================================================
# 1. Check npm installation
# ============================================================================
Write-Host "【1】检查 npm 全局安装..." -ForegroundColor Yellow
Write-Host "─" * 70 -ForegroundColor DarkGray

try {
    $npmRoot = npm root -g 2>$null
    Write-Host "   npm root: $npmRoot" -ForegroundColor Gray

    $npmBin = npm bin -g 2>$null
    Write-Host "   npm bin:  $npmBin" -ForegroundColor Gray

    $eocPath = Join-Path $npmRoot "easy-opencode"
    if (Test-Path $eocPath) {
        Write-Host "   ✓ easy-opencode 已安装: $eocPath" -ForegroundColor Green

        $packageJson = Join-Path $eocPath "package.json"
        if (Test-Path $packageJson) {
            $package = Get-Content $packageJson -Raw | ConvertFrom-Json
            Write-Host "   ✓ 版本: $($package.version)" -ForegroundColor Green
        }
    } else {
        Write-Host "   ✗ easy-opencode 未安装!" -ForegroundColor Red
        Write-Host "   → 运行: npm install -g easy-opencode@1.9.1" -ForegroundColor Cyan
        $hasErrors = $true
    }
} catch {
    Write-Host "   ✗ 检查 npm 安装时出错: $_" -ForegroundColor Red
    $hasErrors = $true
}

Write-Host ""

# ============================================================================
# 2. Check eoc-install command
# ============================================================================
Write-Host "【2】检查 eoc-install 命令..." -ForegroundColor Yellow
Write-Host "─" * 70 -ForegroundColor DarkGray

try {
    $eocInstallCmd = Join-Path $npmBin "eoc-install.cmd"

    if (-not (Test-Path $eocInstallCmd)) {
        $eocInstallCmd = Join-Path $npmBin "eoc-install"
    }

    if (Test-Path $eocInstallCmd) {
        Write-Host "   ✓ 找到 eoc-install: $eocInstallCmd" -ForegroundColor Green
    } else {
        Write-Host "   ✗ 未找到 eoc-install!" -ForegroundColor Red
        Write-Host "   → 尝试手动运行:" -ForegroundColor Cyan
        Write-Host "     node `$env:USERPROFILE\AppData\Roaming\npm\node_modules\easy-opencode\scripts\install.js" -ForegroundColor Gray
        $hasErrors = $true
    }
} catch {
    Write-Host "   ✗ 检查 eoc-install 时出错: $_" -ForegroundColor Red
    $hasErrors = $true
}

Write-Host ""

# ============================================================================
# 3. Check OpenCode config directory
# ============================================================================
Write-Host "【3】检查 OpenCode 配置目录..." -ForegroundColor Yellow
Write-Host "─" * 70 -ForegroundColor DarkGray

$opencodeConfig = Join-Path $env:USERPROFILE ".opencode"
Write-Host "   预期配置目录: $opencodeConfig" -ForegroundColor Gray

if (Test-Path $opencodeConfig) {
    Write-Host "   ✓ 配置目录存在" -ForegroundColor Green

    $configFile = Join-Path $opencodeConfig "opencode.json"

    if (Test-Path $configFile) {
        Write-Host "   ✓ 找到 opencode.json" -ForegroundColor Green

        try {
            $config = Get-Content $configFile -Raw | ConvertFrom-Json

            if ($config.agent -and $config.agent.eoc_build) {
                Write-Host "   ✓ eoc_build agent 已配置" -ForegroundColor Green

                $eocAgents = @("eoc_build", "eoc_planner", "eoc_code_reviewer")
                $missingAgents = @()
                foreach ($agent in $eocAgents) {
                    if (-not $config.agent.$agent) {
                        $missingAgents += $agent
                    }
                }

                if ($missingAgents.Count -eq 0) {
                    Write-Host "   ✓ 所有 EOC agents 已配置" -ForegroundColor Green
                } else {
                    Write-Host "   ✗ 缺少 agents: $($missingAgents -join ', ')" -ForegroundColor Red
                    $hasErrors = $true
                }

                if ($config.command) {
                    $commandCount = ($config.command | Get-Member -MemberType NoteProperty).Count
                    Write-Host "   ✓ 已配置命令: $commandCount" -ForegroundColor Green
                } else {
                    Write-Host "   ✗ 未配置命令!" -ForegroundColor Red
                    $hasErrors = $true
                }

            } else {
                Write-Host "   ✗ eoc_build agent 未配置!" -ForegroundColor Red
                Write-Host "   → 运行: eoc-install" -ForegroundColor Cyan
                $hasErrors = $true
            }
        } catch {
            Write-Host "   ✗ 读取配置时出错: $_" -ForegroundColor Red
            Write-Host "   → 配置可能已损坏。尝试: eoc-install" -ForegroundColor Cyan
            $hasErrors = $true
        }
    } else {
        Write-Host "   ✗ 未找到 opencode.json!" -ForegroundColor Red
        Write-Host "   → 运行: eoc-install" -ForegroundColor Cyan
        $hasErrors = $true
    }
} else {
    Write-Host "   ✗ 配置目录不存在!" -ForegroundColor Red
    Write-Host "   → 运行: eoc-install" -ForegroundColor Cyan
    $hasErrors = $true
}

Write-Host ""

# ============================================================================
# 4. Check alternative config locations
# ============================================================================
Write-Host "【4】检查备用配置位置..." -ForegroundColor Yellow
Write-Host "─" * 70 -ForegroundColor DarkGray

$altLocations = @(
    (Join-Path $env:USERPROFILE ".config\opencode"),
    $env:LOCALAPPDATA + "\opencode"
)

foreach ($location in $altLocations) {
    if (Test-Path $location) {
        Write-Host "   找到备用配置目录: $location" -ForegroundColor Yellow
        $altConfig = Join-Path $location "opencode.json"
        if (Test-Path $altConfig) {
            Write-Host "   → 包含 opencode.json" -ForegroundColor Gray
        }
    }
}

Write-Host ""

# ============================================================================
# 5. Summary and recommendations
# ============================================================================
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                           摘要                                     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($hasErrors) {
    Write-Host "状态: ✗ 发现问题" -ForegroundColor Red
    Write-Host ""
    Write-Host "建议操作:" -ForegroundColor Yellow
    Write-Host ""

    $eocPath = npm root -g 2>$null
    $eocPath = Join-Path $eocPath "easy-opencode"

    if (-not (Test-Path $eocPath)) {
        Write-Host "1. 安装 easy-opencode:" -ForegroundColor Cyan
        Write-Host "   npm install -g easy-opencode@1.9.1" -ForegroundColor Gray
        Write-Host ""
    }

    $npmBin = npm bin -g 2>$null
    $eocInstallCmd = Join-Path $npmBin "eoc-install.cmd"
    if (-not (Test-Path $eocInstallCmd)) {
        $eocInstallCmd = Join-Path $npmBin "eoc-install"
    }

    if (Test-Path $eocPath -and (-not (Test-Path $eocInstallCmd))) {
        Write-Host "2. 手动运行 EOC 安装程序:" -ForegroundColor Cyan
        Write-Host "   node `$env:USERPROFILE\AppData\Roaming\npm\node_modules\easy-opencode\scripts\install.js" -ForegroundColor Gray
        Write-Host "   然后选择选项 2 (Global)" -ForegroundColor Gray
        Write-Host ""
    }

    if ((-not (Test-Path $opencodeConfig)) -or (-not (Test-Path (Join-Path $opencodeConfig "opencode.json")))) {
        Write-Host "3. 运行 eoc-install 进行配置:" -ForegroundColor Cyan
        Write-Host "   eoc-install" -ForegroundColor Gray
        Write-Host ""
    }

    Write-Host "4. 完全重启 OpenCode" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "状态: ✓ 一切正常" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步:" -ForegroundColor Cyan
    Write-Host "1. 重启 OpenCode" -ForegroundColor Gray
    Write-Host "2. 运行: /agents" -ForegroundColor Gray
    Write-Host "3. 应该看到 eoc_build, eoc_planner, eoc_code_reviewer" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "详细指南请参阅: docs/WINDOWS_11_TROUBLESHOOTING.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
