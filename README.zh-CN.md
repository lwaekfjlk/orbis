<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/orbis-wordmark-dark.svg">
  <img src="assets/brand/orbis-wordmark.svg" alt="ORBIS" width="200" height="72">
</picture>

一张自动生成的奇幻世界地图，可以从大陆一路放大到城市街道。在浏览器里探索国家与居民，看历史继续发展。

**[在线体验](https://haofeiyu.me/telluric/)** · [English](README.md)

![世界全景：国家名称、聚落和标示清晰的荒野](previews/orbis/overview-desktop.png)

*默认世界 Aereth-47。点击国名可查看疆域、人口与历史；地图显示完整正式国名；国内湖泊纳入周边国家，开放荒野保留明确标示。*

## 开始探索

| 想做什么 | 怎样操作 |
| --- | --- |
| 从世界放大到城镇 | 滚轮、双指捏合，或 **+ / −** 按钮 |
| 移动或旋转视角 | 拖动平移；**Shift + 拖动**或右键拖动旋转 |
| 找到一个地方 | 打开 **Search**，或按 **/**；选择 **Zoom ↗** 接近城镇 |
| 查看国家或建筑 | 点击名称、标记或建筑；悬停国名可高亮国界 |
| 返回世界全景 | 放大后点击 **← Back to world**，也可点击 **ORBIS** 标记或按 **H**；**Wider setting** 可从城镇拉远 |

底部 **Play** 和年份按钮用于推进历史。**Recreate** 可按种子与设置生成新世界。**⋯** 菜单提供保存、读取、编年史和导出；生成新世界前，先保存想保留的世界。

## 地貌各有性格

![赭红砂岩台地被深峡谷切开](previews/orbis/red-plateau.png)

*红土台地与峡谷崖壁。此图关闭了树木、城镇和国界图层，便于观察地形本身。*

世界中会出现红层台地、玄武岩火山口、高峰错落、山脊分叉的群山和石灰岩峰林。它们的起伏会改变河流、气候与聚落选址。板块挤压塑造高地，季节风把海洋热量与水汽带入陆地。湿润坡地保留森林和草甸，干燥高地保留土色，露岩与冰雪有各自的表面。

可以搜索地貌名称来定位。重新生成世界即可体验新地形；旧存档保留原来的地理和历史。[查看地貌说明](docs/FANTASY_LANDFORMS.md)与[板块、气候与颜色对照](docs/TECTONICS_AND_LANDCOVER.md)。

## 城市生长在原有地形上

![四座城市的2×2拼图：海岸、河谷、山麓和林冠聚落](previews/readme/grids/cities-grid.png)

*从左到右、从上到下：Camelastrbelhaven 海岸城市、Ath Annaber 河谷城镇、Tapiokylinkoski 山麓城市、Sarrnavgalbourne 林冠聚落。*

逐步放大，就能看到同一片土地上的房屋、城墙、神殿、王宫与港口。近处地形会变得更细致，气候也会影响地表、植被和建筑外观。点击建筑可查看说明，**Details** 面板还可导出 GLB 格式的城镇三维模型，模型不含周围地形。

城市细节按需加载；设备较慢时，首次生成和大型城市需要多等一会儿。地形与建筑采用风格化比例。

### 云端小城与龙族遗迹

盘龙图腾标示龙王城，日轮圣印标示圣城。海拔 3,500 米以上的山间平台具备足够空间、水源和居民时，才会出现这些微型聚落。残缺龙纹则标示古代龙族遗迹，可见残破巢庭、龙脊拱架和带角的龙颚门。

点击专属符号，或打开搜索即可前往，也支持搜索 **龙城**、**圣城**和 **龙族遗迹**。遗迹可以逐部件查看，并导出三维模型。[查看龙族遗址说明](docs/DRAGON_SITES.md)。

![龙王城、圣城与两处龙族遗迹的2×2拼图](previews/readme/grids/sites-grid.png)

*上排：Sarrlororford 龙王城、Corbinastrelfort 高山圣城。下排：Obsidian Aerie 与 Flint Spine 两处龙族遗迹。*

## 居民、国家与故事

![四座城市的故事面板组成2×2拼图，每格包含居民肖像、叙事和城市实景](previews/readme/grids/stories-grid.png)

*四位居民分别讲述 Ath Annaber、Sarrnavgalbourne、Tapiopiirkoski 和 Vainojuurniemi 的故事。每个章节都附有所依据的世界数据或历史记录。*

世界中生活着七个族群。新建国家以一个族群为主，同时保留少数族群；迁徙与政治事件可以改变人口构成。国名来自多个神话传统，国家概览会解释名称出处。

选中城镇后，点击 **Hear the whole story**，即可认识讲述者，阅读建城故事、历史冲突与当地地标。地图中的传说地点也有对应的地理依据，例如河流源头、山峰或火山。

## 本地运行

下载或克隆仓库后，用现代浏览器打开 **[dist/orbis-onemap.html](dist/orbis-onemap.html)** 即可离线游玩，无需账号、API 密钥或额外下载资源。原来的 `dist/telluric-onemap.html` 路径保留为兼容副本。

开发需要 **Node.js 20+**，无需安装 npm 依赖：

```bash
npm run dev
```

打开 **http://127.0.0.1:5173**。修改源码后，重新生成离线 HTML 与 Worker，再运行测试：

```bash
npm run build
npm test
```

重新生成地图会应用新的生成规则；读取旧存档会保留原有历史。

## 深入了解

- [国家与人口](docs/POLITIES.md) · [国界与荒野](docs/LAKE_TERRITORY_AND_LABELS.md) · [神话国名](docs/REALM_NAMES.md)
- [城市与地形](docs/CITY_COHERENCE.md) · [气候与景观](docs/BIOME_LANDSCAPES.md)
- [居民故事](docs/CITY_SAGAS.md) · [建筑图集与 GLB 导出](docs/WONDER_REFINEMENT.md)
- [加载性能](docs/MAP_LOADING.md) · [地图架构](docs/CONTINUOUS_ARCHITECTURE.md)
