import { App, Modal } from "obsidian";
import { createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { ISettings } from "src/conf/settings";
import { ImportWizard } from "src/gui/import-wizard/ImportWizard";

export class ImportModal extends Modal {
  private settings: ISettings;
  private reactRoot: Root | null = null;

  constructor(
    app: App,
    settings: ISettings,
    private saveSettings: () => Promise<void>
  ) {
    super(app);
    this.settings = settings;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.mountReactRoot(contentEl);
  }

  private mountReactRoot(contentEl: HTMLElement) {
    this.reactRoot = createRoot(contentEl);
    this.reactRoot.render(
      createElement(ImportWizard, {
        settings: this.settings,
        vault: this.app.vault,
        saveSettings: () => this.saveSettings(),
        onCancel: () => this.close(),
      })
    );
  }

  onClose() {
    this.unmountReactRoot();
    const { contentEl } = this;
    contentEl.empty();
  }

  private unmountReactRoot() {
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }
}
