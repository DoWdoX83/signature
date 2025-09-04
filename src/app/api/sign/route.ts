import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb } from "pdf-lib";

export async function POST(request: Request) {
  try {
    const { id, signatureDataUrl } = await request.json();
    if (!id || !signatureDataUrl) {
      return NextResponse.json({ error: "Missing id or signature" }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1) Load original PDF from Supabase
    const { data: docRow, error: fetchErr } = await supabase
      .from("Documents")
      .select("doc")
      .eq("id", id)
      .single();
    if (fetchErr || !docRow?.doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }
    const originalPdf = Buffer.from(docRow.doc, "base64");

    // 2) Embed signature image
    const sigBase64 = signatureDataUrl.split(",")[1] ?? signatureDataUrl;
    const sigBytes = Buffer.from(sigBase64, "base64");

    const pdfDoc = await PDFDocument.load(originalPdf);
    // Try to find a form field whose name equals/contains 'signature'
    const form = pdfDoc.getForm();
    // Identify the exact widget location; avoid any default/fallback placement
    let pageIndex = -1;
    let x = 0, y = 0, w = 0, h = 0;
    let candidate: any = null;
    try {
      const allFields = (form as any).getFields?.() ?? [];
      const found = (allFields as any[]).find((f: any) => {
        const n = f?.getName?.() ?? "";
        const lower = String(n).toLowerCase();
        return lower === "signaturezone" || lower.includes("signature");
      });
      candidate = found ?? (form as any).getField?.("signatureZone");
      const widgets = candidate?.acroField?.getWidgets?.() ?? [];
      if (widgets.length > 0) {
        // If multiple widgets exist, prefer the last (often later pages)
        const widget = widgets[widgets.length - 1];
        const rect = widget.getRectangle();
        const pRef = widget.P();
        const pIdx = pdfDoc.getPages().findIndex((p: any) => p.ref === pRef);
        if (pIdx >= 0) pageIndex = pIdx;
        x = rect.x;
        y = rect.y;
        w = rect.width;
        h = rect.height;
      }
    } catch {}

    const pages = pdfDoc.getPages();
    const page = pageIndex >= 0 ? pages[pageIndex] : undefined;
    // Embed as PNG or JPEG depending on data
    let image;
    try {
      image = await pdfDoc.embedPng(sigBytes);
    } catch {
      image = await pdfDoc.embedJpg(sigBytes);
    }
    const scale = w > 0 && h > 0 ? Math.min(w / image.width, h / image.height) : 1;
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const offsetX = x + (w - drawW) / 2;
    const offsetY = y + (h - drawH) / 2;
    let placed = false;
    if (candidate && typeof (candidate as any).setImage === "function") {
      try {
        (candidate as any).setImage(image);
        placed = true;
      } catch {}
    }
    if (!placed && pageIndex >= 0 && page) {
      page.drawImage(image, { x: offsetX, y: offsetY, width: drawW, height: drawH, opacity: 1 });
    }
    try { form.flatten(); } catch {}

    const signedBytes = await pdfDoc.save();
    const signedBase64 = Buffer.from(signedBytes).toString("base64");

    // 3) Update Supabase with signed PDF (overwrite 'doc')
    const { error: updateErr } = await supabase
      .from("Documents")
      .update({ doc: signedBase64, signed: true })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json({ error: "Échec de l'enregistrement du PDF signé" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, signedBase64 });
  } catch (error) {
    console.error("Sign save error", error);
    return NextResponse.json({ error: "Failed to save signature" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";


