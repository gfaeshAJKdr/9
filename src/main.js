import { loadState, saveState, clearState } from "./services/storage.js";
import { loadJson } from "./src/utils/data.js";
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
  model.answers = { ...model.answers, [String(questionId)]: optionKey };
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
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
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
  const grid = levels.map((level) => `<polygon class="spider-grid" points="${pointsToString(model.dimensions.map((_, i) => polarPoint(center, center, maxRadius * level, i, total)))}"></polygon>`).join("");
  const axes = model.dimensions.map((_, i) => {
    const p = polarPoint(center, center, maxRadius, i, total);
    return `<line class="spider-axis" x1="${center}" y1="${center}" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}"></line>`;
  }).join("");
  const dataPoints = model.dimensions.map((dim, i) => {
    const ratio = (scores[dim] || 0) / maxScore;
    return polarPoint(center, center, Math.max(8, maxRadius * ratio), i, total);
  });
  return `
    <div class="spider-wrap">
      <svg class="spider-chart" viewBox="0 0 ${size} ${size}">
        ${grid}${axes}<polygon class="spider-area" points="${pointsToString(dataPoints)}"></polygon>
      </svg>
    </div>
  `;
}

function renderHome() {
  const hasProgress = Object.keys(model.answers).length > 0 && model.status !== "summary";
  return `
    <main class="view home">
      <h1>${escapeHtml(model.config.title)}</h1>
      <button class="button" data-action="start">${hasProgress ? "继续测试" : "开始测试"}</button>
    </main>
  `;
}

function renderTest() {
  const q = model.questions[model.currentIndex];
  const options = q.options.map(opt => `<button class="option" data-action="select" data-question-id="${q.id}" data-option-key="${opt.key}">${escapeHtml(opt.text)}</button>`).join("");
  return `<main class="view"><section class="card">${escapeHtml(q.scenario)}<div class="options">${options}</div></section></main>`;
}

function renderLockedSummary() {
  return `<main class="view"><h1>已锁定，请支付</h1><button class="button" data-action="reset-home">返回首页</button></main>`;
}

function renderSummary() { return `<main class="view"><h1>报告已生成</h1></main>`; }

function render() {
  let content = "";
  if (model.status === "test") content = renderTest();
  else if (model.status === "locked") content = renderLockedSummary();
  else if (model.status === "summary") content = renderSummary();
  else content = renderHome();
  app.innerHTML = content;
}

function bindEvents() {
  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "start") startTest();
    if (action === "select") selectOption(t.dataset.questionId, t.dataset.optionKey);
    if (action === "reset-home") { clearState(); model.status = "home"; render(); }
  });
}

async function bootstrap() {
  bindEvents();
  try {
    const [config, dimensions, questions, personalities] = await Promise.all([
      loadJson("/9/data/config.json"),
      loadJson("/9/data/dimensions.json"),
      loadJson("/9/data/questions.json"),
      loadJson("/9/data/personalities.json")
    ]);
    model.config = config;
    model.dimensions = dimensions;
    model.questions = questions;
    model.personalities = personalities;
    render();
  } catch (e) {
    app.innerHTML = "<h1>加载失败</h1>";
  }
}

bootstrap();
