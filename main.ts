import { addIcon, Notice, Plugin } from "obsidian";
import type { ISettings } from "src/conf/settings";
import { normalizeSettings } from "src/conf/normalize-settings";
import { SettingsTab } from "src/gui/settings-tab";
import { ImportModal } from "src/gui/import-wizard/import-modal";
import { Anki } from "src/services/anki";
import { logger } from "src/services/logger";
import { describeUnknown } from "src/utils";
import {
  clozeModelName,
  flashcardsIcon,
  noteFormLanguage,
  noticeTimeout,
} from "src/conf/constants";
import { createNoteFormHandler } from "src/gui/note-form/processor";
import { registerNoteFormAutoPreview } from "src/gui/note-form/auto-preview";
import { executeSync, formatSyncReport } from "src/services/sync";
import { createNoteFormFile, noteFormBlock } from "src/gui/note-form/commands";
import { executeExport, formatExportReport } from "src/services/export";
import {
  forgetRecordsWithoutFiles,
  formatPurgeLedgerReport,
} from "src/services/ledger";

const exportToAnkiCommandName = "Export to Anki";
const syncCommandName = "Sync";
const importDeckCommandName = "Import deck from Anki";
const purgeLedgerCommandName = "Purge ledger";
const insertNoteFormCommandName = "Insert note form";
const newFlashcardFileCommandName = "New note file";
const newClozeNoteFileCommandName = "New cloze note file";

export default class ObsidianFlashcard extends Plugin {
  override settings!: ISettings;

  override async onload() {
    addIcon("flashcards", flashcardsIcon);

    const anki = new Anki();
    this.settings = normalizeSettings(await this.loadData());

    const statusBar = this.addStatusBarItem();

    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerNoteFormRendering();
    this.registerImportCommand();
    this.registerExportCommand();
    this.registerSyncCommand();
    this.registerPurgeLedgerCommand();
    this.registerNoteFormCommands();
    this.startAnkiStatusPolling(anki, statusBar);
  }

  private registerNoteFormRendering(): void {
    this.registerMarkdownCodeBlockProcessor(
      noteFormLanguage,
      createNoteFormHandler(this.app.vault, (noteId) =>
        noteId === undefined
          ? undefined
          : this.settings.noteLifecycle[noteId]?.status,
      ),
    );
    registerNoteFormAutoPreview(this);
  }

  private registerImportCommand(): void {
    this.addCommand({
      id: "import-deck-from-anki",
      name: importDeckCommandName,
      callback: () => {
        new ImportModal(this.app, this.settings, () =>
          this.saveData(this.settings),
        )
          .setTitle("Import deck from Anki")
          .open();
      },
    });
  }

  private registerExportCommand(): void {
    const exportToAnki = () => {
      void this.runExport();
    };
    this.addRibbonIcon("flashcards", exportToAnkiCommandName, exportToAnki);
    this.addCommand({
      id: "export-to-anki",
      name: exportToAnkiCommandName,
      callback: exportToAnki,
    });
  }

  private async runExport(): Promise<void> {
    try {
      await new Anki().ping();
    } catch {
      new Notice(
        "Error: Anki must be open with AnkiConnect installed.",
        noticeTimeout,
      );
      return;
    }
    try {
      const report = await executeExport(
        new Anki(),
        this.app.vault,
        this.settings,
        this.settings.ignoredDirectories,
      );
      await this.saveData(this.settings);
      new Notice(formatExportReport(report), noticeTimeout);
    } catch (error) {
      new Notice(`Export failed: ${describeUnknown(error)}`, noticeTimeout);
    }
  }

  private registerSyncCommand(): void {
    this.addCommand({
      id: "sync-with-anki",
      name: syncCommandName,
      callback: () => {
        void this.runSync();
      },
    });
  }

  private async runSync(): Promise<void> {
    const snapshots = this.settings.deckImportSnapshots;
    if (Object.keys(snapshots).length === 0) {
      new Notice(
        "No wizard import yet. Run Import deck from Anki first.",
        noticeTimeout,
      );
      return;
    }
    try {
      await new Anki().ping();
    } catch {
      new Notice(
        "Error: Anki must be open with AnkiConnect installed.",
        noticeTimeout,
      );
      return;
    }
    try {
      const report = await executeSync(
        new Anki(),
        this.app.vault,
        this.settings,
      );
      await this.saveData(this.settings);
      new Notice(formatSyncReport(report), noticeTimeout);
    } catch (error) {
      new Notice(`Sync failed: ${describeUnknown(error)}`, noticeTimeout);
    }
  }

  private registerPurgeLedgerCommand(): void {
    this.addCommand({
      id: "purge-ledger",
      name: purgeLedgerCommandName,
      callback: () => {
        void this.runPurgeLedger();
      },
    });
  }

  private async runPurgeLedger(): Promise<void> {
    try {
      const report = await forgetRecordsWithoutFiles(
        this.app.vault,
        this.settings,
      );
      await this.saveData(this.settings);
      new Notice(formatPurgeLedgerReport(report), noticeTimeout);
    } catch (error) {
      new Notice(
        `Purge ledger failed: ${describeUnknown(error)}`,
        noticeTimeout,
      );
    }
  }

  private registerNoteFormCommands(): void {
    this.addCommand({
      id: "insert-note-form",
      name: insertNoteFormCommandName,
      editorCallback: (editor) => {
        editor.replaceSelection(noteFormBlock());
      },
    });
    this.addCommand({
      id: "new-note-form-file",
      name: newFlashcardFileCommandName,
      callback: () => {
        void createNoteFormFile(this.app);
      },
    });
    this.addCommand({
      id: "new-cloze-note-file",
      name: newClozeNoteFileCommandName,
      callback: () => {
        void createNoteFormFile(this.app, clozeModelName);
      },
    });
  }

  private startAnkiStatusPolling(anki: Anki, statusBar: HTMLElement): void {
    this.registerInterval(
      window.setInterval(() => {
        void anki
          .ping()
          .then(() => statusBar.setText("Anki"))
          .catch(() => statusBar.setText(""));
      }, 15 * 1000),
    );
  }

  override onunload(): void {
    void this.saveData(this.settings).catch((error: unknown) => {
      logger.error("saving settings on unload failed", error);
    });
  }
}
