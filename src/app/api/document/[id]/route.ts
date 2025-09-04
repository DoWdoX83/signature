import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase
      .from("Documents")
      .select("doc")
      .eq("id", id)
      .single();

    if (error || !data?.doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const buffer = Buffer.from(data.doc, "base64");

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document-signe-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("download document error", e);
    return NextResponse.json({ error: "Failed to download" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";


