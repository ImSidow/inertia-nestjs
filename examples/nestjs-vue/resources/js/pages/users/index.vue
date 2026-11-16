<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

defineProps<{ users: { id: number; name: string }[] }>();
</script>

<template>
  <main style="padding: 40px; font-family: sans-serif">
    <Head title="Users" />

    <h1>Users</h1>
    <ul>
      <li v-for="user in users" :key="user.id">{{ user.id }} - {{ user.name }}</li>
    </ul>

    <Link href="/">Back home</Link>
  </main>
</template>
