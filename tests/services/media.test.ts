/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals, so this suite runs in jsdom.
 */
import "obsidian-test-mocks/jest-setup";
import { App, TFile } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { Anki } from "src/services/anki";
import {
  deckAttachmentsFolder,
  decodeBase64,
  importDeckMedia,
  resolveMediaPath,
  rewriteMediaReferences,
} from "src/services/media";
import { AnkiConnectMock } from "../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

const sampleBase64 = "ZGF0YQ==";
const sampleBytes = [100, 97, 116, 97];

function respondWithMedia(contentByFilename: Record<string, string | null>) {
  AnkiConnectMock.setResponder((request) => {
    if (request.action !== "retrieveMediaFile") {
      return { result: null, error: null };
    }
    const params = request.params as Record<string, unknown>;
    const filename = params["filename"] as string;
    return { result: contentByFilename[filename] ?? null, error: null };
  });
}

function storedFile(app: App, path: string): TFile {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    throw new Error(`${path} not found in mock vault`);
  }
  return file;
}

describe("deckAttachmentsFolder", () => {
  test("given a deck name when resolved then nests attachments under it", async () => {
    // when
    const folder = deckAttachmentsFolder("Medicine");

    // then
    expect(folder).toBe("Medicine/attachments");
  });

  test("given a deck hierarchy when resolved then maps it to nested folders", async () => {
    // when
    const folder = deckAttachmentsFolder("Medicine::Anatomy");

    // then
    expect(folder).toBe("Medicine/Anatomy/attachments");
  });
});

describe("resolveMediaPath", () => {
  test("given a free filename when resolved then places it directly in attachments", async () => {
    // given
    const takenPaths = new Set<string>();

    // when
    const targetPath = resolveMediaPath("Medicine", "image.png", takenPaths);

    // then
    expect(targetPath).toBe("Medicine/attachments/image.png");
  });

  test("given colliding filenames when resolved then suffixes them in order", async () => {
    // given
    const takenPaths = new Set<string>();

    // when
    const firstPath = resolveMediaPath("Medicine", "image.png", takenPaths);
    const secondPath = resolveMediaPath("Medicine", "image.png", takenPaths);
    const thirdPath = resolveMediaPath("Medicine", "image.png", takenPaths);

    // then
    expect(firstPath).toBe("Medicine/attachments/image.png");
    expect(secondPath).toBe("Medicine/attachments/image-1.png");
    expect(thirdPath).toBe("Medicine/attachments/image-2.png");
  });

  test("given an extensionless filename when resolved then suffixes its stem", async () => {
    // given
    const takenPaths = new Set<string>();

    // when
    const firstPath = resolveMediaPath("Medicine", "README", takenPaths);
    const secondPath = resolveMediaPath("Medicine", "README", takenPaths);

    // then
    expect(firstPath).toBe("Medicine/attachments/README");
    expect(secondPath).toBe("Medicine/attachments/README-1");
  });
});

describe("decodeBase64", () => {
  test("given base64 input when decoded then returns bytes", async () => {
    // when
    const decoded = Array.from(new Uint8Array(decodeBase64(sampleBase64)));

    // then
    expect(decoded).toEqual(sampleBytes);
  });
});

describe("importDeckMedia", () => {
  test("given media in Anki when imported then retrieves them once and writes to attachments", async () => {
    // given
    const app = App.createConfigured__({ files: {} });
    respondWithMedia({ "a.png": sampleBase64, "b.png": sampleBase64 });

    // when
    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "a.png",
      "b.png",
      "a.png",
    ]);

    // then
    expect(imported).toEqual({
      "a.png": "Medicine/attachments/a.png",
      "b.png": "Medicine/attachments/b.png",
    });
    const retrieved = AnkiConnectMock.requests.filter(
      (r) => r.action === "retrieveMediaFile"
    );
    expect(retrieved).toHaveLength(2);
    const stored = await app.vault.readBinary(
      storedFile(app, "Medicine/attachments/a.png")
    );
    expect(Array.from(new Uint8Array(stored))).toEqual(sampleBytes);
  });

  test("given a missing file when imported then skips it without writing", async () => {
    // given
    const app = App.createConfigured__({ files: {} });
    respondWithMedia({});

    // when
    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "gone.png",
    ]);

    // then
    expect(imported).toEqual({});
    expect(
      app.vault.getAbstractFileByPath("Medicine/attachments/gone.png")
    ).toBeNull();
  });

  test("given no media when imported then leaves the vault untouched", async () => {
    // given
    const app = App.createConfigured__({ files: {} });
    const createFolder = jest.spyOn(app.vault, "createFolder");
    respondWithMedia({ "a.png": sampleBase64 });

    // when
    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", []);

    // then
    expect(imported).toEqual({});
    expect(createFolder).not.toHaveBeenCalled();
    expect(app.vault.getAbstractFileByPath("Medicine")).toBeNull();
  });

  test("given only missing files when imported then skips folder creation", async () => {
    // given
    const app = App.createConfigured__({ files: {} });
    const createFolder = jest.spyOn(app.vault, "createFolder");
    respondWithMedia({});

    // when
    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "gone.png",
    ]);

    // then
    expect(imported).toEqual({});
    expect(createFolder).not.toHaveBeenCalled();
    expect(app.vault.getAbstractFileByPath("Medicine")).toBeNull();
  });

  test("given an existing vault file when imported then suffixes and preserves the old file", async () => {
    // given
    const app = App.createConfigured__({
      files: { "Medicine/attachments/a.png": "old" },
    });
    respondWithMedia({ "a.png": sampleBase64 });

    // when
    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "a.png",
    ]);

    // then
    expect(imported).toEqual({ "a.png": "Medicine/attachments/a-1.png" });
    const untouched = storedFile(app, "Medicine/attachments/a.png");
    expect(await app.vault.read(untouched)).toBe("old");
  });
});

describe("rewriteMediaReferences", () => {
  test("given image and sound references when rewritten then replaces them with wiki links", async () => {
    // given
    const content =
      '<p><img src="a.png"> and <img src="a.png" alt="x"> plus [sound:b.mp3] and <img src="other.png"></p>';

    // when
    const rewritten = rewriteMediaReferences(content, {
      "a.png": "Medicine/attachments/a.png",
      "b.mp3": "Medicine/attachments/b.mp3",
    });

    // then
    expect(rewritten).toBe(
      "<p>![[Medicine/attachments/a.png]] and ![[Medicine/attachments/a.png]] plus ![[Medicine/attachments/b.mp3]] and <img src=\"other.png\"></p>"
    );
  });
});
