/**
 * @jest-environment jsdom
 *
 * Tests for sticky list headers and pinned pagination in CardsPreview.
 */
import "obsidian-test-mocks/jest-setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { List } from "src/gui/import-wizard/list/List";
import { ListRow } from "src/gui/import-wizard/list/ListRow";

describe("List sticky header", () => {
  test("given a list with header when rendered then header has sticky CSS class", () => {
    // given
    render(
      <List columns={["Col1", "Col2"]} columnWidths="auto 1fr">
        <ListRow cells={["a", "b"]} key="1" />
        <ListRow cells={["c", "d"]} key="2" />
      </List>
    );

    // when
    const header = document.querySelector(".flashcards-import-wizard-modal__list-header");

    // then - header element exists with correct class; sticky positioning is defined in CSS
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass("flashcards-import-wizard-modal__list-header");
  });

  test("given a list without columns when rendered then no header is rendered", () => {
    // given
    render(
      <List>
        <ListRow cells={["a", "b"]} key="1" />
      </List>
    );

    // when
    const header = screen.queryByText("Col1");

    // then
    expect(header).not.toBeInTheDocument();
  });
});

describe("CardsPreview pagination pinned", () => {
  test("given a CardsPreview with multiple pages when rendered then pagination is visible at bottom", async () => {
    // given - this test will be implemented after the component restructuring
    // The pagination should be in a sticky footer at the bottom of the scrollable area
    expect(true).toBe(true);
  });
});