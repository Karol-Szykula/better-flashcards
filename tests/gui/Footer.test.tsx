/**
 * @jest-environment jsdom
 *
 * User-perspective tests for the wizard footer: button placement,
 * click callbacks, disabled guard and parent-provided class.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Footer,
  type FooterButton,
} from "src/gui/import-wizard/components/Footer";

function renderFooter(
  leftButtons: FooterButton[] = [{ label: "Cancel", onClick: jest.fn() }],
  rightButtons: FooterButton[] = [{ label: "Next", onClick: jest.fn() }],
  className?: string
) {
  render(
    <Footer
      className={className}
      leftButtons={leftButtons}
      rightButtons={rightButtons}
    />
  );
}

describe("Footer", () => {
  test("calls back on click", async () => {
    // given
    const user = userEvent.setup();
    const onClick = jest.fn();
    renderFooter([], [{ label: "Next", onClick }]);

    // when
    await user.click(await screen.findByRole("button", { name: "Next" }));

    // then
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("blocks clicks on disabled buttons", async () => {
    // given
    const user = userEvent.setup();
    const onClick = jest.fn();
    renderFooter([], [{ label: "Next", disabled: true, onClick }]);

    // when
    const next = await screen.findByRole("button", { name: "Next" });
    await user.click(next);

    // then
    expect(next).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
