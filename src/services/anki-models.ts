import {
  basicModelName,
  basicOptionalReversedModelName,
  basicReversedModelName,
  basicTypingModelName,
  clozeModelName,
} from "src/conf/constants";
import type { Anki, ModelSnapshot } from "src/services/anki";

interface BuiltInModelTemplate {
  Back: string;
  Front: string;
  Name: string;
}

export interface BuiltInModelDefinition {
  cardTemplates: BuiltInModelTemplate[];
  css: string;
  inOrderFields: string[];
  isCloze: boolean;
  modelName: string;
}

interface ModelMismatch {
  actualFields: string[];
  conflictingModelName?: string;
  expectedFields: string[];
  modelName: string;
  reason: "name-collision" | "schema";
}

export interface ModelAssuranceReport {
  assured: string[];
  created: string[];
  mismatched: ModelMismatch[];
}

const defaultCardCss = [
  ".card {",
  " font-family: arial;",
  " font-size: 20px;",
  " text-align: center;",
  " color: black;",
  " background-color: white;",
  "}",
].join("\n");

const basicFrontTemplate = "{{Front}}";
const basicBackTemplate = "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}";
const reversedFrontTemplate = "{{Back}}";
const reversedBackTemplate = "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}";

export const builtInModels: BuiltInModelDefinition[] = [
  {
    modelName: basicModelName,
    inOrderFields: ["Front", "Back"],
    css: defaultCardCss,
    isCloze: false,
    cardTemplates: [
      { Name: "Card 1", Front: basicFrontTemplate, Back: basicBackTemplate },
    ],
  },
  {
    modelName: basicReversedModelName,
    inOrderFields: ["Front", "Back"],
    css: defaultCardCss,
    isCloze: false,
    cardTemplates: [
      { Name: "Card 1", Front: basicFrontTemplate, Back: basicBackTemplate },
      {
        Name: "Card 2",
        Front: reversedFrontTemplate,
        Back: reversedBackTemplate,
      },
    ],
  },
  {
    modelName: basicOptionalReversedModelName,
    inOrderFields: ["Front", "Back", "Add Reverse"],
    css: defaultCardCss,
    isCloze: false,
    cardTemplates: [
      { Name: "Card 1", Front: basicFrontTemplate, Back: basicBackTemplate },
      {
        Name: "Card 2",
        Front: `{{#Add Reverse}}${reversedFrontTemplate}{{/Add Reverse}}`,
        Back: reversedBackTemplate,
      },
    ],
  },
  {
    modelName: basicTypingModelName,
    inOrderFields: ["Front", "Back"],
    css: defaultCardCss,
    isCloze: false,
    cardTemplates: [
      {
        Name: "Card 1",
        Front: `${basicFrontTemplate}\n\n{{type:Back}}`,
        Back: `${basicFrontTemplate}\n\n<hr id=answer>\n\n{{type:Back}}`,
      },
    ],
  },
  {
    modelName: clozeModelName,
    inOrderFields: ["Text", "Back Extra"],
    css: defaultCardCss,
    isCloze: true,
    cardTemplates: [
      {
        Name: "Cloze",
        Front: "{{cloze:Text}}",
        Back: "{{cloze:Text}}<br>\n{{Back Extra}}",
      },
    ],
  },
];

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contextualError(prefix: string, cause: unknown): Error {
  const error = new Error(`${prefix}: ${describeError(cause)}`) as Error & {
    cause: unknown;
  };
  error.cause = cause;
  return error;
}

function normalizedName(modelName: string): string {
  return modelName.trim().toLowerCase();
}

function collidingModelName(
  modelName: string,
  knownNames: string[],
): string | undefined {
  return knownNames.find(
    (known) =>
      known !== modelName &&
      normalizedName(known) === normalizedName(modelName),
  );
}

async function readModelFields(
  anki: Anki,
  wanted: string[],
): Promise<ModelSnapshot> {
  try {
    return await anki.modelNamesWithFields(wanted);
  } catch (error) {
    throw contextualError("Anki model check failed", error);
  }
}

async function createMissingModels(
  anki: Anki,
  definitions: BuiltInModelDefinition[],
): Promise<void> {
  if (definitions.length === 0) {
    return;
  }
  try {
    await anki.createModels(definitions);
  } catch (error) {
    throw contextualError("Anki model creation failed", error);
  }
}

function schemaMismatch(
  definition: BuiltInModelDefinition,
  actualFields: string[],
): ModelMismatch {
  return {
    actualFields,
    expectedFields: definition.inOrderFields,
    modelName: definition.modelName,
    reason: "schema",
  };
}

function nameCollision(
  definition: BuiltInModelDefinition,
  conflictingModelName: string,
): ModelMismatch {
  return {
    actualFields: [],
    conflictingModelName,
    expectedFields: definition.inOrderFields,
    modelName: definition.modelName,
    reason: "name-collision",
  };
}

export async function assureModels(
  anki: Anki,
  wantedModelNames: string[],
): Promise<ModelAssuranceReport> {
  const report: ModelAssuranceReport = {
    assured: [],
    created: [],
    mismatched: [],
  };
  const wanted = builtInModels.filter((definition) =>
    wantedModelNames.includes(definition.modelName),
  );
  if (wanted.length === 0) {
    return report;
  }
  const snapshot = await readModelFields(
    anki,
    wanted.map((definition) => definition.modelName),
  );
  const fieldsByModel = snapshot.fieldsByModel;
  const knownNames = snapshot.modelNames;
  const missing: BuiltInModelDefinition[] = [];
  for (const definition of wanted) {
    const actualFields = fieldsByModel[definition.modelName];
    if (actualFields === undefined) {
      const collision = collidingModelName(definition.modelName, knownNames);
      if (collision !== undefined) {
        report.mismatched.push(nameCollision(definition, collision));
        continue;
      }
      missing.push(definition);
      continue;
    }
    const absentFields = definition.inOrderFields.filter(
      (field) => !actualFields.includes(field),
    );
    if (absentFields.length > 0) {
      report.mismatched.push(schemaMismatch(definition, actualFields));
      continue;
    }
    report.assured.push(definition.modelName);
  }
  await createMissingModels(anki, missing);
  report.created = missing.map((definition) => definition.modelName);
  return report;
}

export async function ensureDefaultModels(
  anki: Anki,
): Promise<ModelAssuranceReport> {
  return await assureModels(anki, builtInModelNames());
}

function builtInModelNames(): string[] {
  return builtInModels.map((definition) => definition.modelName);
}
