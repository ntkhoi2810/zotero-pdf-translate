/**
 * The PDF reader popup lives in a document that may not load chrome://
 * stylesheets. Keep these rules injectable so the picker also works in the
 * isolated reader document.
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
  border-radius: 14px;
}

.selection-popup.zoteropdftranslate-vocabulary-mode .colors {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.zoteropdftranslate-vocabulary-picker {
  --zpt-fg: var(--fill-primary, #1f1f1f);
  --zpt-fg-2: var(--fill-secondary, #6b6b6b);
  --zpt-fg-3: var(--fill-tertiary, #9a9a9a);
  --zpt-bg: var(--material-background, var(--color-sidepane, #ffffff));
  --zpt-line: color-mix(in srgb, var(--zpt-fg) 9%, transparent);
  --zpt-line-strong: color-mix(in srgb, var(--zpt-fg) 22%, transparent);
  --zpt-tint: color-mix(in srgb, var(--zpt-fg) 3.5%, transparent);
  --zpt-tint-hover: color-mix(in srgb, var(--zpt-fg) 6%, transparent);
  --zpt-accent: #d97757;
  --zpt-danger: #c2410c;
  --zpt-radius-card: 12px;
  --zpt-radius-ctl: 10px;
  --zpt-ease: cubic-bezier(.2, .8, .2, 1);
  --zpt-dur: 160ms;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  max-height: calc(100vh - 100px);
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--zpt-line);
  background: var(--zpt-bg);
  color: var(--zpt-fg);
  font: inherit;
  white-space: normal;
  animation: zpt-picker-enter 180ms var(--zpt-ease) both;
}

.zoteropdftranslate-vocab-head {
  display: flex;
  min-width: 0;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 12px;
}

.zoteropdftranslate-vocab-row1,
.zoteropdftranslate-vocab-row2 {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.zoteropdftranslate-vocab-identity {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.zoteropdftranslate-vocab-word {
  overflow-wrap: anywhere;
  color: var(--zpt-fg);
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -.01em;
  line-height: 1.2;
}

.zoteropdftranslate-vocab-ipa {
  flex: none;
  color: var(--zpt-fg-3);
  font-size: 13px;
}

.zoteropdftranslate-status-chip {
  display: inline-flex;
  height: 22px;
  max-width: 48%;
  flex: none;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  padding: 0 9px;
  overflow: hidden;
  border: 1px solid var(--zpt-line);
  border-radius: 999px;
  background: var(--zpt-tint);
  color: var(--zpt-fg-2);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zoteropdftranslate-status-dot,
.zoteropdftranslate-error-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--zpt-fg-3);
}

.zoteropdftranslate-status-chip.is-normalized .zoteropdftranslate-status-dot {
  background: var(--zpt-accent);
}

.zoteropdftranslate-status-chip.is-error .zoteropdftranslate-status-dot,
.zoteropdftranslate-error-dot {
  background: var(--zpt-danger);
}

.zoteropdftranslate-status-chip.is-loading .zoteropdftranslate-status-dot {
  animation: zpt-pulse 1.2s ease-in-out infinite;
}

.zoteropdftranslate-vocab-hint {
  min-width: 0;
  color: var(--zpt-fg-3);
  font-size: 12px;
}

.zoteropdftranslate-vocab-counter {
  flex: none;
  color: var(--zpt-fg-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.zoteropdftranslate-vocab-list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.zoteropdftranslate-sense-card {
  display: grid;
  contain: layout paint;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  overflow: hidden;
  border: 1px solid var(--zpt-line);
  border-radius: var(--zpt-radius-card);
  background: transparent;
  color: var(--zpt-fg);
  cursor: pointer;
  animation: zpt-card-enter 200ms var(--zpt-ease) both;
  animation-delay: calc(var(--zpt-card-index, 0) * 28ms);
  transition:
    background-color 120ms var(--zpt-ease),
    border-color 140ms var(--zpt-ease),
    opacity 140ms var(--zpt-ease);
}

.zoteropdftranslate-sense-card:hover {
  background: var(--zpt-tint);
}

.zoteropdftranslate-sense-card.is-selected {
  border-color: var(--zpt-line-strong);
  background: var(--zpt-tint-hover);
}

.zoteropdftranslate-sense-card.is-limit-reached {
  opacity: .45;
  cursor: default;
}

.zoteropdftranslate-sense-card.is-unavailable {
  opacity: .6;
  cursor: default;
}

.zoteropdftranslate-sense-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

.zoteropdftranslate-check {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  box-sizing: border-box;
  margin-top: 1px;
  border: 1.5px solid var(--zpt-line-strong);
  border-radius: 6px;
}

.zoteropdftranslate-check-mark {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  border-radius: 5px;
  background: var(--zpt-fg);
  color: var(--zpt-bg);
  opacity: 0;
  transform: scale(.6);
  transition:
    opacity 140ms var(--zpt-ease),
    transform 140ms var(--zpt-ease);
}

.zoteropdftranslate-check-mark svg {
  width: 12px;
  height: 12px;
}

.zoteropdftranslate-sense-input:checked + .zoteropdftranslate-check .zoteropdftranslate-check-mark {
  opacity: 1;
  transform: scale(1);
}

.zoteropdftranslate-sense-input:focus-visible + .zoteropdftranslate-check {
  outline: 2px solid color-mix(in srgb, var(--zpt-fg) 35%, transparent);
  outline-offset: 2px;
}

.zoteropdftranslate-sense-content {
  display: flex;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  gap: 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.zoteropdftranslate-sense-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--zpt-fg-2);
  font-size: 11px;
  line-height: 1.4;
  text-transform: lowercase;
}

.zoteropdftranslate-cefr-chip {
  padding: 1px 6px;
  border: 1px solid var(--zpt-line);
  border-radius: 6px;
  color: var(--zpt-fg-2);
  line-height: 1.25;
  text-transform: uppercase;
}

.zoteropdftranslate-sense-meaning-vi {
  color: var(--zpt-fg);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.zoteropdftranslate-sense-meaning-en {
  color: var(--zpt-fg-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.zoteropdftranslate-sense-example {
  display: -webkit-box;
  overflow: hidden;
  color: var(--zpt-fg-3);
  font-size: 12px;
  font-style: normal;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.zoteropdftranslate-vocab-foot {
  flex: none;
  padding: 12px 16px 13px;
  border-top: 1px solid var(--zpt-line);
  background: var(--zpt-bg);
}

.zoteropdftranslate-save-senses {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  overflow: hidden;
  border: 0;
  border-radius: var(--zpt-radius-ctl);
  background: var(--zpt-fg);
  color: var(--zpt-bg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: transform 80ms var(--zpt-ease);
}

.zoteropdftranslate-save-senses:active:not(:disabled) {
  transform: scale(.98);
}

.zoteropdftranslate-save-senses:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--zpt-fg) 35%, transparent);
  outline-offset: 2px;
}

.zoteropdftranslate-save-senses:disabled {
  background: var(--zpt-tint-hover);
  color: var(--zpt-fg-3);
  cursor: default;
}

.zoteropdftranslate-vocab-source {
  display: block;
  max-width: 100%;
  margin-top: 8px;
  overflow-wrap: anywhere;
  color: var(--zpt-fg-3);
  font-size: 11px;
  text-align: center;
  text-decoration: none;
}

.zoteropdftranslate-vocab-source:hover {
  color: var(--zpt-fg-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.zoteropdftranslate-vocab-error {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr);
  gap: 7px 8px;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  overflow-wrap: anywhere;
  border: 1px solid color-mix(in srgb, var(--zpt-danger) 28%, transparent);
  border-radius: 10px;
  background: var(--zpt-tint);
  color: var(--zpt-fg-2);
  font-size: 12px;
  line-height: 1.4;
}

.zoteropdftranslate-error-dot {
  margin-top: 5px;
}

.zoteropdftranslate-vocab-error-actions {
  display: flex;
  grid-column: 2;
  gap: 12px;
}

.zoteropdftranslate-vocab-error-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--zpt-fg-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.zoteropdftranslate-vocab-error-action.is-primary {
  color: var(--zpt-fg);
  font-weight: 600;
}

.zoteropdftranslate-vocab-error-action:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.zoteropdftranslate-vocab-error-action:disabled {
  color: var(--zpt-fg-3);
  cursor: default;
  text-decoration: none;
}

.zoteropdftranslate-skeleton-card {
  display: flex;
  min-height: 72px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 12px 14px 12px 44px;
  border: 1px solid var(--zpt-line);
  border-radius: var(--zpt-radius-card);
  animation: zpt-pulse 1.2s ease-in-out infinite;
}

.zoteropdftranslate-skeleton-line {
  height: 7px;
  border-radius: 6px;
  background: var(--zpt-tint-hover);
}

.zoteropdftranslate-skeleton-line:nth-child(1) { width: 35%; }
.zoteropdftranslate-skeleton-line:nth-child(2) { width: 85%; }
.zoteropdftranslate-skeleton-line:nth-child(3) { width: 60%; }

.zoteropdftranslate-vocabulary-picker.is-leaving {
  animation: zpt-picker-leave 160ms var(--zpt-ease) both;
}

.zoteropdftranslate-flashcard-status {
  margin: 7px 9px;
  padding: 7px 9px;
  overflow-wrap: anywhere;
  border-radius: 8px;
  background: color-mix(in srgb, var(--fill-primary, #1f1f1f) 6%, transparent);
  color: var(--fill-secondary, #6b6b6b);
  font-size: 12px;
}

.zoteropdftranslate-popup-textarea {
  box-sizing: border-box;
  max-width: calc(100vw - 28px);
  margin: 6px 2px !important;
  border: 1px solid color-mix(in srgb, var(--fill-primary, #1f1f1f) 9%, transparent) !important;
  border-radius: 10px !important;
  background: color-mix(in srgb, var(--fill-primary, #1f1f1f) 3.5%, transparent) !important;
  color: var(--fill-primary, #1f1f1f) !important;
}

.selection-popup > .zoteropdftranslate-readerpopup.toolbar-button,
.zoteropdftranslate-readerpopup .toolbar-button {
  max-width: calc(100vw - 28px);
  margin-inline: 2px;
  overflow: hidden;
  border-radius: 10px;
  text-overflow: ellipsis;
}

@keyframes zpt-picker-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes zpt-card-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes zpt-picker-leave {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(4px); }
}

@keyframes zpt-pulse {
  0%, 100% { opacity: .55; }
  50% { opacity: 1; }
}

@media (max-width: 520px) {
  .selection-popup.zoteropdftranslate-vocabulary-mode {
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px) !important;
  }

  .zoteropdftranslate-vocab-head {
    padding: 12px;
  }

  .zoteropdftranslate-vocab-list {
    padding: 0 8px 8px;
  }

  .zoteropdftranslate-vocab-foot {
    padding: 10px 12px 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .zoteropdftranslate-vocabulary-picker,
  .zoteropdftranslate-vocabulary-picker *,
  .zoteropdftranslate-vocabulary-picker *::before,
  .zoteropdftranslate-vocabulary-picker *::after {
    animation: none !important;
    transition: none !important;
  }
}
`;
