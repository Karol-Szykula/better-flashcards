export interface EmbedElementMock {
  outerHTML: string;
  src: string;
}

function createActiveDocumentMock(embeds: EmbedElementMock[] = []) {
  const elements = embeds.map((embed) => ({
    getAttribute: (name: string) => (name === "src" ? embed.src : null),
    outerHTML: embed.outerHTML,
  }));

  return {
    documentElement: {
      getElementsByClassName: jest.fn(() => elements),
    },
  };
}

export function setActiveDocument(embeds: EmbedElementMock[] = []) {
  Object.assign(globalThis, {
    activeDocument: createActiveDocumentMock(embeds),
  });
}
