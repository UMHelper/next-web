/**
 * Simplified/Traditional pairs where each form belongs to only one script. Characters that also
 * exist in the other script (后, 面, 干, 里, 系, 台…) are left out so they never tip the count.
 */
export const CHINESE_SCRIPT_PAIRS =
  "这這 个個 们們 来來 时時 说說 学學 为為 会會 对對 过過 还還 没沒 么麼 吗嗎 课課 师師 难難 选選 级級 " +
  "门門 题題 问問 关關 应應 该該 经經 书書 长長 开開 动動 现現 实實 点點 务務 业業 专專 认認 识識 让讓 " +
  "请請 谢謝 体體 东東 见見 觉覺 样樣 线線 网網 页頁 评評 价價 论論 给給 讲講 习習 练練 测測 验驗 试試 " +
  "报報 计計 设設 读讀 写寫 语語 话話 词詞 汉漢 数數 机機 电電 脑腦 号號 节節 组組 织織 统統 质質 简簡 " +
  "单單 复復 杂雜 轻輕 历歷 万萬 与與 处處 头頭 两兩 产產 亲親 从從 众眾 优優 传傳 员員 岁歲 帮幫 广廣 " +
  "张張 强強 总總 战戰 担擔 择擇 换換 构構 标標 欢歡 气氣 决決 满滿 济濟 热熱 爱愛 状狀 环環 盖蓋 种種 " +
  "积積 称稱 笔筆 类類 红紅 纪紀 约約 终終 结結 绩績 续續 维維 综綜 编編 职職 联聯 获獲 虽雖 补補 规規 " +
  "视視 讨討 记記 许許 证證 诉訴 详詳 误誤 调調 谁誰 负負 责責 贵貴 费費 资資 赛賽 车車 转轉 软軟 较較 " +
  "辅輔 边邊 达達 运運 进進 连連 迟遲 适適 邮郵 钟鐘 错錯 间間 闻聞 队隊 际際 陆陸 随隨 预預 领領 频頻 " +
  "风風 饭飯 马馬 鱼魚 鸡雞 齐齊 签簽 讯訊 劳勞 区區 协協 华華 压壓 听聽 启啟 响響 园園 围圍 图圖 场場 " +
  "坏壞 块塊 声聲 备備 够夠 奖獎 宝寶 审審 宽寬 导導 层層 带帶 归歸 当當 录錄 态態 惯慣 扩擴 护護 拥擁 " +
  "损損 据據 断斷 无無 旧舊 显顯 术術 权權 条條 极極 检檢 楼樓 浅淺 灵靈 烦煩 独獨 疗療 监監 码碼 础礎 " +
  "确確 离離 稳穩 紧緊 纸紙 细細 绍紹 绝絕 络絡 继繼 罚罰 胜勝 脸臉 艺藝 药藥 虑慮 装裝 观觀 览覽 议議 " +
  "训訓 访訪 诚誠 谈談 账賬 购購 赢贏 输輸 载載 远遠 违違 释釋 钱錢 银銀 链鏈 键鍵 闭閉 阅閱 阶階 陈陳 " +
  "险險 顶頂 项項 顺順 须須 顾顧 额額 飞飛 馆館 别別";

const SIMPLIFIED = new Set<string>();
const TRADITIONAL = new Set<string>();
for (const pair of CHINESE_SCRIPT_PAIRS.split(" ")) {
  const [simplified, traditional] = Array.from(pair);
  SIMPLIFIED.add(simplified);
  TRADITIONAL.add(traditional);
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /[A-Za-z]/;

export type ChineseScript = "simplified" | "traditional";

/** Returns null when the text has no characters that tell the scripts apart, or is Japanese. */
export function detectChineseScript(text: string): ChineseScript | null {
  if (KANA.test(text)) return null;
  let simplified = 0;
  let traditional = 0;
  for (const char of text) {
    if (SIMPLIFIED.has(char)) simplified++;
    else if (TRADITIONAL.has(char)) traditional++;
  }
  if (simplified === traditional) return null;
  return simplified > traditional ? "simplified" : "traditional";
}

type ChatMessage = { role: string; content?: unknown };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : ""))
    .join(" ");
}

const SCRIPT_NAMES: Record<ChineseScript, string> = {
  simplified: "Simplified Chinese",
  traditional: "Traditional Chinese",
};

const NON_CHINESE_LANGUAGE_REQUEST =
  /\b(japanese|english|korean|french|german|spanish|portuguese)\b|日本語|英文|韓文|韩文|請用英文|请用英文|用英文回答|用日文/i;

function studentRequestedNonChineseLanguage(messages: readonly ChatMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "user") continue;
    if (NON_CHINESE_LANGUAGE_REQUEST.test(textOf(message.content))) return true;
  }
  return false;
}

/**
 * DeepSeek drifts toward the Traditional script of the site data, so the script is detected here
 * and handed to the model each turn rather than left for it to infer from one or two characters.
 */
export function replyScriptContext(messages: readonly ChatMessage[]) {
  if (studentRequestedNonChineseLanguage(messages)) return null;
  const latest = messages.findLast((message) => message.role === "user");
  const script = latest ? detectChineseScript(textOf(latest.content)) : null;
  if (!script) return null;
  const name = SCRIPT_NAMES[script];
  return {
    description: "Script of the student's latest message",
    value: `${name}. Use this script only when you answer in Chinese. If the student asked for another language earlier in the thread, that request overrides this hint entirely.`,
  };
}

/** Korean and Japanese drift toward Chinese tool data; name the reply language each turn like script hints. */
export function replyLanguageContext(messages: readonly ChatMessage[]) {
  if (studentRequestedNonChineseLanguage(messages)) return null;
  const latest = messages.findLast((message) => message.role === "user");
  const text = latest ? textOf(latest.content) : "";
  const hangul = HANGUL.test(text);
  const kana = KANA.test(text);
  if (hangul && !kana) {
    return {
      description: "Reply language for this turn",
      value:
        "Korean. Write your own sentences in Korean even when tool results use Traditional Chinese or English. Keep course codes, official course titles, and instructor names exactly as the tools return them.",
    };
  }
  if (kana) {
    return {
      description: "Reply language for this turn",
      value:
        "Japanese. Write your own sentences in Japanese even when tool results use Traditional Chinese or English. Keep course codes, official course titles, and instructor names exactly as the tools return them.",
    };
  }
  if (LATIN.test(text) && !HAN.test(text)) {
    return {
      description: "Reply language for this turn",
      value:
        "English. Write your own sentences in English even when tool results use Traditional Chinese. Keep course codes, official course titles, and instructor names exactly as the tools return them.",
    };
  }
  return null;
}
