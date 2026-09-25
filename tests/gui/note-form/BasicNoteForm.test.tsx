/**
 * @jest-environment jsdom
 *
 * Component rendering touches document, so this suite runs in jsdom.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BasicNoteForm } from "src/gui/note-form/BasicNoteForm";
import type { NoteFormData, NoteFormEdit } from "src/entities/note-form-data";

function formData(overrides: Partial<NoteFormData> = {}): NoteFormData {
  return {
    back: "4",
    extra: {},
    front: "What is 2+2?",
    id: 123,
    model: "Basic",
    tags: "math",
    ...overrides,
  };
}

function renderForm(
  data: NoteFormData,
  onEdit: (edit: NoteFormEdit) => void,
): void {
  render(<BasicNoteForm data={data} onEdit={onEdit} />);
}

describe("BasicNoteForm", () => {
  test("given form data when rendered then shows editable fields without an id row", async () => {
    // given
    const edits: NoteFormEdit[] = [];

    // when
    renderForm(formData(), (edit) => {
      edits.push(edit);
    });

    // then
    expect(await screen.findByLabelText("Front")).toHaveValue("What is 2+2?");
    expect(screen.getByLabelText("Back")).toHaveValue("4");
    expect(screen.getByLabelText("Tags")).toHaveValue("math");
    expect(screen.queryByLabelText("ID")).not.toBeInTheDocument();
    expect(edits).toEqual([]);
  });

  test("given an edited front when blurred then reports the edit", async () => {
    // given
    const edits: NoteFormEdit[] = [];
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
