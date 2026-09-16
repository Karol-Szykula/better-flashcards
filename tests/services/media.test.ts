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
  test("nests attachments under the deck folder", async () => {
    expect(deckAttachmentsFolder("Medicine")).toBe("Medicine/attachments");
  });

  test("maps deck hierarchy to nested folders", async () => {
    expect(deckAttachmentsFolder("Medicine::Anatomy")).toBe(
      "Medicine/Anatomy/attachments"
    );
  });
});

describe("resolveMediaPath", () => {
  test("places the first file directly in attachments", async () => {
    expect(resolveMediaPath("Medicine", "image.png", new Set())).toBe(
      "Medicine/attachments/image.png"
    );
  });

  test("suffixes colliding filenames", async () => {
    const takenPaths = new Set<string>();
    expect(resolveMediaPath("Medicine", "image.png", takenPaths)).toBe(
      "Medicine/attachments/image.png"
    );
    expect(resolveMediaPath("Medicine", "image.png", takenPaths)).toBe(
      "Medicine/attachments/image-1.png"
    );
    expect(resolveMediaPath("Medicine", "image.png", takenPaths)).toBe(
      "Medicine/attachments/image-2.png"
    );
  });

  test("suffixes extensionless filenames", async () => {
    const takenPaths = new Set<string>();
    expect(resolveMediaPath("Medicine", "README", takenPaths)).toBe(
      "Medicine/attachments/README"
    );
    expect(resolveMediaPath("Medicine", "README", takenPaths)).toBe(
      "Medicine/attachments/README-1"
    );
  });
});

describe("decodeBase64", () => {
  test("decodes base64 into bytes", async () => {
    expect(Array.from(new Uint8Array(decodeBase64(sampleBase64)))).toEqual(
      sampleBytes
    );
  });
});

describe("importDeckMedia", () => {
  test("retrieves files and writes them to attachments", async () => {
    const app = App.createConfigured__({ files: {} });
    respondWithMedia({ "a.png": sampleBase64, "b.png": sampleBase64 });

    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "a.png",
      "b.png",
      "a.png",
    ]);

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

  test("skips files missing in Anki", async () => {
    const app = App.createConfigured__({ files: {} });
    respondWithMedia({});

    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "gone.png",
    ]);

    expect(imported).toEqual({});
    expect(
      app.vault.getAbstractFileByPath("Medicine/attachments/gone.png")
    ).toBeNull();
  });

  test("suffixes files colliding with existing vault files", async () => {
    const app = App.createConfigured__({
      files: { "Medicine/attachments/a.png": "old" },
    });
    respondWithMedia({ "a.png": sampleBase64 });

    const imported = await importDeckMedia(new Anki(), (app.vault as unknown as ObsidianVault), "Medicine", [
      "a.png",
    ]);

    expect(imported).toEqual({ "a.png": "Medicine/attachments/a-1.png" });
    const untouched = storedFile(app, "Medicine/attachments/a.png");
    expect(await app.vault.read(untouched)).toBe("old");
  });
});

describe("rewriteMediaReferences", () => {
  test("replaces image and sound references with wiki links", async () => {
    const content =
      '<p><img src="a.png"> and <img src="a.png" alt="x"> plus [sound:b.mp3] and <img src="other.png"></p>';
    const rewritten = rewriteMediaReferences(content, {
      "a.png": "Medicine/attachments/a.png",
      "b.mp3": "Medicine/attachments/b.mp3",
    });
    expect(rewritten).toBe(
      "<p>![[Medicine/attachments/a.png]] and ![[Medicine/attachments/a.png]] plus ![[Medicine/attachments/b.mp3]] and <img src=\"other.png\"></p>"
    );
  });
});
