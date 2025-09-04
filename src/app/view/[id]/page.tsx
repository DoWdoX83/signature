import { notFound } from "next/navigation";
import path from "path";
import { promises as fs } from "fs";

export default async function ViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  const pdfPath = path.join(uploadsDir, `${id}.pdf`);
  try {
    await fs.access(pdfPath);
  } catch {
    notFound();
  }

  const pdfUrl = `/uploads/${id}.pdf`;
  const signatureUrl = `/uploads/${id}-signature.png`;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>Document {id}</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="hidden sm:block">
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
            title={`Document ${id}`}
            style={{ width: 600, height: 812, border: "1px solid #ddd", borderRadius: 8, display: "block", paddingTop: 12, boxSizing: "border-box", background: "#fff" }}
          />
        </div>
        <div className="block sm:hidden" style={{ width: "100%" }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 12, padding: "10px 14px", border: "1px solid var(--border-subtle)", borderRadius: 12 }}
          >
            Ouvrir le PDF
          </a>
        </div>
        <div>
          <h3>Signature</h3>
          <img src={signatureUrl} alt="Signature" style={{ maxWidth: 400, border: "1px solid #ddd", borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}



