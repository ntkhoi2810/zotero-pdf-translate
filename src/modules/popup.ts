import { SVGIcon } from "../utils/config";
import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import {
  addTranslateTask,
  getLastTranslateTask,
  type TranslateTask,
} from "../utils/task";
import { slice } from "../utils/str";
import { saveVocabularySensesFromTask } from "./flashcards/storage";
import type { VocabularyLookup, VocabularySense } from "./dictionary/model";
import {
  getResponsivePopupWidth,
  READER_POPUP_STYLES,
} from "./readerPopupStyles";

function ensurePopupStyles(doc: Document) {
  const id = `${config.addonRef}-reader-popup-styles`;
  if (doc.getElementById(id)) return;
  const style = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "style",
  ) as HTMLStyleElement;
  style.id = id;
  style.textContent = READER_POPUP_STYLES;
  (doc.head || doc.documentElement).append(style);
}

function setVocabularyPopupMode(
  popup: HTMLDivElement,
  picker: HTMLDivElement,
  enabled: boolean,
) {
  popup.classList.toggle(`${config.addonRef}-vocabulary-mode`, enabled);
  if (!enabled) {
    popup.style.removeProperty("width");
    popup.style.removeProperty("max-width");
    popup.style.removeProperty("overflow");
    return;
  }

  const viewportWidth =
    popup.ownerDocument.defaultView?.innerWidth ||
    popup.ownerDocument.documentElement.clientWidth ||
    440;
  const width = getResponsivePopupWidth(viewportWidth);
  popup.style.width = `${width}px`;
  popup.style.maxWidth = "calc(100vw - 24px)";
  popup.style.overflow = "hidden";

  // Inline constraints are a final fallback for reader documents that reject
  // injected styles. Content must never force the selection popup off-screen.
  picker.style.boxSizing = "border-box";
  picker.style.width = "100%";
  picker.style.minWidth = "0";
  picker.style.maxWidth = "100%";
  picker.style.maxHeight = "calc(100vh - 100px)";
  picker.style.overflow = "hidden";
  picker.style.whiteSpace = "normal";
}

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

const createHTML = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
) => doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];

function sharedPronunciation(lookup: VocabularyLookup) {
  const pronunciations = new Set(
    lookup.senses.map((sense) => sense.pronunciation.trim()),
  );
  return pronunciations.size === 1 ? [...pronunciations][0] : "";
}

function renderVocabularyHeader(
  doc: Document,
  word: string,
  lookup: VocabularyLookup | undefined,
  vi: boolean,
  loading: boolean,
) {
  const header = createHTML(doc, "header");
  header.className = `${config.addonRef}-vocab-head`;

  const row1 = createHTML(doc, "div");
  row1.className = `${config.addonRef}-vocab-row1`;
  const identity = createHTML(doc, "div");
  identity.className = `${config.addonRef}-vocab-identity`;
  const title = createHTML(doc, "strong");
  title.className = `${config.addonRef}-vocab-word`;
  title.textContent = word;
  identity.append(title);
  const pronunciation = lookup ? sharedPronunciation(lookup) : "";
  if (pronunciation) {
    const ipa = createHTML(doc, "span");
    ipa.className = `${config.addonRef}-vocab-ipa`;
    ipa.textContent = pronunciation;
    identity.append(ipa);
  }

  const chip = createHTML(doc, "span");
  chip.className = `${config.addonRef}-status-chip`;
  const dot = createHTML(doc, "span");
  dot.className = `${config.addonRef}-status-dot`;
  dot.setAttribute("aria-hidden", "true");
  const chipText = createHTML(doc, "span");
  if (loading) {
    chip.classList.add("is-loading");
    chipText.textContent = vi ? "Đang chuẩn hóa…" : "Normalizing…";
  } else if (lookup?.normalizationStatus === "normalized") {
    chip.classList.add("is-normalized");
    chipText.textContent = vi ? "AI chuẩn hóa" : "AI normalized";
  } else if (lookup?.normalizationStatus === "error") {
    chip.classList.add("is-error");
    chipText.textContent = vi ? "Lỗi chuẩn hóa" : "Normalization error";
  } else {
    chip.classList.add("is-raw");
    chipText.textContent = vi ? "Dữ liệu thô" : "Raw data";
  }
  chip.append(dot, chipText);
  row1.append(identity, chip);

  const row2 = createHTML(doc, "div");
  row2.className = `${config.addonRef}-vocab-row2`;
  const hint = createHTML(doc, "span");
  hint.className = `${config.addonRef}-vocab-hint`;
  hint.textContent = vi ? "Chọn tối đa 2 nghĩa" : "Select up to 2 meanings";
  const counter = createHTML(doc, "span");
  counter.className = `${config.addonRef}-vocab-counter`;
  counter.dataset.role = "counter";
  counter.setAttribute("aria-live", "polite");
  counter.textContent = "0 / 2";
  row2.append(hint, counter);
  header.append(row1, row2);
  return header;
}

function renderVocabularySkeleton(doc: Document) {
  const fragment = doc.createDocumentFragment();
  for (let cardIndex = 0; cardIndex < 3; cardIndex++) {
    const card = createHTML(doc, "div");
    card.className = `${config.addonRef}-skeleton-card`;
    card.setAttribute("aria-hidden", "true");
    for (let lineIndex = 0; lineIndex < 3; lineIndex++) {
      const line = createHTML(doc, "span");
      line.className = `${config.addonRef}-skeleton-line`;
      card.append(line);
    }
    fragment.append(card);
  }
  return fragment;
}

function renderVocabularyError(
  doc: Document,
  task: TranslateTask,
  lookup: VocabularyLookup,
  vi: boolean,
) {
  const errorBox = createHTML(doc, "div");
  errorBox.className = `${config.addonRef}-vocab-error`;
  const dot = createHTML(doc, "span");
  dot.className = `${config.addonRef}-error-dot`;
  dot.setAttribute("aria-hidden", "true");
  const message = createHTML(doc, "span");
  message.textContent = `${vi ? "Không thể chuẩn hóa" : "Normalization failed"}: ${lookup.llmError}`;
  const actions = createHTML(doc, "span");
  actions.className = `${config.addonRef}-vocab-error-actions`;
  const retry = createHTML(doc, "button");
  retry.type = "button";
  retry.className = `${config.addonRef}-vocab-error-action is-primary`;
  retry.textContent = vi ? "Thử lại" : "Retry";
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    retry.textContent = vi ? "Đang xử lý…" : "Working…";
    task.status = "waiting";
    task.result = "";
    delete (task as TranslateTask & { vocabularyLookup?: VocabularyLookup })
      .vocabularyLookup;
    await addon.hooks.onTranslate(task, {
      noCheckZoteroItemLanguage: true,
      noCache: true,
    });
  });
  const configure = createHTML(doc, "button");
  configure.type = "button";
  configure.className = `${config.addonRef}-vocab-error-action`;
  configure.textContent = vi ? "Cấu hình" : "Configure";
  configure.addEventListener("click", () => {
    Zotero.Utilities.Internal.openPreferences(config.addonID);
  });
  actions.append(retry, configure);
  errorBox.append(dot, message, actions);
  return errorBox;
}

function createCheckmark(doc: Document) {
  const check = createHTML(doc, "span");
  check.className = `${config.addonRef}-check`;
  check.setAttribute("aria-hidden", "true");
  const mark = createHTML(doc, "span");
  mark.className = `${config.addonRef}-check-mark`;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M3.5 8.2 6.6 11.2 12.7 4.9");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  mark.append(svg);
  check.append(mark);
  return check;
}

interface SenseCardControl {
  card: HTMLLabelElement;
  input: HTMLInputElement;
  sense: VocabularySense;
}

function renderSenseCard(
  doc: Document,
  sense: VocabularySense,
  index: number,
  pronunciationInHeader: boolean,
  normalized: boolean,
): SenseCardControl {
  const card = createHTML(doc, "label");
  card.className = `${config.addonRef}-sense-card`;
  card.style.setProperty("--zpt-card-index", `${Math.min(index, 4)}`);
  const input = createHTML(doc, "input");
  input.className = `${config.addonRef}-sense-input`;
  input.type = "checkbox";
  input.checked = normalized && index < 2;

  const content = createHTML(doc, "span");
  content.className = `${config.addonRef}-sense-content`;
  const meta = createHTML(doc, "span");
  meta.className = `${config.addonRef}-sense-meta`;
  const partOfSpeech = createHTML(doc, "span");
  partOfSpeech.textContent = sense.partOfSpeech;
  meta.append(partOfSpeech);
  if (sense.cefrLevel !== "unknown") {
    const separator = createHTML(doc, "span");
    separator.textContent = "·";
    separator.setAttribute("aria-hidden", "true");
    const cefr = createHTML(doc, "span");
    cefr.className = `${config.addonRef}-cefr-chip`;
    cefr.textContent = sense.cefrLevel;
    meta.append(separator, cefr);
  }
  if (sense.pronunciation && !pronunciationInHeader) {
    const separator = createHTML(doc, "span");
    separator.textContent = "·";
    separator.setAttribute("aria-hidden", "true");
    const ipa = createHTML(doc, "span");
    ipa.textContent = sense.pronunciation;
    meta.append(separator, ipa);
  }
  const meaningVi = createHTML(doc, "span");
  meaningVi.className = `${config.addonRef}-sense-meaning-vi`;
  meaningVi.textContent = sense.meaningVi || "Chưa có nghĩa tiếng Việt phù hợp";
  const meaningEn = createHTML(doc, "span");
  meaningEn.className = `${config.addonRef}-sense-meaning-en`;
  meaningEn.textContent = sense.meaningEn;
  content.append(meta, meaningVi, meaningEn);
  if (sense.example) {
    const example = createHTML(doc, "span");
    example.className = `${config.addonRef}-sense-example`;
    example.textContent = sense.example;
    content.append(example);
  }
  card.append(input, createCheckmark(doc), content);
  return { card, input, sense };
}

function renderVocabularyFooter(
  doc: Document,
  lookup: VocabularyLookup | undefined,
  vi: boolean,
) {
  const footer = createHTML(doc, "footer");
  footer.className = `${config.addonRef}-vocab-foot`;
  const save = createHTML(doc, "button");
  save.type = "button";
  save.className = `${config.addonRef}-save-senses`;
  save.disabled = true;
  save.textContent = vi ? "Lưu 0 nghĩa" : "Save 0 meanings";
  footer.append(save);
  if (lookup) {
    const source = createHTML(doc, "a");
    source.className = `${config.addonRef}-vocab-source`;
    source.href = lookup.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = `FreeDictionaryAPI · ${lookup.sourceLicense}`;
    footer.append(source);
  }
  return { footer, save };
}

function renderVocabularyPicker(
  popup: HTMLDivElement,
  picker: HTMLDivElement,
  flashcardStatus: HTMLDivElement,
  task: TranslateTask,
  lookup: VocabularyLookup | undefined,
  loading: boolean,
  vi: boolean,
) {
  const renderKey = [
    task.id,
    task.status,
    loading ? "loading" : lookup?.normalizationStatus || "none",
    lookup?.senses.map((sense) => sense.id).join(",") || "",
  ].join("|");
  if (picker.dataset.renderKey === renderKey) return;
  picker.dataset.renderKey = renderKey;
  picker.classList.remove("is-leaving");
  picker.replaceChildren();

  const doc = picker.ownerDocument;
  const word = lookup?.word || task.raw.normalize("NFKC").trim();
  const header = renderVocabularyHeader(doc, word, lookup, vi, loading);
  const list = createHTML(doc, "div");
  list.className = `${config.addonRef}-vocab-list`;
  list.setAttribute("role", "group");
  list.setAttribute(
    "aria-label",
    vi ? "Các nghĩa từ vựng" : "Vocabulary meanings",
  );
  const { footer, save } = renderVocabularyFooter(doc, lookup, vi);
  picker.append(header, list, footer);

  if (loading) {
    list.setAttribute("aria-busy", "true");
    list.append(renderVocabularySkeleton(doc));
    return;
  }
  if (!lookup) return;
  if (lookup.llmError)
    list.append(renderVocabularyError(doc, task, lookup, vi));

  const normalized = lookup.normalizationStatus === "normalized";
  const pronunciationInHeader = !!sharedPronunciation(lookup);
  const controls = lookup.senses.map((sense, index) => {
    const control = renderSenseCard(
      doc,
      sense,
      index,
      pronunciationInHeader,
      normalized,
    );
    list.append(control.card);
    return control;
  });
  const selected = new Set(
    controls.filter(({ input }) => input.checked).map(({ sense }) => sense.id),
  );
  const counter = header.querySelector<HTMLElement>('[data-role="counter"]')!;

  const syncSelection = () => {
    const limitReached = selected.size >= 2;
    controls.forEach(({ card, input, sense }) => {
      const unavailable = !normalized;
      const limited = normalized && limitReached && !input.checked;
      input.disabled = unavailable || limited;
      card.classList.toggle("is-selected", input.checked);
      card.classList.toggle("is-limit-reached", limited);
      card.classList.toggle("is-unavailable", unavailable);
      card.setAttribute("aria-disabled", String(input.disabled));
      if (input.checked) selected.add(sense.id);
    });
    counter.textContent = `${selected.size} / 2`;
    save.disabled = !normalized || selected.size === 0;
    save.textContent = vi
      ? `Lưu ${selected.size} nghĩa`
      : `Save ${selected.size} meaning${selected.size === 1 ? "" : "s"}`;
  };

  controls.forEach(({ input, sense }) => {
    input.addEventListener("change", () => {
      if (input.checked) selected.add(sense.id);
      else selected.delete(sense.id);
      syncSelection();
    });
  });
  syncSelection();

  save.addEventListener("click", async () => {
    save.disabled = true;
    const saved = await saveVocabularySensesFromTask(task, [...selected]);
    flashcardStatus.textContent = vi
      ? saved
        ? `✓ Đã lưu flashcard với ${selected.size} nghĩa`
        : "Không thể lưu flashcard"
      : saved
        ? `✓ Saved a flashcard with ${selected.size} meanings`
        : "Could not save flashcard";
    if (!saved) {
      flashcardStatus.style.removeProperty("display");
      syncSelection();
      return;
    }
    save.textContent = vi ? "✓ Đã lưu" : "✓ Saved";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      picker.style.display = "none";
      picker.classList.remove("is-leaving");
      setVocabularyPopupMode(popup, picker, false);
      flashcardStatus.style.removeProperty("display");
    };
    ztoolkit.getGlobal("setTimeout")(() => {
      picker.classList.add("is-leaving");
      const onAnimationEnd = (event: AnimationEvent) => {
        if (event.target !== picker) return;
        picker.removeEventListener("animationend", onAnimationEnd);
        finish();
      };
      picker.addEventListener("animationend", onAnimationEnd);
      ztoolkit.getGlobal("setTimeout")(finish, 200);
    }, 600);
  });
}

export function updateReaderPopup() {
  const popup = addon.data.popup.currentPopup;
  if (!popup) {
    return;
  }
  const enablePopup = getPref("enablePopup");
  const hidePopupTextarea = getPref("enableHidePopupTextarea") as boolean;
  Array.from(popup.querySelectorAll(`.${config.addonRef}-readerpopup`)).forEach(
    (elem) => ((elem as HTMLElement).hidden = !enablePopup),
  );

  const idPrefix = popup?.getAttribute(`${config.addonRef}-prefix`);
  const makeId = (type: string) => `${idPrefix}-${type}`;
  const audiobox = popup?.querySelector(
    `#${makeId("audiobox")}`,
  ) as HTMLDivElement;
  const translateButton = popup?.querySelector(
    `#${makeId("translate")}`,
  ) as HTMLDivElement;
  const textarea = popup?.querySelector(
    `#${makeId("text")}`,
  ) as HTMLTextAreaElement;
  const addToNoteButton = popup?.querySelector(
    `#${makeId("addtonote")}`,
  ) as HTMLDivElement;
  const flashcardStatus = popup?.querySelector(
    `#${makeId("flashcard-status")}`,
  ) as HTMLDivElement;
  const vocabularyPicker = popup?.querySelector(
    `#${makeId("vocabulary-picker")}`,
  ) as HTMLDivElement;

  const updateHidden = (elem: HTMLElement, hidden: boolean) => {
    if (hidden) {
      elem.style.display = "none";
    } else {
      elem.style.removeProperty("display");
    }
  };

  if (!enablePopup) {
    setVocabularyPopupMode(popup, vocabularyPicker, false);
    updateHidden(audiobox, true);
    updateHidden(translateButton, true);
    updateHidden(textarea, true);
    updateHidden(addToNoteButton, true);
    updateHidden(flashcardStatus, true);
    updateHidden(vocabularyPicker, true);
    return;
  }
  const task = getLastTranslateTask({ type: "text" });
  if (!task) {
    setVocabularyPopupMode(popup, vocabularyPicker, false);
    return;
  }
  popup.setAttribute("translate-task-id", task.id);

  if (task.audio.length > 0 && getPref("showPlayBtn")) {
    audiobox.innerHTML = "";
    updateHidden(audiobox, false);
    ztoolkit.UI.appendElement(
      {
        tag: "fragment",
        children: task.audio.map((audioData) => ({
          tag: "button",
          namespace: "html",
          classList: ["toolbar-button", "wide-button"],
          attributes: {
            tabindex: "-1",
            title: audioData.text,
          },
          properties: {
            innerHTML: `🔊 ${audioData.text}`,
            onclick: () => {
              new (ztoolkit.getGlobal("Audio"))(audioData.url).play();
            },
          },
          styles: { whiteSpace: "nowrap", flexGrow: "1" },
        })),
      },
      audiobox,
    );
  }

  if (task.audio.length > 0 && getPref("showPlayBtn") && getPref("autoPlay")) {
    const firstAudio = task.audio[0];
    const audio = new (ztoolkit.getGlobal("Audio"))(firstAudio.url);
    audio.play();
  }

  const hideTranslateButton = task.status !== "waiting";
  updateHidden(translateButton, hideTranslateButton);

  switch (task.langto?.split("-")[0]) {
    case "ar":
    case "fa":
    case "he":
      textarea.style.direction = "rtl";
      break;
    default:
      textarea.style.direction = "ltr";
  }

  textarea.hidden = hidePopupTextarea || !hideTranslateButton;
  textarea.value = task.result || task.raw;
  const vi = Zotero.locale.toLowerCase().startsWith("vi");
  if (flashcardStatus) {
    flashcardStatus.textContent = vi
      ? "✓ Đã lưu flashcard"
      : "✓ Saved to flashcards";
    updateHidden(flashcardStatus, !(task.wordLookup && task.flashcardSaved));
  }
  let vocabularyMode = false;
  if (vocabularyPicker) {
    const lookup = (
      task as typeof task & { vocabularyLookup?: VocabularyLookup }
    ).vocabularyLookup;
    const loading =
      !!task.wordLookup &&
      (task.status === "processing" ||
        (task.status === "waiting" && !!getPref("enableAuto"))) &&
      !lookup;
    const isVocabulary = loading || !!lookup?.senses.length;
    const showVocabulary = isVocabulary && !task.flashcardSaved;
    vocabularyMode = isVocabulary;
    setVocabularyPopupMode(popup, vocabularyPicker, showVocabulary);
    updateHidden(vocabularyPicker, !showVocabulary);
    if (isVocabulary) textarea.hidden = true;
    if (showVocabulary) {
      renderVocabularyPicker(
        popup,
        vocabularyPicker,
        flashcardStatus,
        task,
        lookup,
        loading,
        vi,
      );
    }
  }
  textarea.style.fontSize = `${getPref("fontSize")}px`;
  textarea.style.lineHeight = `${
    Number(getPref("lineHeight")) * Number(getPref("fontSize"))
  }px`;

  const enableAddToNote = getPref("enableNote") as boolean;
  if (
    !Zotero.getMainWindow().ZoteroContextPane.activeEditor ||
    !enableAddToNote
  ) {
    updateHidden(addToNoteButton, true);
  }

  if (!vocabularyMode) updatePopupSize(popup, textarea);
}

export function buildReaderPopup(
  event: _ZoteroTypes.Reader.EventParams<"renderTextSelectionPopup">,
) {
  const { reader, doc, append } = event;
  const annotation = event.params.annotation;
  const popup = doc.querySelector(".selection-popup") as HTMLDivElement;
  ensurePopupStyles(doc);
  addon.data.popup.currentPopup = popup;
  popup.setAttribute(
    `${config.addonRef}-prefix`,
    `${config.addonRef}-${reader._instanceID}`,
  );

  const ZoteroContextPane = Zotero.getMainWindow().ZoteroContextPane;

  const colors = popup.querySelector(".colors") as HTMLDivElement;
  colors.style.width = "100%";
  colors.style.justifyContent = "space-evenly";

  const keepSize = getPref("keepPopupSize") as boolean;

  const makeId = (type: string) =>
    `${config.addonRef}-${reader._instanceID}-${type}`;
  const onTextAreaCopy = getOnTextAreaCopy(popup, makeId("text"));

  const hidePopupTextarea = getPref("enableHidePopupTextarea") as boolean;
  append(
    ztoolkit.UI.createElement(doc, "fragment", {
      children: [
        {
          tag: "div",
          id: makeId("vocabulary-picker"),
          classList: [
            `${config.addonRef}-readerpopup`,
            `${config.addonRef}-vocabulary-picker`,
          ],
          styles: {
            display: "none",
          },
          ignoreIfExists: true,
        },
        {
          tag: "div",
          id: makeId("flashcard-status"),
          classList: [
            `${config.addonRef}-readerpopup`,
            `${config.addonRef}-flashcard-status`,
          ],
          styles: {
            display: "none",
          },
          ignoreIfExists: true,
        },
        {
          tag: "div",
          id: makeId("audiobox"),
          classList: [`${config.addonRef}-readerpopup`],
          styles: {
            display: "flex",
            width: "calc(100% - 4px)",
            marginLeft: "2px",
            justifyContent: "space-evenly",
          },
          ignoreIfExists: true,
        },
        {
          tag: "button",
          namespace: "html",
          id: makeId("translate"),
          classList: [
            "toolbar-button",
            "wide-button",
            `${config.addonRef}-readerpopup`,
          ],
          properties: {
            innerHTML: `${SVGIcon}${getString("readerpopup-translate-label")}`,
            hidden: getPref("enableAuto"),
          },
          listeners: [
            {
              type: "click",
              listener: (ev: Event) => {
                addon.hooks.onTranslate({
                  noCheckZoteroItemLanguage: true,
                  noCache: true,
                });
                const button = ev.target as HTMLDivElement;
                button.hidden = true;
                (
                  button.ownerDocument.querySelector(
                    `#${makeId("text")}`,
                  ) as HTMLTextAreaElement
                ).hidden = hidePopupTextarea;
              },
            },
          ],
          ignoreIfExists: true,
        },
        {
          tag: "textarea",
          id: makeId("text"),
          attributes: {
            rows: "3",
            columns: "10",
          },
          classList: [
            `${config.addonRef}-popup-textarea`,
            `${config.addonRef}-readerpopup`,
          ],
          styles: {
            fontSize: `${getPref("fontSize")}px`,
            fontFamily: "inherit",
            lineHeight: `${
              Number(getPref("lineHeight")) * Number(getPref("fontSize"))
            }px`,
            width: keepSize ? `${getPref("popupWidth")}px` : "-moz-available",
            // Minimum width to prevent the textarea from being smaller than the popup
            minWidth: "184px",
            height: `${Math.max(
              keepSize ? Number(getPref("popupHeight")) : 30,
            )}px`,
            marginInline: "2px",
            padding: "5px",
          },
          properties: {
            onpointerup: (e: Event) => e.stopPropagation(),
            ondragstart: (e: Event) => e.stopPropagation(),
            spellcheck: false,
            value: addon.data.translate.selectedText,
          },
          ignoreIfExists: true,
          listeners: [
            {
              type: "mousedown",
              listener: (_ev) => {
                _ev.target?.addEventListener(
                  "mousemove",
                  onTextAreaResize as (ev: Event) => void,
                );
              },
            },
            {
              type: "mouseup",
              listener: (_ev) => {
                _ev.target?.removeEventListener(
                  "mousemove",
                  onTextAreaResize as (ev: Event) => void,
                );
              },
            },
            {
              type: "keydown",
              listener: onTextAreaCopy as (ev: Event) => void,
            },
            {
              type: "dblclick",
              listener: (_ev) => {
                const textarea = popup.querySelector(
                  `#${makeId("text")}`,
                ) as HTMLTextAreaElement;
                textarea.selectionStart = 0;
                textarea.selectionEnd = textarea.value.length;
                const text = textarea.value.slice(
                  textarea.selectionStart,
                  textarea.selectionEnd,
                );
                new ztoolkit.Clipboard().addText(text, "text/plain").copy();
                new ztoolkit.ProgressWindow("Copied to Clipboard")
                  .createLine({
                    text: slice(text, 50),
                    progress: 100,
                    type: "default",
                  })
                  .show();
              },
            },
          ],
        },
        {
          tag: "button",
          namespace: "html",
          id: makeId("addtonote"),
          classList: [
            "toolbar-button",
            "wide-button",
            `${config.addonRef}-readerpopup`,
          ],
          styles: {
            marginTop: "8px",
          },
          properties: {
            innerHTML: `${SVGIcon}${getString("readerpopup-addToNote-label")}`,
          },
          ignoreIfExists: true,
          listeners: [
            {
              type: "click",
              listener: async (ev) => {
                const noteEditor =
                  ZoteroContextPane && ZoteroContextPane.activeEditor;
                if (!noteEditor) {
                  return;
                }
                const editorInstance = noteEditor.getCurrentInstance();
                if (!editorInstance) {
                  return;
                }
                const task = addTranslateTask(
                  addon.data.translate.selectedText,
                  reader.itemID,
                  "addtonote",
                );
                if (!task) {
                  return;
                }
                await addon.hooks.onTranslate(task, {
                  noCheckZoteroItemLanguage: true,
                  noDisplay: true,
                });
                if (task.status !== "success") {
                  return;
                }
                const replaceMode = getPref("enableNoteReplaceMode") as boolean;
                if (replaceMode) {
                  annotation.text = task.result;
                } else {
                  annotation.comment = task.result;
                }
                // @ts-ignore should be fixed in the zotero-types
                reader._addToNote([annotation]);
              },
            },
          ],
        },
      ],
    }),
  );
}

function onTextAreaResize(ev: MouseEvent) {
  if (getPref("keepPopupSize")) {
    const textarea = ev.target as HTMLTextAreaElement;
    setPref("popupWidth", textarea.offsetWidth);
    setPref("popupHeight", textarea.offsetHeight);
  }
}

function getOnTextAreaCopy(selectionMenu: HTMLElement, targetId: string) {
  return (ev: KeyboardEvent) => {
    const textarea = selectionMenu.querySelector(
      `#${targetId}`,
    ) as HTMLTextAreaElement;
    const isMod = ev.ctrlKey || ev.metaKey;
    if (ev.key === "c" && isMod) {
      ztoolkit.getGlobal("setTimeout")(() => {
        new ztoolkit.Clipboard()
          .addText(
            textarea.value.slice(
              textarea.selectionStart,
              textarea.selectionEnd,
            ),
            "text/plain",
          )
          .copy();
      }, 10);
      ev.stopPropagation();
    } else if (ev.key === "a" && isMod) {
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;
      ev.stopPropagation();
    } else if (ev.key === "x" && isMod) {
      new ztoolkit.Clipboard()
        .addText(
          textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
          "text/plain",
        )
        .copy();
      textarea.value = `${textarea.value.slice(
        0,
        textarea.selectionStart,
      )}${textarea.value.slice(textarea.selectionEnd)}`;
      ev.stopPropagation();
    }
  };
}

function updatePopupSize(
  selectionMenu: HTMLDivElement,
  textarea: HTMLTextAreaElement,
  resetSize: boolean = true,
): void {
  const keepSize = getPref("keepPopupSize") as boolean;
  if (keepSize) {
    return;
  }
  if (resetSize) {
    textarea.style.width = "-moz-available";
    textarea.style.height = "30px";
  }
  const viewer = selectionMenu.ownerDocument.body;
  // Get current H & W
  const textHeight = textarea.scrollHeight;
  const textWidth = textarea.scrollWidth;
  const newWidth = textWidth + 20;
  // Check until H/W<0.75 and don't overflow viewer border
  if (
    textHeight / textWidth > 0.75 &&
    selectionMenu.offsetLeft + newWidth < viewer.offsetWidth
  ) {
    // Update width
    textarea.style.width = `${newWidth}px`;
    updatePopupSize(selectionMenu, textarea, false);
    return;
  }
  // Update height
  textarea.style.height = `${textHeight + 3}px`;
}
