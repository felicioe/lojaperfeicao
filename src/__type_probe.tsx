import { supabase } from "@/integrations/supabase/client";

type Test = Parameters<typeof supabase.from>[0];
type SessoesInsert = typeof supabase.from extends (table: infer T) => any ? T : never;

type FromReturn = ReturnType<typeof supabase.from>;

// Forçar erro de tipo para ver o tipo esperado
const x: string = supabase.from("sessoes");
