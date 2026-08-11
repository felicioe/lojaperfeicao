import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Classes de tipografia aplicadas tanto no editor (EditorContent) quanto na
// exibição somente-leitura (RichTextView) — mantém o texto formatado igual
// nos dois lugares sem depender do plugin @tailwindcss/typography.
export const RICH_TEXT_CLASSES =
  "prose-sm max-w-none text-sm [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={title}
      disabled={disabled}
      className={cn("h-7 w-7 p-0", active && "bg-muted")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// Editor de texto rico (negrito, itálico, listas, links) baseado em
// Tiptap/ProseMirror — usado nos campos de informações livres de sessões e
// eventos (issue #228). O HTML salvo é sanitizado só na exibição
// (RichTextView), nunca aqui.
export function RichTextEditor({ value, onChange, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          RICH_TEXT_CLASSES,
          "min-h-[120px] rounded-b-md border border-t-0 px-3 py-2 focus:outline-none",
        ),
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const definirLink = () => {
    const atual = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", atual ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-t-md border border-b-0 bg-muted/40 p-1">
        <ToolbarButton
          title="Negrito"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Itálico"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lista com marcadores"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerada"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Inserir link"
          active={editor.isActive("link")}
          disabled={disabled}
          onClick={definirLink}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Remover link"
          disabled={disabled || !editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
