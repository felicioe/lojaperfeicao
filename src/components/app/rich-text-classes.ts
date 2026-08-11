// Classes de tipografia aplicadas tanto no editor (RichTextEditor) quanto
// na exibição somente-leitura (RichTextView) — mantém o texto formatado
// igual nos dois lugares sem depender do plugin @tailwindcss/typography.
// Isolado num módulo próprio (sem importar Tiptap) pra RichTextView não
// puxar o editor inteiro (ProseMirror etc.) só por causa dessa string.
export const RICH_TEXT_CLASSES =
  "prose-sm max-w-none text-sm [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold";
