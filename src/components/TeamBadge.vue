<!--
  TeamBadge.vue — 队徽组件（Vue 3）
  用法：
    <TeamBadge name="巴西" />
    <FixtureRow home="巴西" away="德国" />
  CSS 见同目录 TeamBadge.css。
-->
<template>
  <img
    v-if="src && !imgFailed"
    class="team-badge__img"
    :src="src"
    :alt="name"
    :width="size"
    :height="size"
    loading="lazy"
    @error="imgFailed = true"
  />
  <span
    v-else
    class="team-badge__avatar"
    :style="{ width: size + 'px', height: size + 'px', fontSize: (size * 0.4) + 'px', background: color }"
  >{{ avatarText || initial }}</span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import './TeamBadge.css';

const props = withDefaults(defineProps<{
  name: string;
  size?: number;
  avatarText?: string;
  alt?: string;
}>(), { size: 40 });

const imgFailed = ref(false);

const NT_FLAG: Record<string, string> = {
  '巴西': 'br', '阿根廷': 'ar', '法国': 'fr', '英格兰': 'gb-eng', '西班牙': 'es', '葡萄牙': 'pt',
  '德国': 'de', '意大利': 'it', '荷兰': 'nl', '比利时': 'be', '克罗地亚': 'hr', '墨西哥': 'mx',
  '乌拉圭': 'uy', '哥伦比亚': 'co', '美国': 'us', '瑞士': 'ch', '日本': 'jp', '摩洛哥': 'ma',
  '丹麦': 'dk', '塞内加尔': 'sn', '塞尔维亚': 'rs', '瑞典': 'se', '波兰': 'pl', '威尔士': 'gb-wls',
  '韩国': 'kr', '土耳其': 'tr', '伊朗': 'ir', '智利': 'cl', '厄瓜多尔': 'ec', '乌克兰': 'ua',
  '尼日利亚': 'ng', '秘鲁': 'pe', '奥地利': 'at', '捷克': 'cz', '巴拉圭': 'py', '喀麦隆': 'cm',
  '埃及': 'eg', '加拿大': 'ca', '突尼斯': 'tn', '阿尔及利亚': 'dz', '科特迪瓦': 'ci', '哥斯达黎加': 'cr',
  '澳大利亚': 'au', '沙特阿拉伯': 'sa', '南非': 'za', '卡塔尔': 'qa', '牙买加': 'jm', '洪都拉斯': 'hn',
};

// 俱乐部 → 在线队徽（football-logos 仓库 png，经 jsDelivr CDN 直链）
const CLUB_LOGO: Record<string, string> = {
  '皇家马德里': 'Spain - LaLiga/Real Madrid.png',
  '巴塞罗那': 'Spain - LaLiga/FC Barcelona.png',
  '拜仁慕尼黑': 'Germany - Bundesliga/Bayern Munich.png',
  '利物浦': 'England - Premier League/Liverpool FC.png',
  '曼城': 'England - Premier League/Manchester City.png',
  '巴黎圣日耳曼': 'France - Ligue 1/Paris Saint-Germain.png',
  '尤文图斯': 'Italy - Serie A/Juventus FC.png',
  'AC米兰': 'Italy - Serie A/AC Milan.png',
  '国际米兰': 'Italy - Serie A/Inter Milan.png',
  '阿森纳': 'England - Premier League/Arsenal FC.png',
};

const FLAG_BASE = 'https://flagcdn.com/';
const CLUB_LOGO_BASE = 'https://cdn.jsdelivr.net/gh/luukhopman/football-logos@master/logos/';

const AVATAR_COLORS = [
  '#0068a8', '#a50044', '#c8102e', '#6cabdd', '#dc052d',
  '#1c2c5b', '#007a5e', '#8a5a00', '#5b2d8e', '#0a7a8a',
];

const initial = computed(() => (props.name || '?').trim().charAt(0).toUpperCase());

const color = computed(() => {
  let h = 0;
  for (let i = 0; i < props.name.length; i++) h = (h * 31 + props.name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
});

const src = computed(() => {
  const clubUrl = CLUB_LOGO[props.name];
  if (clubUrl) return encodeURI(CLUB_LOGO_BASE + clubUrl);
  const iso = NT_FLAG[props.name];
  return iso ? `${FLAG_BASE}${iso}.svg` : '';
});
</script>
