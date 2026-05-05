import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vxxyrigjjglzeyqbhxkx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4eHlyaWdqamdsemV5cWJoeGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjQ1MTYsImV4cCI6MjA5MzU0MDUxNn0.NI7rNSB0Rs1QzJFSzaoIjy1dWgEhkIfcw78ItgRcc8Y";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
