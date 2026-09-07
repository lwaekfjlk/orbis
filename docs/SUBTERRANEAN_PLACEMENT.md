# 地下建筑入口落地修复

旧放置代码把所有模型的最低点对齐地块，导致无光之井和熔炉深坑的井底被抬到地面。地块最高点和固定垫高量又使入口离地；只降低模型则会被连续地形及通用台基封住。

现在为地下建筑显式声明入口、地面基准和开口轮廓。主地图按入口处的原始地表高度落位，保留负 Y 井壁、阶梯和坑底；普通建筑仍按原规则放置。

| 建筑 | 修复 | 模型地下深度 | 实际网格对照 |
| --- | --- | ---: | --- |
| 无光之井 `sunless-well` | 入口贴地，井口裁开，保留螺旋下行阶 | 25.6 | [整体](../previews/excavations/sunless-well.png)、[地面高度](../previews/excavations/sunless-well-datum.png) |
| 熔炉深坑 `forge-hollow` | 入口贴地、50 级下行阶，补齐阶梯挡土肩墙与闭合底壳 | 9.8 | [对照](../previews/excavations/forge-hollow.png) |
| 第九阶 `labyrinth` | 将原本在地面上的遗迹重建为下沉庭院、24 级阶梯和地下门廊，营地留在地面 | 6.25 | [对照](../previews/excavations/labyrinth.png) |

深城的水平岩洞、桩基和悬浮建筑保持各自的结构；开口由模型显式声明，不按负坐标自动推断。

## 地形接合与数据

- 显示用地形三角形沿凸开口精确裁切。接缝沿原三角形的交点补土壁，连接倾斜地表与水平洞缘；洞外地形不被整片删除。
- 地下奇观省略会封洞的通用台基。独立城景及整城 GLB 导出也使用裁开的地面。
- 开口随建筑详细级别开启，缩回远景、移除城镇模型或换世界后恢复。原始高度、水域、冰层和文明状态不被修改。
- worker 保留开口、入口高度及刚性变换；主线程恢复相同锚点供镜头和选择使用。镜头为地下深度留出空间。
- 鼠标射线覆盖地下高度并在洞口边界补采样。建筑选择沿用建筑包围盒，地面高度查询在开口内使用坑底代理；本次没有新增逐级台阶行走碰撞。

## 可复现预览与验证

```sh
npm run build
node scripts/preview-excavations.mjs
npm run dev
```

打开 `/previews/excavations/index.html`。左侧取自 `7b3ae52`，右侧取当前实现；两侧使用相同 32 × 32 地块、配方、镜头与光照。预览地面是便于观察上下关系的有限平面，洞口和建筑均为真实网格。

默认 `Aereth-47` 世界中的 [Stormbeck 实拍](../previews/excavations/stormbeck-in-world.png) 和 [Pineshore 实拍](../previews/excavations/pineshore-in-world.png) 用于检查完整地图中的接合效果。两个入口相对其所在地表的高度差均为 0。

最终定向回归 99 项通过，覆盖地下放置、坡面封口、井内拾取、LOD/缓存恢复、真实两城、worker 网格哈希一致性、世界指纹、全部 15 座奇观、模型导出、地形和小鼠标圆环。复现命令：

```sh
node --test --test-concurrency=1 tests/excavation*.test.mjs tests/labyrinth-excavation.test.mjs tests/subterranean-integration.test.mjs tests/wonders*.test.mjs tests/wonder-assets.test.mjs tests/landmarks.test.mjs tests/selection-marker.test.mjs tests/continuous.test.mjs tests/terrain-mesh.test.mjs tests/terrain-refinement.test.mjs tests/city-terrain.test.mjs
```

已重建离线页面与 worker。重新导出后，仅熔炉深坑和第九阶两个 GLB 的几何发生变化。
