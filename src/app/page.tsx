"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dropzone from "react-dropzone";
import SignaturePad from "react-signature-canvas";
import { QRCodeCanvas } from "qrcode.react";

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

export default function Home() {
  const [uploaded, setUploaded] = useState<Uploaded>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const sigRef = useRef<SignaturePad | null>(null);
  const sigContainerRef = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [isSigModalOpen, setIsSigModalOpen] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [advisorEmail, setAdvisorEmail] = useState("");
  const [clientEmail, setClientEmail] = useState("");
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

  const [qrUrl, setQrUrl] = useState("");

  const signUrl = useMemo(() => {
    if (!qrUrl) return "";
    try {
      const u = new URL(qrUrl);
      u.searchParams.set("isMobile", "true");
      return u.toString();
    } catch {
      return qrUrl + (qrUrl.includes("?") ? "&" : "?") + "isMobile=true";
    }
  }, [qrUrl]);
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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Veuillez déposer un PDF.");
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      // Local blob for preview (desktop iframe and mobile link)
      try { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); } catch {}
      const objectUrl = URL.createObjectURL(file);
      setPdfPreviewUrl(objectUrl);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload error");
      const json = (await res.json()) as { id: string };
      setUploaded({ id: json.id, url: "" });
      const url = new URL(window.location.href);
      url.searchParams.set("docId", json.id);
      const href = url.toString();
      window.history.replaceState(null, "", href);
      setQrUrl(href);
    } catch (e) {
      setError("Échec de l'upload");
    } finally {
      setIsUploading(false);
    }
  }, [pdfPreviewUrl]);

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
        body: JSON.stringify({ id: uploaded.id, signatureDataUrl: dataUrl }),
      });
      if (!res.ok) throw new Error("Sign error");
      setSignedPdfUrl(null);
      if (!isMobileQuery) {
        setIsSigModalOpen(true);
      }
    } catch (e) {
      setError("Échec de l'enregistrement de la signature");
    }
  }, [uploaded, isMobileQuery]);

  const canSend = advisorEmail.trim().length > 0 && clientEmail.trim().length > 0;
  const handleSendEmails = useCallback(async () => {
    if (!canSend) return;
    try {
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisor: advisorEmail.trim(), client: clientEmail.trim(), url: qrUrl, docId: uploaded?.id }),
      });
      setIsSigModalOpen(false);
    } catch {}
  }, [advisorEmail, clientEmail, canSend, qrUrl, uploaded?.id]);

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
                    <iframe src={pdfSrc} className="w-full h-[420px] border-0" />
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
            <div ref={sigContainerRef} className="relative border border-[var(--border-subtle)] rounded-xl bg-white h-[150px] sm:h-[420px] overflow-hidden">
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
                backgroundColor="#fff"
              />
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
                href={uploaded?.id ? `/api/document/${uploaded.id}` : "#"}
                className="rounded-xl px-4 py-2 border border-[var(--border-subtle)] cursor-pointer"
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

      {error && <p className="text-red-600 text-center">{error}</p>}
    </div>
  );
}
