# 银白白猿终局动作表

`white_ape_silver_3x2.png` 是本项目内置 ImageGen 生成的透明底 3×2 六帧动作表，1536×1024，SHA-256 `31137d6a6c8facc73408b96927c8e8f920bc189f8e1e116a8147d6f1a3bef26e`。画面以银白兽形、冷白气息和细红血脉代替旧图集的绿色线条与金黄光环。

运行 `python3 scripts/integrate_white_ape_silver_sheet.py` 可确定性切为六张 256×256 帧，并覆盖现有 `vfx_white_ape_loop_0..5` 空间，不改变图集 manifest 坐标或 `character-pack`。脚本检查每帧留边、相邻帧差异、图集 4096 上限，生成 `data/workspaces/xuanjie-shimu-local/reports/white_ape_silver_integration_latest.json`。`cells/contact.png` 只供目检，运行时从图集读取。
