import { loadState, saveState, clearState } from "./services/storage.js";
import { loadJson } from "./utils/data.js";
import { calculateScores, pickPrimaryAndSecondary } from "./utils/score.js";

const app = document.querySelector("#app");

const model = {
  config: null,
  dimensions: [],
  questions: [],
  personalities: [],
  currentIndex: 0,
  answers: {},
  status: "home",
  toast: ""
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function persist() {
  saveState({
    currentIndex: model.currentIndex,
    answers: model.answers,
    status: model.status
  });
}

function showToast(message) {
  model.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    model.toast = "";
    render();
  }, 1800);
}

function goHome() {
  model.status = "home";
  model.currentIndex = 0;
  persist();
  render();
}

function startTest({ reset = false } = {}) {
  if (reset) {
    model.currentIndex = 0;
    model.answers = {};
  }

  model.status = "test";
  persist();
  render();
}

function completeTest() {
  const unanswered = model.questions.find((question) => !model.answers[String(question.id)]);

  if (unanswered) {
    model.currentIndex = model.questions.findIndex((question) => question.id === unanswered.id);
    model.status = "test";
    persist();
    showToast("请选择一个选项。");
    return;
  }

  model.status = "locked";
  persist();
  render();
}

function selectOption(questionId, optionKey) {
  model.answers = {
    ...model.answers,
    [String(questionId)]: optionKey
  };

  if (model.currentIndex === model.questions.length - 1) {
    completeTest();
    return;
  }

  model.currentIndex += 1;
  persist();
  render();
}

function goPrevious() {
  if (model.currentIndex === 0) {
    goHome();
    return;
  }

  model.currentIndex -= 1;
  persist();
  render();
}

function findPersonality(primary, secondary) {
  return model.personalities.find(
    (personality) => personality.primaryDimension === primary && personality.secondaryDimension === secondary
  );
}

function polarPoint(cx, cy, radius, index, total) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function pointsToString(points) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function renderSpiderChart(scores) {
  const size = 320;
  const center = size / 2;
  const maxRadius = 86;
  const levels = [0.25, 0.5, 0.75, 1];
  const maxScore = Math.max(...Object.values(scores), 1);
  const total = model.dimensions.length;
  const grid = levels
    .map((level) => {
      const points = model.dimensions.map((_, index) => polarPoint(center, center, maxRadius * level, index, total));
      return `<polygon class="spider-grid" points="${pointsToString(points)}"></polygon>`;
    })
    .join("");
  const axes = model.dimensions
    .map((_, index) => {
      const point = polarPoint(center, center, maxRadius, index, total);
      return `<line class="spider-axis" x1="${center}" y1="${center}" x2="${point.x.toFixed(2)}" y2="${point.y.toFixed(2)}"></line>`;
    })
    .join("");
  const labels = model.dimensions
    .map((dimension, index) => {
      const point = polarPoint(center, center, maxRadius + 24, index, total);
      const anchor = point.x > center + 8 ? "start" : point.x < center - 8 ? "end" : "middle";
      const baseline = point.y > center + 8 ? "hanging" : point.y < center - 8 ? "auto" : "middle";
      return `<text class="spider-label" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="${baseline}">${escapeHtml(dimension)}</text>`;
    })
    .join("");
  const dataPoints = model.dimensions.map((dimension, index) => {
    const ratio = (scores[dimension] || 0) / maxScore;
    const radius = Math.max(8, maxRadius * ratio);
    return polarPoint(center, center, radius, index, total);
  });

  return `
    <div class="spider-wrap" aria-label="十维人格倾向蜘蛛图">
      <svg class="spider-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="十维人格倾向强弱图">
        ${grid}
        ${axes}
        <polygon class="spider-area" points="${pointsToString(dataPoints)}"></polygon>
        <polyline class="spider-line" points="${pointsToString([...dataPoints, dataPoints[0]])}"></polyline>
        ${labels}
      </svg>
    </div>
  `;
}

function renderHome() {
  const hasProgress = Object.keys(model.answers).length > 0 && model.status !== "summary";

  return `
    <main class="view home">
      <section>
        <p class="eyebrow">Mobile First</p>
        <h1 class="title">${escapeHtml(model.config.title)}</h1>
        <p class="subtitle">${escapeHtml(model.config.subtitle)}</p>
      </section>
      <section class="card home-card">
        <p class="disclaimer">${escapeHtml(model.config.disclaimer)}</p>
      </section>
      <div>
        <button class="button" data-action="start">${hasProgress ? "继续测试" : "开始测试"}</button>
        ${hasProgress ? `<button class="button secondary" data-action="restart" style="margin-top: 10px;">重新开始</button>` : ""}
      </div>
    </main>
  `;
}

function renderTest() {
  const question = model.questions[model.currentIndex];
  const selected = model.answers[String(question.id)];
  const total = model.questions.length;
  const current = model.currentIndex + 1;
  const progress = Math.round((current / total) * 100);
  const options = question.options
    .map((option) => {
      const selectedClass = selected === option.key ? " selected" : "";
      return `
        <button class="option${selectedClass}" data-action="select" data-question-id="${question.id}" data-option-key="${option.key}">
          <span class="option-key">${option.key}</span>${escapeHtml(option.text)}
        </button>
      `;
    })
    .join("");

  return `
    <main class="view">
      <header class="test-header">
        <span class="progress-text">${current} / ${total}</span>
        <span class="progress-track"><span class="progress-bar" style="width: ${progress}%"></span></span>
      </header>
      <section class="card question-card">
        <p class="question-label">情境</p>
        <h2 class="question-text">${escapeHtml(question.scenario)}</h2>
        <div class="options">${options}</div>
      </section>
      <nav class="bottom-bar single" aria-label="题目导航">
        <button class="button secondary" data-action="previous">← 上一题</button>
      </nav>
    </main>
  `;
}
function renderLockedSummary() {
  const scores = calculateScores({
    questions: model.questions,
    answers: model.answers,
    dimensions: model.dimensions
  });

  const result = pickPrimaryAndSecondary(scores, model.dimensions);
  const personality = findPersonality(result.primary, result.secondary);

  const title = personality?.title || "人格已生成";
  const rarity = personality?.rarity || "未知";

  return `
    <main class="view summary">

      <section class="result-hero">
      <div class="blur-mask">
        <p>${escapeHtml(result.primary)} × ${escapeHtml(result.secondary)}</p>
        </div>
        <h2>人格称号：</h2>
        <h1><span class="blur-mask">${escapeHtml(title)}</span></h1>
        <p>人格稀有度：？？？？？</p>
      </section>

      <section class="card">
        <div style="filter: blur(8px); opacity: 0.6;">
          ${renderSpiderChart(scores)}
        </div>
      </section>

      <h3>🖤核心分析：</h3>
      <section class="blur-mask">
        <div class="blur-box">你从不觉得这个世界上有什么无私的爱或纯粹的善意，别人对你好，
        你脑子里都在冷静地揣测对方的真实目的。为了确保绝对的安全感，你习惯在自己和所有人之间筑起一道厚厚的高墙，
        像个躲在暗处的观察者一样，毫无感情地审视着周围每个人的言行举止。你谁都不信，
        这也让你在面对任何亲密关系时，都带着一种冷冰冰的防范。</div>
      </section>

      <h3>💥暗黑场景激发：</h3>
      <section class="blur-mask">
        <div class="blur-box">一旦某段关系开始让你觉得“太近了”
        或者对方试图向你索要完全的信任与情感回应时，你内心的警铃就会大作。
        你不会去沟通你的焦虑，而是会瞬间切断所有的情感连接，
        用一种毫无温度的冷水把对方狠狠泼醒。无论对方怎么委屈哭诉，你都能面无表情地看着，心里甚至还在冷静地盘算：
        TA哭得这么真切，是不是为了博取同情，好继续套路我？
</div>
      </section>

      <h3>💭善意提醒：</h3>
      <section class="blur-mask">
        <div class="blur-box">你这种极度的不信任和冷漠，最后防范的其实是你自己。因为你对任何温情都免疫，看谁都像贼，
        导致那些真正带着真心想对你好的人，都会被你这种冷血逼得彻底心碎、主动离开。
        学会把神经放轻松一点，适度允许别人靠近，你才能体会到生活真正的温度。</div>
      </section>

      <button class="button primary">
        🔒 支付 ¥1.99 查看完整结果
      </button>

    <button class="button secondary" data-action="reset-home" style="margin-top: 20px;">
        放弃结果，重回首页
      </button>
      </main>
  `;
}

function renderSummary() {
  const scores = calculateScores({ questions: model.questions, answers: model.answers, dimensions: model.dimensions });
  const result = pickPrimaryAndSecondary(scores, model.dimensions);
  const personality = findPersonality(result.primary, result.secondary);
  const title = personality?.title || "人格画像已生成";
  const rarity = personality?.rarity || "待补充";
  const quote = personality?.quote || "你的完整人格报告已生成。";

  return `
    <main class="view summary">
      <section class="result-hero blur-lock">
        <p class="eyebrow">${escapeHtml(result.primary)} × ${escapeHtml(result.secondary)}</p>
        <h1 class="title result-title">${escapeHtml(title)}</h1>
        <p class="rarity"><p>人格稀有度：？？？？？</p></p>
        <p class="quote">“${escapeHtml(quote)}”</p>
      </section>
      <section class="card summary-card chart-card pay-lock">

    <div class="blur-mask">
  ${renderSpiderChart(scores)}
</div>

    <div class="pay-mask">

        <h3>🔒 支付 ¥1.99 查看完整人格报告</h3>

        <p>你的完整暗黑人格画像已生成，支付后立即解锁全部分析。</p>

        <button class="button primary">

            支付 ¥1.99

        </button>

    </div>

</section>
      <section class="card summary-card">
        <p class="summary-text">🎭 你的完整人格报告已生成。</p>
        <p class="disclaimer">${escapeHtml(model.config.disclaimer)}</p>
      </section>
      <button class="button" data-action="restart">重新测试</button>
      <button class="button secondary" data-action="home">返回首页</button>
    </main>
  `;
}

function renderError(message) {
  return `
    <main class="view app-shell">
      <section class="error-box">${escapeHtml(message)}</section>
    </main>
  `;
}

function render() {
  let content = "";

  if (model.status === "test") {
    content = renderTest();
  } 
  else if (model.status === "locked") {
    content = renderLockedSummary();
}
  else if (model.status === "summary") {
    content = renderSummary();
  } else {
    content = renderHome();
  }

  app.innerHTML = `<div class="app-shell">${content}</div>${model.toast ? `<div class="toast">${escapeHtml(model.toast)}</div>` : ""}`;
}

function bindEvents() {
  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");

    if (!target) {
      return;
    }

    const action = target.dataset.action;

    if (action === "start") {
      startTest();
    }

    if (action === "restart") {
      clearState();
      startTest({ reset: true });
    }

    if (action === "home") {
      goHome();
    }

    if (action === "select") {
      selectOption(target.dataset.questionId, target.dataset.optionKey);
    }

    if (action === "previous") {
      goPrevious();
    }
    if (action === "reset-home") {
        clearState(); 
        model.status = "home"; 
        render();           
      }
    
  });
}

async function bootstrap() {
  bindEvents();

  try {
    const [config, dimensions, questions, personalities] = await Promise.all([
      loadJson("/src/data/config.json"),
      loadJson("/src/data/dimensions.json"),
      loadJson("/src/data/questions.json"),
      loadJson("/src/data/personalities.json")
    ]);

    model.config = config;
    model.dimensions = dimensions;
    model.questions = questions;
    model.personalities = personalities;

    const saved = loadState();

if (saved) {
  model.currentIndex = Math.min(Math.max(Number(saved.currentIndex) || 0, 0), questions.length - 1);
  model.answers = saved.answers && typeof saved.answers === "object" ? saved.answers : {};

  // ✔ 允许恢复 test（继续答题）
  if (saved.status === "test") {
    model.status = "test";
  }

  // ✔ 已完成测试 → 可以恢复 locked（但不会自动跳）
  else if (saved.status === "locked" || saved.status === "summary") {
    model.status = saved.status;
  }

  // ✔ 其他情况回 home
  else {
    model.status = "home";
  }
} else {
  model.status = "home";
}

    render();
  } catch (error) {
    app.innerHTML = renderError(error.message || "数据读取失败，请稍后重试。");
  }
}

bootstrap();
