import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Vault } from "obsidian";
import { Anki } from "src/services/anki";
import type { ISettings } from "src/conf/settings";
import { collectVaultNoteIndex, VaultNoteIndex } from "src/services/vault";
import type { FieldMapping as FieldMap } from "src/services/import";
import type { ImportExecutionReport } from "src/services/import";
import { mergeFieldMappings } from "src/services/import";
import type { AnkiNoteInfo } from "src/entities/card";
import { PageIndicator } from "src/gui/import-wizard/components/PageIndicator";
import { DeckSelection } from "src/gui/import-wizard/components/DeckSelection";
import { FieldMapping } from "src/gui/import-wizard/components/FieldMapping";
import { CardsPreview } from "src/gui/import-wizard/components/CardsPreview";
import { ImportExecution } from "src/gui/import-wizard/components/ImportExecution";
import { Footer } from "src/gui/import-wizard/components/Footer";
import {
  commonWizardClasses,
  importWizardClasses,
} from "src/gui/import-wizard/classes";

export interface ImportWizardProps {
  onCancel: () => void;
  saveSettings: () => Promise<void>;
  settings: ISettings;
  vault: Vault;
}

const pageTitles = ["Deck", "Fields", "Cards", "Save"];

function canAdvanceFromPage(
  currentPage: number,
  selectedDeckName: string,
  cardsSelectedToImportCount: number
): boolean {
  if (currentPage === 1) {
    return selectedDeckName !== "";
  }
  if (currentPage === 3) {
    return cardsSelectedToImportCount > 0;
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
  const [vaultNoteIndex, setVaultNoteIndex] = useState<VaultNoteIndex>(new Map());
  const [fieldMappings, setFieldMappings] = useState<
    Record<string, FieldMap>
  >({});
  const [cardsSelectedToImport, setCardsSelectedToImport] = useState<Record<number, boolean>>({});
  const [deckNotes, setDeckNotes] = useState<AnkiNoteInfo[]>([]);
  const [cardsPreviewPage, setCardsPreviewPage] = useState(0);
  const [cardsPreviewTotalPages, setCardsPreviewTotalPages] = useState(1);
  const [isImportReady, setIsImportReady] = useState(false);
  const importTriggerRef = useRef<(() => void) | null>(null);

  const loadVaultNoteIndex = () => {
    let isCancelled = false;
    void (async () => {
      const known = await collectVaultNoteIndex(vault, settings);
      if (!isCancelled) {
        setVaultNoteIndex(known);
      }
    })();
    return () => {
      isCancelled = true;
    };
  };

  useEffect(loadVaultNoteIndex, [vault, settings]);

  const persistFieldMappings = () => {
    settings.fieldMappings = mergeFieldMappings(
      settings.fieldMappings ?? {},
      fieldMappings
    );
    void saveSettings();
  };

  const finishImport = (report: ImportExecutionReport) => {
    settings.syncedNoteMods = {
      ...(settings.syncedNoteMods ?? {}),
      ...report.syncedNotes,
    };
    const importedMods = Object.values(report.syncedNotes);
    if (importedMods.length > 0) {
      settings.lastSyncRev = Math.max(
        settings.lastSyncRev ?? 0,
        ...importedMods
      );
    }
    void saveSettings();
  };

  const handleImportTriggerChange = useCallback((trigger: (() => void) | null) => {
    importTriggerRef.current = trigger;
    setIsImportReady(trigger !== null);
  }, []);

  const goToNextPage = () => {
    if (currentPage === 2) {
      persistFieldMappings();
    }
    if (currentPage === 3) {
      setCardsPreviewPage(0);
      setCardsPreviewTotalPages(1);
    }
    setCurrentPage(currentPage + 1);
  };

  const handleCardsPreviewPageChange = (page: number) => {
    setCardsPreviewPage(page);
  };

  const handleCardsPreviewTotalPagesChange = (totalPages: number) => {
    setCardsPreviewTotalPages(totalPages);
  };

  const cardsSelectedToImportCount = Object.values(cardsSelectedToImport).filter(Boolean).length;
  const syncState = useMemo(
    () => ({
      fallbackRev: settings.lastSyncRev ?? 0,
      syncedMods: settings.syncedNoteMods ?? {},
    }),
    [settings.lastSyncRev, settings.syncedNoteMods]
  );
  const canAdvance = canAdvanceFromPage(
    currentPage,
    selectedDeckName,
    cardsSelectedToImportCount
  );

  const rightButtons = [];
  if (currentPage > 1) {
    rightButtons.push({
      label: "← Back",
      onClick: () => setCurrentPage(currentPage - 1),
    });
  }
  if (currentPage < 4) {
    rightButtons.push({
      label: `Next: ${pageTitles[currentPage]} →`,
      disabled: !canAdvance,
      onClick: goToNextPage,
    });
  }
  if (currentPage === 4) {
    rightButtons.push({
      label: "Import",
      disabled: !isImportReady,
      onClick: () => importTriggerRef.current?.(),
    });
  }

  return (
    <div className={importWizardClasses.modal}>
      <PageIndicator currentPage={currentPage} pages={pageTitles} />
        {currentPage === 1 && (
          <DeckSelection
            anki={anki}
            className={commonWizardClasses.pageView}
            onSelectDeckName={setSelectedDeckName}
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
            savedMappings={settings.fieldMappings ?? {}}
          />
        )}
        {currentPage === 3 && (
          <CardsPreview
            anki={anki}
            cardsSelectedToImport={cardsSelectedToImport}
            className={commonWizardClasses.pageView}
            currentPage={cardsPreviewPage}
            deckName={selectedDeckName}
            key={selectedDeckName}
            onCardsSelectedToImportChange={setCardsSelectedToImport}
            onNotesLoaded={setDeckNotes}
            onPageChange={handleCardsPreviewPageChange}
            onTotalPagesChange={handleCardsPreviewTotalPagesChange}
            syncState={syncState}
            totalPages={cardsPreviewTotalPages}
            vaultNoteIndex={vaultNoteIndex}
          />
        )}
        {currentPage === 4 && (
          <ImportExecution
            anki={anki}
            cardsSelectedToImport={cardsSelectedToImport}
            className={commonWizardClasses.pageView}
            deckName={selectedDeckName}
            fieldMappings={fieldMappings}
            flashcardsTag={settings.flashcardsTag}
            key={selectedDeckName}
            notes={deckNotes}
            onFinish={finishImport}
            onImportTriggerChange={handleImportTriggerChange}
            vault={vault}
          />
        )}
      <Footer
        leftButtons={[{ label: "Cancel", onClick: onCancel }]}
        pagination={
          currentPage === 3
            ? {
                currentPage: cardsPreviewPage,
                totalPages: cardsPreviewTotalPages,
                onPageChange: handleCardsPreviewPageChange,
              }
            : undefined
        }
        rightButtons={rightButtons}
      />
    </div>
  );
}
