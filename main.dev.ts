import { registerDevCommands } from "src/dev/commands";
import ObsidianFlashcard from "./main";

export default class ObsidianFlashcardDev extends ObsidianFlashcard {
  override async onload() {
    await super.onload();
    registerDevCommands(this);
  }
}
