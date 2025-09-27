import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export async function POST(request: Request) {
  try {
    const { id, signatureDataUrl, docType } = await request.json();
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
    // Decide where to place the signature
    const form = pdfDoc.getForm();
    let targetPage: any = undefined;
    let x = 0, y = 0, w = 0, h = 0;
    let candidate: any = null;
    const isAxa = typeof docType === "string" && docType.toLowerCase().startsWith("axa");
    if (!isAxa) {
      try {
        const allFields = (form as any).getFields?.() ?? [];
        // Prefer exact name match first
        let found = (allFields as any[]).find((f: any) => {
          try { return String(f?.getName?.()) === "signatureZone"; } catch { return false; }
        });
        if (!found) found = (allFields as any[]).find((f: any) => {
          const n = f?.getName?.() ?? "";
          const lower = String(n).toLowerCase();
          return lower === "signaturezone" || lower.includes("signature");
        });
        candidate = found ?? (form as any).getField?.("signatureZone");
        const widgets = (candidate as any)?.getWidgets?.() ?? candidate?.acroField?.getWidgets?.() ?? [];
        if (widgets.length > 0) {
          const widget = widgets[widgets.length - 1];
          const rect = widget.getRectangle();
          const p = widget.getPage?.() ?? undefined;
          if (p) targetPage = p;
          if (!targetPage) {
            const pRef = widget.P?.() ?? undefined;
            if (pRef) {
              const pRefStr = pRef?.toString?.();
              const pagesAll = pdfDoc.getPages();
              const matched = pagesAll.find((pg: any) => pg?.ref?.toString?.() === pRefStr);
              if (matched) targetPage = matched;
            }
          }
          x = rect.x;
          y = rect.y;
          w = rect.width;
          h = rect.height;
          console.log(`[signature placement] field=${candidate?.getName?.()} pageSet=${!!targetPage} rect=(${x},${y},${w},${h})`);
        }
      } catch {}
    }

    const pages = pdfDoc.getPages();
    if (!targetPage) targetPage = pages[pages.length - 1] ?? pages[0];
    // Embed as PNG or JPEG depending on data
    let image;
    try {
      image = await pdfDoc.embedPng(sigBytes);
    } catch {
      image = await pdfDoc.embedJpg(sigBytes);
    }
    let drawW: number;
    let drawH: number;
    let offsetX: number;
    let offsetY: number;
    if (isAxa) {
      // AXA: fix image width for consistency across devices
      const type = String(docType || "");
      const lower = type.toLowerCase();
      const is3a = lower.includes("3a");
      const is3b = lower.includes("3b");
      const isNonOk = lower.includes("non ok");
      const isOk = lower.includes("ok") && !isNonOk;
      const targetWidth = 180; // points
      drawW = targetWidth;
      drawH = (image.height / image.width) * targetWidth;

      if (is3a && isNonOk) {
        offsetX = 380; offsetY = 423;
      } else if (is3a && isOk) {
        offsetX = 400; offsetY = 465;
      } else if (is3b && isNonOk) {
        offsetX = 480; offsetY = 20;
      } else if (is3b && isOk) {
        offsetX = 350; offsetY = 150;
      } else {
        offsetX = 380; offsetY = 423;
      }
    } else {
      const scale = w > 0 && h > 0 ? Math.min(w / image.width, h / image.height) : 1;
      drawW = image.width * scale;
      drawH = image.height * scale;
      offsetX = x + (w - drawW) / 2;
      offsetY = y + (h - drawH) / 2;
    }
    let placed = false;
    if (candidate && typeof (candidate as any).setImage === "function") {
      try {
        (candidate as any).setImage(image);
        placed = true;
      } catch {}
    }
    if (!placed && targetPage) {
      targetPage.drawImage(image, { x: offsetX, y: offsetY, width: drawW, height: drawH, opacity: 1 });
    }

    // If AXA, also draw today's date at fixed coordinates
    if (isAxa && targetPage) {
      try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const yyyy = String(now.getFullYear());
        const dateStr = `${dd}.${mm}.${yyyy}`;
        const type = String(docType || "");
        const lower = type.toLowerCase();
        const is3a = lower.includes("3a");
        const is3b = lower.includes("3b");
        const isNonOk = lower.includes("non ok");
        const isOk = lower.includes("ok") && !isNonOk;
        let dateY = 423;
        if (is3a && isOk) {
          dateY = 465;
        } else if (is3b && isNonOk) {
          dateY = 200;
        } else if (is3b && isOk) {
          dateY = 150;
        }
        targetPage.drawText(dateStr, {
          x: 240,
          y: dateY,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
        console.log(`[axa-sign] type=${type} placed sign=(${offsetX},${offsetY}) size=(${drawW}x${drawH}) dateY=${dateY}`);
      } catch {}
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

    // Include minimal debug info to help diagnose mobile placement
    return NextResponse.json({ ok: true, signedBase64, debug: { type: docType, isAxa, offsetX, offsetY, drawW, drawH } });
  } catch (error) {
    console.error("Sign save error", error);
    return NextResponse.json({ error: "Failed to save signature" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";