/**
 * @jest-environment jsdom
 *
 * Component rendering touches document, so this suite runs in jsdom.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashcardForm } from "src/gui/flashcard-form/FlashcardForm";
import type {
  FlashcardFormData,
  FlashcardFormEdit,
} from "src/gui/flashcard-form/types";

function formData(overrides: Partial<FlashcardFormData> = {}): FlashcardFormData {
  return {
    back: "4",
    extra: {},
    front: "What is 2+2?",
    id: 123,
    tags: "math",
    ...overrides,
  };
}

function renderForm(
  data: FlashcardFormData,
  onEdit: (edit: FlashcardFormEdit) => void
): void {
  render(<FlashcardForm data={data} onEdit={onEdit} />);
}

describe("FlashcardForm", () => {
  test("given form data when rendered then shows editable front back tags and readonly id", async () => {
    // given
    const edits: FlashcardFormEdit[] = [];

    // when
    renderForm(formData(), (edit) => {
      edits.push(edit);
    });

    // then
    const front = await screen.findByLabelText("Front");
    const back = screen.getByLabelText("Back");
    const tags = screen.getByLabelText("Tags");
    const id = screen.getByLabelText("ID");
    expect(front).toHaveValue("What is 2+2?");
    expect(back).toHaveValue("4");
    expect(tags).toHaveValue("math");
    expect(id).toHaveValue("123");
    expect(id).toHaveAttribute("readonly");
    expect(edits).toEqual([]);
  });

  test("given no id when rendered then shows the auto id placeholder", async () => {
    // given
    const data = formData({ id: undefined });

    // when
    renderForm(data, () => undefined);

    // then
    expect(await screen.findByLabelText("ID")).toHaveValue("Auto (on sync)");
  });

  test("given an edited front when blurred then reports the edit", async () => {
    // given
    const edits: FlashcardFormEdit[] = [];
    renderForm(formData(), (edit) => {
      edits.push(edit);
    });
    const user = userEvent.setup();

    // when
    const front = await screen.findByLabelText("Front");
    await user.clear(front);
    await user.type(front, "What is 3+3?");
    await user.tab();

    // then
    expect(edits).toEqual([{ back: "4", front: "What is 3+3?", tags: "math" }]);
  });
});
