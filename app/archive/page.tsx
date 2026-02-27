import Link from "next/link";

export default function ArchivePageFallback() {
  return (
    <main style={{ padding: 24 }}>
      <p>
        Archive is available from the main screen panel. Open <Link href="/">home</Link>.
      </p>
    </main>
  );
}
