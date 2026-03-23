(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    targetLang: "zh-CN",
    onlyNonTarget: false,
    fontColor: "#1f4d9c",
    fontSize: 15
  };

  const CACHE_KEY = "rtfCache";
  const MAX_CACHE_ITEMS = 500;
  const MAX_CONCURRENCY = 3;
  const MAX_TRANSLATE_CHARS = 600;

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    cache: new Map(),
    queue: [],
    queuedKeys: new Set(),
    processing: 0,
    observer: null,
    scanTimer: null,
    lastUrl: location.href,
    stats: {
      scannedCandidates: 0,
      translatedCount: 0,
      failedCount: 0,
      skippedByLang: 0
    }
  };

  function isRedditPostPage() {
    return /reddit\.com\/r\/.+\/comments\//.test(location.href);
  }

  function hashText(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) + hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return String(hash >>> 0);
  }

  function translationKey(text, targetLang) {
    return `${targetLang}::${hashText(text)}`;
  }

  function createTranslationNode(text) {
    const node = document.createElement("div");
    node.className = "rtf-translation";
    node.setAttribute("data-rtf", "1");
    node.textContent = text;
    return node;
  }

  function createMetaNode(text, isError = false) {
    const node = document.createElement("div");
    node.className = "rtf-meta";
    node.setAttribute("data-rtf", "1");
    node.textContent = text;
    if (isError) node.classList.add("rtf-error");
    return node;
  }

  function applyStyleVars() {
    const root = document.documentElement;
    root.style.setProperty("--rtf-color", state.settings.fontColor);
    root.style.setProperty("--rtf-size", `${state.settings.fontSize}px`);
  }

  function injectStyles() {
    if (document.getElementById("rtf-style")) return;
    const style = document.createElement("style");
    style.id = "rtf-style";
    style.textContent = `
      .rtf-translation {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px dashed rgba(120, 130, 150, .45);
        color: var(--rtf-color, #1f4d9c);
        font-size: var(--rtf-size, 15px);
        line-height: 1.55;
        white-space: pre-wrap;
      }
      .rtf-meta {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.4;
        color: rgba(86, 98, 120, .85);
      }
      .rtf-meta.rtf-error {
        color: #b42318;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function compactText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function extractStructuredText(text) {
    if (!text) return "";

    // Keep paragraph boundaries while normalizing noisy intra-line spaces.
    const paragraphs = text
      .split(/\n{2,}/)
      .map(paragraph => paragraph
        .split(/\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join(" "))
      .map(paragraph => compactText(paragraph))
      .filter(Boolean);

    return paragraphs.join("\n\n");
  }

  function splitLongByWords(text, maxChars) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [];

    const chunks = [];
    let current = "";

    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if ((current.length + 1 + word.length) <= maxChars) {
        current += ` ${word}`;
      } else {
        chunks.push(current);
        current = word;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  function forceSplitUnit(text, maxChars) {
    if (text.length <= maxChars) return [text];

    const commaUnits = text.match(/[^,;，；]+[,;，；]?/g) || [text];
    const commaChunks = [];
    let current = "";

    for (const unit of commaUnits) {
      const part = unit.trim();
      if (!part) continue;
      if (part.length > maxChars) {
        if (current) {
          commaChunks.push(current);
          current = "";
        }

        const byWords = splitLongByWords(part, maxChars);
        if (byWords.length > 0) {
          for (const wordChunk of byWords) {
            if (wordChunk.length <= maxChars) {
              commaChunks.push(wordChunk);
            } else {
              for (let i = 0; i < wordChunk.length; i += maxChars) {
                commaChunks.push(wordChunk.slice(i, i + maxChars));
              }
            }
          }
          continue;
        }

        for (let i = 0; i < part.length; i += maxChars) {
          commaChunks.push(part.slice(i, i + maxChars));
        }
        continue;
      }

      if (!current) {
        current = part;
        continue;
      }
      if ((current.length + 1 + part.length) <= maxChars) {
        current += ` ${part}`;
      } else {
        commaChunks.push(current);
        current = part;
      }
    }

    if (current) commaChunks.push(current);
    return commaChunks.length > 0 ? commaChunks : [text.slice(0, maxChars)];
  }

  function splitParagraphToChunks(paragraph, maxChars = MAX_TRANSLATE_CHARS) {
    const units = paragraph.match(/[^.!?。！？\n]+[.!?。！？]?/g) || [paragraph];
    const chunks = [];
    let current = "";

    for (const unit of units) {
      const part = unit.trim();
      if (!part) continue;

      const normalizedParts = forceSplitUnit(part, maxChars);
      for (const normalizedPart of normalizedParts) {
        if (!current) {
          current = normalizedPart;
          continue;
        }
        if ((current.length + 1 + normalizedPart.length) <= maxChars) {
          current += ` ${normalizedPart}`;
        } else {
          chunks.push(current);
          current = normalizedPart;
        }
      }
    }

    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [paragraph];
  }

  function detectScript(text) {
    const cjk = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
    const kana = (text.match(/[\u3040-\u30FF]/g) || []).length;
    const hangul = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const total = cjk + kana + hangul + latin;

    if (total === 0) return "unknown";

    const score = {
      zh: cjk,
      ja: kana + cjk * 0.3,
      ko: hangul,
      en: latin
    };

    let best = "unknown";
    let max = 0;
    for (const [lang, val] of Object.entries(score)) {
      if (val > max) {
        max = val;
        best = lang;
      }
    }

    return max / total >= 0.45 ? best : "unknown";
  }

  function normalizeTargetLang(lang) {
    if (!lang) return "unknown";
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("en")) return "en";
    return "other";
  }

  function shouldSkipByLanguage(text) {
    if (!state.settings.onlyNonTarget) return false;

    const target = normalizeTargetLang(state.settings.targetLang);
    if (!["zh", "ja", "ko", "en"].includes(target)) return false;

    const guessed = detectScript(text);
    if (guessed === target) {
      state.stats.skippedByLang += 1;
      return true;
    }

    return false;
  }

  function findCandidateElements() {
    const selectors = [
      "shreddit-post [slot='text-body']",
      "article[data-testid='post-container'] [data-click-id='text']",
      "article[data-testid='post-container'] div[slot='text-body']",
      "[data-testid='comment'] p",
      "shreddit-comment [slot='comment']",
      "div.Comment p"
    ];

    const seen = new Set();
    const nodes = [];

    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      for (const node of found) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.closest("[data-rtf='1']")) continue;
        if (seen.has(node)) continue;

        const structured = extractStructuredText(node.innerText);
        if (compactText(structured).length < 20) continue;

        seen.add(node);
        nodes.push(node);
      }
    }

    state.stats.scannedCandidates = nodes.length;
    return nodes;
  }

  function hasTranslationBlock(el) {
    return Boolean(el.nextElementSibling && el.nextElementSibling.matches(".rtf-translation, .rtf-meta"));
  }

  function removeTranslationBlock(el) {
    let next = el.nextElementSibling;
    while (next && next.matches(".rtf-translation, .rtf-meta")) {
      const current = next;
      next = next.nextElementSibling;
      current.remove();
    }
  }

  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * 1.8 && rect.bottom > -300;
  }

  async function loadSettings() {
    const { rtfSettings = {} } = await chrome.storage.sync.get("rtfSettings");
    state.settings = { ...DEFAULT_SETTINGS, ...rtfSettings };
    applyStyleVars();
  }

  async function loadCache() {
    const { [CACHE_KEY]: rawCache = {} } = await chrome.storage.local.get(CACHE_KEY);
    for (const [k, v] of Object.entries(rawCache)) {
      state.cache.set(k, v);
    }
  }

  async function persistCache() {
    const obj = Object.fromEntries(Array.from(state.cache.entries()).slice(-MAX_CACHE_ITEMS));
    await chrome.storage.local.set({ [CACHE_KEY]: obj });
  }

  async function translateViaGoogleSingle(text, targetLang) {
    const query = new URLSearchParams({
      client: "gtx",
      sl: "auto",
      tl: targetLang,
      dt: "t",
      q: text
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?${query.toString()}`, {
        method: "GET",
        signal: controller.signal
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("Bad response");

      return data[0].map(part => part[0]).join("");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function translateViaGoogle(text, targetLang) {
    const paragraphs = text
      .split(/\n{2,}/)
      .map(paragraph => compactText(paragraph))
      .filter(Boolean);

    if (paragraphs.length === 0) return "";

    const translatedParagraphs = [];
    for (const paragraph of paragraphs) {
      const chunks = splitParagraphToChunks(paragraph, MAX_TRANSLATE_CHARS);
      const translatedChunks = [];
      for (const chunk of chunks) {
        translatedChunks.push(await translateViaGoogleSingle(chunk, targetLang));
      }
      // Keep long paragraph translation readable by preserving chunk boundaries.
      translatedParagraphs.push(translatedChunks.join("\n"));
    }

    return translatedParagraphs.join("\n\n");
  }

  function enqueue(el) {
    if (!state.settings.enabled) return;

    const text = extractStructuredText(el.innerText);
    const compact = compactText(text);
    if (!compact || compact.length < 20) return;
    if (!isElementVisible(el)) return;
    if (shouldSkipByLanguage(compact)) return;

    const key = translationKey(text, state.settings.targetLang);
    if (state.queuedKeys.has(key)) return;

    state.queuedKeys.add(key);
    state.queue.push({ key, text, el });
    processQueue();
  }

  async function processQueue() {
    while (state.processing < MAX_CONCURRENCY && state.queue.length > 0) {
      const item = state.queue.shift();
      if (!item || !item.el?.isConnected) continue;

      state.processing += 1;

      (async () => {
        const { key, text, el } = item;

        try {
          if (!state.settings.enabled) return;

          removeTranslationBlock(el);
          el.insertAdjacentElement("afterend", createMetaNode("Translating..."));

          let translated = state.cache.get(key);
          if (!translated) {
            translated = await translateViaGoogle(text, state.settings.targetLang);
            state.cache.set(key, translated);
            if (state.cache.size > MAX_CACHE_ITEMS) {
              const firstKey = state.cache.keys().next().value;
              if (firstKey) state.cache.delete(firstKey);
            }
            persistCache().catch(() => {});
          }

          removeTranslationBlock(el);
          el.insertAdjacentElement("afterend", createTranslationNode(translated));
          state.stats.translatedCount += 1;
        } catch {
          removeTranslationBlock(el);
          el.insertAdjacentElement("afterend", createMetaNode("翻译失败，点击重试", true));
          const retryNode = el.nextElementSibling;
          if (retryNode) {
            retryNode.style.cursor = "pointer";
            retryNode.addEventListener("click", () => enqueue(el), { once: true });
          }
          state.stats.failedCount += 1;
        } finally {
          state.queuedKeys.delete(key);
          state.processing -= 1;
          processQueue();
        }
      })();
    }
  }

  function clearAllTranslations() {
    document.querySelectorAll(".rtf-translation, .rtf-meta").forEach(node => node.remove());
  }

  function scanAndTranslate() {
    if (!isRedditPostPage()) return;
    if (!state.settings.enabled) return;

    const candidates = findCandidateElements();
    for (const el of candidates) {
      if (hasTranslationBlock(el)) continue;
      enqueue(el);
    }
  }

  function scheduleScan() {
    if (state.scanTimer) clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scanAndTranslate, 180);
  }

  function setupObserver() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        clearAllTranslations();
      }
      scheduleScan();
    });
    state.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function buildStats() {
    return {
      url: location.href,
      scannedCandidates: state.stats.scannedCandidates,
      translatedCount: state.stats.translatedCount,
      failedCount: state.stats.failedCount,
      skippedByLang: state.stats.skippedByLang,
      queueLength: state.queue.length,
      processing: state.processing,
      cacheSize: state.cache.size
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "RTF_SETTINGS_UPDATED") {
      state.settings = { ...DEFAULT_SETTINGS, ...message.payload };
      applyStyleVars();

      if (!state.settings.enabled) {
        clearAllTranslations();
      } else {
        scheduleScan();
      }

      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "RTF_GET_STATS") {
      sendResponse(buildStats());
    }
  });

  async function init() {
    injectStyles();
    await loadSettings();
    await loadCache();

    if (!isRedditPostPage()) return;

    setupObserver();
    scanAndTranslate();
    window.addEventListener("scroll", scheduleScan, { passive: true });
    window.addEventListener("focus", scheduleScan, { passive: true });
  }

  init().catch(() => {
    // Keep silent to avoid polluting page consoles for end users.
  });
})();
