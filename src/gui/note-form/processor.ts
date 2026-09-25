import { MarkdownRenderChild } from "obsidian";
import type { MarkdownPostProcessorContext, Vault } from "obsidian";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BasicNoteForm } from "src/gui/note-form/BasicNoteForm";
import { ClozeNoteForm } from "src/gui/note-form/ClozeNoteForm";
import { bannerForStatus } from "src/gui/note-form/banners";
import { noteFormClasses } from "src/gui/note-form/classes";
import { parseNoteForm } from "src/services/note-parser";
import { saveNoteFormEdit } from "src/gui/note-form/persister";
import { noteShapeFor, type NoteFormLayout } from "src/entities/note-shapes";
import type { NoteLifecycleStatus } from "src/services/note-lifecycle";
import type { NoteFormData, NoteFormEdit } from "src/entities/note-form-data";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";

function mountNoteForm(el: HTMLElement, node: ReactNode): () => void {
  const root = createRoot(el);
  root.render(node);
  function unmountNoteForm(): void {
    root.unmount();
  }
  return unmountNoteForm;
}

export class NoteFormChild extends MarkdownRenderChild {
  private unmount: (() => void) | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly node: ReactNode,
  ) {
    super(containerEl);
  }

  override onload(): void {
    this.unmount = mountNoteForm(this.containerEl, this.node);
  }

  override onunload(): void {
    this.unmount?.();
    this.unmount = null;
  }
}

const invalidBlockMessage = "Invalid note-form block";

function componentForLayout(layout: NoteFormLayout) {
  return layout === "cloze" ? ClozeNoteForm : BasicNoteForm;
}

function renderFormError(el: HTMLElement): void {
  const error = document.createElement("div");
  error.className = noteFormClasses.error;
  error.textContent = invalidBlockMessage;
  el.appendChild(error);
}

export type NoteStatusResolver = (
  noteId: number | undefined,
) => NoteLifecycleStatus | undefined;

function renderBanner(banner: string): ReactNode {
  return createElement("div", { className: noteFormClasses.banner }, banner);
}

export function createNoteFormHandler(
  vault: Vault,
  resolveStatus: NoteStatusResolver,
  yaml: YamlEngine = obsidianYamlEngine,
) {
  function handleNoteForm(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> {
    const parsed = parseFormSource(source, el, yaml);
    if (!parsed) {
      return Promise.resolve();
    }
    const handleEdit = createEditHandler(vault, ctx, el, parsed, yaml, source);
    const form = componentForLayout(noteShapeFor(parsed.model).layout);
    const banner = bannerForStatus(resolveStatus(parsed.id));
    const node =
      banner === undefined
        ? createElement(form, { data: parsed, onEdit: handleEdit })
        : createElement(
            "div",
            null,
            renderBanner(banner),
            createElement(form, { data: parsed, onEdit: handleEdit }),
          );
    ctx.addChild(new NoteFormChild(el, node));
    return Promise.resolve();
  }
  return handleNoteForm;
}

function parseFormSource(
  source: string,
  el: HTMLElement,
  yaml: YamlEngine,
): NoteFormData | null {
  try {
    return parseNoteForm(source, yaml);
  } catch {
    renderFormError(el);
    return null;
  }
}

function createEditHandler(
  vault: Vault,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  parsed: NoteFormData,
  yaml: YamlEngine,
  initialSource: string,
): (edit: NoteFormEdit) => void {
  let savedSource = initialSource;
  function handleEdit(edit: NoteFormEdit): void {
    const expectedSource = savedSource;
    const merged = { ...parsed, ...edit };
    void saveNoteFormEdit(vault, ctx, el, expectedSource, merged, yaml).then(
      (next) => {
        if (next !== null) {
          savedSource = next;
        }
      },
    );
  }
  return handleEdit;
}
