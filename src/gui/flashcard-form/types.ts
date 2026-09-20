export interface FlashcardFormData {
  back: string;
  extra: Record<string, unknown>;
  front: string;
  id: number | undefined;
  tags: string;
}

export interface FlashcardFormEdit {
  back: string;
  front: string;
  tags: string;
}
