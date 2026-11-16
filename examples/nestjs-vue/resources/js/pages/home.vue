<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

defineProps<{ appName: string; message: string }>();
</script>

<template>
  <main style="padding: 40px; font-family: sans-serif">
    <Head title="Home" />

    <h1>{{ appName }}</h1>
    <p>{{ message }}</p>
    <Link href="/users">Go to users</Link>
  </main>
</template>
