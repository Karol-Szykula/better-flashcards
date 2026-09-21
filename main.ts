import { addIcon, Notice, Plugin, TFile } from "obsidian";
import { ISettings } from "src/conf/settings";
import { SettingsTab } from "src/gui/settings-tab";
import { ImportModal } from "src/gui/import-wizard/import-modal";
import { CardsService } from "src/services/cards";
import { Anki } from "src/services/anki";
import {
  flashcardsIcon,
  flashcardFormLanguage,
  noticeTimeout,
} from "src/conf/constants";
import { createFlashcardFormHandler } from "src/gui/flashcard-form/processor";
import { registerFlashcardFormAutoPreview } from "src/gui/flashcard-form/auto-preview";
import {
  executeFastImport,
  formatFastImportReport,
} from "src/services/fast-import";
import {
  createFlashcardFormFile,
  flashcardFormBlock,
} from "src/gui/flashcard-form/commands";

const generateCurrentFileCommandName = "Generate for the current file";
const generateAllFilesCommandName = "Generate for all files in vault";
const fastImportCommandName = "Fast import";
const importDeckCommandName = "Import deck from Anki";
const insertFlashcardFormCommandName = "Insert flashcard form";
const newFlashcardFileCommandName = "New flashcard file";

export default class ObsidianFlashcard extends Plugin {
  settings!: ISettings;
  private cardsService!: CardsService;

  async onload() {
    addIcon("flashcards", flashcardsIcon);

    // TODO test when file did not insert flashcards, but one of them is in Anki already
    const anki = new Anki();
    this.settings = Object.assign(
      this.getDefaultSettings(),
      (await this.loadData()) || {}
    );
    this.cardsService = new CardsService(this.app, this.settings);

    const statusBar = this.addStatusBarItem();

    this.addRibbonIcon("flashcards", "Generate flashcards", () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.generateCards(activeFile);
      } else {
        new Notice("Open a file before");
      }
    });

    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerFlashcardFormRendering();
    this.registerCardCommands();
    this.registerImportCommand();
    this.registerFastImportCommand();
    this.registerFlashcardFormCommands();
    this.startAnkiStatusPolling(anki, statusBar);
  }

  private registerFlashcardFormRendering(): void {
    this.registerMarkdownCodeBlockProcessor(
      flashcardFormLanguage,
      createFlashcardFormHandler(this.app.vault)
    );
    registerFlashcardFormAutoPreview(this);
  }

  private registerCardCommands(): void {
    this.addCommand({
      id: "generate-flashcard-current-file",
      name: generateCurrentFileCommandName,
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.generateCards(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "generate-flashcard-all-files",
      name: generateAllFilesCommandName,
      callback: () => {
        void this.generateCardsForVault();
      },
    });
  }

  private registerImportCommand(): void {
    this.addCommand({
      id: "import-deck-from-anki",
      name: importDeckCommandName,
      callback: () => {
        new ImportModal(this.app, this.settings, () =>
          this.saveData(this.settings)
        ).setTitle("Import deck from Anki").open();
      },
    });
  }

  private registerFastImportCommand(): void {
    this.addCommand({
      id: "fast-import",
      name: fastImportCommandName,
      callback: () => {
        void this.runFastImport();
      },
    });
  }

  private async runFastImport(): Promise<void> {
    const snapshots = this.settings.deckImportSnapshots ?? {};
    if (Object.keys(snapshots).length === 0) {
      new Notice(
        "No wizard import yet. Run Import deck from Anki first.",
        noticeTimeout
      );
      return;
    }
    try {
      await new Anki().ping();
    } catch {
      new Notice(
        "Error: Anki must be open with AnkiConnect installed.",
        noticeTimeout
      );
      return;
    }
    try {
      const report = await executeFastImport(
        new Anki(),
        this.app.vault,
        this.settings
      );
      await this.saveData(this.settings);
      new Notice(formatFastImportReport(report), noticeTimeout);
    } catch (error) {
      new Notice(
        `Fast import failed: ${error instanceof Error ? error.message : error}`,
        noticeTimeout
      );
    }
  }

  private registerFlashcardFormCommands(): void {
    this.addCommand({
      id: "insert-flashcard-form",
      name: insertFlashcardFormCommandName,
      editorCallback: (editor) => {
        editor.replaceSelection(flashcardFormBlock());
      },
    });
    this.addCommand({
      id: "new-flashcard-form-file",
      name: newFlashcardFileCommandName,
      callback: () => {
        void createFlashcardFormFile(this.app);
      },
    });
  }

  private startAnkiStatusPolling(anki: Anki, statusBar: HTMLElement): void {
    this.registerInterval(
      window.setInterval(
        () =>
          anki
            .ping()
            .then(() => statusBar.setText("Anki"))
            .catch(() => statusBar.setText("")),
        15 * 1000,
      ),
    );
  }

  async onunload() {
    await this.saveData(this.settings);
  }

  private getDefaultSettings(): ISettings {
    return {
      contextAwareMode: true,
      sourceSupport: false,
      codeHighlightSupport: false,
      inlineID: false,
      contextSeparator: " > ",
      deck: "Default",
      folderBasedDeck: true,
      flashcardsTag: "card",
      inlineSeparator: "::",
      inlineSeparatorReverse: ":::",
      defaultAnkiTag: "obsidian",
      ankiConnectPermission: false,
      ignoredDirectories: "",
      lastSyncRev: 0,
      fieldMappings: {},
      deckImportSnapshots: {},
      syncedNoteHashes: {},
      syncedNoteMods: {},
    };
  }

  private generateCards(activeFile: TFile) {
    this.cardsService
      .execute(activeFile)
      .then((res) => {
        if (!res) {
          new Notice("Error: Something went wrong", noticeTimeout);
          return;
        }
        for (const r of res) {
          new Notice(r, noticeTimeout);
        }
      })
      .catch((err) => {
        console.error(err);
        new Notice(`Error: ${err}`, noticeTimeout);
      });
  }

  private isIgnoredPath(filePath: string): boolean {
    const ignored = (this.settings.ignoredDirectories || "")
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    return ignored.some((dir) => filePath.startsWith(dir + "/") || filePath.startsWith(dir + "\\"));
  }

  private async generateCardsForVault() {
    const allFiles = this.app.vault.getMarkdownFiles();
    const files = allFiles.filter((f) => !this.isIgnoredPath(f.path));

    try {
      await this.cardsService.setup();
    } catch (err) {
      console.error(err);
      new Notice("Error: Anki must be open with AnkiConnect installed.", noticeTimeout);
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const tag = this.settings.flashcardsTag;
    const sep = this.settings.inlineSeparator;

    new Notice(`Flashcards: scanning ${files.length} files...`, noticeTimeout);

    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        const hasCardTag = content.includes(`#${tag}`);
        const hasInline = content.includes(sep);
        const hasCloze = content.includes("==") || content.includes("{");
        const hasExistingIds = /\^\d{13}/.test(content);
        if (!hasCardTag && !hasInline && !hasExistingIds && !hasCloze) {
          skipped++;
          continue;
        }
        // Only check cloze-heavy files if they also have a card tag or existing IDs
        if (!hasCardTag && !hasInline && !hasExistingIds && hasCloze) {
          skipped++;
          continue;
        }

        const res = await this.cardsService.execute(file, true);
        if (!res) continue;
        for (const r of res) {
          if (r.startsWith("Inserted")) created++;
          else if (r.startsWith("Updated")) updated++;
          else if (r.startsWith("Error")) {
            console.warn(`Flashcards: [${file.path}] ${r}`);
            failed++;
          }
        }
      } catch (err) {
        console.error(`Flashcards: [${file.path}] uncaught error`, err);
        failed++;
      }
    }

    new Notice(
      `Flashcards: done. ${files.length - skipped} files with cards, ${created} created, ${updated} updated, ${failed} errors.`,
      noticeTimeout
    );
  }
}
