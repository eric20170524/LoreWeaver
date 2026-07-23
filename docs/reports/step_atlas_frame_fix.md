# Atlas 切片不完整修复

> **时间**: 2026-07-23  
> **现象**: 角色/敌人精灵显示残缺、只见一角或空白  

## 根因

1. `assets/imagegen/atlas.png` 中大量关键 cell **几乎为空**（如 `player_idle` 仅 17 像素内容、`enemy_wild_rhino` 为 0）。  
2. Manifest 仍按 64×64 网格引用这些空 cell，运行时 `RuntimeArtBinder.copyFrame` 忠实地切出空/残图。  
3. 源图 `source/generated-sprite-atlas-*.png` 为 1774×887，与 atlas 768×768 网格 **不对齐**，无法直接用错误坐标“修正切片”。  
4. 玩家碰撞体 `setOffset(40, …)` 按 80×80 程序化贴图写死，atlas 为 64×64 时偏移也不对（次要）。

## 修复

1. **重建 atlas**：`python3 productize/jobs/rebuild-survivor-atlas.py`  
   - 每个 manifest 帧绘制**完整** 64×64 全身角色/敌人/环境  
   - 同步 workspace + standalone export 的 `atlas.png` / `manifest.json`  
2. **完整性门禁**：`npm run check:atlas-integrity`（关键 key content_px ≥ 200）  
3. **显示**：`setOrigin(0.5)` + 按纹理实际宽高设置 body size/offset  
4. **copyFrame**：钳制源矩形、居中绘制，避免越界半切  

## 验证

```bash
npm run check:atlas-integrity   # PASSED
# 刷新工作台 / standalone 后角色应显示完整全身
```

## 说明

当前 atlas 为 **程序化全帧重建**（可读、完整），不是恢复原始 AI 源图精细像素。若要用 AI 源图，需按真实格子重新打包 manifest，而非继续用空 cell。
