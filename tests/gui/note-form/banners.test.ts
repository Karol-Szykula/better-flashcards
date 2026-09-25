import { bannerForStatus } from "src/gui/note-form/banners";

describe("bannerForStatus", () => {
  test("given a diverged note when resolved then warns about newest-wins", async () => {
    // when
    const banner = bannerForStatus("synced.diverged");

    // then
    expect(banner).toContain("newest version wins");
  });

  test("given a note deleted in anki when resolved then warns about removal", async () => {
    // when
    const banner = bannerForStatus("vaultOnly.ankiDeleted");

    // then
    expect(banner).toContain("Deleted in Anki");
  });

  test("given a clean note when resolved then shows no banner", async () => {
    // when
    const banner = bannerForStatus("synced.clean");

    // then
    expect(banner).toBeUndefined();
  });

  test("given no status when resolved then shows no banner", async () => {
    // when
    const banner = bannerForStatus(undefined);

    // then
    expect(banner).toBeUndefined();
  });
});
