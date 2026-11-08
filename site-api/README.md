后端API
==============

使用说明
--------------

### 用户注册

配置文件`config.properties`中的`AUTH_DISABLE_REGIST`开关用来禁用通过HTTP请求注册新用户：

```
AUTH_DISABLE_REGIST=true
```

系统管理员在登录服务器后，通过命令行注册新用户：

```bash
node dist/userRegCli.js -u <username> -p <password>
```
