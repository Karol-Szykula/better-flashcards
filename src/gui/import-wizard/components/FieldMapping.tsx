import {
  useEffect,
  useState,
  type ChangeEvent,
  type JSX,
} from "react";
import type { Anki } from "src/services/anki";
import type {
  DeckModel,
  FieldMapping as FieldMap,
  FieldTarget,
} from "src/services/import";
import {
  discoverDeckModels,
  fieldTargets,
  isKnownModel,
  resolveFieldMapping,
} from "src/services/import";
import {
  commonWizardClasses,
  fieldMappingClasses,
  mergeClasses,
} from "src/gui/import-wizard/classes";
import { List } from "src/gui/import-wizard/list/List";
import { ListRow } from "src/gui/import-wizard/list/ListRow";

export interface FieldMappingProps {
  anki: Anki;
  className?: string;
  deckName: string;
  onMappingsChange: (mappings: Record<string, FieldMap>) => void;
  savedMappings: Record<string, Record<string, string>>;
}

export function FieldMapping({
  anki,
  deckName,
  savedMappings,
  onMappingsChange,
  className,
}: FieldMappingProps): JSX.Element {
  const rootClassName = mergeClasses(commonWizardClasses.pageView, className);
  const [models, setModels] = useState<DeckModel[] | null>(null);
  const [mappings, setMappings] = useState<Record<string, FieldMap>>({});
  const [loadError, setLoadError] = useState("");

  const loadFieldMappings = () => {
    let cancelled = false;
    void (async () => {
      try {
        const discovered = await discoverDeckModels(anki, deckName);
        if (cancelled) {
          return;
        }
        const initial: Record<string, FieldMap> = {};
        for (const model of discovered) {
          initial[model.modelName] = resolveFieldMapping(
            model.fields,
            savedMappings[model.modelName]
          );
        }
        setModels(discovered);
        setMappings(initial);
        onMappingsChange(initial);
      } catch {
        if (!cancelled) {
          setLoadError(
            "Error: Anki must be open with AnkiConnect installed."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  };

  useEffect(loadFieldMappings, [anki, deckName]);

  if (loadError) {
    return (
      <div className={rootClassName}>
        <p>{loadError}</p>
      </div>
    );
  }
  if (models === null) {
    return (
      <div className={rootClassName}>
        <p>Loading note types…</p>
      </div>
    );
  }
  if (!models.length) {
    return (
      <div className={rootClassName}>
        <p>No notes found in this deck.</p>
      </div>
    );
  }
  return (
    <div className={rootClassName}>
      <p>Map fields for deck &quot;{deckName}&quot;:</p>
      {models.map((model) => (
        <div className={fieldMappingClasses.modelSection} key={model.modelName}>
          <h4>
            {model.modelName}
            {isKnownModel(model.modelName) && (
              <span className={fieldMappingClasses.modelRecognized}> Recognized</span>
            )}
          </h4>
          <List
            columns={["Field", "Sample", "Target"]}
            columnWidths="auto 1fr auto"
          >
            {model.fields.map((field) => (
              <ListRow
                cells={[
                  <strong key="name">{field}</strong>,
                  model.sampleValues[field] ? (
                    <small
                      className={fieldMappingClasses.fieldSample}
                      key="sample"
                    >
                      {model.sampleValues[field].slice(0, 60)}
                    </small>
                  ) : (
                    <span key="sample" />
                  ),
                  <select
                    key="target"
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      const next = {
                        ...mappings,
                        [model.modelName]: {
                          ...mappings[model.modelName],
                          [field]: event.target.value as FieldTarget,
                        },
                      };
                      setMappings(next);
                      onMappingsChange(next);
                    }}
                    value={mappings[model.modelName]?.[field] ?? "Skip"}
                  >
                    {fieldTargets.map((target) => (
                      <option key={target} value={target}>
                        {target}
                      </option>
                    ))}
                  </select>,
                ]}
                className={fieldMappingClasses.fieldRow}
                key={field}
              />
            ))}
          </List>
        </div>
      ))}
    </div>
  );
}
