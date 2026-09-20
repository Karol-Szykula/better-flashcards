export function mergeClasses(
  ...classes: Array<string | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export const commonWizardClasses = {
  pageView: "flashcards-import-wizard-modal__page-view",
} as const;

export const importWizardClasses = {
  modal: "flashcards-import-wizard-modal",
} as const;

export const pageIndicatorClasses = {
  pageIndicator: "flashcards-import-wizard-modal__page-indicator",
  page: "flashcards-import-wizard-modal__page",
  pageNumber: "flashcards-import-wizard-modal__page-number",
  pageActive: "flashcards-import-wizard-modal__page--active",
  pageDone: "flashcards-import-wizard-modal__page--done",
  pageSeparator: "flashcards-import-wizard-modal__page-separator",
} as const;

export const footerClasses = {
  footer: "flashcards-import-wizard-modal__footer",
  footerRight: "flashcards-import-wizard-modal__footer-right",
  footerCenter: "flashcards-import-wizard-modal__footer-center",
  pageIndicator: "flashcards-import-wizard-modal__footer-page-indicator",
} as const;

export const deckSelectionClasses = {
  deckLabelText: "flashcards-import-wizard-modal__deck-label-text",
  deckRadio: "flashcards-import-wizard-modal__deck-radio",
  deckRow: "flashcards-import-wizard-modal__deck-row",
  deckRowDisabled: "flashcards-import-wizard-modal__deck-row--disabled",
} as const;

export const fieldMappingClasses = {
  modelSection: "flashcards-import-wizard-modal__model-section",
  modelRecognized: "flashcards-import-wizard-modal__model-badge--recognized",
  fieldRow: "flashcards-import-wizard-modal__field-row",
  fieldSample: "flashcards-import-wizard-modal__field-sample",
} as const;

export const cardsPreviewClasses = {
  previewRow: "flashcards-import-wizard-modal__preview-row",
  previewRowImported: "flashcards-import-wizard-modal__preview-row--imported",
  previewBadge: "flashcards-import-wizard-modal__preview-badge",
  previewBadgeNew: "flashcards-import-wizard-modal__preview-badge--new",
  previewBadgeUpdated:
    "flashcards-import-wizard-modal__preview-badge--updated",
  previewBadgeImported:
    "flashcards-import-wizard-modal__preview-badge--imported",
  previewDetails: "flashcards-import-wizard-modal__preview-details",
  previewPagination: "flashcards-import-wizard-modal__preview-pagination",
} as const;
