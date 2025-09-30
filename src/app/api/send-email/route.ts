import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import { createClient } from "@supabase/supabase-js";
import type { Attachment } from "postmark";
import { signedDocumentMail } from "@/mails/signedDocument";

export async function POST(request: Request) {
  try {
    const { advisor, client, url, docId, name, secondDocBase64, advisorSigPngBase64, docType }: { advisor?: string; client?: string; url?: string; docId?: string; name?: string; secondDocBase64?: string; advisorSigPngBase64?: string; docType?: string } = await request.json();
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

    const safeName = (name && name.trim()) ? name.trim() : `document-signe-${docId}`;
    // 1) Email au client: seulement le document signé principal
    const clientRes = await sendEmail({
      to: client,
      ...signedDocumentMail(),
      attachments: [
        {
          Name: `${safeName}.pdf`,
          Content: data.doc,
          ContentType: "application/pdf",
          ContentID: null,
        } as unknown as Attachment,
      ],
    });

    // 2) Email au conseiller: le document principal + éventuellement le second (AXA)
    const advisorAttachments: Attachment[] = [
      {
        Name: `${safeName}.pdf`,
        Content: data.doc,
        ContentType: "application/pdf",
        ContentID: null,
      } as unknown as Attachment,
    ];
    if (secondDocBase64 && secondDocBase64.trim().length > 0) {
      try {
        // Stamp advisor signature and date into the second doc (server-side)
        const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
        const secondBytes = Buffer.from(secondDocBase64, "base64");
        const pdfDoc = await PDFDocument.load(secondBytes);
        const pages = pdfDoc.getPages();
        const page = pages[pages.length - 1];
        if (!page) throw new Error("No page");
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const yyyy = String(now.getFullYear());
        const dateStr = `${dd}.${mm}.${yyyy}`;
        let dateY = 408;
        if (docType?.includes("3A") && docType?.toLowerCase().includes("ok") && !docType?.toLowerCase().includes("non ok")) {
          dateY = 400;
        } else if (docType?.includes("3B") && docType?.toLowerCase().includes("ok")) {
          dateY = 185;
        } else if (docType?.includes("3B") && docType?.toLowerCase().includes("non ok")) {
          dateY = 110; // doc 2: 160 - 50
        } else if (!(docType?.includes("Axa"))) {
          dateY = 423;
        }
        page.drawText(dateStr, { x: 240, y: dateY, size: 12, font, color: rgb(0,0,0) });
        if (advisorSigPngBase64 && advisorSigPngBase64.trim()) {
          let img;
          try { img = await pdfDoc.embedPng(Buffer.from(advisorSigPngBase64, "base64")); } catch { img = await pdfDoc.embedJpg(Buffer.from(advisorSigPngBase64, "base64")); }
          let sigX = 350, sigY = 408;
          if (docType?.includes("3A") && docType?.toLowerCase().includes("ok") && !docType?.toLowerCase().includes("non ok")) { sigX = 400; sigY = 400; }
          else if (docType?.includes("3B") && docType?.toLowerCase().includes("ok") && !docType?.toLowerCase().includes("non ok")) { sigX = 400; sigY = 185; }
          else if (docType?.includes("3B") && docType?.toLowerCase().includes("non ok")) { sigX = 400; sigY = 110; }
          page.drawImage(img, { x: sigX, y: sigY, width: img.width * 0.15, height: img.height * 0.15, opacity: 1 });
        }
        const stamped = await pdfDoc.save();
        const stampedB64 = Buffer.from(stamped).toString("base64");
        advisorAttachments.push({
          Name: `${safeName}-annexe.pdf`,
          Content: stampedB64,
          ContentType: "application/pdf",
          ContentID: null,
        } as unknown as Attachment);
      } catch {
        // Fallback to raw second doc if stamping fails
        advisorAttachments.push({
          Name: `${safeName}-annexe.pdf`,
          Content: secondDocBase64,
          ContentType: "application/pdf",
          ContentID: null,
        } as unknown as Attachment);
      }
    }

    const advisorRes = await sendEmail({
      to: advisor,
      ...signedDocumentMail(),
      attachments: advisorAttachments,
    });

    console.log("RES EMAIL SENT (client): ", clientRes);
    console.log("RES EMAIL SENT (advisor): ", advisorRes);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("send-email error", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";


