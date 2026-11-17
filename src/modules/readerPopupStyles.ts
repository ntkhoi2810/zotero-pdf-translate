/**
 * The PDF reader popup lives in a document that may not load chrome://
 * stylesheets. Keep these rules inline so the layout cannot fall back to raw
 * HTML when Zotero changes the reader document or its CSP.
 */
export function getResponsivePopupWidth(viewportWidth: number) {
  const viewport = Math.max(0, Math.floor(viewportWidth));
  return Math.max(
    0,
    Math.min(440, Math.max(280, viewport - 24), Math.max(0, viewport - 16)),
  );
}

export const READER_POPUP_STYLES = String.raw`
.selection-popup.zoteropdftranslate-vocabulary-mode {
  box-sizing: border-box;
  width: 440px;
  max-width: calc(100vw - 24px) !important;
  overflow: hidden;
  color: var(--fill-primary, #202124);
}

.selection-popup.zoteropdftranslate-vocabulary-mode .colors {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.zoteropdftranslate-vocabulary-picker {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  max-height: calc(100vh - 100px);
  padding: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  border-top: 1px solid var(--fill-quinary, #dfe3e8);
  background: var(--material-background, var(--color-sidepane, #fff));
  color: var(--fill-primary, #202124);
  white-space: normal;
}

.zoteropdftranslate-vocab-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
  margin-bottom: 10px;
}

.zoteropdftranslate-vocab-header > div {
  display: flex;
  min-width: 0;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 2px;
}

.zoteropdftranslate-vocab-header strong {
  overflow-wrap: anywhere;
  font-size: 20px;
  line-height: 1.2;
}

.zoteropdftranslate-vocab-header span,
.zoteropdftranslate-vocab-source {
  color: var(--fill-secondary, #646b75);
  font-size: 11px;
}

.zoteropdftranslate-status-badge {
  flex: 0 1 auto;
  max-width: 100%;
  padding: 4px 7px;
  overflow-wrap: anywhere;
  border-radius: 999px;
  background: var(--accent-blue10, rgba(49, 95, 203, 0.12));
  color: var(--color-accent-blue, #315fcb) !important;
}

.zoteropdftranslate-vocab-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  margin-bottom: 9px;
  padding: 8px 10px;
  overflow-wrap: anywhere;
  border: 1px solid var(--color-red50, #d38b84);
  border-radius: 8px;
  background: var(--color-red10, rgba(180, 35, 24, 0.08));
  color: var(--color-red70, #9f2d24);
  font-size: 12px;
}

.zoteropdftranslate-vocab-error > span:first-child {
  min-width: 0;
  flex: 1 1 220px;
}

.zoteropdftranslate-vocab-error-actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: 5px;
}

.zoteropdftranslate-sense-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: flex-start;
  gap: 9px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 7px 0;
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--fill-quinary, #dfe3e8);
  border-radius: 10px;
  background: var(--material-background-quinary, rgba(127, 127, 127, 0.08));
  cursor: pointer;
}

.zoteropdftranslate-sense-card.selected {
  border-color: var(--color-accent-blue, #315fcb);
  box-shadow: 0 0 0 1px var(--color-accent-blue, #315fcb);
}

.zoteropdftranslate-sense-card input {
  flex: none;
  margin-top: 3px;
}

.zoteropdftranslate-sense-content {
  display: flex;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  gap: 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
  line-height: 1.35;
}

.zoteropdftranslate-sense-meta {
  color: var(--color-accent-blue, #315fcb);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.zoteropdftranslate-sense-content strong {
  font-size: 13px;
}

.zoteropdftranslate-sense-content > span:not(.zoteropdftranslate-sense-meta),
.zoteropdftranslate-sense-content em {
  color: var(--fill-secondary, #646b75);
  font-size: 12px;
}

.zoteropdftranslate-sense-content em {
  padding-left: 8px;
  border-left: 2px solid var(--fill-quinary, #dfe3e8);
}

.zoteropdftranslate-save-senses {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin-top: 4px;
  overflow: hidden;
  border-color: var(--color-accent-blue, #315fcb) !important;
  background: var(--color-accent-blue, #315fcb) !important;
  color: #fff !important;
  text-overflow: ellipsis;
}

.zoteropdftranslate-vocab-source {
  display: block;
  max-width: 100%;
  margin-top: 9px;
  overflow-wrap: anywhere;
  text-align: center;
  text-decoration: none;
}

.zoteropdftranslate-flashcard-status {
  margin: 7px 9px;
  padding: 7px 9px !important;
  overflow-wrap: anywhere;
  border-radius: 7px;
  background: var(--accent-blue10, rgba(49, 95, 203, 0.12));
}

.zoteropdftranslate-popup-textarea {
  box-sizing: border-box;
  max-width: calc(100vw - 28px);
  margin: 6px 2px !important;
  border: 1px solid var(--fill-quinary, #dfe3e8) !important;
  border-radius: 9px !important;
  background: var(--material-background-quinary, var(--color-sidepane, #fff)) !important;
  color: var(--fill-primary, #202124) !important;
}

.selection-popup > .zoteropdftranslate-readerpopup.toolbar-button {
  max-width: calc(100vw - 28px);
  margin-inline: 2px;
  overflow: hidden;
  border-radius: 8px;
  text-overflow: ellipsis;
}

@media (max-width: 520px) {
  .selection-popup.zoteropdftranslate-vocabulary-mode {
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px) !important;
  }

  .zoteropdftranslate-vocabulary-picker {
    padding: 9px;
  }

  .zoteropdftranslate-vocab-header,
  .zoteropdftranslate-vocab-error {
    align-items: stretch;
    flex-direction: column;
  }
}
`;
