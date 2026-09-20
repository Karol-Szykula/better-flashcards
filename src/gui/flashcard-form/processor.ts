import { MarkdownRenderChild } from "obsidian";
import type {
  MarkdownPostProcessorContext,
  Vault,
} from "obsidian";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { FlashcardForm } from "src/gui/flashcard-form/FlashcardForm";
import { flashcardFormClasses } from "src/gui/flashcard-form/classes";
import { parseFlashcardForm } from "src/gui/flashcard-form/parser";
import { saveFlashcardFormEdit } from "src/gui/flashcard-form/persister";
import type {
  FlashcardFormData,
  FlashcardFormEdit,
} from "src/gui/flashcard-form/types";
import {
  obsidianYamlEngine,
  type YamlEngine,
} from "src/gui/flashcard-form/yaml";

export function mountFlashcardForm(
  el: HTMLElement,
  node: ReactNode
): () => void {
  const root = createRoot(el);
  root.render(node);
  function unmountFlashcardForm(): void {
    root.unmount();
  }
  return unmountFlashcardForm;
}

export class FlashcardFormChild extends MarkdownRenderChild {
  private unmount: (() => void) | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly node: ReactNode
  ) {
    super(containerEl);
  }

  onload(): void {
    this.unmount = mountFlashcardForm(this.containerEl, this.node);
  }

  onunload(): void {
    this.unmount?.();
    this.unmount = null;
  }
}

export const invalidBlockMessage = "Invalid flashcard-form block";

function renderFormError(el: HTMLElement): void {
  const error = document.createElement("div");
  error.className = flashcardFormClasses.error;
  error.textContent = invalidBlockMessage;
  el.appendChild(error);
}

export function createFlashcardFormHandler(
  vault: Vault,
  yaml: YamlEngine = obsidianYamlEngine
) {
  async function handleFlashcardForm(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    let parsed: FlashcardFormData;
    try {
      parsed = parseFlashcardForm(source, yaml);
    } catch {
      renderFormError(el);
      return;
    }
    let savedSource = source;
    function handleEdit(edit: FlashcardFormEdit): void {
      const expectedSource = savedSource;
      const merged = { ...parsed, ...edit };
      void saveFlashcardFormEdit(
        vault,
        ctx,
        el,
        expectedSource,
        merged,
        yaml
      ).then((next) => {
        if (next !== null) {
          savedSource = next;
        }
      });
    }
    ctx.addChild(
      new FlashcardFormChild(
        el,
        createElement(FlashcardForm, { data: parsed, onEdit: handleEdit })
      )
    );
  }
  return handleFlashcardForm;
}
