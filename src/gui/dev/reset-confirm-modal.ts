import type { App } from "obsidian";
import { Modal } from "obsidian";
import { createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { ResetPrompt } from "src/gui/dev/reset-prompt";

export class ResetConfirmModal extends Modal {
  private reactRoot: Root | null = null;

  constructor(
    app: App,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.reactRoot = createRoot(contentEl);
    this.reactRoot.render(
      createElement(ResetPrompt, {
        onCancel: () => this.close(),
        onConfirm: () => {
          this.close();
          this.onConfirm();
        },
      }),
    );
  }

  override onClose() {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.contentEl.empty();
  }
}
