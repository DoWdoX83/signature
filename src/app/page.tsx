"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dropzone from "react-dropzone";
import SignaturePad from "react-signature-canvas";
import { QRCodeCanvas } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";

type Uploaded = { id: string; url: string } | null;

function trimTransparentPixels(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return sourceCanvas;
  const { width, height } = sourceCanvas;
  const imageData = sourceContext.getImageData(0, 0, width, height);
  const data = imageData.data;

  let top: number | null = null;
  let left: number | null = null;
  let right: number | null = null;
  let bottom: number | null = null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha !== 0) {
        if (top === null) top = y;
        if (left === null || x < left) left = x;
        if (right === null || x > right) right = x;
        bottom = y;
      }
    }
  }

  if (top === null || left === null || right === null || bottom === null) {
    return sourceCanvas;
  }

  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = cropWidth;
  trimmedCanvas.height = cropHeight;
  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) return sourceCanvas;
  trimmedContext.drawImage(
    sourceCanvas,
    left,
    top,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );
  return trimmedCanvas;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  try {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk) as any);
    }
    return typeof btoa === "function" ? btoa(binary) : "";
  } catch {
    try {
      // Fallback when Buffer is available (SSR or polyfill)
      return (Buffer as any)?.from?.(bytes)?.toString?.("base64") ?? "";
    } catch {
      return "";
    }
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = typeof atob === "function" ? atob(base64) : "";
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function formatToday(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

async function buildAxaSecondWithAdvisor(base64: string, advisorSigRef: React.MutableRefObject<SignaturePad | null>, docType: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const secondBytes = base64ToUint8Array(base64);
  const secondDoc = await PDFDocument.load(secondBytes);
  const pages2 = secondDoc.getPages();
  const last2 = pages2.length > 0 ? pages2[pages2.length - 1] : undefined;
  if (!last2) throw new Error("Second PDF has no pages");
  const font = await secondDoc.embedFont(StandardFonts.Helvetica);
  const dateStr = formatToday();
  // y coordinate varies based on selectedDocType
  let dateY = 423;
  if (docType.includes("3A") && docType.toLowerCase().includes("ok") && !docType.toLowerCase().includes("non ok")) {
    dateY = 425; // align to signature Y below (415 for doc 2)
  } else if (docType.includes("3B") && docType.toLowerCase().includes("non ok")) {
    dateY = 140;
  } else if (docType.includes("3B") && docType.toLowerCase().includes("ok")) {
    dateY = 140;
  }
  last2.drawText(dateStr, { x: 240, y: dateY, size: 12, font, color: rgb(0,0,0) });
  if (advisorSigRef.current && !(advisorSigRef.current as any).isEmpty()) {
    const sigDataUrl = (advisorSigRef.current as any).toDataURL("image/png");
    const imgBase64 = sigDataUrl.split(",")[1] || sigDataUrl;
    let img;
    try { img = await secondDoc.embedPng(base64ToUint8Array(imgBase64)); } catch { img = await secondDoc.embedJpg(base64ToUint8Array(imgBase64)); }
    // signature X/Y vary with type
    let sigX = 350; let sigY = 423;
    if (docType.includes("3A") && docType.toLowerCase().includes("ok") && !docType.toLowerCase().includes("non ok")) {
      sigX = 350; sigY = 415; // 350,415
    } else if (docType.includes("3B") && docType.toLowerCase().includes("non ok")) {
      sigX = 350; sigY = 135;
    } else if (docType.includes("3B") && docType.toLowerCase().includes("ok")) {
      sigX = 350; sigY = 135; // 350,200
    }
    last2.drawImage(img, { x: sigX, y: sigY, width: img.width * 0.15, height: img.height * 0.15, opacity: 1 });
  }
  const final = await secondDoc.save();
  return final;
}

export default function Home() {
  const [uploaded, setUploaded] = useState<Uploaded>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isApplyingSignature, setIsApplyingSignature] = useState(false);
  const [isFetchingDocument, setIsFetchingDocument] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const sigRef = useRef<SignaturePad | null>(null);
  const advisorSigRef = useRef<SignaturePad | null>(null);
  const sigContainerRef = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [isSigModalOpen, setIsSigModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  const [secondFile, setSecondFile] = useState<File | null>(null);
  const [axaSecondDocBase64, setAxaSecondDocBase64] = useState<string | null>(null);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [advisorSigned, setAdvisorSigned] = useState(false);
  const [advisorEmail, setAdvisorEmail] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isMobileQuery, setIsMobileQuery] = useState(false);

  useEffect(() => {
    const el = sigContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Force the internal react-signature-canvas resize logic
      window.dispatchEvent(new Event("resize"));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const mq = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(pointer: coarse), (max-width: 640px)")
      : null;
    const update = () => setIsMobile(!!mq && mq.matches);
    update();
    mq?.addEventListener("change", update);
    return () => mq?.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      setIsMobileQuery(params.get("isMobile") === "true");
    } catch {}
  }, []);

  // Auto-fetch existing document on mobile deep link (?isMobile=true&docId=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const isMob = params.get("isMobile") === "true";
      const dId = params.get("docId");
      if (isMob && dId && !pdfPreviewUrl) {
        setIsFetchingDocument(true);
        setUploaded({ id: dId, url: "" });
        setPdfPreviewUrl(`/api/document/${dId}?disposition=inline`);
      }
    } catch {}
    // Only run on first load or when preview is empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileQuery]);

  const [qrUrl, setQrUrl] = useState("");

  const signUrl = useMemo(() => {
    if (!qrUrl) return "";
    try {
      const u = new URL(qrUrl);
      u.searchParams.set("isMobile", "true");
      if (selectedDocType) u.searchParams.set("docType", selectedDocType);
      return u.toString();
    } catch {
      const base = qrUrl + (qrUrl.includes("?") ? "&" : "?") + "isMobile=true";
      return selectedDocType ? base + `&docType=${encodeURIComponent(selectedDocType)}` : base;
    }
  }, [qrUrl, selectedDocType]);
  const pdfSrc = useMemo(() => {
    if (!pdfPreviewUrl) return "";
    return `${pdfPreviewUrl}#view=FitH&toolbar=0&navpanes=0&statusbar=0&zoom=page-width`;
  }, [pdfPreviewUrl]);

  useEffect(() => {
    return () => {
      try {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      } catch {}
    };
  }, [pdfPreviewUrl]);

  // Realtime when visiting desktop with a docId present (watch for new/updated doc)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileQuery) return; // ne pas écouter en mode mobile
    const params = new URLSearchParams(window.location.search);
    const urlDocId = params.get("docId");
    const effectiveDocId = uploaded?.id || urlDocId;
    if (!effectiveDocId) return;

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
    const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY) as string | undefined;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const channel = supabase
      .channel(`documents-updates-${effectiveDocId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Documents", filter: `id=eq.${effectiveDocId}` },
        (payload: any) => {
          console.log("payload", payload);
          try {
            const row = payload?.new ?? payload?.record ?? null;
            const id = row?.id || effectiveDocId;
            // Refresh viewer to latest document
            setUploaded({ id, url: "" });
            const latestUrl = `/api/document/${id}?disposition=inline`;
            setPdfPreviewUrl(latestUrl);
            setSignedPdfUrl(latestUrl);
            // Open modal to let user download/send
            setIsSigModalOpen(true);
          } catch {}
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [uploaded?.id, isMobileQuery]);

  const [baseFile, setBaseFile] = useState<File | null>(null);
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Veuillez déposer un PDF.");
      return;
    }
    setError(null);
    // Ne pas uploader ni pré-visualiser immédiatement
    try { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); } catch {}
    setPdfPreviewUrl("");
    setBaseFile(file);
    setSelectedDocType("");
    setSecondFile(null);
    setAxaSecondDocBase64(null);
    setIsTypeModalOpen(true);
  }, [pdfPreviewUrl, isMobileQuery]);

  const handleClear = useCallback(() => {
    sigRef.current?.clear();
  }, []);

  const handleSaveSignature = useCallback(async () => {
    if (!uploaded) {
      setError("Veuillez d'abord téléverser un PDF.");
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Veuillez signer dans la zone de signature.");
      return;
    }
    setError(null);
    setIsApplyingSignature(true);
    const baseCanvas = (sigRef.current as any).getCanvas
      ? (sigRef.current as any).getCanvas()
      : null;
    const workingCanvas = baseCanvas
      ? (() => {
          const copy = document.createElement("canvas");
          copy.width = baseCanvas.width;
          copy.height = baseCanvas.height;
          const ctx = copy.getContext("2d");
          if (ctx) ctx.drawImage(baseCanvas, 0, 0);
          return trimTransparentPixels(copy);
        })()
      : (sigRef.current as any).getTrimmedCanvas
      ? (sigRef.current as any).getTrimmedCanvas()
      : (sigRef.current as any).toDataURL
      ? null
      : null;
    const dataUrl = workingCanvas
      ? workingCanvas.toDataURL("image/png")
      : (sigRef.current as any).toDataURL
      ? (sigRef.current as any).toDataURL("image/png")
      : "";
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uploaded.id, signatureDataUrl: dataUrl, docType: selectedDocType }),
      });
      if (!res.ok) throw new Error("Sign error");
      setSignedPdfUrl(`/api/document/${uploaded.id}?disposition=inline`);
      if (!isMobileQuery) {
        setIsSigModalOpen(true);
      } else {
        setIsSuccessModalOpen(true);
      }
    } catch (e) {
      setError("Échec de l'enregistrement de la signature");
    } finally {
      setIsApplyingSignature(false);
    }
  }, [uploaded, isMobileQuery]);

  const isDocNameValid = documentName.trim().length > 0;
  const isAxaSelected = selectedDocType.startsWith("Axa");
  const canSend = advisorEmail.trim().length > 0 && clientEmail.trim().length > 0 && isDocNameValid && (!isAxaSelected || advisorSigned);
  const canDownload = isDocNameValid && (!isAxaSelected || advisorSigned) && !!uploaded?.id;

  // Fusion côté client si un second PDF est fourni (cas AXA)
  const handleValidateTypeModal = useCallback(async () => {
    try {
      if (!baseFile) {
        setError("Aucun document de base");
        return;
      }
      setIsUploading(true);
      let finalBytes: Uint8Array | null = null;
      const setNameFromType = () => {
        if (selectedDocType) setDocumentName(selectedDocType);
      };
      const isAxa = selectedDocType.startsWith("Axa");
      // Toujours uploader le premier document seulement
      const baseArray = await baseFile.arrayBuffer();
      finalBytes = new Uint8Array(baseArray);
      // Si AXA et un 2e fichier est fourni, le conserver seulement en mémoire (base64)
      if (isAxa) {
        if (!secondFile) {
          setError("Merci d'ajouter le 2e PDF pour les documents AXA");
          setIsUploading(false);
          return;
        }
        const secondArray = await secondFile.arrayBuffer();
        const b64 = uint8ArrayToBase64(new Uint8Array(secondArray));
        setAxaSecondDocBase64(b64);
      } else {
        setAxaSecondDocBase64(null);
      }

      // Upload du document (fusionné ou simple)
      const finalArrayBuffer = finalBytes!.buffer.slice(finalBytes!.byteOffset, finalBytes!.byteOffset + finalBytes!.byteLength) as ArrayBuffer;
      const finalBlob = new Blob([new Uint8Array(finalArrayBuffer)], { type: "application/pdf" });
      const finalFile = new File([finalBlob], "document.pdf", { type: "application/pdf" });
      const form = new FormData();
      form.append("file", finalFile);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload error");
      const json = (await res.json()) as { id: string };
      setUploaded({ id: json.id, url: "" });
      const url = new URL(window.location.href);
      url.searchParams.set("docId", json.id);
      const href = url.toString();
      window.history.replaceState(null, "", href);
      setQrUrl(href);
      setPdfPreviewUrl(`/api/document/${json.id}?disposition=inline`);
      setNameFromType();
      setIsTypeModalOpen(false);
      setSecondFile(null);
      setBaseFile(null);
      // Ne pas ouvrir la modale d'envoi ici; elle s'ouvrira après signature
    } catch (e) {
      setError("Échec de la préparation du document");
    } finally {
      setIsUploading(false);
    }
  }, [secondFile, selectedDocType, baseFile]);
  const handleSendEmails = useCallback(async () => {
    if (!canSend) return;
    try {
      let advisorSigPngBase64: string | undefined = undefined;
      if (isAxaSelected && advisorSigRef.current && !(advisorSigRef.current as any).isEmpty()) {
        const sigDataUrl = (advisorSigRef.current as any).toDataURL("image/png");
        advisorSigPngBase64 = sigDataUrl.split(",")[1] || sigDataUrl;
      }
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisor: advisorEmail.trim(), client: clientEmail.trim(), url: qrUrl, docId: uploaded?.id, name: documentName.trim() || undefined, secondDocBase64: axaSecondDocBase64 || undefined, advisorSigPngBase64, docType: selectedDocType }),
      });
      setIsSigModalOpen(false);
    } catch {}
  }, [advisorEmail, clientEmail, canSend, qrUrl, uploaded?.id, axaSecondDocBase64]);

  return (
    <div>
      {/* Bandeau vert 1/3 écran */}
      <div className="min-h-[33vh] sm:min-h-[40vh] bg-[var(--brand-green)] flex items-center justify-center">
        <p className="text-white font-extrabold text-2xl sm:text-3xl -mt-52">Signature de document</p>
      </div>

      {/* Carte centrale */}
      <div className="relative z-10 w-[85vw] max-w-[1200px] -mt-[24vh] mx-auto mb-12 bg-white rounded-3xl shadow-2xl ring-1 p-4 ring-black/10 space-y-6">
        {/* Dropzone */}
        <Dropzone onDrop={onDrop} multiple={false} accept={{ "application/pdf": [".pdf"] }}>
          {({ getRootProps, getInputProps, isDragActive }) => (
            <div
              {...getRootProps()}
              className="bg-[var(--green-light)] rounded-xl h-14 sm:h-16 cursor-pointer border border-green-200 border-dashed flex items-center justify-center"
            >
              <input {...getInputProps()} />
              <div className="flex items-center justify-center gap-4 text-[#2d4c46] text-sm sm:text-base">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d4c46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>
                  {isMobile
                    ? "Choisir le fichier"
                    : isDragActive
                    ? "Déposez le fichier ici"
                    : "Drag and drop ou choisir un fichier à signer"}
                </span>
              </div>
              {isUploading && <div className="text-center mt-2 text-[#2d4c46]">Envoi en cours...</div>}
            </div>
          )}
        </Dropzone>

        {/* Document */}
        <div className="sm:flex gap-4">
          <div className="w-full sm:w-1/2">
            <div className="text-gray-800 font-semibold">Document</div>
            <div className="border border-[var(--border-subtle)] rounded-xl max-h-[350px] min-h-[350px] sm:min-h-[420px] sm:max-h-[420px] overflow-hidden bg-white flex items-center justify-center">
              {pdfPreviewUrl ? (
                <>
                  <div className="hidden sm:block w-full">
                    <iframe
                      src={pdfSrc}
                      className="w-full h-[420px] border-0"
                      onLoad={() => setIsFetchingDocument(false)}
                    />
                  </div>
                  <div className="block sm:hidden w-full text-center p-4">
                    <a
                      href={pdfPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex mt-3 items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2"
                    >
                      Visualiser le PDF
                    </a>
                  </div>
                </>
              ) : (
                <div className="text-center text-[#6c757d] py-16">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mx-auto">
                    <rect x="3" y="3" width="18" height="14" rx="2" ry="2"></rect>
                    <line x1="3" y1="19" x2="21" y2="19"></line>
                  </svg>
                  <div className="mt-2">Aucun document importé</div>
                </div>
              )}
            </div>
          </div>

          {/* Signature */}
          <div className="sm:w-1/2 w-full">
            <div className="text-gray-800 font-semibold">Signature</div>
            <div className="relative border border-[var(--border-subtle)] rounded-xl bg-white h-[150px] sm:h-[260px] overflow-hidden flex items-center justify-center p-4">
              <div ref={sigContainerRef} className="relative w-[92%] h-[120px] sm:w-[80%] sm:h-[180px] bg-[#f0f5f8] rounded-2xl">
                {showHint && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <svg width="60%" height="60" viewBox="0 0 300 60">
                      <path d="M5 40 C 40 10, 80 60, 120 30 S 200 40, 295 20" fill="none" stroke="#000" strokeWidth="3" style={{ animation: "stroke 2.6s ease-in-out infinite" }} />
                    </svg>
                  </div>
                )}
                <SignaturePad
                  ref={(r) => { sigRef.current = r as any; }}
                  onBegin={() => setShowHint(false)}
                  canvasProps={{
                    style: { width: "100%", height: "100%", position: "absolute", inset: 0, display: "block", touchAction: "none" },
                  }}
                  penColor="#000"
                  backgroundColor="rgba(0,0,0,0)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 h-[50px]">
              <button onClick={() => { handleClear(); setShowHint(true); }} className="bg-white border border-[var(--border-subtle)] rounded-xl px-4 py-2 cursor-pointer">Effacer</button>
              <button onClick={handleSaveSignature} disabled={!uploaded} className="bg-[var(--green-light)] text-[#2d4c46] font-semibold rounded-xl px-4 py-2 disabled:opacity-50 cursor-pointer">Sauvegarder</button>
            </div>
          </div>
        </div>
        
      </div>

      {uploaded && signUrl && (
        <button
          onClick={() => setIsQrOpen(true)}
          className="fixed right-4 bottom-4 w-16 h-16 rounded-full border border-[#ced4da] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.15)] flex items-center justify-center z-50"
          style={{ marginRight: "env(safe-area-inset-right)", marginBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Ouvrir le QR"
        >
          <QRCodeCanvas value={signUrl} size={40} />
        </button>
      )}

      {/* Bouton flottant pour ouvrir le document signé */}
      {signedPdfUrl && (
        <a
          href={signedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-4 bottom-24 rounded-xl border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 shadow z-50"
          style={{ marginRight: "env(safe-area-inset-right)" }}
        >
          Ouvrir le document signé
        </a>
      )}

      {isQrOpen && signUrl && (
        <div onClick={() => setIsQrOpen(false)} className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div onClick={(e) => e.stopPropagation()} className="bg-white p-6 rounded-2xl min-w-80 text-center">
            <h3>Scanner pour signer</h3>
            <div className="flex justify-center mt-4">
              <QRCodeCanvas value={signUrl} size={280} />
            </div>
            <div className="mt-4">
              <button onClick={() => setIsQrOpen(false)} className="border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {isSigModalOpen && (
        <div onClick={() => { setIsSigModalOpen(false); }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div onClick={(e) => e.stopPropagation()} className="bg-white p-6 rounded-2xl max-w-[90vw] w-[560px] text-left">
            <h3 className="text-center">Envoyer le document par email</h3>
            <div className="mt-5">
              <label className="block text-sm text-[#495057] mb-1">Nom du document (obligatoire)</label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Ex: Contrat de prêt signé"
                className="w-full border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 outline-none"
              />
            </div>
            {isAxaSelected && (
              <div className="mt-4">
                <div className="text-sm text-[#495057] mb-1">Signature conseiller (obligatoire)</div>
                <div className="relative border border-[var(--border-subtle)] rounded-xl bg-white h-[140px] overflow-hidden flex items-center justify-center p-3">
                  <div className="relative w-full h-full bg-[#f0f5f8] rounded-xl">
                    <SignaturePad
                      ref={(r) => { advisorSigRef.current = r as any; }}
                      onBegin={() => setAdvisorSigned(true)}
                      canvasProps={{
                        style: { width: "100%", height: "100%", position: "absolute", inset: 0, display: "block", touchAction: "none" },
                      }}
                      penColor="#000"
                      backgroundColor="rgba(0,0,0,0)"
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => { advisorSigRef.current?.clear(); setAdvisorSigned(false); }}
                    className="bg-white border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 cursor-pointer"
                  >
                    Effacer
                  </button>
                </div>
              </div>
            )}
            <div className="mt-4">
              <label className="block text-sm text-[#495057] mb-1">Email conseiller</label>
              <input
                type="email"
                value={advisorEmail}
                onChange={(e) => setAdvisorEmail(e.target.value)}
                placeholder="exemple@exemple.ch"
                className="w-full border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 outline-none"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm text-[#495057] mb-1">Email client</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="exemple@elyx-finance.ch"
                className="w-full border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 outline-none"
              />
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <a
                href={canDownload ? (`/api/document/${uploaded!.id}` + (documentName.trim() ? `?name=${encodeURIComponent(documentName.trim())}` : "")) : undefined}
                className={`rounded-xl px-4 py-2 border border-[var(--border-subtle)] ${!canDownload ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                onClick={async (e) => {
                  if (!canDownload) { e.preventDefault(); return; }
                  if (isAxaSelected && axaSecondDocBase64 && advisorSigned) {
                    e.preventDefault();
                    try {
                      const signedMain = await fetch(`/api/document/${uploaded!.id}`);
                      const mainBytes = new Uint8Array(await signedMain.arrayBuffer());
                      const secondFinal = await buildAxaSecondWithAdvisor(axaSecondDocBase64, advisorSigRef, selectedDocType);

                      // Download both files
                      const download = (data: Uint8Array, name: string) => {
                        const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
                        const blob = new Blob([new Uint8Array(ab)], { type: "application/pdf" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      };
                      download(mainBytes, `${documentName.trim() || "document"}.pdf`);
                      download(secondFinal, `${(documentName.trim() || "document")}-annexe.pdf`);
                    } catch (err) {
                      console.error(err);
                    }
                  }
                }}
                aria-disabled={!canDownload}
                download
              >
                Télécharger
              </a>
              <button
                onClick={handleSendEmails}
                disabled={!canSend}
                className="rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-50 cursor-pointer"
                style={{ background: 'var(--brand-green)' }}
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loader upload */}
      {isUploading && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl px-6 py-4 shadow">Envoi du document...</div>
        </div>
      )}

      {/* Loader apposition de signature */}
      {isApplyingSignature && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl px-6 py-4 shadow">Apposition de la signature...</div>
        </div>
      )}

      {/* Loader récupération de document (deep-link mobile) */}
      {isFetchingDocument && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl px-6 py-4 shadow">Récupération du document...</div>
        </div>
      )}

      {/* Modale succès (mobile) */}
      {isSuccessModalOpen && (
        <div onClick={() => setIsSuccessModalOpen(false)} className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-6 text-center w-[85vw] max-w-[360px]">
            <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="font-semibold">Signature enregistrée</div>
            <div className="mt-1 text-sm text-[#495057]">Votre signature a été apposée avec succès.</div>
            <div className="mt-4">
              <button onClick={() => setIsSuccessModalOpen(false)} className="border border-[var(--border-subtle)] rounded-xl px-4 py-2">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale type de document + option deuxième PDF */}
      {isTypeModalOpen && (
        <div onClick={() => setIsTypeModalOpen(false)} className="fixed inset-0 z-[75] bg-black/50 flex items-center justify-center">
          <div onClick={(e) => e.stopPropagation()} className="bg-white p-6 rounded-2xl max-w-[92vw] w-[560px]">
            <h3 className="text-center">Type de document</h3>
            <div className="mt-5">
              <label className="block text-sm text-[#495057] mb-1">Sélectionner un type</label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 outline-none bg-white"
              >
                <option value="">Choisir…</option>
                <option>Article 45</option>
                <option>Mandat de gestion</option>
                <option>Lettre libération des primes</option>
                <option>Lettre résiliation Lamal / LCA</option>
                <option>Procuration Centrale 2e pilier</option>
                <option>Demande caisses de pension</option>
                <option>Axa 3A - profil de risque ok</option>
                <option>Axa 3A - profil de risque non ok</option>
                <option>Axa 3B - profil de risque ok</option>
                <option>Axa 3B - profil de risque non ok</option>
              </select>
            </div>
            {(selectedDocType.startsWith("Axa")) && (
              <div className="mt-4">
                <label className="block text-sm text-[#495057] mb-1">Ajouter le 2e PDF (AXA)</label>
                <Dropzone onDrop={(files) => setSecondFile(files?.[0] ?? null)} multiple={false} accept={{ "application/pdf": [".pdf"] }}>
                  {({ getRootProps, getInputProps, isDragActive }) => (
                    <div
                      {...getRootProps()}
                      className="bg-[var(--green-light)] rounded-xl h-14 cursor-pointer border border-green-200 border-dashed flex items-center justify-center"
                    >
                      <input {...getInputProps()} />
                      <div className="text-[#2d4c46] text-sm">
                        {secondFile ? secondFile.name : (isDragActive ? "Déposez le 2e PDF ici" : "Drag & drop ou choisir le 2e PDF")}
                      </div>
                    </div>
                  )}
                </Dropzone>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsTypeModalOpen(false)} className="border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5">Annuler</button>
              <button onClick={handleValidateTypeModal} className="rounded-xl px-4 py-2 font-semibold text-white" style={{ background: 'var(--brand-green)' }}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-center">{error}</p>}
    </div>
  );
}
