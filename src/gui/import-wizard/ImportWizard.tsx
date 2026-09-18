import { useEffect, useState, type JSX } from "react";
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
    settings.lastSyncRev = Math.max(
      settings.lastSyncRev ?? 0,
      report.lastSyncRev
    );
    void saveSettings();
  };

  const goToNextPage = () => {
    if (currentPage === 2) {
      persistFieldMappings();
    }
    setCurrentPage(currentPage + 1);
  };

  const cardsSelectedToImportCount = Object.values(cardsSelectedToImport).filter(Boolean).length;
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

  return (
    <div className={importWizardClasses.modal}>
      <PageIndicator currentPage={currentPage} pages={pageTitles} />
        {currentPage === 1 && (
          <DeckSelection
            anki={anki}
            className={commonWizardClasses.pageView}
            lastSyncRev={settings.lastSyncRev ?? 0}
            onSelectDeckName={setSelectedDeckName}
            selectedDeckName={selectedDeckName}
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
            deckName={selectedDeckName}
            key={selectedDeckName}
            lastSyncRev={settings.lastSyncRev ?? 0}
            onCardsSelectedToImportChange={setCardsSelectedToImport}
            onNotesLoaded={setDeckNotes}
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
            vault={vault}
          />
        )}
      <Footer
        leftButtons={[{ label: "Cancel", onClick: onCancel }]}
        rightButtons={rightButtons}
      />
    </div>
  );
}
