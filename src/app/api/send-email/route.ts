import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import { createClient } from "@supabase/supabase-js";
import type { Attachment } from "postmark";
import { signedDocumentMail } from "@/mails/signedDocument";

export async function POST(request: Request) {
  try {
    const { advisor, client, url, docId }: { advisor?: string; client?: string; url?: string; docId?: string } = await request.json();
    if (!advisor || !client || !docId) {
      return NextResponse.json({ error: "Missing advisor or client" }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase
      .from("Documents")
      .select("doc, signed")
      .eq("id", docId)
      .single();
    if (error || !data?.doc) {
      return NextResponse.json({ error: "Signed document not found" }, { status: 404 });
    }

    const attachments: Attachment[] = [
      {
        Name: `document-signe-${docId}.pdf`,
        Content: data.doc,
        ContentType: "application/pdf",
        ContentID: null,
      } as unknown as Attachment,
    ];

    const res = await sendEmail({
      to: client,
      cc: [advisor],
      ...signedDocumentMail(),
      attachments,
    });

    console.log("RES EMAIL SENT: ", res);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("send-email error", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";


