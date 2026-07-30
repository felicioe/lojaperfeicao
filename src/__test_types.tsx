import { supabase } from "@/integrations/supabase/client";

async function test() {
  const { data } = await supabase.from("sessoes").select("*");
  const { error } = await supabase.from("sessoes").insert({ data: "2024-01-01", tipo: "ordinaria", grau: "aprendiz" });
}
