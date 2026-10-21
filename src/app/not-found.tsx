import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="empty empty-page">
      <h1>This reel is missing.</h1>
      <p>
        <Link href="/">Back to the collection</Link>
      </p>
    </section>
  );
}
