import { listDocuments } from "../../lib/api";

export default async function PlaybooksPage() {
  const documents = await listDocuments();

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card grid">
        <h1 style={{ margin: 0 }}>Playbooks</h1>
        <p style={{ margin: 0 }}>
          Uploaded playbook documents currently indexed for RAG.
        </p>
      </section>

      <section className="card">
        {documents.length === 0 ? (
          <p>No playbooks uploaded yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #deddd4",
                    paddingBottom: 8,
                  }}
                >
                  Filename
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #deddd4",
                    paddingBottom: 8,
                  }}
                >
                  Created At
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #deddd4",
                    paddingBottom: 8,
                  }}
                >
                  Document ID
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ paddingTop: 10 }}>{doc.filename}</td>
                  <td style={{ paddingTop: 10 }}>
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td style={{ paddingTop: 10, fontFamily: "monospace" }}>
                    {doc.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
