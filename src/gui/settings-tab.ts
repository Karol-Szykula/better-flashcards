import type { App } from "obsidian";
import { Notice, PluginSettingTab, Setting } from "obsidian";
import { Anki } from "src/services/anki";
import { logger } from "src/services/logger";
import type ObsidianFlashcard from "../../main";

export class SettingsTab extends PluginSettingTab {
  plugin: ObsidianFlashcard;

  constructor(app: App, plugin: ObsidianFlashcard) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    const plugin = this.plugin;

    containerEl.empty();

    const description = createFragment();
    description.append(
      "This needs to be done only one time. Open Anki and click the button to grant permission.",
      createEl("br"),
      "Be aware that AnkiConnect must be installed.",
    );

    new Setting(containerEl)
      .setName("Give Permission")
      .setDesc(description)
      .addButton((button) => {
        button.setButtonText("Grant Permission").onClick(() => {
          new Anki()
            .requestPermission()
            .then((result) => {
              if (result.permission === "granted") {
                plugin.settings.ankiConnectPermission = true;
                void plugin.saveData(plugin.settings);
                new Notice("Anki Connect permission granted");
              } else {
                new Notice("AnkiConnect permission not granted");
              }
            })
            .catch((error: unknown) => {
              new Notice("Something went wrong, is Anki open?");
              logger.error("requesting AnkiConnect permission failed", error);
            });
        });
      });

    new Setting(containerEl)
      .setName("Test Anki")
      .setDesc("Test that connection between Anki and Obsidian actually works.")
      .addButton((text) => {
        text.setButtonText("Test").onClick(() => {
          new Anki()
            .ping()
            .then(() => new Notice("Anki works"))
            .catch(() => new Notice("Anki is not connected"));
        });
      });

    new Setting(containerEl)
      .setName("Ignored directories")
      .setDesc(
        "Comma-separated list of directories to skip when generating cards (e.g. templates, daily-notes).",
      )
      .addText((text) => {
        text
          .setValue(plugin.settings.ignoredDirectories)
          .setPlaceholder("templates, daily-notes")
          .onChange((value) => {
            plugin.settings.ignoredDirectories = value;
            void plugin.saveData(plugin.settings);
          });
      });
  }
}
