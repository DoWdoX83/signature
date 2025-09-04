"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "react-signature-canvas";

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

export default function SignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;
  const sigRef = useRef<SignaturePad | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Force react-signature-canvas to recompute size via its window resize listener
      window.dispatchEvent(new Event("resize"));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleClear = useCallback(() => {
    sigRef.current?.clear();
  }, []);

  const handleSave = useCallback(async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Veuillez signer avant d'enregistrer.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
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
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, signatureDataUrl: dataUrl }),
      });
      if (!res.ok) throw new Error("Erreur");
      const json = await res.json();
      router.push(`/view/${id}`);
    } catch (e) {
      setError("Échec de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  }, [id, router]);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, height: "100vh", overflow: "hidden" }}>
      <h1>Signer le document</h1>
      <p>ID: {id}</p>
      <div
        ref={containerRef}
        style={{ border: "1px solid #ccc", borderRadius: 8, flex: 1, width: "100%", minHeight: 200, position: "relative", overflow: "hidden" }}
      >
        <SignaturePad
          ref={(r) => { sigRef.current = r as any; }}
          canvasProps={{
            style: { width: "100%", height: "100%", position: "absolute", inset: 0, display: "block", touchAction: "none" },
          }}
          penColor="#000"
          backgroundColor="#fff"
        />
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
        <button onClick={handleClear} className="cursor-pointer">Effacer</button>
        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}


