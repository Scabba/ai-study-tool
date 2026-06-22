export default function Home() {
  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>AI Study Tool</h1>

      <p>Paste your notes below:</p>

      <textarea
        style={{ width: "100%", height: "200px", marginTop: "10px" }}
        placeholder="Type or paste text here..."
      />

      <br />

      <button style={{ marginTop: "10px", padding: "10px 20px" }}>
        Generate Questions
      </button>
    </main>
  );
}