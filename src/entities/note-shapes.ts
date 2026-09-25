import {
  basicModelName,
  basicOptionalReversedModelName,
  basicReversedModelName,
  basicTypingModelName,
  clozeModelName,
} from "src/conf/constants";

export type NoteFormLayout = "basic" | "cloze";

export interface NoteShape {
  layout: NoteFormLayout;
  model: string;
  primaryKey: string;
  primaryLabel: string;
  secondaryKey: string;
  secondaryLabel: string;
}

const basicShape: NoteShape = {
  layout: "basic",
  model: basicModelName,
  primaryKey: "front",
  primaryLabel: "Front",
  secondaryKey: "back",
  secondaryLabel: "Back",
};

const clozeShape: NoteShape = {
  layout: "cloze",
  model: clozeModelName,
  primaryKey: "text",
  primaryLabel: "Text",
  secondaryKey: "back_extra",
  secondaryLabel: "Back Extra",
};

const basicShapedModels = [
  basicModelName,
  basicReversedModelName,
  basicOptionalReversedModelName,
  basicTypingModelName,
];

export function noteShapeFor(model: string | undefined): NoteShape {
  if (
    typeof model === "string" &&
    model.toLowerCase() === clozeModelName.toLowerCase()
  ) {
    return clozeShape;
  }
  if (
    typeof model === "string" &&
    basicShapedModels.some(
      (known) => known.toLowerCase() === model.toLowerCase(),
    )
  ) {
    return { ...basicShape, model };
  }
  return { ...basicShape, model: model ?? basicModelName };
}
