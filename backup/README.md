# 完整工程归档

- 仓库：https://github.com/liuyinchu/ai-viedo-Collection-of-Fiction
- 完整快照：https://github.com/liuyinchu/ai-viedo-Collection-of-Fiction/releases/tag/full-project-2026-10-22
- 播放与下载：https://liuyinchu.github.io/ai-viedo-Collection-of-Fiction/

main 保留源码与完整提交历史。archive/full-project-2026-10-22 分支传输分块快照；
GitHub Actions 校验每块和每个原始文件，检查恢复出的 Git 数据库，再组装为 Release 分卷。

备份范围为整个工程目录，包括 .git、所有未入 Git 的音视频、node_modules 和 .venv。
保留原 macOS Apple Silicon 依赖与符号链接；换机器时应重建共享 Python/Node/Chromium 运行时。
本地原有 83 个试听/预览副本的对应关系见 local-review-map.json，
其中远端没有的 19,876 字节已放入 out/local-review-unique/ 并纳入快照。

Release 的 RESTORE.md、SHA256SUMS、file-tree.json、release-parts.json 与 cloud-verification.json
用于恢复和验证。GitHub 自动生成的源码 ZIP 不包含完整工程。

仅在 GitHub 源码历史与 Release 快照均校验后，才移动远端工程、本地 remote-proj3 和
本会话的项目预览副本至回收站。回收站仍占用磁盘，清空后才实际释放空间。

部署由 main 上的 workflow_dispatch 发起，archive_ref 指向完整分块分支，符合 github-pages 仅允许 main 部署的既有规则。

Release 与 Pages 已成功发布，云端校验报告见 cloud-verification.json。只克隆源码历史可使用 git clone --single-branch --branch main；完整文件使用 Release 快照。
网络不稳定时可使用 tools/download-release-ranges.py，指定 Release 的 snapshot.json、release-parts.json 和下载目录，按范围续传并验证每个块及最终完整快照。tools/upload-via-git.py 保留了本次分批推送流程，路径和标签为本次归档配置。

完整 Release 下载回读也已通过，见 download-verification.json。回收站清理前的数据检查见 cleanup-preflight.json；页面截图见 pages-deployment.png。
