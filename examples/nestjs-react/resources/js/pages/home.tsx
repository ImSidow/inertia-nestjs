import { Head, Link } from '@inertiajs/react';

type HomeProps = {
  appName: string;
  message: string;
};

export default function Home({ appName, message }: HomeProps) {
  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <Head title="Home" />

      <h1>{appName}</h1>
      <p>{message}</p>
      <Link href="/users">Go to users</Link>
    </main>
  );
}
