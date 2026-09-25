import { useEffect, useMemo, useState, type JSX } from "react";
import { startAsyncLoad } from "src/gui/import-wizard/start-async-load";
import type { Vault } from "obsidian";
import { Anki } from "src/services/anki";
import { logger } from "src/services/logger";
import type { ISettings } from "src/conf/settings";
import type { VaultNoteIndex } from "src/services/vault";
import { collectVaultNoteIndex } from "src/services/vault";
import type { FieldMapping as FieldMap } from "src/entities/field-mapping";
import type { ImportExecutionReport } from "src/services/import";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import {
  builtInPackFor,
  notePackVersion,
  savePack,
} from "src/services/note-packs";
import { noteShapeFor } from "src/entities/note-shapes";
import { mergeFieldMappings } from "src/entities/field-mapping";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import { PageIndicator } from "src/gui/import-wizard/components/PageIndicator";
import { DeckSelection } from "src/gui/import-wizard/components/DeckSelection";
import { FieldMapping } from "src/gui/import-wizard/components/FieldMapping";
import { NotesPreview } from "src/gui/import-wizard/components/NotesPreview";
import { ImportExecution } from "src/gui/import-wizard/components/ImportExecution";
import { Footer } from "src/gui/import-wizard/components/Footer";
import {
  commonWizardClasses,
  importWizardClasses,
} from "src/gui/import-wizard/classes";

export interface ImportWizardProps {
  readonly onCancel: () => void;
  readonly saveSettings: () => Promise<void>;
  readonly settings: ISettings;
  readonly vault: Vault;
}

const pageTitles = ["Deck", "Fields", "Cards", "Save"];

function canAdvanceFromPage(
  currentPage: number,
  selectedDeckName: string,
  notesSelectedToImportCount: number,
): boolean {
  if (currentPage === 1) {
    return selectedDeckName !== "";
  }
  if (currentPage === 3) {
    return notesSelectedToImportCount > 0;
  }
  return currentPage < 4;
}

export function ImportWizard({
  onCancel,
  saveSettings,
  settings,
  vault,
}: ImportWizardProps): JSX.Element {
  const [anki] = useState(() => new Anki());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeckName, setSelectedDeckName] = useState("");
  const [vaultNoteIndex, setVaultNoteIndex] = useState<VaultNoteIndex>(
    new Map(),
  );
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMap>>(
    {},
  );
  const [notesSelectedToImport, setNotesSelectedToImport] = useState<
    Record<number, boolean>
  >({});
  const [forcedNoteIds, setForcedNoteIds] = useState<Record<number, boolean>>(
    {},
  );
  const [deckNotes, setDeckNotes] = useState<AnkiNoteInfo[]>([]);
  const [notesPreviewPage, setNotesPreviewPage] = useState(0);
  const [notesPreviewTotalPages, setNotesPreviewTotalPages] = useState(1);

  const selectDeckName = (deckName: string): void => {
    setSelectedDeckName(deckName);
    setNotesSelectedToImport({});
    setForcedNoteIds({});
  };

  const loadVaultNoteIndex = (): (() => void) =>
    startAsyncLoad(async (isLive) => {
      const known = await collectVaultNoteIndex(vault);
      if (isLive()) {
        setVaultNoteIndex(known);
      }
    });

  useEffect(loadVaultNoteIndex, [vault, settings]);

  const persistFieldMappings = () => {
    settings.fieldMappings = mergeFieldMappings(
      settings.fieldMappings,
      fieldMappings,
    );
    void saveSettings();
    void saveModelPacks();
  };

  function saveModelPacks(): Promise<void> {
    const saves = Object.entries(fieldMappings)
      .filter(([modelName]) => builtInPackFor(modelName) === undefined)
      .map(([modelName, mapping]) =>
        savePack(vault, {
          formTemplate: noteShapeFor(modelName),
          mapping,
          modelName,
          packVersion: notePackVersion,
        }),
      );
    return Promise.all(saves).then(
      () => undefined,
      (error: unknown) => {
        logger.error("saving settings failed", error);
      },
    );
  }

  const finishImport = (report: ImportExecutionReport) => {
    for (const [id, mod] of Object.entries(report.syncedNotes)) {
      const noteId = Number(id);
      settings.noteLifecycle[noteId] = syncedCleanRecord(
        mod,
        report.syncedHashes[noteId] ?? "",
        Date.now(),
      );
    }
    settings.deckImportSnapshots = {
      ...settings.deckImportSnapshots,
      [selectedDeckName]: {
        deckName: selectedDeckName,
        fieldMappings,
        importedAt: Date.now(),
      },
    };
    const importedMods = Object.values(report.syncedNotes);
    if (importedMods.length > 0) {
      settings.lastSyncRev = Math.max(settings.lastSyncRev, ...importedMods);
    }
    void saveSettings();
  };

  const goToNextPage = () => {
    if (currentPage === 2) {
      persistFieldMappings();
    }
    if (currentPage === 3) {
      setNotesPreviewPage(0);
      setNotesPreviewTotalPages(1);
    }
    setCurrentPage(currentPage + 1);
  };

  const handleNotesPreviewPageChange = (page: number) => {
    setNotesPreviewPage(page);
  };

  const handleNotesPreviewTotalPagesChange = (totalPages: number) => {
    setNotesPreviewTotalPages(totalPages);
  };

  const notesSelectedToImportCount = Object.values(
    notesSelectedToImport,
  ).filter(Boolean).length;
  const syncState = useMemo(() => {
    const syncedMods: Record<number, number> = {};
    for (const [id, record] of Object.entries(settings.noteLifecycle)) {
      syncedMods[Number(id)] = record.lastMod;
    }
    return {
      fallbackRev: settings.lastSyncRev,
      syncedMods,
    };
  }, [settings.lastSyncRev, settings.noteLifecycle]);
  const canAdvance = canAdvanceFromPage(
    currentPage,
    selectedDeckName,
    notesSelectedToImportCount,
  );

  const rightButtons = [];
  if (currentPage === 2 || currentPage === 3) {
    rightButtons.push({
      label: "← Back",
      onClick: () => setCurrentPage(currentPage - 1),
    });
  }
  if (currentPage < 3) {
    rightButtons.push({
      label: `Next: ${pageTitles[currentPage]} →`,
      disabled: !canAdvance,
      onClick: goToNextPage,
    });
  }
  if (currentPage === 3) {
    rightButtons.push({
      label: "Import",
      disabled: !canAdvance,
      onClick: goToNextPage,
    });
  }
  if (currentPage === 4) {
    rightButtons.push({
      label: "OK",
      onClick: onCancel,
    });
  }

  return (
    <div className={importWizardClasses.modal}>
      <PageIndicator currentPage={currentPage} pages={pageTitles} />
      {currentPage === 1 && (
        <DeckSelection
          anki={anki}
          className={commonWizardClasses.pageView}
          onSelectDeckName={selectDeckName}
          selectedDeckName={selectedDeckName}
          syncState={syncState}
          vaultNoteIndex={vaultNoteIndex}
        />
      )}
      {currentPage === 2 && (
        <FieldMapping
          anki={anki}
          className={commonWizardClasses.pageView}
          deckName={selectedDeckName}
          key={selectedDeckName}
          onMappingsChange={setFieldMappings}
          savedMappings={settings.fieldMappings}
        />
      )}
      {currentPage === 3 && (
        <NotesPreview
          anki={anki}
          className={commonWizardClasses.pageView}
          currentPage={notesPreviewPage}
          deckName={selectedDeckName}
          forcedNoteIds={forcedNoteIds}
          key={selectedDeckName}
          noteLifecycle={settings.noteLifecycle}
          notesSelectedToImport={notesSelectedToImport}
          onForcedNoteIdsChange={setForcedNoteIds}
          onNotesLoaded={setDeckNotes}
          onNotesSelectedToImportChange={setNotesSelectedToImport}
          onPageChange={handleNotesPreviewPageChange}
          onTotalPagesChange={handleNotesPreviewTotalPagesChange}
          totalPages={notesPreviewTotalPages}
          vault={vault}
          vaultNoteIndex={vaultNoteIndex}
        />
      )}
      {currentPage === 4 && (
        <ImportExecution
          anki={anki}
          className={commonWizardClasses.pageView}
          deckName={selectedDeckName}
          fieldMappings={fieldMappings}
          forcedNoteIds={forcedNoteIds}
          key={selectedDeckName}
          noteLifecycle={settings.noteLifecycle}
          notes={deckNotes}
          notesSelectedToImport={notesSelectedToImport}
          onFinish={finishImport}
          vault={vault}
          vaultNoteIndex={vaultNoteIndex}
        />
      )}
      <Footer
        leftButtons={
          currentPage === 4 ? [] : [{ label: "Cancel", onClick: onCancel }]
        }
        pagination={
          currentPage === 3
            ? {
                currentPage: notesPreviewPage,
                totalPages: notesPreviewTotalPages,
                onPageChange: handleNotesPreviewPageChange,
              }
            : undefined
        }
        rightButtons={rightButtons}
      />
    </div>
  );
}
