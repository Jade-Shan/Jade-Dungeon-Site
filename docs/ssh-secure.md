# VSCode SSH 远程连接免密排查与清理（Windows）

> 记录日期：2026-09-20
> 场景：在 Windows 本机用 VSCode Remote-SSH 连接 Linux 服务器（ECS），连接时不再需要输入 SSH 密钥的 passphrase，想知道密码保存在哪里、如何清除以强制每次输入。

## 结论速览

- VSCode 本身**不会把 passphrase 明文写进文件**，它靠的是系统 SSH agent 缓存。
- passphrase 保存在**本地运行 VSCode 的那台电脑**（这里是 Windows 机器）上，**不在远程服务器上**。
- 清除的核心操作是 `ssh-add -D`（清空 agent 缓存），要彻底"每次输入"则需**禁用 Windows 的 ssh-agent 服务**。

## 诊断过程（在远程服务器上执行）

排查发现远程服务器上并没有缓存任何 passphrase：

```bash
# 结果：Could not open a connection to your authentication agent.
ssh-add -l

# 结果：SSH_AUTH_SOCK= （为空）
echo $SSH_AUTH_SOCK

# 结果：无 ssh-agent 进程在运行
ps aux | grep ssh-agent

# 结果：存在 ~/.vscode-server/，说明是从本地用 Remote-SSH 连过来的
ls -d ~/.vscode-server
```

同时确认了服务器上的私钥情况：

- `~/.ssh/id_rsa` —— 有 passphrase（文件头含 `Proc-Type: 4,ENCRYPTED`）
- `~/.ssh/id_rsa_easygit` —— 无 passphrase（未加密）

**注意区分**：服务器上 `~/.ssh/id_rsa` 的加密状态，与"VSCode 从 Windows 连进来是否需要密码"无关。VSCode 连接认证用的是 **Windows 本机** `C:\Users\<用户名>\.ssh\` 下的私钥，其公钥登记在服务器的 `~/.ssh/authorized_keys` 中。

## passphrase 保存在哪里（分平台）

| 本地系统 | 保存位置 |
|---------|---------|
| macOS | 钥匙串 Keychain（`UseKeychain yes` 或 `ssh-add --apple-use-keychain`） |
| Windows | Windows OpenSSH Agent 服务 / 凭据管理器（Credential Manager） |
| Linux | ssh-agent 内存，或 GNOME Keyring / KWallet |

## 清除方法（Windows）

在 Windows 本机打开 **PowerShell** 执行以下步骤。

### 1. 查看缓存了哪些密钥

```powershell
ssh-add -l
```

- 显示 `SHA256:xxxx ...` → 密钥确实被 agent 缓存（免密的直接原因）。
- 显示 `Could not open a connection to your authentication agent` → agent 服务未开，密码可能在别处。

### 2. 清空缓存的密钥

```powershell
ssh-add -D
```

确认清空：

```powershell
ssh-add -l
# 应显示：The agent has no identities.
```

### 3. 检查 ssh config，防止自动加回

用记事本打开 `C:\Users\<用户名>\.ssh\config`（本例实际为 `D:\Users\qwshan\.ssh\config`），删除或改成 `no`：

```
AddKeysToAgent yes   ← 删掉这行
UseKeychain yes      ← Windows 一般没有，但保险起见看一眼
```

### 4.（推荐）禁用 ssh-agent 服务，才能真正"每次输入"

`ssh-add -D` 只清空当前缓存，只要 agent 服务还开着，VSCode 下次连接问一次密码后又会缓存进去。要**每次强制输入**，需以**管理员身份**打开 PowerShell：

```powershell
Set-Service ssh-agent -StartupType Disabled
Stop-Service ssh-agent
```

之后 VSCode 每次重新连接（重启 VSCode 后）都会重新弹窗询问 passphrase。

## 常见情况补充

### 私钥本身没设 passphrase

如果做完以上所有步骤，VSCode 连接时**仍不问密码**，说明 Windows 本机私钥文件本身就没设 passphrase（从没设过密码，自然无密可清）。此时需要给私钥加密码：

```powershell
ssh-keygen -p -f C:\Users\<你的用户名>\.ssh\<你的私钥名>
```

按提示设置新的 passphrase，设完后再连接就会要求输入。

## 其他平台速查

### macOS

```bash
ssh-add --apple-use-keychain -D    # 从钥匙串删除
# 或打开「钥匙串访问」搜索 ssh 并删除相关条目
# 检查 ~/.ssh/config，去掉 UseKeychain yes / AddKeysToAgent yes
```

### Linux

```bash
ssh-add -D          # 清空 agent 缓存
# 若有 GNOME Keyring，用 seahorse 图形界面删除保存的 passphrase
```
