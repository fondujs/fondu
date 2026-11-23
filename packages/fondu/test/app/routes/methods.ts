import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.text('get'))
export const POST = defineHandler((c) => c.text('post'))
export const PUT = defineHandler((c) => c.text('put'))
