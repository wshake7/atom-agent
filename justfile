# Windows 无 sh 时用 PowerShell 执行 recipe
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# 默认：列出可用命令
default:
    @just --list

# 安装 monorepo 依赖
install:
    vp i

alias i := install

# 全仓清理：node_modules / dist / .turbo / .vite / coverage / target 等
clean:
    node scripts/clean.mjs

# 一条命令启动默认装配（流式 REPL）
atom *args:
    vp run atom-cli#start -- {{args}}
