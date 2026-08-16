import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizarRichText } from "@/lib/rich-text";
import { RICH_TEXT_CLASSES } from "./rich-text-classes";

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
    content: normalizarRichText(value),
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
    const normalizado = normalizarRichText(value);
    if (editor && normalizado !== editor.getHTML()) {
      editor.commands.setContent(normalizado, false);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const definirLink = () => {
    const atual = editor.getAttributes("link").href as string | undefined;
    const digitado = window.prompt("URL do link:", atual ?? "https://");
    if (digitado === null) return;
    const url = digitado.trim();
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    // Sem isso, um domínio digitado sem protocolo ("exemplo.com.br") vira
    // um link relativo à rota atual do app em vez de externo.
    const comProtocolo = /^([a-z][a-z0-9+.-]*:|\/)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().setLink({ href: comProtocolo }).run();
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
