/**
 * STORYTELLER.JS — V2.8 Midnight Radio Host Script Engine
 *
 * Generates 3-part DJ monologues: emotional anchor, hardcore narrative, sonic hook.
 * Designed for ASYNC background generation — never blocks music playback.
 */

// Emotion word bank for scene-setting (expanded, tracked to prevent repeats)
let _lastScene = -1, _lastMood = -1;
const SCENE_WORDS = [
  '潮湿的南方夜晚', '路灯下的人行道', '沙发角落的半杯酒', '雨滴敲打窗台',
  '车窗外的霓虹', '凌晨三点还亮着灯的房间', '耳机里的世界', '凉了的咖啡杯',
  '地铁末班空车厢', '天台的风吹过发梢', '枕边手机屏幕的微光', '窗帘缝隙透进来的月光',
  '深夜便利店的暖光', '老旧公寓的木地板', '下雨天的唱片机旁',
  '凌晨四点突然醒来', '床上翻来覆去的你', '孤独但自在的房间',
  '窗外的城市灯火', '烟雾缭绕的小酒馆', '海边深夜的浪声',
  '阳台上看星星', '刚洗完澡的清爽', '冰箱的嗡鸣声里', '猫蜷在腿边的温度',
  '写完最后一行字的瞬间', '关了所有灯的客厅', '床头那本没读完的书',
  '远处高速公路的车流声', '书桌上的台灯晃了一下', '厨房水龙头滴答的声音',
  '半夜楼下便利店的门铃', '空调出风口的白噪音', '泡面刚刚泡好的三分钟',
  '手机屏幕以外的黑暗', '被子上阳光晒过的味道', '指甲敲桌面等灵感来',
  '忘记关的电脑风扇', '抽屉里那封没寄出的信', '窗外突然下起的阵雨',
  '吃完泡面的夜宵时间', '床上枕头的另一边', '凌晨五点鸟开始叫的时刻',
  '最后一根烟的火光', '玻璃杯里冰块融化的声音', '空调遥控器就在手边',
  '泡面刚吃完的满足感', '窗外偶尔经过的夜车', '枕头凹陷的形状',
  '手机快没电了但不想起身', '冰箱里的布丁还没吃', '风扇转头时停顿的间隙',
  '指甲边缘的小倒刺', '桌角堆了三天没扔的外卖单', '耳机线缠成一团',
  '毯子只盖了一只脚', '喝完最后一口水的杯子', '刚剪完指甲的手指',
  '窗帘被风吹起一小角', '楼下谁家还在放歌', '墙上的钟声有点慢',
  '电脑屏幕调到了最暗', '看到微信但不想回复', '明天的闹钟还没设',
  '枕头上几根落发', '梦做到一半醒来', '窗外雨停了又下',
  '室友/家人已经睡了', '朋友圈刷到尽头', '游戏刚刚关掉的声音',
  '浴室水龙头没关紧', '冰箱突然启动的震动', '电视屏幕早就暗了',
  '猫跳下床的动静', '被子有一半掉地上', '钥匙放哪了记不清',
  '明天是周末还是周一', '好像有点饿但懒得动', '耳机里歌手换气的声音',
  '脚趾头在被子外冰凉', '眼皮开始沉了', '歌词里的那一句刚好戳中你',
];

const TIME_MOODS = {
  late_night: [
    '世界都睡了只有你还醒着', '午夜的思绪最诚实', '连月亮都不说话的时刻',
    '时间像凝固了一样', '黑暗让人觉得安全', '好久没有这么静过了',
    '窗外偶尔有车经过',
  ],
  early_morning: [
    '微光初现的蓝调时刻', '晨雾未散的街道', '第一杯咖啡的热气',
    '城市还未醒的宁静', '新的一天快要开始了',
  ],
  morning: [
    '阳光穿过百叶窗的条纹', '通勤路上的短暂安宁', '忙碌开始前的深呼吸',
    '早晨的第一缕光和你一起醒来',
  ],
  afternoon: [
    '慵懒午后的困意', '窗边发呆的好时光', '茶水渐凉的下半天',
    '午后的时间走得特别慢', '阳光正好适合放空',
  ],
  evening: [
    '下班路上的黄昏', '晚霞消失前的最后一抹光', '切换到属于自己的频道',
    '终于能喘口气了', '一天的疲惫慢慢松开',
  ],
  night: [
    '夜晚刚开始的希望', '街灯亮起的仪式感', '躁动的周末前奏',
    '卸下一天疲惫的时刻', '今晚的你属于自己', '夜色正好不想睡',
  ],
};

/**
 * Build storytelling prompt for background AI generation.
 * @param {string} trackLabel - "Artist - SongName"
 * @param {Object} env - { time, weather, weekday }
 * @returns {string} system prompt for DeepSeek
 */
function pickUnique(arr, lastRef) {
  let idx;
  do { idx = Math.floor(Math.random() * arr.length); } while (idx === lastRef && arr.length > 1);
  lastRef.val = idx;
  return arr[idx];
}
const _sceneRef = { val: -1 }, _moodRef = { val: -1 };

function buildStoryPrompt(trackLabel, env = {}) {
  const hour = env.hour || new Date().getHours();
  const lyricHint = env.lyricSnippet
    ? `\n\n这首歌的几句歌词供你参考，可以在口播中自然引用或呼应其中一两句：\n"${env.lyricSnippet}"`
    : '';
  const timeSlot = hour < 6 ? 'late_night' : hour < 9 ? 'early_morning'
    : hour < 12 ? 'morning' : hour < 14 ? 'afternoon'
    : hour < 17 ? 'afternoon' : hour < 19 ? 'evening' : 'night';

  const scene = pickUnique(SCENE_WORDS, _sceneRef);
  const moods = TIME_MOODS[timeSlot];
  const mood = pickUnique(moods, _moodRef);

  return `你是 Claudio，一个深夜电台 AI DJ。现在正在播放：${trackLabel}。

请用 DJ 口吻，生成一段**150-200 字**的口播（大约 3-4 句，能讲 20-25 秒）。严格遵循三段式，**每段都写满**：

【情绪锚点】（必须写 30-50 字）
以"${scene}，${mood}"切入，用一个生活化场景引发共鸣。用"你"和听众直接对话，像深夜朋友聊天。

【幕后花絮】（必须写 30-50 字）
围绕"${trackLabel}"展开。可以是这首歌给你的感受、它的风格标签、适合听的场景。如果是周杰伦/陈奕迅/王菲/邓紫棋级别——用"据说""有传言说"提一句创作轶事。冷门歌就讲这个风格为什么迷人。

【听觉钩子】（必须写 30-50 字）
给一个具体的聆听指引。格式示例："注意 1 分 20 秒处的贝斯，它像深夜地铁的节奏，不急不缓地载着你穿过城市。"或者"副歌部分的人声叠了三层，闭上眼睛像是被音乐包裹。"

规则：
- 像朋友聊天，不用感叹号堆砌，不用"亲爱的听众"。
- 连贯成一段话，不需要"[标签]"格式。${lyricHint}
- 用 JSON 输出：{"dj_speech": "你的三段式口播"}。`;
}

/**
 * Build a fallback prompt for songs with no searchable narrative.
 */
function buildSimplePrompt(trackLabel, env = {}) {
  const scene = SCENE_WORDS[Math.floor(Math.random() * SCENE_WORDS.length)];
  return `你是深夜电台 DJ Claudio。现在播放：${trackLabel}。

用一句话（30字内）切入场景"${scene}"，然后给一个具体的听觉建议。
用 JSON 输出：{"dj_speech": "你的内容"}。`;
}

module.exports = { buildStoryPrompt, buildSimplePrompt };
