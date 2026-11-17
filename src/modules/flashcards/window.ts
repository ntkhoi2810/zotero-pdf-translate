import { config } from "../../../package.json";
import {
  deleteFlashcard,
  exportFlashcardsAnkiTSV,
  exportFlashcardsCSV,
  Flashcard,
  getFlashcardFilePath,
  readFlashcards,
  updateFlashcard,
} from "./storage";

let flashcardWindow: Window | null = null;

function labels() {
  const vi = Zotero.locale.toLowerCase().startsWith("vi");
  return vi
    ? {
        count: (count: number) => `${count} thẻ`,
        empty: "Chưa có từ vựng. Hãy tra một từ để tạo thẻ đầu tiên.",
        deletePrompt: "Xóa flashcard này?",
        exportTitle: "Xuất flashcard sang CSV",
        exportAnkiTitle: "Xuất flashcard cho Anki",
        exported: (count: number) => `Đã xuất ${count} thẻ.`,
        saveError: "Không thể lưu thay đổi.",
        loadError: "Không thể đọc kho flashcard.",
        path: "Dữ liệu: ",
        export: "Xuất CSV",
        exportAnki: "Xuất Anki TSV",
        library: "Thư viện",
        review: "Ôn tập",
        search: "Tìm từ và nghĩa…",
        shuffle: "Xáo trộn",
        reviewEmpty: "Không có thẻ để ôn.",
        reveal: "Bấm hoặc nhấn Space để xem nghĩa",
        previous: "← Trước",
        next: "Tiếp →",
      }
    : {
        count: (count: number) => `${count} cards`,
        empty: "No vocabulary yet. Look up a word to create your first card.",
        deletePrompt: "Delete this flashcard?",
        exportTitle: "Export flashcards to CSV",
        exportAnkiTitle: "Export flashcards for Anki",
        exported: (count: number) => `Exported ${count} cards.`,
        saveError: "Could not save changes.",
        loadError: "Could not read the flashcard library.",
        path: "Data: ",
        export: "Export CSV",
        exportAnki: "Export Anki TSV",
        library: "Library",
        review: "Review",
        search: "Search words and meanings…",
        shuffle: "Shuffle",
        reviewEmpty: "No cards to review.",
        reveal: "Click or press Space to reveal",
        previous: "← Previous",
        next: "Next →",
      };
}

export function openFlashcards() {
  if (flashcardWindow && !flashcardWindow.closed) {
    flashcardWindow.focus();
    return;
  }
  flashcardWindow = ztoolkit.getGlobal("openDialog")(
    `chrome://${config.addonRef}/content/flashcards.xhtml`,
    `${config.addonRef}-flashcards`,
    "chrome,extrachrome,centerscreen,resizable=yes,scrollbars,status,dialog=no",
  ) as Window;
}

export async function initializeFlashcardWindow(win: Window) {
  flashcardWindow = win;
  const doc = win.document;
  const state: {
    cards: Flashcard[];
    filtered: Flashcard[];
    reviewIndex: number;
    revealed: boolean;
  } = { cards: [], filtered: [], reviewIndex: 0, revealed: false };
  const text = labels();

  const query = <T extends Element>(selector: string) =>
    doc.querySelector(selector) as T;
  const createHTML = <K extends keyof HTMLElementTagNameMap>(tag: K) =>
    doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      tag,
    ) as HTMLElementTagNameMap[K];
  const vi = Zotero.locale.toLowerCase().startsWith("vi");
  const formatSense = (
    sense: NonNullable<Flashcard["senses"]>[number],
    index: number,
  ) =>
    [
      `${index + 1}. [${sense.partOfSpeech}]${
        sense.cefrLevel === "unknown" ? "" : ` · ${sense.cefrLevel}`
      }`,
      sense.meaningVi,
      sense.meaningEn,
      sense.example ? `${vi ? "Ví dụ" : "Example"}: ${sense.example}` : "",
      sense.synonyms?.length
        ? `${vi ? "Đồng nghĩa" : "Synonyms"}: ${sense.synonyms.join(", ")}`
        : "",
      sense.antonyms?.length
        ? `${vi ? "Trái nghĩa" : "Antonyms"}: ${sense.antonyms.join(", ")}`
        : "",
      sense.tags?.length
        ? `${vi ? "Nhãn" : "Labels"}: ${sense.tags.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  const listView = query<HTMLElement>("#flashcard-list-view");
  const reviewView = query<HTMLElement>("#flashcard-review-view");
  const search = query<HTMLInputElement>("#flashcard-search");
  const list = query<HTMLElement>("#flashcard-list");
  const empty = query<HTMLElement>("#flashcard-empty");
  const count = query<HTMLElement>("#flashcard-count");
  const error = query<HTMLElement>("#flashcard-error");

  const showError = (message: string) => {
    error.textContent = message;
    error.hidden = false;
  };

  const showList = () => {
    listView.hidden = false;
    reviewView.hidden = true;
    query("#flashcard-tab-list").classList.add("active");
    query("#flashcard-tab-review").classList.remove("active");
  };

  const currentReviewCard = () => state.filtered[state.reviewIndex];

  const renderReview = () => {
    const card = currentReviewCard();
    const reviewCard = query<HTMLElement>("#flashcard-review-card");
    const reviewEmpty = query<HTMLElement>("#flashcard-review-empty");
    reviewCard.hidden = !card;
    reviewEmpty.hidden = !!card;
    if (!card) return;
    const senses = card.senses || [];
    const pronunciations = [...new Set(senses.map((s) => s.pronunciation))]
      .filter(Boolean)
      .join(" · ");
    query<HTMLElement>("#flashcard-review-word").textContent = [
      card.word,
      pronunciations,
    ]
      .filter(Boolean)
      .join("\n");
    query<HTMLElement>("#flashcard-review-meaning").textContent = [
      senses.length && !card.meaningEdited
        ? senses.map(formatSense).join("\n\n")
        : card.meaning,
    ]
      .filter(Boolean)
      .join("\n\n");
    query<HTMLElement>("#flashcard-review-meaning").hidden = !state.revealed;
    query<HTMLElement>("#flashcard-review-hint").hidden = state.revealed;
    query<HTMLElement>("#flashcard-review-progress").textContent =
      `${state.reviewIndex + 1} / ${state.filtered.length}`;
  };

  const showReview = () => {
    listView.hidden = true;
    reviewView.hidden = false;
    query("#flashcard-tab-list").classList.remove("active");
    query("#flashcard-tab-review").classList.add("active");
    state.reviewIndex = Math.min(state.reviewIndex, state.filtered.length - 1);
    if (state.reviewIndex < 0) state.reviewIndex = 0;
    state.revealed = false;
    renderReview();
  };

  const createCardRow = (card: Flashcard) => {
    const row = createHTML("article");
    row.className = "flashcard-row";
    const content = createHTML("button");
    content.className = "flashcard-row-content";
    const word = createHTML("strong");
    word.textContent = card.word;
    const meaning = createHTML("span");
    meaning.textContent = card.meaning;
    const meta = createHTML("small");
    const firstSense = card.senses?.[0];
    meta.textContent = [
      firstSense?.partOfSpeech || card.partOfSpeech,
      firstSense?.pronunciation || card.pronunciation,
      card.senses?.length ? `${card.senses.length} meanings` : "",
      `${card.langFrom || "?"} → ${card.langTo || "?"}`,
      `${card.lookupCount}×`,
    ]
      .filter(Boolean)
      .join(" · ");
    content.append(word, meaning, meta);

    const editor = createHTML("form");
    editor.className = "flashcard-editor";
    editor.hidden = true;
    const wordInput = createHTML("input");
    wordInput.value = card.word;
    wordInput.required = true;
    const meaningInput = createHTML("textarea");
    meaningInput.value = card.meaning;
    meaningInput.required = true;
    meaningInput.rows = 5;
    const actions = createHTML("div");
    actions.className = "flashcard-editor-actions";
    const save = createHTML("button");
    save.type = "submit";
    save.textContent = Zotero.locale.startsWith("vi") ? "Lưu" : "Save";
    const remove = createHTML("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = Zotero.locale.startsWith("vi") ? "Xóa" : "Delete";
    actions.append(save, remove);
    editor.append(wordInput, meaningInput, actions);
    content.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      if (!editor.hidden) wordInput.focus();
    });
    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!wordInput.value.trim() || !meaningInput.value.trim()) return;
      try {
        await updateFlashcard(card.id, {
          word: wordInput.value,
          meaning: meaningInput.value,
        });
        await load();
      } catch (cause) {
        ztoolkit.log(cause);
        showError(text.saveError);
      }
    });
    remove.addEventListener("click", async () => {
      if (!win.confirm(text.deletePrompt)) return;
      await deleteFlashcard(card.id);
      await load();
    });
    row.append(content, editor);
    return row;
  };

  const renderList = () => {
    const term = search.value.normalize("NFKC").trim().toLocaleLowerCase();
    state.filtered = state.cards.filter((card) => {
      const structured = (card.senses || [])
        .flatMap((sense) => [
          sense.partOfSpeech,
          sense.pronunciation,
          sense.meaningEn,
          sense.meaningVi,
          sense.example,
          ...(sense.synonyms || []),
          ...(sense.antonyms || []),
          ...(sense.tags || []),
        ])
        .join("\n");
      return `${card.word}\n${card.meaning}\n${structured}`
        .toLocaleLowerCase()
        .includes(term);
    });
    count.textContent = text.count(state.filtered.length);
    list.replaceChildren(...state.filtered.map(createCardRow));
    empty.hidden = state.filtered.length > 0;
    empty.textContent = text.empty;
  };

  const load = async () => {
    try {
      error.hidden = true;
      state.cards = (await readFlashcards()).cards;
      renderList();
      if (!reviewView.hidden) renderReview();
    } catch (cause) {
      ztoolkit.log(cause);
      showError(`${text.loadError} ${String(cause)}`);
    }
  };

  query<HTMLElement>("#flashcard-data-path").textContent =
    text.path + getFlashcardFilePath();
  query<HTMLButtonElement>("#flashcard-export").textContent = text.export;
  query<HTMLButtonElement>("#flashcard-export-anki").textContent =
    text.exportAnki;
  query<HTMLButtonElement>("#flashcard-tab-list").textContent = text.library;
  query<HTMLButtonElement>("#flashcard-tab-review").textContent = text.review;
  search.placeholder = text.search;
  query<HTMLButtonElement>("#flashcard-shuffle").textContent = text.shuffle;
  query<HTMLElement>("#flashcard-review-empty").textContent = text.reviewEmpty;
  query<HTMLElement>("#flashcard-review-hint").textContent = text.reveal;
  query<HTMLButtonElement>("#flashcard-prev").textContent = text.previous;
  query<HTMLButtonElement>("#flashcard-next").textContent = text.next;
  search.addEventListener("input", renderList);
  query("#flashcard-tab-list").addEventListener("click", showList);
  query("#flashcard-tab-review").addEventListener("click", showReview);
  query("#flashcard-review-card").addEventListener("click", () => {
    state.revealed = !state.revealed;
    renderReview();
  });
  query("#flashcard-prev").addEventListener("click", () => {
    if (!state.filtered.length) return;
    state.reviewIndex =
      (state.reviewIndex - 1 + state.filtered.length) % state.filtered.length;
    state.revealed = false;
    renderReview();
  });
  query("#flashcard-next").addEventListener("click", () => {
    if (!state.filtered.length) return;
    state.reviewIndex = (state.reviewIndex + 1) % state.filtered.length;
    state.revealed = false;
    renderReview();
  });
  query("#flashcard-shuffle").addEventListener("click", () => {
    state.filtered.sort(() => Math.random() - 0.5);
    state.reviewIndex = 0;
    state.revealed = false;
    renderReview();
  });
  query("#flashcard-export").addEventListener("click", async () => {
    try {
      const filePath = await new ztoolkit.FilePicker(
        text.exportTitle,
        "save",
        [["CSV", "*.csv"]],
        `zotero-flashcards-${new Date().toISOString().slice(0, 10)}.csv`,
        win,
      ).open();
      if (!filePath) return;
      const exported = await exportFlashcardsCSV(filePath);
      new ztoolkit.ProgressWindow("Flashcards")
        .createLine({ text: text.exported(exported), progress: 100 })
        .show();
    } catch (cause) {
      ztoolkit.log(cause);
      showError(text.saveError);
    }
  });
  query("#flashcard-export-anki").addEventListener("click", async () => {
    try {
      const filePath = await new ztoolkit.FilePicker(
        text.exportAnkiTitle,
        "save",
        [["TSV", "*.tsv"]],
        `zotero-flashcards-anki-${new Date().toISOString().slice(0, 10)}.tsv`,
        win,
      ).open();
      if (!filePath) return;
      const exported = await exportFlashcardsAnkiTSV(filePath);
      new ztoolkit.ProgressWindow("Flashcards")
        .createLine({ text: text.exported(exported), progress: 100 })
        .show();
    } catch (cause) {
      ztoolkit.log(cause);
      showError(text.saveError);
    }
  });
  win.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA"].includes(target.tagName) || reviewView.hidden)
      return;
    if (event.key === " ") {
      event.preventDefault();
      state.revealed = !state.revealed;
      renderReview();
    } else if (event.key === "ArrowLeft") {
      (query("#flashcard-prev") as HTMLButtonElement).click();
    } else if (event.key === "ArrowRight") {
      (query("#flashcard-next") as HTMLButtonElement).click();
    }
  });
  win.addEventListener("unload", () => {
    if (flashcardWindow === win) flashcardWindow = null;
  });
  await load();
}
