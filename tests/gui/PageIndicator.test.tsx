/**
 * @jest-environment jsdom
 *
 * User-perspective tests for the wizard page indicator: numbered chips,
 * active/done states and optional connectors.
 */
import { render, screen } from "@testing-library/react";
import { PageIndicator } from "src/gui/import-wizard/components/PageIndicator";

const pageTitles = ["Deck", "Fields", "Cards", "Save"];

function renderPageIndicator(currentPage: number, connectors?: boolean) {
  render(
    <PageIndicator
      connectors={connectors}
      currentPage={currentPage}
      pages={pageTitles}
    />
  );
}

describe("PageIndicator", () => {
  test("renders every page with numbers", async () => {
    // given
    const currentPage = 1;

    // when
    renderPageIndicator(currentPage);

    // then
    for (const [index, title] of pageTitles.entries()) {
      expect(await screen.findByText(`${index + 1}`)).toBeInTheDocument();
      expect(await screen.findByText(title)).toBeInTheDocument();
    }
  });

  test("marks the active page", async () => {
    // given
    const currentPage = 2;

    // when
    renderPageIndicator(currentPage);
    const title = await screen.findByText("Fields");

    // then
    expect(title.parentElement).toHaveClass(
      "flashcards-import-wizard-modal__page--active"
    );
  });

  test("shows checkmarks for finished pages", async () => {
    // given
    const currentPage = 3;

    // when
    renderPageIndicator(currentPage);

    // then
    expect(await screen.findAllByText("✓")).toHaveLength(2);
    expect(await screen.findByText("3")).toBeInTheDocument();
  });

  test("draws connectors between pages by default", async () => {
    // given
    const currentPage = 1;

    // when
    renderPageIndicator(currentPage);

    // then
    expect(await screen.findAllByText("─")).toHaveLength(pageTitles.length - 1);
  });

  test("hides connectors on request", async () => {
    // given
    const currentPage = 1;

    // when
    renderPageIndicator(currentPage, false);

    // then
    expect(screen.queryByText("─")).not.toBeInTheDocument();
  });
});
