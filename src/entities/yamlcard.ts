import { basicModelName, codeDeckExtension } from "src/conf/constants";
import { Flashcard } from "src/entities/flashcard";

export class Yamlcard extends Flashcard {
  constructor(
    id: number,
    deckName: string,
    initialContent: string,
    fields: Record<string, string>,
    initialOffset: number,
    endOffset: number,
    tags: string[] = [],
    inserted = false,
    mediaNames: string[] = [],
    modelName: string = basicModelName,
    containsCode = false
  ) {
    super(
      id,
      deckName,
      initialContent,
      fields,
      false,
      initialOffset,
      endOffset,
      tags,
      inserted,
      mediaNames,
      containsCode
    );
    this.modelName = modelName || basicModelName;
    if (containsCode && !this.modelName.endsWith(codeDeckExtension)) {
      this.modelName += codeDeckExtension;
    }
  }

  public getIdFormat(): string {
    return "";
  }
}
