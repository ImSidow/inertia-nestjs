import { Head, Link } from '@inertiajs/react';

type User = {
  id: number;
  name: string;
};

type UsersPageProps = {
  users: User[];
};

export default function UsersIndex({ users }: UsersPageProps) {
  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <Head title="Users" />

      <h1>Users</h1>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.id} - {user.name}
          </li>
        ))}
      </ul>

      <Link href="/">Back home</Link>
    </main>
  );
}
