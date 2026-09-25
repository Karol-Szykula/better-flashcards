import { Notice } from "obsidian";
import type { App, Command } from "obsidian";
import { noticeTimeout } from "src/conf/constants";
import type { ISettings } from "src/conf/settings";
import { ResetConfirmModal } from "src/gui/dev/reset-confirm-modal";
import { formatResetReport, resetPluginData } from "src/services/dev-reset";
import { describeUnknown } from "src/utils";

interface DevCommandHost {
  addCommand(command: Command): Command;
  app: App;
  saveData(settings: ISettings): Promise<void>;
  settings: ISettings;
}

export function registerDevCommands(plugin: DevCommandHost): void {
  plugin.addCommand({
    id: "dev-reset-plugin-data",
    name: "Dev: reset plugin data",
    callback: () => {
      new ResetConfirmModal(plugin.app, () => {
        void runPluginDataReset(plugin);
      }).open();
    },
  });
}

async function runPluginDataReset(plugin: DevCommandHost): Promise<void> {
  try {
    const report = await resetPluginData(plugin.app.vault, plugin.settings);
    await plugin.saveData(plugin.settings);
    new Notice(formatResetReport(report), noticeTimeout);
  } catch (error) {
    new Notice(`Reset failed: ${describeUnknown(error)}`, noticeTimeout);
  }
}
