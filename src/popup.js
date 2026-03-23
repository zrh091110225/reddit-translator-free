const DEFAULT_SETTINGS = {
  enabled: true,
  targetLang: "zh-CN",
  onlyNonTarget: false,
  fontColor: "#1f4d9c",
  fontSize: 15
};

const TELEGRAM_CONTACT_URL = "https://t.me/+gtiMtJPEG_tiYmYx";

const ui = {
  enabled: document.getElementById("enabled"),
  targetLang: document.getElementById("targetLang"),
  onlyNonTarget: document.getElementById("onlyNonTarget"),
  fontColor: document.getElementById("fontColor"),
  fontSize: document.getElementById("fontSize"),
  fontSizeOut: document.getElementById("fontSizeOut"),
  refreshStats: document.getElementById("refreshStats"),
  contactTelegram: document.getElementById("contactTelegram"),
  openReviewPage: document.getElementById("openReviewPage"),
  statsBox: document.getElementById("statsBox"),
  hint: document.getElementById("hint"),
  version: document.querySelector(".version")
};

function setHint(text) {
  ui.hint.textContent = text || "";
}

function render(settings) {
  ui.enabled.checked = settings.enabled;
  ui.targetLang.value = settings.targetLang;
  ui.onlyNonTarget.checked = Boolean(settings.onlyNonTarget);
  ui.fontColor.value = settings.fontColor;
  ui.fontSize.value = String(settings.fontSize);
  ui.fontSizeOut.value = `${settings.fontSize}px`;

  // Display version from manifest
  const manifest = chrome.runtime.getManifest();
  if (ui.version && manifest.version) {
    ui.version.textContent = `Version ${manifest.version}`;
  }
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function reloadActiveTab() {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  try {
    await chrome.tabs.reload(tabId);
  } catch {
    // Ignore reload failures to avoid interrupting settings flow.
  }
}

async function sendToActiveTab(message) {
  const tabId = await getActiveTabId();
  if (!tabId) return null;

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function saveAndBroadcast() {
  const settings = {
    enabled: ui.enabled.checked,
    targetLang: ui.targetLang.value,
    onlyNonTarget: ui.onlyNonTarget.checked,
    fontColor: ui.fontColor.value,
    fontSize: Number(ui.fontSize.value)
  };

  await chrome.storage.sync.set({ rtfSettings: settings });
  await sendToActiveTab({
    type: "RTF_SETTINGS_UPDATED",
    payload: settings
  });
  setHint("已保存");
  setTimeout(() => setHint(""), 900);
}

function renderStats(stats) {
  if (!stats) {
    ui.statsBox.textContent = "当前标签页不是 Reddit 帖子页，或 content script 未注入。";
    return;
  }

  ui.statsBox.textContent = [
    `URL: ${stats.url}`,
    `候选节点: ${stats.scannedCandidates}`,
    `已翻译: ${stats.translatedCount}`,
    `失败: ${stats.failedCount}`,
    `跳过(目标语言): ${stats.skippedByLang}`,
    `队列长度: ${stats.queueLength}`,
    `并发处理中: ${stats.processing}`,
    `缓存条目: ${stats.cacheSize}`
  ].join("\n");
}

async function refreshStats() {
  const stats = await sendToActiveTab({ type: "RTF_GET_STATS" });
  renderStats(stats);
}

function openUrl(url) {
  if (!url) return;
  chrome.tabs.create({ url });
}

function openTelegramContact() {
  openUrl(TELEGRAM_CONTACT_URL);
}

function openExtensionReviewPage() {
  const extensionId = chrome.runtime?.id;
  if (!extensionId) {
    setHint("无法获取扩展 ID，无法打开评论页");
    return;
  }
  const reviewUrl = `https://chromewebstore.google.com/detail/${extensionId}/reviews`;
  openUrl(reviewUrl);
}

async function init() {
  const { rtfSettings = {} } = await chrome.storage.sync.get("rtfSettings");
  const settings = { ...DEFAULT_SETTINGS, ...rtfSettings };

  render(settings);
  await refreshStats();

  ui.enabled.addEventListener("change", saveAndBroadcast);
  ui.targetLang.addEventListener("change", async () => {
    await saveAndBroadcast();
    await reloadActiveTab();
  });
  ui.onlyNonTarget.addEventListener("change", saveAndBroadcast);
  ui.fontColor.addEventListener("change", saveAndBroadcast);
  ui.fontSize.addEventListener("input", () => {
    ui.fontSizeOut.value = `${ui.fontSize.value}px`;
  });
  ui.fontSize.addEventListener("change", saveAndBroadcast);
  ui.refreshStats.addEventListener("click", refreshStats);
  ui.contactTelegram.addEventListener("click", openTelegramContact);
  ui.openReviewPage.addEventListener("click", openExtensionReviewPage);
}

init().catch(() => {
  setHint("初始化失败，请刷新后重试");
});
