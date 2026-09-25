import { Anki } from "src/services/anki";
import {
  assureModels,
  builtInModels,
  ensureDefaultModels,
} from "src/services/anki-models";
import { AnkiConnectMock } from "../mocks/anki-connect";
import { ankiResponder } from "../helpers/anki-responder";
import { required } from "../helpers/required";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

const responder = ankiResponder();

function respondWithModels(models: Record<string, string[]>): void {
  responder.respondWith({ knownModels: models });
}

function createdModels(): string[] {
  return responder.createdModels();
}

function modelFieldCalls(): string[] {
  return responder
    .multiActions("modelFieldNames")
    .map((action) => action.params["modelName"] as string);
}

const allBuiltInsPresent: Record<string, string[]> = {
  Basic: ["Front", "Back"],
  "Basic (and reversed card)": ["Front", "Back"],
  "Basic (optional reversed card)": ["Front", "Back", "Add Reverse"],
  "Basic (type in the answer)": ["Front", "Back"],
  Cloze: ["Text", "Back Extra"],
};

describe("assureModels", () => {
  test("given one wanted model present when assured then only that model is checked", async () => {
    // given
    respondWithModels(allBuiltInsPresent);

    // when
    const report = await assureModels(new Anki(), ["Basic"]);

    // then
    expect(report).toEqual({
      assured: ["Basic"],
      created: [],
      mismatched: [],
    });
    expect(modelFieldCalls()).toEqual(["Basic"]);
  });

  test("given one wanted model missing when assured then only that model is created", async () => {
    // given
    respondWithModels({ Cloze: ["Text", "Back Extra"] });

    // when
    const report = await assureModels(new Anki(), ["Basic"]);

    // then
    expect(report).toEqual({
      assured: [],
      created: ["Basic"],
      mismatched: [],
    });
    expect(createdModels()).toEqual(["Basic"]);
    expect(modelFieldCalls()).toEqual(["Basic"]);
  });

  test("given a wanted model whose name is taken by another model when assured then it is reported and not created", async () => {
    // given
    respondWithModels({ basic: ["Front", "Back"] });

    // when
    const report = await assureModels(new Anki(), ["Basic"]);

    // then
    expect(report).toMatchObject({
      created: [],
      mismatched: [
        {
          modelName: "Basic",
          conflictingModelName: "basic",
          reason: "name-collision",
        },
      ],
    });
    expect(createdModels()).toEqual([]);
  });

  test("given a wanted model with different fields when assured then it is reported and not created", async () => {
    // given
    respondWithModels({ Basic: ["Question", "Answer"] });

    // when
    const report = await assureModels(new Anki(), ["Basic"]);

    // then
    expect(report).toMatchObject({
      created: [],
      mismatched: [
        {
          actualFields: ["Question", "Answer"],
          expectedFields: ["Front", "Back"],
          modelName: "Basic",
          reason: "schema",
        },
      ],
    });
    expect(createdModels()).toEqual([]);
  });

  test("given a wanted name that is not a built-in when assured then it is ignored", async () => {
    // given
    respondWithModels(allBuiltInsPresent);

    // when
    const report = await assureModels(new Anki(), ["My Own Model"]);

    // then
    expect(report).toEqual({ assured: [], created: [], mismatched: [] });
    expect(createdModels()).toEqual([]);
  });

  test("given nothing wanted when assured then it asks nothing at all", async () => {
    // given
    respondWithModels(allBuiltInsPresent);

    // when
    const report = await assureModels(new Anki(), []);

    // then
    expect(report).toEqual({ assured: [], created: [], mismatched: [] });
    expect(
      AnkiConnectMock.requests.filter((request) => request.action === "multi"),
    ).toHaveLength(0);
  });
});

describe("ensureDefaultModels", () => {
  test("given all built-ins present when ensured then assures without creating", async () => {
    // given
    respondWithModels(allBuiltInsPresent);

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report).toEqual({
      assured: [
        "Basic",
        "Basic (and reversed card)",
        "Basic (optional reversed card)",
        "Basic (type in the answer)",
        "Cloze",
      ],
      created: [],
      mismatched: [],
    });
    expect(createdModels()).toEqual([]);
  });

  test("given a collection when read then asks the names once and the fields in a single batch", async () => {
    // given
    respondWithModels(allBuiltInsPresent);

    // when
    await ensureDefaultModels(new Anki());

    // then
    expect(responder.multiActions().map((action) => action.action)).toEqual([
      "modelNames",
      "modelFieldNames",
      "modelFieldNames",
      "modelFieldNames",
      "modelFieldNames",
      "modelFieldNames",
    ]);
    expect(modelFieldCalls()).toEqual([
      "Basic",
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ]);
  });

  test("given AnkiConnect without the removed model action when ensured then never asks for it", async () => {
    // given
    respondWithModels(allBuiltInsPresent);

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.assured).toHaveLength(5);
    expect(
      AnkiConnectMock.requests.map((request) => request.action),
    ).not.toContain("modelNamesAndFieldNames");
  });

  test("given a failing model check when ensured then rejects with a readable message", async () => {
    // given
    AnkiConnectMock.respondWith(null, "collection is not available");

    // when
    const run = ensureDefaultModels(new Anki());

    // then
    await expect(run).rejects.toThrow(
      "Anki model check failed: collection is not available",
    );
  });

  test("given a missing built-in when ensured then creates it from the definition", async () => {
    // given
    respondWithModels({ Basic: ["Front", "Back"] });

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.created).toEqual([
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ]);
    expect(createdModels()).toEqual([
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ]);
    const clozeCall = responder
      .multiActions()
      .find(
        (action) =>
          action.action === "createModel" &&
          action.params["modelName"] === "Cloze",
      );
    expect(clozeCall?.params).toMatchObject({
      inOrderFields: ["Text", "Back Extra"],
      isCloze: true,
    });
  });

  test("given several missing built-ins when ensured then creates them in one batch", async () => {
    // given
    respondWithModels({ Basic: ["Front", "Back"] });

    // when
    await ensureDefaultModels(new Anki());

    // then
    expect(
      AnkiConnectMock.requests.filter((request) => request.action === "multi"),
    ).toHaveLength(2);
  });

  test("given a built-in name that collides case-insensitively when ensured then reports the collision without creating", async () => {
    // given
    const models: Record<string, string[]> = {
      ...allBuiltInsPresent,
      basic: ["Front", "Back"],
    };
    delete models["Basic"];
    respondWithModels(models);

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.mismatched).toEqual([
      {
        actualFields: [],
        conflictingModelName: "basic",
        expectedFields: ["Front", "Back"],
        modelName: "Basic",
        reason: "name-collision",
      },
    ]);
    expect(createdModels()).toEqual([]);
  });

  test("given a user model whose name only looks similar when ensured then still creates the built-in", async () => {
    // given
    respondWithModels({
      "Basic+tag-on-front": ["Front", "Back"],
      Cloze: ["Text", "Back Extra"],
    });

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.mismatched).toEqual([]);
    expect(report.created).toEqual([
      "Basic",
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
    ]);
  });

  test("given a model missing an expected field when ensured then reports mismatch without touching it", async () => {
    // given
    respondWithModels({
      ...allBuiltInsPresent,
      Basic: ["Front"],
    });

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.mismatched).toEqual([
      {
        actualFields: ["Front"],
        expectedFields: ["Front", "Back"],
        modelName: "Basic",
        reason: "schema",
      },
    ]);
    expect(createdModels()).toEqual([]);
    expect(report.assured).toEqual([
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ]);
  });

  test("given a model with an extra user field when ensured then assures it", async () => {
    // given
    respondWithModels({
      ...allBuiltInsPresent,
      Basic: ["Front", "Back", "My Field"],
    });

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.mismatched).toEqual([]);
    expect(report.assured).toContain("Basic");
    expect(createdModels()).toEqual([]);
  });

  test("given built-in definitions when listed then cover all five text models", async () => {
    // when
    const names = builtInModels.map((model) => model.modelName);

    // then
    expect(names).toEqual([
      "Basic",
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ]);
  });

  test("given a missing optional reversed model when ensured then creates it with the conditional template", async () => {
    // given
    const models = { ...allBuiltInsPresent };
    delete models["Basic (optional reversed card)"];
    respondWithModels(models);

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.created).toEqual(["Basic (optional reversed card)"]);
    const call = responder
      .multiActions()
      .find((action) => action.action === "createModel");
    expect(call?.params).toMatchObject({
      inOrderFields: ["Front", "Back", "Add Reverse"],
      isCloze: false,
    });
    const templates = (call?.params as Record<string, unknown>)[
      "cardTemplates"
    ] as Array<Record<string, string>>;
    expect(templates).toHaveLength(2);
    expect(required(templates[1], "template")["Front"]).toContain(
      "{{#Add Reverse}}",
    );
  });

  test("given a missing type-answer model when ensured then creates it with the type template", async () => {
    // given
    const models = { ...allBuiltInsPresent };
    delete models["Basic (type in the answer)"];
    respondWithModels(models);

    // when
    const report = await ensureDefaultModels(new Anki());

    // then
    expect(report.created).toEqual(["Basic (type in the answer)"]);
    const call = responder
      .multiActions()
      .find((action) => action.action === "createModel");
    expect(call?.params).toMatchObject({
      inOrderFields: ["Front", "Back"],
      isCloze: false,
    });
    const templates = (call?.params as Record<string, unknown>)[
      "cardTemplates"
    ] as Array<Record<string, string>>;
    expect(templates).toHaveLength(1);
    expect(required(templates[0], "template")["Front"]).toContain(
      "{{type:Back}}",
    );
  });
});
