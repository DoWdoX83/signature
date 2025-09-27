import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const disposition = (url.searchParams.get("disposition") || "attachment").toLowerCase() === "inline" ? "inline" : "attachment";
    const safeName = name && name.trim() ? name.trim() : `document-signe-${id}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
    };
    if (disposition === "attachment") {
      headers["Content-Disposition"] = `attachment; filename="${safeName}.pdf"`;
    }
    return new Response(buffer, { headers });
  } catch (e) {
    console.error("download document error", e);
    return NextResponse.json({ error: "Failed to download" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await request.json();
    const docBase64 = body?.docBase64 as string | undefined;
    if (!docBase64) return NextResponse.json({ error: "Missing docBase64" }, { status: 400 });

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error } = await supabase
      .from("Documents")
      .update({ doc: docBase64, signed: false })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("update document error", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";


