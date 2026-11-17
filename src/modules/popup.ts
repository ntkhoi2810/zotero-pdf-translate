import { SVGIcon } from "../utils/config";
import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { addTranslateTask, getLastTranslateTask } from "../utils/task";
import { slice } from "../utils/str";
import { saveVocabularySensesFromTask } from "./flashcards/storage";
import type { VocabularyLookup } from "./dictionary/model";

function ensurePopupStyles(doc: Document) {
  const id = `${config.addonRef}-reader-popup-styles`;
  if (doc.getElementById(id)) return;
  const link = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "link",
  ) as HTMLLinkElement;
  link.id = id;
  link.rel = "stylesheet";
  link.href = `chrome://${config.addonRef}/content/styles/readerPopup.css`;
  doc.head?.append(link);
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
  if (flashcardStatus) {
    const vi = Zotero.locale.toLowerCase().startsWith("vi");
    if (task.wordLookup && task.status === "waiting" && getPref("enableAuto")) {
      flashcardStatus.textContent = vi
        ? "Đang gọi LLM để chuẩn hóa từ vựng…"
        : "Calling the LLM to normalize vocabulary…";
      updateHidden(flashcardStatus, false);
    } else {
      flashcardStatus.textContent = vi
        ? "✓ Đã lưu flashcard"
        : "✓ Saved to flashcards";
      updateHidden(flashcardStatus, !(task.wordLookup && task.flashcardSaved));
    }
  }
  if (vocabularyPicker) {
    const lookup = (
      task as typeof task & { vocabularyLookup?: VocabularyLookup }
    ).vocabularyLookup;
    vocabularyPicker.replaceChildren();
    const isVocabulary = !!lookup?.senses.length;
    updateHidden(vocabularyPicker, !isVocabulary);
    if (isVocabulary) textarea.hidden = true;
    if (lookup?.senses.length) {
      const doc = vocabularyPicker.ownerDocument;
      const vi = Zotero.locale.toLowerCase().startsWith("vi");
      const create = <K extends keyof HTMLElementTagNameMap>(tag: K) =>
        doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          tag,
        ) as HTMLElementTagNameMap[K];
      const header = create("header");
      header.className = `${config.addonRef}-vocab-header`;
      const heading = create("div");
      const title = create("strong");
      title.textContent = lookup.word;
      const subtitle = create("span");
      subtitle.textContent = vi
        ? "Chọn tối đa 2 nghĩa để lưu"
        : "Select up to 2 meanings";
      heading.append(title, subtitle);
      const badge = create("span");
      badge.className = `${config.addonRef}-status-badge`;
      badge.textContent =
        lookup.normalizationStatus === "normalized"
          ? vi
            ? "Đã chuẩn hóa bằng AI"
            : "AI normalized"
          : vi
            ? "Dữ liệu thô"
            : "Raw data";
      header.append(heading, badge);
      vocabularyPicker.append(header);

      if (lookup.llmError) {
        const errorBox = create("div");
        errorBox.className = `${config.addonRef}-vocab-error`;
        const message = create("span");
        message.textContent = `${vi ? "Không thể chuẩn hóa" : "Normalization failed"}: ${lookup.llmError}`;
        const retry = create("button");
        retry.type = "button";
        retry.textContent = vi ? "Thử lại" : "Retry";
        retry.addEventListener("click", async () => {
          retry.disabled = true;
          retry.textContent = vi ? "Đang xử lý…" : "Working…";
          task.status = "waiting";
          task.result = "";
          delete (task as typeof task & { vocabularyLookup?: VocabularyLookup })
            .vocabularyLookup;
          await addon.hooks.onTranslate(task, {
            noCheckZoteroItemLanguage: true,
            noCache: true,
          });
        });
        const actions = create("span");
        actions.className = `${config.addonRef}-vocab-error-actions`;
        const configure = create("button");
        configure.type = "button";
        configure.textContent = vi ? "Cấu hình" : "Configure";
        configure.addEventListener("click", () => {
          Zotero.Utilities.Internal.openPreferences(config.addonID);
        });
        actions.append(configure, retry);
        errorBox.append(message, actions);
        vocabularyPicker.append(errorBox);
      }

      const selected = new Set<string>();
      const normalized = lookup.normalizationStatus === "normalized";
      lookup.senses.forEach((sense, index) => {
        const label = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "label",
        );
        label.className = `${config.addonRef}-sense-card`;
        const checkbox = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "input",
        ) as HTMLInputElement;
        checkbox.type = "checkbox";
        checkbox.disabled = !normalized;
        checkbox.checked = normalized && index < 2;
        if (checkbox.checked) {
          selected.add(sense.id);
          label.classList.add("selected");
        }
        const content = create("span");
        content.className = `${config.addonRef}-sense-content`;
        const meta = create("span");
        meta.className = `${config.addonRef}-sense-meta`;
        meta.textContent = `${sense.partOfSpeech} · ${
          sense.cefrLevel === "unknown" ? "CEFR ?" : `~${sense.cefrLevel}`
        }${sense.pronunciation ? ` · ${sense.pronunciation}` : ""}`;
        const meaningVi = create("strong");
        meaningVi.textContent =
          sense.meaningVi ||
          (vi ? "Chưa có nghĩa Việt" : "No Vietnamese meaning");
        const meaningEn = create("span");
        meaningEn.textContent = sense.meaningEn;
        content.append(meta, meaningVi, meaningEn);
        if (sense.example) {
          const example = create("em");
          example.textContent = sense.example;
          content.append(example);
        }
        label.append(checkbox, content);
        vocabularyPicker.append(label);
        checkbox.addEventListener("change", () => {
          label.classList.toggle("selected", checkbox.checked);
          if (checkbox.checked) selected.add(sense.id);
          else selected.delete(sense.id);
          vocabularyPicker
            .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
            .forEach((candidate) => {
              candidate.disabled =
                !normalized || (!candidate.checked && selected.size >= 2);
            });
          save.disabled = selected.size === 0 || !normalized;
          save.textContent = vi
            ? `Lưu ${selected.size} nghĩa`
            : `Save ${selected.size} meaning${selected.size === 1 ? "" : "s"}`;
        });
      });
      if (normalized && selected.size >= 2) {
        vocabularyPicker
          .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
          .forEach((candidate) => {
            candidate.disabled = !candidate.checked;
          });
      }
      const save = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "button",
      ) as HTMLButtonElement;
      save.className = `toolbar-button wide-button ${config.addonRef}-save-senses`;
      save.disabled = !normalized || selected.size === 0;
      save.textContent = vi
        ? `Lưu ${selected.size} nghĩa`
        : `Save ${selected.size} meanings`;
      save.addEventListener("click", async () => {
        save.disabled = true;
        const saved = await saveVocabularySensesFromTask(task, [...selected]);
        flashcardStatus.textContent = Zotero.locale.startsWith("vi")
          ? saved
            ? `✓ Đã lưu flashcard với ${selected.size} nghĩa`
            : "Không thể lưu flashcard"
          : saved
            ? `✓ Saved a flashcard with ${selected.size} meanings`
            : "Could not save flashcard";
        updateHidden(flashcardStatus, !saved);
        if (saved) updateHidden(vocabularyPicker, true);
      });
      vocabularyPicker.append(save);

      const source = create("a");
      source.className = `${config.addonRef}-vocab-source`;
      source.href = lookup.sourceUrl;
      source.target = "_blank";
      source.rel = "noreferrer";
      source.textContent = `FreeDictionaryAPI · ${lookup.sourceLicense}`;
      vocabularyPicker.append(source);
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

  updatePopupSize(popup, textarea);
}

export function buildReaderPopup(
  event: _ZoteroTypes.Reader.EventParams<"renderTextSelectionPopup">,
) {
  const { reader, doc, append } = event;
  const annotation = event.params.annotation;
  const popup = doc.querySelector(".selection-popup") as HTMLDivElement;
  ensurePopupStyles(doc);
  addon.data.popup.currentPopup = popup;
  popup.style.maxWidth = "none";
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
            padding: "6px 9px",
            color: "var(--color-accent-blue)",
            fontSize: "12px",
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
            border: "none",
            background: "var(--color-sidepane)",
            borderRadius: "6px",
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
