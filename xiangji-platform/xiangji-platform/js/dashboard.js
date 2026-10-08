/* ==========================================================================
   dashboard.js - 「桂冀土专家调研数据洞察」data screen
   --------------------------------------------------------------------------
   Public API: window.dashboard = { init, resizeAll }
   Data source: global `dashboardData` provided by js/data.js
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var MAP_GEOJSON_URL = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
  var COUNT_DURATION = 2000;               // number rolling duration: 2s

  // Province display name -> [longitude, latitude]
  var PROVINCE_POINTS = [
    { name: '广西', count: 65, coord: [108.32, 22.82], color: '#ffd93d' },
    { name: '河北', count: 66, coord: [114.50, 38.05], color: '#ffd93d' }
  ];

  var COLORS = {
    guangxi: '#4ecdc4',   // cyan
    hebei: '#e94560',     // red
    highlight: '#e94560',
    dimText: '#8888a0',
    text: '#e8e8f0'
  };

  /* ------------------------------------------------------------------ *
   * Fallback data
   * ------------------------------------------------------------------ *
   * js/data.js is expected to expose `dashboardData`. The fallback below
   * keeps the screen renderable when a field is missing (for example while
   * data.js is still empty). Real data always wins when present.
   */

  var FALLBACK_SUMMARY = {
    total: 131,       // 调研总量
    guangxi: 65,      // 广西
    hebei: 66,        // 河北
    dimensions: 12    // 分析维度
  };

  // Placeholder 12-dimension comparison, used only when data.js has no data.
  var FALLBACK_DIMENSIONS = [
    { name: '技术掌握度', guangxi: 72, hebei: 68, significant: true },
    { name: '带富能力', guangxi: 65, hebei: 70, significant: true },
    { name: '培训意愿', guangxi: 80, hebei: 74, significant: false },
    { name: '数字工具使用', guangxi: 46, hebei: 58, significant: true },
    { name: '政策知晓度', guangxi: 55, hebei: 62, significant: true },
    { name: '销售渠道', guangxi: 61, hebei: 57, significant: false },
    { name: '品牌意识', guangxi: 49, hebei: 66, significant: true },
    { name: '合作社参与', guangxi: 58, hebei: 64, significant: false },
    { name: '技术转化率', guangxi: 53, hebei: 60, significant: true },
    { name: '资金获取', guangxi: 42, hebei: 51, significant: true },
    { name: '传承意愿', guangxi: 76, hebei: 69, significant: true },
    { name: '产业规模', guangxi: 63, hebei: 71, significant: false }
  ];

  /* Three technology chains rendered by chart-funnel.
     Percentage grid layout: three columns at x = 10% / 40% / 70%, each 25% wide.
     `center` is the column centre, used to anchor the caption / loss labels. */
  var FUNNEL_CHAINS = [
    { key: 'industryUniversity', title: '产学研通道', left: '10%', width: '25%', center: '22.5%', loss: '流失69.9%' },
    { key: 'heritage',           title: '技艺传承链', left: '40%', width: '25%', center: '52.5%', loss: '流失38%' },
    { key: 'monetization',       title: '技术变现链', left: '70%', width: '25%', center: '82.5%', loss: '流失32%' }
  ];

  var FUNNEL_MAX = 100;       // shared maximum, so the three funnels stay comparable

  // Layer colours: light red -> deep red; the last layer (the break point) is darkest.
  var FUNNEL_PALETTE = { from: '#ff8a80', to: '#c62828', breakPoint: '#b71c1c' };

  // Fallback chains, used only when dashboardData.funnelData is missing.
  var FALLBACK_FUNNEL = {
    industryUniversity: [
      { name: '知晓高校资源', value: 100 },
      { name: '参加过高校培训', value: 30.1 },
      { name: '建立稳定对接', value: 8 }
    ],
    heritage: [
      { name: '愿意培养年轻人', value: 39 },
      { name: '建立稳定师徒关系', value: 9 },
      { name: '形成人才梯队', value: 1 }
    ],
    monetization: [
      { name: '拥有专属技术', value: 33 },
      { name: '注册品牌', value: 3 },
      { name: '技术带来额外收入', value: 1 }
    ]
  };

  // Fallback training supply/demand pairs, used only when dashboardData.trainingGap is missing.
  var FALLBACK_TRAINING_GAP = [
    { name: '先进种养技术',   demand: 3.8, supply: 2.5, gap: 1.3 },
    { name: '经营管理与市场', demand: 3.5, supply: 2.4, gap: 1.1 },
    { name: '政策法规与补贴', demand: 3.3, supply: 2.6, gap: 0.7 },
    { name: '品牌建设与电商', demand: 3.2, supply: 2.8, gap: 0.4 },
    { name: '智慧农业应用',   demand: 2.8, supply: 3.1, gap: -0.3 }
  ];

  // Fixed value axis for chart-gap (mean scores on a 1-5 scale).
  var GAP_AXIS = { min: 2, max: 4 };

  /* Quadrant chart (chart-cluster): x = 内生能力, y = 制度供给, both 2.0 - 5.0. */
  var CLUSTER_AXES = {
    xName: '内生能力',
    yName: '制度供给',
    min: 2,
    max: 5,
    xSplit: 3.5,
    ySplit: 3.0
  };

  // Full quadrant boxes (split by the two mid lines) plus their corner captions.
  var CLUSTER_QUADRANTS = {
    topRight:    { xMin: 3.5, xMax: 5,   yMin: 3.0, yMax: 5,   label: '高能力-高制度' },
    topLeft:     { xMin: 2,   xMax: 3.5, yMin: 3.0, yMax: 5,   label: '低能力-高制度' },
    bottomRight: { xMin: 3.5, xMax: 5,   yMin: 2,   yMax: 3.0, label: '高能力-低制度' },
    bottomLeft:  { xMin: 2,   xMax: 3.5, yMin: 2,   yMax: 3.0, label: '低能力-低制度' }
  };

  // Regions the sample dots are jittered inside, per cluster type.
  var CLUSTER_DOT_BOXES = {
    topRight:    { xMin: 3.5, xMax: 4.5, yMin: 3.0, yMax: 4.0 },
    bottomLeft:  { xMin: 2.5, xMax: 3.5, yMin: 2.0, yMax: 3.0 },
    topLeft:     { xMin: 2,   xMax: 3.5, yMin: 3.0, yMax: 5 },
    bottomRight: { xMin: 3.5, xMax: 5,   yMin: 2,   yMax: 3.0 }
  };

  // Fallback cluster result: 58 + 33 = 91 classified samples (64% / 36%).
  var FALLBACK_CLUSTER = [
    {
      name: '能力均衡型', count: 58, quadrant: 'topRight', color: '#4ecdc4', symbolSize: 8,
      box: { xMin: 3.5, xMax: 4.5, yMin: 3.0, yMax: 4.0 }
    },
    {
      name: '制度依赖型', count: 33, quadrant: 'bottomLeft', color: '#e94560', symbolSize: 7,
      box: { xMin: 2.5, xMax: 3.5, yMin: 2.0, yMax: 3.0 }
    }
  ];

  var CLUSTER_NOTE = '与分型关联最强的是学历(V=0.353)，而非地区(V=0.224)';

  // Fallback hierarchical regression result (chart-mechanism).
  var FALLBACK_MECHANISM = {
    layers: [
      { name: '控制变量',     value: 0.543 },
      { name: '微观内生能力', value: 0.343 },
      { name: '中观主体对接', value: 0.025 },
      { name: '宏观政策环境', value: 0.001 }
    ],
    keyFactor: {
      label: '技术经验独特性',
      beta: 0.70,
      stars: '***',
      note: '唯一显著变量，是第二名效应量的5倍'
    }
  };

  // Stacked layer colours for the ΔR² bar (the macro step is almost invisible).
  var MECHANISM_COLORS = {
    control: '#555555',
    internal: '#e94560',
    meso: '#4ecdc4',
    macro: '#333333',
    extra: ['#555555', '#e94560', '#4ecdc4', '#333333']
  };

  /* Dual word cloud (chart-wordcloud): Guangxi on the left, Hebei on the right.
     Word order decides the font size (the first word is the biggest). */
  var FALLBACK_WORDCLOUD = {
    guangxi: ['农药', '种植', '农业', '学习', '肥料', '柑橘', '技术', '病虫害', '丰收', '成本',
              '管理', '经验', '市场', '品种', '土地'],
    hebei: ['生猪', '对接', '保险', '支持', '饲养', '养殖', '防疫', '饲料', '政策', '销路',
            '技术', '管理', '市场', '品种', '经验']
  };

  // Per-word colour ranges, interpolated by position so the colouring is deterministic.
  var WORDCLOUD_RANGES = {
    guangxi: { from: '#2ec4b6', to: '#4ecdc4' },
    hebei: { from: '#e94560', to: '#ff8a80' }
  };

  var WORDCLOUD_FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  var WORDCLOUD_NOTE = '广西侧重种植业投入品，河北侧重养殖业风险与技术';

  /* Treemap palette for chart-topic: a larger value gets a deeper red. */
  var TOPIC_PALETTE = { deep: '#c62828', light: '#ffccbc' };

  // Fallback difficulty topics (open-ended question mention rate), used only when
  // dashboardData.difficultyTopics is missing.
  var FALLBACK_TOPICS = [
    { name: '资金与成本', value: 49 },
    { name: '销售与市场', value: 35 },
    { name: '生产管理技术', value: 28 },
    { name: '劳动力短缺', value: 22 },
    { name: '政策信息不通', value: 18 },
    { name: '技术更新难', value: 15 },
    { name: '自然风险', value: 12 }
  ];

  /* Policy donuts (chart-policy): share of respondents who do NOT know the policy. */
  var FALLBACK_POLICY = { overall: 55.7, guangxi: 75.9, hebei: 39.7 };

  var POLICY_COLORS = {
    unknown: '#e94560',                  // red = not aware of the policy
    known: '#444444'                     // grey = aware
  };

  /* ------------------------------------------------------------------ *
   * Chart card definitions (rendered into #dashboard-screen)
   * ------------------------------------------------------------------ */

  var CHART_DEFS = [
    { id: 'chart-map',       title: '调研样本地理分布', tag: 'GEO / CHINA',   span: 3, ready: true },
    { id: 'chart-dimension', title: '12维度对比分析',   tag: 'GUANGXI vs HEBEI', ready: true },
    { id: 'chart-funnel',    title: '三条链条转化漏斗', tag: 'FUNNEL × 3',      ready: true },
    { id: 'chart-gap',       title: '培训需求-供给配对缺口', tag: 'LOLLIPOP',   ready: true },
    { id: 'chart-cluster',   title: '土专家人群分型（k=2聚类）', tag: 'QUADRANT',  ready: true },
    { id: 'chart-mechanism', title: '技术传播带动的驱动机制',    tag: 'ΔR² STACK', ready: true },
    { id: 'chart-wordcloud', title: '桂冀两地开放题关键词对比', tag: 'WORD CLOUD', ready: true },
    { id: 'chart-topic',     title: '土专家面临的主要困难（开放题提及率）', tag: 'TREEMAP', span: 2, ready: true },
    { id: 'chart-policy',    title: '人才政策信息缺失情况', tag: 'DONUT × 3', ready: true }
  ];

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  var charts = {};        // chartId -> ECharts instance
  var inited = false;

  /* ------------------------------------------------------------------ *
   * Data helpers
   * ------------------------------------------------------------------ */

  function pickNumber() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (typeof v === 'number' && isFinite(v)) { return v; }
      if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) { return Number(v); }
    }
    return null;
  }

  function pickBoolean() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (typeof v === 'boolean') { return v; }
      if (v === 1 || v === '1' || v === 'true') { return true; }
      if (v === 0 || v === '0' || v === 'false') { return false; }
    }
    return null;
  }

  /** Keep at most one decimal place. */
  function round1(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    var num = parseInt(h, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  /** Linear interpolation between two hex colours, t in [0, 1]. */
  function mixHex(from, to, t) {
    var a = hexToRgb(from);
    var b = hexToRgb(to);
    var r = Math.round(a[0] + (b[0] - a[0]) * t);
    var g = Math.round(a[1] + (b[1] - a[1]) * t);
    var bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /**
   * Funnel layer colour: light red -> deep red for the regular layers,
   * and the darkest red for the final layer (the break point).
   */
  function layerColor(index, total) {
    if (index >= total - 1) { return FUNNEL_PALETTE.breakPoint; }
    var span = total - 2;                        // number of colour steps
    var t = span > 0 ? index / span : 0;
    return mixHex(FUNNEL_PALETTE.from, FUNNEL_PALETTE.to, t);
  }

  /** Keep at most two decimal places (scatter coordinates). */
  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  /**
   * Deterministic pseudo random generator (LCG). A fixed seed keeps the
   * jittered scatter identical on every render instead of jumping around.
   */
  function createRandom(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /** Scatter jitter inside one quadrant box, with a margin off the split lines. */
  function scatterPoints(count, box, seed) {
    var rand = createRandom(seed);
    var points = [];
    var margin = 0.1;
    var xSpan = Math.max(box.xMax - box.xMin - margin * 2, 0.01);
    var ySpan = Math.max(box.yMax - box.yMin - margin * 2, 0.01);

    for (var i = 0; i < count; i++) {
      // Averaging three uniforms pulls the dots towards the quadrant centre,
      // which reads better than a flat uniform cloud.
      var ux = (rand() + rand() + rand()) / 3;
      var uy = (rand() + rand() + rand()) / 3;
      points.push([
        round2(box.xMin + margin + ux * xSpan),
        round2(box.yMin + margin + uy * ySpan)
      ]);
    }
    return points;
  }

  /** Fall back to a quadrant guess when the data has no explicit region. */
  function quadrantByName(name, index) {
    var n = String(name);
    if (n.indexOf('均衡') >= 0) { return 'topRight'; }
    if (n.indexOf('依赖') >= 0) { return 'bottomLeft'; }
    return index === 0 ? 'topRight' : 'bottomLeft';
  }

  /** Stacked-layer colour for chart-mechanism. */
  function mechanismColor(name, index) {
    var n = String(name);
    if (n.indexOf('控制') >= 0) { return MECHANISM_COLORS.control; }
    if (n.indexOf('内生') >= 0 || n.indexOf('微观') >= 0) { return MECHANISM_COLORS.internal; }
    if (n.indexOf('中观') >= 0 || n.indexOf('对接') >= 0) { return MECHANISM_COLORS.meso; }
    if (n.indexOf('宏观') >= 0 || n.indexOf('政策') >= 0) { return MECHANISM_COLORS.macro; }
    return MECHANISM_COLORS.extra[index % MECHANISM_COLORS.extra.length];
  }

  /** Read the survey summary, tolerating several plausible key names. */
  function readSummary() {
    var src = (global.dashboardData && global.dashboardData.summary) || {};
    return {
      total: pickNumber(src.total, src.totalCount, src.totalExperts, src.count, src.sum, FALLBACK_SUMMARY.total),
      guangxi: pickNumber(src.guangxi, src.gx, src.guangxiCount, FALLBACK_SUMMARY.guangxi),
      hebei: pickNumber(src.hebei, src.hb, src.hebeiCount, FALLBACK_SUMMARY.hebei),
      dimensions: pickNumber(src.dimensions, src.dimension, src.dimensionCount, FALLBACK_SUMMARY.dimensions)
    };
  }

  /** Normalize dashboardData.dimensionCompare into a uniform shape. */
  function readDimensions() {
    var raw = global.dashboardData && global.dashboardData.dimensionCompare;
    var list = [];

    if (Array.isArray(raw) && raw.length) {
      list = raw.map(function (item, index) {
        // Accept both object items and array items: [name, gx, hb, significant]
        if (Array.isArray(item)) {
          return {
            name: String(item[0] == null ? '维度' + (index + 1) : item[0]),
            guangxi: pickNumber(item[1]) || 0,
            hebei: pickNumber(item[2]) || 0,
            significant: pickBoolean(item[3]) === true,
            detail: String(item[4] == null ? '' : item[4])
          };
        }

        var values = Array.isArray(item.values) ? item.values : [];
        var name = item.name || item.dimension || item.label || item.title || ('维度' + (index + 1));

        return {
          name: String(name),
          guangxi: pickNumber(item.guangxi, item.gx, item['广西'], item.valueGuangxi, values[0], item.value) || 0,
          hebei: pickNumber(item.hebei, item.hb, item['河北'], item.valueHebei, values[1]) || 0,
          significant: pickBoolean(item.significant, item.sig, item.star, item.isSignificant) === true,
          detail: String(item.detail || item.description || item.desc || '')
        };
      });
    } else {
      list = FALLBACK_DIMENSIONS.slice();
    }

    // Guard: the dimension chart expects 12 groups.
    return list.slice(0, FALLBACK_SUMMARY.dimensions);
  }

  /** Normalize one funnel chain into [{name, value}]. */
  function readChain(raw, fallback) {
    if (!Array.isArray(raw) || !raw.length) { return fallback.slice(); }

    return raw.map(function (item, index) {
      // Accept both object items and array items: [name, value]
      if (Array.isArray(item)) {
        return {
          name: String(item[0] == null ? '阶段' + (index + 1) : item[0]),
          value: pickNumber(item[1]) || 0
        };
      }
      return {
        name: String(item.name || item.stage || item.label || ('阶段' + (index + 1))),
        value: pickNumber(item.value, item.count, item.rate, item.percent) || 0
      };
    });
  }

  /**
   * Read dashboardData.funnelData -> [{key, title, left, center, layers, loss}]
   * `loss` is the chained loss rate: (first layer - last layer) / first layer.
   */
  function readFunnelData() {
    var src = (global.dashboardData && global.dashboardData.funnelData) || {};
    var rateSrc = src.lossRates || {};

    return FUNNEL_CHAINS.map(function (chain) {
      var layers = readChain(src[chain.key], FALLBACK_FUNNEL[chain.key] || []);

      // Loss caption: an explicit rate in the data wins over the survey figure.
      var explicit = pickNumber(src[chain.key + 'Loss'], rateSrc[chain.key]);
      var lossText = explicit != null ? ('流失' + round1(explicit) + '%') : chain.loss;

      return {
        key: chain.key,
        title: chain.title,
        left: chain.left,
        width: chain.width,
        center: chain.center,
        lossText: lossText,
        layers: layers
      };
    });
  }

  /** Read dashboardData.trainingGap -> [{name, demand, supply, gap}]. */
  function readTrainingGap() {
    var raw = global.dashboardData && global.dashboardData.trainingGap;
    var list;

    if (Array.isArray(raw) && raw.length) {
      list = raw.map(function (item, index) {
        // Accept both object items and array items: [name, demand, supply, gap]
        if (Array.isArray(item)) {
          var d0 = pickNumber(item[1]) || 0;
          var s0 = pickNumber(item[2]) || 0;
          return {
            name: String(item[0] == null ? '技能' + (index + 1) : item[0]),
            demand: d0,
            supply: s0,
            gap: pickNumber(item[3], d0 - s0)
          };
        }

        var demand = pickNumber(item.demand, item.need, item.require) || 0;
        var supply = pickNumber(item.supply, item.provide) || 0;

        return {
          name: String(item.name || item.skill || item.label || ('技能' + (index + 1))),
          demand: demand,
          supply: supply,
          gap: pickNumber(item.gap, item.diff, demand - supply)
        };
      });
    } else {
      list = FALLBACK_TRAINING_GAP.map(function (item) {
        return { name: item.name, demand: item.demand, supply: item.supply, gap: item.demand - item.supply };
      });
    }

    return list;
  }

  /**
   * Read dashboardData.clusterData -> {types, total}
   * Each type: {name, count, color, quadrant, points}
   */
  function readClusterData() {
    var raw = global.dashboardData && (
      global.dashboardData.clusterData ||
      global.dashboardData.cluster ||
      global.dashboardData.crowdTypes
    );
    var list = Array.isArray(raw) ? raw : (raw && (raw.types || raw.groups || raw.clusters));
    var types = [];
    var first = (Array.isArray(list) && list.length) ? list[0] : null;

    // Case A: flat sample rows [{type, x, y}, ...] - group them by type.
    var isFlat = !!first && !Array.isArray(first) &&
      pickNumber(first.x, first.xValue, first.capability, first.inner) != null &&
      pickNumber(first.y, first.yValue, first.institution, first.system) != null &&
      pickNumber(first.count, first.n) == null;

    if (isFlat) {
      var grouped = {};

      list.forEach(function (row) {
        var key = String(row.type || row.group || row.cluster || row.name || '未分型');
        if (!grouped[key]) { grouped[key] = { name: key, count: 0, points: [] }; }
        grouped[key].count += 1;
        grouped[key].points.push([
          round2(pickNumber(row.x, row.xValue, row.capability, row.inner)),
          round2(pickNumber(row.y, row.yValue, row.institution, row.system))
        ]);
      });

      types = Object.keys(grouped).map(function (key, index) {
        var group = grouped[key];
        return {
          name: group.name,
          count: group.count,
          color: group.name.indexOf('依赖') >= 0 ? COLORS.hebei : COLORS.guangxi,
          quadrant: quadrantByName(group.name, index),
          points: group.points
        };
      });
    } else if (Array.isArray(list) && list.length) {
      // Case B: pre-grouped types with a sample count.
      types = list.map(function (item, index) {
        var name = String(item.name || item.type || item.label || ('类型' + (index + 1)));
        var quadrant = item.quadrant || item.region || quadrantByName(name, index);
        var box = CLUSTER_DOT_BOXES[quadrant] || CLUSTER_DOT_BOXES.topRight;
        var count = pickNumber(item.count, item.value, item.n) || 0;

        return {
          name: name,
          count: count,
          // Balanced-capability type (top-right) is cyan, dependency type (bottom-left) is red.
          color: item.color || (quadrant === 'bottomLeft' ? COLORS.hebei : COLORS.guangxi),
          symbolSize: pickNumber(item.symbolSize, item.size) || (index === 0 ? 8 : 7),
          quadrant: quadrant,
          // Explicit coordinates win; otherwise jitter `count` dots inside the region.
          points: Array.isArray(item.points) && item.points.length
            ? item.points
            : scatterPoints(count, box, 2018 + index * 97)
        };
      });
    } else {
      // Case C: no usable data - fall back to the research summary figures.
      types = FALLBACK_CLUSTER.map(function (item, index) {
        return {
          name: item.name,
          count: item.count,
          color: item.color,
          symbolSize: item.symbolSize,
          quadrant: item.quadrant,
          points: scatterPoints(item.count, item.box, 2018 + index * 97)
        };
      });
    }

    var total = types.reduce(function (sum, t) {
      return sum + (t.count || t.points.length);
    }, 0);

    return { types: types, total: total };
  }

  /**
   * Read the hierarchical regression result for chart-mechanism.
   * Returns {layers: [{name, value}], factor: {label, betaText, note}}
   */
  function readMechanismData() {
    var src = (global.dashboardData && (
      global.dashboardData.mechanismData ||
      global.dashboardData.mechanism ||
      global.dashboardData.regression
    )) || {};
    var rawLayers = Array.isArray(src) ? src : (src.layers || src.steps || src.stages);
    var layers = [];

    if (Array.isArray(rawLayers) && rawLayers.length) {
      layers = rawLayers.map(function (item, index) {
        // Accept both object items and array items: [name, deltaR2]
        if (Array.isArray(item)) {
          return {
            name: String(item[0] == null ? '分层' + (index + 1) : item[0]),
            value: pickNumber(item[1]) || 0
          };
        }
        return {
          name: String(item.name || item.label || item.stage || ('分层' + (index + 1))),
          value: pickNumber(item.value, item.deltaR2, item.deltaR2Value, item.r2, item.delta) || 0
        };
      });
    } else {
      layers = FALLBACK_MECHANISM.layers.map(function (l) {
        return { name: l.name, value: l.value };
      });
    }

    // Key-factor card printed below the stacked bar.
    var fallbackFactor = FALLBACK_MECHANISM.keyFactor;
    var factorSrc = (!Array.isArray(src) && (src.keyFactor || src.beta || src.highlight)) || fallbackFactor;
    var factor;

    if (typeof factorSrc === 'string') {
      factor = { label: factorSrc, betaText: '', note: fallbackFactor.note };
    } else {
      var label = factorSrc.label || factorSrc.name || fallbackFactor.label;
      var beta = pickNumber(factorSrc.beta, factorSrc.value, factorSrc.coefficient);
      var stars = factorSrc.stars || factorSrc.significance || fallbackFactor.stars;
      factor = {
        label: label,
        betaText: 'β = ' + (beta != null ? beta.toFixed(2) : '0.70') + ' ' + stars,
        note: factorSrc.note || factorSrc.desc || fallbackFactor.note
      };
    }

    return { layers: layers, factor: factor };
  }

  /**
   * Read dashboardData.wordCloudData -> {guangxi, hebei}.
   * A flat list without region information cannot be split, so it falls back.
   */
  function readWordCloudData() {
    var src = (global.dashboardData && (
      global.dashboardData.wordCloudData ||
      global.dashboardData.wordCloud ||
      global.dashboardData.keywords
    )) || {};

    if (Array.isArray(src)) { return {}; }

    return {
      guangxi: src.guangxi || src.gx || src['广西'],
      hebei: src.hebei || src.hb || src['河北']
    };
  }

  /** Normalize a word list into [{name, value}]; strings get a decreasing weight. */
  function normalizeWords(list, fallback) {
    var source = (Array.isArray(list) && list.length) ? list : fallback;

    return source.map(function (item, index) {
      var defaultWeight = Math.max(100 - index * 6, 12);

      if (typeof item === 'string') {
        return { name: item, value: defaultWeight };
      }
      if (Array.isArray(item)) {
        return { name: String(item[0]), value: pickNumber(item[1]) || defaultWeight };
      }
      return {
        name: String(item.name || item.word || item.text || ''),
        value: pickNumber(item.value, item.count, item.weight, item.freq) || defaultWeight
      };
    }).filter(function (word) {
      return word.name !== '';
    });
  }

  /** Read dashboardData.difficultyTopics -> [{name, value}]. */
  function readTopicData() {
    var raw = global.dashboardData && (
      global.dashboardData.difficultyTopics ||
      global.dashboardData.topics ||
      global.dashboardData.topicData
    );
    var list;

    if (Array.isArray(raw) && raw.length) {
      list = raw.map(function (item, index) {
        // Accept both object items and array items: [name, value]
        if (Array.isArray(item)) {
          return {
            name: String(item[0] == null ? '议题' + (index + 1) : item[0]),
            value: pickNumber(item[1]) || 0
          };
        }
        return {
          name: String(item.name || item.topic || item.label || ('议题' + (index + 1))),
          value: pickNumber(item.value, item.count, item.freq, item.n) || 0
        };
      });
    } else if (raw && typeof raw === 'object') {
      // Plain dictionary form: { '销售渠道不畅': 24, ... }
      list = Object.keys(raw).map(function (key) {
        return { name: key, value: pickNumber(raw[key]) || 0 };
      });
    } else {
      list = FALLBACK_TOPICS.map(function (t) {
        return { name: t.name, value: t.value };
      });
    }

    return list;
  }

  /** Read the policy-awareness figures -> {overall, guangxi, hebei}. */
  function readPolicyData() {
    var src = global.dashboardData && (
      global.dashboardData.policyData ||
      global.dashboardData.policyAwareness ||
      global.dashboardData.policy
    );
    var result = {
      overall: FALLBACK_POLICY.overall,
      guangxi: FALLBACK_POLICY.guangxi,
      hebei: FALLBACK_POLICY.hebei
    };

    if (Array.isArray(src) && src.length) {
      src.forEach(function (item, index) {
        var value = pickNumber(item.value, item.percent, item.rate, item.share);
        if (value == null) { return; }
        var key = String(item.name || item.label || item.group || '');

        if (key.indexOf('广西') >= 0) { result.guangxi = value; }
        else if (key.indexOf('河北') >= 0) { result.hebei = value; }
        else if (key.indexOf('全') >= 0 || index === 0) { result.overall = value; }
      });
    } else if (src && typeof src === 'object') {
      result.overall = pickNumber(
        src.overall, src.all, src.total, src.sample, src.totalUnknown, result.overall);
      result.guangxi = pickNumber(src.guangxi, src.gx, src.guangxiUnknown, result.guangxi);
      result.hebei = pickNumber(src.hebei, src.hb, src.hebeiUnknown, result.hebei);
    }

    return result;
  }

  /* ------------------------------------------------------------------ *
   * DOM helpers
   * ------------------------------------------------------------------ */

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (html != null) { node.innerHTML = html; }
    return node;
  }

  function showPlaceholder(container, message, hint) {
    var box = container.querySelector('.chart-placeholder');
    if (box) { return; }
    box = el('div', 'chart-placeholder',
      '<span class="placeholder-mark">✦</span><span>' + message + '</span>' +
      (hint ? '<span class="placeholder-hint">' + hint + '</span>' : ''));
    container.appendChild(box);
  }

  /* ------------------------------------------------------------------ *
   * Screen skeleton: title area + metric cards + chart grid
   * ------------------------------------------------------------------ */

  function buildTitleArea(summary) {
    var head = el('div', 'screen-head');
    head.appendChild(el('h2', 'screen-title', '桂冀土专家调研数据洞察'));
    head.appendChild(el('p', 'screen-subtitle', '广西·河北两地对比分析'));
    head.appendChild(el('div', 'screen-divider'));
    return head;
  }

  function buildMetricCards(summary) {
    var defs = [
      { label: '调研总量', value: summary.total, unit: '份', accent: 'var(--accent-cyan)' },
      { label: '广西样本', value: summary.guangxi, unit: '份', accent: 'var(--accent-red)' },
      { label: '河北样本', value: summary.hebei, unit: '份', accent: 'var(--accent-red)' },
      { label: '分析维度', value: summary.dimensions, unit: '个', accent: 'var(--accent-yellow)' }
    ];

    var grid = el('div', 'metric-grid');

    defs.forEach(function (def) {
      var card = el('div', 'metric-card');
      card.style.setProperty('--accent', def.accent);

      card.appendChild(el('span', 'metric-label', def.label));

      var row = el('div', 'metric-value-row');
      var value = el('span', 'metric-value', '0');
      value.setAttribute('data-count-target', String(def.value));
      row.appendChild(value);
      row.appendChild(el('span', 'metric-unit', def.unit));

      card.appendChild(row);
      grid.appendChild(card);
    });

    return grid;
  }

  function buildChartGrid() {
    var grid = el('div', 'chart-grid');

    CHART_DEFS.forEach(function (def) {
      var card = el('div', 'chart-card' + (def.span ? ' span-' + def.span : ''));

      var head = el('div', 'chart-card-head');
      head.appendChild(el('h3', 'chart-card-title', def.title));
      head.appendChild(el('span', 'chart-card-tag', def.ready ? def.tag : '即将上线'));
      card.appendChild(head);

      var box = el('div', 'chart-box');
      box.id = def.id;
      card.appendChild(box);

      if (!def.ready) {
        showPlaceholder(box, '即将上线', def.tag + ' 图表建设中');
      }

      grid.appendChild(card);
    });

    return grid;
  }

  function buildShell() {
    var root = document.getElementById('dashboard-screen');
    if (!root) { return null; }
    root.innerHTML = '';

    var summary = readSummary();
    root.appendChild(buildTitleArea(summary));
    root.appendChild(buildMetricCards(summary));
    root.appendChild(buildChartGrid());
    return root;
  }

  /* ------------------------------------------------------------------ *
   * Metric number rolling animation (0 -> target within 2s)
   * ------------------------------------------------------------------ */

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCount(node, target, duration) {
    var start = null;

    function step(timestamp) {
      if (start === null) { start = timestamp; }
      var progress = Math.min((timestamp - start) / duration, 1);
      node.textContent = String(Math.round(target * easeOutCubic(progress)));
      if (progress < 1) { global.requestAnimationFrame(step); }
    }

    global.requestAnimationFrame(step);
  }

  function startCounters() {
    var nodes = document.querySelectorAll('.metric-value[data-count-target]');
    Array.prototype.forEach.call(nodes, function (node) {
      var target = Number(node.getAttribute('data-count-target')) || 0;
      animateCount(node, target, COUNT_DURATION);
    });
  }

  /* ------------------------------------------------------------------ *
   * Chart 1: chart-map - China map with Guangxi / Hebei highlighted
   * ------------------------------------------------------------------ */

  function buildMapOption(summary) {
    var gx = summary.guangxi;
    var hb = summary.hebei;

    // The DataV GeoJSON uses full province names; keep short aliases too.
    var regions = [];
    ['广西', '广西壮族自治区'].forEach(function (name) {
      regions.push({
        name: name,
        itemStyle: {
          areaColor: COLORS.highlight,
          borderColor: '#ff8a9c',
          borderWidth: 1,
          shadowColor: 'rgba(233,69,96,0.85)',
          shadowBlur: 16
        },
        label: { show: false }
      });
    });
    ['河北', '河北省'].forEach(function (name) {
      regions.push({
        name: name,
        itemStyle: {
          areaColor: COLORS.highlight,
          borderColor: '#ff8a9c',
          borderWidth: 1,
          shadowColor: 'rgba(233,69,96,0.85)',
          shadowBlur: 16
        },
        label: { show: false }
      });
    });

    function rippleSeries(name, coord, count, color, labelOffset) {
      return {
        name: name + '调研样本',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        data: [{ name: name, value: coord.concat(count) }],
        symbolSize: 12,
        showEffectOn: 'render',
        rippleEffect: { brushType: 'stroke', scale: 3.4, period: 4 },
        itemStyle: { color: color, shadowBlur: 14, shadowColor: color },
        label: {
          show: true,
          position: 'top',
          offset: labelOffset,
          distance: 10,
          formatter: name + ' ' + count + '份',
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          padding: [4, 8],
          borderRadius: 4,
          backgroundColor: 'rgba(233,69,96,0.88)',
          borderColor: 'rgba(255,255,255,0.25)',
          borderWidth: 1
        },
        tooltip: { formatter: name + '：' + count + '份调研样本' },
        z: 12
      };
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 }
      },
      geo: {
        map: 'china',
        roam: true,
        zoom: 1.15,
        center: [107, 34.5],
        silent: false,
        itemStyle: {
          areaColor: '#1c1c30',                    // other provinces: grey
          borderColor: '#3a3a5c',
          borderWidth: 0.6
        },
        emphasis: {
          itemStyle: { areaColor: '#2b2b47' },
          label: { show: true, color: COLORS.text, fontSize: 11 }
        },
        select: { disabled: true },
        label: { show: false },
        regions: regions
      },
      series: [
        rippleSeries('广西', PROVINCE_POINTS[0].coord, gx, PROVINCE_POINTS[0].color, [0, 2]),
        rippleSeries('河北', PROVINCE_POINTS[1].coord, hb, PROVINCE_POINTS[1].color, [0, 2])
      ]
    };
  }

  function renderMap(summary) {
    var container = document.getElementById('chart-map');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-map'] = chart;
    chart.showLoading({
      text: '地图数据加载中…',
      color: COLORS.guangxi,
      textColor: COLORS.dimText,
      maskColor: 'rgba(10,10,20,0.4)',
      fontSize: 12
    });

    fetch(MAP_GEOJSON_URL)
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (geoJson) {
        global.echarts.registerMap('china', geoJson);
        chart.hideLoading();
        chart.setOption(buildMapOption(summary));
      })
      .catch(function (err) {
        chart.hideLoading();
        chart.dispose();
        delete charts['chart-map'];
        console.warn('[dashboard] China GeoJSON failed to load:', err);
        showPlaceholder(container, '地图数据加载失败',
          '请通过本地 HTTP 服务打开页面后重试（file:// 协议无法跨域请求 GeoJSON）');
      });
  }

  /* ------------------------------------------------------------------ *
   * Chart 2: chart-dimension - 12-dimension grouped horizontal bars
   * ------------------------------------------------------------------ */

  function buildDimensionOption(dims) {
    // Significant dimensions get a ★ suffix.
    var names = dims.map(function (d) {
      return d.significant ? d.name + '★' : d.name;
    });

    function barSeries(name, key, color) {
      return {
        name: name,
        type: 'bar',
        barMaxWidth: 9,
        barGap: '25%',
        itemStyle: { color: color, borderRadius: [0, 3, 3, 0] },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: color } },
        label: {
          show: true,
          position: 'right',
          distance: 6,
          color: color,
          fontSize: 10,
          formatter: '{c}'
        },
        data: dims.map(function (d) { return d[key]; })
      };
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 44, top: 34, bottom: 6, containLabel: true },
      legend: {
        data: ['广西', '河北'],
        top: 4,
        right: 4,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: COLORS.dimText, fontSize: 11 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.05)' } },
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (params) {
          if (!params || !params.length) { return ''; }
          var index = params[0].dataIndex;
          var d = dims[index] || {};
          var lines = ['<b>' + d.name + (d.significant ? ' ★' : '') + '</b>'];
          params.forEach(function (p) {
            lines.push(p.marker + p.seriesName + '：<b>' + p.value + '</b>');
          });
          if (d.guangxi != null && d.hebei != null) {
            var diff = d.hebei - d.guangxi;
            lines.push('差值（冀-桂）：' + (diff > 0 ? '+' : '') + diff);
          }
          if (d.significant) { lines.push('<span style="color:#ffd93d">★ 两地差异显著</span>'); }
          if (d.detail) { lines.push('<span style="color:#8888a0">' + d.detail + '</span>'); }
          return lines.join('<br/>');
        }
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.dimText, fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
      },
      yAxis: {
        type: 'category',
        data: names,
        inverse: true,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisTick: { show: false },
        axisLabel: {
          color: COLORS.text,
          fontSize: 11,
          align: 'left',
          margin: 10,
          width: 96,
          overflow: 'break'
        }
      },
      series: [
        barSeries('广西', 'guangxi', COLORS.guangxi),
        barSeries('河北', 'hebei', COLORS.hebei)
      ]
    };
  }

  function renderDimension(dims) {
    var container = document.getElementById('chart-dimension');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-dimension'] = chart;
    chart.setOption(buildDimensionOption(dims));
  }

  /* ------------------------------------------------------------------ *
   * Chart 3: chart-funnel - three technology-chain funnels side by side
   * ------------------------------------------------------------------ */

  /** Inside label: stage name + its percentage value. */
  function funnelLabel(p) {
    return p.name + ' ' + round1(p.value) + '%';
  }

  function buildFunnelOption(chains) {
    var grids = [];
    var titles = [];
    var graphics = [];
    var series = [];

    chains.forEach(function (chain) {
      var layers = chain.layers;

      // Percentage grid column for this funnel: x = 10% / 40% / 70%, width 25%
      grids.push({
        left: chain.left,
        width: chain.width,
        top: 46,
        bottom: 64,
        borderWidth: 0
      });

      // Caption above the funnel (title handles left + textAlign reliably)
      titles.push({
        text: chain.title,
        left: chain.center,
        top: 6,
        textAlign: 'center',
        textStyle: { color: COLORS.text, fontSize: 12, fontWeight: 600 }
      });

      // Loss rate below the funnel. The graphic element is anchored to the left
      // edge of the funnel column, so it lines up with the funnel in every column.
      graphics.push({
        type: 'text',
        left: chain.left,
        bottom: 12,
        silent: true,
        style: {
          text: chain.lossText,
          textAlign: 'left',
          fill: FUNNEL_PALETTE.from,
          fontSize: 12,
          fontWeight: 600
        }
      });

      // Colour ramp follows the layer order (largest -> smallest) so the smallest
      // layer always gets the deepest red, whatever order the data arrives in.
      var ranked = layers.map(function (layer, index) {
        return { index: index, value: layer.value };
      }).sort(function (a, b) { return b.value - a.value; });

      var colorByIndex = {};
      ranked.forEach(function (item, rank) {
        colorByIndex[item.index] = layerColor(rank, layers.length);
      });
      var minValue = ranked.length ? ranked[ranked.length - 1].value : 0;

      series.push({
        name: chain.title,
        type: 'funnel',
        left: chain.left,
        width: chain.width,
        top: 46,
        bottom: 64,
        min: 0,
        max: FUNNEL_MAX,
        minSize: '26%',
        maxSize: '100%',
        // ECharts draws funnel layers top-down, so 'descending' keeps the widest
        // (largest) layer on top - the standard funnel shape.
        sort: 'descending',
        gap: 3,
        funnelAlign: 'center',
        label: {
          show: true,
          position: 'inside',
          color: '#ffffff',
          fontSize: 10,
          formatter: funnelLabel
        },
        labelLine: { show: false },
        itemStyle: { borderColor: 'rgba(10,10,20,0.65)', borderWidth: 1 },
        emphasis: { label: { fontSize: 11, fontWeight: 700 } },
        data: layers.map(function (layer, index) {
          return {
            name: layer.name,
            value: layer.value,
            isBreakPoint: layer.value === minValue,
            itemStyle: { color: colorByIndex[index] }
          };
        })
      });
    });

    return {
      backgroundColor: 'transparent',
      // Multi-column percentage grid backing the three funnels
      grid: grids,
      title: titles,
      graphic: graphics,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (p) {
          var lines = [
            '<b>' + p.seriesName + '</b>',
            p.name + '：<b>' + round1(p.value) + '%</b>'
          ];
          if (p.data && p.data.isBreakPoint) {
            lines.push('<span style="color:#ff8a80">该链条的最小层（断点）</span>');
          }
          return lines.join('<br/>');
        }
      },
      series: series
    };
  }

  function renderFunnel(chains) {
    var container = document.getElementById('chart-funnel');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-funnel'] = chart;
    chart.setOption(buildFunnelOption(chains));
  }

  /* ------------------------------------------------------------------ *
   * Chart 4: chart-gap - training supply/demand dumbbell chart
   * ------------------------------------------------------------------ */

  function buildGapOption(items) {
    var names = items.map(function (d) { return d.name; });
    var axisMin = GAP_AXIS.min;
    var axisMax = GAP_AXIS.max;

    // One custom row per training topic: [categoryIndex, supply, demand, gap]
    var data = items.map(function (d, index) {
      return [index, d.supply, d.demand, d.gap];
    });

    /**
     * Lollipop renderer: connector line + two dots + both values + the gap value.
     * A custom series is used instead of stacked bars because the value axis does
     * not start at zero (2.0 - 4.0), so stacked bars would misplace the connector.
     */
    function renderItem(params, api) {
      var index = api.value(0);
      var supply = api.value(1);
      var demand = api.value(2);
      var gap = api.value(3);

      var supplyPoint = api.coord([supply, index]);
      var demandPoint = api.coord([demand, index]);
      var gapPoint = api.coord([axisMax, index]);

      // Row band, used for an invisible hit area across the whole row.
      var rowLeft = api.coord([axisMin, index]);
      var rowRight = api.coord([axisMax, index]);
      var bandHeight = api.size([0, 1])[1] || 0;

      // gap > 0 -> red connector, gap < 0 -> cyan connector
      var linkColor = gap > 0 ? COLORS.hebei : (gap < 0 ? COLORS.guangxi : COLORS.dimText);
      var dotRadius = 6;

      return {
        type: 'group',
        children: [
          {
            // invisible hit area: the tooltip reacts anywhere on the row
            type: 'rect',
            shape: {
              x: rowLeft[0],
              y: supplyPoint[1] - bandHeight / 2,
              width: rowRight[0] - rowLeft[0],
              height: bandHeight
            },
            style: { fill: 'transparent' }
          },
          {
            // connector between the supply dot and the demand dot
            type: 'line',
            shape: {
              x1: supplyPoint[0], y1: supplyPoint[1],
              x2: demandPoint[0], y2: demandPoint[1]
            },
            style: { stroke: linkColor, lineWidth: 5, lineCap: 'round', opacity: 0.9 }
          },
          {
            // supply dot, left end (cyan)
            type: 'circle',
            shape: { cx: supplyPoint[0], cy: supplyPoint[1], r: dotRadius },
            style: { fill: COLORS.guangxi, stroke: 'rgba(10,10,20,0.9)', lineWidth: 1.5 }
          },
          {
            // demand dot, right end (red)
            type: 'circle',
            shape: { cx: demandPoint[0], cy: demandPoint[1], r: dotRadius },
            style: { fill: COLORS.hebei, stroke: 'rgba(10,10,20,0.9)', lineWidth: 1.5 }
          },
          {
            // supply value, one decimal
            type: 'text',
            x: supplyPoint[0] - dotRadius - 4,
            y: supplyPoint[1],
            style: {
              text: round1(supply).toFixed(1),
              textAlign: 'right',
              textVerticalAlign: 'middle',
              fill: COLORS.guangxi,
              fontSize: 10
            }
          },
          {
            // demand value, one decimal
            type: 'text',
            x: demandPoint[0] + dotRadius + 4,
            y: demandPoint[1],
            style: {
              text: round1(demand).toFixed(1),
              textAlign: 'left',
              textVerticalAlign: 'middle',
              fill: COLORS.hebei,
              fontSize: 10
            }
          },
          {
            // gap value at the right edge of the axis
            type: 'text',
            x: gapPoint[0] + 10,
            y: gapPoint[1],
            style: {
              text: (gap > 0 ? '+' : '') + round1(gap).toFixed(1),
              textAlign: 'left',
              textVerticalAlign: 'middle',
              fill: linkColor,
              fontSize: 10,
              fontWeight: 600
            }
          }
        ]
      };
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 84, top: 26, bottom: 44, containLabel: true },
      legend: {
        data: ['供给均值', '需求均值'],
        top: 0,
        right: 4,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: COLORS.dimText, fontSize: 11 }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (params) {
          if (!params || !params.length) { return ''; }
          var d = items[params[0].dataIndex];
          if (!d) { return ''; }
          var direction = d.gap > 0 ? '需求大于供给' : (d.gap < 0 ? '供给大于需求' : '供需平衡');
          return '<b>' + d.name + '</b><br/>' +
            '需求均值：<span style="color:' + COLORS.hebei + '">' + round1(d.demand).toFixed(1) + '</span><br/>' +
            '供给均值：<span style="color:' + COLORS.guangxi + '">' + round1(d.supply).toFixed(1) + '</span><br/>' +
            '缺口：<b>' + (d.gap > 0 ? '+' : '') + round1(d.gap).toFixed(1) + '</b>（' + direction + '）';
        }
      },
      xAxis: {
        type: 'value',
        min: axisMin,
        max: axisMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: COLORS.dimText,
          fontSize: 10,
          formatter: function (value) { return Number(value).toFixed(1); }
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      yAxis: {
        type: 'category',
        data: names,
        inverse: true,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisTick: { show: false },
        axisLabel: {
          color: COLORS.text,
          fontSize: 11,
          align: 'left',
          margin: 10
        }
      },
      graphic: [{
        type: 'text',
        left: 'center',
        bottom: 6,
        silent: true,
        style: {
          text: '缺口=需求均值-供给均值，正值表示需求大于供给',
          fill: COLORS.dimText,
          fontSize: 11
        }
      }],
      series: [
        // The two empty scatter series only exist to produce the legend entries.
        {
          name: '供给均值',
          type: 'scatter',
          symbolSize: 9,
          itemStyle: { color: COLORS.guangxi },
          data: []
        },
        {
          name: '需求均值',
          type: 'scatter',
          symbolSize: 9,
          itemStyle: { color: COLORS.hebei },
          data: []
        },
        {
          name: '培训供需配对',
          type: 'custom',
          coordinateSystem: 'cartesian2d',
          renderItem: renderItem,
          encode: { x: [1, 2], y: 0 },
          data: data,
          z: 10
        }
      ]
    };
  }

  function renderTrainingGap(items) {
    var container = document.getElementById('chart-gap');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-gap'] = chart;
    chart.setOption(buildGapOption(items));
  }

  /* ------------------------------------------------------------------ *
   * Chart 5: chart-cluster - four-quadrant crowd segmentation scatter
   * ------------------------------------------------------------------ */

  function buildClusterOption(cluster) {
    var types = cluster.types;
    var axes = CLUSTER_AXES;
    var total = cluster.total || 1;

    // Quadrant corner captions drawn with graphic elements. Every label gets an
    // explicit `width` box, so textAlign aligns the text inside that box reliably.
    var cornerSpecs = [
      { key: 'topRight',    left: '52%', width: '44%', top: 34,    align: 'right' },
      { key: 'topLeft',     left: '4%',  width: '44%', top: 34,    align: 'left' },
      { key: 'bottomRight', left: '52%', width: '44%', bottom: 96, align: 'right' },
      { key: 'bottomLeft',  left: '4%',  width: '44%', bottom: 96, align: 'left' }
    ];

    var quadrantGraphics = cornerSpecs.map(function (spec) {
      var item = {
        type: 'text',
        left: spec.left,
        width: spec.width,
        z: 3,
        silent: true,
        style: {
          text: CLUSTER_QUADRANTS[spec.key].label,
          textAlign: spec.align,
          fill: '#666666',
          fontSize: 10
        }
      };
      if (spec.top != null) { item.top = spec.top; }
      if (spec.bottom != null) { item.bottom = spec.bottom; }
      return item;
    });

    var graphics = quadrantGraphics.concat([{
      // Bottom note
      type: 'text',
      left: 'center',
      bottom: 4,
      silent: true,
      style: { text: CLUSTER_NOTE, fill: '#888888', fontSize: 10 }
    }]);

    var series = types.map(function (t, index) {
      var s = {
        name: t.name,
        type: 'scatter',
        symbolSize: t.symbolSize || (index === 0 ? 8 : 7),
        z: 5,
        itemStyle: { color: t.color, opacity: 0.7 },
        emphasis: { scale: 1.4, itemStyle: { opacity: 1, shadowBlur: 10, shadowColor: t.color } },
        data: t.points
      };

      if (index === 0) {
        // Quadrant split lines: vertical x = 3.5 and horizontal y = 3.0
        s.markLine = {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#555555', type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ xAxis: axes.xSplit }, { yAxis: axes.ySplit }]
        };
      }

      return s;
    });

    return {
      backgroundColor: 'transparent',
      grid: { left: 46, right: 24, top: 30, bottom: 62, containLabel: false },
      graphic: graphics,
      // Legend in the bottom-right corner, with the share of classified samples
      legend: {
        orient: 'vertical',
        right: 8,
        bottom: 26,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 6,
        textStyle: { color: COLORS.dimText, fontSize: 10 },
        data: types.map(function (t) { return t.name; }),
        formatter: function (name) {
          var found = null;
          types.forEach(function (t) { if (t.name === name) { found = t; } });
          if (!found) { return name; }
          var count = found.count || found.points.length;
          return name + ' ' + count + '人 ' + Math.round(count / total * 100) + '%';
        }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (p) {
          if (!p.value || !p.value.length) { return ''; }
          return '<b>' + p.seriesName + '</b><br/>' +
            axes.xName + '：' + p.value[0] + '<br/>' +
            axes.yName + '：' + p.value[1];
        }
      },
      xAxis: {
        type: 'value',
        min: axes.min,
        max: axes.max,
        name: axes.xName,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: COLORS.dimText, fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisTick: { show: false },
        axisLabel: { color: COLORS.dimText, fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.045)' } }
      },
      yAxis: {
        type: 'value',
        min: axes.min,
        max: axes.max,
        name: axes.yName,
        nameLocation: 'middle',
        nameGap: 36,
        nameTextStyle: { color: COLORS.dimText, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.dimText, fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.045)' } }
      },
      series: series
    };
  }

  function renderCluster(cluster) {
    var container = document.getElementById('chart-cluster');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-cluster'] = chart;
    chart.setOption(buildClusterOption(cluster));
  }

  /* ------------------------------------------------------------------ *
   * Chart 6: chart-mechanism - stacked ΔR² layers + key factor
   * ------------------------------------------------------------------ */

  function buildMechanismOption(mechanism) {
    var layers = mechanism.layers;
    var factor = mechanism.factor;
    var total = layers.reduce(function (sum, l) { return sum + l.value; }, 0) || 1;

    // Locate the internal-capability block (significant) and the macro block (n.s.).
    var highlight = null;
    var macro = null;

    layers.forEach(function (layer) {
      var n = String(layer.name);
      if (!highlight && (n.indexOf('内生') >= 0 || n.indexOf('微观') >= 0)) { highlight = layer; }
      if (!macro && (n.indexOf('宏观') >= 0 || n.indexOf('政策') >= 0)) { macro = layer; }
    });

    var cumulative = 0;
    var highlightCenter = null;
    var macroCenter = null;

    layers.forEach(function (layer) {
      if (layer === highlight) { highlightCenter = cumulative + layer.value / 2; }
      if (layer === macro) { macroCenter = cumulative + layer.value / 2; }
      cumulative += layer.value;
    });

    // Approximate container percentage of a 0-1 position on the value axis
    // (the grid leaves roughly 5% on each side).
    function dataPct(value) {
      return 5 + value * 90;
    }

    var series = layers.map(function (layer, index) {
      var color = mechanismColor(layer.name, index);
      var isSmall = layer.value < 0.05;   // tiny steps get their label outside

      return {
        name: layer.name,
        type: 'bar',
        stack: 'delta-r2',
        barWidth: 38,
        itemStyle: { color: color, borderColor: 'rgba(10,10,20,0.7)', borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: color } },
        label: {
          show: true,
          position: isSmall ? 'right' : 'inside',
          distance: isSmall ? 4 : 0,
          // Stagger the two tiny steps vertically so their labels never overlap.
          offset: isSmall ? [4, index % 2 === 0 ? -16 : 16] : [0, 0],
          color: isSmall ? color : '#ffffff',
          fontSize: 10,
          fontWeight: 600,
          formatter: layer.value.toFixed(3)
        },
        data: [layer.value]
      };
    });

    var graphic = [];

    // ---- Emphasis label for the internal-capability block ----
    if (highlightCenter != null) {
      graphic.push({
        type: 'text',
        left: round1(dataPct(highlightCenter) - 22) + '%',
        width: '44%',
        top: 60,
        silent: true,
        style: {
          text: 'ΔR²=' + highlight.value.toFixed(3) + '***',
          textAlign: 'center',
          fill: COLORS.hebei,
          fontSize: 10,
          fontWeight: 700
        }
      });
    }

    // ---- Emphasis label for the macro-policy block ----
    if (macroCenter != null) {
      graphic.push({
        type: 'text',
        left: '60%',
        width: '38%',
        top: 132,
        silent: true,
        style: {
          text: 'ΔR²=' + macro.value.toFixed(3) + ' n.s.',
          textAlign: 'right',
          fill: '#888888',
          fontSize: 10
        }
      });
    }

    // ---- Key-factor card, bottom 40% of the container ----
    graphic.push(
      {
        type: 'rect',
        left: '4%',
        top: 204,
        width: '92%',
        height: 108,
        z: 1,
        silent: true,
        shape: { r: 8 },
        style: { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.12)', lineWidth: 1 }
      },
      {
        type: 'text',
        left: 'center',
        top: 218,
        silent: true,
        style: { text: factor.label, fill: COLORS.text, fontSize: 16 }
      },
      {
        type: 'text',
        left: 'center',
        top: 244,
        silent: true,
        style: { text: factor.betaText, fill: COLORS.hebei, fontSize: 24, fontWeight: 700 }
      },
      {
        type: 'text',
        left: 'center',
        top: 284,
        silent: true,
        style: { text: factor.note, fill: '#888888', fontSize: 11 }
      }
    );

    return {
      backgroundColor: 'transparent',
      grid: { left: 26, right: 26, top: 34, bottom: 146, containLabel: false },
      legend: {
        top: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 10,
        textStyle: { color: COLORS.dimText, fontSize: 10 },
        formatter: function (name) {
          var found = null;
          layers.forEach(function (l) { if (l.name === name) { found = l; } });
          return found ? name + ' ' + found.value.toFixed(3) : name;
        }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (p) {
          return '<b>' + p.seriesName + '</b><br/>' +
            'ΔR² = ' + Number(p.value).toFixed(3) + '<br/>' +
            '占累计R² ' + round1(Number(p.value) / total * 100) + '%';
        }
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        name: '累计R²',
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: COLORS.dimText, fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisTick: { show: false },
        axisLabel: {
          color: COLORS.dimText,
          fontSize: 10,
          formatter: function (value) { return Number(value).toFixed(1); }
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      yAxis: {
        type: 'category',
        data: [''],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false }
      },
      graphic: graphic,
      series: series
    };
  }

  function renderMechanism(mechanism) {
    var container = document.getElementById('chart-mechanism');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-mechanism'] = chart;
    chart.setOption(buildMechanismOption(mechanism));
  }

  /* ------------------------------------------------------------------ *
   * Chart 7: chart-wordcloud - dual word cloud, Guangxi vs Hebei
   * ------------------------------------------------------------------ */

  /**
   * One half of the dual word cloud. Both halves live in a single ECharts
   * instance laid out as two 50% columns, so the divider line, the two captions
   * and the footnote all share one coordinate system.
   */
  function wordCloudSeries(name, words, range, position) {
    var count = words.length;
    var data = words.map(function (word, index) {
      // Colour is interpolated across the range by word position.
      var t = count > 1 ? index / (count - 1) : 0;
      return {
        name: word.name,
        value: word.value,
        textStyle: { color: mixHex(range.from, range.to, t) }
      };
    });

    var series = {
      name: name,
      type: 'wordCloud',
      top: 44,
      bottom: 34,
      width: '49%',
      shape: 'circle',
      sizeRange: [12, 36],
      rotationRange: [0, 0],          // keep Chinese words horizontal
      rotationStep: 0,
      gridSize: 8,
      drawOutOfBound: false,
      shrinkToFit: true,
      textStyle: { fontFamily: WORDCLOUD_FONT, fontWeight: 600 },
      emphasis: { textStyle: { fontWeight: 700 } },
      data: data
    };

    if (position.right) { series.right = position.right; } else { series.left = position.left; }
    return series;
  }

  function buildWordCloudOption(words) {
    var pairs = words || {};
    var guangxi = normalizeWords(pairs.guangxi, FALLBACK_WORDCLOUD.guangxi);
    var hebei = normalizeWords(pairs.hebei, FALLBACK_WORDCLOUD.hebei);

    return {
      backgroundColor: 'transparent',
      title: [
        {
          text: '广西',
          left: '25%',
          top: 6,
          textAlign: 'center',
          textStyle: { color: WORDCLOUD_RANGES.guangxi.from, fontSize: 12, fontWeight: 600 }
        },
        {
          text: '河北',
          left: '75%',
          top: 6,
          textAlign: 'center',
          textStyle: { color: WORDCLOUD_RANGES.hebei.from, fontSize: 12, fontWeight: 600 }
        }
      ],
      graphic: [
        {
          // Vertical divider in the middle
          type: 'line',
          left: 'center',
          top: 34,
          silent: true,
          shape: { x1: 0, y1: 0, x2: 0, y2: 236 },
          style: { stroke: 'rgba(255,255,255,0.12)', lineWidth: 1, lineDash: [4, 4] }
        },
        {
          // Bottom note
          type: 'text',
          left: 'center',
          bottom: 8,
          silent: true,
          style: { text: WORDCLOUD_NOTE, textAlign: 'center', fill: '#888888', fontSize: 10 }
        }
      ],
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (p) {
          return '<b>' + p.name + '</b><br/>' + p.seriesName + '词频权重：' + p.value;
        }
      },
      series: [
        wordCloudSeries('广西', guangxi, WORDCLOUD_RANGES.guangxi, { left: '1%' }),
        wordCloudSeries('河北', hebei, WORDCLOUD_RANGES.hebei, { right: '1%' })
      ]
    };
  }

  function renderWordcloud(words) {
    var container = document.getElementById('chart-wordcloud');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-wordcloud'] = chart;
    chart.setOption(buildWordCloudOption(words));
  }

  /* ------------------------------------------------------------------ *
   * Chart 8: chart-topic - difficulty topics treemap
   * ------------------------------------------------------------------ */

  function buildTopicOption(topics) {
    var maxValue = 1;
    var total = 0;

    topics.forEach(function (t) {
      maxValue = Math.max(maxValue, t.value);
      total += t.value;
    });
    total = total || 1;

    // Label sizes: three steps keyed off the value (a proxy for the tile size),
    // each with a bold variant used by the top three topics.
    var steps = [
      { key: 'l', min: 35, name: 15, num: 13 },
      { key: 'm', min: 18, name: 13, num: 11 },
      { key: 's', min: 0,  name: 11, num: 10 }
    ];
    var rich = {};

    steps.forEach(function (step) {
      ['', 'b'].forEach(function (suffix) {
        var weight = suffix ? 'bold' : 'normal';
        rich[step.key + suffix] = {
          fontSize: step.name, color: '#ffffff', fontWeight: weight,
          align: 'center', lineHeight: step.name + 4
        };
        rich[step.key + suffix + 'n'] = {
          fontSize: step.num, color: 'rgba(255,255,255,0.92)', fontWeight: weight,
          align: 'center', lineHeight: step.num + 3
        };
      });
    });

    function styleKey(value, bold) {
      var step = steps[steps.length - 1];
      for (var i = 0; i < steps.length; i++) {
        if (value >= steps[i].min) { step = steps[i]; break; }
      }
      return step.key + (bold ? 'b' : '');
    }

    // The three most mentioned difficulties get bold labels.
    var thresholds = topics.map(function (t) { return t.value; })
      .sort(function (a, b) { return b - a; });
    var boldFrom = thresholds.length >= 3 ? thresholds[2] : thresholds[thresholds.length - 1];

    var data = topics.map(function (t) {
      return {
        name: t.name,
        value: t.value,
        percent: round1(t.value / total * 100),
        itemStyle: {
          // Bigger value -> deeper red
          color: mixHex(TOPIC_PALETTE.light, TOPIC_PALETTE.deep, t.value / maxValue)
        }
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (p) {
          var pct = (p.data && p.data.percent != null) ? p.data.percent : round1(p.value / total * 100);
          return '<b>' + p.name + '</b><br/>提及率：' + p.value + '%' +
            '<br/>占困难提及总量：' + pct + '%';
        }
      },
      series: [{
        name: '主要困难',
        type: 'treemap',
        left: 4,
        right: 4,
        top: 6,
        bottom: 6,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        itemStyle: { borderColor: '#0a0a14', borderWidth: 1, gapWidth: 1 },
        label: {
          show: true,
          position: 'inside',
          color: '#ffffff',
          align: 'center',
          formatter: function (p) {
            // Tile label: difficulty name + its mention rate (the value itself).
            var key = styleKey(p.value, p.value >= boldFrom);
            return '{' + key + '|' + p.name + '}\n{' + key + 'n|' + p.value + '%}';
          },
          rich: rich
        },
        upperLabel: { show: false },
        emphasis: { itemStyle: { borderColor: '#ffd93d' } },
        data: data
      }]
    };
  }

  function renderDifficultyTopic(topics) {
    var container = document.getElementById('chart-topic');
    if (!container) { return; }

    var chart = global.echarts.init(container);
    charts['chart-topic'] = chart;
    chart.setOption(buildTopicOption(topics));
  }

  /* ------------------------------------------------------------------ *
   * Chart 9: chart-policy - three policy-awareness donuts
   * ------------------------------------------------------------------ */

  /** One policy donut, rendered into its own third of the container. */
  function buildPolicyDonutOption(item) {
    // Clamp to a sane percentage range before splitting known / unknown.
    var unknown = Math.max(0, Math.min(100, Number(item.value) || 0));
    var known = round1(100 - unknown);

    return {
      backgroundColor: 'transparent',
      title: {
        text: item.title,
        top: 4,
        left: 'center',
        textStyle: { color: COLORS.text, fontSize: 12, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20,20,37,0.95)',
        borderColor: '#2a2a45',
        borderWidth: 1,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: function (p) {
          return '<b>' + item.title + '</b><br/>' + p.name + '：' + round1(p.value) + '%';
        }
      },
      graphic: [
        {
          // Big percentage in the middle of the ring
          type: 'text',
          left: 'center',
          top: 'middle',
          silent: true,
          style: {
            text: round1(unknown) + '%',
            textAlign: 'center',
            fill: POLICY_COLORS.unknown,
            fontSize: 20,
            fontWeight: 700
          }
        },
        {
          // Caption under the ring
          type: 'text',
          left: 'center',
          bottom: 8,
          silent: true,
          style: { text: '不了解人才政策', textAlign: 'center', fill: '#888888', fontSize: 10 }
        }
      ],
      series: [{
        name: item.title,
        type: 'pie',
        center: ['50%', '50%'],
        radius: ['45%', '70%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: false, itemStyle: { shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.55)' } },
        data: [
          { value: unknown, name: '不了解', itemStyle: { color: POLICY_COLORS.unknown } },
          { value: known, name: '了解', itemStyle: { color: POLICY_COLORS.known } }
        ]
      }]
    };
  }

  /**
   * Three independent ECharts instances side by side, each one third of the
   * container wide. The sub-divs are created here so the shared card markup
   * stays untouched.
   */
  function renderPolicyAwareness(policy) {
    var container = document.getElementById('chart-policy');
    if (!container) { return; }

    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.width = '100%';
    container.style.height = '100%';

    var items = [
      { title: '全样本', value: policy.overall },
      { title: '广西', value: policy.guangxi },
      { title: '河北', value: policy.hebei }
    ];

    items.forEach(function (item, index) {
      var cell = document.createElement('div');
      cell.style.flex = '1 1 33.333%';
      cell.style.minWidth = '0';
      cell.style.height = '100%';
      container.appendChild(cell);

      var chart = global.echarts.init(cell);
      charts['chart-policy-' + index] = chart;
      chart.setOption(buildPolicyDonutOption(item));
    });
  }

  /* ------------------------------------------------------------------ *
   * Resize handling
   * ------------------------------------------------------------------ */

  var resizeTimer = null;

  function resizeAll() {
    Object.keys(charts).forEach(function (id) {
      var chart = charts[id];
      if (chart && !chart.isDisposed()) { chart.resize(); }
    });
  }

  function onWindowResize() {
    if (resizeTimer) { global.clearTimeout(resizeTimer); }
    resizeTimer = global.setTimeout(resizeAll, 120);
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  function init() {
    if (inited) {
      // Already rendered (e.g. main.js called init twice): just re-measure.
      resizeAll();
      return;
    }
    if (!global.echarts) {
      var root = document.getElementById('dashboard-screen');
      if (root) {
        root.innerHTML = '';
        var warn = el('div', 'card');
        showPlaceholder(warn, 'ECharts 加载失败', '请检查网络后刷新页面（ECharts 由 CDN 提供）');
        warn.querySelector('.chart-placeholder').style.position = 'relative';
        warn.querySelector('.chart-placeholder').style.height = '320px';
        root.appendChild(warn);
      }
      console.warn('[dashboard] ECharts is not available.');
      return;
    }

    var shell = buildShell();
    if (!shell) {
      console.warn('[dashboard] #dashboard-screen mount point not found.');
      return;
    }
    inited = true;

    var summary = readSummary();
    var dims = readDimensions();
    var chains = readFunnelData();
    var trainingGap = readTrainingGap();
    var cluster = readClusterData();
    var mechanism = readMechanismData();
    var words = readWordCloudData();
    var topics = readTopicData();
    var policy = readPolicyData();

    // 1) metric number rolling animation
    startCounters();
    // 2) existing charts
    renderMap(summary);
    renderDimension(dims);
    renderFunnel(chains);
    renderTrainingGap(trainingGap);
    renderCluster(cluster);
    renderMechanism(mechanism);
    // 3) word cloud / difficulty treemap / policy donuts, after the existing charts
    renderWordcloud(words);
    renderDifficultyTopic(topics);
    renderPolicyAwareness(policy);

    global.addEventListener('resize', onWindowResize);
  }

  global.dashboard = {
    init: init,
    resizeAll: resizeAll
  };
})(window);
