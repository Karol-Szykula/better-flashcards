export function mergeClasses(
  ...classes: Array<string | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export const flashcardFormClasses = {
  error: "flashcard-form__error",
  field: "flashcard-form__field",
  form: "flashcard-form",
  input: "flashcard-form__input",
  inputReadonly: "flashcard-form__input--readonly",
  label: "flashcard-form__label",
} as const;
