export interface NoteFormData {
  back: string;
  extra: Record<string, unknown>;
  front: string;
  id: number | undefined;
  model: string;
  tags: string;
}

export interface NoteFormEdit {
  back: string;
  front: string;
  tags: string;
}
